import { Network } from './Network';
import { Renderer } from './Renderer';
import { sfx } from './SoundSystem';
import { GameState, PlayerState, TownState, TownBonus, BuildQueueItem } from './types';

// Renderer is @ts-nocheck, declare shape for type safety here
interface RendererLike {
  camera: { x: number; y: number };
  resize: () => void;
  render: (state: any, localPlayerID: string | null, mouseWorldX: number, mouseWorldY: number, dt: number, moveTarget: any) => void;
}

const SERVER_TICK_MS = 50;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// Town numeric helpers
function townCalcBaseCap(hallLevel: number) {
  const L = Math.max(1, Math.min(10, hallLevel || 1));
  return 1000 * (1 + 0.3 * (L - 1));
}

function townCalcResCap(hallLevel: number, warehouseLevel: number) {
  const base = townCalcBaseCap(hallLevel);
  const Lw = Math.max(0, Math.min(10, warehouseLevel || 0));
  return base * (1 + 0.5 * Lw);
}

function townCalcYield(building: string, level: number) {
  const L = Math.max(1, Math.min(10, level || 1));
  switch (building) {
    case 'lumber': return 5 * (1 + 0.15 * (L - 1));
    case 'quarry': return 4 * (1 + 0.15 * (L - 1));
    case 'mine': return 3 * (1 + 0.20 * (L - 1));
    default: return 0;
  }
}

const TOWN_UPGRADE_BASE_COST: Record<string, Record<string, number>> = {
  hall: { wood: 40, stone: 60, ore: 40, gold: 80 },
  warehouse: { wood: 30, stone: 50, ore: 10, gold: 40 },
  lumber: { wood: 5, stone: 20, ore: 5, gold: 15 },
  quarry: { wood: 20, stone: 5, ore: 5, gold: 15 },
  mine: { wood: 15, stone: 15, ore: 5, gold: 20 },
};

const BUILD_QUEUE_MAX_SLOTS = 3;
const UPGRADE_BASE_TIME_SEC = 60;

/** 升级到 L+1 所需时间（秒）：BaseTime × (1+L)^1.2 */
function upgradeDurationSec(L: number): number {
  return Math.max(1, Math.round(UPGRADE_BASE_TIME_SEC * Math.pow(1 + L, 1.2)));
}

export type GameMode = 'town' | 'start' | 'run';

export interface GameCallbacks {
  onModeChange: (mode: GameMode) => void;
  onHUDUpdate: (player: PlayerState, wave: number) => void;
  onWaveAnnounce: (wave: number) => void;
  onPickup: (name: string, rarity: number, slot: string) => void;
  onInventoryUpdate: (player: PlayerState) => void;
  onTownUpdate: (town: TownState, caps: { wood: number; stone: number; ore: number }) => void;
}

export class GameEngine {
  network: Network;
  renderer: RendererLike | null = null;
  canvas: HTMLCanvasElement | null = null;

  mode: GameMode = 'town';
  localPlayerID: string | null = null;
  mapWidth = 2000;
  mapHeight = 1500;
  gameStarted = false;

  // Input
  keys: Record<string, boolean> = {};
  mouseX = 0;
  mouseY = 0;
  mouseWorldX = 0;
  mouseWorldY = 0;
  moveTargetIndicator: { x: number; y: number; life: number } | null = null;

  // Interpolation
  private prevSnapshot: GameState | null = null;
  private currSnapshot: GameState | null = null;
  private snapshotTime = 0;

  // Game loop
  private lastTime = 0;
  private sendTickCounter = 0;
  private lastSentKeys: any = null;
  private loopStarted = false;
  private autoAttackAccum = 0;
  private lastWave = 0;
  private lastHP: number | null = null;
  private lastLevel: number | null = null;

  // Town
  townState: TownState | null = null;
  townBonus: TownBonus = { atkMult: 1, hpMult: 1, defMult: 1 };
  private townResAccum = 0;

  // Cached player data
  cachedPlayerData: PlayerState | null = null;

  // UI state
  inventoryOpen = false;
  statsPanelOpen = false;
  escMenuOpen = false;

  callbacks: GameCallbacks;

  constructor(callbacks: GameCallbacks) {
    this.callbacks = callbacks;
    this.network = new Network();
    this.setupNetworkHandlers();
  }

  initCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas) as unknown as RendererLike;
    this.renderer.resize();
  }

  private setupNetworkHandlers() {
    this.network.onJoined = (msg) => {
      this.localPlayerID = msg.player_id;
      this.mapWidth = msg.map_width;
      this.mapHeight = msg.map_height;
      this.gameStarted = true;
      this.mode = 'run';
      this.callbacks.onModeChange('run');
    };

    this.network.onState = (msg) => {
      this.prevSnapshot = this.currSnapshot;
      this.currSnapshot = msg as GameState;
      this.snapshotTime = performance.now();

      if (this.canvas) {
        this.mouseWorldX = this.mouseX - this.canvas.width / 2 + (this.renderer?.camera?.x || 0);
        this.mouseWorldY = this.mouseY - this.canvas.height / 2 + (this.renderer?.camera?.y || 0);
      }

      const localPlayer = msg.players?.find((p: PlayerState) => p.id === this.localPlayerID);
      if (localPlayer) {
        this.cachedPlayerData = localPlayer;

        // Sound feedback
        if (this.lastHP !== null && localPlayer.hp < this.lastHP) sfx.playerHurt();
        if (this.lastLevel !== null && localPlayer.level > this.lastLevel) sfx.levelUp();
        this.lastHP = localPlayer.hp;
        this.lastLevel = localPlayer.level;

        this.callbacks.onHUDUpdate(localPlayer, this.lastWave);
        if (this.inventoryOpen) {
          this.callbacks.onInventoryUpdate(localPlayer);
        }
      }

      if (msg.wave && msg.wave !== this.lastWave) {
        this.lastWave = msg.wave;
        this.callbacks.onWaveAnnounce(msg.wave);
        if (msg.wave % 5 === 0) sfx.bossWave();
        else sfx.waveStart();
      }
    };

    this.network.onPickup = (msg) => {
      this.callbacks.onPickup(msg.name, msg.rarity, msg.slot);
      sfx.pickupRare(msg.rarity);
    };
  }

  // ==================== TOWN ====================

  initTownState() {
    try {
      const saved = sessionStorage.getItem('sevens_town_state');
      if (saved) {
        this.townState = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to read town state:', e);
    }
    if (!this.townState) {
      this.townState = {
        resources: { wood: 0, stone: 0, ore: 0, gold: 0 },
        buildings: { hall: 1, warehouse: 0, lumber: 1, quarry: 1, mine: 1 },
        caps: { equipSlots: 20, materialSlots: 100 },
        buildQueue: [null, null, null],
      };
    }
    if (!this.townState.buildQueue || !Array.isArray(this.townState.buildQueue)) {
      this.townState.buildQueue = [null, null, null];
    }
    while (this.townState.buildQueue.length < BUILD_QUEUE_MAX_SLOTS) {
      this.townState.buildQueue.push(null);
    }
    this.townState.buildQueue = this.townState.buildQueue.slice(0, BUILD_QUEUE_MAX_SLOTS);
    this.persistTownState();
  }

  persistTownState() {
    if (!this.townState) return;
    try {
      sessionStorage.setItem('sevens_town_state', JSON.stringify(this.townState));
    } catch (e) {}
  }

  getResourceCaps() {
    if (!this.townState) return { wood: 0, stone: 0, ore: 0 };
    const b = this.townState.buildings;
    const cap = Math.round(townCalcResCap(b.hall, b.warehouse));
    return { wood: cap, stone: cap, ore: cap };
  }

  /** 根据市政厅等级返回已解锁的建造队列槽位数（1/2/3） */
  getBuildQueueSlotsUnlocked(): number {
    if (!this.townState) return 1;
    const hall = this.townState.buildings.hall ?? 1;
    if (hall >= 6) return 3;
    if (hall >= 3) return 2;
    return 1;
  }

  /** 检查某建筑是否已在队列中 */
  isBuildingInQueue(type: string): boolean {
    if (!this.townState?.buildQueue) return false;
    return this.townState.buildQueue.some((s) => s !== null && s.buildingType === type);
  }

  /** 是否有空位可加入新升级任务 */
  hasEmptyBuildQueueSlot(): boolean {
    const unlocked = this.getBuildQueueSlotsUnlocked();
    const q = this.townState?.buildQueue ?? [];
    for (let i = 0; i < unlocked && i < q.length; i++) {
      if (q[i] === null) return true;
    }
    return false;
  }

  upgradeBuilding(type: string) {
    if (!this.townState) return;
    const b = this.townState.buildings;
    const current = b[type] ?? 0;
    if (current >= 10) return;
    if (type !== 'hall' && current >= b.hall) return;
    if (this.isBuildingInQueue(type)) return;
    if (!this.hasEmptyBuildQueueSlot()) return;

    const base = TOWN_UPGRADE_BASE_COST[type];
    if (!base) return;
    const L = Math.max(0, Math.min(9, current));
    const mult = (1 + L) * (1 + L);
    const cost = {
      wood: Math.round(base.wood * mult),
      stone: Math.round(base.stone * mult),
      ore: Math.round(base.ore * mult),
      gold: Math.round(base.gold * mult),
    };

    const r = this.townState.resources;
    if (r.wood < cost.wood || r.stone < cost.stone || r.ore < cost.ore || r.gold < cost.gold) return;

    r.wood -= cost.wood;
    r.stone -= cost.stone;
    r.ore -= cost.ore;
    r.gold -= cost.gold;

    const durationSec = upgradeDurationSec(L);
    const completesAt = Math.floor(Date.now() / 1000) + durationSec;
    const item: BuildQueueItem = { buildingType: type, fromLevel: current, completesAt };
    const q = this.townState.buildQueue;
    for (let i = 0; i < this.getBuildQueueSlotsUnlocked() && i < q.length; i++) {
      if (q[i] === null) {
        q[i] = item;
        break;
      }
    }
    this.persistTownState();
    this.callbacks.onTownUpdate(this.townState, this.getResourceCaps());
  }

  /** 每帧检查建造队列，到期的升级立即完成（任意模式均推进时间） */
  private processBuildQueue() {
    if (!this.townState?.buildQueue) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const b = this.townState.buildings;
    const q = this.townState.buildQueue;
    let changed = false;
    for (let i = 0; i < q.length; i++) {
      const item = q[i];
      if (item && item.completesAt <= nowSec) {
        const prev = b[item.buildingType] ?? 0;
        if (prev === item.fromLevel) {
          b[item.buildingType] = item.fromLevel + 1;
          q[i] = null;
          changed = true;
        }
      }
    }
    if (changed) {
      this.persistTownState();
      this.computeTownBonus();
      this.callbacks.onTownUpdate(this.townState, this.getResourceCaps());
    }
  }

  computeTownBonus() {
    if (!this.townState) {
      this.townBonus = { atkMult: 1, hpMult: 1, defMult: 1 };
      return;
    }
    const b = this.townState.buildings;
    this.townBonus = {
      atkMult: 1 + 0.02 * (b.blacksmith || 0),
      hpMult: 1 + 0.01 * ((b.hall || 1) - 1) + 0.005 * (b.warehouse || 0),
      defMult: 1 + 0.01 * ((b.warehouse || 0) + (b.hall || 1) - 1),
    };
  }

  private applyResourceTicks(ticks: number) {
    if (!this.townState || ticks <= 0) return;
    const b = this.townState.buildings;
    const caps = this.getResourceCaps();
    const r = this.townState.resources;
    r.wood = Math.min(caps.wood, r.wood + townCalcYield('lumber', b.lumber) * ticks);
    r.stone = Math.min(caps.stone, r.stone + townCalcYield('quarry', b.quarry) * ticks);
    r.ore = Math.min(caps.ore, r.ore + townCalcYield('mine', b.mine) * ticks);
    this.persistTownState();
    this.callbacks.onTownUpdate(this.townState, caps);
  }

  // ==================== ACTIONS ====================

  selectHero(hero: string) {
    this.mode = 'run';
    this.computeTownBonus();
    sfx.init();
    sfx.resume();
    this.network.connect();

    const tryJoin = () => {
      if (this.network.connected) {
        this.network.sendJoin(hero, '勇士' + Math.floor(Math.random() * 999));
      } else {
        setTimeout(tryJoin, 100);
      }
    };
    tryJoin();
  }

  startAdventure() {
    this.mode = 'start';
    this.callbacks.onModeChange('start');
  }

  backToTown() {
    this.mode = 'town';
    this.gameStarted = false;
    this.callbacks.onModeChange('town');
  }

  handleKeyDown(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    this.keys[key] = true;

    if (key === 'i') { this.statsPanelOpen = !this.statsPanelOpen; e.preventDefault(); return; }
    if (key === 'b') { this.inventoryOpen = !this.inventoryOpen; e.preventDefault(); return; }
    if (key === 'f' && this.gameStarted && !e.repeat) {
      this.network.send({ type: 'pickup' });
      e.preventDefault();
      return;
    }
    if (key === 'escape') {
      if (this.statsPanelOpen) { this.statsPanelOpen = false; e.preventDefault(); return; }
      if (this.inventoryOpen) { this.inventoryOpen = false; e.preventDefault(); return; }
      if (this.gameStarted) { this.escMenuOpen = !this.escMenuOpen; e.preventDefault(); return; }
    }
    if (this.gameStarted && this.localPlayerID) {
      if (['q', 'w', 'e', 'r'].includes(key)) {
        this.network.sendCast(key, this.mouseWorldX, this.mouseWorldY);
        sfx.resume();
        if (key === 'q') sfx.slash();
        else if (key === 'w') sfx.shieldBash();
        else if (key === 'e') sfx.warCry();
        else if (key === 'r') sfx.ultimate();
      }
    }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'q', 'e', 'r'].includes(key)) {
      e.preventDefault();
    }
  }

  handleKeyUp(e: KeyboardEvent) {
    this.keys[e.key.toLowerCase()] = false;
  }

  handleMouseMove(e: MouseEvent) {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    if (this.canvas && this.renderer) {
      this.mouseWorldX = this.mouseX - this.canvas.width / 2 + this.renderer.camera.x;
      this.mouseWorldY = this.mouseY - this.canvas.height / 2 + this.renderer.camera.y;
    }
  }

  handleMouseDown(e: MouseEvent) {
    if (!this.gameStarted || !this.localPlayerID) return;
    if ((e.target as HTMLElement).closest?.('#inventory-panel, #stats-panel, #item-detail, #start-screen, .ui-panel')) return;
    if (e.button === 0) {
      this.network.send({ type: 'move', target_x: this.mouseWorldX, target_y: this.mouseWorldY });
      this.moveTargetIndicator = { x: this.mouseWorldX, y: this.mouseWorldY, life: 0.6 };
    }
  }

  // ==================== GAME LOOP ====================

  private buildRenderState(now: number): GameState | null {
    if (!this.currSnapshot) return null;
    if (!this.prevSnapshot) return this.currSnapshot;

    const elapsed = now - this.snapshotTime;
    const t = Math.min(1, Math.max(0, elapsed / SERVER_TICK_MS));

    const state: any = {
      type: 'state',
      tick: this.currSnapshot.tick,
      wave: this.currSnapshot.wave,
      map_width: this.mapWidth,
      map_height: this.mapHeight,
      effects: this.currSnapshot.effects,
      drops: this.currSnapshot.drops,
      damage_nums: t < 0.1 ? this.currSnapshot.damage_nums : [],
    };

    state.players = (this.currSnapshot.players || []).map((cp: PlayerState) => {
      const pp = (this.prevSnapshot!.players || []).find((p: PlayerState) => p.id === cp.id);
      if (!pp) return cp;
      return {
        ...cp,
        x: lerp(pp.x, cp.x, t),
        y: lerp(pp.y, cp.y, t),
        angle: lerpAngle(pp.angle || 0, cp.angle || 0, t),
      };
    });

    state.enemies = (this.currSnapshot.enemies || []).map((ce: any) => {
      const pe = (this.prevSnapshot!.enemies || []).find((e: any) => e.id === ce.id);
      if (!pe) return ce;
      return { ...ce, x: lerp(pe.x, ce.x, t), y: lerp(pe.y, ce.y, t) };
    });

    return state;
  }

  startLoop() {
    if (this.loopStarted) return;
    this.loopStarted = true;
    this.lastTime = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;

      // Town: 资源产出（仅城镇界面时推进）与建造队列完成（任意模式均推进，支持离线完成）
      if (this.townState) {
        this.processBuildQueue();
        if (this.mode === 'town') {
          this.townResAccum += dt;
          if (this.townResAccum >= 10) {
            const ticks = Math.floor(this.townResAccum / 10);
            this.townResAccum -= ticks * 10;
            this.applyResourceTicks(ticks);
          }
        }
      }

      if (this.gameStarted) {
        this.sendTickCounter++;
        const curKeys = {
          w: !!this.keys['arrowup'], a: !!this.keys['arrowleft'],
          s: !!this.keys['arrowdown'], d: !!this.keys['arrowright'],
        };
        const keysChanged = !this.lastSentKeys ||
          curKeys.w !== this.lastSentKeys.w || curKeys.a !== this.lastSentKeys.a ||
          curKeys.s !== this.lastSentKeys.s || curKeys.d !== this.lastSentKeys.d;

        if (keysChanged || this.sendTickCounter >= 6) {
          this.network.sendInput(curKeys);
          this.lastSentKeys = curKeys;
          this.sendTickCounter = 0;
        }
        if (this.sendTickCounter === 3) {
          this.network.send({ type: 'mouse', target_x: this.mouseWorldX, target_y: this.mouseWorldY });
        }

        this.autoAttackAccum += dt;
        while (this.autoAttackAccum >= 2.0) {
          this.autoAttackAccum -= 2.0;
          if (this.localPlayerID) {
            this.network.sendCast('auto', this.mouseWorldX, this.mouseWorldY);
            sfx.resume();
            sfx.slash();
          }
        }
      }

      if (this.moveTargetIndicator) {
        this.moveTargetIndicator.life -= dt;
        if (this.moveTargetIndicator.life <= 0) this.moveTargetIndicator = null;
      }

      const renderState = this.buildRenderState(now);
      this.renderer?.render(renderState, this.localPlayerID, this.mouseWorldX, this.mouseWorldY, dt, this.moveTargetIndicator);

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
