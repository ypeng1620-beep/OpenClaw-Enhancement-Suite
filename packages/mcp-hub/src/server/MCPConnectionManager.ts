/**
 * MCP 服务器连接管理器
 *
 * 管理 MCP 服务器的生命周期
 */

import type { Tool } from '@openclaw/suite-core'
import type { MCPServerConfig, MCPServerStatus } from '@openclaw/suite-core'

/**
 * MCP 服务器
 */
export interface MCPServer {
  readonly name: string
  readonly config: MCPServerConfig
  status: MCPServerStatus
  tools: Tool[]
  uptime?: number
  error?: string
}

/**
 * 连接管理器配置
 */
export interface MCPConnectionManagerOptions {
  /** 默认超时（毫秒） */
  defaultTimeout?: number

  /** 是否自动重连 */
  autoReconnect?: boolean

  /** 重连间隔（毫秒） */
  reconnectInterval?: number

  /** 最大重连次数 */
  maxReconnectAttempts?: number
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS = {
  defaultTimeout: 30000,
  autoReconnect: true,
  reconnectInterval: 5000,
  maxReconnectAttempts: 3,
}

/**
 * MCP 连接管理器
 *
 * 注意：这是一个简化实现，实际的 MCP 协议通信需要
 * 完整的 JSON-RPC 实现（stdio/SSE/WebSocket 传输层）
 */
export class MCPConnectionManager {
  private readonly servers: Map<string, MCPServer> = new Map()
  private readonly options: Required<MCPConnectionManagerOptions>
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map()

  constructor(options: MCPConnectionManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  // =========================================================================
  // 服务器管理
  // =========================================================================

  /**
   * 获取服务器
   */
  get(name: string): MCPServer | undefined {
    return this.servers.get(name)
  }

  /**
   * 获取所有服务器
   */
  list(): MCPServer[] {
    return Array.from(this.servers.values())
  }

  /**
   * 服务器是否已连接
   */
  isConnected(name: string): boolean {
    const server = this.servers.get(name)
    return server?.status === 'connected'
  }

  // =========================================================================
  // 连接管理
  // =========================================================================

  /**
   * 连接到 MCP 服务器
   */
  async connect(config: MCPServerConfig): Promise<MCPServer> {
    // 检查是否已存在
    if (this.servers.has(config.name)) {
      const existing = this.servers.get(config.name)!
      if (existing.status === 'connected') {
        return existing
      }
      // 尝试重连
      return this.reconnect(config.name)
    }

    // 创建服务器记录
    const server: MCPServer = {
      name: config.name,
      config,
      status: 'connecting',
      tools: [],
    }
    this.servers.set(config.name, server)

    try {
      // 尝试建立连接（这里简化处理，实际需要实现传输层）
      await this.establishConnection(server)

      server.status = 'connected'
      server.uptime = 0
      server.error = undefined

      // 启动心跳
      this.startHeartbeat(config.name)

      return server
    } catch (error) {
      server.status = 'error'
      server.error = error instanceof Error ? error.message : String(error)

      // 自动重连
      if (this.options.autoReconnect) {
        this.scheduleReconnect(config.name)
      }

      throw error
    }
  }

  /**
   * 断开连接
   */
  async disconnect(name: string): Promise<void> {
    const server = this.servers.get(name)
    if (!server) return

    // 停止心跳
    this.stopHeartbeat(name)

    // 停止重连
    this.cancelReconnect(name)

    // 清理进程
    server.status = 'disconnected'
    server.tools = []
  }

  /**
   * 重新连接
   */
  async reconnect(name: string): Promise<MCPServer> {
    const server = this.servers.get(name)
    if (!server) {
      throw new Error(`Server not found: ${name}`)
    }

    server.status = 'connecting'
    server.error = undefined

    try {
      await this.establishConnection(server)
      server.status = 'connected'
      server.uptime = 0
      server.error = undefined

      this.startHeartbeat(name)

      return server
    } catch (error) {
      server.status = 'error'
      server.error = error instanceof Error ? error.message : String(error)

      if (this.options.autoReconnect) {
        this.scheduleReconnect(name)
      }

      throw error
    }
  }

  // =========================================================================
  // 工具调用
  // =========================================================================

  /**
   * 调用 MCP 工具
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: unknown
  ): Promise<unknown> {
    const server = this.servers.get(serverName)

    if (!server) {
      throw new Error(`Server not found: ${serverName}`)
    }

    if (server.status !== 'connected') {
      throw new Error(`Server not connected: ${serverName}`)
    }

    // 查找工具
    const tool = server.tools.find((t) => t.name === toolName)
    if (!tool) {
      throw new Error(`Tool not found: ${serverName}/${toolName}`)
    }

    // 执行工具调用
    // 注意：这里简化处理，实际需要通过 MCP 协议发送请求
    try {
      const result = await this.sendToolRequest(serverName, toolName, args)
      return result
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new Error(`Tool timeout: ${serverName}/${toolName}`)
      }
      throw error
    }
  }

  // =========================================================================
  // 辅助方法
  // =========================================================================

  /**
   * 建立连接（简化实现）
   */
  private async establishConnection(server: MCPServer): Promise<void> {
    // 这里应该实现实际的 MCP 协议连接
    // 根据 server.config.type 选择不同的传输方式：
    // - stdio: 启动子进程
    // - SSE: 建立 SSE 连接
    // - WebSocket: 建立 WebSocket 连接

    // 简化：模拟连接延迟
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 模拟工具发现
    // 实际应该从 MCP 服务器获取工具列表
    server.tools = []
  }

  /**
   * 发送工具请求（简化实现）
   */
  private async sendToolRequest(
    _serverName: string,
    _toolName: string,
    _args: unknown
  ): Promise<unknown> {
    // 简化：模拟请求延迟
    await new Promise((resolve) => setTimeout(resolve, 50))

    return { success: true, data: 'ok' }
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(name: string): void {
    const interval = setInterval(() => {
      const server = this.servers.get(name)
      if (server && server.status === 'connected') {
        server.uptime = (server.uptime || 0) + 1
      }
    }, 1000)

    // 存储引用以便清理
    this.reconnectTimers.set(name, interval)
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(name: string): void {
    const timer = this.reconnectTimers.get(name)
    if (timer) {
      clearInterval(timer)
      this.reconnectTimers.delete(name)
    }
  }

  /**
   * 调度重连
   */
  private scheduleReconnect(name: string): void {
    // 取消已有的重连
    this.cancelReconnect(name)

    const timer = setTimeout(async () => {
      try {
        await this.reconnect(name)
      } catch (error) {
        console.error(`[MCP] Reconnect failed for ${name}:`, error)
      }
    }, this.options.reconnectInterval)

    this.reconnectTimers.set(`reconnect-${name}`, timer)
  }

  /**
   * 取消重连
   */
  private cancelReconnect(name: string): void {
    const timer = this.reconnectTimers.get(`reconnect-${name}`)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(`reconnect-${name}`)
    }
  }

  /**
   * 关闭所有连接
   */
  async shutdown(): Promise<void> {
    for (const name of this.servers.keys()) {
      await this.disconnect(name)
    }
  }
}
