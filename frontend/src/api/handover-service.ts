import {
  loadHandoverState,
  loadTodoState,
  reloadHandoverState,
  saveHandoverState,
  saveTodoState,
  type HandoverState,
  type TodoState,
} from '@/data/handover-store'
import { buildSnapshot } from '@/data/handover-snapshot'
import { caliberForDate } from '@/data/caliber'
import type {
  ConfirmResult,
  HandoverModuleKey,
  HandoverSheet,
  HandoverTodoRef,
  TodoChecklist,
  TodoItem,
  TodoKey,
} from '@/data/handover-types'

const SHIFTS = ['白班 08:00-20:00', '夜班 20:00-次日08:00']

function nowText(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function pendingRows(sheet: HandoverSheet, module: HandoverModuleKey) {
  return sheet.rows.filter((row) => row.module === module && row.pending)
}

/** 依据已冻结快照生成两张强制清单的条目；用快照而不是现查台账，保证旧单口径不被带跑。 */
function buildChecklists(sheet: HandoverSheet): { checklists: TodoChecklist[]; items: TodoItem[]; refs: HandoverTodoRef[] } {
  const defs: { key: TodoKey; module: HandoverModuleKey; title: string }[] = [
    { key: 'artifact_recheck', module: 'artifact', title: '遗物复核清单' },
    { key: 'flotation_submit', module: 'flotation', title: '浮选送检清单' },
  ]
  const checklists: TodoChecklist[] = []
  const items: TodoItem[] = []
  const refs: HandoverTodoRef[] = []
  for (const def of defs) {
    const checklistId = `CL-${sheet.id}-${def.key === 'artifact_recheck' ? 'ART' : 'FLOT'}`
    const rows = pendingRows(sheet, def.module)
    checklists.push({
      id: checklistId,
      todoKey: def.key,
      handoverId: sheet.id,
      handoverDate: sheet.date,
      count: rows.length,
      createdAt: sheet.confirmedAt ?? nowText(),
    })
    rows.forEach((row, index) => {
      items.push({
        id: `${checklistId}-${index + 1}`,
        checklistId,
        sourceCode: row.code,
        area: row.area,
        detail: row.reasons.join('；') || `当前状态「${row.status}」，请跟进`,
        done: false,
      })
    })
    refs.push({ checklistId, todoKey: def.key, title: def.title, count: rows.length })
  }
  return { checklists, items, refs }
}

function seedHandoverState(): HandoverState {
  const overrides: Record<string, string> = {
    'stratum:3': '发掘Ⅲ区',
    'feature:3': '发掘Ⅲ区',
  }
  const makeSheet = (
    date: string,
    shift: string,
    leader: string,
    next: string,
    opinion: string,
  ): HandoverSheet => {
    const snapshot = buildSnapshot('v1', date, overrides)
    return {
      id: `HO-${date.split('-').join('')}`,
      date,
      shift,
      status: 'confirmed',
      caliberVersion: 'v1',
      version: 1,
      shiftLeader: leader,
      nextLeader: next,
      opinion,
      createdAt: `${date} 08:00:00`,
      confirmedAt: `${date} 19:58:00`,
      confirmedBy: leader,
      ...snapshot,
      todos: [],
    }
  }
  const sheet03 = makeSheet(
    '2026-10-03',
    SHIFTS[0],
    '张建国',
    '李卫民',
    '①T0101 第2层下见灰坑迹象，夜班继续清边；②浮选样本已晾干，明早统一送检；③探方 T0201 东北角遇石块堆积，注意辨认是否为遗迹边界。',
  )
  const sheet04 = makeSheet(
    '2026-10-04',
    SHIFTS[0],
    '李卫民',
    '王晓峰',
    '①FLOT-0002 已浮选完毕须尽快送检；②ARTI-0002 石斧残缺，移交整理室复核；③DATI-0004 骨样结果与地层年代不符，已挂异常待复测。',
  )
  const todaySnapshot = buildSnapshot('v2', '2026-10-05', overrides)
  const sheet05: HandoverSheet = {
    id: 'HO-20261005',
    date: '2026-10-05',
    shift: SHIFTS[0],
    status: 'draft',
    caliberVersion: 'v2',
    version: 0,
    shiftLeader: '王晓峰',
    nextLeader: '陈晓东',
    opinion: '',
    createdAt: nowText(),
    confirmedAt: null,
    confirmedBy: '',
    ...todaySnapshot,
    todos: [],
  }

  // 旧交接单落库时同步生成两张强制清单（历史数据）。
  const old03 = buildChecklists(sheet03)
  sheet03.todos = old03.refs
  const old04 = buildChecklists(sheet04)
  sheet04.todos = old04.refs
  // 10-03 的清单已全部办完；10-04 的清单仍在待办区。
  for (const item of [...old03.items]) {
    item.done = true
  }

  const todoState: TodoState = {
    checklists: [...old03.checklists, ...old04.checklists],
    items: [...old03.items, ...old04.items],
  }
  saveTodoState(todoState)

  return { sheets: [sheet03, sheet04, sheet05], areaOverrides: overrides }
}

function seedTodoState(): TodoState {
  // 待办状态在交接种子里一并生成；若单独读取则确保交接种子先建好。
  loadHandoverState(seedHandoverState)
  return loadTodoState(() => ({ checklists: [], items: [] }))
}

function commit(state: HandoverState): void {
  saveHandoverState(state)
}

export function listSheets(): HandoverSheet[] {
  return loadHandoverState(seedHandoverState).sheets
}

export function getSheet(id: string): HandoverSheet | undefined {
  return listSheets().find((sheet) => sheet.id === id)
}

export function createSheet(date: string, shift: string): HandoverSheet {
  const state = loadHandoverState(seedHandoverState)
  const id = `HO-${date.split('-').join('')}`
  const existing = state.sheets.find((sheet) => sheet.id === id)
  if (existing) {
    return existing
  }
  const caliber = caliberForDate(date)
  const sheet: HandoverSheet = {
    id,
    date,
    shift,
    status: 'draft',
    caliberVersion: caliber,
    version: 0,
    shiftLeader: '',
    nextLeader: '',
    opinion: '',
    createdAt: nowText(),
    confirmedAt: null,
    confirmedBy: '',
    ...buildSnapshot(caliber, date, state.areaOverrides),
    todos: [],
  }
  commit({ ...state, sheets: [...state.sheets, sheet] })
  return sheet
}

export function saveOpinion(id: string, opinion: string): void {
  const state = loadHandoverState(seedHandoverState)
  const sheets = state.sheets.map((sheet) =>
    sheet.id === id && sheet.status === 'draft' ? { ...sheet, opinion } : sheet,
  )
  commit({ ...state, sheets })
}

export function saveLeaders(id: string, patch: { shiftLeader?: string; nextLeader?: string; shift?: string }): void {
  const state = loadHandoverState(seedHandoverState)
  const sheets = state.sheets.map((sheet) =>
    sheet.id === id && sheet.status === 'draft' ? { ...sheet, ...patch } : sheet,
  )
  commit({ ...state, sheets })
}

/** 草稿按当前台账 + 当前补录覆盖表重新重判；已确认历史单不重判。 */
export function rebuildDraft(id: string): HandoverSheet | undefined {
  const state = loadHandoverState(seedHandoverState)
  const sheets = state.sheets.map((sheet) => {
    if (sheet.id !== id || sheet.status !== 'draft') {
      return sheet
    }
    return { ...sheet, ...buildSnapshot(sheet.caliberVersion, sheet.date, state.areaOverrides) }
  })
  commit({ ...state, sheets })
  return sheets.find((sheet) => sheet.id === id)
}

/**
 * 班次负责人确认交接：
 * - 强制把遗物复核、浮选送检两张新清单写入出土遗物页 / 浮选采样页的待办区；
 * - 乐观锁：同一版本只能有一个确认落库，后到的确认（含另一标签页并发）返回冲突。
 */
export function confirmHandover(id: string, expectedVersion: number, confirmer: string): ConfirmResult {
  // 强制从磁盘重读，保证跨标签页并发时能看到别人刚落库的版本。
  const state = reloadHandoverState(seedHandoverState)
  const sheet = state.sheets.find((item) => item.id === id)
  if (!sheet) {
    return { ok: false, message: `找不到交接单 ${id}` }
  }
  if (sheet.status === 'confirmed') {
    return {
      ok: false,
      conflict: true,
      message: `交接冲突：${sheet.id} 已由 ${sheet.confirmedBy} 于 ${sheet.confirmedAt} 确认落库（版本 v${sheet.version}），您基于 v${expectedVersion} 的确认未写入。`,
      sheet,
    }
  }
  if (sheet.version !== expectedVersion) {
    return {
      ok: false,
      conflict: true,
      message: `交接冲突：交接单已变更为 v${sheet.version}，您确认的是 v${expectedVersion}，请刷新后重看再确认。`,
      sheet,
    }
  }
  if (!sheet.shiftLeader.trim() || !sheet.nextLeader.trim()) {
    return { ok: false, message: '请先填写交班负责人和接班负责人，再确认交接。' }
  }

  const { checklists, items, refs } = buildChecklists(sheet)
  const confirmed: HandoverSheet = {
    ...sheet,
    status: 'confirmed',
    version: sheet.version + 1,
    confirmedAt: nowText(),
    confirmedBy: confirmer.trim() || sheet.shiftLeader,
    todos: refs,
  }
  commit({ ...state, sheets: state.sheets.map((item) => (item.id === id ? confirmed : item)) })

  const todoState = loadTodoState(seedTodoState)
  saveTodoState({
    checklists: [...todoState.checklists, ...checklists],
    items: [...todoState.items, ...items],
  })
  return {
    ok: true,
    sheet: confirmed,
    message: `交接单 ${sheet.id} 已确认落库（v${confirmed.version}），遗物复核清单（${refs[0].count} 项）与浮选送检清单（${refs[1].count} 项）已写入对应页面待办区。`,
  }
}

/** 发掘区补录：写覆盖表并重算所有草稿；已确认历史单维持交接当日记录，不回改。 */
export function backfillArea(module: HandoverModuleKey, rowId: number, area: string): void {
  const trimmed = area.trim()
  if (!trimmed) {
    return
  }
  const state = loadHandoverState(seedHandoverState)
  const overrides = { ...state.areaOverrides, [`${module}:${rowId}`]: trimmed }
  const sheets = state.sheets.map((sheet) =>
    sheet.status === 'draft'
      ? { ...sheet, ...buildSnapshot(sheet.caliberVersion, sheet.date, overrides) }
      : sheet,
  )
  commit({ sheets, areaOverrides: overrides })
}

export function listTodos(todoKey: TodoKey): TodoState {
  const state = loadTodoState(seedTodoState)
  return {
    checklists: state.checklists.filter((checklist) => checklist.todoKey === todoKey),
    items: state.items.filter((item) =>
      state.checklists.some(
        (checklist) => checklist.id === item.checklistId && checklist.todoKey === todoKey,
      ),
    ),
  }
}

export function toggleTodoItem(itemId: string, done: boolean): void {
  const state = loadTodoState(seedTodoState)
  saveTodoState({
    ...state,
    items: state.items.map((item) => (item.id === itemId ? { ...item, done } : item)),
  })
}

export { SHIFTS as HANDOVER_SHIFTS }
