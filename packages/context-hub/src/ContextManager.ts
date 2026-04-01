/**
 * 上下文管理器
 *
 * 管理会话上下文事件，支持压缩和递减检测
 */

import type {
  ContextEvent,
  ContextSnapshot,
  GetContextOptions,
  CompactResult,
  ContextStats,
} from '@openclaw/suite-core'

/**
 * 上下文管理器事件
 */
export type ContextManagerEvent =
  | { type: 'event_added'; event: ContextEvent }
  | { type: 'compact_start'; strategy: 'micro' | 'auto' | 'manual' }
  | { type: 'compact_complete'; result: CompactResult }
  | { type: 'threshold_reached'; usagePercent: number }
  | { type: 'cleared' }

/**
 * 上下文管理器配置
 */
export interface ContextManagerOptions {
  /** 最大 token 数 */
  maxTokens?: number

  /** 自动压缩阈值（0-1） */
  autoCompactThreshold?: number

  /** 是否自动启用递减检测 */
  enableDiminishingDetection?: boolean

  /** 微压缩配置 */
  microCompactConfig?: {
    mergeConsecutiveMessages?: boolean
    truncateLongOutputs?: boolean
    maxOutputLength?: number
  }
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: Required<ContextManagerOptions> = {
  maxTokens: 100000,
  autoCompactThreshold: 0.8,
  enableDiminishingDetection: true,
  microCompactConfig: {
    mergeConsecutiveMessages: true,
    truncateLongOutputs: true,
    maxOutputLength: 500,
  },
}

/**
 * 上下文管理器
 */
export class ContextManager {
  private readonly options: Required<ContextManagerOptions>
  private readonly events: ContextEvent[] = []
  private tokenCount = 0
  private readonly listeners: Set<(event: ContextManagerEvent) => void> = new Set()

  constructor(options: ContextManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  // =========================================================================
  // 事件通知
  // =========================================================================

  /**
   * 订阅事件
   */
  on(handler: (event: ContextManagerEvent) => void): () => void {
    this.listeners.add(handler)
    return () => this.listeners.delete(handler)
  }

  /**
   * 发出事件
   */
  private emit(event: ContextManagerEvent): void {
    this.listeners.forEach((handler) => handler(event))
  }

  // =========================================================================
  // 事件管理
  // =========================================================================

  /**
   * 添加事件
   */
  add(event: ContextEvent): void {
    this.events.push(event)
    this.tokenCount += this.estimateTokens(event)

    // 发出事件
    this.emit({ type: 'event_added', event })

    // 检查是否达到阈值
    const usagePercent = this.tokenCount / this.options.maxTokens
    if (usagePercent >= this.options.autoCompactThreshold) {
      this.emit({ type: 'threshold_reached', usagePercent })
    }
  }

  /**
   * 批量添加事件
   */
  addMany(events: ContextEvent[]): void {
    for (const event of events) {
      this.add(event)
    }
  }

  /**
   * 获取上下文快照
   */
  async getContext(options?: GetContextOptions): Promise<ContextSnapshot> {
    let events = [...this.events]

    // 按类型过滤
    if (options?.includeTypes?.length) {
      events = events.filter((e) =>
        options.includeTypes!.includes(e.type)
      )
    }
    if (options?.excludeTypes?.length) {
      events = events.filter(
        (e) => !options.excludeTypes!.includes(e.type)
      )
    }

    // 按 token 限制
    let tokenCount = 0
    const maxTokens = options?.maxTokens ?? this.options.maxTokens
    const filteredEvents: ContextEvent[] = []

    for (const event of events) {
      const eventTokens = this.estimateTokens(event)
      if (tokenCount + eventTokens <= maxTokens) {
        filteredEvents.push(event)
        tokenCount += eventTokens
      } else {
        break
      }
    }

    return {
      events: filteredEvents,
      totalTokens: tokenCount,
      tokenLimit: maxTokens,
      usagePercent: tokenCount / maxTokens,
    }
  }

  // =========================================================================
  // 压缩
  // =========================================================================

  /**
   * 执行微压缩
   */
  async compact(strategy: 'micro' | 'manual'): Promise<CompactResult> {
    this.emit({ type: 'compact_start', strategy })

    const originalCount = this.events.length
    const originalTokens = this.tokenCount
    const compactedEventIds: string[] = []

    if (strategy === 'micro') {
      this.microCompact(compactedEventIds)
    }

    const savedTokens = originalTokens - this.tokenCount

    const result: CompactResult = {
      originalEventCount: originalCount,
      compactedEventCount: this.events.length,
      savedTokens,
      summary: this.generateSummary(strategy),
      compactedEventIds,
    }

    this.emit({ type: 'compact_complete', result })

    return result
  }

  /**
   * 微压缩：合并连续消息、截断长输出
   */
  private microCompact(compactedEventIds: string[]): void {
    const cfg = this.options.microCompactConfig
    const newEvents: ContextEvent[] = []

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i]

      // 合并连续的消息
      if (cfg.mergeConsecutiveMessages) {
        const prev = newEvents[newEvents.length - 1]
        if (
          prev &&
          prev.type === 'message' &&
          event.type === 'message' &&
          prev.role === event.role
        ) {
          // 合并
          prev.content += '\n' + event.content
          compactedEventIds.push(event.id)
          continue
        }
      }

      // 截断长输出
      if (cfg.truncateLongOutputs) {
        if (event.type === 'tool_result' && event.result) {
          const resultStr = JSON.stringify(event.result)
          if (resultStr.length > cfg.maxOutputLength) {
            // 截断并标记
            newEvents.push({
              ...event,
              result: '[TRUNCATED] ' + resultStr.slice(0, cfg.maxOutputLength),
            })
            compactedEventIds.push(event.id)
            continue
          }
        }
      }

      newEvents.push(event)
    }

