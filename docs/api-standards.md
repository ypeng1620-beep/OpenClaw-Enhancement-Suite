# OpenClaw Enhancement Suite — API 标准

> 这是整个套件的基础。所有模块必须遵守这些接口标准。
> 创建日期：2026-04-01 | 版本：0.1.0

---

## 一、核心类型 (core)

### 1.1 Tool（工具）

```typescript
// 所有工具的统一接口
interface Tool {
  // 工具标识
  readonly id: string              // 唯一标识，格式: "toolhub/filesystem/read"
  readonly name: string            // 显示名称: "Read File"
  readonly version: string          // 语义版本: "1.2.0"

  // 归属
  readonly namespace: string       // 命名空间: "filesystem", "network", "custom"
  readonly source: 'builtin' | 'mcp' | 'skill' | 'plugin' | 'user'

  // 描述
  readonly description: string      // 一句话描述
  readonly tags: string[]           // 标签: ["file", "read", "unsafe"]

  // Schema（JSON Schema 格式）
  readonly inputSchema: JSONSchema
  readonly outputSchema?: JSONSchema

  // 能力标记
  readonly capabilities: ToolCapabilities

  // 执行（核心方法）
  execute(input: unknown, context: ToolContext): Promise<ToolResult>

  // =========================================================================
  // 生命周期钩子（可选）
  // =========================================================================
  readonly hooks?: ToolLifecycleHooks
}

/** 工具生命周期钩子 */
interface ToolLifecycleHooks {
  /** 执行前调用 - 可返回修改后的 input 或拒绝执行 */
  readonly beforeExecute?: (
    input: unknown,
    context: ToolContext
  ) => Promise<{ input: unknown } | { reject: true; reason: string }>

  /** 执行后调用 - 可记录日志、修改结果 */
  readonly afterExecute?: (
    input: unknown,
    context: ToolContext,
    result: ToolResult
  ) => Promise<void>

  /** 错误时调用 - 可做错误上报、降级处理 */
  readonly onError?: (
    input: unknown,
    context: ToolContext,
    error: unknown
  ) => Promise<void>
}

/** 工具执行阶段 */
type ToolExecutionPhase =
  | { phase: 'validating'; input: unknown }
  | { phase: 'beforeExecute'; input: unknown }
  | { phase: 'executing'; input: unknown }
  | { phase: 'afterExecute'; input: unknown; result: ToolResult }
  | { phase: 'onError'; input: unknown; error: unknown }
  | { phase: 'completed'; result: ToolResult }
  | { phase: 'timeout'; timeoutMs: number }

// 工具能力标记
interface ToolCapabilities {
  readonly readOnly: boolean                        // 是否只读
  readonly networkAccess: boolean                   // 是否需要网络
  readonly filesystemAccess: boolean                // 是否访问文件系统
  readonly dangerous: boolean                      // 是否危险操作
  readonly longRunning: boolean                    // 是否长时间运行
  readonly streaming: boolean                      // 是否支持流式输出
}

// 工具执行上下文
interface ToolContext {
  readonly sessionId: string
  readonly userId: string
  readonly workspace?: string                       // 工作区根目录
  readonly env: Record<string, string>             // 环境变量
  readonly permissions: PermissionContext           // 权限上下文
}

// 工具执行结果
interface ToolResult {
  readonly success: boolean
  readonly data?: unknown                          // 成功时的数据
  readonly error?: ToolError                       // 失败时的错误
  readonly metadata: ToolResultMetadata              // 元数据
}

interface ToolResultMetadata {
  readonly toolId: string
  readonly durationMs: number
  readonly tokenCost?: number
  readonly cached?: boolean
}

interface ToolError {
  readonly code: string                            // 错误码
  readonly message: string
  readonly recoverable: boolean                     // 是否可恢复
}

// JSON Schema（简化版）
interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array'
  properties?: Record<string, JSONSchema>
  required?: string[]
  description?: string
  default?: unknown
  enum?: unknown[]
}
```

### 1.2 ToolHub（工具注册表）

