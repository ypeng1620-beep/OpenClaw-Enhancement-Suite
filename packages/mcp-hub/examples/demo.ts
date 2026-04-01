/**
 * MCP Hub 使用示例
 *
 * 运行方式: npx tsx examples/demo.ts
 */

import {
  MCPServerRegistry,
  MCPToolMapper,
  MCPServerConfig,
} from '../src/index.js'

async function main() {
  console.log('=== MCP Hub Demo ===\n')

  // 1. 创建注册表
  console.log('1. 创建 MCP 服务器注册表...')
  const registry = new MCPServerRegistry({
    autoConnect: false, // 演示用，不自动连接
  })
  console.log('   注册表已创建\n')

  // 2. 注册 MCP 服务器配置
  console.log('2. 注册 MCP 服务器配置...')
  const configs: MCPServerConfig[] = [
    {
      name: 'filesystem',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
      description: '文件系统 MCP 服务器',
    },
    {
      name: 'github',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      description: 'GitHub MCP 服务器',
    },
    {
      name: 'brave-search',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      description: 'Brave 搜索 MCP 服务器',
    },
  ]

  for (const config of configs) {
    await registry.register(config)
    console.log(`   ✅ 注册: ${config.name}`)
  }
  console.log()

  // 3. 列出服务器
  console.log('3. 已注册的服务器:')
  const allConfigs = registry.listConfigs()
  for (const config of allConfigs) {
    console.log(`   - ${config.name} (${config.type}): ${config.description}`)
  }
  console.log()

  // 4. 获取服务器状态
  console.log('4. 服务器状态:')
  const allStatus = registry.listStatus()
  for (const status of allStatus) {
    console.log(`   - ${status.name}: ${status.status}`)
  }
  console.log()

  // 5. 工具映射器
  console.log('5. 工具映射器...')
  const mapper = new MCPToolMapper({
    namespacePrefix: 'mcp',
    includeServerName: true,
    defaultVersion: '1.0.0',
    customMetadata: {
      'mcp__filesystem__read': {
        capabilities: {
          readOnly: true,
          filesystemAccess: true,
        },
      },
    },
  })

  // 模拟 MCP 工具
  const mockMCPTools = [
    {
      name: 'read_file',
      description: 'Read contents of a file',
    },
    {
      name: 'write_file',
      description: 'Write content to a file',
    },
    {
      name: 'list_directory',
      description: 'List files in a directory',
    },
  ]

  console.log('   映射 MCP 工具到 OpenClaw Tool...')
  const result = await mapper.mapMany(mockMCPTools, 'filesystem')

  console.log(`   ✅ 成功映射: ${result.mappedCount} 个工具`)
  console.log(`   ❌ 失败: ${result.failedCount} 个`)

  if (result.errors.length > 0) {
    console.log('   错误:')
    for (const error of result.errors) {
      console.log(`     - ${error}`)
    }
  }
  console.log()

  // 6. 查看映射结果
  console.log('6. 映射后的工具:')
  for (const tool of result.tools) {
    console.log(`   - ID: ${tool.id}`)
    console.log(`     名称: ${tool.name}`)
    console.log(`     描述: ${tool.description}`)
    console.log(`     能力: readOnly=${tool.capabilities.readOnly}, fs=${tool.capabilities.filesystemAccess}`)
  }
  console.log()

  // 7. 健康检查（模拟）
  console.log('7. 健康检查...')
  console.log('   注意：演示模式下服务器未实际连接\n')

  // 8. 清理
  console.log('8. 清理...')
  await registry.stopAll()
  console.log('   所有服务器已停止\n')

  console.log('=== Demo 完成 ===')
}

main().catch(console.error)
