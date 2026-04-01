/**
 * 上下文相关类型定义
 * 对应 api-standards.md 三
 */

// ============================================================================
// 上下文事件
// ============================================================================

/** 上下文事件类型 */
export type ContextEvent =
  | MessageEvent
  | ToolCallEvent
  | ToolResultEvent
  | MemoryEvent
  | CompactEvent

/** 消息事件 */
export interface MessageEvent {
  readonly type: 'message'
  readonly id: string
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
  readonly timestamp: number
  readonly tokenCount?: number
}

/** 工具调用事件 */
export interface ToolCallEvent {
  readonly type: 'tool_call'
  readonly id: string
  readonly toolId: string
  readonly input: unknown
  readonly timestamp: number
}

/** 工具结果事件 */
export interface ToolResultEvent {
  readonly type: 'tool_result'
  readonly id: string
  readonly callId: string
  readonly success: boolean
  readonly result?: unknown
  readonly error?: string
  readonly durationMs: number
}

/** 记忆事件 */
export interface MemoryEvent {
  readonly type: 'memory'
  readonly action: 'read' | 'write' | 'forget'
  readonly content: unknown
  readonly timestamp: number
}

/** 压缩事件 */
export interface CompactEvent {
  readonly type: 'compact'
  readonly strategy: 'micro' | 'auto' | 'manual'
  readonly inputEventIds: string[]
  readonly outputSummary: string
  readonly savedTokens: number
  readonly timestamp: number
}

// ============================================================================
// 上下文管理器
// ============================================================================

/** 获取上下文选项 */
export interface GetContextOptions {
  readonly maxTokens?: number
  readonly includeTypes?: ContextEvent['type'][]
  readonly excludeTypes?: ContextEvent['type'][]
}

/** 上下文快照 */
export interface ContextSnapshot {
  readonly events: ContextEvent[]
  readonly totalTokens: number
  readonly tokenLimit: number
  readonly usagePercent: number
}

/** 压缩结果 */
export interface CompactResult {
  readonly originalEventCount: number
  readonly compactedEventCount: number
  readonly savedTokens: number
  readonly summary: string
  readonly compactedEventIds: string[]
}

/** 上下文统计 */
export interface ContextStats {
  readonly eventCount: number
  readonly totalTokens: number
  readonly tokenLimit: number
  readonly usagePercent: number
  readonly oldestEventAge?: number
  readonly newestEventAge?: number
}

/** 上下文管理器接口 */
export interface ContextManager {
  add(event: ContextEvent): void
  getContext(options?: GetContextOptions): Promise<ContextSnapshot>
  compact(strategy: 'micro' | 'manual'): Promise<CompactResult>
  shouldAutoCompact(): boolean
  getStats(): ContextStats
}

// ============================================================================
// 递减收益检测
// ============================================================================

/** 递减收益配置 */
export interface DiminishingReturnsConfig {
  readonly maxContinuations: number
  readonly minTokensPerCall: number
  readonly stopThreshold: number
  readonly tokenLimit: number
}

/** 可配置的检测器选项 */
export interface ConfigurableDetectorOptions {
  /** 滑动窗口大小 - 监控最近 N 次调用 */
  readonly windowSize?: number

  /** 递减阈值 - 低于此值认为递减 */
  readonly threshold?: number

  /** 停止阈值 - 单次使用率低于此值强制停止 */
  readonly stopThreshold?: number

  /** Token 上限 */
  readonly tokenLimit?: number

  /** 递减检测模式 */
  readonly mode?: 'average' | 'latest' | 'slope'
}

/** 默认配置 */
export const DEFAULT_DR_CONFIG: DiminishingReturnsConfig = {
  maxContinuations: 3,
  minTokensPerCall: 500,
  stopThreshold: 0.1,
  tokenLimit: 100000,
}

/** 递减收益决策 */
export interface DiminishingReturnsDecision {
  readonly shouldContinue: boolean
  readonly continuationCount: number
  readonly avgTokensPerCall: number
  readonly diminishingDetected: boolean
  readonly message?: string
}

/** 递减收益检测器 */
export class DiminishingReturnsDetector {
  private readonly config: DiminishingReturnsConfig
  private readonly options: Required<ConfigurableDetectorOptions>
  private callHistory: number[] = []
  private continuationCount = 0

  constructor(options: ConfigurableDetectorOptions = {}) {
    this.options = {
      windowSize: options.windowSize ?? 3,
      threshold: options.threshold ?? 500,
      stopThreshold: options.stopThreshold ?? 0.1,
      tokenLimit: options.tokenLimit ?? 100000,
      mode: options.mode ?? 'average',
    }
    this.config = {
      maxContinuations: this.options.windowSize,
      minTokensPerCall: this.options.threshold,
      stopThreshold: this.options.stopThreshold,
      tokenLimit: this.options.tokenLimit,
    }
  }

