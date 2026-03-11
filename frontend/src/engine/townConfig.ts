/**
 * 城镇网格与建筑占格配置，与 TownScreen BUILDINGS 的 key 对齐。
 * 等轴测 2:1：单格菱形宽高，用于 gridToScreen / screenToGrid 与绘制。
 */
export const TOWN_CELL_PX = 64;
export const TOWN_GRID_W = 20;
export const TOWN_GRID_H = 15;

export const ISO_TILE_W = 64;
export const ISO_TILE_H = 32;

/** 格子中心在相机空间（原点为地图中心）下的屏幕坐标 */
export function gridToScreen(gx: number, gy: number): { x: number; y: number } {
  return {
    x: (gx - gy) * (ISO_TILE_W / 2),
    y: (gx + gy) * (ISO_TILE_H / 2),
  };
}

/** 相机空间屏幕坐标反算为逻辑格（浮点），调用方需再做格子归属判定 */
export function screenToGrid(screenX: number, screenY: number): { gx: number; gy: number } {
  const halfW = ISO_TILE_W / 2;
  const halfH = ISO_TILE_H / 2;
  return {
    gx: (screenX / halfW + screenY / halfH) / 2,
    gy: (screenY / halfH - screenX / halfW) / 2,
  };
}

/** 判断相机空间点 (isoScreenX, isoScreenY) 是否落在格子 (gx, gy) 的菱形内（与绘制一致） */
export function pointInDiamond(isoScreenX: number, isoScreenY: number, gx: number, gy: number): boolean {
  const { x: cx, y: cy } = gridToScreen(gx, gy);
  const w = ISO_TILE_W / 2;
  const h = ISO_TILE_H / 2;
  const nx = (isoScreenX - cx) / w;
  const ny = (isoScreenY - cy) / h;
  return Math.abs(nx) + Math.abs(ny) <= 1;
}

export const BUILDING_GRID_SIZE: Record<string, { w: number; h: number }> = {
  hall: { w: 2, h: 2 },
  warehouse: { w: 1, h: 1 },
  lumber: { w: 1, h: 1 },
  quarry: { w: 1, h: 1 },
  mine: { w: 1, h: 1 },
  blacksmith: { w: 1, h: 1 },
  tavern: { w: 1, h: 1 },
  alchemy: { w: 1, h: 1 },
};

export const BUILDING_NAMES: Record<string, string> = {
  hall: '市政厅',
  warehouse: '仓库',
  lumber: '伐木场',
  quarry: '采石场',
  mine: '采矿场',
  blacksmith: '铁匠铺',
  tavern: '餐厅',
  alchemy: '炼金工坊',
};
