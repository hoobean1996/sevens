/**
 * 资源建筑产量计算（客户端 UI 使用）。
 *
 * 注意：公式需与 TownController.ts 中的 townCalcYield 保持一致。
 * 当前含义：每 10 秒（一个资源 tick）的基础产量。
 */
export type ResourceBuildingType = 'lumber' | 'quarry' | 'mine';

export function getResourceYield(buildingType: ResourceBuildingType, level: number): number {
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

