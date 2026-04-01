/**
 * PermissionHub 错误码
 *
 * E2000 系列 - 权限相关错误
 */

export const PERMISSION_ERROR_CODES = {
  // 权限检查错误 (E20xx)
  E2001: 'PERMISSION_DENIED',
  E2002: 'PERMISSION_ASK_TIMEOUT',
  E2003: 'INVALID_PERMISSION_RULE',
  E2004: 'RULE_NOT_FOUND',
  E2005: 'RULE_ALREADY_EXISTS',
  E2006: 'RULE_VALIDATION_FAILED',

  // 存储相关错误 (E21xx)
  E2101: 'STORE_NOT_INITIALIZED',
  E2102: 'STORE_LOAD_FAILED',
  E2103: 'STORE_SAVE_FAILED',
  E2104: 'STORE_WATCH_FAILED',

  // 上下文相关错误 (E22xx)
  E2201: 'CONTEXT_MISSING_USER',
  E2202: 'CONTEXT_MISSING_AGENT',
  E2203: 'CONTEXT_INVALID_SESSION',
} as const

export type PermissionErrorCode =
  (typeof PERMISSION_ERROR_CODES)[keyof typeof PERMISSION_ERROR_CODES]

/**
 * 创建权限拒绝错误
 */
export function permissionDenied(
  toolId: string,
  reason?: string
): Error & { code: string; toolId: string } {
  const err = new Error(
    reason || `Permission denied for tool: ${toolId}`
  )
  return Object.assign(err, {
    code: PERMISSION_ERROR_CODES.E2001,
    toolId,
  })
}

/**
 * 创建规则未找到错误
 */
export function ruleNotFound(ruleId: string): Error & { code: string } {
  const err = new Error(`Rule not found: ${ruleId}`)
  return Object.assign(err, { code: PERMISSION_ERROR_CODES.E2004 })
}

/**
 * 创建规则已存在错误
 */
export function ruleAlreadyExists(ruleId: string): Error & { code: string } {
  const err = new Error(`Rule already exists: ${ruleId}`)
  return Object.assign(err, { code: PERMISSION_ERROR_CODES.E2005 })
}

/**
 * 创建规则验证失败错误
 */
export function ruleValidationFailed(
  errors: string[]
): Error & { code: string; errors: string[] } {
  const err = new Error(`Rule validation failed: ${errors.join('; ')}`)
  return Object.assign(err, {
    code: PERMISSION_ERROR_CODES.E2006,
    errors,
  })
}

/**
 * 创建存储加载失败错误
 */
export function storeLoadFailed(
  source: string,
  cause?: unknown
): Error & { code: string; cause: unknown } {
  const err = new Error(`Failed to load rules from ${source}`)
  return Object.assign(err, {
    code: PERMISSION_ERROR_CODES.E2102,
    cause,
  })
}

/**
 * 创建存储保存失败错误
 */
export function storeSaveFailed(
  source: string,
  cause?: unknown
): Error & { code: string; cause: unknown } {
  const err = new Error(`Failed to save rules to ${source}`)
  return Object.assign(err, {
    code: PERMISSION_ERROR_CODES.E2103,
    cause,
  })
}

/**
 * 创建权限缺失上下文错误
 */
export function contextMissingField(
  field: 'userId' | 'agentId' | 'sessionId'
): Error & { code: string; field: string } {
  const err = new Error(`Permission context missing: ${field}`)
  return Object.assign(err, {
    code: PERMISSION_ERROR_CODES.E2201,
    field,
  })
}
