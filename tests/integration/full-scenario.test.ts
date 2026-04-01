/**
 * 独立集成测试 - 不依赖 workspace 编译
 *
 * 使用 tsx 直接运行 TypeScript
 *
 * 运行：
 *   npx tsx tests/integration/full-scenario.test.ts
 */

import { EventEmitter } from 'events'

// ============================================================================
// 日志工具
// ============================================================================

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const BLUE = '\x1b[34m'
const RED = '\x1b[31m'
const CYAN = '\x1b[36m'
const GRAY = '\x1b[90m'

function log(title: string, ...args: any[]) {
  console.log(`${CYAN}[TEST]${RESET} ${BOLD}${title}${RESET}`, ...args)
}

function logStep(step: string, ...args: any[]) {
  console.log(`\n${BLUE}▶ STEP ${step}${RESET} ${args.join(' ')}`)
}

function logEvent(event: string, ...args: any[]) {
  console.log(`  ${GRAY}  ↳${RESET} ${YELLOW}${event}${RESET}`, ...args)
}

function logSuccess(...args: any[]) {
  console.log(`  ${GREEN}  ✅${RESET}`, ...args)
}

function logError(...args: any[]) {
  console.log(`  ${RED}  ❌${RESET}`, ...args)
}

function logSection(title: string) {
  console.log(`\n${BOLD}${'='.repeat(60)}${RESET}`)
  console.log(`${BOLD}${BLUE}  ${title}${RESET}`)
  console.log(`${BOLD}${'='.repeat(60)}${RESET}\n`)
}

// ============================================================================
// 类型定义（从 suite-core 复制，避免构建依赖）
// ============================================================================

type RuleEffect = 'allow' | 'deny' | 'ask'

type SubjectMatcher =
  | { type: 'user'; userId: string }
  | { type: 'agent'; agentId?: string }
  | { type: 'role'; role: string }
  | { type: 'group'; groupId: string }
  | { type: '*' }

type ObjectMatcher =
  | { type: '*' }
  | { type: 'tool'; toolId: string }
  | { type: 'namespace'; namespace: string }
  | { type: 'tag'; tag: string }
  | { type: 'pattern'; pattern: string }

interface PermissionRule {
  id: string
  priority: number
  effect: RuleEffect
  subject: SubjectMatcher
  object: ObjectMatcher
}

interface Tool {
  id: string
  name: string
  version: string
  namespace: string
  source: string
  description: string
  tags?: string[]
  inputSchema: any
  outputSchema?: any
  capabilities?: any
  execute: (input: any, context: any) => Promise<any>
}

interface Task {
  id: string
  type: string
  description: string
  prompt?: string
  tools?: string[]
  timeout: number
  parentTaskId?: string
  status: { state: string; result?: any; error?: string; startedAt?: number; completedAt?: number }
  createdAt: number
  updatedAt: number
  retryCount?: number
  maxRetries?: number
  childTaskIds?: string[]
  assignedAgent?: any
}

type ContextEventType =
  | 'user_message'
  | 'assistant_message'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'system'

interface ContextEvent {
  type: ContextEventType
  timestamp: number
  data: any
}

// ============================================================================
// Mock 组件实现
// ============================================================================

// ---- Mock ToolRegistry ----
class MockToolRegistry {
  private tools = new Map<string, Tool>()

