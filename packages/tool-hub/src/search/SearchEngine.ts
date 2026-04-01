/**
 * 工具搜索引擎
 *
 * 基于关键词和语义的搜索
 */

import type {
  Tool,
  ToolSearchQuery,
  ToolSearchResult,
} from '@openclaw/suite-core'

/**
 * 搜索配置
 */
export interface SearchEngineOptions {
  /** 模糊匹配阈值 */
  fuzzyThreshold?: number

  /** 是否启用同义词扩展 */
  enableSynonymExpansion?: boolean

  /** 自定义同义词表（会与默认表合并） */
  synonyms?: Record<string, string[]>

  /** 完全替换同义词表（不与默认合并） */
  replaceSynonyms?: Record<string, string[]>
}

/**
 * 默认同义词表
 */
const DEFAULT_SYNONYMS: Record<string, string[]> = {
  file: ['document', 'fs', 'filesystem'],
  read: ['cat', 'view', 'show', 'display'],
  write: ['create', 'edit', 'modify', 'save'],
  delete: ['remove', 'rm', 'drop'],
  network: ['http', 'request', 'fetch', 'api'],
  search: ['find', 'query', 'grep', 'match'],
  execute: ['run', 'bash', 'shell', 'cmd'],
  database: ['db', 'sql', 'query'],
  memory: ['store', 'cache', 'remember'],
}

/**
 * 搜索结果排序器
 */
function sortResults(results: ToolSearchResult[]): ToolSearchResult[] {
  return results.sort((a, b) => {
    // 1. 完全匹配优先
    if (a.score === 1.0 && b.score !== 1.0) return -1
    if (b.score === 1.0 && a.score !== 1.0) return 1

    // 2. 按分数排序
    if (a.score !== b.score) return b.score - a.score

    // 3. 按工具名称字母序
    return a.tool.name.localeCompare(b.tool.name)
  })
}

/**
 * 工具搜索引擎
 */
export class SearchEngine {
  private readonly fuzzyThreshold: number
  private readonly enableSynonymExpansion: boolean
  private readonly synonyms: Record<string, string[]>

  constructor(options: SearchEngineOptions = {}) {
    this.fuzzyThreshold = options.fuzzyThreshold ?? 0.6
    this.enableSynonymExpansion = options.enableSynonymExpansion ?? true

    // 合并同义词表
    if (options.replaceSynonyms) {
      this.synonyms = options.replaceSynonyms
    } else {
      this.synonyms = { ...DEFAULT_SYNONYMS }
      if (options.synonyms) {
        for (const [key, values] of Object.entries(options.synonyms)) {
          this.synonyms[key] = [...(this.synonyms[key] || []), ...values]
        }
      }
    }
  }

  /**
   * 搜索工具
   */
  search(tools: Tool[], query: ToolSearchQuery): ToolSearchResult[] {
    const results: ToolSearchResult[] = []
    const limit = query.limit ?? 10
    const queryTerms = query.query.toLowerCase().split(/\s+/)

    // 扩展查询词（加入同义词）
    const expandedTerms = this.enableSynonymExpansion
      ? this.expandTerms(queryTerms)
      : queryTerms

    for (const tool of tools) {
      const { score, matchedFields } = this.scoreTool(tool, expandedTerms, queryTerms)

      // 检查必需标签
      if (query.requireTags && query.requireTags.length > 0) {
        const hasAllTags = query.requireTags.every((tag) =>
          tool.tags.includes(tag)
        )
        if (!hasAllTags) continue
      }

      if (score > 0) {
        results.push({ tool, score, matchedFields })
      }
    }

    return sortResults(results).slice(0, limit)
  }

  /**
   * 扩展查询词
   */
  private expandTerms(terms: string[]): string[] {
    const expanded = new Set(terms)

    for (const term of terms) {
      // 添加同义词
      const synonyms = this.synonyms[term]
      if (synonyms) {
        for (const syn of synonyms) {
          expanded.add(syn)
        }
      }

      // 反向查找（如果某个词是某个词的同义词，也加入）
      for (const [key, values] of Object.entries(this.synonyms)) {
        if (values.includes(term)) {
          expanded.add(key)
        }
      }
    }

    return Array.from(expanded)
  }

  /**
   * 给工具打分
   */
  private scoreTool(
    tool: Tool,
    expandedTerms: string[],
    originalTerms: string[]
  ): { score: number; matchedFields: string[] } {
    const matchedFields: string[] = []
    let score = 0

    for (const term of expandedTerms) {
      const termScore = this.scoreToolForTerm(tool, term)
      if (termScore > 0) {
        score = Math.max(score, termScore)
      }
    }

    // 检查原始词匹配的字段
    for (const term of originalTerms) {
      if (tool.id.toLowerCase().includes(term)) {
        if (!matchedFields.includes('id')) matchedFields.push('id')
      }
      if (tool.name.toLowerCase().includes(term)) {
        if (!matchedFields.includes('name')) matchedFields.push('name')
      }
      if (tool.description.toLowerCase().includes(term)) {
        if (!matchedFields.includes('description')) matchedFields.push('description')
      }
    }

    return { score: score * 0.9 + (matchedFields.length > 0 ? 0.1 : 0), matchedFields }
  }

  /**
   * 单个词匹配打分
   */
  private scoreToolForTerm(tool: Tool, term: string): number {
    const id = tool.id.toLowerCase()
    const name = tool.name.toLowerCase()
    const desc = tool.description.toLowerCase()
    const tags = tool.tags.map((t) => t.toLowerCase())
    const ns = tool.namespace.toLowerCase()

    // 精确匹配 ID
    if (id === term) return 1.0

    // ID 包含词
    if (id.includes(term)) return 0.9

    // 命名空间匹配
    if (ns === term) return 0.85
    if (ns.includes(term)) return 0.75

    // 名称精确匹配
    if (name === term) return 0.8
    if (name.includes(term)) return 0.7

    // 标签匹配
    for (const tag of tags) {
      if (tag === term) return 0.75
      if (tag.includes(term)) return 0.6
    }

    // 描述匹配
    if (desc.includes(term)) return 0.4

    // 模糊匹配（简单实现）
    if (this.fuzzyMatch(term, name)) return 0.3

    return 0
  }

  /**
   * 简单模糊匹配
   */
  private fuzzyMatch(pattern: string, text: string): boolean {
    if (pattern.length < 3 || text.length < 3) return false

    // 简单：检查是否有连续的字符匹配
    let pi = 0
    for (const char of text) {
      if (char === pattern[pi]) {
        pi++
        if (pi === pattern.length) return true
      }
    }

    return false
  }
}
