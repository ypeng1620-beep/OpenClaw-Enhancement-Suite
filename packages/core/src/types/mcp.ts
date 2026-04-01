/**
 * MCP 相关类型定义
 * 对应 api-standards.md 四
 */

// ============================================================================
// MCP 工具映射
// ============================================================================

/** MCP 工具（原始格式） */
export interface MCPTool {
  readonly name: string
  readonly description?: string
  readonly inputSchema?: Record<string, unknown>
  readonly outputSchema?: Record<string, unknown>
}

/** MCP 工具映射器 */
export interface MCPToolMapper {
  map(mcpTool: MCPTool, serverName: string): import('./tool.js').Tool
  mapMany(
    mcpTools: MCPTool[],
    serverName: string,
    options?: MapManyOptions
  ): Promise<import('./tool.js').Tool[]>
}

/** 批量映射选项 */
export interface MapManyOptions {
  /** 每批处理数量 */
  readonly batchSize?: number
  /** 是否并行处理 */
  readonly parallel?: boolean
  /** 进度回调 */
  readonly onProgress?: (completed: number, total: number) => void
}

/** 创建 MCP 工具映射器 */
export function createMCPToolMapper(): MCPToolMapper {
  return {
    map(mcpTool, serverName) {
      const id = `mcp__${serverName}__${mcpTool.name}`
      return {
        id,
        name: mcpTool.name,
        version: '1.0.0',
        namespace: serverName,
        source: 'mcp' as const,
        description: mcpTool.description ?? `MCP tool: ${mcpTool.name}`,
        tags: ['mcp', serverName],
        inputSchema: convertToJSONSchema(mcpTool.inputSchema),
        outputSchema: mcpTool.outputSchema
          ? convertToJSONSchema(mcpTool.outputSchema)
          : undefined,
        capabilities: {
          readOnly: true,
          networkAccess: false,
          filesystemAccess: false,
          dangerous: false,
          longRunning: false,
          streaming: false,
        },
        execute: async (input, context) => {
          // 实际执行由 MCPConnectionManager 处理
          throw new Error(
            `MCP tool ${id} requires MCPConnectionManager to execute`
          )
        },
      }
    },

    async mapMany(mcpTools, serverName, options) {
      const batchSize = options?.batchSize ?? 50
      const parallel = options?.parallel ?? true
      const onProgress = options?.onProgress

      const results: import('./tool.js').Tool[] = []

      if (parallel) {
        // 并行分批处理
        for (let i = 0; i < mcpTools.length; i += batchSize) {
          const batch = mcpTools.slice(i, i + batchSize)
          const batchResults = batch.map((tool) => this.map(tool, serverName))
          results.push(...batchResults)
          onProgress?.(results.length, mcpTools.length)
        }
      } else {
        // 串行处理
        for (let i = 0; i < mcpTools.length; i++) {
          results.push(this.map(mcpTools[i], serverName))
          if (i % batchSize === 0) {
            onProgress?.(i + 1, mcpTools.length)
          }
        }
        onProgress?.(mcpTools.length, mcpTools.length)
      }

      return results
    },
  }
}

/** 转换为 JSONSchema */
function convertToJSONSchema(schema?: Record<string, unknown>): import('./tool.js').JSONSchema {
  if (!schema) {
    return { type: 'object', properties: {} }
  }

  // 简化转换，实际应该更完整
  return {
    type: 'object',
    properties: schema as Record<string, import('./tool.js').JSONSchema>,
  }
}

// ============================================================================
// MCP 服务器
// ============================================================================

/** MCP 服务器类型 */
export type MCPServerType = 'stdio' | 'sse' | 'websocket'

/** MCP 服务器配置 */
export interface MCPServerConfig {
  readonly name: string
  readonly type: MCPServerType
  readonly command: string
  readonly args?: string[]
  readonly env?: Record<string, string>
  readonly tools?: string[]        // 白名单
  readonly disabledTools?: string[] // 黑名单
  readonly description?: string
}

/** MCP 服务器状态 */
export type MCPServerStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

/** MCP 服务器信息 */
export interface MCPServer {
  readonly name: string
  readonly config: MCPServerConfig
  readonly status: MCPServerStatus
  readonly tools: MCPTool[]
  readonly uptime?: number
  readonly error?: string
}

/** 健康状态 */
export interface HealthStatus {
  readonly healthy: boolean
  readonly latencyMs?: number
  readonly error?: string
}

// ============================================================================
// MCP 连接管理器
// ============================================================================

/** MCP 连接管理器接口 */
export interface MCPConnectionManager {
  connect(config: MCPServerConfig): Promise<MCPServer>
  disconnect(serverName: string): Promise<void>
  getTools(serverName: string): Promise<import('./tool.js').Tool[]>
  callTool(
    serverName: string,
    toolName: string,
    args: unknown
  ): Promise<unknown>
}

/** MCP 服务器注册表 */
export interface MCPServerRegistry {
  register(config: MCPServerConfig): Promise<void>
  list(): Promise<MCPServer[]>
  get(name: string): Promise<MCPServer | undefined>
  start(name: string): Promise<void>
  stop(name: string): Promise<void>
  healthCheck(name: string): Promise<HealthStatus>
}
