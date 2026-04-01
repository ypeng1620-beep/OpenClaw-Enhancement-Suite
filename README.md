# OpenClaw Enhancement Suite

> OpenClaw 的能力增强套件，让 AI Agent 更强、更可控、更持久。

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
