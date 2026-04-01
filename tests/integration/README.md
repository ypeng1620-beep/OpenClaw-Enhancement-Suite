# 集成测试

> 独立可运行的集成测试脚本

## 测试文件

### `mcp-toolhub-coordinator-context.test.ts`

完整场景测试，涵盖：
1. Mock MCP 服务器（3 个工具：get_weather, send_email, calculate）
2. MCP Hub 同步工具到 ToolHub
3. CoordinatorHub 任务分解（3 个子任务）
4. PermissionHub 权限检查（包含 ask 确认）
5. ContextHub 事件记录 + 递减检测
6. 父子任务自动完成（all_success 策略）
7. 错误处理验证

## 运行方式

### 方式一：使用 npm（推荐）

```bash
cd D:\OpenClaw-Enhancement-Suite

# 先构建所有包
npm run build

# 运行完整集成测试
npm test

# 或直接运行脚本
npx tsx tests/integration/mcp-toolhub-coordinator-context.test.ts
```

### 方式二：使用 Jest

```bash
npx jest tests/integration/mcp-toolhub-coordinator-context.test.ts --verbose
```

## 预期输出

```
============================================================
  OpenClaw Suite 集成测试：MCP + ToolHub + PermissionHub + ContextHub + CoordinatorHub
============================================================

▶ STEP 1 初始化所有组件...
  ✅ ToolRegistry 和 ToolExecutor 初始化完成
  ✅ PermissionEngine 和 PermissionGuard 初始化完成
  ✅ ContextManager 和 DiminishingReturnsDetector 初始化完成
  ✅ MCPServerRegistry 和 MCPToolMapper 初始化完成
  ✅ TaskManager 初始化完成

▶ STEP 2 启动模拟 MCP 服务器，同步工具到 ToolHub...
  ✅ Mock MCP 服务器创建完成，提供 3 个工具
  ↳ 映射结果: 3/3 个工具成功
  ↳ 已注册工具: mcp__mock-server__get_weather
  ↳ 已注册工具: mcp__mock-server__send_email
  ↳ 已注册工具: mcp__mock-server__calculate

▶ STEP 3 配置权限规则...
  ✅ 添加规则: allow get_weather for research-agent
  ✅ 添加规则: allow calculate for research-agent
  ✅ 添加规则: ask send_email for research-agent (需要确认)

... (更多输出)

============================================================
  测试结果汇总
============================================================

通过: XX
失败: 0
总事件数: XX

🎉 所有测试通过！
```

## Mock MCP 服务器

测试使用内存中的 Mock MCP 服务器，提供以下工具：

| 工具 | 描述 | 权限 |
|------|------|------|
| `get_weather` | 获取城市天气 | allow |
| `send_email` | 发送邮件 | ask (需要确认) |
| `calculate` | 数学计算 | allow |

## 验证点

- [x] MCP 工具映射到正确 ID 格式 (`mcp__mock-server__tool`)
- [x] 工具自动同步到 ToolRegistry
- [x] 权限规则正确匹配 (allow/ask/deny)
- [x] ask 效果触发等待确认
- [x] 工具执行事件记录到 ContextHub
- [x] 递减检测在连续相同操作后触发
- [x] 所有子任务完成后父任务自动完成
- [x] 错误处理和状态转换正确
