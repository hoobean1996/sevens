import { Network } from './Network';
import { Renderer } from './Renderer';
import { TownPixiRenderer } from './TownPixiRenderer';
import { TownController } from './TownController';
import { sfx } from './SoundSystem';
import { BuildingInstance, GameState, PlayerState, TownInteractionMode, TownState, TownBonus, ShopState } from './types';

// Renderer is @ts-nocheck, declare shape for type safety here
interface RendererLike {
  camera: { x: number; y: number };
  resize: () => void;
  render: (state: any, localPlayerID: string | null, mouseWorldX: number, mouseWorldY: number, dt: number, moveTarget: any, townScene?: any) => void;
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

export type GameMode = 'town' | 'start' | 'run';

export interface GameCallbacks {
  onModeChange: (mode: GameMode) => void;
  onHUDUpdate: (player: PlayerState, wave: number, arenaMode?: boolean, shopPhase?: boolean, shopTimer?: number) => void;
  onWaveAnnounce: (wave: number) => void;
  onPickup: (name: string, rarity: number, slot: string) => void;
  onInventoryUpdate: (player: PlayerState) => void;
  onTownUpdate: (town: TownState, caps: { wood: number; stone: number; ore: number }) => void;
  onTownSelectionChange?: (buildingKey: string | null) => void;
  onShopOpen?: (shop: ShopState) => void;
  onShopResult?: (success: boolean, message: string) => void;
}

export class GameEngine {
  network: Network;
  // Main (adventure) renderer/canvas (Canvas2D)
  renderer: RendererLike | null = null;
  mainCanvas: HTMLCanvasElement | null = null;

  // Town renderer/canvas (PixiJS)
  townRenderer: TownPixiRenderer | null = null;
  townCanvas: HTMLCanvasElement | null = null;

  // Active canvas for input mapping
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
  private townController: TownController;

  // Cached player data
  cachedPlayerData: PlayerState | null = null;

  // Arena mode state
  arenaMode = false;
  shopPhase = false;
  shopTimer = 0;
  shops: ShopState[] = [];
  nearestShop: ShopState | null = null;

  // UI state
  inventoryOpen = false;
  statsPanelOpen = false;
  escMenuOpen = false;
  shopPanelOpen = false;

  callbacks: GameCallbacks;

  constructor(callbacks: GameCallbacks) {
    this.callbacks = callbacks;
    this.network = new Network();
    this.townController = new TownController(
      (town, caps) => {
        this.townState = town;
        this.townBonus = this.townController.getTownBonus();
        this.callbacks.onTownUpdate(town, caps);
      },
      (entityId) => this.callbacks.onTownSelectionChange?.(entityId),
    );
    this.setupNetworkHandlers();
  }

  initCanvas(canvas: HTMLCanvasElement) {
    this.mainCanvas = canvas;
    if (this.mode !== 'town') this.canvas = canvas;
    this.renderer = new Renderer(canvas) as unknown as RendererLike;
    this.renderer.resize();
  }

  /** 鍩庨晣鐢诲竷浣跨敤 PixiJS v8锛岄渶 await 瀹屾垚鍚庡啀 resize/render */
  async initTownCanvas(canvas: HTMLCanvasElement): Promise<void> {
    if (this.townCanvas !== canvas) {
      this.townRenderer?.destroy();
      this.townCanvas = canvas;
      this.townRenderer = new TownPixiRenderer(canvas);
      await this.townRenderer.init();
      const snapshot = this.townController.getSnapshot();
      if (snapshot) this.townRenderer.setTownData(snapshot);
      this.townRenderer.updateCamera(this.townController.getCameraState());
    }
    if (this.mode === 'town') this.canvas = canvas;
  }