  async register(tool: Tool): Promise<void> {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool ${tool.id} already registered`)
    }
    this.tools.set(tool.id, tool)
  }

  async unregister(toolId: string): Promise<void> {
    this.tools.delete(toolId)
  }

  async get(toolId: string): Promise<Tool | undefined> {
    return this.tools.get(toolId)
  }

  async list(): Promise<Tool[]> {
    return Array.from(this.tools.values())
  }

  async search(query: string): Promise<Tool[]> {
    const q = query.toLowerCase()
    return Array.from(this.tools.values()).filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(q))
    )
  }
}

// ---- Mock PermissionEngine ----
class MockPermissionEngine {
  private rules: PermissionRule[] = []

  addRule(rule: PermissionRule): void {
    this.rules.push(rule)
    this.rules.sort((a, b) => b.priority - a.priority)
  }

  async check(context: {
    subject: { userId?: string; agentId?: string; role?: string }
    object: { toolId: string }
  }): Promise<{ effect: RuleEffect; reason?: string }> {
    for (const rule of this.rules) {
      if (this.matchSubject(rule.subject, context.subject) && this.matchObject(rule.object, context.object.toolId)) {
        return { effect: rule.effect, reason: rule.description }
      }
    }
    return { effect: 'deny' } // 默认拒绝
  }

  private matchSubject(rule: SubjectMatcher, ctx: any): boolean {
    if (rule.type === '*') return true
    if (rule.type === 'user') return ctx.userId === rule.userId
    if (rule.type === 'agent') return !rule.agentId || ctx.agentId === rule.agentId
    if (rule.type === 'role') return ctx.role === rule.role
    return false
  }

  private matchObject(rule: ObjectMatcher, toolId: string): boolean {
    if (rule.type === '*') return true
    if (rule.type === 'tool') return rule.toolId === toolId
    if (rule.type === 'namespace') return toolId.startsWith(`${rule.namespace}/`)
    if (rule.type === 'tag') return toolId.includes(rule.tag)
    if (rule.type === 'pattern') {
      const regex = new RegExp(rule.pattern.replace(/\*/g, '.*'))
      return regex.test(toolId)
    }
    return false
  }
}

// ---- Mock ContextManager ----
class MockContextManager extends EventEmitter {
  private events: ContextEvent[] = []
  readonly maxEvents: number
  readonly compactionThreshold: number
  private detectors: any[] = []

  constructor(options: { maxEvents?: number; compactionThreshold?: number } = {}) {
    super()
    this.maxEvents = options.maxEvents ?? 1000
    this.compactionThreshold = options.compactionThreshold ?? 100
  }

  addEvent(event: Omit<ContextEvent, 'timestamp'>): void {
    const evt: ContextEvent = { ...event, timestamp: Date.now() }
    this.events.push(evt)

    // 超过阈值触发压缩
    if (this.events.length > this.compactionThreshold) {
      this.emit('compact_start')
      this.events = this.events.slice(-this.maxEvents)
      this.emit('compact_complete')
    }

    this.emit('event_added', evt)
  }

  getRecentEvents(count: number): ContextEvent[] {
    return this.events.slice(-count)
  }

  getStats() {
    const byType: Record<string, number> = {}
    for (const e of this.events) {
      byType[e.type] = (byType[e.type] || 0) + 1
    }
    return { totalEvents: this.events.length, byType }
  }

  addDetector(detector: any): void {
    this.detectors.push(detector)
    if (detector.attach) detector.attach(this)
  }
}

// ---- Mock DiminishingReturnsDetector ----
class MockDiminishingReturnsDetector extends EventEmitter {
  private windowSize: number
  private threshold: number
  private window: any[] = []
  private cooldown = false
  private cooldownMs: number

  constructor(options: { windowSize?: number; threshold?: number; cooldownMs?: number } = {}) {
    super()
    this.windowSize = options.windowSize ?? 10
    this.threshold = options.threshold ?? 0.15
    this.cooldownMs = options.cooldownMs ?? 50
  }

  attach(contextManager: MockContextManager): void {
    contextManager.on('event_added', (event: ContextEvent) => {
      if (event.type === 'tool_result') {
        this.processEvent(event)
      }
    })
  }

  private processEvent(event: ContextEvent): void {
    if (this.cooldown) return

    this.window.push(event.data?.outputSize ?? 1)

    if (this.window.length > this.windowSize) {
      this.window.shift()
    }

    if (this.window.length >= this.windowSize) {
      const firstHalf = this.window.slice(0, this.windowSize / 2)
      const secondHalf = this.window.slice(this.windowSize / 2)
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length

      if (firstAvg > 0 && (firstAvg - secondAvg) / firstAvg > this.threshold) {
        this.emit('diminishing_returns', {
          reason: `连续收益递减: 前半均值为 ${firstAvg.toFixed(2)}, 后半为 ${secondAvg.toFixed(2)}`,
          dropRate: ((firstAvg - secondAvg) / firstAvg).toFixed(2),
        })
        this.cooldown = true
        setTimeout(() => { this.cooldown = false; this.emit('reset') }, this.cooldownMs)
      }
    }
  }
}

// ---- Mock MCPServer ----
class MockMCPServer {
  readonly name: string
  readonly tools: Array<{ name: string; description: string; inputSchema: any }>

  constructor(name: string, tools: Array<{ name: string; description: string; inputSchema: any }>) {
    this.name = name
    this.tools = tools
  }

  async execute(toolName: string, input: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'get_weather': {
        const city = input.city as string
        const weatherMap: Record<string, string> = {
          北京: '晴 26°C', 上海: '多云 24°C', 深圳: '雷阵雨 28°C',
        }
        return { city, weather: weatherMap[city] || '晴 25°C', timestamp: Date.now() }
      }
      case 'send_email':
        return { success: true, messageId: `msg-${Date.now()}`, to: input.to, subject: input.subject }
      case 'calculate': {
        try {
          const expr = input.expression as string
          if (!/^[\d+\-*/.() ]+$/.test(expr)) throw new Error('Invalid expression')
          const result = Function(`"use strict"; return (${expr})`)()
          return { expression: expr, result, timestamp: Date.now() }
        } catch (err) {
          return { error: (err as Error).message }
        }
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`)
    }
  }
}

