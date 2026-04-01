/**
 * ToolHub 集成适配器
 *
 * 将 ContextHub 的事件记录能力接入 ToolHub 的工具执行生命周期
 */

import type {
  Tool,
  ToolContext,
  ToolResult,
  ToolLifecycleHooks,
  ToolExecutionPhase,
  ContextEvent,
} from '@openclaw/suite-core'
import type { ContextManager, ContextManagerEvent } from '../ContextManager.js'
import type { DiminishingReturnsDetector } from '../detector/DiminishingReturnsDetector.js'

/**
 * 集成配置
 */
export interface ToolContextAdapterOptions {
  /** 上下文管理器 */
  contextManager: ContextManager

  /** 递减检测器（可选） */
  diminishingDetector?: DiminishingReturnsDetector

  /** 是否自动记录工具调用 */
  autoRecordToolCalls?: boolean

  /** 是否自动触发递减检测 */
  autoDetectDiminishing?: boolean

  /** 递减时触发的回调 */
  onDiminishingDetected?: (message: string) => void

  /** 达到压缩阈值时触发的回调 */
  onThresholdReached?: (usagePercent: number) => void
}

/**
 * 创建工具上下文中间件
 *
 * 这是一个函数，接收 ContextManager 和可选的 DiminishingReturnsDetector，
 * 返回一个可以被 ToolHub 的 ToolExecutor 使用的生命周期钩子集。
 *
 * 使用方式：
 * ```typescript
 * const adapter = createToolContextAdapter({
 *   contextManager,
 *   diminishingDetector,
 *   autoRecordToolCalls: true,
 * })
 *
 * const executor = new ToolExecutor({
 *   beforeExecute: adapter.hooks.beforeExecute,
 *   afterExecute: adapter.hooks.afterExecute,
 * })
 * ```
 */
export function createToolContextAdapter(options: ToolContextAdapterOptions) {
  const {
    contextManager,
    diminishingDetector,
    autoRecordToolCalls = true,
    autoDetectDiminishing = true,
    onDiminishingDetected,
    onThresholdReached,
  } = options

  // 生成唯一 ID
  let eventCounter = 0
  const nextId = () => `evt-${Date.now()}-${++eventCounter}`

  // 订阅 ContextManager 事件
  const unsubscribeThreshold = contextManager.on((event) => {
    if (event.type === 'threshold_reached') {
      onThresholdReached?.(event.usagePercent)
    }
  })

  // 订阅递减检测器
  const unsubscribeDiminishing = diminishingDetector
    ? diminishingDetector.subscribe((event) => {
        if (event.type === 'stop') {
          onDiminishingDetected?.(event.decision.message || '检测到递减收益')
        }
      })
    : undefined

  /**
   * 记录工具调用事件
   */
  function recordToolCall(
    toolId: string,
    input: unknown,
    phase: ToolExecutionPhase['phase']
  ) {
    if (!autoRecordToolCalls) return

    if (phase === 'executing') {
      contextManager.add({
        type: 'tool_call',
        id: nextId(),
        toolId,
        input,
        timestamp: Date.now(),
      })
    }
  }

  /**
   * 记录工具结果事件
   */
  function recordToolResult(
    toolId: string,
    success: boolean,
    result: unknown,
    durationMs: number
  ) {
    if (!autoRecordToolCalls) return

    contextManager.add({
      type: 'tool_result',
      id: nextId(),
      callId: `evt-${Date.now()}-${eventCounter}`,
      success,
      result,
      durationMs,
      timestamp: Date.now(),
    })
  }

  /**
   * 生命周期钩子集
   */
  const hooks: ToolLifecycleHooks = {
    beforeExecute: async (input, ctx) => {
      const toolId = (ctx as unknown as { toolId?: string }).toolId || 'unknown'
      recordToolCall(toolId, input, 'executing')
      return { input }
    },

    afterExecute: async (input, ctx, result) => {
      const toolId = (ctx as unknown as { toolId?: string }).toolId || 'unknown'

      // 记录结果
      recordToolResult(
        toolId,
        result.success,
        result.success ? result.data : result.error,
        result.metadata.durationMs
      )

      // 如果启用了递减检测，检测一下
      if (autoDetectDiminishing && diminishingDetector && result.metadata.tokenCost) {
        diminishingDetector.recordCall(result.metadata.tokenCost)
        const decision = diminishingDetector.check()

        // 如果检测到递减，发出通知
        if (!decision.shouldContinue && decision.message) {
          onDiminishingDetected?.(decision.message)
        }
      }
    },

    onError: async (input, ctx, error) => {
      const toolId = (ctx as unknown as { toolId?: string }).toolId || 'unknown'

      // 记录错误
      contextManager.add({
        type: 'tool_result',
        id: nextId(),
        callId: `evt-${Date.now()}-${eventCounter}`,
        success: false,
        error: String(error),
        durationMs: 0,
        timestamp: Date.now(),
      })
    },
  }

  /**
   * 获取辅助函数（用于手动记录）
   */
  const helpers = {
    /**
     * 记录用户消息
     */
    recordMessage(role: 'user' | 'assistant' | 'system', content: string) {
      contextManager.add({
        type: 'message',
        id: nextId(),
        role,
        content,
        timestamp: Date.now(),
      })
    },

    /**
     * 记录工具调用
     */
    recordToolCall(toolId: string, input: unknown) {
      contextManager.add({
        type: 'tool_call',
        id: nextId(),
        toolId,
        input,
        timestamp: Date.now(),
      })
    },

    /**
     * 记录工具结果
     */
    recordToolResult(
      callId: string,
      success: boolean,
      result: unknown,
      durationMs: number
    ) {
      contextManager.add({
        type: 'tool_result',
        id: nextId(),
        callId,
        success,
        result,
        durationMs,
        timestamp: Date.now(),
      })
    },

    /**
     * 销毁适配器（清理订阅）
     */
    destroy() {
      unsubscribeThreshold()
      unsubscribeDiminishing?.()
    },
  }

  return {
    hooks,
    helpers,
    contextManager,
    destroy: helpers.destroy,
  }
}

/**
 * 创建简化的工具上下文中间件（只需要 ContextManager）
 */
export function createSimpleToolMiddleware(contextManager: ContextManager) {
  let eventCounter = 0
  const nextId = () => `evt-${Date.now()}-${++eventCounter}`

  return {
    /**
     * 在工具执行前调用
     */
    beforeExecute: async (
      input: unknown,
      _ctx: ToolContext
    ): Promise<{ input: unknown }> => {
      // 注意：这里无法获取 toolId，需要在调用时传入
      return { input }
    },

    /**
     * 在工具执行后调用（需要手动传入 toolId）
     */
    afterExecuteTool(
      toolId: string,
      _input: unknown,
      result: ToolResult
    ) {
      contextManager.add({
        type: 'tool_call',
        id: nextId(),
        toolId,
        input: undefined,
        timestamp: Date.now(),
      })

      contextManager.add({
        type: 'tool_result',
        id: nextId(),
        callId: nextId(),
        success: result.success,
        result: result.success ? result.data : result.error,
        durationMs: result.metadata.durationMs,
        timestamp: Date.now(),
      })
    },

    contextManager,
  }
}
