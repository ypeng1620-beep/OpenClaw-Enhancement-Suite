/**
 * 内置工具 - 文件系统
 */

import { readFile, writeFile, stat, readdir } from 'fs/promises'
import { join, basename, dirname } from 'path'
import type {
  Tool,
  ToolContext,
  ToolResult,
  JSONSchema,
} from '@openclaw/suite-core'
import { buildTool } from '@openclaw/suite-core'

// ============================================================================
// 辅助函数
// ============================================================================

function createSuccessResult(
  toolId: string,
  data: unknown,
  durationMs: number
): ToolResult {
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
): ToolResult {
  return {
    success: false,
    error: { code, message, recoverable: true },
    metadata: { toolId, durationMs },
  }
}

async function resolvePath(path: string, workspace?: string): Promise<string> {
  if (path.startsWith('/') || path.match(/^[A-Za-z]:/)) {
    return path
  }
  if (workspace) {
    return join(workspace, path)
  }
  return path
}

// ============================================================================
// 工具定义
// ============================================================================

/**
 * 读取文件工具
 */
export const readFileTool: Tool = buildTool({
  id: 'filesystem/read',
  name: 'Read File',
  namespace: 'filesystem',
  source: 'builtin',
  description: 'Read contents of a file',
  tags: ['file', 'read', 'filesystem'],
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read',
      },
      encoding: {
        type: 'string',
        description: 'File encoding',
        default: 'utf-8',
      },
      maxBytes: {
        type: 'number',
        description: 'Maximum bytes to read',
      },
    },
    required: ['path'],
  },
  capabilities: {
    readOnly: true,
    filesystemAccess: true,
    dangerous: false,
    networkAccess: false,
    longRunning: false,
    streaming: false,
  },
  async execute(input, context) {
    const start = Date.now()
    const { path, encoding = 'utf-8', maxBytes } = input as {
      path: string
      encoding?: string
      maxBytes?: number
    }

    try {
      const resolvedPath = await resolvePath(path, context.workspace)

      // 安全检查：防止路径遍历
      if (resolvedPath.includes('..')) {
        return createErrorResult(
          this.id,
          Date.now() - start,
          'SECURITY_ERROR',
          'Path traversal not allowed'
        )
      }

      let content: string | Buffer = await readFile(resolvedPath)

      // 截断
      if (maxBytes && content.length > maxBytes) {
        content = content.slice(0, maxBytes)
        return {
          ...createSuccessResult(this.id, content.toString(), Date.now() - start),
          truncated: true,
          metadata: {
            toolId: this.id,
            durationMs: Date.now() - start,
            truncated: true,
            originalSize: content.length,
          },
        } as ToolResult & { truncated: boolean }
      }

      return createSuccessResult(
        this.id,
        content.toString(),
        Date.now() - start
      )
    } catch (error) {
      return createErrorResult(
        this.id,
        Date.now() - start,
        'READ_ERROR',
        error instanceof Error ? error.message : String(error)
      )
    }
  },
})

/**
 * 写入文件工具
 */
export const writeFileTool: Tool = buildTool({
  id: 'filesystem/write',
  name: 'Write File',
  namespace: 'filesystem',
  source: 'builtin',
  description: 'Write content to a file',
  tags: ['file', 'write', 'filesystem'],
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write',
      },
      content: {
        type: 'string',
        description: 'Content to write',
      },
      encoding: {
        type: 'string',
        description: 'File encoding',
        default: 'utf-8',
      },
    },
    required: ['path', 'content'],
  },
  capabilities: {
    readOnly: false,
    filesystemAccess: true,
    dangerous: true, // 可以覆盖文件
    networkAccess: false,
    longRunning: false,
    streaming: false,
  },
  async execute(input, context) {
    const start = Date.now()
    const { path, content, encoding = 'utf-8' } = input as {
      path: string
      content: string
      encoding?: string
    }

    try {
      const resolvedPath = await resolvePath(path, context.workspace)

      // 安全检查：防止路径遍历
      if (resolvedPath.includes('..')) {
        return createErrorResult(
          this.id,
          Date.now() - start,
          'SECURITY_ERROR',
          'Path traversal not allowed'
        )
      }

      await writeFile(resolvedPath, content, encoding as BufferEncoding)

      return createSuccessResult(this.id, { path, written: content.length }, Date.now() - start)
    } catch (error) {
      return createErrorResult(
        this.id,
        Date.now() - start,
        'WRITE_ERROR',
        error instanceof Error ? error.message : String(error)
      )
    }
  },
})

/**
 * 列目录工具
 */
export const listDirTool: Tool = buildTool({
  id: 'filesystem/list',
  name: 'List Directory',
  namespace: 'filesystem',
  source: 'builtin',
  description: 'List files and directories',
  tags: ['file', 'list', 'directory', 'filesystem'],
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the directory',
      },
    },
    required: ['path'],
  },
  capabilities: {
    readOnly: true,
    filesystemAccess: true,
    dangerous: false,
    networkAccess: false,
    longRunning: false,
    streaming: false,
  },
  async execute(input, context) {
    const start = Date.now()
    const { path } = input as { path: string }

    try {
      const resolvedPath = await resolvePath(path, context.workspace)

      // 安全检查
      if (resolvedPath.includes('..')) {
        return createErrorResult(
          this.id,
          Date.now() - start,
          'SECURITY_ERROR',
          'Path traversal not allowed'
        )
      }

      const entries = await readdir(resolvedPath)
      const results = await Promise.all(
        entries.map(async (name) => {
          try {
            const entryPath = join(resolvedPath, name)
            const stats = await stat(entryPath)
            return {
              name,
              type: stats.isDirectory() ? 'directory' : 'file',
              size: stats.size,
            }
          } catch {
            return { name, type: 'unknown', size: 0 }
          }
        })
      )

      return createSuccessResult(this.id, results, Date.now() - start)
    } catch (error) {
      return createErrorResult(
        this.id,
        Date.now() - start,
        'LIST_ERROR',
        error instanceof Error ? error.message : String(error)
      )
    }
  },
})

/**
 * 获取文件信息工具
 */
export const fileInfoTool: Tool = buildTool({
  id: 'filesystem/info',
  name: 'File Info',
  namespace: 'filesystem',
  source: 'builtin',
  description: 'Get file or directory information',
  tags: ['file', 'info', 'stat', 'filesystem'],
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file or directory',
      },
    },
    required: ['path'],
  },
  capabilities: {
    readOnly: true,
    filesystemAccess: true,
    dangerous: false,
    networkAccess: false,
    longRunning: false,
    streaming: false,
  },
  async execute(input, context) {
    const start = Date.now()
    const { path } = input as { path: string }

    try {
      const resolvedPath = await resolvePath(path, context.workspace)

      if (resolvedPath.includes('..')) {
        return createErrorResult(
          this.id,
          Date.now() - start,
          'SECURITY_ERROR',
          'Path traversal not allowed'
        )
      }

      const stats = await stat(resolvedPath)

      return createSuccessResult(
        this.id,
        {
          path: resolvedPath,
          name: basename(resolvedPath),
          parent: dirname(resolvedPath),
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          accessed: stats.atime,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
        },
        Date.now() - start
      )
    } catch (error) {
      return createErrorResult(
        this.id,
        Date.now() - start,
        'INFO_ERROR',
        error instanceof Error ? error.message : String(error)
      )
    }
  },
})

/**
 * 获取所有内置文件系统工具
 */
export function getFilesystemTools(): Tool[] {
  return [readFileTool, writeFileTool, listDirTool, fileInfoTool]
}
