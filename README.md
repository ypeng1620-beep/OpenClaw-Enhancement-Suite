# OpenClaw Enhancement Suite

> OpenClaw 的能力增强套件，让 AI Agent 更强、更可控、更持久。

## 它能做什么

给 AI Agent 装上 5 个增强模块：

### 1. 🔧 ToolHub（工具中心）
**能做什么**：管理 AI 能用的所有工具
- 注册新工具（比如接 API、接数据库）
- 搜索工具，按名字/标签查找
- 控制工具执行超时，重试

### 2. 🔐 PermissionHub（权限中心）
**能做什么**：给工具装"门卫"
- 定义规则：谁能用什么工具
- 三种结果：**允许** / **拒绝** / **问我**
- 危险操作（如删文件）需要你确认，安全操作直接放行

### 3. 📦 ContextHub（上下文压缩）
**能做什么**：防止对话太长累死 AI
- AI 对话久了上下文越来越长，它帮你压缩
- 检测"收益递减"：连续做一样的事没进展时提醒你

### 4. 🔌 MCP Hub（MCP 服务器集成）
**能做什么**：一键接入官方 MCP 工具
- MCP = AI 工具标准协议
- 自动发现工具、自动同步到工具中心

### 5. 📋 CoordinatorHub（任务协调）
**能做什么**：帮你拆解和追踪复杂任务
- 大任务拆成小任务，自动分配
- 失败自动重试，超时自动取消

### 一句话总结

| 模块 | 核心功能 |
|------|---------|
| ToolHub | 工具注册、搜索、执行 |
| PermissionHub | 谁能用什么工具 |
| ContextHub | 对话太长就压缩 |
| MCP Hub | 一键接官方 AI 工具 |
| CoordinatorHub | 复杂任务拆解追踪 |

**就像给 AI 装上了：工具箱、门禁系统、记忆压缩器、官方接口卡、任务管理器。**

## 快速开始

```bash
# 安装
git clone https://github.com/ypeng1620-beep/OpenClaw-Enhancement-Suite.git
cd OpenClaw-Enhancement-Suite
pnpm install
pnpm run build

# 初始化 ToolHub
npx tsx -e "
import { ToolRegistry } from '@openclaw/suite-tool-hub'
const registry = new ToolRegistry()
await registry.register({ id: 'my-tool', name: 'hello', namespace: 'test', version: '1.0.0', description: '', inputSchema: { type: 'object' }, execute: async () => ({ result: 'Hello!' }) })
console.log(await registry.list())
"
```

**要求**: Node.js >= 20.0.0 | **版本**: v0.1.0 | **OpenClaw**: v2.x 兼容

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Enhancement Suite                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   packages/core          ── 共享类型 + 接口标准              │
│                                                             │
│   packages/tool-hub      ── 工具注册表                       │
│   packages/permission-hub ── 权限规则引擎                     │
│   packages/context-hub    ── 上下文压缩引擎                   │
│   packages/mcp-hub       ── MCP 服务器集成                   │
│   packages/coordinator-hub── 多Agent协调中心                  │
│                                                             │
│   packages/integration-tests ── Phase 6 集成测试              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 模块

| 包 | 状态 | 说明 |
|---|------|------|
| `core` | ✅ 完成 | 共享类型定义、接口标准 (~30KB) |
| `tool-hub` | ✅ Phase 1 | 工具注册、发现、生命周期钩子 |
| `permission-hub` | ✅ Phase 2 | 规则引擎、FileRuleStore 热更新 |
| `context-hub` | ✅ Phase 3 | 上下文压缩、递减检测、三层策略 |
| `mcp-hub` | ✅ Phase 4 | MCP 服务器管理、ToolHub 自动同步 |
| `coordinator-hub` | ✅ Phase 5 | 任务管理、父子策略、ask 效果集成 |
| `integration-tests` | ✅ Phase 6 | 5 大集成测试场景、E2E 完整流程 |

## 开发进度

- [x] Day 1-2: 接口标准设计 (`docs/api-standards.md`)
- [x] Day 3: TypeScript 类型定义 (`packages/core`)
- [x] Phase 1: ToolHub
- [x] Phase 2: PermissionHub
- [x] Phase 3: ContextHub
- [x] Phase 4: MCP Hub
- [x] Phase 5: CoordinatorHub
- [x] **Phase 6: 集成测试** ← 当前

## Phase 6 集成测试场景

| 测试文件 | 集成模块 | 场景 |
|---------|---------|------|
| `toolhub-permission.test.ts` | ToolHub ↔ PermissionHub | 工具注册→权限检查→执行拦截 |
| `toolhub-context.test.ts` | ToolHub ↔ ContextHub | 工具执行→事件记录→递减检测 |
| `mcphub-toolhub.test.ts` | MCPHub ↔ ToolHub | MCP 工具映射→ToolRegistry 同步 |
| `coordinator-permission.test.ts` | CoordinatorHub ↔ PermissionHub | 任务→权限检查→ask 暂停→恢复 |
| `e2e-scenario.test.ts` | 全部模块 | 股票研究任务完整流程 |

## 设计原则

1. **接口先行** — 先定标准，再写实现
2. **依赖注入** — 模块间通过接口通信，不直接依赖
3. **单一职责** — 每个包只做一件事
4. **可测试** — 每个模块独立可测试

## License

MIT
