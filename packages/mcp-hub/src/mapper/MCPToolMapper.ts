/**
 * MCP 工具映射器
 *
 * 将 MCP 工具转换为 OpenClaw Tool
 */

import type {
  Tool,
  MCPTool,
  JSONSchema,
  MapManyOptions,
} from '@openclaw/suite-core'
import { mcpMapperFailed } from '../errors.js'

/**
 * 映射结果
 */
export interface MappingResult {
  readonly success: boolean
  readonly tools: Tool[]
  readonly errors: string[]
  readonly mappedCount: number
  readonly failedCount: number
}

/**
 * 映射选项
 */
export interface MapperOptions {
  /** 命名空间前缀 */
  namespacePrefix?: string

  /** 是否包含服务器名称 */
  includeServerName?: boolean

  /** 默认版本 */
  defaultVersion?: string

  /** 自定义工具元数据 */
  customMetadata?: Record<string, Partial<Tool>>
}

/**
 * 默认选项
 */
const DEFAULT_OPTIONS: Required<MapperOptions> = {
  namespacePrefix: 'mcp',
  includeServerName: true,
  defaultVersion: '1.0.0',
  customMetadata: {},
}

/**
 * 默认分批选项
 */
const DEFAULT_BATCH_OPTIONS: MapManyOptions = {
  batchSize: 50,
  parallel: true,
}

/**
 * MCP 工具映射器
 */
export class MCPToolMapper {
  private readonly options: Required<MapperOptions>

  constructor(options: MapperOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * 映射单个 MCP 工具
   */
  map(mcpTool: MCPTool, serverName: string): Tool {
    const toolId = this.buildToolId(serverName, mcpTool.name)

    // 查找自定义元数据
    const customMeta = this.options.customMetadata[toolId] || {}

    return {
      id: toolId,
      name: mcpTool.name,
      version: this.options.defaultVersion,
      namespace: this.options.namespacePrefix,
      source: 'mcp',
      description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
      tags: ['mcp', serverName, ...(customMeta.tags || [])],
      inputSchema: this.convertInputSchema(mcpTool.inputSchema),
      outputSchema: mcpTool.outputSchema
        ? this.convertInputSchema(mcpTool.outputSchema)
        : undefined,
      capabilities: {
        readOnly: customMeta.capabilities?.readOnly ?? true,
        networkAccess: customMeta.capabilities?.networkAccess ?? false,
        filesystemAccess: customMeta.capabilities?.filesystemAccess ?? false,
        dangerous: customMeta.capabilities?.dangerous ?? false,
        longRunning: customMeta.capabilities?.longRunning ?? false,
        streaming: customMeta.capabilities?.streaming ?? false,
      },
      execute: customMeta.execute || (async () => {
        throw new Error(`Tool ${toolId} requires MCPConnectionManager to execute`)
      }),
      ...customMeta,
    }
  }

  /**
   * 批量映射（支持分批和进度回调）
   *
   * @param mcpTools MCP 工具列表
   * @param serverName 服务器名称
   * @param options 分批选项（可选）
   */
  async mapMany(
    mcpTools: MCPTool[],
    serverName: string,
    options?: MapManyOptions
  ): Promise<MappingResult> {
    const opts = { ...DEFAULT_BATCH_OPTIONS, ...options }
    const tools: Tool[] = []
    const errors: string[] = []
    const total = mcpTools.length
    const batchSize = opts.batchSize ?? 50

    if (opts.parallel) {
      // 并行分批处理
      for (let i = 0; i < mcpTools.length; i += batchSize) {
        const batch = mcpTools.slice(i, i + batchSize)
        const batchResults = batch.map((mcpTool) => {
          try {
            return { tool: this.map(mcpTool, serverName), error: null }
          } catch (error) {
            return {
              tool: null,
              error: `${serverName}/${mcpTool.name}: ${error instanceof Error ? error.message : String(error)}`,
            }
          }
        })

        for (const result of batchResults) {
          if (result.tool) {
            tools.push(result.tool)
          } else {
            errors.push(result.error!)
          }
        }

        opts.onProgress?.(tools.length + errors.length, total)
      }
    } else {
      // 串行处理
      for (let i = 0; i < mcpTools.length; i++) {
        const mcpTool = mcpTools[i]
        try {
          tools.push(this.map(mcpTool, serverName))
        } catch (error) {
          errors.push(
            `${serverName}/${mcpTool.name}: ${error instanceof Error ? error.message : String(error)}`
          )
        }

        // 每批报告进度
        if (i % batchSize === 0) {
          opts.onProgress?.(i + 1, total)
        }
      }
      opts.onProgress?.(total, total)
    }

    return {
      success: errors.length === 0,
      tools,
      errors,
      mappedCount: tools.length,
      failedCount: errors.length,
    }
  }

  /**
   * 构建工具 ID
   */
  private buildToolId(serverName: string, toolName: string): string {
    if (this.options.includeServerName) {
      return `${this.options.namespacePrefix}__${serverName}__${toolName}`
    }
    return `${this.options.namespacePrefix}__${toolName}`
  }

  /**
   * 转换输入 Schema
   */
  private convertInputSchema(
    schema?: Record<string, unknown>
  ): JSONSchema {
    if (!schema) {
      return { type: 'object', properties: {} }
    }

    const properties: Record<string, JSONSchema> = {}
    const required: string[] = []

    if (typeof schema === 'object' && schema !== null) {
      for (const [key, value] of Object.entries(schema)) {
        if (typeof value === 'object' && value !== null) {
          const val = value as Record<string, unknown>
          properties[key] = {
            type: (val.type as JSONSchema['type']) || 'string',
            description: val.description as string,
            default: val.default,
            enum: val.enum as unknown[],
          }

          if (val.required || (Array.isArray(val) && key === 'required')) {
            required.push(key)
          }
        } else {
          properties[key] = { type: 'string' }
        }
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    }
  }
}

/**
 * 创建映射器
 */
export function createMCPToolMapper(options?: MapperOptions): MCPToolMapper {
  return new MCPToolMapper(options)
}
