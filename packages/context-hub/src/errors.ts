/**
 * ContextHub 错误码
 *
 * E3xxx 系列 - 上下文相关错误
 */

export const CONTEXT_ERROR_CODES = {
  // 上下文管理错误 (E30xx)
  E3001: 'CONTEXT_TOKEN_LIMIT',
  E3002: 'CONTEXT_COMPACT_FAILED',
  E3003: 'CONTEXT_SESSION_NOT_FOUND',
  E3004: 'CONTEXT_EVENT_NOT_FOUND',
  E3005: 'CONTEXT_ALREADY_CLEARED',

  // 压缩错误 (E31xx)
  E3101: 'COMPACT_STRATEGY_INVALID',
  E3102: 'COMPACT_NO_EVENTS',
  E3103: 'COMPACT_THRESHOLD_NOT_REACHED',

  // 检测器错误 (E32xx)
  E3201: 'DETECTOR_CONFIG_INVALID',
  E3202: 'DETECTOR_NOT_INITIALIZED',
  E3203: 'DETECTOR_WINDOW_EMPTY',

  // 事件错误 (E33xx)
  E3301: 'EVENT_TYPE_INVALID',
  E3302: 'EVENT_PAYLOAD_TOO_LARGE',
  E3303: 'EVENT_TIMESTAMP_INVALID',
} as const

export type ContextErrorCode =
  (typeof CONTEXT_ERROR_CODES)[keyof typeof CONTEXT_ERROR_CODES]

/**
 * 创建上下文 Token 超限错误
 */
export function contextTokenLimit(
  current: number,
  limit: number
): Error & { code: string; current: number; limit: number } {
  const err = new Error(
    `Context token limit exceeded: ${current} / ${limit}`
  )
  return Object.assign(err, {
    code: CONTEXT_ERROR_CODES.E3001,
    current,
    limit,
  })
}

/**
 * 创建压缩失败错误
 */
export function contextCompactFailed(
  strategy: string,
  cause?: unknown
): Error & { code: string; strategy: string; cause?: unknown } {
  const err = new Error(`Context compact failed using strategy: ${strategy}`)
  return Object.assign(err, {
    code: CONTEXT_ERROR_CODES.E3002,
    strategy,
    cause,
  })
}

/**
 * 创建检测器配置无效错误
 */
export function detectorConfigInvalid(
  field: string,
  message: string
): Error & { code: string; field: string } {
  const err = new Error(`Detector config invalid: ${field} - ${message}`)
  return Object.assign(err, {
    code: CONTEXT_ERROR_CODES.E3201,
    field,
  })
}

/**
 * 创建事件类型无效错误
 */
export function eventTypeInvalid(
  type: string
): Error & { code: string; type: string } {
  const err = new Error(`Invalid event type: ${type}`)
  return Object.assign(err, {
    code: CONTEXT_ERROR_CODES.E3301,
    type,
  })
}

/**
 * 创建事件负载过大错误
 */
export function eventPayloadTooLarge(
  size: number,
  maxSize: number
): Error & { code: string; size: number; maxSize: number } {
  const err = new Error(
    `Event payload too large: ${size} bytes (max: ${maxSize})`
  )
  return Object.assign(err, {
    code: CONTEXT_ERROR_CODES.E3302,
    size,
    maxSize,
  })
}