// ---- Mock TaskManager ----
class MockTaskManager extends EventEmitter {
  private tasks = new Map<string, Task>()
  private readonly defaultTimeout: number
  private readonly parentCompletionStrategy: string
  private readonly defaultMaxRetries: number
  private readonly defaultRetryDelay: number
  private activeTimeouts = new Map<string, NodeJS.Timeout>()

  constructor(options: {
    parentCompletionStrategy?: string
    defaultTimeout?: number
    defaultMaxRetries?: number
    defaultRetryDelay?: number
  } = {}) {
    super()
    this.parentCompletionStrategy = options.parentCompletionStrategy ?? 'all_success'
    this.defaultTimeout = options.defaultTimeout ?? 30000
    this.defaultMaxRetries = options.defaultMaxRetries ?? 3
    this.defaultRetryDelay = options.defaultRetryDelay ?? 100
  }

  async createTask(submission: {
    description: string
    prompt?: string
    type?: string
    tools?: string[]
    timeout?: number
    parentTaskId?: string
  }): Promise<Task> {
    const now = Date.now()
    const task: Task = {
      id: `task-${now}-${Math.random().toString(36).slice(2, 8)}`,
      type: submission.type || 'general',
      description: submission.description,
      prompt: submission.prompt,
      tools: submission.tools,
      timeout: submission.timeout || this.defaultTimeout,
      parentTaskId: submission.parentTaskId,
      status: { state: 'pending' },
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      maxRetries: this.defaultMaxRetries,
      childTaskIds: [],
    }

    if (submission.parentTaskId) {
      const parent = this.tasks.get(submission.parentTaskId)
      if (parent) {
        parent.childTaskIds = [...(parent.childTaskIds || []), task.id]
      }
    }

    this.tasks.set(task.id, task)
    this.emit('created', { type: 'created', task })
    return task
  }

  async createSubtasks(parentId: string, submissions: any[]): Promise<Task[]> {
    const subtasks = []
    for (const sub of submissions) {
      subtasks.push(await this.createTask({ ...sub, parentTaskId: parentId }))
    }
    return subtasks
  }

  async getTask(taskId: string): Promise<Task | undefined> {
    return this.tasks.get(taskId)
  }

