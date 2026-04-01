/**
 * ToolHub 基本测试
 */

import { DefaultToolRegistry } from '../registry/ToolRegistry.js'
import { getAllBuiltinTools } from '../builtin/index.js'
import { createPermissionContext } from '@openclaw/suite-core'

describe('ToolRegistry', () => {
  let registry: DefaultToolRegistry

  beforeEach(async () => {
    registry = new DefaultToolRegistry({
      defaultTimeoutMs: 5000,
    })
  })

  describe('register / get', () => {
    it('should register and retrieve a tool', async () => {
      const tools = getAllBuiltinTools()
      await registry.register(tools[0])

      const tool = await registry.get(tools[0].id)
      expect(tool).toBeDefined()
      expect(tool?.id).toBe(tools[0].id)
    })

    it('should throw when registering duplicate tool', async () => {
      const tools = getAllBuiltinTools()
      await registry.register(tools[0])

      await expect(registry.register(tools[0])).rejects.toThrow(
        'already registered'
      )
    })

    it('should list all registered tools', async () => {
      const tools = getAllBuiltinTools()
      await registry.registerMany(tools)

      const all = await registry.list()
      expect(all.length).toBe(tools.length)
    })

    it('should filter tools by namespace', async () => {
      await registry.registerMany(getAllBuiltinTools())

      const fsTools = await registry.list({ namespace: 'filesystem' })
      expect(fsTools.length).toBeGreaterThan(0)
      expect(fsTools.every((t) => t.namespace === 'filesystem')).toBe(true)
    })

    it('should filter tools by tags', async () => {
      await registry.registerMany(getAllBuiltinTools())

      const readTools = await registry.list({ tags: ['read'] })
      expect(readTools.length).toBeGreaterThan(0)
    })
  })

  describe('search', () => {
    beforeEach(async () => {
      await registry.registerMany(getAllBuiltinTools())
    })

    it('should find tools by name', async () => {
      const results = await registry.search({ query: 'read file' })
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].score).toBeGreaterThan(0)
    })

    it('should find tools by namespace', async () => {
      const results = await registry.search({ query: 'filesystem' })
      expect(results.length).toBeGreaterThan(0)
    })

    it('should limit results', async () => {
      const results = await registry.search({ query: 'file', limit: 2 })
      expect(results.length).toBeLessThanOrEqual(2)
    })
  })

  describe('execute', () => {
    beforeEach(async () => {
      await registry.registerMany(getAllBuiltinTools())
    })

    it('should throw for non-existent tool', async () => {
      const ctx = createPermissionContext('test-session', 'test-user')

      await expect(
        registry.execute('nonexistent/tool', {}, ctx)
      ).rejects.toThrow('not found')
    })
  })
})
