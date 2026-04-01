/**
 * 权限守卫
 *
 * 提供更高层次的权限保护接口
 */

import type { Tool, ToolContext, ToolResult } from '@openclaw/suite-core'
import { PermissionChecker } from './PermissionChecker.js'
import type { PermissionCheckerOptions } from './PermissionChecker.js'
import type { PermissionRule } from '@openclaw/suite-core'

/**
 * 权限守卫配置
 */
export interface PermissionGuardOptions {
  /** 权限检查器 */
  checker?: PermissionChecker

  /** 检查器配置 */
  checkerConfig?: PermissionCheckerOptions

  /** 允许的工具白名单（优先于黑名单） */
  allowedTools?: Set<string>

  /** 禁止的工具黑名单 */
  blockedTools?: Set<string>

  /** 是否在禁止时抛出错误 */
  throwOnDenied?: boolean

  /** 默认拒绝消息 */
  defaultDeniedMessage?: string
}

/**
 * 权限守卫
 *
 * 用于保护工具执行
 */
export class PermissionGuard {
  private readonly checker: PermissionChecker
  private readonly allowedTools?: Set<string>
  private readonly blockedTools?: Set<string>
  private readonly throwOnDenied: boolean
  private readonly defaultDeniedMessage: string

  constructor(options: PermissionGuardOptions = {}) {
    this.checker =
      options.checker ||
      new PermissionChecker(options.checkerConfig)
    this.allowedTools = options.allowedTools
    this.blockedTools = options.blockedTools
    this.throwOnDenied = options.throwOnDenied ?? true
    this.defaultDeniedMessage =
      options.defaultDeniedMessage ?? 'Permission denied'
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    await this.checker.initialize()
  }

  /**
   * 检查工具执行权限
   */
  async checkToolAccess(
    toolId: string,
    input: unknown,
    context: ToolContext
  ): Promise<boolean> {
    // 白名单检查
    if (this.allowedTools && !this.allowedTools.has(toolId)) {
      return false
    }

    // 黑名单检查
    if (this.blockedTools && this.blockedTools.has(toolId)) {
      return false
    }

    // 权限检查
    const decision = await this.checker.check({
      subject: {
        userId: context.userId,
        agentId: context.agentId,
      },
      object: {
        toolId,
        input,
      },
      sessionId: context.sessionId,
    })

    return decision.effect === 'allow'
  }

  /**
   * 执行带权限检查的工具
   */
  async executeWithGuard(
    tool: Tool,
    input: unknown,
    context: ToolContext
  ): Promise<ToolResult> {
    // 检查权限
    const allowed = await this.checkToolAccess(tool.id, input, context)

    if (!allowed) {
      if (this.throwOnDenied) {
        throw new PermissionDeniedError(
          tool.id,
          this.defaultDeniedMessage
        )
      }

      return {
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: this.defaultDeniedMessage,
          recoverable: true,
        },
        metadata: {
          toolId: tool.id,
          durationMs: 0,
        },
      }
    }

    // 执行工具
    return tool.execute(input, context)
  }

  /**
   * 创建权限检查中间件
   */
  createMiddleware() {
    return async (
      tool: Tool,
      input: unknown,
      context: ToolContext,
      next: () => Promise<ToolResult>
    ): Promise<ToolResult> => {
      const allowed = await this.checkToolAccess(tool.id, input, context)

      if (!allowed) {
        if (this.throwOnDenied) {
          throw new PermissionDeniedError(
            tool.id,
            this.defaultDeniedMessage
          )
        }

        return {
          success: false,
          error: {
            code: 'PERMISSION_DENIED',
            message: this.defaultDeniedMessage,
            recoverable: true,
          },
          metadata: {
            toolId: tool.id,
            durationMs: 0,
          },
        }
      }

      return next()
    }
  }

  /**
   * 获取检查器
   */
  getChecker(): PermissionChecker {
    return this.checker
  }
}

/**
 * 权限拒绝错误
 */
export class PermissionDeniedError extends Error {
  readonly toolId: string
  readonly code = 'PERMISSION_DENIED'

  constructor(toolId: string, message: string) {
    super(message)
    this.name = 'PermissionDeniedError'
    this.toolId = toolId
  }
}

/**
 * 创建权限守卫（快捷方式）
 */
export async function createPermissionGuard(
  options: PermissionGuardOptions & {
    rules?: PermissionRule[]
  }
): Promise<PermissionGuard> {
  const guard = new PermissionGuard({
    ...options,
    checkerConfig: {
      ...options.checkerConfig,
      initialRules: options.rules,
    },
  })

  await guard.initialize()

  return guard
}