  async startTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)

    task.status = { state: 'running', startedAt: Date.now() }
    this.emit('started', { type: 'started', taskId })

    // 设置超时
    const handle = setTimeout(() => {
      task.status = { state: 'timeout', timedOutAt: Date.now() }
      this.emit('timeout', { type: 'timeout', taskId })
    }, task.timeout)
    this.activeTimeouts.set(taskId, handle)
  }

  async completeTask(taskId: string, result: any): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)

    clearTimeout(this.activeTimeouts.get(taskId))
    this.activeTimeouts.delete(taskId)

    task.status = { state: 'completed', result, completedAt: Date.now() }
    this.emit('completed', { type: 'completed', taskId, result })

    // 检查父任务
    if (task.parentTaskId) {
      await this.checkParentCompletion(task.parentTaskId)
    }
  }

  async failTask(taskId: string, error: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)

    clearTimeout(this.activeTimeouts.get(taskId))
    this.activeTimeouts.delete(taskId)

    task.status = { state: 'failed', error, failedAt: Date.now() }
    this.emit('failed', { type: 'failed', taskId, error })

    // 向下传播取消子任务
    if (task.childTaskIds?.length) {
      for (const childId of task.childTaskIds) {
        try { await this.cancelTask(childId) } catch {}
      }
    }

    // 向上传播
    if (task.parentTaskId && this.parentCompletionStrategy === 'all_success') {
      await this.failTask(task.parentTaskId, `Child failed: ${error}`)
    }
  }

  async cancelTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return
    if (task.status.state === 'completed' || task.status.state === 'cancelled') return

    clearTimeout(this.activeTimeouts.get(taskId))
    this.activeTimeouts.delete(taskId)

    task.status = { state: 'cancelled', cancelledAt: Date.now() }
    this.emit('cancelled', { type: 'cancelled', taskId })

    if (task.childTaskIds?.length) {
      for (const childId of task.childTaskIds) {
        try { await this.cancelTask(childId) } catch {}
      }
    }
  }

  async updateProgress(taskId: string, progress: number, message?: string): Promise<void> {
    this.emit('progress', { type: 'progress', taskId, progress, message })
  }

  async scheduleRetry(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.retryCount = (task.retryCount || 0) + 1
    if (task.retryCount > (task.maxRetries || this.defaultMaxRetries)) {
      await this.failTask(taskId, `Max retries exceeded`)
      return
    }

    this.emit('retry_scheduled', { type: 'retry_scheduled', taskId, attempt: task.retryCount })

    setTimeout(async () => {
      this.emit('retry_executed', { type: 'retry_executed', taskId, attempt: task.retryCount })
      task.status = { state: 'pending' }
      await this.startTask(taskId)
    }, this.defaultRetryDelay)
  }

  private async checkParentCompletion(parentId: string): Promise<void> {
    const parent = this.tasks.get(parentId)
    if (!parent?.childTaskIds?.length) return

    const children = parent.childTaskIds.map((id) => this.tasks.get(id)).filter(Boolean) as Task[]
    const states = children.map((c) => c.status.state)

    if (this.parentCompletionStrategy === 'all_success') {
      const allSuccess = states.every((s) => s === 'completed')
      const allDone = states.every((s) => ['completed', 'cancelled', 'failed'].includes(s))

      if (allSuccess) {
        const results = children.filter((c) => c.status.state === 'completed').map((c) => c.status.result)
        parent.status = { state: 'completed', result: results, completedAt: Date.now() }
        this.emit('completed', { type: 'completed', taskId: parent.id, result: results })
      } else if (allDone) {
        const errors = children.filter((c) => c.status.state === 'failed').map((c) => c.status.error).join('; ')
        parent.status = { state: 'failed', error: `Children failed: ${errors}`, failedAt: Date.now() }
        this.emit('failed', { type: 'failed', taskId: parent.id, error: errors })
      }
    } else if (this.parentCompletionStrategy === 'any_success') {
      const anySuccess = states.some((s) => s === 'completed')
      const allDone = states.every((s) => ['completed', 'cancelled', 'failed'].includes(s))

      if (anySuccess) {
        const results = children.filter((c) => c.status.state === 'completed').map((c) => c.status.result)
        parent.status = { state: 'completed', result: results, completedAt: Date.now() }
        this.emit('completed', { type: 'completed', taskId: parent.id, result: results })
      } else if (allDone) {
        parent.status = { state: 'failed', error: 'All children failed', failedAt: Date.now() }
        this.emit('failed', { type: 'failed', taskId: parent.id, error: 'All children failed' })
      }
    }
  }

  subscribe(eventType: string, handler: any): () => void {
    this.on(eventType, handler)
    return () => this.off(eventType, handler)
  }

  destroy(): void {
    for (const [, handle] of this.activeTimeouts) clearTimeout(handle)
    this.activeTimeouts.clear()
    this.removeAllListeners()
  }
}

