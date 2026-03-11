把城镇建筑贴图放在这个目录即可（可先缺省，缺省时会用占位菱形渲染）。

## 约定
- **路径**：`/assets/town/buildings/<type>.png`
- **type**：与 `TownScreen` / `townConfig` 的建筑 key 一致（用于城镇里“这栋建筑用哪张图”）：
  - `hall`：市政厅
  - `warehouse`：仓库
  - `lumber`：伐木场
  - `quarry`：采石场
  - `mine`：采矿场
  - `blacksmith`：铁匠铺
  - `tavern`：餐厅
  - `alchemy`：炼金工坊

## 示例
- 市政厅贴图：`/assets/town/buildings/hall.png`
- 伐木场贴图：`/assets/town/buildings/lumber.png`

## 建议
- **锚点**：渲染时会把图片以“底部中心”为锚点（bottom-center），落在格子菱形中心附近。
- **尺寸**：可先用 128×128 或 192×192 尝试；后续再按建筑占地和视觉高度统一规范。