```typescript
// 工具注册表核心接口
interface ToolRegistry {
  // 注册工具
  register(tool: Tool): Promise<void>
  unregister(toolId: string): Promise<void>

  // 查询
  get(toolId: string): Promise<Tool | undefined>
  list(filter?: ToolFilter): Promise<Tool[]>
  search(query: ToolSearchQuery): Promise<ToolSearchResult[]>

  // 执行
  execute(toolId: string, input: unknown, ctx: ToolContext): Promise<ToolResult>
}

interface ToolFilter {
  namespace?: string
  source?: Tool['source']
  tags?: string[]
  capabilities?: Partial<ToolCapabilities>
}

interface ToolSearchQuery {
  readonly query: string                            // 自然语言查询
  readonly limit?: number                           // 返回数量限制
  readonly requireTags?: string[]                   // 必须包含的标签
}

interface ToolSearchResult {
  readonly tool: Tool
  readonly score: number                            // 相关性分数 0-1
  readonly matchedFields: string[]                 // 匹配的字段
}

// 工具发现（从各种来源）
interface ToolDiscoverer {
  readonly source: 'npm' | 'github' | 'mcp' | 'local'
  discover(): Promise<Tool[]>
}

interface ToolInstaller {
  install(source: string, options?: InstallOptions): Promise<Tool>
  uninstall(toolId: string): Promise<void>
  update(toolId: string): Promise<Tool>
}

interface InstallOptions {
  readonly version?: string
  readonly targetDir?: string
  readonly config?: Record<string, unknown>
}
```

---

## 二、权限规则引擎 (permission-hub)

### 2.1 权限规则 DSL

```typescript
// 权限规则
interface PermissionRule {
  readonly id: string                              // 规则 ID
  readonly priority: number                       // 优先级（数字越大优先级越高）
  readonly effect: 'allow' | 'deny' | 'ask'      // 效果

  // 匹配条件
  readonly subject: SubjectMatcher                 // 谁
  readonly object: ObjectMatcher                   // 操作什么
  readonly action?: ActionMatcher                  // 做什么操作
}

type SubjectMatcher =
  | { type: 'user'; userId: string }
  | { type: 'agent'; agentId?: string }
  | { type: 'role'; role: string }
  | { type: 'group'; groupId: string }
  | { type: '*' }                                // 所有人

type ObjectMatcher =
  | { type: 'tool'; toolId: string }
  | { type: 'namespace'; namespace: string }
  | { type: 'tag'; tag: string }
  | { type: 'pattern'; pattern: string }         // Glob 模式

type ActionMatcher =
  | { type: 'call'; toolId: string; args?: PatternMatcher }
  | { type: '*' }

type PatternMatcher =
  | { type: 'exact'; value: unknown }
  | { type: 'glob'; pattern: string }            // 如 "*.ts"
  | { type: 'regex'; pattern: string }           // 正则

// 规则示例
const examples: PermissionRule[] = [
  // 例子1: 承财只能调用股票相关工具
  {
    id: 'rule-1',
    priority: 10,
    effect: 'allow',
    subject: { type: 'agent', agentId: 'chengcai' },
    object: { type: 'tag', tag: 'stock' }
  },
  // 例子2: 所有 Agent 不能删除文件
  {
    id: 'rule-2',
    priority: 5,
    effect: 'deny',
    subject: { type: '*' },
    object: { type: 'tool', toolId: 'filesystem/delete' },
    action: { type: '*' }
  },
  // 例子3: 调用微信推送前需要确认
  {
    id: 'rule-3',
    priority: 8,
    effect: 'ask',
    subject: { type: '*' },
    object: { type: 'tool', toolId: 'wechat/send' }
  }
]
```

### 2.2 权限检查器

```typescript
interface PermissionChecker {
  // 检查是否允许执行
  check(request: PermissionRequest): Promise<PermissionDecision>

  // 批量检查
  checkMany(requests: PermissionRequest[]): Promise<PermissionDecision[]>

  // 模拟检查（不执行）
  simulate(request: PermissionRequest): Promise<PermissionSimulation>
}

/** 规则存储接口 - 支持动态更新和热加载 */
interface RuleStore {
  // 获取所有规则（按优先级排序）
  getRules(): Promise<PermissionRule[]>

  // 更新规则（全量替换）
  updateRules(rules: PermissionRule[]): Promise<void>

  // 增量添加规则
  addRule(rule: PermissionRule): Promise<void>

  // 移除规则
  removeRule(ruleId: string): Promise<void>

  // 监听规则变化（用于热加载）
  watch(callback: (rules: PermissionRule[]) => void): () => void

  // 获取规则版本（用于缓存验证）
  getVersion(): string
}

/** 规则存储实现选项 */
interface RuleStoreOptions {
  /** 数据来源 */
  source: 'memory' | 'file' | 'remote'

  /** 文件路径（source=file 时） */
  filePath?: string

  /** 远程配置中心 URL（source=remote 时） */
  remoteUrl?: string

  /** 轮询间隔（source=remote 时） */
  pollIntervalMs?: number

  /** 初始规则 */
  initialRules?: PermissionRule[]
}

interface PermissionRequest {
  readonly subject: {
    userId?: string
    agentId?: string
    role?: string
  }
  readonly object: {
    toolId: string
    input?: unknown
  }
  readonly sessionId?: string
}

type PermissionDecision =
  | { effect: 'allow' }
  | { effect: 'deny'; reason: string }
  | { effect: 'ask'; reason: string }

interface PermissionSimulation {
  readonly wouldBeAllowed: boolean
  readonly matchedRules: string[]               // 匹配的规则 ID
  readonly blockedBy?: string                     // 被哪个规则阻止
}
```

