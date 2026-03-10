# SEVENS: 七星传说

多人在线 RPG 游戏，Go WebSocket 服务端 + Canvas 前端渲染。

## 快速开始

```bash
# 需要 Go 1.21+
go build -o sevens .
./sevens
# 浏览器访问 http://localhost:8080
```

## 操作方式

| 按键 | 功能 |
|------|------|
| 方向键 | 移动 |
| 鼠标右键 | 点击移动 |
| 鼠标左键 / Q | 裂空斩（普攻） |
| W | 盾击冲锋 |
| E | 战吼（加速 buff） |
| R | 七星审判（终极技能） |
| F | 拾取地上装备 |
| B | 打开/关闭背包 |
| I | 打开/关闭属性面板 |
| ESC | 关闭面板 |

背包内：左键穿戴/卸下装备，右键查看属性详情。

## 项目结构

```
sevens/
├── main.go                 # 入口：HTTP + WebSocket 服务
├── game/
│   ├── world.go            # 游戏世界：主循环、碰撞、波次、广播
│   ├── player.go           # 玩家：属性、移动、技能、装备
│   ├── enemy.go            # 敌人：AI、种类（骷髅/兽人/恶魔/Boss）
│   ├── equipment.go        # 装备系统：生成、稀有度、掉落
│   ├── skill.go            # 技能定义与战士技能组
│   ├── entity.go           # 基础类型：Vec2、ID 生成器
│   └── protocol.go         # 网络协议：客户端/服务端消息结构
├── static/
│   ├── index.html          # UI：开始界面、HUD、背包、属性面板
│   └── js/
│       ├── main.js         # 客户端主逻辑：输入、插值、HUD
│       ├── renderer.js     # Canvas 渲染：角色、敌人、掉落物
│       ├── effects.js      # 粒子系统与技能特效
│       ├── network.js      # WebSocket 客户端
│       └── sound.js        # Web Audio API 程序化音效
```

## 架构

**服务端权威**：所有游戏逻辑（移动、伤害、掉落）在 Go 服务端运算，客户端只负责渲染和输入。

- 服务端 20Hz tick（50ms），客户端 60fps 插值渲染
- WebSocket JSON 协议，PlayerConn 写通道防并发写入
- 圆形碰撞检测（玩家、敌人互推）

## 游戏系统

### 战斗
- 4 个技能各有 CD、MP 消耗、施法时间
- 伤害 = 技能基础 + ATK/2 + 随机浮动，乘以暴击和伤害加成
- 生命偷取按最终伤害百分比回血

### 装备（6 部位）
| 部位 | 主属性 |
|------|--------|
| 武器 | 攻击力、暴击率、暴击伤害、攻速 |
| 铠甲 | 防御、生命、护甲、伤害减免 |
| 头盔 | 防御、生命、生命/魔力回复 |
| 战靴 | 移动速度、闪避 |
| 戒指 | 攻击、暴击、伤害加成、冷却缩减 |
| 项链 | 魔力、魔力回复、冷却缩减 |

5 个稀有度：普通(白) → 优秀(绿) → 稀有(蓝) → 史诗(紫) → 传说(橙)

### 属性（14 项）
攻击力、防御力、攻速、移速、暴击率、暴击伤害、生命回复、魔力回复、护甲、闪避、生命偷取、冷却缩减、伤害加成、伤害减免

### 波次
- 每波间隔 12-25 秒，怪物数量和强度递增
- 每 5 波为 Boss 波，Boss 保底掉蓝色品质装备
- 所有玩家离线后世界重置

## 开发

```bash
# 修改 Go 代码后重新编译
go build -o sevens . && ./sevens

# 前端文件（static/）修改后刷新浏览器即可，无需重启服务
```

### 添加新英雄

1. `game/skill.go` — 定义技能组（参考 `WarriorSkills()`）
2. `game/player.go` — 添加构造函数（参考 `NewWarrior()`）
3. `game/world.go` — 在 `handleMessage` 的 join 中根据 hero 类型创建
4. `static/js/renderer.js` — 添加角色渲染
5. `static/js/effects.js` — 添加技能特效
6. `static/index.html` — 解锁英雄选择卡

### 添加新敌人

1. `game/enemy.go` — 在 `EnemyKinds` 中添加条目
2. `game/world.go` — 在 `spawnWave()` 中加入生成逻辑
3. `static/js/renderer.js` — 在 `drawEnemies` 中添加渲染

## License

MIT
