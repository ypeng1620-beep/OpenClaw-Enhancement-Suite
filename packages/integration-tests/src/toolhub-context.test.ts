/**
 * 集成测试：ToolHub + ContextHub
 *
 * 场景：
 * 1. ContextManager 监听工具执行事件
 * 2. 工具执行时自动记录上下文事件
 * 3. 验证递减检测触发压缩
 * 4. 验证 ToolContextAdapter 提供执行摘要
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ToolRegistry,
  ToolExecutor,
  MemoryToolContextStore,
} from '@openclaw/suite-tool-hub'
import {
  ContextManager,
  DiminishingReturnsDetector,
  MicroCompactStrategy,
  createToolContextAdapter,
} from '@openclaw/suite-context-hub'

describe('ToolHub + ContextHub 集成', () => {
  let toolRegistry: ToolRegistry
  let executor: ToolExecutor
  let contextStore: MemoryToolContextStore
  let contextManager: ContextManager
  let detector: DiminishingReturnsDetector

  beforeEach(() => {
    toolRegistry = new ToolRegistry()
    contextStore = new MemoryToolContextStore()
    contextManager = new ContextManager({
      maxEvents: 1000,
      compactionThreshold: 500,
    })
    detector = new DiminishingReturnsDetector({
      mode: 'auto',
      windowSize: 50,
      threshold: 0.1,
      cooldown: 100,
    })
  })

  it('工具执行事件应自动记录到 ContextManager', async () => {
    // 1. 注册工具
    const searchTool = {
      id: 'search__web',
      name: 'web_search',
      version: '1.0.0',
      namespace: 'search',
      source: 'builtin',
      description: 'Web search',
      tags: ['search'],
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      capabilities: { readOnly: true, networkAccess: true },
      execute: async ({ query }: { query: string }) => ({ results: [`Result for ${query}`] }),
    }

    await toolRegistry.register(searchTool)

    // 2. 创建执行器并连接 ContextManager
    executor = new ToolExecutor({
      registry: toolRegistry,
      contextStore,
      onBeforeExecute: async (tool, input) => {
        contextManager.addEvent({
          type: 'tool_call',
          data: {
            toolId: tool.id,
            toolName: tool.name,
            input: JSON.stringify(input),
          },
        })
      },
      onAfterExecute: async (tool, input, output) => {
        contextManager.addEvent({
          type: 'tool_result',
          data: {
            toolId: tool.id,
            toolName: tool.name,
            outputSize: JSON.stringify(output).length,
          },
        })
      },
    })

    // 3. 执行工具
    const result = await executor.execute('search__web', { query: 'AI news' })

    expect(result.success).toBe(true)
    expect(result.output).toBeDefined()

    // 4. 验证事件已记录
    const events = contextManager.getRecentEvents(10)
    const toolCallEvents = events.filter((e) => e.type === 'tool_call')
    const toolResultEvents = events.filter((e) => e.type === 'tool_result')

    expect(toolCallEvents.length).toBeGreaterThan(0)
    expect(toolResultEvents.length).toBeGreaterThan(0)

    const callEvent = toolCallEvents[0].data as any
    expect(callEvent.toolId).toBe('search__web')
    expect(callEvent.input).toContain('AI news')
  })

  it('ContextManager 应触发递减检测并通知', async () => {
    // 1. 添加递减检测器
    contextManager.addDetector(detector)

    const notifications: string[] = []
    detector.on('diminishing_returns', (data) => {
      notifications.push(`DR detected: ${data.reason}`)
    })
    detector.on('reset', () => {
      notifications.push('Detector reset')
    })

    // 2. 模拟连续相似的工具调用（收益递减）
    for (let i = 0; i < 60; i++) {
      contextManager.addEvent({
        type: 'tool_call',
        data: {
          toolId: 'search__web',
          toolName: 'web_search',
          input: JSON.stringify({ query: 'same query' }), // 相同查询
        },
      })

      // 模拟每次调用产出减少
      contextManager.addEvent({
        type: 'tool_result',
        data: {
          toolId: 'search__web',
          toolName: 'web_search',
          outputSize: Math.max(100 - i * 2, 10), // 递减的产出
        },
      })
    }

    // 3. 等待检测
    await new Promise((r) => setTimeout(r, 200))

    // 应该触发递减通知
    expect(notifications.some((n) => n.includes('DR detected'))).toBe(true)
  })

  it('ToolContextAdapter 应提供执行摘要', async () => {
    // 1. 注册多个工具
    const tools = [
      {
        id: 'search__web',
        name: 'web_search',
        version: '1.0.0',
        namespace: 'search',
        source: 'builtin',
        description: 'Web search',
        tags: ['search'],
        inputSchema: { type: 'object' },
        capabilities: { readOnly: true, networkAccess: true },
        execute: async () => ({ results: ['a', 'b', 'c'] }),
      },
      {
        id: 'filesystem__read',
        name: 'read',
        version: '1.0.0',
        namespace: 'filesystem',
        source: 'builtin',
        description: 'Read file',
        tags: ['filesystem'],
        inputSchema: { type: 'object' },
        capabilities: { readOnly: true, filesystemAccess: true },
        execute: async () => ({ content: 'file content' }),
      },
    ]

    for (const tool of tools) {
      await toolRegistry.register(tool as any)
    }

    executor = new ToolExecutor({ registry: toolRegistry })

    // 2. 创建 ContextAdapter
    const adapter = createToolContextAdapter({
      executor,
      contextManager,
    })

    // 3. 执行工具并获取摘要
    const result = await adapter.executeWithContext('search__web', { query: 'test' })

    expect(result.success).toBe(true)
    expect(result.contextSnapshot).toBeDefined()
    expect(result.contextSnapshot!.eventCount).toBeGreaterThan(0)

    // 4. 获取执行历史摘要
    const summary = adapter.getExecutionSummary()
    expect(summary.totalCalls).toBeGreaterThan(0)
    expect(summary.toolsUsed).toContain('search__web')
  })

  it('上下文压缩后应保留关键信息', async () => {
    // 1. 添加多个不同类型事件
    contextManager.addEvent({ type: 'user_message', data: { content: 'Hello' } })
    contextManager.addEvent({ type: 'tool_call', data: { toolId: 'tool-1' } })
    contextManager.addEvent({ type: 'tool_result', data: { toolId: 'tool-1' } })
    contextManager.addEvent({ type: 'user_message', data: { content: 'Follow up' } })
    contextManager.addEvent({ type: 'tool_call', data: { toolId: 'tool-2' } })

    // 2. 获取压缩前的关键信息
    const events = contextManager.getRecentEvents(100)
    const userMessages = events.filter((e) => e.type === 'user_message')
    expect(userMessages.length).toBe(2)

    // 3. 手动触发微压缩
    const strategy = new MicroCompactStrategy()
    const compressed = await strategy.compact(contextManager.getRecentEvents(100))

    // 4. 验证压缩后仍有用户消息
    const compressedUserMessages = compressed.filter((e) => e.type === 'user_message')
    expect(compressedUserMessages.length).toBeGreaterThan(0)
  })
})