### 2.3 权限上下文

```typescript
// 权限评估时的上下文
interface PermissionContext {
  readonly sessionId: string
  readonly userId: string
  readonly agentId?: string
  readonly roles: string[]
  readonly groups: string[]
  readonly sessionAge?: number                    // 会话时长（秒）
  readonly requestCount?: number                 // 本会话请求数
  readonly timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night'
}
```

---

## 三、上下文压缩引擎 (context-hub)

### 3.1 上下文事件

```typescript
// 上下文相关的事件
type ContextEvent =
  | MessageEvent
  | ToolCallEvent
  | ToolResultEvent
  | MemoryEvent
  | CompactEvent

interface MessageEvent {
  readonly type: 'message'
  readonly id: string
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
  readonly timestamp: number
}

interface ToolCallEvent {
  readonly type: 'tool_call'
  readonly id: string
  readonly toolId: string
  readonly input: unknown
  readonly timestamp: number
}

interface ToolResultEvent {
  readonly type: 'tool_result'
  readonly id: string
  readonly callId: string
  readonly success: boolean
  readonly result?: unknown
  readonly durationMs: number
}

interface MemoryEvent {
  readonly type: 'memory'
  readonly action: 'read' | 'write' | 'forget'
  readonly content: unknown
}

interface CompactEvent {
  readonly type: 'compact'
  readonly strategy: 'micro' | 'auto' | 'manual'
  readonly inputEvents: string[]                  // 被压缩的事件 ID
  readonly outputSummary: string                   // 生成的摘要
}
```

### 3.2 上下文管理器

```typescript
interface ContextManager {
  // 添加事件
  add(event: ContextEvent): void

  // 获取上下文
  getContext(options?: GetContextOptions): Promise<ContextSnapshot>

  // 手动压缩
  compact(strategy: 'micro' | 'manual'): Promise<CompactResult>

  // 自动压缩检查
  shouldAutoCompact(): boolean

  // 获取统计
  getStats(): ContextStats
}

interface GetContextOptions {
  readonly maxTokens?: number
  readonly includeTypes?: ContextEvent['type'][]
  readonly excludeTypes?: ContextEvent['type'][]
}

interface ContextSnapshot {
  readonly events: ContextEvent[]
  readonly totalTokens: number
  readonly tokenLimit: number
  readonly usagePercent: number
}

interface CompactResult {
  readonly originalCount: number                  // 原始事件数
  readonly compactedCount: number                // 压缩后事件数
  readonly savedTokens: number
  readonly summary: string
}

interface ContextStats {
  readonly eventCount: number
  readonly totalTokens: number
  readonly tokenLimit: number
  readonly usagePercent: number
  readonly oldestEventAge?: number               // 最老事件的年龄（秒）
}
```

### 3.3 递减收益检测

```typescript
// 递减收益检测器
interface DiminishingReturnsDetector {
  // 记录一次模型调用
  recordCall(tokensUsed: number): void

  // 检查是否应该停止
  shouldStop(): DiminishingReturnsDecision

  // 重置
  reset(): void
}

interface DiminishingReturnsDecision {
  readonly shouldContinue: boolean
  readonly continuationCount: number              // 连续调用次数
  readonly avgTokensPerCall: number
  readonly diminishingDetected: boolean
  readonly message?: string                     // 给用户的提示
}

// 默认配置
const DEFAULT_DETECTOR_CONFIG = {
  maxContinuations: 3,                          // 最多连续 3 次
  minTokensPerCall: 500,                        // 低于此值认为递减
  stopThreshold: 0.1,                           // 使用率低于 10% 时强制停止
  tokenLimit: 100000                            // Token 上限
}

// 可配置的检测器
interface ConfigurableDetectorOptions {
  /** 滑动窗口大小 - 监控最近 N 次调用 */
  readonly windowSize?: number

  /** 递减阈值 - 最近 N 次平均 token 低于此值触发递减 */
  readonly threshold?: number

  /** 停止阈值 - 单次使用率低于此值强制停止 */
  readonly stopThreshold?: number

  /** Token 上限 */
  readonly tokenLimit?: number

  /** 递减检测模式 */
  readonly mode?: 'average' | 'latest' | 'slope'
  // - average: 最近 N 次平均 token
  // - latest: 只看最新一次
  // - slope: 检测下降斜率
}
```

