/**
 * MCP Hub 错误码
 *
 * E4xxx 系列 - MCP 相关错误
 */

export const MCP_ERROR_CODES = {
  // 服务器错误 (E40xx)
  E4001: 'MCP_SERVER_NOT_FOUND',
  E4002: 'MCP_CONNECTION_FAILED',
  E4003: 'MCP_SERVER_ALREADY_EXISTS',
  E4004: 'MCP_SERVER_NOT_RUNNING',

  // 工具错误 (E41xx)
  E4101: 'MCP_TOOL_NOT_FOUND',
  E4102: 'MCP_TOOL_CALL_FAILED',
  E4103: 'MCP_TOOL_TIMEOUT',
  E4104: 'MCP_TOOL_INVALID_INPUT',

  // 映射错误 (E42xx)
  E4201: 'MCP_MAPPER_FAILED',
  E4202: 'MCP_MAPPER_INVALID_SCHEMA',
  E4203: 'MCP_MAPPER_TOOL_EXISTS',

  // 认证错误 (E43xx)
  E4301: 'MCP_AUTH_FAILED',
  E4302: 'MCP_AUTH_REQUIRED',
  E4303: 'MCP_TOKEN_EXPIRED',
} as const

export type MCPErrorCode = (typeof MCP_ERROR_CODES)[keyof typeof MCP_ERROR_CODES]

/**
 * 创建 MCP 服务器未找到错误
 */
export function mcpServerNotFound(name: string): Error & { code: string; name: string } {
  const err = new Error(`MCP server not found: ${name}`)
  return Object.assign(err, { code: MCP_ERROR_CODES.E4001, name })
}

/**
 * 创建 MCP 连接失败错误
 */
export function mcpConnectionFailed(
  name: string,
  cause?: unknown
): Error & { code: string; name: string; cause?: unknown } {
  const err = new Error(`MCP connection failed: ${name}`)
  return Object.assign(err, { code: MCP_ERROR_CODES.E4002, name, cause })
}

/**
 * 创建 MCP 服务器已存在错误
 */
export function mcpServerAlreadyExists(name: string): Error & { code: string; name: string } {
  const err = new Error(`MCP server already exists: ${name}`)
  return Object.assign(err, { code: MCP_ERROR_CODES.E4003, name })
}

/**
 * 创建 MCP 工具未找到错误
 */
export function mcpToolNotFound(
  server: string,
  tool: string
): Error & { code: string; server: string; tool: string } {
  const err = new Error(`MCP tool not found: ${server}/${tool}`)
  return Object.assign(err, { code: MCP_ERROR_CODES.E4101, server, tool })
}

/**
 * 创建 MCP 工具调用失败错误
 */
export function mcpToolCallFailed(
  server: string,
  tool: string,
  cause?: unknown
): Error & { code: string; server: string; tool: string; cause?: unknown } {
  const err = new Error(`MCP tool call failed: ${server}/${tool}`)
  return Object.assign(err, { code: MCP_ERROR_CODES.E4102, server, tool, cause })
}

/**
 * 创建 MCP 工具超时错误
 */
export function mcpToolTimeout(
  server: string,
  tool: string,
  timeoutMs: number
): Error & { code: string; server: string; tool: string; timeoutMs: number } {
  const err = new Error(`MCP tool timeout: ${server}/${tool} (${timeoutMs}ms)`)
  return Object.assign(err, { code: MCP_ERROR_CODES.E4103, server, tool, timeoutMs })
}

/**
 * 创建 MCP 映射失败错误
 */
export function mcpMapperFailed(
  server: string,
  cause?: unknown
): Error & { code: string; server: string; cause?: unknown } {
  const err = new Error(`MCP mapper failed: ${server}`)
  return Object.assign(err, { code: MCP_ERROR_CODES.E4201, server, cause })
}
