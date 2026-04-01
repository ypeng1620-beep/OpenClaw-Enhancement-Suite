/**
 * ToolHub 错误码
 */

export const TOOL_ERROR_CODES = {
  // 执行错误 (E1xxx)
  E1001: 'TOOL_NOT_FOUND',
  E1002: 'TOOL_DISABLED',
  E1003: 'TOOL_TIMEOUT',
  E1004: 'TOOL_EXECUTION_FAILED',
  E1005: 'TOOL_ALREADY_REGISTERED',
  E1006: 'TOOL_VALIDATION_FAILED',
  E1007: 'TOOL_HOOK_REJECTED',

  // 上下文错误 (E3xxx)
  E3001: 'CONTEXT_TOKEN_LIMIT',
  E3002: 'CONTEXT_COMPACT_FAILED',
  E3003: 'CONTEXT_SESSION_NOT_FOUND',
} as const

export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[keyof typeof TOOL_ERROR_CODES]

/**
 * 创建工具未找到错误
 */
export function toolNotFound(toolId: string): Error & { code: string } {
  const err = new Error(`Tool not found: ${toolId}`)
  return Object.assign(err, { code: TOOL_ERROR_CODES.E1001 })
}

/**
 * 创建工具已注册错误
 */
export function toolAlreadyRegistered(toolId: string): Error & { code: string } {
  const err = new Error(`Tool already registered: ${toolId}`)
  return Object.assign(err, { code: TOOL_ERROR_CODES.E1005 })
}

/**
 * 创建工具执行失败错误
 */
export function toolExecutionFailed(
  toolId: string,
  cause: unknown
): Error & { code: string } {
  const err = new Error(`Tool execution failed: ${toolId}`)
  return Object.assign(err, {
    code: TOOL_ERROR_CODES.E1004,
    cause,
  })
}

/**
 * 创建工具超时错误
 */
export function toolTimeout(toolId: string, timeoutMs: number): Error & { code: string } {
  const err = new Error(`Tool timeout: ${toolId} (${timeoutMs}ms)`)
  return Object.assign(err, {
    code: TOOL_ERROR_CODES.E1003,
    timeoutMs,
  })
}

/**
 * 创建 Hook 拒绝错误
 */
export function toolHookRejected(
  toolId: string,
  reason: string
): Error & { code: string } {
  const err = new Error(`Tool hook rejected: ${toolId} - ${reason}`)
  return Object.assign(err, {
    code: TOOL_ERROR_CODES.E1007,
    reason,
  })
}