  /** Sync townZoom from renderer after resize */
  syncTownZoom() {
    if (!this.townRenderer) return;
    this.townController.syncZoom(this.townRenderer.getZoom());
    const camera = this.townRenderer.getCamera();
    this.townController.setCamera(camera.x, camera.y);
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

      // Arena mode state
      this.arenaMode = msg.arena_mode || false;
      this.shopPhase = msg.shop_phase || false;
      this.shopTimer = msg.shop_timer || 0;
      this.shops = msg.shops || [];

      // Mouse world coords are only meaningful in run mode (Canvas2D)
      if (this.mode !== 'town' && this.mainCanvas) {
        this.mouseWorldX = this.mouseX - this.mainCanvas.width / 2 + (this.renderer?.camera?.x || 0);
        this.mouseWorldY = this.mouseY - this.mainCanvas.height / 2 + (this.renderer?.camera?.y || 0);
      }

      const localPlayer = msg.players?.find((p: PlayerState) => p.id === this.localPlayerID);
      if (localPlayer) {
        this.cachedPlayerData = localPlayer;

        // Compute nearest shop
        this.nearestShop = null;
        if (this.arenaMode && this.shopPhase && this.shops.length > 0) {
          let minDist = 80;
          for (const shop of this.shops) {
            const dx = localPlayer.x - shop.x;
            const dy = localPlayer.y - shop.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < minDist) {
              minDist = dist;
              this.nearestShop = shop;
            }
          }
        }

        // Sound feedback
        if (this.lastHP !== null && localPlayer.hp < this.lastHP) sfx.playerHurt();
        if (this.lastLevel !== null && localPlayer.level > this.lastLevel) sfx.levelUp();
        this.lastHP = localPlayer.hp;
        this.lastLevel = localPlayer.level;

        this.callbacks.onHUDUpdate(localPlayer, this.lastWave, this.arenaMode, this.shopPhase, this.shopTimer);
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

    this.network.onShopResult = (msg) => {
      this.callbacks.onShopResult?.(msg.success, msg.message);
    };

    this.network.onPickup = (msg) => {
      this.callbacks.onPickup(msg.name, msg.rarity, msg.slot);
      sfx.pickupRare(msg.rarity);
    };
  }

  // ==================== TOWN ====================
  // ==================== TOWN ====================

  initTownState() {
    this.townController.initState();
    this.townController.setInteractionMode('preview');
    this.townState = this.townController.getState();
    this.townBonus = this.townController.getTownBonus();
  }

  getSelectedTownBuilding(entityId: string | null): BuildingInstance | null {
    const selectedId = entityId ?? this.townController.getSelectedEntityId();
    if (!selectedId) return null;
    return this.townController.getState()?.buildingInstances.find((instance) => instance.id === selectedId) ?? null;
  }

  getSelectedTownBuildingId(): string | null {
    return this.townController.getSelectedEntityId();
  }

  getTownInteractionMode(): TownInteractionMode {
    return this.townController.getInteractionMode();
  }

  setTownInteractionMode(mode: TownInteractionMode) {
    this.townController.setInteractionMode(mode);
  }

  beginTownEdit() {
    this.townController.beginTownEdit();
  }

  commitTownEdit() {
    this.townController.commitTownEdit();
    this.townState = this.townController.getState();
    this.townBonus = this.townController.getTownBonus();
  }

  cancelTownEdit() {
    this.townController.cancelTownEdit();
    this.townState = this.townController.getState();
    this.townBonus = this.townController.getTownBonus();
  }

  clearTownSelection() {
    this.townController.clearSelection();
  }

  getResourceCaps() {
    return this.townController.getResourceCaps();
  }

  getUpgradeCost(buildingId: string): { wood: number; stone: number; ore: number; gold: number } {
    return this.townController.getUpgradeCost(buildingId);
  }

  isBuildingInQueue(buildingId: string): boolean {
    return this.townController.isBuildingInQueue(buildingId);
  }

  hasEmptyBuildQueueSlot(): boolean {
    return this.townController.hasEmptyBuildQueueSlot();
  }

  upgradeBuilding(buildingId: string) {
    this.townController.upgradeBuilding(buildingId);
    this.townState = this.townController.getState();
    this.townBonus = this.townController.getTownBonus();
  }

  computeTownBonus() {
    this.townBonus = this.townController.getTownBonus();
  }

  selectHero(hero: string) {
    this.mode = 'run';
    this.computeTownBonus();
    sfx.init();
    sfx.resume();
    this.network.connect();

    const tryJoin = () => {
      if (this.network.connected) {
        this.network.sendJoin(hero, '鍕囧＋' + Math.floor(Math.random() * 999));
      } else {
        setTimeout(tryJoin, 100);
      }
    };
    tryJoin();
  }

  startAdventure() {
    // Skip character selection, go directly to game with warrior
    this.selectHero('warrior');
  }

