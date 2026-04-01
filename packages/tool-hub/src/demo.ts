/**
 * ToolHub 使用示例
 *
 * 运行方式: npx tsx src/demo.ts
 */

import { DefaultToolRegistry } from './registry/ToolRegistry.js'
import { ToolExecutor } from './executor/ToolExecutor.js'
import { getAllBuiltinTools } from './builtin/index.js'
import { SearchEngine } from './search/SearchEngine.js'
import {
  createPermissionContext,
  buildTool,
} from '@openclaw/suite-core'

async function main() {
  console.log('=== ToolHub Demo ===\n')

  // 1. 创建注册表
  console.log('1. 创建工具注册表...')
  const registry = new DefaultToolRegistry({
    defaultTimeoutMs: 30000,
  })

  // 2. 注册内置工具
  console.log('2. 注册内置工具...')
  const builtinTools = getAllBuiltinTools()
  await registry.registerMany(builtinTools)
  console.log(`   已注册 ${builtinTools.length} 个内置工具\n`)

  // 3. 创建自定义工具
  console.log('3. 创建自定义工具...')
  const echoTool = buildTool({
    id: 'custom/echo',
    name: 'Echo',
    namespace: 'custom',
    source: 'user',
    description: 'Echoes the input back',
    tags: ['echo', 'test'],
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
    execute: async (input) => {
      const { message } = input as { message: string }
      return {
        success: true,
        data: { echo: message },
        metadata: { toolId: 'custom/echo', durationMs: 0 },
      }
    },
  })
  await registry.register(echoTool)
  console.log('   已注册 custom/echo\n')

  // 4. 列出所有工具
  console.log('4. 列出所有工具:')
  const allTools = await registry.list()
  console.log(`   共 ${allTools.length} 个工具:`)
  for (const tool of allTools) {
    console.log(`   - ${tool.id}: ${tool.description}`)
  }
  console.log()

  // 5. 按命名空间过滤
  console.log('5. 文件系统工具:')
  const fsTools = await registry.list({ namespace: 'filesystem' })
  for (const tool of fsTools) {
    console.log(`   - ${tool.id}`)
  }
  console.log()

  // 6. 搜索工具
  console.log('6. 搜索 "file read":')
  const searchResults = await registry.search({
    query: 'file read',
    limit: 5,
  })
  for (const result of searchResults) {
    console.log(
      `   - ${result.tool.id} (score: ${result.score.toFixed(2)}) [${result.matchedFields.join(', ')}]`
    )
  }
  console.log()

  // 7. 使用自定义搜索
  console.log('7. 使用自定义搜索引擎 (同义词扩展):')
  const engine = new SearchEngine({
    enableSynonymExpansion: true,
    fuzzyThreshold: 0.6,
  })

  const results = engine.search(allTools, {
    query: '查看文件',
    limit: 5,
  })
  console.log(`   搜索 "查看文件" 结果:`)
  for (const result of results) {
    console.log(`   - ${result.tool.id} (score: ${result.score.toFixed(2)})`)
  }
  console.log()

  // 8. 执行工具
  console.log('8. 执行内置 Echo 工具:')
  const ctx = createPermissionContext('demo-session', 'demo-user', {
    workspace: process.cwd(),
  })

  const echoResult = await registry.execute('custom/echo', {
    message: 'Hello from ToolHub!',
  }, ctx)

  console.log('   结果:', JSON.stringify(echoResult.data, null, 2))
  console.log()

  // 9. 执行带钩子的工具
  console.log('9. 创建带生命周期的工具:')

  const loggedTool = buildTool({
    id: 'custom/logged',
    name: 'Logged Tool',
    namespace: 'custom',
    source: 'user',
    description: 'A tool with lifecycle hooks',
    tags: ['test'],
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'number' },
      },
      required: ['value'],
    },
    hooks: {
      beforeExecute: async (input) => {
        console.log('   [Hook] beforeExecute called')
        return { input }
      },
      afterExecute: async (input, ctx, result) => {
        console.log('   [Hook] afterExecute called')
      },
      onError: async (input, ctx, error) => {
        console.log('   [Hook] onError called:', error)
      },
    },
    execute: async (input) => {
      const { value } = input as { value: number }
      return {
        success: true,
        data: { result: value * 2 },
        metadata: { toolId: 'custom/logged', durationMs: 0 },
      }
    },
  })

  await registry.register(loggedTool)
  const loggedResult = await registry.execute('custom/logged', { value: 21 }, ctx)
  console.log('   结果:', JSON.stringify(loggedResult.data, null, 2))
  console.log()

  // 10. 统计信息
  console.log('10. 注册表统计:')
  const stats = await registry.getStats()
  console.log('   总工具数:', stats.total)
  console.log('   启用工具数:', stats.enabled)
  console.log('   按命名空间:', stats.byNamespace)
  console.log('   按来源:', stats.bySource)
  console.log()

  console.log('=== Demo 完成 ===')
}

main().catch(console.error)
