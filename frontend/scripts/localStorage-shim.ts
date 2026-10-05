// Node 校验环境下的 localStorage / window 垫片：内存实现，先于业务模块加载。
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  clear(): void {
    this.map.clear()
  }
}

;(globalThis as Record<string, unknown>).window = globalThis
;(globalThis as Record<string, unknown>).localStorage = new MemoryStorage()
