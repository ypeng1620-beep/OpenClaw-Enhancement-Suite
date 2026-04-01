/**
 * 权限规则引擎
 *
 * 负责规则匹配和决策
 */

import type {
  PermissionRule,
  SubjectMatcher,
  ObjectMatcher,
  ActionMatcher,
  PermissionRequest,
  PermissionDecision,
  PermissionSimulation,
  PermissionContext,
} from '@openclaw/suite-core'
import { RuleMatcher } from '@openclaw/suite-core'

/**
 * 规则引擎配置
 */
export interface RuleEngineConfig {
  /** 默认效果（当没有匹配规则时） */
  defaultEffect: 'allow' | 'deny' | 'ask'

  /** 是否允许未知操作（无匹配规则时） */
  allowUnknown?: boolean
}

/**
 * 规则引擎
 */
export class RuleEngine {
  private readonly config: RuleEngineConfig

  constructor(config: RuleEngineConfig) {
    this.config = {
      defaultEffect: 'deny',
      allowUnknown: false,
      ...config,
    }
  }

  /**
   * 检查权限请求
   */
  check(
    request: PermissionRequest,
    rules: PermissionRule[],
    context: PermissionContext
  ): PermissionDecision {
    // 按优先级排序规则
    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority)

    // 找到第一个匹配的规则
    for (const rule of sortedRules) {
      const matchResult = RuleMatcher.matchRule(rule, request, context)

      if (matchResult.matched && matchResult.rule) {
        const { effect } = matchResult.rule

        if (effect === 'allow') {
          return {
            effect: 'allow',
          }
        }

        if (effect === 'deny') {
          return {
            effect: 'deny',
            reason: matchResult.reason || `Denied by rule: ${rule.id}`,
          }
        }

        if (effect === 'ask') {
          return {
            effect: 'ask',
            reason: matchResult.reason || `Requires confirmation: ${rule.id}`,
          }
        }
      }
    }

    // 没有匹配规则，使用默认效果
    if (this.config.allowUnknown) {
      return {
        effect: this.config.defaultEffect,
      }
    }

    return {
      effect: 'deny',
      reason: `No matching rule found for ${request.object.toolId}`,
    }
  }

  /**
   * 批量检查
   */
  checkMany(
    requests: PermissionRequest[],
    rules: PermissionRule[],
    context: PermissionContext
  ): PermissionDecision[] {
    return requests.map((request) =>
      this.check(request, rules, context)
    )
  }

  /**
   * 模拟检查（不执行，只分析）
   */
  simulate(
    request: PermissionRequest,
    rules: PermissionRule[],
    context: PermissionContext
  ): PermissionSimulation {
    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority)
    const matchedRules: string[] = []
    let blockedBy: string | undefined

    for (const rule of sortedRules) {
      const matchResult = RuleMatcher.matchRule(rule, request, context)

      if (matchResult.matched && matchResult.rule) {
        matchedRules.push(rule.id)

        if (rule.effect === 'deny') {
          blockedBy = rule.id
          break
        }

        if (rule.effect === 'allow') {
          // 找到 allow 就停止，因为优先级已经排序
          break
        }
      }
    }

    return {
      wouldBeAllowed:
        !blockedBy &&
        (this.config.allowUnknown ||
          matchedRules.some(
            (id) =>
              rules.find((r) => r.id === id)?.effect === 'allow'
          )),
      matchedRules,
      blockedBy,
    }
  }

  /**
   * 获取匹配的规则
   */
  getMatchingRules(
    request: PermissionRequest,
    rules: PermissionRule[],
    context: PermissionContext
  ): PermissionRule[] {
    return rules
      .filter((rule) => RuleMatcher.matchRule(rule, request, context).matched)
      .sort((a, b) => b.priority - a.priority)
  }

  /**
   * 验证规则语法
   */
  validateRules(rules: PermissionRule[]): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    for (const rule of rules) {
      if (!rule.id) {
        errors.push('Rule missing id')
      }

      if (!rule.effect || !['allow', 'deny', 'ask'].includes(rule.effect)) {
        errors.push(`Rule ${rule.id}: invalid effect "${rule.effect}"`)
      }

      if (typeof rule.priority !== 'number') {
        errors.push(`Rule ${rule.id}: priority must be a number`)
      }

      // 验证 subject
      if (!rule.subject) {
        errors.push(`Rule ${rule.id}: missing subject`)
      }

      // 验证 object
      if (!rule.object) {
        errors.push(`Rule ${rule.id}: missing object`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }
}