---

## 四、MCP Hub (mcp-hub)

### 4.1 MCP 工具映射

```typescript
// MCP 工具 → OpenClaw Tool 的映射
interface MCPToolMapper {
  // 将 MCP 工具转换为 OpenClaw Tool
  map(mcpTool: MCPTool, serverName: string): Tool

  // 批量映射（支持分页，避免大列表性能问题）
  mapMany(
    mcpTools: MCPTool[],
    serverName: string,
    options?: MapManyOptions
  ): Promise<Tool[]>
}

interface MapManyOptions {
  /** 每批处理数量 - 控制单次转换的工具数量 */
  readonly batchSize?: number

  /** 是否并行处理 - false 时串行处理 */
  readonly parallel?: boolean

  /** 进度回调 */
  readonly onProgress?: (completed: number, total: number) => void
}

// MCP 服务器配置
interface MCPServerConfig {
  readonly name: string
  readonly type: 'stdio' | 'sse' | 'websocket'
  readonly command: string
  readonly args?: string[]
  readonly env?: Record<string, string>
  readonly tools?: string[]                     // 白名单工具
  readonly disabledTools?: string[]               // 黑名单工具
}

// MCP 连接管理器
interface MCPConnectionManager {
  // 连接服务器
  connect(config: MCPServerConfig): Promise<MCPServer>

  // 断开连接
  disconnect(serverName: string): Promise<void>

  // 获取工具
  getTools(serverName: string): Promise<Tool[]>

  // 调用工具
  callTool(serverName: string, toolName: string, args: unknown): Promise<unknown>
}
```

### 4.2 MCP 服务器注册表

```typescript
interface MCPServerRegistry {
  // 注册服务器
  register(config: MCPServerConfig): Promise<void>

  // 列出服务器
  list(): Promise<MCPServer[]>

  // 获取服务器
  get(name: string): Promise<MCPServer | undefined>

  // 启动服务器
  start(name: string): Promise<void>

  // 停止服务器
  stop(name: string): Promise<void>

  // 健康检查
  healthCheck(name: string): Promise<HealthStatus>
}

interface MCPServer {
  readonly name: string
  readonly config: MCPServerConfig
  readonly status: 'connecting' | 'connected' | 'disconnected' | 'error'
  readonly tools: Tool[]
  readonly uptime?: number                      // 运行时间（秒）
}

interface HealthStatus {
  readonly healthy: boolean
  readonly latencyMs?: number
  readonly error?: string
}
```

---

## 五、Agent 协调 (coordinator-hub)

### 5.1 Agent 消息格式

```typescript
// Agent 之间的消息
interface AgentMessage {
  readonly id: string
  readonly type: AgentMessageType
  readonly from: AgentId
  readonly to: AgentId | '*'
  readonly timestamp: number
  readonly payload: unknown
}

type AgentMessageType =
  | 'task:submit'       // 提交任务
  | 'task:result'       // 返回结果
  | 'task:progress'      // 进度更新
  | 'task:cancel'       // 取消任务
  | 'task:heartbeat'    // 心跳
  | 'message:send'      // 发送消息
  | 'message:reply'     // 回复消息

interface AgentId {
  readonly type: 'user' | 'agent' | 'system'
  readonly id: string
}

// 任务消息
interface TaskMessage extends AgentMessage {
  readonly type: 'task:submit' | 'task:result' | 'task:progress'
  readonly payload: TaskPayload
}

interface TaskPayload {
  readonly taskId: string
  readonly description: string
  readonly prompt: string
  readonly tools?: string[]                     // 允许使用的工具
  readonly timeout?: number                     // 超时（秒）
  readonly priority?: number                    // 优先级
}
```

### 5.2 任务状态

