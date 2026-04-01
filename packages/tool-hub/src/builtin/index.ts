/**
 * 内置工具导出
 */

export { getFilesystemTools } from './filesystem.js'
export { getNetworkTools } from './network.js'

import type { Tool } from '@openclaw/suite-core'
import { getFilesystemTools } from './filesystem.js'
import { getNetworkTools } from './network.js'

/**
 * 获取所有内置工具
 */
export function getAllBuiltinTools(): Tool[] {
  return [...getFilesystemTools(), ...getNetworkTools()]
}
