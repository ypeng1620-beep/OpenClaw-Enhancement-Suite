# Integration Tests

> Phase 6: OpenClaw Enhancement Suite 集成测试

## 测试场景

### 1. ToolHub + PermissionHub (`toolhub-permission.test.ts`)
- ✅ 已授权工具允许执行
- ✅ 未授权工具被拒绝
- ✅ ask 效果触发确认
- ✅ 危险操作被 PermissionGuard 拦截

### 2. ToolHub + ContextHub (`toolhub-context.test.ts`)
- ✅ 工具执行事件自动记录
- ✅ 递减检测触发通知
- ✅ ToolContextAdapter 提供执行摘要
- ✅ 上下文压缩保留关键信息

### 3. MCP Hub + ToolHub (`mcphub-toolhub.test.ts`)
- ✅ MCP 工具映射到正确 Tool ID 格式
- ✅ MCPServerRegistry 自动同步到 ToolRegistry
- ✅ capability 默认只读
- ✅ 自定义 metadata 覆盖默认
- ✅ 批量映射支持进度回调

### 4. CoordinatorHub + PermissionHub (`coordinator-permission.test.ts`)
- ✅ ask 效果暂停与恢复
- ✅ 父子任务失败传播
- ✅ 任务重试增加 retryCount
- ✅ 超时自动清理
- ✅ 事件订阅正确触发
- ✅ 并发任务数限制

### 5. E2E 完整场景 (`e2e-scenario.test.ts`)
- ✅ 股票研究任务完整流程
- ✅ MCP 工具映射集成
- ✅ 权限拒绝阻止执行

## 运行测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 覆盖率
npm run test:coverage
```

## 测试架构

```
integration-tests/
└── src/
    ├── toolhub-permission.test.ts   # ToolHub ↔ PermissionHub
    ├── toolhub-context.test.ts      # ToolHub ↔ ContextHub
    ├── mcphub-toolhub.test.ts       # MCPHub ↔ ToolHub
    ├── coordinator-permission.test.ts # CoordinatorHub ↔ PermissionHub
    └── e2e-scenario.test.ts         # 端到端完整场景
```

## Mock 策略

- 使用内存存储替代持久化（FileRuleStore 等使用内存模拟）
- MCP 服务器使用 mock 不真实启动进程
- 网络操作使用内存模拟
