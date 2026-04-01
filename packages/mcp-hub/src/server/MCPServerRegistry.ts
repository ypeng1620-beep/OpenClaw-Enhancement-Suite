/**
 * MCP 服务器注册表
 *
 * 管理 MCP 服务器配置和连接，以及与 ToolHub 的同步
 */

import type { Tool, ToolRegistry } from '@openclaw/suite-core'
import type {
  MCPServerConfig,
  MCPServer,
  HealthStatus,
} from '@openclaw/suite-core'
import { MCPConnectionManager } from './MCPConnectionManager.js'
import { MCPToolMapper } from '../mapper/MCPToolMapper.js'
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

  /** 工具映射器 */
  toolMapper?: MCPToolMapper

  /** 配置路径 */
  configPath?: string

  /** 自动连接已保存的服务器 */
  autoConnect?: boolean

  /** 同步到 ToolHub */
  syncToToolHub?: ToolRegistry

  /** 工具变化回调 */
  onToolsChanged?: (serverName: string, tools: Tool[]) => void
}

/**
 * MCP 服务器注册表
 */
export class MCPServerRegistry {
  private readonly connectionManager: MCPConnectionManager
  private readonly toolMapper: MCPToolMapper
  private readonly configs: Map<string, MCPServerConfig> = new Map()
  private readonly autoConnect: boolean
  private readonly syncToToolHub?: ToolRegistry
  private readonly onToolsChanged?: (serverName: string, tools: Tool[]) => void

  constructor(options: MCPServerRegistryOptions = {}) {
    this.connectionManager = options.connectionManager || new MCPConnectionManager()
    this.toolMapper = options.toolMapper || new MCPToolMapper()
    this.autoConnect = options.autoConnect ?? false
    this.syncToToolHub = options.syncToToolHub
    this.onToolsChanged = options.onToolsChanged
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
        await this.syncServerTools(config.name)
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
    // 从 ToolHub 移除工具
    await this.removeToolsFromToolHub(name)

    // 断开连接
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
    await this.syncServerTools(name)
  }

  /**
   * 停止服务器
   */
  async stop(name: string): Promise<void> {
    await this.disableToolsInToolHub(name)
    await this.connectionManager.disconnect(name)
  }

  /**
   * 重启服务器
   */
  async restart(name: string): Promise<void> {
    await this.disableToolsInToolHub(name)
    await this.connectionManager.disconnect(name)
    await this.connectionManager.connect(this.configs.get(name)!)
    await this.syncServerTools(name)
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
  // ToolHub 同步
  // =========================================================================

  /**
   * 将服务器工具同步到 ToolHub
   */
  async syncServerTools(serverName: string): Promise<Tool[]> {
    if (!this.syncToToolHub) {
      return []
    }

    const server = this.connectionManager.get(serverName)
    if (!server || server.status !== 'connected') {
      throw mcpServerNotFound(serverName)
    }

    // 映射工具
    const result = await this.toolMapper.mapMany(server.tools, serverName)
    const mappedTools = result.tools

    // 注册到 ToolHub
    for (const tool of mappedTools) {
      try {
        await this.syncToToolHub.register(tool)
      } catch (error) {
        // 工具已存在，尝试更新
        const existing = await this.syncToToolHub.get(tool.id)
        if (existing) {
          await this.syncToToolHub.unregister(tool.id)
          await this.syncToToolHub.register(tool)
        }
      }
    }

    // 触发回调
    this.onToolsChanged?.(serverName, mappedTools)

    return mappedTools
  }

  /**
   * 从 ToolHub 移除服务器工具
   */
  async removeToolsFromToolHub(serverName: string): Promise<void> {
    if (!this.syncToToolHub) {
      return
    }

    // 获取当前工具
    const server = this.connectionManager.get(serverName)
    if (!server) return

    // 映射工具 ID
    for (const mcpTool of server.tools) {
      const toolId = this.toolMapper.map(mcpTool, serverName).id
      try {
        await this.syncToToolHub.unregister(toolId)
      } catch {
        // 忽略不存在的错误
      }
    }
  }

  /**
   * 禁用服务器工具（在 ToolHub 中标记为不可用）
   */
  async disableToolsInToolHub(serverName: string): Promise<void> {
    if (!this.syncToToolHub) {
      return
    }

    const server = this.connectionManager.get(serverName)
    if (!server) return

    // 映射工具 ID 并禁用
    for (const mcpTool of server.tools) {
      const toolId = this.toolMapper.map(mcpTool, serverName).id
      try {
        this.syncToToolHub.disable(toolId)
      } catch {
        // 忽略
      }
    }
  }

  /**
   * 同步所有服务器工具到 ToolHub
   */
  async syncAllToolsToToolHub(): Promise<Map<string, Tool[]>> {
    const results = new Map<string, Tool[]>()

    for (const config of this.configs.values()) {
      try {
        if (this.connectionManager.isConnected(config.name)) {
          const tools = await this.syncServerTools(config.name)
          results.set(config.name, tools)
        }
      } catch (error) {
        console.error(`[MCPServerRegistry] Sync failed for ${config.name}:`, error)
      }
    }

    return results
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

    if (!server.uptime || server.uptime < 0) {
      return {
        healthy: false,
        error: 'Server not responding',
      }
    }

    return {
      healthy: true,
      latencyMs: server.uptime * 1000,
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
        await this.syncServerTools(config.name)
      } catch (error) {
        console.error(`[MCPServerRegistry] Failed to start ${config.name}:`, error)
      }
    }
  }

  /**
   * 停止所有服务器
   */
  async stopAll(): Promise<void> {
    // 禁用所有工具
    for (const config of this.configs.values()) {
      await this.disableToolsInToolHub(config.name)
    }

    await this.connectionManager.shutdown()
  }
}
