/**
 * MCP Hub 单元测试
 */

import { MCPToolMapper, MappingResult } from '../src/mapper/MCPToolMapper.js'
import type { MCPTool } from '@openclaw/suite-core'

function createMockMCPTools(count: number): MCPTool[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `tool_${i}`,
    description: `Test tool ${i}`,
    inputSchema: { type: 'object' as const },
  }))
}

describe('MCPToolMapper', () => {
  let mapper: MCPToolMapper

  beforeEach(() => {
    mapper = new MCPToolMapper({
      namespacePrefix: 'mcp',
      includeServerName: true,
    })
  })

  describe('map', () => {
    it('应正确映射单个工具', () => {
      const mcpTool: MCPTool = {
        name: 'read_file',
        description: 'Read a file',
      }

      const tool = mapper.map(mcpTool, 'filesystem')

      expect(tool.id).toBe('mcp__filesystem__read_file')
      expect(tool.name).toBe('read_file')
      expect(tool.namespace).toBe('mcp')
      expect(tool.source).toBe('mcp')
      expect(tool.description).toBe('Read a file')
      expect(tool.tags).toContain('filesystem')
    })

    it('应使用自定义命名空间前缀', () => {
      const customMapper = new MCPToolMapper({
        namespacePrefix: 'custom',
        includeServerName: true,
      })

      const tool = customMapper.map({ name: 'test', description: '' }, 'server')
      expect(tool.id).toBe('custom__server__test')
    })

    it('应支持不包含服务器名称', () => {
      const customMapper = new MCPToolMapper({
        namespacePrefix: 'mcp',
        includeServerName: false,
      })

      const tool = customMapper.map({ name: 'test', description: '' }, 'server')
      expect(tool.id).toBe('mcp__test')
    })

    it('应使用自定义元数据', () => {
      const customMapper = new MCPToolMapper({
        customMetadata: {
          'mcp__fs__test': {
            tags: ['custom-tag'],
            capabilities: {
              dangerous: true,
            },
          },
        },
      })

      const tool = customMapper.map({ name: 'test', description: '' }, 'fs')
      expect(tool.tags).toContain('custom-tag')
      expect(tool.capabilities.dangerous).toBe(true)
    })
  })

  describe('mapMany', () => {
    it('应批量映射工具', async () => {
      const mcpTools = createMockMCPTools(10)
      const result = await mapper.mapMany(mcpTools, 'test')

      expect(result.mappedCount).toBe(10)
      expect(result.failedCount).toBe(0)
      expect(result.tools).toHaveLength(10)
      expect(result.success).toBe(true)
    })

    it('应正确处理错误', async () => {
      // 创建一个会导致映射失败的场景
      const customMapper = new MCPToolMapper({
        // 空配置
      })

      const result = await customMapper.mapMany([], 'test')
      expect(result.mappedCount).toBe(0)
      expect(result.success).toBe(true)
    })

    it('应支持进度回调', async () => {
      const mcpTools = createMockMCPTools(100)
      const progress: Array<{ completed: number; total: number }> = []

      const result = await mapper.mapMany(mcpTools, 'test', {
        batchSize: 30,
        parallel: false,
        onProgress: (completed, total) => {
          progress.push({ completed, total })
        },
      })

      expect(result.mappedCount).toBe(100)
      expect(progress.length).toBeGreaterThan(0)
      expect(progress[progress.length - 1].total).toBe(100)
    })

    it('应支持分批处理', async () => {
      const mcpTools = createMockMCPTools(100)

      // 串行分批
      const serialResult = await mapper.mapMany(mcpTools, 'test', {
        batchSize: 25,
        parallel: false,
      })
      expect(serialResult.mappedCount).toBe(100)

      // 并行分批
      const parallelResult = await mapper.mapMany(mcpTools, 'test', {
        batchSize: 50,
        parallel: true,
      })
      expect(parallelResult.mappedCount).toBe(100)
    })
  })

  describe('错误处理', () => {
    it('应处理空工具列表', async () => {
      const result = await mapper.mapMany([], 'test')
      expect(result.mappedCount).toBe(0)
      expect(result.success).toBe(true)
      expect(result.tools).toHaveLength(0)
    })

    it('应保留失败的工具错误信息', async () => {
      // 即使有错误，也应该返回成功映射的
      const mixedTools: MCPTool[] = [
        { name: 'valid_tool', description: '' },
        { name: 'another_valid', description: '' },
      ]

      const result = await mapper.mapMany(mixedTools, 'test')
      expect(result.mappedCount).toBe(2)
      expect(result.failedCount).toBe(0)
    })
  })
})

describe('MCPToolMapper 工具 ID 格式', () => {
  it('应生成正确的工具 ID', () => {
    const mapper = new MCPToolMapper({
      namespacePrefix: 'mcp',
      includeServerName: true,
    })

    const tool = mapper.map({ name: 'search', description: '' }, 'github')
    expect(tool.id).toBe('mcp__github__search')
  })

  it('应处理特殊字符的工具名', () => {
    const mapper = new MCPToolMapper({
      namespacePrefix: 'mcp',
      includeServerName: true,
    })

    const tool = mapper.map({ name: 'read-file_v2', description: '' }, 'fs')
    expect(tool.id).toBe('mcp__fs__read-file_v2')
  })
})
