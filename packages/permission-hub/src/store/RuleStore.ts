/**
 * 规则存储
 *
 * 支持内存、文件、远程三种存储方式
 */

import type { PermissionRule } from '@openclaw/suite-core'
import { readFile, writeFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { watch as fsWatch, type FSWatcher } from 'fs'

/**
 * 规则存储配置
 */
export interface RuleStoreOptions {
  /** 数据来源 */
  source: 'memory' | 'file' | 'remote'

  /** 文件路径（source=file 时） */
  filePath?: string

  /** 远程配置中心 URL（source=remote 时） */
  remoteUrl?: string

  /** 轮询间隔（source=remote 时） */
  pollIntervalMs?: number

  /** 初始规则 */
  initialRules?: PermissionRule[]
}

/**
 * 规则存储接口
 */
export interface IRuleStore {
  getRules(): Promise<PermissionRule[]>
  updateRules(rules: PermissionRule[]): Promise<void>
  addRule(rule: PermissionRule): Promise<void>
  removeRule(ruleId: string): Promise<void>
  watch(callback: (rules: PermissionRule[]) => void): () => void
  getVersion(): string
}

/**
 * 内存规则存储
 */
export class MemoryRuleStore implements IRuleStore {
  private rules: PermissionRule[] = []
  private watchers: Set<(rules: PermissionRule[]) => void> = new Set()
  private version = 0

  constructor(initialRules: PermissionRule[] = []) {
    this.rules = initialRules
  }

  async getRules(): Promise<PermissionRule[]> {
    return [...this.rules].sort((a, b) => b.priority - a.priority)
  }

  async updateRules(rules: PermissionRule[]): Promise<void> {
    this.rules = rules
    this.version++
    this.notifyWatchers()
  }

  async addRule(rule: PermissionRule): Promise<void> {
    const existing = this.rules.findIndex((r) => r.id === rule.id)
    if (existing >= 0) {
      this.rules[existing] = rule
    } else {
      this.rules.push(rule)
    }
    this.version++
    this.notifyWatchers()
  }

  async removeRule(ruleId: string): Promise<void> {
    this.rules = this.rules.filter((r) => r.id !== ruleId)
    this.version++
    this.notifyWatchers()
  }

  watch(callback: (rules: PermissionRule[]) => void): () => void {
    this.watchers.add(callback)
    return () => this.watchers.delete(callback)
  }

  getVersion(): string {
    return `v${this.version}`
  }

  private notifyWatchers(): void {
    const rules = this.rules
    this.watchers.forEach((cb) => cb(rules))
  }
}

/**
 * 文件规则存储
 */
export class FileRuleStore implements IRuleStore {
  private rules: PermissionRule[] = []
  private watchers: Set<(rules: PermissionRule[]) => void> = new Set()
  private version = 0
  private readonly filePath: string
  private fsWatcher?: FSWatcher
  private lastModified = 0

  constructor(filePath: string, initialRules: PermissionRule[] = []) {
    this.filePath = filePath
    this.rules = initialRules
  }

  async load(): Promise<void> {
    if (existsSync(this.filePath)) {
      const stats = await stat(this.filePath)
      const content = await readFile(this.filePath, 'utf-8')
      try {
        this.rules = JSON.parse(content)
        this.version++
        this.lastModified = stats.mtimeMs
      } catch (error) {
        console.error(`[FileRuleStore] Failed to parse rules: ${error}`)
      }
    }
  }

  async save(): Promise<void> {
    const dir = this.filePath.substring(0, this.filePath.lastIndexOf('/'))
    if (dir && !existsSync(dir)) {
      // 目录不存在，需要先创建（这里简化处理）
    }
    await writeFile(this.filePath, JSON.stringify(this.rules, null, 2), 'utf-8')
    const stats = await stat(this.filePath)
    this.lastModified = stats.mtimeMs
  }

  /**
   * 启动文件系统监听（外部修改文件时自动重新加载）
   */
  startWatching(): void {
    if (this.fsWatcher) return

    this.fsWatcher = fsWatch(this.filePath, async (eventType) => {
      if (eventType === 'change') {
        try {
          const stats = await stat(this.filePath)
          if (stats.mtimeMs > this.lastModified) {
            await this.load()
            this.notifyWatchers()
          }
        } catch (error) {
          console.error(`[FileRuleStore] Failed to reload rules: ${error}`)
        }
      }
    })
  }

  /**
   * 停止文件系统监听
   */
  stopWatching(): void {
    if (this.fsWatcher) {
      this.fsWatcher.close()
      this.fsWatcher = undefined
    }
  }

  async getRules(): Promise<PermissionRule[]> {
    if (this.rules.length === 0) {
      await this.load()
    }
    return [...this.rules].sort((a, b) => b.priority - a.priority)
  }

  async updateRules(rules: PermissionRule[]): Promise<void> {
    this.rules = rules
    this.version++
    await this.save()
    this.notifyWatchers()
  }

  async addRule(rule: PermissionRule): Promise<void> {
    const existing = this.rules.findIndex((r) => r.id === rule.id)
    if (existing >= 0) {
      this.rules[existing] = rule
    } else {
      this.rules.push(rule)
    }
    this.version++
    await this.save()
    this.notifyWatchers()
  }

  async removeRule(ruleId: string): Promise<void> {
    this.rules = this.rules.filter((r) => r.id !== ruleId)
    this.version++
    await this.save()
    this.notifyWatchers()
  }

  watch(callback: (rules: PermissionRule[]) => void): () => void {
    this.watchers.add(callback)
    // 自动启动文件系统监听
    this.startWatching()
    return () => {
      this.watchers.delete(callback)
      // 如果没有监听者了，停止文件系统监听
      if (this.watchers.size === 0) {
        this.stopWatching()
      }
    }
  }

  getVersion(): string {
    return `v${this.version}`
  }

  private notifyWatchers(): void {
    const rules = this.rules
    this.watchers.forEach((cb) => cb(rules))
  }
}

/**
 * 远程规则存储（轮询）
 */
export class RemoteRuleStore implements IRuleStore {
  private rules: PermissionRule[] = []
  private watchers: Set<(rules: PermissionRule[]) => void> = new Set()
  private version = ''
  private readonly remoteUrl: string
  private readonly pollIntervalMs: number
  private intervalHandle?: NodeJS.Timeout

  constructor(remoteUrl: string, pollIntervalMs = 30000) {
    this.remoteUrl = remoteUrl
    this.pollIntervalMs = pollIntervalMs
  }

  async load(): Promise<void> {
    try {
      const response = await fetch(this.remoteUrl)
      if (response.ok) {
        const data = await response.json() as { rules?: PermissionRule[]; version?: string }
        const newVersion = data.version || String(Date.now())

        if (newVersion !== this.version) {
          this.rules = data.rules || []
          this.version = newVersion
          this.notifyWatchers()
        }
      }
    } catch (error) {
      console.error(`[RemoteRuleStore] Failed to fetch rules: ${error}`)
    }
  }

  startPolling(): void {
    if (this.intervalHandle) return

    this.intervalHandle = setInterval(() => {
      this.load()
    }, this.pollIntervalMs)
  }

  stopPolling(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = undefined
    }
  }

  async getRules(): Promise<PermissionRule[]> {
    if (this.rules.length === 0) {
      await this.load()
    }
    return [...this.rules].sort((a, b) => b.priority - a.priority)
  }

  async updateRules(rules: PermissionRule[]): Promise<void> {
    // 远程存储通常只读，这里提供本地更新
    this.rules = rules
    this.version = String(Date.now())
    this.notifyWatchers()
  }

  async addRule(rule: PermissionRule): Promise<void> {
    const existing = this.rules.findIndex((r) => r.id === rule.id)
    if (existing >= 0) {
      this.rules[existing] = rule
    } else {
      this.rules.push(rule)
    }
    this.version = String(Date.now())
    this.notifyWatchers()
  }

  async removeRule(ruleId: string): Promise<void> {
    this.rules = this.rules.filter((r) => r.id !== ruleId)
    this.version = String(Date.now())
    this.notifyWatchers()
  }

  watch(callback: (rules: PermissionRule[]) => void): () => void {
    this.watchers.add(callback)
    return () => this.watchers.delete(callback)
  }

  getVersion(): string {
    return this.version || 'unknown'
  }

  private notifyWatchers(): void {
    const rules = this.rules
    this.watchers.forEach((cb) => cb(rules))
  }
}

/**
 * 创建规则存储
 */
export function createRuleStore(options: RuleStoreOptions): IRuleStore {
  switch (options.source) {
    case 'memory':
      return new MemoryRuleStore(options.initialRules || [])

    case 'file':
      if (!options.filePath) {
        throw new Error('FileRuleStore requires filePath')
      }
      const fileStore = new FileRuleStore(options.filePath, options.initialRules || [])
      // 异步加载
      fileStore.load().catch(console.error)
      return fileStore

    case 'remote':
      if (!options.remoteUrl) {
        throw new Error('RemoteRuleStore requires remoteUrl')
      }
      const remoteStore = new RemoteRuleStore(options.remoteUrl, options.pollIntervalMs)
      remoteStore.startPolling()
      return remoteStore

    default:
      throw new Error(`Unknown rule store source: ${options.source}`)
  }
}
