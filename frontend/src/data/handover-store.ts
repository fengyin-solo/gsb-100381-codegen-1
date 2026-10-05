import type {
  HandoverSheet,
  TodoChecklist,
  TodoItem,
  TodoKey,
} from './handover-types'

const HANDOVER_KEY = 'field-archaeology-digital:handover:v1'
const TODO_KEY = 'field-archaeology-digital:handover-todos:v1'

export type HandoverState = {
  sheets: HandoverSheet[]
  /** 发掘区补录覆盖表，键为 `${module}:${rowId}`；不回改各模块原始记录。 */
  areaOverrides: Record<string, string>
}

export type TodoState = {
  checklists: TodoChecklist[]
  items: TodoItem[]
}

function read<T>(key: string, fallback: () => T): T {
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback()
  }
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    const seeded = fallback()
    window.localStorage.setItem(key, JSON.stringify(seeded))
    return seeded
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    const seeded = fallback()
    window.localStorage.setItem(key, JSON.stringify(seeded))
    return seeded
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, JSON.stringify(value))
  }
}

let handoverCache: HandoverState | null = null
let todoCache: TodoState | null = null

export function loadHandoverState(seed: () => HandoverState): HandoverState {
  if (handoverCache === null) {
    handoverCache = read(HANDOVER_KEY, seed)
  }
  return handoverCache
}

export function saveHandoverState(state: HandoverState): void {
  handoverCache = state
  write(HANDOVER_KEY, state)
}

export function loadTodoState(seed: () => TodoState): TodoState {
  if (todoCache === null) {
    todoCache = read(TODO_KEY, seed)
  }
  return todoCache
}

export function saveTodoState(state: TodoState): void {
  todoCache = state
  write(TODO_KEY, state)
}

/** 跨标签页确认冲突演示：丢弃内存缓存，强制重新读取其它标签页刚落库的数据。 */
export function reloadHandoverState(seed: () => HandoverState): HandoverState {
  handoverCache = null
  return loadHandoverState(seed)
}

export function todoMeta(key: TodoKey): { label: string; page: string } {
  if (key === 'artifact_recheck') {
    return { label: '遗物复核清单', page: '出土遗物' }
  }
  return { label: '浮选送检清单', page: '浮选采样' }
}