  backToTown() {
    if (this.townController.isTownEditing()) {
      this.townController.cancelTownEdit();
    }
    this.townController.setInteractionMode('preview');
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
      if (this.shopPanelOpen) { this.shopPanelOpen = false; e.preventDefault(); return; }
      if (this.statsPanelOpen) { this.statsPanelOpen = false; e.preventDefault(); return; }
      if (this.inventoryOpen) { this.inventoryOpen = false; e.preventDefault(); return; }
      if (this.gameStarted) { this.escMenuOpen = !this.escMenuOpen; e.preventDefault(); return; }
    }
    if (this.gameStarted && this.localPlayerID) {
      // Arena mode: 1-4 opens shops anytime, no manual skills
      if (this.arenaMode) {
        // 1-4 keys open shops anytime
        if (['1', '2', '3', '4'].includes(key) && !this.shopPanelOpen) {
          const shopTypes = ['weapon', 'armor', 'potion', 'upgrade'];
          const idx = parseInt(key) - 1;
          const shop = this.shops.find(s => s.type === shopTypes[idx]);
          if (shop) {
            this.shopPanelOpen = true;
            this.callbacks.onShopOpen?.(shop);
          }
          e.preventDefault();
          return;
        }
        // No manual skill casting in arena mode - backend handles auto-combat
        return;
      }

      // Classic mode: manual skill casting
      if (key === 'e') {
        this.network.sendCast(key, this.mouseWorldX, this.mouseWorldY);
        sfx.resume();
        sfx.warCry();
        return;
      }
      if (['q', 'w', 'r'].includes(key)) {
        this.network.sendCast(key, this.mouseWorldX, this.mouseWorldY);
        sfx.resume();
        if (key === 'q') sfx.slash();
        else if (key === 'w') sfx.shieldBash();
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

  handleWheel(e: WheelEvent) {
    if (this.mode !== 'town' || !this.canvas || !this.townRenderer) return;
    e.preventDefault();
    this.townController.handleWheel(this.canvas, e.clientX, e.clientY, e.deltaY);
    this.townRenderer.updateCamera(this.townController.getCameraState());
  }

  handleMouseMove(e: MouseEvent) {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    if (this.mode === 'town') {
      if (this.canvas) this.townController.handleMouseMove(this.canvas, e.clientX, e.clientY);
      this.townRenderer?.updateCamera(this.townController.getCameraState());
    } else if (this.mainCanvas && this.renderer) {
      this.mouseWorldX = this.mouseX - this.mainCanvas.width / 2 + this.renderer.camera.x;
      this.mouseWorldY = this.mouseY - this.mainCanvas.height / 2 + this.renderer.camera.y;
    }
  }

  handleMouseDown(e: MouseEvent) {
    if ((e.target as HTMLElement).closest?.('#inventory-panel, #stats-panel, #item-detail, #start-screen, .ui-panel')) return;
    if (e.button === 0 && this.mode === 'town') {
      if (this.canvas) this.townController.handleMouseDown(this.canvas, e.clientX, e.clientY, e.shiftKey);
      return;
    }
    if (!this.gameStarted || !this.localPlayerID) return;
    if (e.button === 0) {
      this.network.send({ type: 'move', target_x: this.mouseWorldX, target_y: this.mouseWorldY });
      this.moveTargetIndicator = { x: this.mouseWorldX, y: this.mouseWorldY, life: 0.6 };
    }
  }

  handleMouseUp(e: MouseEvent) {
    if (e.button === 0 && this.mode === 'town' && this.canvas) {
      this.townController.handleMouseUp(this.canvas, e.clientX, e.clientY);
      return;
    }
  }

  // ==================== GAME LOOP ====================
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
      // Arena mode fields
      arena_mode: this.arenaMode,
      shop_phase: this.shopPhase,
      shop_timer: this.shopTimer,
      shops: this.shops,
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

      if (this.townState) {
        this.townController.process(dt, this.mode === 'town');
        this.townState = this.townController.getState();
        this.townBonus = this.townController.getTownBonus();
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

        // Auto-attack only in classic mode (arena mode handles it server-side)
        if (!this.arenaMode) {
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
      }

      if (this.moveTargetIndicator) {
        this.moveTargetIndicator.life -= dt;
        if (this.moveTargetIndicator.life <= 0) this.moveTargetIndicator = null;
      }

      if (this.mode === 'town' && this.townState) {
        const snapshot = this.townController.getSnapshot();
        if (snapshot && this.townRenderer && this.townCanvas) {
          this.canvas = this.townCanvas;
          this.townRenderer.updateCamera(this.townController.getCameraState());
          this.townRenderer.render(snapshot);
        } else if (snapshot) {
          this.renderer?.render(null, this.localPlayerID, this.mouseWorldX, this.mouseWorldY, dt, this.moveTargetIndicator, snapshot);
        }
      } else {
        const renderState = this.buildRenderState(now);
        if (this.mainCanvas) this.canvas = this.mainCanvas;
        this.renderer?.render(renderState, this.localPlayerID, this.mouseWorldX, this.mouseWorldY, dt, this.moveTargetIndicator);
      }

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
