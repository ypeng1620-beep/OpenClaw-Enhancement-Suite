/**
 * 压缩策略
 */

import type { ContextEvent } from '@openclaw/suite-core'

/**
 * 压缩策略接口
 */
export interface CompactStrategy {
  name: string
  compact(events: ContextEvent[]): ContextEvent[]
}

/**
 * 微压缩策略
 *
 * - 合并连续同角色消息
 * - 截断长输出
 * - 删除重复的工具调用结果
 */
export class MicroCompactStrategy implements CompactStrategy {
  name = 'micro'

  constructor(private maxOutputLength = 500) {}

  compact(events: ContextEvent[]): ContextEvent[] {
    const result: ContextEvent[] = []

    for (const event of events) {
      const prev = result[result.length - 1]

      // 合并连续的消息
      if (
        prev &&
        prev.type === 'message' &&
        event.type === 'message' &&
        prev.role === event.role
      ) {
        // 替换为合并后的消息（避免修改 readonly）
        result.pop()
        result.push({
          ...prev,
          content: prev.content + '\n' + event.content,
        })
        continue
      }

      // 截断长输出
      if (event.type === 'tool_result' && event.result) {
        const str = JSON.stringify(event.result)
        if (str.length > this.maxOutputLength) {
          result.push({
            ...event,
            result: `[TRUNCATED ${str.length} -> ${this.maxOutputLength}] ${str.slice(0, this.maxOutputLength)}`,
          })
          continue
        }
      }

      result.push(event)
    }

    return result
  }
}

/**
 * 自动压缩策略
 *
 * - 生成结构化摘要
 * - 保留关键决策
 * - 删除中间过程
 */
export class AutoCompactStrategy implements CompactStrategy {
  name = 'auto'

  constructor(private preservePatterns: string[] = ['*/verify', '*/test']) {}

  compact(events: ContextEvent[]): ContextEvent[] {
    const result: ContextEvent[] = []
    let pendingSummary: string[] = []

    for (const event of events) {
      // 保留匹配保留模式的工具调用
      if (event.type === 'tool_call') {
        const shouldPreserve = this.preservePatterns.some(
          (pattern) => this.matchPattern(event.toolId, pattern)
        )

        if (shouldPreserve) {
          // 刷新待摘要
          if (pendingSummary.length > 0) {
            result.push(this.createSummaryEvent(pendingSummary))
            pendingSummary = []
          }
          result.push(event)
          continue
        }

        // 记录到摘要
        pendingSummary.push(this.summarizeToolCall(event))
        continue
      }

      // 保留消息
      if (event.type === 'message') {
        // 刷新待摘要
        if (pendingSummary.length > 0) {
          result.push(this.createSummaryEvent(pendingSummary))
          pendingSummary = []
        }
        result.push(event)
        continue
      }

      // 保留其他事件
      result.push(event)
    }

    // 处理剩余的待摘要
    if (pendingSummary.length > 0) {
      result.push(this.createSummaryEvent(pendingSummary))
    }

    return result
  }

  private matchPattern(toolId: string, pattern: string): boolean {
    const regex = new RegExp(
      '^' +
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$'
    )
    return regex.test(toolId)
  }

  private summarizeToolCall(event: ContextEvent): string {
    if (event.type !== 'tool_call') return ''
    const inputStr = JSON.stringify(event.input)
    return `${event.toolId}(${inputStr.slice(0, 50)})`
  }

  private createSummaryEvent(parts: string[]): ContextEvent {
    return {
      type: 'compact',
      strategy: 'auto',
      inputEventIds: [],
      outputSummary: `Auto-summary: ${parts.length} tool calls. ${parts.slice(0, 3).join('; ')}${parts.length > 3 ? '...' : ''}`,
      savedTokens: parts.length * 50,
      timestamp: Date.now(),
    }
  }
}

/**
 * 手动压缩策略
 *
 * 保留用户指定的关键信息
 */
export class ManualCompactStrategy implements CompactStrategy {
  name = 'manual'

  constructor(
    private preserveTypes: ContextEvent['type'][] = ['message'],
    private preserveTags: string[] = []
  ) {}

  compact(events: ContextEvent[]): ContextEvent[] {
    return events.filter((event) => {
      // 保留指定类型
      if (this.preserveTypes.includes(event.type)) {
        return true
      }

      // 保留有指定标签的事件
      if (
        event.type === 'tool_call' &&
        this.preserveTags.some((tag) => event.toolId.includes(tag))
      ) {
        return true
      }

      return false
    })
  }
}

/**
 * 创建压缩策略
 */
export function createCompactStrategy(
  type: 'micro' | 'auto' | 'manual',
  options?: {
    maxOutputLength?: number
    preservePatterns?: string[]
    preserveTypes?: ContextEvent['type'][]
    preserveTags?: string[]
  }
): CompactStrategy {
  switch (type) {
    case 'micro':
      return new MicroCompactStrategy(options?.maxOutputLength ?? 500)

    case 'auto':
      return new AutoCompactStrategy(options?.preservePatterns)

    case 'manual':
      return new ManualCompactStrategy(
        options?.preserveTypes ?? ['message'],
        options?.preserveTags ?? []
      )

    default:
      throw new Error(`Unknown compact strategy: ${type}`)
  }
}
