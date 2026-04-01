/**
 * 工具执行器 - 处理工具执行的全生命周期
 */

import type {
  Tool,
  ToolContext,
  ToolResult,
  ToolLifecycleHooks,
  ToolExecutionPhase,
} from '@openclaw/suite-core'

/**
 * 工具执行器配置
 */
export interface ToolExecutorOptions {
  /** 默认超时（毫秒） */
  defaultTimeoutMs?: number

  /** 是否启用生命周期钩子 */
  enableHooks?: boolean

  /** 执行前钩子 */
  beforeExecute?: ToolLifecycleHooks['beforeExecute']

  /** 执行后钩子 */
  afterExecute?: ToolLifecycleHooks['afterExecute']

  /** 错误钩子 */
  onError?: ToolLifecycleHooks['onError']
}

/**
 * 工具执行器
 *
 * 负责工具执行的完整生命周期：
 * 1. beforeExecute 钩子
 * 2. 参数验证（如果工具定义了 schema）
 * 3. 执行工具
 * 4. afterExecute 钩子
 * 5. 错误处理
 */
export class ToolExecutor {
  private readonly defaultTimeoutMs: number
  private readonly enableHooks: boolean
  private readonly globalBeforeExecute?: ToolLifecycleHooks['beforeExecute']
  private readonly globalAfterExecute?: ToolLifecycleHooks['afterExecute']
  private readonly globalOnError?: ToolLifecycleHooks['onError']

  constructor(options: ToolExecutorOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30000
    this.enableHooks = options.enableHooks ?? true
    this.globalBeforeExecute = options.beforeExecute
    this.globalAfterExecute = options.afterExecute
    this.globalOnError = options.onError
  }

  /**
   * 执行工具
   */
  async execute(
    tool: Tool,
    input: unknown,
    context: ToolContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    let currentInput = input

    try {
      // =====================================================================
      // 阶段 1: beforeExecute 钩子
      // =====================================================================
      currentInput = await this.runBeforeExecute(tool, currentInput, context)

      // =====================================================================
      // 阶段 2: 执行工具
      // =====================================================================
      const result = await this.runWithTimeout(
        tool,
        currentInput,
        context,
        tool.capabilities.longRunning
          ? this.defaultTimeoutMs * 10
          : this.defaultTimeoutMs
      )

      // =====================================================================
      // 阶段 3: afterExecute 钩子
      // =====================================================================
      await this.runAfterExecute(tool, currentInput, context, result)

      return result
    } catch (error) {
      // =====================================================================
      // 阶段 4: 错误处理
      // =====================================================================

      // 超时错误
      if (error instanceof TimeoutError) {
        const result = this.createErrorResult(
          tool,
          startTime,
          'TIMEOUT',
          `Tool execution timed out after ${(error as TimeoutError).durationMs}ms`,
          true // 可恢复
        )
        await this.runOnError(tool, currentInput, context, error)
        return result
      }

      // 其他错误
      const result = this.createErrorResult(
        tool,
        startTime,
        'EXECUTION_ERROR',
        error instanceof Error ? error.message : String(error),
        true // 可恢复
      )

      await this.runOnError(tool, currentInput, context, error)

      return result
    }
  }

  // =========================================================================
  // 生命周期钩子
  // =========================================================================

  private async runBeforeExecute(
    tool: Tool,
    input: unknown,
    context: ToolContext
  ): Promise<unknown> {
    if (!this.enableHooks) return input

    // 工具自身的钩子
    const toolHook = tool.hooks?.beforeExecute
    // 全局钩子
    const globalHook = this.globalBeforeExecute

    // 先运行全局钩子
    if (globalHook) {
      const globalResult = await globalHook(input, context)
      if ('reject' in globalResult) {
        throw new HookRejectedError(tool.id, globalResult.reason)
      }
      input = globalResult.input
    }

    // 再运行工具钩子
    if (toolHook) {
      const toolResult = await toolHook(input, context)
      if ('reject' in toolResult) {
        throw new HookRejectedError(tool.id, toolResult.reason)
      }
      input = toolResult.input
    }

    return input
  }

  private async runAfterExecute(
    tool: Tool,
    input: unknown,
    context: ToolContext,
    result: ToolResult
  ): Promise<void> {
    if (!this.enableHooks) return

    // 工具自身的钩子
    const toolHook = tool.hooks?.afterExecute
    // 全局钩子
    const globalHook = this.globalAfterExecute

    if (toolHook) {
      await toolHook(input, context, result)
    }

    if (globalHook) {
      await globalHook(input, context, result)
    }
  }

  private async runOnError(
    tool: Tool,
    input: unknown,
    context: ToolContext,
    error: unknown
  ): Promise<void> {
    if (!this.enableHooks) return

    // 工具自身的钩子
    const toolHook = tool.hooks?.onError
    // 全局钩子
    const globalHook = this.globalOnError

    if (toolHook) {
      await toolHook(input, context, error)
    }

    if (globalHook) {
      await globalHook(input, context, error)
    }
  }

  // =========================================================================
  // 工具执行
  // =========================================================================

  private async runWithTimeout(
    tool: Tool,
    input: unknown,
    context: ToolContext,
    timeoutMs: number
  ): Promise<ToolResult> {
    return Promise.race([
      tool.execute(input, context),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new TimeoutError(tool.id, timeoutMs)),
          timeoutMs
        )
      ),
    ])
  }

  // =========================================================================
  // 错误结果
  // =========================================================================

  private createErrorResult(
    tool: Tool,
    startTime: number,
    code: string,
    message: string,
    recoverable: boolean
  ): ToolResult {
    return {
      success: false,
      error: { code, message, recoverable },
      metadata: {
        toolId: tool.id,
        durationMs: Date.now() - startTime,
      },
    }
  }
}

/**
 * 超时错误
 */
class TimeoutError extends Error {
  readonly toolId: string
  readonly durationMs: number

  constructor(toolId: string, durationMs: number) {
    super(`Tool execution timed out: ${toolId}`)
    this.name = 'TimeoutError'
    this.toolId = toolId
    this.durationMs = durationMs
  }
}

/**
 * Hook 拒绝错误
 */
class HookRejectedError extends Error {
  readonly toolId: string
  readonly reason: string

  constructor(toolId: string, reason: string) {
    super(`Tool hook rejected: ${toolId} - ${reason}`)
    this.name = 'HookRejectedError'
    this.toolId = toolId
    this.reason = reason
  }
}
