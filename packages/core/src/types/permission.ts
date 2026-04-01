/**
 * 权限相关类型定义
 * 对应 api-standards.md 二
 */

// ============================================================================
// 权限规则 DSL
// ============================================================================

/** 规则效果 */
export type RuleEffect = 'allow' | 'deny' | 'ask'

/** 主体匹配器 */
export type SubjectMatcher =
  | { type: 'user'; userId: string }
  | { type: 'agent'; agentId?: string }
  | { type: 'role'; role: string }
  | { type: 'group'; groupId: string }
  | { type: '*' }

/** 对象匹配器 */
export type ObjectMatcher =
  | { type: 'tool'; toolId: string }
  | { type: 'namespace'; namespace: string }
  | { type: 'tag'; tag: string }
  | { type: 'pattern'; pattern: string }

/** 操作匹配器 */
export type ActionMatcher =
  | { type: 'call'; toolId: string; args?: PatternMatcher }
  | { type: '*' }

/** 模式匹配器 */
export type PatternMatcher =
  | { type: 'exact'; value: unknown }
  | { type: 'glob'; pattern: string }
  | { type: 'regex'; pattern: string }

/** 权限规则 */
export interface PermissionRule {
  readonly id: string
  readonly priority: number
  readonly effect: RuleEffect
  readonly subject: SubjectMatcher
  readonly object: ObjectMatcher
  readonly action?: ActionMatcher
  readonly description?: string
}

// ============================================================================
// 权限检查
// ============================================================================

/** 权限请求 */
export interface PermissionRequest {
  readonly subject: {
    userId?: string
    agentId?: string
    role?: string
  }
  readonly object: {
    toolId: string
    input?: unknown
  }
  readonly sessionId?: string
}

/** 权限决策 */
export type PermissionDecision =
  | { effect: 'allow' }
  | { effect: 'deny'; reason: string }
  | { effect: 'ask'; reason: string }

/** 权限模拟结果 */
export interface PermissionSimulation {
  readonly wouldBeAllowed: boolean
  readonly matchedRules: string[]
  readonly blockedBy?: string
}

/** 权限检查器接口 */
export interface PermissionChecker {
  check(request: PermissionRequest): Promise<PermissionDecision>
  checkMany(requests: PermissionRequest[]): Promise<PermissionDecision[]>
  simulate(request: PermissionRequest): Promise<PermissionSimulation>
}

// ============================================================================
// 规则存储（支持动态更新和热加载）
// ============================================================================

/** 规则存储接口 */
export interface RuleStore {
  getRules(): Promise<PermissionRule[]>
  updateRules(rules: PermissionRule[]): Promise<void>
  addRule(rule: PermissionRule): Promise<void>
  removeRule(ruleId: string): Promise<void>
  watch(callback: (rules: PermissionRule[]) => void): () => void
  getVersion(): string
}

/** 规则存储配置 */
export interface RuleStoreOptions {
  source: 'memory' | 'file' | 'remote'
  filePath?: string
  remoteUrl?: string
  pollIntervalMs?: number
  initialRules?: PermissionRule[]
}

/** 内存规则存储（默认实现） */
export class InMemoryRuleStore implements RuleStore {
  private rules: PermissionRule[] = []
  private watchers: Set<(rules: PermissionRule[]) => void> = new Set()
  private version = 0

  async getRules(): Promise<PermissionRule[]> {
    return [...this.rules].sort((a, b) => b.priority - a.priority)
  }

  async updateRules(rules: PermissionRule[]): Promise<void> {
    this.rules = rules
    this.version++
    this.notifyWatchers()
  }

  async addRule(rule: PermissionRule): Promise<void> {
    this.rules.push(rule)
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

// ============================================================================
// 权限上下文
// ============================================================================

/** 权限上下文 */
export interface PermissionContext {
  readonly sessionId: string
  readonly userId: string
  readonly agentId?: string
  readonly roles: string[]
  readonly groups: string[]
  readonly sessionAge?: number
  readonly requestCount?: number
  readonly timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night'
}

/** 创建权限上下文 */
export function createPermissionContext(
  sessionId: string,
  userId: string,
  extra?: Partial<PermissionContext>
): PermissionContext {
  const hour = new Date().getHours()
  let timeOfDay: PermissionContext['timeOfDay'] = 'morning'
  if (hour >= 12 && hour < 17) timeOfDay = 'afternoon'
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening'
  else timeOfDay = 'night'

  return {
    sessionId,
    userId,
    roles: [],
    groups: [],
    timeOfDay,
    ...extra,
  }
}

// ============================================================================
// 规则匹配
// ============================================================================

/** 匹配结果 */
export interface MatchResult {
  readonly matched: boolean
  readonly rule?: PermissionRule
  readonly reason?: string
}

/** 匹配器 */
export class RuleMatcher {
  /**
   * 检查主体是否匹配
   */
  static matchSubject(
    subject: SubjectMatcher,
    context: PermissionContext
  ): boolean {
    switch (subject.type) {
      case '*':
        return true
      case 'user':
        return subject.userId === context.userId
      case 'agent':
        return (
          context.agentId !== undefined &&
          (subject.agentId === undefined ||
            subject.agentId === context.agentId)
        )
      case 'role':
        return context.roles.includes(subject.role)
      case 'group':
        return context.groups.includes(subject.groupId)
    }
  }

  /**
   * 检查对象是否匹配
   */
  static matchObject(object: ObjectMatcher, toolId: string): boolean {
    switch (object.type) {
      case '*':
        return true
      case 'tool':
        return object.toolId === toolId
      case 'namespace':
        return toolId.startsWith(`${object.namespace}/`)
      case 'tag':
        // 标签匹配需要工具元数据，这里简化处理
        return toolId.includes(object.tag)
      case 'pattern':
        return this.matchGlob(object.pattern, toolId)
    }
  }

  /**
   * Glob 模式匹配
   */
  static matchGlob(pattern: string, value: string): boolean {
    // 简单的 glob 实现
    // 支持 * (任意字符) 和 ? (单个字符)
    const regex = new RegExp(
      '^' +
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$'
    )
    return regex.test(value)
  }

  /**
   * 检查规则是否适用于请求
   */
  static matchRule(
    rule: PermissionRule,
    request: PermissionRequest,
    context: PermissionContext
  ): MatchResult {
    // 检查主体匹配
    if (!this.matchSubject(rule.subject, context)) {
      return { matched: false }
    }

    // 检查对象匹配
    if (!this.matchObject(rule.object, request.object.toolId)) {
      return { matched: false }
    }

    return {
      matched: true,
      rule,
      reason: rule.description,
    }
  }
}
