import { BUILDING_GRID_SIZE, TOWN_GRID_H, TOWN_GRID_W, gridToScreen, pointInDiamond, screenToGrid } from './townConfig';
import { BUILDING_DEFS, DEFAULT_BUILDING_ORDER, createBuildingInstance, createDefaultTownMap, getBuildingDef } from './townDefinitions';
import { BuildingInstance, BuildQueueItem, BuildingPosition, TownBonus, TownInteractionMode, TownState } from './types';

const STORAGE_KEY = 'sevens_town_state';
const BUILD_QUEUE_MAX_SLOTS = 3;
const UPGRADE_BASE_TIME_SEC = 60;

function cloneTownState(state: TownState): TownState {
  if (typeof structuredClone === 'function') return structuredClone(state);
  return JSON.parse(JSON.stringify(state)) as TownState;
}

function townCalcBaseCap(hallLevel: number) {
  const level = Math.max(1, Math.min(10, hallLevel || 1));
  return 1000 * (1 + 0.3 * (level - 1));
}

function townCalcResCap(hallLevel: number, warehouseLevel: number) {
  const base = townCalcBaseCap(hallLevel);
  const warehouse = Math.max(0, Math.min(10, warehouseLevel || 0));
  return base * (1 + 0.5 * warehouse);
}

function townCalcYield(buildingType: string, level: number) {
  const normalized = Math.max(1, Math.min(10, level || 1));
  switch (buildingType) {
    case 'lumber':
      return 5 * (1 + 0.15 * (normalized - 1));
    case 'quarry':
      return 4 * (1 + 0.15 * (normalized - 1));
    case 'mine':
      return 3 * (1 + 0.2 * (normalized - 1));
    default:
      return 0;
  }
}

const TOWN_UPGRADE_BASE_COST: Record<string, Record<string, number>> = {
  hall: { wood: 40, stone: 60, ore: 40, gold: 80 },
  warehouse: { wood: 30, stone: 50, ore: 10, gold: 40 },
  lumber: { wood: 5, stone: 20, ore: 5, gold: 15 },
  quarry: { wood: 20, stone: 5, ore: 5, gold: 15 },
  mine: { wood: 15, stone: 15, ore: 5, gold: 20 },
  blacksmith: { wood: 30, stone: 20, ore: 10, gold: 35 },
  tavern: { wood: 20, stone: 25, ore: 10, gold: 30 },
  alchemy: { wood: 15, stone: 20, ore: 20, gold: 35 },
};

function upgradeDurationSec(level: number): number {
  return Math.max(1, Math.round(UPGRADE_BASE_TIME_SEC * Math.pow(1 + level, 1.2)));
}

function buildSummary(instances: BuildingInstance[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const type of Object.keys(BUILDING_DEFS)) summary[type] = 0;
  for (const instance of instances) {
    summary[instance.type] = Math.max(summary[instance.type] ?? 0, instance.level);
  }
  return summary;
}

export interface TownSnapshot {
  townState: TownState;
  versions: {
    state: number;
    map: number;
    objects: number;
  };
  townHoverCell: { x: number; y: number } | null;
  previewPlacement: { type: string; gx: number; gy: number } | null;
  selectedEntityId: string | null;
}

export class TownController {
  private townState: TownState | null = null;
  private selectedEntityId: string | null = null;
  private interactionMode: TownInteractionMode = 'preview';
  private draftBuildingInstances: BuildingInstance[] | null = null;
  private townHoverCell: { x: number; y: number } | null = null;
  private dragEntityId: string | null = null;
  private dragStartCell: { x: number; y: number } | null = null;
  private pendingClickEntityId: string | null = null;
  private dragCamera = false;
  private lastDragX = 0;
  private lastDragY = 0;
  private townResAccum = 0;
  private stateVersion = 0;
  private mapVersion = 0;
  private objectsVersion = 0;
  private cameraX = 0;
  private cameraY = 0;
  private zoom = 3;
  private zoomMin = 0.5;
  private zoomMax = 3.5;

