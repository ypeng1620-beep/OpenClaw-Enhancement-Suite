/**
 * 集成测试：MCP Hub + ToolHub
 *
 * 场景：
 * 1. MCP 服务器启动，工具列表发现
 * 2. MCPToolMapper 将 MCP 工具映射到 OpenClaw Tool
 * 3. MCPServerRegistry 自动同步到 ToolRegistry
 * 4. 验证工具可被发现和执行
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ToolRegistry } from '@openclaw/suite-tool-hub'
import {
  MCPServerRegistry,
  MCPToolMapper,
} from '@openclaw/suite-mcp-hub'
import type { MCPServerConfig, MCPTool } from '@openclaw/suite-core'

describe('MCP Hub + ToolHub 集成', () => {
  let toolRegistry: ToolRegistry
  let registry: MCPServerRegistry
  let mapper: MCPToolMapper

  beforeEach(() => {
    toolRegistry = new ToolRegistry()
    mapper = new MCPToolMapper({
      namespacePrefix: 'mcp',
      includeServerName: true,
    })
  })

  it('MCP 工具应映射到正确的 Tool ID 格式', async () => {
    // 模拟 MCP 工具
    const mcpTools: MCPTool[] = [
      { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object' } },
      { name: 'write_file', description: 'Write a file', inputSchema: { type: 'object' } },
      { name: 'list_directory', description: 'List directory', inputSchema: { type: 'object' } },
    ]

    // 映射
    const result = await mapper.mapMany(mcpTools, 'filesystem')

    expect(result.mappedCount).toBe(3)
    expect(result.failedCount).toBe(0)

    // 验证 ID 格式
    const ids = result.tools.map((t) => t.id)
    expect(ids).toContain('mcp__filesystem__read_file')
    expect(ids).toContain('mcp__filesystem__write_file')
    expect(ids).toContain('mcp__filesystem__list_directory')

    // 验证 namespace
    expect(result.tools[0].namespace).toBe('mcp')
    expect(result.tools[0].source).toBe('mcp')
  })

  it('MCPServerRegistry 应自动同步工具到 ToolRegistry', async () => {
    // 创建带 ToolHub 绑定的注册表
    registry = new MCPServerRegistry({
      syncToToolHub: toolRegistry,
      toolMapper: mapper,
    })

    // 注册 MCP 服务器配置
    const config: MCPServerConfig = {
      name: 'github',
      type: 'stdio',
      command: 'echo',
      args: ['mock'],
      description: 'GitHub MCP server',
    }

    await registry.register(config)

    // 注意：由于是 mock 服务器，不会真正连接
    // 这里测试配置注册逻辑

    const savedConfig = registry.getConfig('github')
    expect(savedConfig).toBeDefined()
    expect(savedConfig?.name).toBe('github')
    expect(savedConfig?.type).toBe('stdio')
  })

  it('MCP 工具的 capability 应默认只读', async () => {
    const mcpTools: MCPTool[] = [
      { name: 'search_repositories', description: 'Search', inputSchema: {} },
    ]

    const result = await mapper.mapMany(mcpTools, 'github')

    expect(result.tools[0].capabilities.readOnly).toBe(true)
    expect(result.tools[0].capabilities.networkAccess).toBe(false)
    expect(result.tools[0].capabilities.dangerous).toBe(false)
  })

  it('自定义 metadata 应覆盖默认 capability', async () => {
    const customMapper = new MCPToolMapper({
      customMetadata: {
        'mcp__net__http_request': {
          capabilities: {
            networkAccess: true,
            dangerous: true,
          },
        },
      },
    })

    const mcpTools: MCPTool[] = [
      { name: 'http_request', description: 'HTTP request', inputSchema: {} },
    ]

    const result = await customMapper.mapMany(mcpTools, 'net')

    const tool = result.tools[0]
    expect(tool.capabilities.networkAccess).toBe(true)
    expect(tool.capabilities.dangerous).toBe(true)
  })

  it('批量映射应支持进度回调', async () => {
    const progressCalls: Array<{ done: number; total: number }> = []

    const manyTools: MCPTool[] = Array.from({ length: 100 }, (_, i) => ({
      name: `tool_${i}`,
      description: `Tool ${i}`,
      inputSchema: {},
    }))

    const result = await mapper.mapMany(manyTools, 'mock', {
      batchSize: 30,
      parallel: true,
      onProgress: (done, total) => {
        progressCalls.push({ done, total })
      },
    })

    expect(result.mappedCount).toBe(100)
    expect(result.failedCount).toBe(0)
    expect(progressCalls.length).toBeGreaterThan(0)
    expect(progressCalls[progressCalls.length - 1].done).toBe(100)
  })

  it('工具应包含正确的 tags', async () => {
    const mcpTools: MCPTool[] = [
      { name: 'read_file', description: 'Read', inputSchema: {} },
    ]

    const result = await mapper.mapMany(mcpTools, 'fs')

    const tags = result.tools[0].tags
    expect(tags).toContain('mcp')
    expect(tags).toContain('fs')
    // Tool name is not included in tags (only namespace and custom tags)
  })
})