// ============================================================================
// Mock MCPToolMapper ----
function mapMCPToolsToTools(mcpTools: any[], serverName: string, options: { namespacePrefix?: string; includeServerName?: boolean } = {}): { tools: Tool[]; errors: string[] } {
  const prefix = options.namespacePrefix || 'mcp'
  const tools: Tool[] = []
  const errors: string[] = []

  for (const mcpTool of mcpTools) {
    try {
      const toolId = options.includeServerName !== false
        ? `${prefix}__${serverName}__${mcpTool.name}`
        : `${prefix}__${mcpTool.name}`

      tools.push({
        id: toolId,
        name: mcpTool.name,
        version: '1.0.0',
        namespace: prefix,
        source: 'mcp',
        description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
        tags: ['mcp', serverName, mcpTool.name],
        inputSchema: mcpTool.inputSchema || { type: 'object' },
        capabilities: { readOnly: true, networkAccess: false, filesystemAccess: false, dangerous: false },
        execute: async () => { throw new Error(`Execute requires MCP connection for ${toolId}`) },
      })
    } catch (err) {
      errors.push(`${serverName}/${mcpTool.name}: ${err}`)
    }
  }

  return { tools, errors }
}

// ============================================================================
// 测试
// ============================================================================

let passCount = 0
let failCount = 0

function assert(condition: boolean, message: string) {
  if (condition) { passCount++; logSuccess(message) }
  else { failCount++; logError(message) }
}

