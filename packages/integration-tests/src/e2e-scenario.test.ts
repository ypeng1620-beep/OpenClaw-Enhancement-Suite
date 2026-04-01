/**
 * 集成测试：端到端完整场景
 *
 * 模拟一个完整的多 Agent 协作场景：
 * 1. 用户发起研究任务（CoordinatorHub）
 * 2. 任务分解为多个子任务
 * 3. 每个子任务需要工具执行（ToolHub）
 * 4. 工具执行受权限控制（PermissionHub）
 * 5. 执行过程记录到上下文（ContextHub）
 * 6. MCP 服务器提供额外工具（MCPHub）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TaskManager } from '@openclaw/suite-coordinator-hub'
import {
  ToolRegistry,
  ToolExecutor,
} from '@openclaw/suite-tool-hub'
import {
  FileRuleStore,
  PermissionChecker,
} from '@openclaw/suite-permission-hub'
import { PermissionGuard } from '@openclaw/suite-permission-hub'
import {
  ContextManager,
  createToolContextAdapter,
  DiminishingReturnsDetector,
} from '@openclaw/suite-context-hub'
import { MCPToolMapper } from '@openclaw/suite-mcp-hub'

describe('端到端完整场景', () => {
  // 全局组件
  let taskManager: TaskManager
  let toolRegistry: ToolRegistry
  let executor: ToolExecutor
  let guard: PermissionGuard
  let contextManager: ContextManager

  beforeEach(async () => {
    // 1. 初始化 TaskManager
    taskManager = new TaskManager({
      parentCompletionStrategy: 'all_success',
      defaultTimeout: 30000,
      maxConcurrentTasks: 10,
      defaultMaxRetries: 3,
    })

    // 2. 初始化 ToolHub
    toolRegistry = new ToolRegistry()
    const ruleStore = new FileRuleStore('/tmp/e2e-rules.json')
    const checker = new PermissionChecker({ store: ruleStore })
    guard = new PermissionGuard({ checker })

    // 3. 初始化 ContextHub
    contextManager = new ContextManager({
      maxEvents: 1000,
      compactionThreshold: 500,
    })
    contextManager.addDetector(
      new DiminishingReturnsDetector({ mode: 'auto', windowSize: 20 })
    )

    // 4. 初始化 Executor
    executor = new ToolExecutor({
      onBeforeExecute: async (tool, input) => {
        contextManager.addEvent({
          type: 'tool_call',
          data: { toolId: tool.id, toolName: tool.name, input: JSON.stringify(input) },
        })
      },
      onAfterExecute: async (tool, input, output) => {
        contextManager.addEvent({
          type: 'tool_result',
          data: { toolId: tool.id, toolName: tool.name },
        })
      },
    })

    // 5. 注册内置工具
    const builtinTools = [
      {
        id: 'filesystem__read',
        name: 'read',
        version: '1.0.0',
        namespace: 'filesystem',
        source: 'builtin',
        description: 'Read file',
        tags: ['filesystem', 'read'],
        inputSchema: { type: 'object' },
        capabilities: { readOnly: true, filesystemAccess: true, dangerous: false },
        execute: async () => ({ content: 'file content' }),
      },
      {
        id: 'search__web',
        name: 'web_search',
        version: '1.0.0',
        namespace: 'search',
        source: 'builtin',
        description: 'Web search',
        tags: ['search'],
        inputSchema: { type: 'object' },
        capabilities: { readOnly: true, networkAccess: true, dangerous: false },
        execute: async () => ({ results: ['result 1', 'result 2'] }),
      },
      {
        id: 'analysis__stock',
        name: 'stock_analysis',
        version: '1.0.0',
        namespace: 'analysis',
        source: 'builtin',
        description: 'Stock analysis',
        tags: ['analysis', 'stock'],
        inputSchema: { type: 'object' },
        capabilities: { readOnly: true, networkAccess: true, dangerous: false },
        execute: async () => ({ recommendation: 'BUY', confidence: 0.85 }),
      },
    ]

    for (const tool of builtinTools) {
      await toolRegistry.register(tool as any)
    }

    // 6. 添加权限规则
    await ruleStore.addRule({
      id: 'allow-read',
      effect: 'allow',
      priority: 10,
      conditions: {
        subject: { type: 'user', userId: 'agent-001' },
        object: { toolId: 'filesystem__read' },
      },
    })
    await ruleStore.addRule({
      id: 'allow-search',
      effect: 'allow',
      priority: 10,
      conditions: {
        subject: { type: 'user', userId: 'agent-001' },
        object: { toolId: 'search__web' },
      },
    })
    await ruleStore.addRule({
      id: 'allow-analysis',
      effect: 'allow',
      priority: 10,
      conditions: {
        subject: { type: 'user', userId: 'agent-001' },
        object: { toolId: 'analysis__stock' },
      },
    })
  })

  afterEach(() => {
    taskManager.destroy()
  })

  it('完整场景：股票研究任务', async () => {
    // 创建 ContextAdapter
    const adapter = createToolContextAdapter({ executor, contextManager })

    // 收集事件
    const events: string[] = []
    taskManager.subscribe('*', (e) => events.push(e.type))

    // ===== 步骤 1: 创建研究任务 =====
    const researchTask = await taskManager.createTask({
      description: '研究贵州茅台股票',
      prompt: '请全面分析贵州茅台的投资价值',
      type: 'research',
    })

    console.log(`创建研究任务: ${researchTask.id}`)

    // ===== 步骤 2: 分解为子任务 =====
    const subtasks = await taskManager.createSubtasks(researchTask.id, [
      { description: '搜索基本信息', prompt: '搜索茅台最新新闻', type: 'research' },
      { description: '读取财务数据', prompt: '读取最新财报', type: 'research' },
      { description: '技术分析', prompt: '分析 K 线走势', type: 'analysis' },
    ])

    console.log(`创建 ${subtasks.length} 个子任务`)

    // ===== 步骤 3: 启动父任务 =====
    await taskManager.startTask(researchTask.id)

    // ===== 步骤 4: 执行子任务 =====
    for (const subtask of subtasks) {
      await taskManager.startTask(subtask.id)

      // 模拟工具执行（带权限检查）
      const subject = { userId: 'agent-001' }

      if (subtask.description.includes('搜索')) {
        const result = await guard.executeWithGuard(
          { id: 'search__web' },
          { subject, object: { toolId: 'search__web' } }
        )
        if (result.allowed) {
          const execResult = await executor.execute('search__web', { query: '贵州茅台' })
          await taskManager.updateProgress(subtask.id, 100)
          await taskManager.completeTask(subtask.id, { data: execResult.output })
        }
      } else if (subtask.description.includes('财务')) {
        const result = await guard.executeWithGuard(
          { id: 'filesystem__read' },
          { subject, object: { toolId: 'filesystem__read' } }
        )
        if (result.allowed) {
          const execResult = await executor.execute('filesystem__read', { path: '/data/moutai-report.pdf' })
          await taskManager.updateProgress(subtask.id, 100)
          await taskManager.completeTask(subtask.id, { data: execResult.output })
        }
      } else if (subtask.description.includes('技术')) {
        const result = await guard.executeWithGuard(
          { id: 'analysis__stock' },
          { subject, object: { toolId: 'analysis__stock' } }
        )
        if (result.allowed) {
          const execResult = await executor.execute('analysis__stock', { symbol: '600519' })
          await taskManager.updateProgress(subtask.id, 100)
          await taskManager.completeTask(subtask.id, { data: execResult.output })
        }
      }
    }

    // ===== 步骤 5: 等待父任务自动完成 =====
    await new Promise((r) => setTimeout(r, 100))

    const completedTask = await taskManager.getTask(researchTask.id)

    // ===== 验证结果 =====
    expect(completedTask?.status.state).toBe('completed')
    console.log(`任务状态: ${completedTask?.status.state}`)

    // 验证上下文记录
    const contextEvents = contextManager.getRecentEvents(100)
    expect(contextEvents.length).toBeGreaterThan(0)

    const toolCalls = contextEvents.filter((e) => e.type === 'tool_call')
    expect(toolCalls.length).toBeGreaterThan(0)

    console.log(`工具调用次数: ${toolCalls.length}`)
    console.log(`总事件数: ${contextEvents.length}`)

    // 验证事件类型
    expect(events).toContain('created')
    expect(events).toContain('started')
    expect(events.filter((e) => e === 'completed').length).toBeGreaterThanOrEqual(subtasks.length)
  })

  it('MCP 工具映射集成', async () => {
    const mapper = new MCPToolMapper({ namespacePrefix: 'mcp', includeServerName: true })

    // 模拟 MCP 服务器发现的工具
    const mcpTools = [
      { name: 'get_weather', description: 'Get weather', inputSchema: { type: 'object' } },
      { name: 'send_email', description: 'Send email', inputSchema: { type: 'object' } },
    ]

    const result = await mapper.mapMany(mcpTools, 'weather')

    // 验证映射结果
    expect(result.mappedCount).toBe(2)
    expect(result.tools[0].id).toBe('mcp__weather__get_weather')
    expect(result.tools[1].id).toBe('mcp__weather__send_email')

    // 注册到 ToolRegistry
    for (const tool of result.tools) {
      await toolRegistry.register(tool as any)
    }

    // 验证可发现
    const found = await toolRegistry.get('mcp__weather__get_weather')
    expect(found).toBeDefined()
    expect(found?.name).toBe('get_weather')
    expect(found?.source).toBe('mcp')
  })

  it('权限拒绝应阻止工具执行', async () => {
    const subject = { userId: 'unauthorized-user' }

    // 尝试执行需要权限的工具
    const result = await guard.executeWithGuard(
      { id: 'analysis__stock' },
      { subject, object: { toolId: 'analysis__stock' } }
    )

    expect(result.allowed).toBe(false)
    expect(result.effect).toBe('deny')
  })
})
