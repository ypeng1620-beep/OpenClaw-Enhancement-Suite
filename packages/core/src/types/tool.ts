/**
 * Tool 相关类型定义
 * 对应 api-standards.md 一、1.1
 */

// ============================================================================
// 核心类型
// ============================================================================

/** 工具来源 */
export type ToolSource = 'builtin' | 'mcp' | 'skill' | 'plugin' | 'user'

/** JSON Schema 简化版 */
export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array'
  properties?: Record<string, JSONSchema>
  required?: string[]
  description?: string
  default?: unknown
  enum?: unknown[]
  items?: JSONSchema
}

/** 工具能力标记 */
export interface ToolCapabilities {
  readonly readOnly: boolean
  readonly networkAccess: boolean
  readonly filesystemAccess: boolean
  readonly dangerous: boolean
  readonly longRunning: boolean
  readonly streaming: boolean
}

/** 默认能力（全为 false） */
export const DEFAULT_CAPABILITIES: ToolCapabilities = {
  readOnly: false,
  networkAccess: false,
  filesystemAccess: false,
  dangerous: false,
  longRunning: false,
  streaming: false,
}

/** 工具执行结果元数据 */
export interface ToolResultMetadata {
  readonly toolId: string
  readonly durationMs: number
  readonly tokenCost?: number
  readonly cached?: boolean
}

/** 工具错误 */
export interface ToolError {
  readonly code: string
  readonly message: string
  readonly recoverable: boolean
}

/** 工具执行结果 */
export interface ToolResult {
  readonly success: boolean
  readonly data?: unknown
  readonly error?: ToolError
  readonly metadata: ToolResultMetadata
}

/** 工具执行上下文 */
export interface ToolContext {
  readonly sessionId: string
  readonly userId: string
  readonly workspace?: string
  readonly env: Record<string, string>
  readonly permissions: import('./permission.js').PermissionContext
}

/** 工具生命周期钩子 */
export interface ToolLifecycleHooks {
  /** 执行前调用 - 可返回修改后的 input 或拒绝执行 */
  readonly beforeExecute?: (
    input: unknown,
    context: ToolContext
  ) => Promise<{ input: unknown } | { reject: true; reason: string }>

  /** 执行后调用 - 可记录日志、修改结果 */
  readonly afterExecute?: (
    input: unknown,
    context: ToolContext,
    result: ToolResult
  ) => Promise<void>

  /** 错误时调用 - 可做错误上报、降级处理 */
  readonly onError?: (
    input: unknown,
    context: ToolContext,
    error: unknown
  ) => Promise<void>
}

/** 工具执行阶段 */
export type ToolExecutionPhase =
  | { phase: 'validating'; input: unknown }
  | { phase: 'beforeExecute'; input: unknown }
  | { phase: 'executing'; input: unknown }
  | { phase: 'afterExecute'; input: unknown; result: ToolResult }
  | { phase: 'onError'; input: unknown; error: unknown }
  | { phase: 'completed'; result: ToolResult }
  | { phase: 'timeout'; timeoutMs: number }

/** 工具基类接口 */
export interface Tool {
  // 工具标识
  readonly id: string
  readonly name: string
  readonly version: string

  // 归属
  readonly namespace: string
  readonly source: ToolSource

  // 描述
  readonly description: string
  readonly tags: string[]

  // Schema
  readonly inputSchema: JSONSchema
  readonly outputSchema?: JSONSchema

  // 能力
  readonly capabilities: ToolCapabilities

  // 生命周期钩子（可选）
  readonly hooks?: ToolLifecycleHooks

  // 执行
  execute(input: unknown, context: ToolContext): Promise<ToolResult>
}

// ============================================================================
// 工具注册表
// ============================================================================

/** 工具过滤器 */
export interface ToolFilter {
  namespace?: string
  source?: ToolSource
  tags?: string[]
  capabilities?: Partial<ToolCapabilities>
}

/** 工具搜索查询 */
export interface ToolSearchQuery {
  readonly query: string
  readonly limit?: number
  readonly requireTags?: string[]
}

/** 工具搜索结果 */
export interface ToolSearchResult {
  readonly tool: Tool
  readonly score: number
  readonly matchedFields: string[]
}

/** 工具注册表接口 */
export interface ToolRegistry {
  register(tool: Tool): Promise<void>
  unregister(toolId: string): Promise<void>
  get(toolId: string): Promise<Tool | undefined>
  list(filter?: ToolFilter): Promise<Tool[]>
  search(query: ToolSearchQuery): Promise<ToolSearchResult[]>
  execute(toolId: string, input: unknown, ctx: ToolContext): Promise<ToolResult>
}

// ============================================================================
// 工具发现与安装
// ============================================================================

/** 工具发现来源 */
export type ToolDiscovererSource = 'npm' | 'github' | 'mcp' | 'local'

/** 工具发现器 */
export interface ToolDiscoverer {
  readonly source: ToolDiscovererSource
  discover(): Promise<Tool[]>
}

/** 安装选项 */
export interface InstallOptions {
  readonly version?: string
  readonly targetDir?: string
  readonly config?: Record<string, unknown>
}

/** 工具安装器 */
export interface ToolInstaller {
  install(source: string, options?: InstallOptions): Promise<Tool>
  uninstall(toolId: string): Promise<void>
  update(toolId: string): Promise<Tool>
}

// ============================================================================
// 工具执行辅助
// ============================================================================

/** 构建工具的默认选项 */
export interface ToolDefOptions<TInput = unknown, TOutput = unknown> {
  id: string
  name: string
  version?: string
  namespace: string
  source?: ToolSource
  description: string
  tags?: string[]
  inputSchema: JSONSchema
  outputSchema?: JSONSchema
  capabilities?: Partial<ToolCapabilities>
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>
}

/** 带默认值的工具 */
export interface BuiltTool<TInput = unknown, TOutput = unknown> extends Tool {
  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>
}

/** 工具构建器 */
export function buildTool<TInput = unknown, TOutput = unknown>(
  def: ToolDefOptions<TInput, TOutput>
): BuiltTool<TInput, TOutput> {
  return {
    ...DEFAULT_TOOL_DEFAULTS,
    ...def,
    version: def.version ?? '1.0.0',
    source: def.source ?? 'user',
    tags: def.tags ?? [],
    capabilities: { ...DEFAULT_CAPABILITIES, ...def.capabilities },
    execute: def.execute as Tool['execute'],
  } as BuiltTool<TInput, TOutput>
}

/** 工具默认值 */
const DEFAULT_TOOL_DEFAULTS: Partial<Tool> = {
  version: '1.0.0',
  source: 'user',
  tags: [],
}
