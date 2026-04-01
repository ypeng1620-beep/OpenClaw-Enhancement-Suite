/**
 * 内置工具 - 网络请求
 */

import type { Tool } from '@openclaw/suite-core'
import { buildTool } from '@openclaw/suite-core'

// ============================================================================
// 辅助函数
// ============================================================================

function createSuccessResult(
  toolId: string,
  data: unknown,
  durationMs: number
) {
  return {
    success: true,
    data,
    metadata: { toolId, durationMs },
  }
}

function createErrorResult(
  toolId: string,
  durationMs: number,
  code: string,
  message: string
) {
  return {
    success: false,
    error: { code, message, recoverable: true },
    metadata: { toolId, durationMs },
  }
}

// ============================================================================
// HTTP 工具
// ============================================================================

/**
 * HTTP GET 请求工具
 */
export const httpGetTool: Tool = buildTool({
  id: 'network/http_get',
  name: 'HTTP GET',
  namespace: 'network',
  source: 'builtin',
  description: 'Make an HTTP GET request',
  tags: ['network', 'http', 'get', 'request'],
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to fetch',
      },
      headers: {
        type: 'object',
        description: 'HTTP headers',
      },
      timeout: {
        type: 'number',
        description: 'Request timeout in milliseconds',
        default: 10000,
      },
    },
    required: ['url'],
  },
  capabilities: {
    readOnly: true,
    networkAccess: true,
    filesystemAccess: false,
    dangerous: false,
    longRunning: false,
    streaming: false,
  },
  async execute(input) {
    const start = Date.now()
    const { url, headers = {}, timeout = 10000 } = input as {
      url: string
      headers?: Record<string, string>
      timeout?: number
    }

    // 安全检查：只允许 http/https
    if (!url.match(/^https?:\/\//)) {
      return createErrorResult(
        this.id,
        Date.now() - start,
        'INVALID_URL',
        'Only HTTP/HTTPS URLs are allowed'
      )
    }

    // SSRF 检查：阻止内网地址
    const ssrfPatterns = [
      /^localhost/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^::1$/,
      /\[::1\]/,
    ]
    try {
      const urlObj = new URL(url)
      for (const pattern of ssrfPatterns) {
        if (pattern.test(urlObj.hostname)) {
          return createErrorResult(
            this.id,
            Date.now() - start,
            'SSRF_BLOCKED',
            `SSRF blocked: ${urlObj.hostname}`
          )
        }
      }
    } catch {
      return createErrorResult(
        this.id,
        Date.now() - start,
        'INVALID_URL',
        'Invalid URL format'
      )
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const text = await response.text()
      const result = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: text.slice(0, 100000), // 限制响应体大小
        url: response.url,
      }

      return createSuccessResult(this.id, result, Date.now() - start)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return createErrorResult(
          this.id,
          Date.now() - start,
          'TIMEOUT',
          `Request timed out after ${timeout}ms`
        )
      }
      return createErrorResult(
        this.id,
        Date.now() - start,
        'FETCH_ERROR',
        error instanceof Error ? error.message : String(error)
      )
    }
  },
})

/**
 * HTTP POST 请求工具
 */
export const httpPostTool: Tool = buildTool({
  id: 'network/http_post',
  name: 'HTTP POST',
  namespace: 'network',
  source: 'builtin',
  description: 'Make an HTTP POST request',
  tags: ['network', 'http', 'post', 'request'],
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to post to',
      },
      body: {
        type: 'string',
        description: 'Request body',
      },
      headers: {
        type: 'object',
        description: 'HTTP headers',
      },
      contentType: {
        type: 'string',
        description: 'Content-Type header',
        default: 'application/json',
      },
      timeout: {
        type: 'number',
        description: 'Request timeout in milliseconds',
        default: 10000,
      },
    },
    required: ['url', 'body'],
  },
  capabilities: {
    readOnly: false,
    networkAccess: true,
    filesystemAccess: false,
    dangerous: false,
    longRunning: false,
    streaming: false,
  },
  async execute(input) {
    const start = Date.now()
    const {
      url,
      body,
      headers = {},
      contentType = 'application/json',
      timeout = 10000,
    } = input as {
      url: string
      body: string
      headers?: Record<string, string>
      contentType?: string
      timeout?: number
    }

    // 安全检查
    if (!url.match(/^https?:\/\//)) {
      return createErrorResult(
        this.id,
        Date.now() - start,
        'INVALID_URL',
        'Only HTTP/HTTPS URLs are allowed'
      )
    }

    // SSRF 检查
    const ssrfPatterns = [
      /^localhost/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^::1$/,
    ]
    try {
      const urlObj = new URL(url)
      for (const pattern of ssrfPatterns) {
        if (pattern.test(urlObj.hostname)) {
          return createErrorResult(
            this.id,
            Date.now() - start,
            'SSRF_BLOCKED',
            `SSRF blocked: ${urlObj.hostname}`
          )
        }
      }
    } catch {
      return createErrorResult(
        this.id,
        Date.now() - start,
        'INVALID_URL',
        'Invalid URL format'
      )
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': contentType,
        },
        body,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const text = await response.text()
      const result = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: text.slice(0, 100000),
        url: response.url,
      }

      return createSuccessResult(this.id, result, Date.now() - start)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return createErrorResult(
          this.id,
          Date.now() - start,
          'TIMEOUT',
          `Request timed out after ${timeout}ms`
        )
      }
      return createErrorResult(
        this.id,
        Date.now() - start,
        'FETCH_ERROR',
        error instanceof Error ? error.message : String(error)
      )
    }
  },
})

/**
 * 获取所有内置网络工具
 */
export function getNetworkTools(): Tool[] {
  return [httpGetTool, httpPostTool]
}
