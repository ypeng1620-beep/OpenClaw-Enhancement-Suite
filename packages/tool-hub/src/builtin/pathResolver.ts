/**
 * 路径解析器
 *
 * 可配置的路径解析，支持：
 * - 自定义基础目录
 * - 绝对路径控制
 * - 路径遍历 (..) 控制
 */

import { join } from 'path'

/**
 * 路径解析器配置
 */
export interface PathResolverConfig {
  /** 默认工作目录 */
  defaultBaseDir?: string

  /** 是否允许绝对路径 */
  allowAbsolute?: boolean

  /** 是否允许路径遍历 (..) */
  allowTraversal?: boolean
}

const DEFAULT_CONFIG: PathResolverConfig = {
  defaultBaseDir: process.cwd(),
  allowAbsolute: true,
  allowTraversal: false,
}

/**
 * 创建路径解析器
 */
export function createPathResolver(config: Partial<PathResolverConfig> = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  return async function resolvePath(
    userPath: string,
    workspace?: string
  ): Promise<string> {
    // 优先使用 workspace
    const baseDir = workspace || cfg.defaultBaseDir!

    // 绝对路径检查
    if (userPath.match(/^[A-Za-z]:/) || userPath.startsWith('/')) {
      if (!cfg.allowAbsolute) {
        throw new Error('Absolute paths are not allowed')
      }
      return userPath
    }

    const resolved = join(baseDir, userPath)

    // 路径遍历检查
    if (!cfg.allowTraversal && resolved.includes('..')) {
      throw new Error('Path traversal not allowed')
    }

    return resolved
  }
}
