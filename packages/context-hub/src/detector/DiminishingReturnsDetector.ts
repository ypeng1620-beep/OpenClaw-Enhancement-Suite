/**
 * 递减收益检测器
 *
 * 集成 core 的 DiminishingReturnsDetector，添加与 ContextManager 的联动
 */

import {
  DiminishingReturnsDetector as CoreDetector,
  type DiminishingReturnsConfig,
  type DiminishingReturnsDecision,
} from '@openclaw/suite-core'

/**
 * 检测器事件类型
 */
export type DetectorEvent =
  | { type: 'continuation'; decision: DiminishingReturnsDecision }
  | { type: 'stop'; decision: DiminishingReturnsDecision }
  | { type: 'reset' }

/**
 * 检测器配置
 */
export interface DetectorOptions {
  /** 滑动窗口大小 */
  readonly windowSize?: number

  /** 递减阈值 */
  readonly threshold?: number

  /** 停止阈值 */
  readonly stopThreshold?: number

  /** Token 上限 */
  readonly tokenLimit?: number

  /** 递减检测模式 */
  readonly mode?: 'average' | 'latest' | 'slope'

  /** 是否在停止时自动通知 */
  autoNotify?: boolean

  /** 通知回调 */
  onNotify?: (message: string) => void

  /** 是否在停止时自动重置 */
  autoReset?: boolean
}

/**
 * 递减收益检测器（增强版）
 */
export class DiminishingReturnsDetector {
  private readonly core: CoreDetector
  private readonly options: Required<DetectorOptions>
  private listeners: Set<(event: DetectorEvent) => void> = new Set()

  constructor(options: DetectorOptions = {}) {
    this.options = {
      windowSize: options.windowSize ?? 3,
      threshold: options.threshold ?? 500,
      stopThreshold: options.stopThreshold ?? 0.1,
      tokenLimit: options.tokenLimit ?? 100000,
      mode: options.mode ?? 'average',
      autoNotify: options.autoNotify ?? false,
      onNotify: options.onNotify ?? (() => {}),
      autoReset: options.autoReset ?? false,
    }

    this.core = new CoreDetector({
      windowSize: this.options.windowSize,
      threshold: this.options.threshold,
      stopThreshold: this.options.stopThreshold,
      tokenLimit: this.options.tokenLimit,
      mode: this.options.mode,
    })
  }

  /**
   * 记录一次调用
   */
  recordCall(tokensUsed: number): void {
    this.core.recordCall(tokensUsed)
  }

  /**
   * 检查是否应该继续
   */
  check(): DiminishingReturnsDecision {
    const decision = this.core.shouldStop()

    if (!decision.shouldContinue) {
      // 触发停止事件
      this.emit({ type: 'stop', decision })

      // 发送通知
      if (this.options.autoNotify && decision.message) {
        this.options.onNotify(decision.message)
      }

      // 自动重置
      if (this.options.autoReset) {
        this.reset()
      }
    } else if (decision.continuationCount > 0) {
      this.emit({ type: 'continuation', decision })
    }

    return decision
  }

  /**
   * 重置
   */
  reset(): void {
    this.core.reset()
    this.emit({ type: 'reset' })
  }

  /**
   * 添加监听
   */
  subscribe(handler: (event: DetectorEvent) => void): () => void {
    this.listeners.add(handler)
    return () => this.listeners.delete(handler)
  }

  private emit(event: DetectorEvent): void {
    this.listeners.forEach((handler) => handler(event))
  }

  /**
   * 获取当前决策（不触发副作用）
   */
  peek(): DiminishingReturnsDecision {
    return this.core.shouldStop()
  }
}

/**
 * 创建检测器（快捷方式）
 */
export function createDetector(options?: DetectorOptions): DiminishingReturnsDetector {
  return new DiminishingReturnsDetector(options)
}