```typescript
// 任务状态机
type TaskStatus =
  | { state: 'pending' }
  | { state: 'running'; startedAt: number }
  | { state: 'completed'; result: unknown; completedAt: number }
  | { state: 'failed'; error: string; failedAt: number }
  | { state: 'cancelled'; cancelledAt: number }
  | { state: 'timeout'; timedOutAt: number }

// 任务定义
interface Task {
  readonly id: string
  readonly type: 'research' | 'implement' | 'verify' | 'general'
  readonly description: string
  readonly prompt: string
  readonly assignedAgent?: AgentId
  readonly status: TaskStatus
  readonly parentTaskId?: string                 // 父任务（用于分解）
  readonly childTaskIds?: string[]               // 子任务
  readonly createdAt: number
  readonly updatedAt: number
}
```

### 5.3 协调器接口

```typescript
interface Coordinator {
  // 提交任务
  submitTask(task: TaskSubmission): Promise<Task>

  // 获取任务状态
  getTask(taskId: string): Promise<Task | undefined>

  // 列出任务
  listTasks(filter?: TaskFilter): Promise<Task[]>

  // 取消任务
  cancelTask(taskId: string): Promise<void>

  // 发送消息给 Agent
  sendMessage(to: AgentId, message: unknown): Promise<void>

  // 订阅任务更新
  subscribe(taskId: string, handler: TaskHandler): Unsubscribe
}

/** 任务持久化存储接口（可选实现）
 *
 * 注意：任务状态默认存储在内存中。
 * 如果 Agent 需要长时间运行（例如等待人工审批），
 * 或需要跨进程/跨机器访问，请接入 TaskStore 实现。
 *
 * 支持的存储后端：
 * - Redis: 适合分布式场景
 * - SQLite: 适合单机轻量存储
 * - PostgreSQL: 适合生产环境
 */
interface TaskStore {
  // 保存任务
  save(task: Task): Promise<void>

  // 获取任务
  get(taskId: string): Promise<Task | undefined>

  // 查询任务列表
  query(filter?: TaskFilter): Promise<Task[]>

  // 更新任务状态
  updateStatus(taskId: string, status: TaskStatus): Promise<void>

  // 删除任务
  delete(taskId: string): Promise<void>

  // 监听变化（用于多实例同步）
  watch(handler: (task: Task) => void): () => void
}

interface TaskSubmission {
  readonly description: string
  readonly prompt: string
  readonly type?: Task['type']
  readonly tools?: string[]
  readonly timeout?: number
  readonly parentTaskId?: string
}

interface TaskFilter {
  readonly status?: TaskStatus['state']
  readonly assignedAgent?: AgentId
  readonly type?: Task['type']
  readonly parentTaskId?: string
}

interface TaskHandler {
  (event: TaskEvent): void
}

type TaskEvent =
  | { type: 'status_change'; taskId: string; status: TaskStatus }
  | { type: 'progress'; taskId: string; progress: number; message?: string }
  | { type: 'message'; taskId: string; from: AgentId; content: unknown }
```

---

## 六、统一 SDK 入口 (core)

### 6.1 Suite 配置

```typescript
interface SuiteConfig {
  // 工具配置
  readonly tools?: {
    readonly registry?: string                    // 工具目录
    readonly discoverFrom?: string[]             // 发现来源
  }

  // 权限配置
  readonly permissions?: {
    readonly rules: PermissionRule[]
    readonly defaultEffect: 'allow' | 'deny' | 'ask'
  }

  // 上下文配置
  readonly context?: {
    readonly maxTokens?: number                 // 最大 token 数
    readonly autoCompactThreshold?: number      // 自动压缩阈值
    readonly diminishingReturnsConfig?: Partial<typeof DEFAULT_DETECTOR_CONFIG>
  }

  // MCP 配置
  readonly mcp?: {
    readonly servers: MCPServerConfig[]
  }

  // Coordinator 配置
  readonly coordinator?: {
    readonly maxConcurrentTasks?: number
    readonly defaultTimeout?: number
  }
}
```

### 6.2 Suite 初始化

```typescript
// 主入口
interface OpenClawSuite {
  readonly toolHub: ToolRegistry
  readonly permissionHub: PermissionChecker
  readonly contextHub: ContextManager
  readonly mcpHub: MCPServerRegistry
  readonly coordinator: Coordinator

  // 生命周期
  initialize(config: SuiteConfig): Promise<void>
  shutdown(): Promise<void>

  // 工具执行（带完整流程）
  executeTool(toolId: string, input: unknown): Promise<ToolResult>
}

// 初始化示例
async function main() {
  const suite = await OpenClawSuite.init({
    tools: {
      registry: './tools',
      discoverFrom: ['./skills', './plugins']
    },
    permissions: {
      rules: await loadRules('./permissions.json'),
      defaultEffect: 'deny'
    },
    context: {
      maxTokens: 100000,
      autoCompactThreshold: 0.8
    }
  })

  // 使用
  const result = await suite.executeTool('akshare/stock_daily', {
    code: '000001'
  })
}
```

