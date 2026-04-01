/**
 * 集成测试：MCP Hub + ToolHub + CoordinatorHub + ContextHub + PermissionHub
 *
 * 完整场景：模拟 MCP 服务器 → 工具同步 → 任务编排 → 权限检查 → 上下文追踪
 *
 * 运行方式：
 *   npx tsx tests/integration/mcp-toolhub-coordinator-context.test.ts
 *   或
 *   npx jest tests/integration/mcp-toolhub-coordinator-context.test.ts
 *
 * 需要先安装依赖：
 *   npm install
 *   npm run build
 */

import { ToolRegistry, ToolExecutor, MemoryToolContextStore } from '@openclaw/suite-tool-hub'
import { PermissionEngine, FileRuleStore, PermissionChecker } from '@openclaw/suite-permission-hub'
import { PermissionGuard } from '@openclaw/suite-permission-hub'
import { ContextManager, DiminishingReturnsDetector } from '@openclaw/suite-context-hub'
import { MCPToolMapper } from '@openclaw/suite-mcp-hub'
import { MCPServerRegistry } from '@openclaw/suite-mcp-hub'
import { TaskManager } from '@openclaw/suite-coordinator-hub'
import type { MCPServerConfig, MCPTool, PermissionRequest } from '@openclaw/suite-core'

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
// Mock MCP 服务器
// ============================================================================

/**
 * 模拟 MCP 服务器（不真实启动进程）
 * 提供 3 个简单工具：get_weather, send_email, calculate
 */
