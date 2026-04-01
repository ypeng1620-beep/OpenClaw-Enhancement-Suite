/**
 * 研究 Agent 完整示例
 *
 * 展示如何集成：ToolHub + PermissionHub + ContextHub + CoordinatorHub
 *
 * 运行: npx tsx examples/research-agent.ts
 */

import {
  ToolRegistry,
  ToolExecutor,
  MemoryToolContextStore,
} from '@openclaw/suite-tool-hub'
import {
  PermissionEngine,
  FileRuleStore,
  PermissionChecker,
  PermissionGuard,
} from '@openclaw/suite-permission-hub'
import {
  ContextManager,
  DiminishingReturnsDetector,
} from '@openclaw/suite-context-hub'
import { TaskManager } from '@openclaw/suite-coordinator-hub'

// ============================================================================
// 日志
// ============================================================================

const log = (msg: string, ...args: any[]) => console.log(`[Agent] ${msg}`, ...args)

// ============================================================================
// 初始化所有组件
// ============================================================================

log('初始化 Agent 环境...')

// 1. ToolHub
const toolRegistry = new ToolRegistry()
const contextStore = new MemoryToolContextStore()
const toolExecutor = new ToolExecutor({ registry: toolRegistry, contextStore })

// 注册内置工具
await toolRegistry.register({
  id: 'web_search',
  name: 'web_search',
  version: '1.0.0',
  namespace: 'search',
  source: 'builtin',
  description: 'Search the web',
  tags: ['search', 'network'],
  inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  capabilities: { readOnly: true, networkAccess: true },
  execute: async ({ query }: { query: string }) => ({
    results: [`Result 1 for ${query}`, `Result 2 for ${query}`],
  }),
})

await toolRegistry.register({
  id: 'read_file',
  name: 'read_file',
  version: '1.0.0',
  namespace: 'filesystem',
  source: 'builtin',
  description: 'Read a file',
  tags: ['filesystem', 'read'],
  inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
  capabilities: { readOnly: true, filesystemAccess: true },
  execute: async ({ path }: { path: string }) => ({ content: `Content of ${path}` }),
})

log(`注册了 ${(await toolRegistry.list()).length} 个工具`)

// 2. PermissionHub
const ruleStore = new FileRuleStore('/tmp/agent-rules.json')
const permissionEngine = new PermissionEngine({ store: ruleStore })
const permissionChecker = new PermissionChecker({ engine: permissionEngine })
const permissionGuard = new PermissionGuard({ checker: permissionChecker })

// 配置权限规则
await ruleStore.addRule({
  id: 'allow-search',
  effect: 'allow',
  priority: 10,
  conditions: {
    subject: { type: 'agent', agentId: 'research-agent' },
    object: { type: 'tool', toolId: 'web_search' },
  },
})

await ruleStore.addRule({
  id: 'allow-read',
  effect: 'allow',
  priority: 10,
  conditions: {
    subject: { type: 'agent', agentId: 'research-agent' },
    object: { type: 'namespace', namespace: 'filesystem' },
  },
})

await ruleStore.addRule({
  id: 'ask-write',
  effect: 'ask',
  priority: 5,
  conditions: {
    subject: { type: 'agent', agentId: 'research-agent' },
    object: { type: 'namespace', namespace: 'filesystem' },
  },
})

log('权限规则已配置')

// 3. ContextHub
const contextManager = new ContextManager({
  maxEvents: 1000,
  compactionThreshold: 100,
})
const detector = new DiminishingReturnsDetector({
  mode: 'auto',
  windowSize: 10,
  threshold: 0.15,
})

contextManager.addDetector(detector)

detector.on('diminishing_returns', (data) => {
  log(`⚠️ 递减检测: ${data.reason}`)
})

detector.on('reset', () => {
  log('✓ 检测器已重置')
})

log('上下文管理器已初始化')

// 4. CoordinatorHub
const taskManager = new TaskManager({
  parentCompletionStrategy: 'all_success',
  defaultTimeout: 30000,
  maxConcurrentTasks: 5,
})