  constructor(
    private readonly onTownUpdate: (town: TownState, caps: { wood: number; stone: number; ore: number }) => void,
    private readonly onSelectionChange?: (entityId: string | null) => void,
  ) {}

  initState() {
    const saved = this.readSavedState();
    this.townState = this.migrateState(saved);
    this.bumpAll();
    this.notifyTownUpdate();
  }

  getState(): TownState | null {
    return this.townState;
  }

  getSelectedEntityId(): string | null {
    return this.selectedEntityId;
  }

  getInteractionMode(): TownInteractionMode {
    return this.interactionMode;
  }

  setInteractionMode(mode: TownInteractionMode) {
    if (mode === this.interactionMode) return;
    if (mode === 'edit') {
      this.beginTownEdit();
      return;
    }
    if (this.interactionMode === 'edit') {
      this.cancelTownEdit();
      return;
    }
    this.interactionMode = mode;
  }

  beginTownEdit() {
    if (!this.townState) return;
    this.interactionMode = 'edit';
    this.draftBuildingInstances = this.cloneInstances(this.townState.buildingInstances);
    this.clearSelection();
    this.pendingClickEntityId = null;
    this.bumpObjects();
    this.notifyTownUpdate();
  }

  commitTownEdit() {
    if (!this.townState || !this.draftBuildingInstances) {
      this.interactionMode = 'preview';
      return;
    }
    this.townState.buildingInstances = this.cloneInstances(this.draftBuildingInstances);
    this.townState.buildings = buildSummary(this.townState.buildingInstances);
    this.draftBuildingInstances = null;
    this.interactionMode = 'preview';
    this.dragEntityId = null;
    this.dragStartCell = null;
    this.pendingClickEntityId = null;
    this.persistTownState();
    this.bumpObjects();
    this.notifyTownUpdate();
  }

  cancelTownEdit() {
    this.draftBuildingInstances = null;
    this.interactionMode = 'preview';
    this.dragEntityId = null;
    this.dragStartCell = null;
    this.pendingClickEntityId = null;
    this.clearSelection();
    this.bumpObjects();
    this.notifyTownUpdate();
  }

  isTownEditing(): boolean {
    return this.interactionMode === 'edit';
  }

  getSelectedBuilding(): BuildingInstance | null {
    return this.getBuildingById(this.selectedEntityId);
  }

  getCameraState() {
    return { x: this.cameraX, y: this.cameraY, zoom: this.zoom };
  }

  syncZoom(zoom: number) {
    this.zoom = zoom;
  }

  setZoomLimits(limits: { min: number; max: number }) {
    this.zoomMin = limits.min;
    this.zoomMax = limits.max;
  }

  setCamera(x: number, y: number) {
    this.cameraX = x;
    this.cameraY = y;
  }

  getResourceCaps() {
    if (!this.townState) return { wood: 0, stone: 0, ore: 0 };
    const hall = this.getPrimaryLevel('hall');
    const warehouse = this.getPrimaryLevel('warehouse');
    const cap = Math.round(townCalcResCap(hall, warehouse));
    return { wood: cap, stone: cap, ore: cap };
  }

  getTownBonus(): TownBonus {
    if (!this.townState) return { atkMult: 1, hpMult: 1, defMult: 1 };
    const hall = this.getPrimaryLevel('hall');
    const warehouse = this.getPrimaryLevel('warehouse');
    const blacksmith = this.getPrimaryLevel('blacksmith');
    return {
      atkMult: 1 + 0.02 * blacksmith,
      hpMult: 1 + 0.01 * Math.max(0, hall - 1) + 0.005 * warehouse,
      defMult: 1 + 0.01 * (warehouse + Math.max(0, hall - 1)),
    };
  }

  getBuildQueueSlotsUnlocked(): number {
    const hall = this.getPrimaryLevel('hall');
    if (hall >= 6) return 3;
    if (hall >= 3) return 2;
    return 1;
  }

  isBuildingInQueue(buildingId: string): boolean {
    return (this.townState?.buildQueue ?? []).some((item) => item?.buildingId === buildingId);
  }

