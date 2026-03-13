import { BuildingInstance, TownMapData, TownTileLayer } from './types';
import { BUILDING_GRID_SIZE, TOWN_GRID_H, TOWN_GRID_W } from './townConfig';

export interface BuildingDefinition {
  type: string;
  name: string;
  description: string;
  icon: string;
  textureKey: string;
  footprint: { w: number; h: number };
  anchor: { x: number; y: number };
  anchorOffsetY: number;
  obstacleHeight: number;
  maxLevel: number;
  upgradable: boolean;
}

export const BUILDING_DEFS: Record<string, BuildingDefinition> = {
  hall: {
    type: 'hall',
    name: 'Hall',
    description: 'Unlocks higher level upgrades and additional build slots.',
    icon: 'H',
    textureKey: 'town-building-hall',
    footprint: BUILDING_GRID_SIZE.hall,
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 20,
    obstacleHeight: 56,
    maxLevel: 10,
    upgradable: true,
  },
  warehouse: {
    type: 'warehouse',
    name: 'Warehouse',
    description: 'Raises storage capacity.',
    icon: 'W',
    textureKey: 'town-building-warehouse',
    footprint: BUILDING_GRID_SIZE.warehouse,
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 18,
    obstacleHeight: 34,
    maxLevel: 10,
    upgradable: true,
  },
  lumber: {
    type: 'lumber',
    name: 'Lumber Mill',
    description: 'Produces wood over time.',
    icon: 'L',
    textureKey: 'town-building-lumber',
    footprint: BUILDING_GRID_SIZE.lumber,
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 18,
    obstacleHeight: 34,
    maxLevel: 10,
    upgradable: true,
  },
  quarry: {
    type: 'quarry',
    name: 'Quarry',
    description: 'Produces stone over time.',
    icon: 'Q',
    textureKey: 'town-building-quarry',
    footprint: BUILDING_GRID_SIZE.quarry,
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 16,
    obstacleHeight: 28,
    maxLevel: 10,
    upgradable: true,
  },
  mine: {
    type: 'mine',
    name: 'Mine',
    description: 'Produces ore over time.',
    icon: 'M',
    textureKey: 'town-building-mine',
    footprint: BUILDING_GRID_SIZE.mine,
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 18,
    obstacleHeight: 32,
    maxLevel: 10,
    upgradable: true,
  },
  blacksmith: {
    type: 'blacksmith',
    name: 'Blacksmith',
    description: 'Improves combat power.',
    icon: 'B',
    textureKey: 'town-building-blacksmith',
    footprint: BUILDING_GRID_SIZE.blacksmith,
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 18,
    obstacleHeight: 32,
    maxLevel: 10,
    upgradable: true,
  },
  tavern: {
    type: 'tavern',
    name: 'Tavern',
    description: 'Supports town services and buffs.',
    icon: 'T',
    textureKey: 'town-building-tavern',
    footprint: BUILDING_GRID_SIZE.tavern,
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 18,
    obstacleHeight: 32,
    maxLevel: 10,
    upgradable: true,
  },
  alchemy: {
    type: 'alchemy',
    name: 'Alchemy',
    description: 'Handles advanced crafting.',
    icon: 'A',
    textureKey: 'town-building-alchemy',
    footprint: BUILDING_GRID_SIZE.alchemy,
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 18,
    obstacleHeight: 32,
    maxLevel: 10,
    upgradable: true,
  },
};

export const DEFAULT_BUILDING_ORDER = ['hall', 'warehouse', 'lumber', 'quarry', 'mine', 'blacksmith', 'tavern', 'alchemy'];

function createLayer(id: string, width: number, height: number, fill: string, chunkSize = 8): TownTileLayer {
  return {
    id,
    width,
    height,
    chunkSize,
    tiles: Array(width * height).fill(fill),
  };
}

function setTile(layer: TownTileLayer, x: number, y: number, value: string) {
  layer.tiles[y * layer.width + x] = value;
}

export function createDefaultTownMap(width = TOWN_GRID_W, height = TOWN_GRID_H): TownMapData {
  const ground = createLayer('ground', width, height, 'town-floor-turf');
  const overlay = createLayer('overlay', width, height, 'empty');
  const objects = createLayer('objects', width, height, 'empty');

  const maxX = width - 1;
  const maxY = height - 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 && y === 0) setTile(ground, x, y, 'town-floor-top-left-corner');
      else if (x === maxX && y === 0) setTile(ground, x, y, 'town-floor-top-right-corner');
      else if (x === 0 && y === maxY) setTile(ground, x, y, 'town-floor-bottom-left-corner');
      else if (x === maxX && y === maxY) setTile(ground, x, y, 'town-floor-bottom-right-corner');
      else if ((x === 0 || x === maxX) && y > 0 && y < maxY) setTile(ground, x, y, 'town-floor-left-road');
      else if ((y === 0 || y === maxY) && x > 0 && x < maxX) setTile(ground, x, y, 'town-floor-right-road');
    }
  }

  return {
    version: 1,
    width,
    height,
    layers: { ground, overlay, objects },
  };
}

export function getBuildingDef(type: string): BuildingDefinition {
  return BUILDING_DEFS[type] ?? {
    type,
    name: type,
    description: type,
    icon: '?',
    textureKey: '',
    footprint: { w: 1, h: 1 },
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 16,
    obstacleHeight: 24,
    maxLevel: 10,
    upgradable: true,
  };
}

export function createBuildingInstance(type: string, index: number, gx: number, gy: number, level: number): BuildingInstance {
  return {
    id: `${type}-${index}`,
    type,
    gx,
    gy,
    level,
    rotation: 0,
    variant: 'default',
  };
}