taskManager.subscribe('completed', (e) => {
  if (e.type === 'completed') log(`✅ 任务完成: ${e.taskId}`)
})

taskManager.subscribe('failed', (e) => {
  if (e.type === 'failed') log(`❌ 任务失败: ${e.taskId}`)
})

log('任务管理器已初始化')

// ============================================================================
// 执行研究任务
// ============================================================================

async function runResearchTask(topic: string) {
  log(`\n开始研究任务: ${topic}`)

  // 创建父任务
  const researchTask = await taskManager.createTask({
    description: `研究: ${topic}`,
    prompt: `全面分析 ${topic} 的投资价值`,
    type: 'research',
  })

  log(`创建任务: ${researchTask.id}`)

  // 分解为子任务
  const subtasks = await taskManager.createSubtasks(researchTask.id, [
    { description: '搜索最新新闻', prompt: `搜索 ${topic} 最新新闻`, type: 'research' },
    { description: '读取财务数据', prompt: `读取 ${topic} 财务数据`, type: 'research' },
    { description: '生成分析报告', prompt: `生成 ${topic} 分析报告`, type: 'implement' },
  ])

  log(`分解为 ${subtasks.length} 个子任务`)

  // 启动父任务
  await taskManager.startTask(researchTask.id)

  // 执行上下文包装
  contextManager.addEvent({
    type: 'user_message',
    data: { content: `请帮我研究 ${topic}` },
  })

  // 依次执行子任务
  for (const subtask of subtasks) {
    await taskManager.startTask(subtask.id)

    const subject = { agentId: 'research-agent' }

    if (subtask.description.includes('搜索')) {
      // 权限检查
      const check = await permissionGuard.executeWithGuard(
        { id: 'web_search' },
        { subject, object: { toolId: 'web_search' } }
      )

      if (check.allowed) {
        contextManager.addEvent({
          type: 'tool_call',
          data: { toolId: 'web_search', input: { query: topic } },
        })

        const result = await toolExecutor.execute('web_search', { query: topic })

        contextManager.addEvent({
          type: 'tool_result',
          data: { toolId: 'web_search', result },
        })

        await taskManager.completeTask(subtask.id, result)
      }
    } else if (subtask.description.includes('财务')) {
      const check = await permissionGuard.executeWithGuard(
        { id: 'read_file' },
        { subject, object: { toolId: 'read_file' } }
      )

      if (check.allowed) {
        contextManager.addEvent({
          type: 'tool_call',
          data: { toolId: 'read_file', input: { path: `data/${topic}.txt` } },
        })

        const result = await toolExecutor.execute('read_file', { path: `data/${topic}.txt` })

        contextManager.addEvent({
          type: 'tool_result',
          data: { toolId: 'read_file', result },
        })

        await taskManager.completeTask(subtask.id, result)
      }
    } else {
      // 生成报告
      await taskManager.updateProgress(subtask.id, 50, '正在生成...')
      await taskManager.completeTask(subtask.id, {
        report: `报告: ${topic} 分析已完成`,
      })
    }
  }

  // 等待父任务完成
  await new Promise((r) => setTimeout(r, 100))

  const final = await taskManager.getTask(researchTask.id)
  log(`\n最终状态: ${final?.status.state}`)

  // 上下文统计
  const stats = contextManager.getStats()
  log(`上下文事件: ${stats.totalEvents} 个`)
}

// ============================================================================
// 运行
// ============================================================================

log('\n========================================')
log('  Research Agent 演示')
log('========================================\n')

await runResearchTask('贵州茅台')

// 模拟多次调用触发递减检测
log('\n模拟连续搜索触发递减检测...')
for (let i = 0; i < 15; i++) {
  contextManager.addEvent({
    type: 'tool_call',
    data: { toolId: 'web_search', input: { query: '相同查询' } },
  })
  contextManager.addEvent({
    type: 'tool_result',
    data: { toolId: 'web_search', result: { results: [`Result ${14 - i}`] } },
  })
}

log('\n========================================')
log('  演示完成')
log('========================================\n')

taskManager.destroy()