  hasEmptyBuildQueueSlot(): boolean {
    const unlocked = this.getBuildQueueSlotsUnlocked();
    const queue = this.townState?.buildQueue ?? [];
    for (let i = 0; i < unlocked && i < queue.length; i++) {
      if (queue[i] === null) return true;
    }
    return false;
  }

  getUpgradeCost(buildingId: string) {
    const building = this.getBuildingById(buildingId);
    if (!building) return { wood: 0, stone: 0, ore: 0, gold: 0 };
    const base = TOWN_UPGRADE_BASE_COST[building.type];
    if (!base) return { wood: 0, stone: 0, ore: 0, gold: 0 };
    const level = Math.max(0, Math.min(9, building.level));
    const multiplier = (1 + level) * (1 + level);
    return {
      wood: Math.round(base.wood * multiplier),
      stone: Math.round(base.stone * multiplier),
      ore: Math.round(base.ore * multiplier),
      gold: Math.round(base.gold * multiplier),
    };
  }

  upgradeBuilding(buildingId: string) {
    if (!this.townState) return;
    const building = this.getBuildingById(buildingId);
    if (!building) return;
    const def = getBuildingDef(building.type);
    if (!def.upgradable || building.level >= def.maxLevel) return;
    if (building.type !== 'hall' && building.level >= this.getPrimaryLevel('hall')) return;
    if (this.isBuildingInQueue(buildingId) || !this.hasEmptyBuildQueueSlot()) return;

    const cost = this.getUpgradeCost(buildingId);
    const resources = this.townState.resources;
    if (resources.wood < cost.wood || resources.stone < cost.stone || resources.ore < cost.ore || resources.gold < cost.gold) {
      return;
    }

    resources.wood -= cost.wood;
    resources.stone -= cost.stone;
    resources.ore -= cost.ore;
    resources.gold -= cost.gold;

    const item: BuildQueueItem = {
      buildingId: building.id,
      buildingType: building.type,
      fromLevel: building.level,
      completesAt: Math.floor(Date.now() / 1000) + upgradeDurationSec(building.level),
    };

    const queue = this.townState.buildQueue;
    for (let i = 0; i < this.getBuildQueueSlotsUnlocked() && i < queue.length; i++) {
      if (queue[i] === null) {
        queue[i] = item;
        break;
      }
    }

    this.persistTownState();
    this.bumpState();
    this.notifyTownUpdate();
  }

  clearSelection() {
    this.selectedEntityId = null;
    this.dragEntityId = null;
    this.dragStartCell = null;
    this.pendingClickEntityId = null;
    this.onSelectionChange?.(null);
  }

  handleWheel(canvas: HTMLCanvasElement, clientX: number, clientY: number, deltaY: number) {
    const before = this.getTownMouseGrid(canvas, clientX, clientY);
    const factor = deltaY < 0 ? 1.1 : 0.9;
    this.zoom = Math.max(this.zoomMin, Math.min(this.zoomMax, this.zoom * factor));
    if (!before) return;
    const after = this.getTownMouseGrid(canvas, clientX, clientY);
    if (!after) return;
    const isoBefore = gridToScreen(before.x, before.y);
    const isoAfter = gridToScreen(after.x, after.y);
    this.cameraX += (isoBefore.x - isoAfter.x) * this.zoom;
    this.cameraY += (isoBefore.y - isoAfter.y) * this.zoom;
  }

  handleMouseMove(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    if (this.dragCamera) {
      this.cameraX += clientX - this.lastDragX;
      this.cameraY += clientY - this.lastDragY;
      this.lastDragX = clientX;
      this.lastDragY = clientY;
      return;
    }
    this.townHoverCell = this.getTownMouseGrid(canvas, clientX, clientY);
  }

  handleMouseDown(canvas: HTMLCanvasElement, clientX: number, clientY: number, shiftKey: boolean) {
    if (shiftKey) {
      this.dragCamera = true;
      this.lastDragX = clientX;
      this.lastDragY = clientY;
      return;
    }
    const cell = this.getTownMouseGrid(canvas, clientX, clientY);
    this.townHoverCell = cell;
    this.pendingClickEntityId = null;
    this.dragEntityId = null;
    this.dragStartCell = null;
    if (!cell) return;
    const building = this.getBuildingAtGrid(cell.x, cell.y);
    if (this.interactionMode === 'preview') {
      this.pendingClickEntityId = building?.id ?? null;
      return;
    }
    if (!building) return;
    this.dragEntityId = building.id;
    this.dragStartCell = { x: cell.x, y: cell.y };
  }