  /** 记录一次模型调用 */
  recordCall(tokensUsed: number): void {
    this.callHistory.push(tokensUsed)

    // 只保留最近 windowSize 次调用
    if (this.callHistory.length > this.options.windowSize) {
      this.callHistory.shift()
    }
  }

  /** 检查是否应该继续 */
  shouldStop(): DiminishingReturnsDecision {
    if (this.callHistory.length < 2) {
      return {
        shouldContinue: true,
        continuationCount: 0,
        avgTokensPerCall: 0,
        diminishingDetected: false,
      }
    }

    let avgTokens: number
    let diminishingDetected: boolean

    switch (this.options.mode) {
      case 'latest':
        // 只看最新一次
        avgTokens = this.callHistory[this.callHistory.length - 1]
        diminishingDetected =
          this.callHistory.length >= this.options.windowSize &&
          avgTokens < this.options.threshold
        break

      case 'slope':
        // 检测下降斜率
        if (this.callHistory.length < 3) {
          avgTokens = this.callHistory[this.callHistory.length - 1]
          diminishingDetected = false
        } else {
          // 计算斜率
          const n = this.callHistory.length
          const xMean = (n - 1) / 2
          const yMean =
            this.callHistory.reduce((a, b) => a + b, 0) / n
          let numerator = 0
          let denominator = 0
          for (let i = 0; i < n; i++) {
            numerator += (i - xMean) * (this.callHistory[i] - yMean)
            denominator += (i - xMean) ** 2
          }
          const slope = numerator / denominator
          // 负斜率且绝对值大于阈值
          diminishingDetected =
            slope < -this.options.threshold / 10
          avgTokens = this.callHistory[this.callHistory.length - 1]
        }
        break

      case 'average':
      default:
        // 默认：使用平均
        avgTokens =
          this.callHistory.reduce((a, b) => a + b, 0) /
          this.callHistory.length

        // 检测递减
        let decreasing = true
        for (let i = 1; i < this.callHistory.length; i++) {
          if (this.callHistory[i] >= this.callHistory[i - 1] * 0.8) {
            decreasing = false
            break
          }
        }

        diminishingDetected =
          decreasing &&
          this.callHistory.length >= this.options.windowSize &&
          avgTokens < this.options.threshold
        break
    }

    // 检查 token 使用率
    const lastCallTokens = this.callHistory[this.callHistory.length - 1]
    const usagePercent = lastCallTokens / this.options.tokenLimit
    const lowUsage = usagePercent < this.options.stopThreshold

    if (diminishingDetected || lowUsage) {
      this.continuationCount++
    } else {
      this.continuationCount = 0
    }

    const message = diminishingDetected
      ? `检测到递减收益（${this.options.mode}模式）：连续 ${this.callHistory.length} 次调用，平均 token ${avgTokens.toFixed(0)}，低于阈值 ${this.options.threshold}`
      : lowUsage
      ? `Token 使用率 ${(usagePercent * 100).toFixed(1)}%，低于停止阈值 ${(this.options.stopThreshold * 100).toFixed(0)}%`
      : undefined

    return {
      shouldContinue: !diminishingDetected && !lowUsage,
      continuationCount: this.continuationCount,
      avgTokensPerCall: avgTokens,
      diminishingDetected,
      message,
    }
  }

  /** 重置 */
  reset(): void {
    this.callHistory = []
    this.continuationCount = 0
  }
}

// ============================================================================
// 压缩策略
// ============================================================================

/** 微压缩配置 */
export interface MicroCompactConfig {
  readonly mergeConsecutiveMessages: boolean
  readonly truncateLongOutputs: boolean
  readonly maxOutputLength: number
}

/** 自动压缩配置 */
export interface AutoCompactConfig {
  readonly threshold: number             // 使用率达到此值时触发
  readonly priority: 'token' | 'time'   // 按 token 优先还是时间优先
  readonly preservePatterns: string[]    // 保留匹配这些模式的工具调用
}

/** 默认微压缩配置 */
export const DEFAULT_MICRO_CONFIG: MicroCompactConfig = {
  mergeConsecutiveMessages: true,
  truncateLongOutputs: true,
  maxOutputLength: 500,
}

/** 默认自动压缩配置 */
export const DEFAULT_AUTO_CONFIG: AutoCompactConfig = {
  threshold: 0.8,
  priority: 'token',
  preservePatterns: ['*/verify', '*/test'],
}
