# OpenClaw Enhancement Suite - 快速开始

> 让 AI Agent 更强、更可控、更持久

## 安装

```bash
# 克隆项目
git clone <repo>
cd OpenClaw-Enhancement-Suite

# 安装依赖
pnpm install

# 构建所有包
pnpm build
```

## 快速开始

### 1. 配置 MCP 服务器

```typescript
import { MCPServerRegistry, MCPToolMapper } from '@openclaw/suite-mcp-hub'
import { ToolRegistry } from '@openclaw/suite-tool-hub'

// 创建注册表
const toolRegistry = new ToolRegistry()
const mapper = new MCPToolMapper({ namespacePrefix: 'mcp', includeServerName: true })
const registry = new MCPServerRegistry({
  syncToToolHub: toolRegistry,  // 自动同步到 ToolHub
  toolMapper: mapper,
})

// 注册 MCP 服务器
await registry.register({
  name: 'filesystem',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
  description: '文件系统访问',
})
```

### 2. 定义权限规则

```typescript
import { PermissionEngine, FileRuleStore } from '@openclaw/suite-permission-hub'
import { PermissionGuard } from '@openclaw/suite-permission-hub'

// 创建规则引擎
const ruleStore = new FileRuleStore('./permissions.json')
const engine = new PermissionEngine({ store: ruleStore })
const guard = new PermissionGuard({ checker: engine })

// 添加规则
await ruleStore.addRule({
  id: 'allow-filesystem-read',
  effect: 'allow',
  priority: 10,
  conditions: {
    subject: { type: 'agent', agentId: 'my-agent' },
    object: { type: 'tool', toolId: 'mcp__filesystem__read_file' },
  },
})

await ruleStore.addRule({
  id: 'ask-network',
  effect: 'ask',
  priority: 10,
  conditions: {
    subject: { type: 'agent', agentId: 'my-agent' },
    object: { type: 'namespace', namespace: 'network' },
  },
})
```

### 3. 创建任务

```typescript
import { TaskManager } from '@openclaw/suite-coordinator-hub'

const taskManager = new TaskManager({
  parentCompletionStrategy: 'all_success',  // 所有子任务成功才算成功
  defaultTimeout: 30000,
  maxConcurrentTasks: 10,
  defaultMaxRetries: 3,
})

// 创建父任务
const parentTask = await taskManager.createTask({
  description: '生成股票分析报告',
  prompt: '分析茅台股票',
  type: 'research',
})

// 分解为子任务
const subtasks = await taskManager.createSubtasks(parentTask.id, [
  { description: '搜索新闻', prompt: '', type: 'research' },
  { description: '读取财报', prompt: '', type: 'research' },
  { description: '生成报告', prompt: '', type: 'implement' },
])

// 订阅事件
taskManager.subscribe('completed', (e) => {
  if (e.type === 'completed') {
    console.log(`任务 ${e.taskId} 完成`)
  }
})

// 启动并执行子任务...
await taskManager.startTask(parentTask.id)
```

## API 参考

### ToolHub

| 类 | 方法 |
|-----|------|
| `ToolRegistry` | `register()`, `unregister()`, `get()`, `list()`, `search()`, `execute()` |
| `ToolExecutor` | `execute()`, `executeMany()` |
| `MemoryToolContextStore` | `save()`, `get()`, `update()`, `delete()` |

### PermissionHub

| 类 | 方法 |
|-----|------|
| `RuleEngine` | `check()`, `checkMany()` |
| `MemoryRuleStore` | `addRule()`, `removeRule()`, `query()` |
| `FileRuleStore` | + `load()`, `save()`, `startWatching()` |
| `PermissionGuard` | `executeWithGuard()` |

### ContextHub

| 类 | 方法 |
|-----|------|
| `ContextManager` | `addEvent()`, `getRecentEvents()`, `compact()`, `getStats()` |
| `DiminishingReturnsDetector` | `attach()`, `on()`, `reset()` |

### MCP Hub

| 类 | 方法 |
|-----|------|
| `MCPServerRegistry` | `register()`, `start()`, `stop()`, `syncServerTools()` |
| `MCPToolMapper` | `map()`, `mapMany()` |

### CoordinatorHub

| 类 | 方法 |
|-----|------|
| `TaskManager` | `createTask()`, `startTask()`, `completeTask()`, `failTask()`, `scheduleRetry()` |
| `PermissionAskHandler` | `requestConfirmation()`, `resolveApproval()` |

## 部署注意事项

### 环境变量

```bash
# 可选配置
DEBUG=true                    # 启用调试日志
TOOL_TIMEOUT_MS=30000        # 工具执行超时
MAX_CONCURRENT_TASKS=10       # 最大并发任务数
```

### 存储配置

- **规则存储**: 开发环境用 `MemoryRuleStore`，生产环境用 `FileRuleStore` 或 `RemoteRuleStore`
- **任务存储**: 实现 `TaskStore` 接口，支持 Redis/数据库
- **上下文存储**: `MemoryToolContextStore` 支持持久化扩展

### 安全建议

- 危险工具（如 shell 删除）默认 deny
- 网络访问工具使用 ask 效果确认
- 生产环境使用 `RemoteRuleStore` 集中管理规则
- MCP 服务器使用可信来源

### 性能调优

- 上下文压缩阈值: `compactionThreshold: 500`
- 递减检测窗口: `windowSize: 10`
- 任务重试延迟: `defaultRetryDelay: 5000` (ms)
- MCP 工具批量映射: `batchSize: 50`

## 集成测试

```bash
# 运行独立集成测试
npx tsx tests/integration/full-scenario.test.ts

# 运行 workspace 测试
pnpm --filter @openclaw/suite-integration-tests test
```

## License

MIT