  handleMouseUp(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    if (this.dragCamera) {
      this.dragCamera = false;
      return;
    }
    if (this.interactionMode === 'preview') {
      const cell = this.getTownMouseGrid(canvas, clientX, clientY);
      const building = cell ? this.getBuildingAtGrid(cell.x, cell.y) : null;
      if (building && building.id === this.pendingClickEntityId) {
        this.selectedEntityId = building.id;
        this.onSelectionChange?.(building.id);
      } else if (!building) {
        this.clearSelection();
      }
      this.pendingClickEntityId = null;
      return;
    }
    if (!this.dragEntityId) return;
    const buildingId = this.dragEntityId;
    const start = this.dragStartCell;
    const cell = this.getTownMouseGrid(canvas, clientX, clientY);
    this.dragEntityId = null;
    this.dragStartCell = null;
    if (!cell || !start) return;
    if (cell.x === start.x && cell.y === start.y) return;
    this.moveBuilding(buildingId, cell.x, cell.y);
  }

  process(dt: number, isTownMode: boolean) {
    if (!this.townState) return;
    this.processBuildQueue();
    if (!isTownMode) return;
    this.townResAccum += dt;
    if (this.townResAccum >= 10) {
      const ticks = Math.floor(this.townResAccum / 10);
      this.townResAccum -= ticks * 10;
      this.applyResourceTicks(ticks);
    }
  }

  getSnapshot(): TownSnapshot | null {
    if (!this.townState) return null;
    const activeInstances = this.getActiveBuildingInstances();
    return {
      townState: {
        ...this.townState,
        buildings: buildSummary(activeInstances),
        buildingInstances: activeInstances,
      },
      versions: {
        state: this.stateVersion,
        map: this.mapVersion,
        objects: this.objectsVersion,
      },
      townHoverCell: this.townHoverCell,
      previewPlacement: this.interactionMode === 'edit' && this.dragEntityId && this.townHoverCell
        ? {
            type: this.getBuildingById(this.dragEntityId)?.type ?? '',
            gx: this.townHoverCell.x,
            gy: this.townHoverCell.y,
          }
        : null,
      selectedEntityId: this.interactionMode === 'preview' ? this.selectedEntityId : null,
    };
  }

