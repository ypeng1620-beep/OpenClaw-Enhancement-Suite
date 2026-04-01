/**
 * 工具注册表核心实现
 */

import type {
  Tool,
  ToolFilter,
  ToolRegistry,
  ToolSearchQuery,
  ToolSearchResult,
  ToolContext,
  ToolResult,
} from '@openclaw/suite-core'
import type { ToolExecutor } from '../executor/ToolExecutor.js'

/**
 * 工具注册表配置
 */
export interface ToolRegistryOptions {
  /** 默认超时（毫秒） */
  defaultTimeoutMs?: number

  /** 是否启用内置工具 */
  enableBuiltin?: boolean
}

/**
 * 内置工具加载器
 */
export interface BuiltinLoader {
  (): Tool[]
}

/**
 * 工具注册表
 */
export class DefaultToolRegistry implements ToolRegistry {
  private readonly tools: Map<string, Tool> = new Map()
  private readonly executor: ToolExecutor
  private readonly defaultTimeoutMs: number
  private enabled = new Set<string>()

  constructor(options: ToolRegistryOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30000
    this.executor = new ToolExecutor({
      timeoutMs: this.defaultTimeoutMs,
    })
  }

  // =========================================================================
  // 注册与注销
  // =========================================================================

  /**
   * 注册工具
   */
  async register(tool: Tool): Promise<void> {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool already registered: ${tool.id}`)
    }

    this.tools.set(tool.id, tool)
    this.enabled.add(tool.id)
  }

  /**
   * 批量注册工具
   */
  async registerMany(tools: Tool[]): Promise<void> {
    for (const tool of tools) {
      await this.register(tool)
    }
  }

  /**
   * 注销工具
   */
  async unregister(toolId: string): Promise<void> {
    this.tools.delete(toolId)
    this.enabled.delete(toolId)
  }

  /**
   * 启用工具
   */
  enable(toolId: string): void {
    if (!this.tools.has(toolId)) {
      throw new Error(`Tool not found: ${toolId}`)
    }
    this.enabled.add(toolId)
  }

  /**
   * 禁用工具
   */
  disable(toolId: string): void {
    this.enabled.delete(toolId)
  }

  /**
   * 批量禁用
   */
  disableMany(toolIds: string[]): void {
    for (const id of toolIds) {
      this.enabled.delete(id)
    }
  }

  // =========================================================================
  // 查询
  // =========================================================================

  /**
   * 获取单个工具
   */
  async get(toolId: string): Promise<Tool | undefined> {
    return this.tools.get(toolId)
  }

  /**
   * 列出所有工具
   */
  async list(filter?: ToolFilter): Promise<Tool[]> {
    let tools = Array.from(this.tools.values())

    // 只返回启用的
    tools = tools.filter((t) => this.enabled.has(t.id))

    if (!filter) {
      return tools
    }

    // 按命名空间过滤
    if (filter.namespace) {
      tools = tools.filter((t) => t.namespace === filter.namespace)
    }

    // 按来源过滤
    if (filter.source) {
      tools = tools.filter((t) => t.source === filter.source)
    }

    // 按标签过滤
    if (filter.tags && filter.tags.length > 0) {
      tools = tools.filter((t) =>
        filter.tags!.every((tag) => t.tags.includes(tag))
      )
    }

    // 按能力过滤
    if (filter.capabilities) {
      const caps = filter.capabilities
      tools = tools.filter((t) => {
        if (caps.readOnly !== undefined && t.capabilities.readOnly !== caps.readOnly)
          return false
        if (caps.dangerous !== undefined && t.capabilities.dangerous !== caps.dangerous)
          return false
        if (caps.networkAccess !== undefined && t.capabilities.networkAccess !== caps.networkAccess)
          return false
        if (caps.filesystemAccess !== undefined && t.capabilities.filesystemAccess !== caps.filesystemAccess)
          return false
        return true
      })
    }

    return tools
  }

  /**
   * 搜索工具
   */
  async search(query: ToolSearchQuery): Promise<ToolSearchResult[]> {
    const allTools = await this.list()
    const results: ToolSearchResult[] = []
    const limit = query.limit ?? 10
    const queryLower = query.query.toLowerCase()

    for (const tool of allTools) {
      let score = 0
      const matchedFields: string[] = []

      // 精确匹配 ID
      if (tool.id.toLowerCase() === queryLower) {
        score = 1.0
        matchedFields.push('id')
      }
      // ID 包含查询
      else if (tool.id.toLowerCase().includes(queryLower)) {
        score = 0.8
        matchedFields.push('id')
      }
      // 名称匹配
      else if (tool.name.toLowerCase().includes(queryLower)) {
        score = Math.max(score, 0.7)
        matchedFields.push('name')
      }
      // 描述匹配
      else if (tool.description.toLowerCase().includes(queryLower)) {
        score = Math.max(score, 0.5)
        matchedFields.push('description')
      }
      // 标签匹配
      else {
        const matchedTags = tool.tags.filter((t) =>
          t.toLowerCase().includes(queryLower)
        )
        if (matchedTags.length > 0) {
          score = Math.max(score, 0.4)
          matchedFields.push('tags')
        }
        // 命名空间匹配
        if (tool.namespace.toLowerCase().includes(queryLower)) {
          score = Math.max(score, 0.3)
          matchedFields.push('namespace')
        }
      }

      // 检查必需标签
      if (query.requireTags && query.requireTags.length > 0) {
        const hasAllTags = query.requireTags.every((tag) =>
          tool.tags.includes(tag)
        )
        if (!hasAllTags) continue
      }

      if (score > 0) {
        results.push({ tool, score, matchedFields })
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score)

    return results.slice(0, limit)
  }

  // =========================================================================
  // 执行
  // =========================================================================

  /**
   * 执行工具
   */
  async execute(
    toolId: string,
    input: unknown,
    ctx: ToolContext
  ): Promise<ToolResult> {
    // 检查工具是否存在
    const tool = this.tools.get(toolId)
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`)
    }

    // 检查工具是否启用
    if (!this.enabled.has(toolId)) {
      throw new Error(`Tool disabled: ${toolId}`)
    }

    // 委派给执行器
    return this.executor.execute(tool, input, ctx)
  }

  // =========================================================================
  // 工具发现
  // =========================================================================

  /**
   * 列出所有命名空间
   */
  async listNamespaces(): Promise<string[]> {
    const tools = await this.list()
    const namespaces = new Set(tools.map((t) => t.namespace))
    return Array.from(namespaces).sort()
  }

  /**
   * 列出所有标签
   */
  async listTags(): Promise<Record<string, number>> {
    const tools = await this.list()
    const tagCount = new Map<string, number>()

    for (const tool of tools) {
      for (const tag of tool.tags) {
        tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1)
      }
    }

    return Object.fromEntries(tagCount)
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    total: number
    enabled: number
    byNamespace: Record<string, number>
    bySource: Record<string, number>
  }> {
    const allTools = Array.from(this.tools.values())
    const enabledTools = await this.list()

    const byNamespace: Record<string, number> = {}
    const bySource: Record<string, number> = {}

    for (const tool of allTools) {
      byNamespace[tool.namespace] = (byNamespace[tool.namespace] ?? 0) + 1
      bySource[tool.source] = (bySource[tool.source] ?? 0) + 1
    }

    return {
      total: allTools.length,
      enabled: enabledTools.length,
      byNamespace,
      bySource,
    }
  }
}
