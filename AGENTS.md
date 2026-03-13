# 仓库协作约定

本文件用于说明在 `d:\game\sevens` 仓库内协作时，Codex 与开发者默认遵守的工作规则。

## 提交规范

- 所有 Git 提交信息必须使用约定式提交（Conventional Commits）。
- 提交格式统一为：

```text
<type>(<scope>): <summary>
```

- 常用类型示例：
  - `feat(frontend): 新增城镇建筑批量编辑`
  - `fix(backend): 修复掉线后重连状态同步`
  - `refactor(engine): 拆分城镇渲染控制器`
  - `docs(repo): 更新仓库协作说明`
  - `chore(ci): 调整构建脚本`

- 约束说明：
  - `type` 使用英文小写。
  - `scope` 使用英文小写，需尽量贴近模块，例如 `frontend`、`backend`、`engine`、`repo`。
  - `summary` 使用简洁中文描述当前提交的核心变更。
  - 避免使用含糊描述，例如“修改一下”“更新代码”“fix bug”。

## Git 信息说明

- 本仓库中的 Git 相关说明、提交约定、操作说明，默认使用中文描述。
- 如果需要执行 `git commit`，但本地尚未配置身份信息，必须先确认以下两项：
  - `user.name`
  - `user.email`
- 未配置身份信息时，不应擅自猜测或伪造提交者身份。
- 需要用户提供 Git 身份信息时，应明确用中文说明原因，并提示用户提供如下格式：

```text
user.name=你的名字
user.email=你的邮箱
```

## 本仓库 Git 现状

- 当前远程仓库：`origin = https://github.com/hoobean1996/sevens.git`
- 当前默认分支跟踪：`master -> origin/master`

## 操作原则

- 提交前优先确认只包含本次任务相关变更。
- 不要把无关的锁文件、配置文件或用户本地改动混入本次提交，除非这些内容确实属于当前任务。
- 若工作区存在非本次任务引入的改动，应先说明，再决定是否纳入提交。