class MockMCPServer {
  readonly name = 'mock-server'
  readonly tools: MCPTool[] = [
    {
      name: 'get_weather',
      description: '获取指定城市的天气信息',
      inputSchema: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名称' },
        },
        required: ['city'],
      },
    },
    {
      name: 'send_email',
      description: '发送电子邮件（需要权限确认）',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: '收件人' },
          subject: { type: 'string', description: '主题' },
          body: { type: 'string', description: '内容' },
        },
        required: ['to', 'subject'],
      },
    },
    {
      name: 'calculate',
      description: '执行数学计算',
      inputSchema: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: '数学表达式' },
        },
        required: ['expression'],
      },
    },
  ]

  async execute(toolName: string, input: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'get_weather': {
        const city = input.city as string
        const weatherMap: Record<string, string> = {
          北京: '晴 26°C',
          上海: '多云 24°C',
          深圳: '雷阵雨 28°C',
          广州: '大雨 25°C',
        }
        return { city, weather: weatherMap[city] || '晴 25°C', timestamp: Date.now() }
      }
      case 'send_email': {
        return {
          success: true,
          messageId: `msg-${Date.now()}`,
          to: input.to,
          subject: input.subject,
        }
      }
      case 'calculate': {
        try {
          // 安全计算（只允许数字和基本运算符）
          const expr = input.expression as string
          if (!/^[\d+\-*/.() ]+$/.test(expr)) {
            throw new Error('Invalid expression')
          }
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

// ============================================================================
// 测试计数器
// ============================================================================

let passCount = 0
let failCount = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    passCount++
    logSuccess(message)
  } else {
    failCount++
    logError(message)
  }
}

// ============================================================================
// 主测试
// ============================================================================

async function runIntegrationTest() {
  logSection('OpenClaw Suite 集成测试：MCP + ToolHub + PermissionHub + ContextHub + CoordinatorHub')

  // 收集所有事件日志
  const eventLog: string[] = []

  try {
    // =========================================================================
    // Step 1: 初始化所有组件
    // =========================================================================
    logStep('1', '初始化所有组件...')

    // 1.1 ToolHub
    const toolRegistry = new ToolRegistry()
    const contextStore = new MemoryToolContextStore()
    const toolExecutor = new ToolExecutor({ registry: toolRegistry, contextStore })
    logSuccess('ToolRegistry 和 ToolExecutor 初始化完成')

    // 1.2 PermissionHub
    const ruleStore = new FileRuleStore('/tmp/integration-test-rules.json')
    const permissionEngine = new PermissionEngine({ store: ruleStore })
    const permissionChecker = new PermissionChecker({ engine: permissionEngine, contextStore })
    const permissionGuard = new PermissionGuard({ checker: permissionChecker })
    logSuccess('PermissionEngine 和 PermissionGuard 初始化完成')

    // 1.3 ContextHub
    const contextManager = new ContextManager({
      maxEvents: 1000,
      compactionThreshold: 100,
    })
    const detector = new DiminishingReturnsDetector({
      mode: 'auto',
      windowSize: 10,
      threshold: 0.15,
      cooldown: 50,
    })
    contextManager.addDetector(detector)
    logSuccess('ContextManager 和 DiminishingReturnsDetector 初始化完成')

    // 1.4 MCP Hub
    const mcpToolMapper = new MCPToolMapper({
      namespacePrefix: 'mcp',
      includeServerName: true,
    })
    const mcpRegistry = new MCPServerRegistry({
      syncToToolHub: toolRegistry,
      toolMapper: mcpToolMapper,
    })
    logSuccess('MCPServerRegistry 和 MCPToolMapper 初始化完成')

    // 1.5 CoordinatorHub
    const taskManager = new TaskManager({
      parentCompletionStrategy: 'all_success',
      defaultTimeout: 30000,
      maxConcurrentTasks: 10,
      defaultMaxRetries: 2,
      defaultRetryDelay: 100,
    })
    logSuccess('TaskManager 初始化完成')

    logEvent('所有组件初始化完成')

    // =========================================================================
    // Step 2: 启动模拟 MCP 服务器，同步工具到 ToolHub
    // =========================================================================
    logStep('2', '启动模拟 MCP 服务器，同步工具到 ToolHub...')

    // 创建模拟 MCP 服务器
    const mockServer = new MockMCPServer()
    logSuccess(`Mock MCP 服务器创建完成，提供 ${mockServer.tools.length} 个工具`)

    // 注册 MCP 服务器配置
    const mcpConfig: MCPServerConfig = {
      name: mockServer.name,
      type: 'stdio',
      command: 'echo',
      args: ['mock'],
      description: 'Mock MCP Server for Testing',
    }

    await mcpRegistry.register(mcpConfig)
    logSuccess(`MCP 服务器配置已注册: ${mcpConfig.name}`)

    // 手动同步工具（模拟 MCPServerRegistry.syncServerTools 的逻辑）
    const syncResult = await mcpToolMapper.mapMany(mockServer.tools, mockServer.name)
    logEvent(`映射结果: ${syncResult.mappedCount}/${mockServer.tools.length} 个工具成功`)

    for (const tool of syncResult.tools) {
      await toolRegistry.register(tool as any)
      logEvent(`已注册工具: ${tool.id}`)
    }

    // 验证工具已同步
    for (const mcpTool of mockServer.tools) {
      const toolId = `mcp__${mockServer.name}__${mcpTool.name}`
      const registered = await toolRegistry.get(toolId)
      assert(registered !== undefined, `工具 ${toolId} 已同步到 ToolHub`)
    }

    // =========================================================================
    // Step 3: 配置权限规则
    // =========================================================================
    logStep('3', '配置权限规则...')

    // 允许天气查询
    await ruleStore.addRule({
      id: 'allow-weather',
      effect: 'allow',
      priority: 10,
      conditions: {
        subject: { type: 'agent', agentId: 'research-agent' },
        object: { toolId: 'mcp__mock-server__get_weather' },
      },
    })
    logSuccess('添加规则: allow get_weather for research-agent')

    // 允许计算
    await ruleStore.addRule({
      id: 'allow-calculate',
      effect: 'allow',
      priority: 10,
      conditions: {
        subject: { type: 'agent', agentId: 'research-agent' },
        object: { toolId: 'mcp__mock-server__calculate' },
      },
    })
    logSuccess('添加规则: allow calculate for research-agent')

    // send_email 需要 ask 确认
    await ruleStore.addRule({
      id: 'ask-email',
      effect: 'ask',
      priority: 10,
      conditions: {
        subject: { type: 'agent', agentId: 'research-agent' },
        object: { toolId: 'mcp__mock-server__send_email' },
      },
    })
    logSuccess('添加规则: ask send_email for research-agent (需要确认)')

    // =========================================================================
    // Step 4: 订阅所有事件
    // =========================================================================
    logStep('4', '订阅所有事件...')

    // TaskManager 事件
    taskManager.subscribe('*', (e: any) => {
      eventLog.push(`Task:${e.type}`)
      logEvent(`Task Event: ${e.type}`, e.taskId || '')
    })

    // ContextManager 事件
    contextManager.on('event_added', (event: any) => {
      eventLog.push(`Context:event_added`)
      logEvent(`Context Event: event_added (${contextManager.getStats().totalEvents} total)`)
    })

    contextManager.on('compact_start', () => {
      eventLog.push(`Context:compact_start`)
      logEvent(`${YELLOW}Context: 触发压缩${RESET}`)
    })

    // DiminishingReturnsDetector 事件
    detector.on('diminishing_returns', (data: any) => {
      eventLog.push(`Context:diminishing_returns`)
      logEvent(`${RED}递减检测触发: ${data.reason}${RESET}`)
    })

    logSuccess('事件订阅完成')

    // =========================================================================
    // Step 5: 创建任务并分解
    // =========================================================================
    logStep('5', '创建任务并分解为子任务...')

    // 创建父任务
    const parentTask = await taskManager.createTask({
      description: '股票研究报告生成',
      prompt: '生成一份完整的股票研究报告',
      type: 'research',
    })
    logSuccess(`父任务创建: ${parentTask.id}`)

    // 创建子任务
    const subtasks = await taskManager.createSubtasks(parentTask.id, [
      {
        description: '获取天气数据（测试 MCP 工具）',
        prompt: '调用 get_weather 获取某城市天气',
        type: 'research',
      },
      {
        description: '发送报告摘要邮件（需要 ask 确认）',
        prompt: '调用 send_email 发送报告摘要',
        type: 'implement',
      },
      {
        description: '计算财务指标',
        prompt: '调用 calculate 计算财务指标',
        type: 'analysis',
      },
    ])
    logSuccess(`创建 ${subtasks.length} 个子任务`)

    for (const subtask of subtasks) {
      logEvent(`子任务: ${subtask.id} - ${subtask.description}`)
    }

    assert(subtasks.length === 3, '创建了 3 个子任务')

    // =========================================================================
    // Step 6: 执行子任务
    // =========================================================================
    logStep('6', '执行子任务...')

    const subject = { agentId: 'research-agent' }

    // ---- 子任务 1: get_weather (顺序执行) ----
    logEvent('--- 子任务 1: get_weather ---')
    await taskManager.startTask(subtasks[0].id)
    await taskManager.startTask(parentTask.id) // 启动父任务

    // 添加上下文事件
    contextManager.addEvent({
      type: 'user_message',
      data: { content: '请帮我获取天气信息' },
    })

    const weatherToolId = 'mcp__mock-server__get_weather'
    const weatherCheck = await permissionGuard.executeWithGuard(
      { id: weatherToolId },
      { subject, object: { toolId: weatherToolId } }
    )

    assert(weatherCheck.allowed === true, 'get_weather 权限检查通过')

    // 模拟 MCP 工具执行
    contextManager.addEvent({
      type: 'tool_call',
      data: { toolId: weatherToolId, input: { city: '北京' } },
    })

    const weatherResult = await mockServer.execute('get_weather', { city: '北京' })
    logSuccess(`天气查询结果: ${JSON.stringify(weatherResult)}`)

    contextManager.addEvent({
      type: 'tool_result',
      data: { toolId: weatherToolId, result: weatherResult },
    })

    await taskManager.completeTask(subtasks[0].id, weatherResult)
    logSuccess('子任务 1 完成')

    // ---- 子任务 2: send_email (ask 确认) ----
    logEvent('--- 子任务 2: send_email (需要 ask 确认) ---')
    await taskManager.startTask(subtasks[1].id)

    const emailToolId = 'mcp__mock-server__send_email'
    const emailCheck = await permissionGuard.executeWithGuard(
      { id: emailToolId },
      { subject, object: { toolId: emailToolId } }
    )

    // 验证 ask 效果
    assert(emailCheck.effect === 'ask', 'send_email 触发 ask 效果')
    assert(emailCheck.requiresConfirmation === true, '需要用户确认')

    // 模拟等待确认（实际由用户操作）
    logEvent('等待用户确认...')

    // 模拟用户确认（实际通过消息通道调用 resolveApproval）
    const approved = true // 模拟批准

    if (approved) {
      contextManager.addEvent({
        type: 'tool_call',
        data: { toolId: emailToolId, input: { to: 'user@example.com', subject: '报告摘要' } },
      })

      const emailResult = await mockServer.execute('send_email', {
        to: 'user@example.com',
        subject: '股票研究报告摘要',
        body: '详见附件...',
      })
      logSuccess(`邮件发送结果: ${JSON.stringify(emailResult)}`)

      contextManager.addEvent({
        type: 'tool_result',
        data: { toolId: emailToolId, result: emailResult },
      })

      await taskManager.completeTask(subtasks[1].id, emailResult)
      logSuccess('子任务 2 完成（用户已确认）')
    }

    // ---- 子任务 3: calculate (模拟递减) ----
    logEvent('--- 子任务 3: calculate (触发递减检测) ---')
    await taskManager.startTask(subtasks[2].id)

    const calcToolId = 'mcp__mock-server__calculate'

    // 模拟连续相同计算（触发递减）
    for (let i = 0; i < 15; i++) {
      const input = { expression: '100 + 200' } // 相同表达式

      contextManager.addEvent({
        type: 'tool_call',
        data: { toolId: calcToolId, input },
      })

      const result = await mockServer.execute('calculate', input)

      // 模拟产出递减
      const diminishingResult = {
        ...result,
        value: Math.max(300 - i * 15, 50), // 递减的值
      }

      contextManager.addEvent({
        type: 'tool_result',
        data: { toolId: calcToolId, result: diminishingResult },
      })

      await taskManager.updateProgress(subtasks[2].id, Math.round((i / 15) * 100), `计算第 ${i + 1} 次`)
    }

    // 检查是否触发了递减检测
    const drTriggered = eventLog.some((e) => e.includes('diminishing_returns'))
    logEvent(`递减检测触发: ${drTriggered ? '是' : '否'}`)

    await taskManager.completeTask(subtasks[2].id, { expression: '100+200', result: 300 })
    logSuccess('子任务 3 完成')

    // =========================================================================
    // Step 7: 验证父任务自动完成
    // =========================================================================
    logStep('7', '验证父任务自动完成...')

    // 等待父任务完成检测
    await new Promise((r) => setTimeout(r, 100))

    const parentFinal = await taskManager.getTask(parentTask.id)
    logEvent(`父任务状态: ${parentFinal?.status.state}`)

    assert(parentFinal?.status.state === 'completed', '父任务状态为 completed')

    if (parentFinal?.status.state === 'completed') {
      const result = (parentFinal.status as any).result
      logSuccess(`父任务结果: ${JSON.stringify(result)}`)
      assert(Array.isArray(result), '父任务结果包含子任务结果数组')
      assert(result.length === 3, '包含 3 个子任务结果')
    }

    // =========================================================================
    // Step 8: 验证事件和上下文
    // =========================================================================
    logStep('8', '验证事件和上下文...')

    const stats = contextManager.getStats()
    logEvent(`上下文统计: 共 ${stats.totalEvents} 个事件`)

    assert(stats.totalEvents > 0, 'ContextHub 记录了事件')

    // 验证事件类型分布
    const recentEvents = contextManager.getRecentEvents(100)
    const toolCalls = recentEvents.filter((e) => e.type === 'tool_call')
    const toolResults = recentEvents.filter((e) => e.type === 'tool_result')

    logEvent(`工具调用次数: ${toolCalls.length}`)
    logEvent(`工具结果次数: ${toolResults.length}`)

    assert(toolCalls.length >= 17, '至少有 17 次工具调用 (1+1+15)')

    // 验证递减检测事件
    logEvent(`递减检测触发: ${drTriggered ? '是' : '否'}`)

    // =========================================================================
    // Step 9: 验证错误处理
    // =========================================================================
    logStep('9', '验证错误处理...')

    // 创建会失败的任务
    const failTask = await taskManager.createTask({
      description: '失败测试任务',
      prompt: '这个任务会失败',
      type: 'general',
    })
    await taskManager.startTask(failTask.id)
    await taskManager.failTask(failTask.id, '测试错误')

    const failedTask = await taskManager.getTask(failTask.id)
    assert(failedTask?.status.state === 'failed', '失败任务状态正确')
    assert((failedTask?.status as any).error === '测试错误', '错误信息正确')

    // =========================================================================
    // Step 10: 清理
    // =========================================================================
    logStep('10', '清理资源...')

    taskManager.destroy()
    logSuccess('TaskManager 已销毁')

    // =========================================================================
    // 测试总结
    // =========================================================================
    logSection('测试结果汇总')

    console.log(`${GREEN}通过: ${passCount}${RESET}`)
    console.log(`${RED}失败: ${failCount}${RESET}`)
    console.log(`总事件数: ${eventLog.length}`)

    console.log('\n事件日志摘要:')
    const eventCounts: Record<string, number> = {}
    for (const e of eventLog) {
      eventCounts[e] = (eventCounts[e] || 0) + 1
    }
    for (const [event, count] of Object.entries(eventCounts).sort((a, b) => b[1] - a[1])) {
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

// ============================================================================
// 运行测试
// ============================================================================

runIntegrationTest()
