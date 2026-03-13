import { BuildingInstance, TownMapData, TownTileLayer } from './types';
import { BUILDING_GRID_SIZE, TOWN_GRID_H, TOWN_GRID_W } from './townConfig';

export interface BuildingDefinition {
  type: string;
  name: string;
  description: string;
  icon: string;
  textureKey: string;
  previewSrc: string;
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
    name: '主城',
    description: '决定其他建筑的最高等级，并解锁更多建造队列。',
    icon: '城',
    textureKey: 'town-building-hall',
    previewSrc: '/assets/town/buildings/hall.png',
    footprint: BUILDING_GRID_SIZE.hall,
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 20,
    obstacleHeight: 56,
    maxLevel: 10,
    upgradable: true,
  },
  warehouse: {
    type: 'warehouse',
    name: '仓库',
    description: '提高资源储量上限。',
    icon: '仓',
    textureKey: 'town-building-warehouse',
    previewSrc: '/assets/town/buildings/warehouse.png',
    footprint: BUILDING_GRID_SIZE.warehouse,
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 18,
    obstacleHeight: 34,
    maxLevel: 10,
    upgradable: true,
  },
  lumber: {
    type: 'lumber',
    name: '伐木场',
    description: '持续产出木材。',
    icon: '木',
    textureKey: 'town-building-lumber',
    previewSrc: '/assets/town/buildings/lumber.png',
    footprint: BUILDING_GRID_SIZE.lumber,
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 18,
    obstacleHeight: 34,
    maxLevel: 10,
    upgradable: true,
  },
  quarry: {
    type: 'quarry',
    name: '采石场',
    description: '持续产出石材。',
    icon: '石',
    textureKey: 'town-building-quarry',
    previewSrc: '/assets/town/buildings/quarry.png',
    footprint: BUILDING_GRID_SIZE.quarry,
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 16,
    obstacleHeight: 28,
    maxLevel: 10,
    upgradable: true,
  },
  mine: {
    type: 'mine',
    name: '矿场',
    description: '持续产出矿石。',
    icon: '矿',
    textureKey: 'town-building-mine',
    previewSrc: '/assets/town/buildings/mine.png',
    footprint: BUILDING_GRID_SIZE.mine,
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 18,
    obstacleHeight: 32,
    maxLevel: 10,
    upgradable: true,
  },
  blacksmith: {
    type: 'blacksmith',
    name: '铁匠铺',
    description: '提供战斗能力增益。',
    icon: '铁',
    textureKey: 'town-building-blacksmith',
    previewSrc: '/assets/town/buildings/blacksmith.png',
    footprint: BUILDING_GRID_SIZE.blacksmith,
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 18,
    obstacleHeight: 32,
    maxLevel: 10,
    upgradable: true,
  },
  tavern: {
    type: 'tavern',
    name: '酒馆',
    description: '提供城镇服务与冒险支援。',
    icon: '酒',
    textureKey: 'town-building-tavern',
    previewSrc: '/assets/town/buildings/tavern.png',
    footprint: BUILDING_GRID_SIZE.tavern,
    anchor: { x: 0.5, y: 1 },
    anchorOffsetY: 18,
    obstacleHeight: 32,
    maxLevel: 10,
    upgradable: true,
  },
  alchemy: {
    type: 'alchemy',
    name: '炼金工坊',
    description: '用于高级合成与制作。',
    icon: '炼',
    textureKey: 'town-building-alchemy',
    previewSrc: '/assets/town/buildings/alchemy.png',
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
    previewSrc: '',
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