    this.events.length = 0
    this.events.push(...newEvents)
    this.recalculateTokens()
  }

  /**
   * 生成压缩摘要
   */
  private generateSummary(strategy: string): string {
    const eventCounts = new Map<string, number>()
    for (const event of this.events) {
      eventCounts.set(event.type, (eventCounts.get(event.type) || 0) + 1)
    }

    const parts: string[] = []
    for (const [type, count] of eventCounts) {
      parts.push(`${type}: ${count}`)
    }

    return `Context compacted (${strategy}). ${parts.join(', ')}`
  }

  // =========================================================================
  // 递减检测
  // =========================================================================

  /**
   * 是否应该自动压缩
   */
  shouldAutoCompact(): boolean {
    return this.tokenCount / this.options.maxTokens >= this.options.autoCompactThreshold
  }

  // =========================================================================
  // 统计
  // =========================================================================

  /**
   * 获取统计信息
   */
  getStats(): ContextStats {
    const now = Date.now()
    const oldestEvent = this.events[0]
    const newestEvent = this.events[this.events.length - 1]

    return {
      eventCount: this.events.length,
      totalTokens: this.tokenCount,
      tokenLimit: this.options.maxTokens,
      usagePercent: this.tokenCount / this.options.maxTokens,
      oldestEventAge: oldestEvent
        ? (now - oldestEvent.timestamp) / 1000
        : undefined,
      newestEventAge: newestEvent
        ? (now - newestEvent.timestamp) / 1000
        : undefined,
    }
  }

  // =========================================================================
  // 辅助
  // =========================================================================

  /**
   * 估算 token 数量（简化版：按字符数估算）
   */
  private estimateTokens(event: ContextEvent): number {
    const baseTokens = 10 // 每个事件的基础 token

    switch (event.type) {
      case 'message':
        return baseTokens + Math.ceil(event.content.length / 4)
      case 'tool_call':
        return baseTokens + Math.ceil(JSON.stringify(event.input).length / 4)
      case 'tool_result':
        return baseTokens + Math.ceil(JSON.stringify(event.result).length / 4)
      case 'compact':
        return baseTokens + Math.ceil(event.outputSummary.length / 4)
      default:
        return baseTokens
    }
  }

  /**
   * 重新计算 token 总数
   */
  private recalculateTokens(): void {
    this.tokenCount = this.events.reduce(
      (sum, event) => sum + this.estimateTokens(event),
      0
    )
  }

  /**
   * 清空所有事件
   */
  clear(): void {
    this.events.length = 0
    this.tokenCount = 0
    this.emit({ type: 'cleared' })
  }
}
