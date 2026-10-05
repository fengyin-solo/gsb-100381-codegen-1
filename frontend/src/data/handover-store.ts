import type { HandoverDoc, HandoverTodo, StatPolicyVersion } from './types'

// 交接单与跨页待办各自独立存储，不与业务记录混在一个键里。
const HANDOVER_KEY = 'field-archaeology-digital:handovers'
const TODO_KEY = 'field-archaeology-digital:handover-todos'
const SETTINGS_KEY = 'field-archaeology-digital:handover-settings'

export type HandoverSettings = {
  /** 当前生效的统计口径：只对之后新建的交接单生效，旧单仍按交接当日口径显示。 */
  activePolicy?: StatPolicyVersion
  seeded?: boolean
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) {
    return clone(fallback)
  }
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    return clone(fallback)
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return clone(fallback)
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, JSON.stringify(value))
  }
}

export function readDocs(): HandoverDoc[] {
  return readJson<HandoverDoc[]>(HANDOVER_KEY, [])
}

export function writeDocs(docs: HandoverDoc[]): void {
  writeJson(HANDOVER_KEY, docs)
}

export function readTodos(): HandoverTodo[] {
  return readJson<HandoverTodo[]>(TODO_KEY, [])
}

export function writeTodos(todos: HandoverTodo[]): void {
  writeJson(TODO_KEY, todos)
}

export function readSettings(): HandoverSettings {
  return readJson<HandoverSettings>(SETTINGS_KEY, {})
}

export function writeSettings(settings: HandoverSettings): void {
  writeJson(SETTINGS_KEY, settings)
}
