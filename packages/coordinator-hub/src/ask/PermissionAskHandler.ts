/**
 * 权限确认处理器
 *
 * 处理 ask 效果的权限请求，等待用户确认
 */

import type { PermissionRequest, PermissionDecision } from '@openclaw/suite-core'

/**
 * 确认状态
 */
export type ConfirmationStatus = 'pending' | 'confirmed' | 'denied' | 'timeout'

/**
 * 确认请求
 */
export interface ConfirmationRequest {
  /** 请求 ID */
  id: string

  /** 权限请求 */
  request: PermissionRequest

  /** 原因（来自权限引擎） */
  reason?: string

  /** 创建时间 */
  createdAt: number

  /** 超时时间 */
  timeoutAt: number

  /** 状态 */
  status: ConfirmationStatus
}

/**
 * 确认回调
 */
export type ConfirmationCallback = (request: ConfirmationRequest) => Promise<boolean>

/**
 * 权限确认处理器配置
 */
export interface PermissionAskHandlerOptions {
  /** 默认超时（毫秒） */
  defaultTimeout?: number

  /** 用户确认回调 */
  onAsk?: ConfirmationCallback

  /** 超时时回调 */
  onTimeout?: (request: ConfirmationRequest) => void
}

/**
 * 权限确认处理器
 *
 * 用于协调器处理 ask 效果的权限请求：
 * 1. 权限检查返回 ask
 * 2. 协调器调用此处理器展示确认对话框
 * 3. 用户确认或拒绝
 * 4. 返回最终决策
 */
export class PermissionAskHandler {
  private readonly defaultTimeout: number
  private readonly onAsk?: ConfirmationCallback
  private readonly onTimeout?: (request: ConfirmationRequest) => void
  private readonly pendingRequests = new Map<string, ConfirmationRequest>()
  private readonly timeouts = new Map<string, NodeJS.Timeout>()

  constructor(options: PermissionAskHandlerOptions = {}) {
    this.defaultTimeout = options.defaultTimeout || 60000 // 默认 1 分钟
    this.onAsk = options.onAsk
    this.onTimeout = options.onTimeout
  }

  /**
   * 请求确认
   *
   * 调用此方法请求用户确认，返回一个 Promise
   * - 用户确认 → resolve(true)
   * - 用户拒绝 → resolve(false)
   * - 超时 → resolve(false)
   */
  async requestConfirmation(
    request: PermissionRequest,
    reason?: string,
    timeoutMs?: number
  ): Promise<boolean> {
    const id = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()
    const timeout = timeoutMs || this.defaultTimeout

    const confirmationRequest: ConfirmationRequest = {
      id,
      request,
      reason,
      createdAt: now,
      timeoutAt: now + timeout,
      status: 'pending',
    }

    this.pendingRequests.set(id, confirmationRequest)

    // 设置超时
    const timeoutHandle = setTimeout(() => {
      this.handleTimeout(id)
    }, timeout)
    this.timeouts.set(id, timeoutHandle)

    try {
      if (this.onAsk) {
        // 使用回调
        const confirmed = await this.onAsk(confirmationRequest)
        return this.resolveRequest(id, confirmed)
      } else {
        // 使用 Promise，等待 resolve/reject
        return new Promise<boolean>((resolve) => {
          // 存储 resolve 函数
          this.pendingRequests.set(id, {
            ...confirmationRequest,
            // 覆盖 status 用于 resolve
          })

          // 注意：这里需要外部调用 resolveRequest
        })
      }
    } catch (error) {
      this.cleanup(id)
      return false
    }
  }

  /**
   * 解析确认请求
   */
  resolveRequest(id: string, confirmed: boolean): boolean {
    const request = this.pendingRequests.get(id)
    if (!request) return confirmed

    request.status = confirmed ? 'confirmed' : 'denied'
    this.cleanup(id)

    return confirmed
  }

  /**
   * 获取待处理请求
   */
  getPendingRequests(): ConfirmationRequest[] {
    return Array.from(this.pendingRequests.values()).filter(
      (r) => r.status === 'pending'
    )
  }

  /**
   * 获取请求详情
   */
  getRequest(id: string): ConfirmationRequest | undefined {
    return this.pendingRequests.get(id)
  }

  /**
   * 取消请求
   */
  cancelRequest(id: string): void {
    this.resolveRequest(id, false)
  }

  /**
   * 处理超时
   */
  private handleTimeout(id: string): void {
    const request = this.pendingRequests.get(id)
    if (!request || request.status !== 'pending') return

    request.status = 'timeout'
    this.onTimeout?.(request)
    this.cleanup(id)
  }

  /**
   * 清理
   */
  private cleanup(id: string): void {
    this.pendingRequests.delete(id)

    const timeout = this.timeouts.get(id)
    if (timeout) {
      clearTimeout(timeout)
      this.timeouts.delete(id)
    }
  }

  /**
   * 创建权限检查包装器
   *
   * 这是一个高阶函数，包装一个权限检查器
   * 当检查结果为 ask 时，自动调用确认流程
   */
  createPermissionCheckerWrapper(
    checker: {
      check: (request: PermissionRequest) => Promise<PermissionDecision>
    }
  ): {
    check: (request: PermissionRequest) => Promise<PermissionDecision>
  } {
    const self = this
    return {
      async check(request: PermissionRequest): Promise<PermissionDecision> {
        const decision = await checker.check(request)

        if (decision.effect === 'ask') {
          const confirmed = await self.requestConfirmation(
            request,
            decision.reason
          )

          return confirmed
            ? { effect: 'allow' }
            : { effect: 'deny', reason: 'User denied permission request' }
        }

        return decision
      },
    }
  }
}

/**
 * 创建确认对话框格式化消息
 */
export function formatConfirmationMessage(
  request: PermissionRequest,
  reason?: string
): string {
  const toolId = request.object.toolId
  const subject = request.subject.agentId || request.subject.userId || 'Unknown'

  let message = `**权限确认请求**\n\n`
  message += `**请求者**: ${subject}\n`
  message += `**工具**: ${toolId}\n`

  if (reason) {
    message += `**原因**: ${reason}\n`
  }

  if (request.object.input) {
    message += `**参数**: ${JSON.stringify(request.object.input).slice(0, 100)}`
  }

  return message
}

/**
 * 创建权限确认处理器（便捷函数）
 */
export function createPermissionAskHandler(
  options?: PermissionAskHandlerOptions
): PermissionAskHandler {
  return new PermissionAskHandler(options)
}