async function runTest() {
  logSection('OpenClaw Suite 完整场景集成测试')

  const eventLog: string[] = []

  try {
    // ===== STEP 1: 初始化 =====
    logStep('1', '初始化所有组件...')

    const toolRegistry = new MockToolRegistry()
    const permissionEngine = new MockPermissionEngine()
    const contextManager = new MockContextManager({ maxEvents: 1000, compactionThreshold: 100 })
    const taskManager = new MockTaskManager({
      parentCompletionStrategy: 'all_success',
      defaultTimeout: 30000,
      defaultMaxRetries: 2,
      defaultRetryDelay: 100,
    })

    const detector = new MockDiminishingReturnsDetector({
      windowSize: 10,
      threshold: 0.15,
      cooldownMs: 50,
    })
    detector.attach(contextManager)

    logSuccess('所有组件初始化完成')

    // ===== STEP 2: 启动 Mock MCP 服务器 =====
    logStep('2', '启动 Mock MCP 服务器，同步工具到 ToolRegistry...')

    const mockServer = new MockMCPServer('weather-server', [
      { name: 'get_weather', description: '获取城市天气', inputSchema: { city: { type: 'string' } } },
      { name: 'send_email', description: '发送邮件（需要权限确认）', inputSchema: { to: { type: 'string' }, subject: { type: 'string' } } },
      { name: 'calculate', description: '数学计算', inputSchema: { expression: { type: 'string' } } },
    ])

    logSuccess(`Mock MCP 服务器已创建，提供 ${mockServer.tools.length} 个工具`)

    // 映射 MCP 工具到 Tool 格式
    const { tools: mappedTools, errors: mapErrors } = mapMCPToolsToTools(mockServer.tools, mockServer.name)
    logEvent(`映射完成: ${mappedTools.length} 成功, ${mapErrors.length} 失败`)

    // 注册到 ToolRegistry
    for (const tool of mappedTools) {
      await toolRegistry.register(tool)
      logEvent(`已注册工具: ${tool.id}`)
    }

    assert(mappedTools.length === 3, `注册了 3 个 MCP 工具`)

    // ===== STEP 3: 配置权限规则 =====
    logStep('3', '配置权限规则...')

    permissionEngine.addRule({
      id: 'allow-weather',
      effect: 'allow',
      priority: 10,
      subject: { type: 'agent', agentId: 'research-agent' },
      object: { type: 'tool', toolId: 'mcp__weather-server__get_weather' },
    })

    permissionEngine.addRule({
      id: 'ask-email',
      effect: 'ask',
      priority: 10,
      subject: { type: 'agent', agentId: 'research-agent' },
      object: { type: 'tool', toolId: 'mcp__weather-server__send_email' },
    })

    permissionEngine.addRule({
      id: 'allow-calc',
      effect: 'allow',
      priority: 10,
      subject: { type: 'agent', agentId: 'research-agent' },
      object: { type: 'tool', toolId: 'mcp__weather-server__calculate' },
    })

    logSuccess('添加了 3 条规则 (allow/ask/allow)')

    // ===== STEP 4: 订阅事件 =====
    logStep('4', '订阅所有事件...')

    taskManager.subscribe('*', (e: any) => {
      eventLog.push(`Task:${e.type}`)
      logEvent(`Task: ${e.type}`, e.taskId || '')
    })

    contextManager.on('event_added', () => {
      eventLog.push('Context:event')
    })

    contextManager.on('compact_start', () => {
      eventLog.push('Context:compact')
      logEvent(`${YELLOW}上下文压缩触发${RESET}`)
    })

    detector.on('diminishing_returns', (data: any) => {
      eventLog.push('Context:diminishing')
      logEvent(`${RED}递减检测: ${data.reason}${RESET}`)
    })

    detector.on('reset', () => {
      eventLog.push('Context:reset')
    })

    logSuccess('事件订阅完成')

    // ===== STEP 5: 创建任务 =====
    logStep('5', '创建父任务和子任务...')

    const parentTask = await taskManager.createTask({
      description: '股票研究报告生成',
      prompt: '生成完整股票研究报告',
      type: 'research',
    })
    logSuccess(`父任务: ${parentTask.id}`)

    const subtasks = await taskManager.createSubtasks(parentTask.id, [
      { description: '获取天气数据', prompt: '调用 get_weather', type: 'research' },
      { description: '发送邮件摘要', prompt: '调用 send_email', type: 'implement' },
      { description: '计算财务指标', prompt: '调用 calculate', type: 'analysis' },
    ])
    logSuccess(`创建了 ${subtasks.length} 个子任务`)
    assert(subtasks.length === 3, '创建了 3 个子任务')

    // ===== STEP 6: 执行子任务 =====
    logStep('6', '执行子任务...')

    const subject = { agentId: 'research-agent' }

    // -- 子任务 1: get_weather --
    logEvent('--- 子任务 1: get_weather ---')
    await taskManager.startTask(parentTask.id)
    await taskManager.startTask(subtasks[0].id)

    contextManager.addEvent({ type: 'user_message', data: { content: '请获取天气' } })

    const weatherToolId = 'mcp__weather-server__get_weather'
    const weatherCheck = await permissionEngine.check({ subject, object: { toolId: weatherToolId } })
    assert(weatherCheck.effect === 'allow', 'get_weather 权限检查: allow')

    contextManager.addEvent({ type: 'tool_call', data: { toolId: weatherToolId, input: { city: '北京' } } })
    const weatherResult = await mockServer.execute('get_weather', { city: '北京' })
    contextManager.addEvent({ type: 'tool_result', data: { toolId: weatherToolId, result: weatherResult } })
    logSuccess(`天气结果: ${JSON.stringify(weatherResult)}`)

    await taskManager.completeTask(subtasks[0].id, weatherResult)
    logSuccess('子任务 1 完成')

    // -- 子任务 2: send_email (ask 效果) --
    logEvent('--- 子任务 2: send_email (ask 效果) ---')
    await taskManager.startTask(subtasks[1].id)

    const emailToolId = 'mcp__weather-server__send_email'
    const emailCheck = await permissionEngine.check({ subject, object: { toolId: emailToolId } })
    assert(emailCheck.effect === 'ask', 'send_email 权限检查: ask (需要确认)')

    // 模拟用户确认
    const userConfirmed = true
    if (userConfirmed) {
      contextManager.addEvent({ type: 'tool_call', data: { toolId: emailToolId, input: { to: 'user@example.com', subject: '报告摘要' } } })
      const emailResult = await mockServer.execute('send_email', { to: 'user@example.com', subject: '股票研究报告摘要', body: '详见附件' })
      contextManager.addEvent({ type: 'tool_result', data: { toolId: emailToolId, result: emailResult } })
      await taskManager.completeTask(subtasks[1].id, emailResult)
      logSuccess('子任务 2 完成（用户已确认）')
    }

    // -- 子任务 3: calculate (触发递减) --
    logEvent('--- 子任务 3: calculate (触发递减检测) ---')
    await taskManager.startTask(subtasks[2].id)

    const calcToolId = 'mcp__weather-server__calculate'

    for (let i = 0; i < 15; i++) {
      contextManager.addEvent({ type: 'tool_call', data: { toolId: calcToolId, input: { expression: '100 + 200' } } })

      // 模拟产出递减
      const result = await mockServer.execute('calculate', { expression: '100 + 200' })
      const diminishingResult = { ...result as object, value: Math.max(300 - i * 15, 50), outputSize: Math.max(300 - i * 15, 50) }

      contextManager.addEvent({ type: 'tool_result', data: { toolId: calcToolId, result: diminishingResult, outputSize: Math.max(300 - i * 15, 50) } })
      await taskManager.updateProgress(subtasks[2].id, Math.round((i / 15) * 100), `计算第 ${i + 1} 次`)
    }

    const drTriggered = eventLog.some((e) => e.includes('diminishing'))
    logEvent(`递减检测触发: ${drTriggered ? '是' : '否'}`)
    assert(drTriggered, '递减检测已触发')

    await taskManager.completeTask(subtasks[2].id, { expression: '100+200', result: 300 })
    logSuccess('子任务 3 完成')

    // ===== STEP 7: 验证父任务自动完成 =====
    logStep('7', '验证父任务自动完成...')

    await new Promise((r) => setTimeout(r, 150))

    const parentFinal = await taskManager.getTask(parentTask.id)
    logEvent(`父任务状态: ${parentFinal?.status.state}`)
    assert(parentFinal?.status.state === 'completed', '父任务状态为 completed')

    if (parentFinal?.status.state === 'completed') {
      const results = parentFinal.status.result as any[]
      assert(Array.isArray(results), '父任务结果为数组')
      assert(results.length === 3, '包含 3 个子任务结果')
      logSuccess(`父任务结果数量: ${results.length}`)
    }

    // ===== STEP 8: 验证上下文 =====
    logStep('8', '验证上下文和事件...')

    const stats = contextManager.getStats()
    logEvent(`上下文统计: 共 ${stats.totalEvents} 个事件`)

    const recentEvents = contextManager.getRecentEvents(100)
    const toolCalls = recentEvents.filter((e) => e.type === 'tool_call')
    const toolResults = recentEvents.filter((e) => e.type === 'tool_result')

    logEvent(`工具调用: ${toolCalls.length} 次`)
    logEvent(`工具结果: ${toolResults.length} 次`)
    assert(toolCalls.length >= 17, `至少有 17 次工具调用 (1+1+15)`)

    // ===== STEP 9: 验证错误处理 =====
    logStep('9', '验证错误处理...')

    const failTask = await taskManager.createTask({ description: '失败测试', prompt: '' })
    await taskManager.startTask(failTask.id)
    await taskManager.failTask(failTask.id, '测试错误')

    const failedTask = await taskManager.getTask(failTask.id)
    assert(failedTask?.status.state === 'failed', '失败任务状态正确')
    assert(failedTask?.status.error === '测试错误', '错误信息正确')

    // ===== STEP 10: 清理 =====
    logStep('10', '清理资源...')
    taskManager.destroy()
    logSuccess('TaskManager 已销毁')

    // ===== 结果汇总 =====
    logSection('测试结果汇总')

    console.log(`${GREEN}通过: ${passCount}${RESET}`)
    console.log(`${RED}失败: ${failCount}${RESET}`)
    console.log(`总事件数: ${eventLog.length}`)

    console.log('\n事件统计:')
    const counts: Record<string, number> = {}
    for (const e of eventLog) {
      counts[e] = (counts[e] || 0) + 1
    }
    for (const [event, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${event}: ${count}`)
    }

    if (failCount === 0) {
      console.log(`\n${GREEN}${BOLD}🎉 所有测试通过！${RESET}\n`)
    } else {
      console.log(`\n${RED}${BOLD}❌ 有 ${failCount} 个测试失败${RESET}\n`)
      process.exit(1)
    }
  } catch (error) {
    logError('测试执行出错:', error)
    console.error(error)
    process.exit(1)
  }
}

runTest()