---

## 七、错误码规范

### 7.1 工具错误码

```typescript
const TOOL_ERROR_CODES = {
  // 执行错误 (E1xxx)
  'E1001': 'TOOL_NOT_FOUND',
  'E1002': 'TOOL_DISABLED',
  'E1003': 'TOOL_TIMEOUT',
  'E1004': 'TOOL_EXECUTION_FAILED',

  // 权限错误 (E2xxx)
  'E2001': 'PERMISSION_DENIED',
  'E2002': 'PERMISSION_ASK_TIMEOUT',
  'E2003': 'INVALID_PERMISSION_RULE',

  // 上下文错误 (E3xxx)
  'E3001': 'CONTEXT_TOKEN_LIMIT',
  'E3002': 'CONTEXT_COMPACT_FAILED',
  'E3003': 'CONTEXT_SESSION_NOT_FOUND',

  // MCP 错误 (E4xxx)
  'E4001': 'MCP_SERVER_NOT_FOUND',
  'E4002': 'MCP_CONNECTION_FAILED',
  'E4003': 'MCP_TOOL_NOT_FOUND',

  // 协调器错误 (E5xxx)
  'E5001': 'TASK_NOT_FOUND',
  'E5002': 'TASK_TIMEOUT',
  'E5003': 'AGENT_UNAVAILABLE',
  'E5004': 'COORDINATION_FAILED'
} as const
```

---

## 八、版本兼容性

### 8.1 接口版本策略

```typescript
// 主版本号变更 = 不兼容
// 次版本号变更 = 向后兼容的功能添加
// 补丁版本号变更 = 向后兼容的问题修复

interface VersionInfo {
  readonly api: string                           // 当前 API 版本
  readonly minSupportedApi: string               // 最低支持的 API 版本
}

// 兼容性检查
function checkCompatibility(local: VersionInfo, remote: VersionInfo): boolean {
  const [localMajor] = local.api.split('.').map(Number)
  const [remoteMajor] = remote.api.split('.').map(Number)
  return localMajor === remoteMajor
}
```

---

## 九、实现状态追踪

| 接口 | 包 | 状态 | 实现文件 |
|------|-----|------|----------|
| `Tool` | core | ✅ 定义完成 | `packages/core/src/types/tool.ts` |
| `ToolLifecycleHooks` | core | ✅ 新增 | `packages/core/src/types/tool.ts` |
| `ToolRegistry` | core | ✅ 定义完成 | `packages/core/src/types/tool.ts` |
| `PermissionRule` | core | ✅ 定义完成 | `packages/core/src/types/permission.ts` |
| `PermissionChecker` | core | ✅ 定义完成 | `packages/core/src/types/permission.ts` |
| `RuleStore` | core | ✅ 新增 | `docs/api-standards.md` |
| `ContextEvent` | core | ✅ 定义完成 | `packages/core/src/types/context.ts` |
| `ContextManager` | core | ✅ 定义完成 | `packages/core/src/types/context.ts` |
| `DiminishingReturnsDetector` | core | ✅ 已增强 | `packages/core/src/types/context.ts` |

### 未来增强点（v0.2）

| 增强项 | 说明 | 优先级 |
|--------|------|--------|
| `ToolContext.signal` | 支持 AbortSignal，工具可感知取消 | 中 |
| 工具执行超时后清理 | 部分工具（文件 I/O）无法响应取消，需后续处理 | 低 |
| `MCPToolMapper` | core | ✅ 已增强 | `packages/core/src/types/mcp.ts` |
| `MapManyOptions` | core | ✅ 新增 | `docs/api-standards.md` |
| `AgentMessage` | core | ✅ 定义完成 | `packages/core/src/types/agent.ts` |
| `Coordinator` | core | ✅ 定义完成 | `packages/core/src/types/agent.ts` |
| `TaskStore` | core | ✅ 新增 | `docs/api-standards.md` |
| `OpenClawSuite` | core | ✅ 定义完成 | `packages/core/src/index.ts` |

> 状态说明：✅ 定义完成 = 接口已锁定，开始写实现  
> ✅ 已增强 = 在老爷建议下做了增强  
> ✅ 新增 = 老爷建议新增的接口  
> 🔨 设计中 = 接口还在讨论中
