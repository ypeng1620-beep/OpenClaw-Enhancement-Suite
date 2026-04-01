/**
 * 简单的内存工具上下文存储（用于测试）
 */
export interface ToolContextEntry {
  toolId: string
  input: unknown
  output: unknown
  timestamp: number
}

export class MemoryToolContextStore {
  private entries: ToolContextEntry[] = []

  async addEntry(entry: ToolContextEntry): Promise<void> {
    this.entries.push(entry)
  }

  async getEntries(toolId?: string): Promise<ToolContextEntry[]> {
    if (toolId) {
      return this.entries.filter((e) => e.toolId === toolId)
    }
    return [...this.entries]
  }

  async clear(): Promise<void> {
    this.entries = []
  }
}
