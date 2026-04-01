/**
 * ContextHub 使用示例
 *
 * 运行方式: npx tsx examples/demo.ts
 */

import {
  ContextManager,
  DiminishingReturnsDetector,
  createCompactStrategy,
} from '../src/index.js'
import type { ContextEvent } from '@openclaw/suite-core'

async function main() {
  console.log('=== ContextHub Demo ===\n')

  // 1. 上下文管理器
  console.log('1. 上下文管理器...')
  const manager = new ContextManager({
    maxTokens: 10000,
    autoCompactThreshold: 0.8,
  })

  // 添加消息
  for (let i = 0; i < 5; i++) {
    manager.add({
      type: 'message',
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `这是第 ${i + 1} 条消息，内容为 ${'x'.repeat(100)}`,
      timestamp: Date.now(),
    })
  }

  const stats = manager.getStats()
  console.log(`   事件数: ${stats.eventCount}`)
  console.log(`   Token 使用: ${stats.totalTokens} / ${stats.tokenLimit}`)
  console.log(`   使用率: ${(stats.usagePercent * 100).toFixed(1)}%`)
  console.log()

  // 2. 递减收益检测
  console.log('2. 递减收益检测...')
  const detector = new DiminishingReturnsDetector({
    windowSize: 3,
    threshold: 500,
    stopThreshold: 0.1,
    tokenLimit: 10000,
    mode: 'average',
    autoNotify: true,
    onNotify: (msg) => console.log(`   [通知] ${msg}`),
  })

  console.log('   模拟正常调用...')
  detector.recordCall(3000)
  detector.recordCall(2800)
  detector.recordCall(2600)
  let decision = detector.check()
  console.log(`   决策: ${decision.shouldContinue ? '✅ 继续' : '❌ 停止'}`)
  console.log(`   平均 Token: ${decision.avgTokensPerCall.toFixed(0)}`)
  console.log()

  console.log('   模拟递减调用...')
  detector.recordCall(400)
  detector.recordCall(300)
  detector.recordCall(200)
  decision = detector.check()
  console.log(`   决策: ${decision.shouldContinue ? '✅ 继续' : '❌ 停止'}`)
  console.log(`   平均 Token: ${decision.avgTokensPerCall.toFixed(0)}`)
  console.log(`   递减检测: ${decision.diminishingDetected ? '⚠️ 是' : '否'}`)
  if (decision.message) {
    console.log(`   消息: ${decision.message}`)
  }
  console.log()

  // 3. 事件监听
  console.log('3. 递减检测事件监听...')
  const detector2 = new DiminishingReturnsDetector({
    windowSize: 2,
    threshold: 500,
    autoNotify: false,
  })

  detector2.subscribe((event) => {
    if (event.type === 'stop') {
      console.log(`   [监听] Agent 应该停止！`)
      console.log(`   [监听] 连续 ${event.decision.continuationCount} 次递减`)
    } else if (event.type === 'continuation') {
      console.log(`   [监听] 第 ${event.decision.continuationCount} 次递减`)
    }
  })

  // 触发停止
  detector2.recordCall(200)
  detector2.recordCall(150)
  detector2.recordCall(100)
  detector2.check()
  console.log()

  // 4. 压缩策略
  console.log('4. 压缩策略...')

  // 准备测试事件
  const events: ContextEvent[] = [
    {
      type: 'message',
      id: '1',
      role: 'user',
      content: 'Hello!',
      timestamp: Date.now(),
    },
    {
      type: 'message',
      id: '2',
      role: 'assistant',
      content: 'Hi there!',
      timestamp: Date.now(),
    },
    {
      type: 'message',
      id: '3',
      role: 'user',
      content: 'How are you?',
      timestamp: Date.now(),
    },
    {
      type: 'tool_call',
      id: '4',
      toolId: 'stock/daily',
      input: { code: '000001' },
      timestamp: Date.now(),
    },
    {
      type: 'tool_call',
      id: '5',
      toolId: 'verify/check',
      input: { file: 'test.ts' },
      timestamp: Date.now(),
    },
    {
      type: 'tool_result',
      id: '6',
      callId: '5',
      success: true,
      result: { verified: true },
      durationMs: 100,
      timestamp: Date.now(),
    },
  ]

  console.log(`   原始事件数: ${events.length}`)

  // 微压缩
  const micro = createCompactStrategy('micro')
  const microResult = micro.compact(events)
  console.log(`   微压缩后: ${microResult.length} 个事件`)
  console.log(`   示例合并: ${events.filter(e => e.type === 'message').length} -> ${microResult.filter(e => e.type === 'message').length} 条消息`)
  console.log()

  // 5. 完整流程演示
  console.log('5. 完整流程演示...')
  const ctx = new ContextManager({ maxTokens: 5000 })

  // 模拟对话
  const messages = [
    '你好',
    '我想了解今天的股票行情',
    '帮我查一下茅台的股价',
    '最近有什么热点新闻？',
    '分析一下大盘走势',
  ]

  for (const msg of messages) {
    ctx.add({
      type: 'message',
      id: `msg-${Date.now()}-${Math.random()}`,
      role: 'user',
      content: msg,
      timestamp: Date.now(),
    })
  }

  // 检查使用率
  const ctxStats = ctx.getStats()
  console.log(`   Token 使用: ${ctxStats.totalTokens} / ${ctxStats.tokenLimit} (${(ctxStats.usagePercent * 100).toFixed(1)}%)`)

  if (ctx.shouldAutoCompact()) {
    console.log('   ⚠️ 达到压缩阈值，执行微压缩...')
    const result = await ctx.compact('micro')
    console.log(`   压缩节省: ${result.savedTokens} tokens`)
    console.log(`   压缩后事件: ${result.compactedEventCount} 个`)
  } else {
    console.log('   ✅ 上下文正常，无需压缩')
  }
  console.log()

  console.log('=== Demo 完成 ===')
}

main().catch(console.error)
