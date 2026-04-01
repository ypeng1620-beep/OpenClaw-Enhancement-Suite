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
└─────────────────────────────────────────────────────────────┘
```

## 模块

| 包 | 状态 | 说明 |
|---|------|------|
| `core` | 🔨 设计中 | 共享类型定义、接口标准 |
| `tool-hub` | 🔨 设计中 | 工具注册、发现、安装 |
| `permission-hub` | 🔨 设计中 | 细粒度权限规则 |
| `context-hub` | 🔨 设计中 | 上下文压缩、递减检测 |
| `mcp-hub` | 🔨 设计中 | MCP → Tool 映射 |
| `coordinator-hub` | 🔨 设计中 | 多Agent任务协调 |

## 开发进度

- [ ] Day 1-2: 接口标准设计 (`docs/api-standards.md`)
- [ ] Day 3: TypeScript 类型定义 (`packages/core`)
- [ ] Phase 1: ToolHub
- [ ] Phase 2: PermissionHub
- [ ] Phase 3: ContextHub
- [ ] Phase 4: MCP Hub
- [ ] Phase 5: CoordinatorHub
- [ ] Phase 6: 集成测试

## 设计原则

1. **接口先行** — 先定标准，再写实现
2. **依赖注入** — 模块间通过接口通信，不直接依赖
3. **单一职责** — 每个包只做一件事
4. **可测试** — 每个模块独立可测试

## License

MIT
