/**
 * MCP 服务器注册表
 *
 * 管理 MCP 服务器配置和连接
 */

import type { Tool } from '@openclaw/suite-core'
import type {
  MCPServerConfig,
  MCPServer,
  HealthStatus,
} from '@openclaw/suite-core'
import { MCPConnectionManager } from './MCPConnectionManager.js'
import {
  mcpServerNotFound,
  mcpServerAlreadyExists,
} from '../errors.js'

/**
 * MCP 服务器注册表配置
 */
export interface MCPServerRegistryOptions {
  /** 连接管理器 */
  connectionManager?: MCPConnectionManager

  /** 配置路径 */
  configPath?: string

  /** 自动连接已保存的服务器 */
  autoConnect?: boolean
}

/**
 * MCP 服务器注册表
 */
export class MCPServerRegistry {
  private readonly connectionManager: MCPConnectionManager
  private readonly configs: Map<string, MCPServerConfig> = new Map()
  private readonly autoConnect: boolean

  constructor(options: MCPServerRegistryOptions = {}) {
    this.connectionManager = options.connectionManager || new MCPConnectionManager()
    this.autoConnect = options.autoConnect ?? false
  }

  // =========================================================================
  // 配置管理
  // =========================================================================

  /**
   * 注册服务器
   */
  async register(config: MCPServerConfig): Promise<void> {
    if (this.configs.has(config.name)) {
      throw mcpServerAlreadyExists(config.name)
    }

    this.configs.set(config.name, config)

    // 如果启用自动连接，立即连接
    if (this.autoConnect) {
      try {
        await this.connectionManager.connect(config)
      } catch (error) {
        console.error(`[MCPServerRegistry] Auto-connect failed for ${config.name}:`, error)
      }
    }
  }

  /**
   * 批量注册服务器
   */
  async registerMany(configs: MCPServerConfig[]): Promise<void> {
    for (const config of configs) {
      await this.register(config)
    }
  }

  /**
   * 移除服务器
   */
  async unregister(name: string): Promise<void> {
    // 先断开连接
    await this.connectionManager.disconnect(name)
    this.configs.delete(name)
  }

  /**
   * 获取服务器配置
   */
  getConfig(name: string): MCPServerConfig | undefined {
    return this.configs.get(name)
  }

  /**
   * 列出所有服务器配置
   */
  listConfigs(): MCPServerConfig[] {
    return Array.from(this.configs.values())
  }

  // =========================================================================
  // 连接管理
  // =========================================================================

  /**
   * 启动服务器
   */
  async start(name: string): Promise<void> {
    const config = this.configs.get(name)
    if (!config) {
      throw mcpServerNotFound(name)
    }

    await this.connectionManager.connect(config)
  }

  /**
   * 停止服务器
   */
  async stop(name: string): Promise<void> {
    await this.connectionManager.disconnect(name)
  }

  /**
   * 重启服务器
   */
  async restart(name: string): Promise<void> {
    await this.connectionManager.disconnect(name)
    await this.connectionManager.connect(this.configs.get(name)!)
  }

  /**
   * 获取服务器状态
   */
  getStatus(name: string): MCPServer | undefined {
    return this.connectionManager.get(name)
  }

  /**
   * 获取所有服务器状态
   */
  listStatus(): MCPServer[] {
    return this.connectionManager.list()
  }

  // =========================================================================
  // 工具
  // =========================================================================

  /**
   * 获取服务器提供的所有工具
   */
  async getTools(name: string): Promise<Tool[]> {
    const server = this.connectionManager.get(name)
    if (!server) {
      throw mcpServerNotFound(name)
    }

    return server.tools
  }

  /**
   * 获取所有服务器的所有工具
   */
  async getAllTools(): Promise<Map<string, Tool[]>> {
    const result = new Map<string, Tool[]>()
    const servers = this.connectionManager.list()

    for (const server of servers) {
      if (server.status === 'connected') {
        result.set(server.name, server.tools)
      }
    }

    return result
  }

  // =========================================================================
  // 健康检查
  // =========================================================================

  /**
   * 健康检查单个服务器
   */
  async healthCheck(name: string): Promise<HealthStatus> {
    const server = this.connectionManager.get(name)

    if (!server) {
      return {
        healthy: false,
        error: 'Server not found',
      }
    }

    if (server.status !== 'connected') {
      return {
        healthy: false,
        error: `Server status: ${server.status}`,
      }
    }

    // 简化：检查 uptime
    if (!server.uptime || server.uptime < 0) {
      return {
        healthy: false,
        error: 'Server not responding',
      }
    }

    return {
      healthy: true,
      latencyMs: server.uptime * 1000, // 简化：用 uptime 模拟延迟
    }
  }

  /**
   * 健康检查所有服务器
   */
  async healthCheckAll(): Promise<Map<string, HealthStatus>> {
    const result = new Map<string, HealthStatus>()

    for (const name of this.configs.keys()) {
      result.set(name, await this.healthCheck(name))
    }

    return result
  }

  // =========================================================================
  // 生命周期
  // =========================================================================

  /**
   * 启动所有服务器
   */
  async startAll(): Promise<void> {
    for (const config of this.configs.values()) {
      try {
        await this.connectionManager.connect(config)
      } catch (error) {
        console.error(`[MCPServerRegistry] Failed to start ${config.name}:`, error)
      }
    }
  }

  /**
   * 停止所有服务器
   */
  async stopAll(): Promise<void> {
    await this.connectionManager.shutdown()
  }
}