  private readSavedState(): TownState | null {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as TownState) : null;
    } catch {
      return null;
    }
  }

  private migrateState(saved: TownState | null): TownState {
    if (!saved) {
      return this.createDefaultState();
    }

    const map = saved.map ?? createDefaultTownMap();
    const buildQueue = Array.isArray(saved.buildQueue) ? [...saved.buildQueue] : [null, null, null];
    while (buildQueue.length < BUILD_QUEUE_MAX_SLOTS) buildQueue.push(null);

    let instances = Array.isArray(saved.buildingInstances)
      ? saved.buildingInstances.map((instance, index) => ({
          ...instance,
          id: instance.id || `${instance.type}-${index}`,
          level: instance.level ?? saved.buildings?.[instance.type] ?? 1,
          rotation: instance.rotation ?? 0,
          variant: instance.variant ?? 'default',
        }))
      : [];

    if (instances.length === 0) {
      instances = this.instancesFromLegacyState(saved.buildings ?? {}, saved.buildingPositions ?? {});
    }

    return {
      resources: saved.resources ?? { wood: 0, stone: 0, ore: 0, gold: 0 },
      buildings: buildSummary(instances),
      caps: saved.caps ?? { equipSlots: 20, materialSlots: 100 },
      buildQueue: buildQueue.map((item) => item ? {
        ...item,
        buildingId: item.buildingId || `${item.buildingType}-0`,
      } : null),
      map,
      buildingInstances: instances,
    };
  }

  private createDefaultState(): TownState {
    const levels: Record<string, number> = {
      hall: 1,
      warehouse: 0,
      lumber: 1,
      quarry: 1,
      mine: 1,
    };
    const instances = this.instancesFromLegacyState(levels, {});
    return {
      resources: { wood: 0, stone: 0, ore: 0, gold: 0 },
      buildings: buildSummary(instances),
      caps: { equipSlots: 20, materialSlots: 100 },
      buildQueue: [null, null, null],
      map: createDefaultTownMap(),
      buildingInstances: instances,
    };
  }

  private instancesFromLegacyState(buildings: Record<string, number>, positions: Record<string, BuildingPosition>): BuildingInstance[] {
    const out: BuildingInstance[] = [];
    const used = new Set<string>();
    const canPlace = (gx: number, gy: number, w: number, h: number) => {
      if (gx < 0 || gy < 0 || gx + w > TOWN_GRID_W || gy + h > TOWN_GRID_H) return false;
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          if (used.has(`${gx + dx},${gy + dy}`)) return false;
        }
      }
      return true;
    };
    const mark = (gx: number, gy: number, w: number, h: number) => {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) used.add(`${gx + dx},${gy + dy}`);
      }
    };

    for (let index = 0; index < DEFAULT_BUILDING_ORDER.length; index++) {
      const type = DEFAULT_BUILDING_ORDER[index];
      const level = buildings[type];
      if (level === undefined) continue;
      const size = BUILDING_GRID_SIZE[type] ?? { w: 1, h: 1 };
      let gx = positions[type]?.x ?? -1;
      let gy = positions[type]?.y ?? -1;
      if (!canPlace(gx, gy, size.w, size.h)) {
        let placed = false;
        for (let y = 0; y < TOWN_GRID_H && !placed; y++) {
          for (let x = 0; x < TOWN_GRID_W && !placed; x++) {
            if (canPlace(x, y, size.w, size.h)) {
              gx = x;
              gy = y;
              placed = true;
            }
          }
        }
      }
      if (gx >= 0 && gy >= 0) {
        mark(gx, gy, size.w, size.h);
        out.push(createBuildingInstance(type, index, gx, gy, level));
      }
    }

    return out;
  }

  private getPrimaryLevel(type: string): number {
    return Math.max(0, ...((this.townState?.buildingInstances ?? [])
      .filter((instance) => instance.type === type)
      .map((instance) => instance.level)));
  }

  private getBuildingById(buildingId: string | null): BuildingInstance | null {
    if (!buildingId) return null;
    return this.getActiveBuildingInstances().find((instance) => instance.id === buildingId) ?? null;
  }

  private getBuildingAtGrid(gx: number, gy: number): BuildingInstance | null {
    for (const instance of this.getActiveBuildingInstances()) {
      const size = BUILDING_GRID_SIZE[instance.type] ?? { w: 1, h: 1 };
      if (gx >= instance.gx && gx < instance.gx + size.w && gy >= instance.gy && gy < instance.gy + size.h) {
        return instance;
      }
    }
    return null;
  }

  private moveBuilding(buildingId: string, gx: number, gy: number): boolean {
    if (this.interactionMode !== 'edit' || !this.townState) return false;
    const instances = this.getActiveBuildingInstances();
    const building = instances.find((instance) => instance.id === buildingId);
    if (!building) return false;
    const size = BUILDING_GRID_SIZE[building.type] ?? { w: 1, h: 1 };
    if (gx < 0 || gy < 0 || gx + size.w > this.townState.map.width || gy + size.h > this.townState.map.height) {
      return false;
    }

    for (const other of instances) {
      if (other.id === building.id) continue;
      const otherSize = BUILDING_GRID_SIZE[other.type] ?? { w: 1, h: 1 };
      const disjoint = gx + size.w <= other.gx || other.gx + otherSize.w <= gx || gy + size.h <= other.gy || other.gy + otherSize.h <= gy;
      if (!disjoint) return false;
    }

    building.gx = gx;
    building.gy = gy;
    this.bumpObjects();
    return true;
  }

  private getActiveBuildingInstances(): BuildingInstance[] {
    return this.interactionMode === 'edit' && this.draftBuildingInstances ? this.draftBuildingInstances : (this.townState?.buildingInstances ?? []);
  }

  private cloneInstances(instances: BuildingInstance[]): BuildingInstance[] {
    return instances.map((instance) => ({ ...instance }));
  }

  private getTownMouseGrid(canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.townState) return null;
    const rect = canvas.getBoundingClientRect();
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;
    const isoCenter = gridToScreen((this.townState.map.width - 1) / 2, (this.townState.map.height - 1) / 2);
    let dx = canvasX - rect.width / 2 - this.cameraX;
    let dy = canvasY - rect.height / 2 - this.cameraY;
    dx /= this.zoom;
    dy /= this.zoom;

    const isoScreenX = dx + isoCenter.x;
    const isoScreenY = dy + isoCenter.y;
    const projected = screenToGrid(isoScreenX, isoScreenY);
    const candidates: [number, number][] = [
      [Math.floor(projected.gx), Math.floor(projected.gy)],
      [Math.floor(projected.gx) + 1, Math.floor(projected.gy)],
      [Math.floor(projected.gx), Math.floor(projected.gy) + 1],
      [Math.floor(projected.gx) + 1, Math.floor(projected.gy) + 1],
    ];

    for (const [gx, gy] of candidates) {
      if (gx < 0 || gy < 0 || gx >= this.townState.map.width || gy >= this.townState.map.height) continue;
      if (pointInDiamond(isoScreenX, isoScreenY, gx, gy)) return { x: gx, y: gy };
    }

    const gx = Math.round(projected.gx);
    const gy = Math.round(projected.gy);
    if (gx < 0 || gy < 0 || gx >= this.townState.map.width || gy >= this.townState.map.height) return null;
    return { x: gx, y: gy };
  }

  private processBuildQueue() {
    if (!this.townState) return;
    const nowSec = Math.floor(Date.now() / 1000);
    let changed = false;
    this.townState.buildQueue = this.townState.buildQueue.map((item) => {
      if (!item || item.completesAt > nowSec) return item;
      const building = this.getBuildingById(item.buildingId);
      if (building && building.level === item.fromLevel) {
        building.level += 1;
        changed = true;
      }
      return null;
    });

    if (!changed) return;
    this.townState.buildings = buildSummary(this.townState.buildingInstances);
    this.persistTownState();
    this.bumpObjects();
    this.notifyTownUpdate();
  }

  private applyResourceTicks(ticks: number) {
    if (!this.townState || ticks <= 0) return;
    const caps = this.getResourceCaps();
    const resources = this.townState.resources;
    const totals = { wood: 0, stone: 0, ore: 0 };
    for (const instance of this.townState.buildingInstances) {
      if (instance.type === 'lumber') totals.wood += townCalcYield('lumber', instance.level);
      if (instance.type === 'quarry') totals.stone += townCalcYield('quarry', instance.level);
      if (instance.type === 'mine') totals.ore += townCalcYield('mine', instance.level);
    }
    resources.wood = Math.min(caps.wood, resources.wood + totals.wood * ticks);
    resources.stone = Math.min(caps.stone, resources.stone + totals.stone * ticks);
    resources.ore = Math.min(caps.ore, resources.ore + totals.ore * ticks);
    this.persistTownState();
    this.bumpState();
    this.notifyTownUpdate();
  }

  private notifyTownUpdate() {
    if (!this.townState) return;
    this.onTownUpdate(cloneTownState(this.townState), this.getResourceCaps());
  }

  private persistTownState() {
    if (!this.townState) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.townState));
  }

  private bumpState() {
    this.stateVersion += 1;
  }

  private bumpObjects() {
    this.stateVersion += 1;
    this.objectsVersion += 1;
    this.townState!.buildings = buildSummary(this.townState!.buildingInstances);
  }

  private bumpAll() {
    this.stateVersion += 1;
    this.mapVersion += 1;
    this.objectsVersion += 1;
    if (this.townState) this.townState.buildings = buildSummary(this.townState.buildingInstances);
  }
}
