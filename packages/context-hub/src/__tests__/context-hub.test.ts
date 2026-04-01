/**
 * ContextHub 单元测试
 */

import {
  ContextManager,
  DiminishingReturnsDetector,
  createCompactStrategy,
} from '../src/index.js'
import type { ContextEvent } from '@openclaw/suite-core'

function createMessageEvent(id: string, content: string, role: 'user' | 'assistant' = 'user'): ContextEvent {
  return {
    type: 'message',
    id,
    role,
    content,
    timestamp: Date.now(),
  }
}

function createToolCallEvent(id: string, toolId: string): ContextEvent {
  return {
    type: 'tool_call',
    id,
    toolId,
    input: {},
    timestamp: Date.now(),
  }
}

function createToolResultEvent(id: string, callId: string, success = true): ContextEvent {
  return {
    type: 'tool_result',
    id,
    callId,
    success,
    result: success ? { data: 'ok' } : 'error',
    durationMs: 100,
    timestamp: Date.now(),
  }
}

describe('ContextManager', () => {
  let manager: ContextManager

  beforeEach(() => {
    manager = new ContextManager({
      maxTokens: 1000,
      autoCompactThreshold: 0.8,
    })
  })

  describe('add / getContext', () => {
    it('应添加并检索事件', () => {
      manager.add(createMessageEvent('1', 'Hello'))
      manager.add(createMessageEvent('2', 'World'))

      const events = manager.getContext({ maxTokens: 500 })
      expect(events.events).toHaveLength(2)
    })

    it('应按 token 限制过滤事件', () => {
      // 添加大量小事件
      for (let i = 0; i < 100; i++) {
        manager.add(createMessageEvent(`msg-${i}`, 'x'))
      }

      const stats = manager.getStats()
      expect(stats.eventCount).toBe(100)

      // 获取时限制 token
      const snapshot = manager.getContext({ maxTokens: 50 })
      expect(snapshot.events.length).toBeLessThan(100)
    })

    it('应按类型过滤事件', () => {
      manager.add(createMessageEvent('1', 'Hello'))
      manager.add(createToolCallEvent('2', 'test/read'))
      manager.add(createToolResultEvent('3', '2'))

      const onlyMessages = manager.getContext({
        includeTypes: ['message'],
      })
      expect(onlyMessages.events.every((e) => e.type === 'message')).toBe(true)

      const noMessages = manager.getContext({
        excludeTypes: ['message'],
      })
      expect(noMessages.events.every((e) => e.type !== 'message')).toBe(true)
    })
  })

  describe('事件通知', () => {
    it('应触发 event_added 事件', () => {
      const events: any[] = []
      manager.on((e) => events.push(e))

      manager.add(createMessageEvent('1', 'Hello'))

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('event_added')
    })

    it('应触发 threshold_reached 事件', () => {
      const events: any[] = []
      manager.on((e) => events.push(e))

      // 快速添加大量事件触发阈值
      for (let i = 0; i < 50; i++) {
        manager.add(createMessageEvent(`msg-${i}`, 'x'.repeat(100)))
      }

      const thresholdEvents = events.filter((e) => e.type === 'threshold_reached')
      expect(thresholdEvents.length).toBeGreaterThan(0)
    })

    it('应触发 compact_complete 事件', () => {
      const events: any[] = []
      manager.on((e) => events.push(e))

      manager.add(createMessageEvent('1', 'Hello'))
      manager.add(createMessageEvent('2', 'World'))
      manager.compact('micro')

      const compactEvents = events.filter((e) => e.type === 'compact_complete')
      expect(compactEvents).toHaveLength(1)
    })
  })

  describe('compact', () => {
    it('应合并连续同角色消息', async () => {
      manager.add(createMessageEvent('1', 'Hello', 'user'))
      manager.add(createMessageEvent('2', 'World', 'user'))

      const result = await manager.compact('micro')

      // 应该合并成一条
      expect(result.compactedEventCount).toBeLessThan(2)
    })

    it('应返回正确的压缩统计', async () => {
      manager.add(createMessageEvent('1', 'x'.repeat(1000)))
      manager.add(createMessageEvent('2', 'y'.repeat(1000)))

      const result = await manager.compact('micro')

      expect(result.originalEventCount).toBe(2)
      expect(result.savedTokens).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getStats', () => {
    it('应返回正确的统计信息', () => {
      manager.add(createMessageEvent('1', 'Hello'))
      manager.add(createToolCallEvent('2', 'test/read'))

      const stats = manager.getStats()

      expect(stats.eventCount).toBe(2)
      expect(stats.totalTokens).toBeGreaterThan(0)
      expect(stats.tokenLimit).toBe(1000)
      expect(stats.usagePercent).toBeGreaterThan(0)
    })
  })

  describe('clear', () => {
    it('应清空所有事件', () => {
      manager.add(createMessageEvent('1', 'Hello'))
      manager.add(createToolCallEvent('2', 'test/read'))

      manager.clear()

      const stats = manager.getStats()
      expect(stats.eventCount).toBe(0)
    })

    it('应触发 cleared 事件', () => {
      const events: any[] = []
      manager.on((e) => events.push(e))

      manager.add(createMessageEvent('1', 'Hello'))
      manager.clear()

      const clearedEvents = events.filter((e) => e.type === 'cleared')
      expect(clearedEvents).toHaveLength(1)
    })
  })

  describe('shouldAutoCompact', () => {
    it('应在达到阈值时返回 true', () => {
      const smallManager = new ContextManager({
        maxTokens: 100,
        autoCompactThreshold: 0.8,
      })

      // 添加事件直到超过阈值
      for (let i = 0; i < 100; i++) {
        smallManager.add(createMessageEvent(`msg-${i}`, 'x'.repeat(50)))
      }

      expect(smallManager.shouldAutoCompact()).toBe(true)
    })
  })
})

describe('DiminishingReturnsDetector', () => {
  let detector: DiminishingReturnsDetector

  beforeEach(() => {
    detector = new DiminishingReturnsDetector({
      windowSize: 3,
      threshold: 500,
      stopThreshold: 0.1,
      tokenLimit: 10000,
    })
  })

  describe('recordCall / check', () => {
    it('应正常记录调用', () => {
      detector.recordCall(3000)
      detector.recordCall(2500)

      const decision = detector.check()
      expect(decision.shouldContinue).toBe(true)
    })

    it('应检测递减', () => {
      detector.recordCall(3000)
      detector.recordCall(2000)
      detector.recordCall(1000)
      detector.recordCall(500)

      const decision = detector.check()
      expect(decision.shouldContinue).toBe(false)
      expect(decision.diminishingDetected).toBe(true)
    })

    it('应在低于阈值时停止', () => {
      // 单次调用就低于阈值
      detector = new DiminishingReturnsDetector({
        windowSize: 3,
        threshold: 500,
        stopThreshold: 0.1,
        tokenLimit: 10000,
      })

      detector.recordCall(500) // 500/10000 = 5%，低于 10% 阈值
      detector.recordCall(400)
      detector.recordCall(300)

      const decision = detector.check()
      expect(decision.shouldContinue).toBe(false)
    })
  })

  describe('事件监听', () => {
    it('应触发 stop 事件', () => {
      const events: any[] = []
      detector.subscribe((e) => events.push(e))

      detector.recordCall(500)
      detector.recordCall(300)
      detector.recordCall(100)
      detector.check()

      const stopEvents = events.filter((e) => e.type === 'stop')
      expect(stopEvents.length).toBe(1)
    })
  })

  describe('reset', () => {
    it('应重置状态', () => {
      detector.recordCall(500)
      detector.recordCall(300)
      detector.recordCall(100)
      detector.check()

      detector.reset()

      const decision = detector.check()
      expect(decision.shouldContinue).toBe(true)
      expect(decision.continuationCount).toBe(0)
    })
  })

  describe('不同模式', () => {
    it('latest 模式只看最新一次', () => {
      detector = new DiminishingReturnsDetector({
        windowSize: 3,
        threshold: 1000,
        mode: 'latest',
        tokenLimit: 10000,
      })

      detector.recordCall(5000)
      detector.recordCall(4000)
      detector.recordCall(3000) // 最新一次是 3000，低于阈值 1000*0.1=100

      const decision = detector.check()
      expect(decision.diminishingDetected).toBe(true)
    })
  })
})

describe('CompactStrategy', () => {
  describe('MicroCompactStrategy', () => {
    it('应合并连续同角色消息', () => {
      const strategy = createCompactStrategy('micro')

      const events: ContextEvent[] = [
        createMessageEvent('1', 'Hello', 'user'),
        createMessageEvent('2', 'World', 'user'),
        createMessageEvent('3', 'Hi', 'assistant'),
      ]

      const result = strategy.compact(events)

      // 两条 user 消息应该合并
      expect(result.length).toBeLessThan(3)
    })

    it('应截断长输出', () => {
      const strategy = createCompactStrategy('micro', { maxOutputLength: 50 })

      const events: ContextEvent[] = [
        createToolResultEvent('1', 'call-1', true),
      ]

      // 手动添加长 result
      events[0].result = 'x'.repeat(200)

      const result = strategy.compact(events)

      const toolResult = result.find((e) => e.type === 'tool_result')
      expect(toolResult?.result).toContain('[TRUNCATED')
    })
  })

  describe('AutoCompactStrategy', () => {
    it('应保留匹配模式的工具调用', () => {
      const strategy = createCompactStrategy('auto', {
        preservePatterns: ['*/verify'],
      })

      const events: ContextEvent[] = [
        createToolCallEvent('1', 'stock/daily'),
        createToolCallEvent('2', 'verify/check'),
      ]

      const result = strategy.compact(events)

      // verify/check 应该保留
      const preserved = result.find((e) => e.type === 'tool_call' && e.toolId === 'verify/check')
      expect(preserved).toBeDefined()
    })
  })

  describe('ManualCompactStrategy', () => {
    it('应只保留指定类型', () => {
      const strategy = createCompactStrategy('manual', {
        preserveTypes: ['message'],
      })

      const events: ContextEvent[] = [
        createMessageEvent('1', 'Hello'),
        createToolCallEvent('2', 'stock/daily'),
      ]

      const result = strategy.compact(events)

      expect(result.every((e) => e.type === 'message')).toBe(true)
    })
  })
})
