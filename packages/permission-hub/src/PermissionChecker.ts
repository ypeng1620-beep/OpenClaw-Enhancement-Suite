/**
 * 权限检查器
 *
 * 提供统一的权限检查接口
 */

import type {
  PermissionChecker as IPermissionChecker,
  PermissionRequest,
  PermissionDecision,
  PermissionSimulation,
  PermissionRule,
  PermissionContext,
} from '@openclaw/suite-core'
import { RuleEngine, type RuleEngineConfig } from './engine/RuleEngine.js'
import { RuleStore, type RuleStoreOptions } from './store/RuleStore.js'

/**
 * 权限检查器配置
 */
export interface PermissionCheckerOptions {
  /** 规则存储 */
  store?: RuleStore

  /** 规则引擎配置 */
  engineConfig?: RuleEngineConfig

  /** 规则存储配置（当 store 未提供时使用） */
  storeConfig?: RuleStoreOptions

  /** 初始规则（当 store 未提供时使用） */
  initialRules?: PermissionRule[]
}

/**
 * 权限检查器
 */
export class PermissionChecker implements IPermissionChecker {
  private readonly engine: RuleEngine
  private readonly store: RuleStore
  private cachedRules: PermissionRule[] = []
  private cacheVersion = ''

  constructor(options: PermissionCheckerOptions = {}) {
    // 初始化规则存储
    if (options.store) {
      this.store = options.store
    } else {
      this.store = new RuleStore(options.storeConfig || {
        source: 'memory',
        initialRules: options.initialRules || [],
      })
    }

    // 初始化规则引擎
    this.engine = new RuleEngine({
      defaultEffect: 'deny',
      allowUnknown: false,
      ...options.engineConfig,
    })
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    // 加载初始规则
    this.cachedRules = await this.store.getRules()
    this.cacheVersion = this.store.getVersion()

    // 监听规则变化
    this.store.watch((rules) => {
      this.cachedRules = rules
      this.cacheVersion = this.store.getVersion()
    })
  }

  /**
   * 检查单个请求
   */
  async check(request: PermissionRequest): Promise<PermissionDecision> {
    // 确保规则是最新的
    await this.refreshRulesIfNeeded()

    return this.engine.check(request, this.cachedRules, {
      ...request,
      sessionId: request.sessionId || '',
      userId: request.subject.userId || '',
    } as PermissionContext)
  }

  /**
   * 批量检查
   */
  async checkMany(
    requests: PermissionRequest[]
  ): Promise<PermissionDecision[]> {
    await this.refreshRulesIfNeeded()

    const context: PermissionContext = {
      sessionId: requests[0]?.sessionId || '',
      userId: requests[0]?.subject?.userId || '',
      roles: [],
      groups: [],
    }

    return requests.map((request) =>
      this.engine.check(request, this.cachedRules, context)
    )
  }

  /**
   * 模拟检查
   */
  async simulate(
    request: PermissionRequest
  ): Promise<PermissionSimulation> {
    await this.refreshRulesIfNeeded()

    const context: PermissionContext = {
      sessionId: request.sessionId || '',
      userId: request.subject.userId || '',
      roles: [],
      groups: [],
    }

    return this.engine.simulate(request, this.cachedRules, context)
  }

  /**
   * 获取匹配的规则
   */
  async getMatchingRules(request: PermissionRequest): Promise<PermissionRule[]> {
    await this.refreshRulesIfNeeded()

    const context: PermissionContext = {
      sessionId: request.sessionId || '',
      userId: request.subject.userId || '',
      roles: [],
      groups: [],
    }

    return this.engine.getMatchingRules(request, this.cachedRules, context)
  }

  /**
   * 添加规则
   */
  async addRule(rule: PermissionRule): Promise<void> {
    await this.store.addRule(rule)
  }

  /**
   * 移除规则
   */
  async removeRule(ruleId: string): Promise<void> {
    await this.store.removeRule(ruleId)
  }

  /**
   * 更新所有规则
   */
  async updateRules(rules: PermissionRule[]): Promise<void> {
    await this.store.updateRules(rules)
  }

  /**
   * 获取当前规则
   */
  async getRules(): Promise<PermissionRule[]> {
    await this.refreshRulesIfNeeded()
    return [...this.cachedRules]
  }

  /**
   * 验证规则
   */
  validateRules(
    rules?: PermissionRule[]
  ): { valid: boolean; errors: string[] } {
    return this.engine.validateRules(rules || this.cachedRules)
  }

  /**
   * 刷新规则（如果版本变了）
   */
  private async refreshRulesIfNeeded(): Promise<void> {
    const currentVersion = this.store.getVersion()

    if (currentVersion !== this.cacheVersion) {
      this.cachedRules = await this.store.getRules()
      this.cacheVersion = currentVersion
    }
  }
}
