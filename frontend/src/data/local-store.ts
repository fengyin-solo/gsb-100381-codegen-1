import { backfillModule, backfillMissingAreas } from './area-register'
import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'field-archaeology-digital:entries'
const META_KEY = 'field-archaeology-digital:meta'
// 存储结构版本：升级时对老数据跑一次迁移（例如补发掘区归属）。
const STORE_VERSION = 2

export type StoreMeta = {
  version: number
  areaBackfillTotal: number
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readMeta(): StoreMeta {
  const fallback: StoreMeta = { version: 1, areaBackfillTotal: 0 }
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(META_KEY)
  if (!raw) {
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoreMeta>
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      areaBackfillTotal: typeof parsed.areaBackfillTotal === 'number' ? parsed.areaBackfillTotal : 0,
    }
  } catch {
    return fallback
  }
}

function writeMeta(meta: StoreMeta): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(META_KEY, JSON.stringify(meta))
  }
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seeded = runMigrations(fallback)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    const merged = { ...clone(SEED_ROWS), ...parsed }
    const migrated = runMigrations(merged)
    return migrated
  } catch {
    const reseeded = runMigrations(fallback)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reseeded))
    return reseeded
  }
}

function runMigrations(data: Record<string, EntryRow[]>): Record<string, EntryRow[]> {
  const meta = readMeta()
  if (meta.version >= STORE_VERSION) {
    return data
  }
  let next = data
  if (meta.version < 2) {
    // v2：给缺发掘区归属的旧记录补录，回查不到探方链的统一记为「Ⅰ区（系统补录）」。
    // 迁移只在内存里收集各模块的改动，最后一次性落盘，避免半成品状态写进浏览器。
    const pending: Record<string, EntryRow[]> = {}
    const stat = backfillMissingAreas(next, (key, rows) => {
      pending[key] = rows
    })
    if (Object.keys(pending).length > 0) {
      next = { ...next, ...pending }
    }
    meta.areaBackfillTotal = stat.total
  }
  meta.version = STORE_VERSION
  writeMeta(meta)
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  return next
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

const AREA_MODULES = ['trench', 'stratum', 'feature', 'artifact'] as const

export function resetRows(key: string): EntryRow[] {
  let rows = clone(SEED_ROWS[key] ?? [])
  if ((AREA_MODULES as readonly string[]).includes(key)) {
    // 重置回示例数据后同样补一次发掘区归属，避免台账里出现新旧两种状态。
    rows = backfillModule(
      key as (typeof AREA_MODULES)[number],
      rows,
      allRows(),
    )
  }
  saveRows(key, rows)
  return rows
}

export function storeMeta(): StoreMeta {
  return readMeta()
}

export function storageKey(): string {
  return STORAGE_KEY
}
