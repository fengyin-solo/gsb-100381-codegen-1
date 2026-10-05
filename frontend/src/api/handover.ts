import { allRows, listRows, storeMeta } from '@/data/local-store'
import { countBackfilledRows, resolveRowArea } from '@/data/area-register'
import {
  readDocs,
  readSettings,
  readTodos,
  writeDocs,
  writeSettings,
  writeTodos,
} from '@/data/handover-store'
import { buildSections, policyInfo, policyOn } from '@/data/stat-policy'
import type {
  BuiltSections,
  ConfirmHandoverResult,
  HandoverDoc,
  HandoverItem,
  HandoverSectionKey,
  HandoverTodo,
  ShiftCode,
  StatPolicyVersion,
} from '@/data/types'

const SECTION_KEYS: HandoverSectionKey[] = ['stratum', 'feature', 'artifact', 'flotation', 'dating']

export const SHIFT_LABELS: Record<ShiftCode, string> = {
  day: '白班 08:00-20:00',
  night: '夜班 20:00-次日08:00',
}

function nowStamp(): string {
  return new Date().toISOString()
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function nextDocId(docs: HandoverDoc[]): number {
  return docs.reduce((max, doc) => Math.max(max, doc.id), 0) + 1
}

function nextTodoId(todos: HandoverTodo[]): number {
  return todos.reduce((max, todo) => Math.max(max, todo.id), 0) + 1
}

function docCode(date: string, shift: ShiftCode): string {
  return `JC-${date}-${shift === 'day' ? 'D' : 'N'}`
}

/** 按指定口径即时重判五个业务模块（草稿视图与确认落快照都走这里）。 */
export function buildDocSections(date: string, policy: StatPolicyVersion): BuiltSections {
  const rowsByModule: Record<string, ReturnType<typeof listRows>> = {}
  for (const key of SECTION_KEYS) {
    rowsByModule[key] = listRows(key)
  }
  return buildSections({
    rowsByModule,
    resolveArea: resolveRowArea,
    policy,
    date,
  })
}

function activePolicy(): StatPolicyVersion {
  const settings = readSettings()
  return settings.activePolicy ?? policyOn(today())
}

/** 列出时间轴所需的交接单（新到旧）。 */
export function listDocs(): HandoverDoc[] {
  ensureSeeded()
  return readDocs().sort((a, b) =>
    a.date === b.date
      ? a.shift === b.shift
        ? 0
        : a.shift === 'day'
          ? 1
          : -1
      : a.date < b.date
        ? 1
        : -1,
  )
}

export function getDoc(date: string, shift: ShiftCode): HandoverDoc | undefined {
  ensureSeeded()
  return readDocs().find((doc) => doc.date === date && doc.shift === shift)
}

/** 取某天某班次的交接单；草稿或没有单时按当前数据即时重判，已确认单返回冻结快照。 */
export function docView(date: string, shift: ShiftCode): {
  doc: HandoverDoc | null
  built: BuiltSections
  policy: StatPolicyVersion
} {
  const doc = getDoc(date, shift)
  if (doc?.status === 'confirmed' && doc.sections && doc.cards) {
    return { doc, built: { sections: doc.sections, cards: doc.cards }, policy: doc.policyVersion }
  }
  const policy = doc?.policyVersion ?? activePolicy()
  return { doc: doc ?? null, built: buildDocSections(date, policy), policy }
}

export function createDraft(date: string, shift: ShiftCode): HandoverDoc {
  const existing = getDoc(date, shift)
  if (existing) {
    return existing
  }
  const docs = readDocs()
  const policy = activePolicy()
  const doc: HandoverDoc = {
    id: nextDocId(docs),
    code: docCode(date, shift),
    date,
    shift,
    status: 'draft',
    policyVersion: policy,
    remarks: '',
    createdAt: nowStamp(),
    baseRevision: 0,
  }
  writeDocs([...docs, doc])
  return doc
}

export function saveRemarks(date: string, shift: ShiftCode, remarks: string): HandoverDoc | null {
  const docs = readDocs()
  const index = docs.findIndex((doc) => doc.date === date && doc.shift === shift)
  if (index < 0) {
    return null
  }
  if (docs[index].status === 'confirmed') {
    return docs[index]
  }
  const updated = { ...docs[index], remarks }
  const next = [...docs]
  next[index] = updated
  writeDocs(next)
  return updated
}

/** 当班未决事项：供顶部时间轴使用，无日期的记录挂到交接当日。 */
export function pendingItems(date: string, shift: ShiftCode): HandoverItem[] {
  const { built } = docView(date, shift)
  const order = new Map<HandoverSectionKey, number>(
    SECTION_KEYS.map((key, index) => [key, index]),
  )
  return built.sections
    .flatMap((section) => section.items.filter((item) => item.pending))
    .map((item) => ({
      ...item,
      itemDate: item.itemDate || date,
    }))
    .sort((a, b) => {
      const sectionGap = (order.get(a.module) ?? 0) - (order.get(b.module) ?? 0)
      if (sectionGap !== 0) {
        return sectionGap
      }
      const dateGap = a.itemDate.localeCompare(b.itemDate)
      if (dateGap !== 0) {
        return dateGap
      }
      return a.code.localeCompare(b.code)
    })
}

/**
 * 班次负责人确认交接。
 * - 同一交接单已确认 → 冲突，只有第一个版本落库；
 * - baseRevision 与库里不一致（后到的确认）→ 冲突；
 * - 确认成功后把「遗物复核」「浮选送检」两张清单写进对应页面的待办区。
 */
export function confirmHandover(input: {
  date: string
  shift: ShiftCode
  outLeader: string
  inLeader: string
  remarks: string
  expectedRevision: number
}): ConfirmHandoverResult {
  const docs = readDocs()
  const index = docs.findIndex((doc) => doc.date === input.date && doc.shift === input.shift)
  if (index < 0) {
    return { ok: false, code: 'not-found', message: '没有找到这一班次的交接单' }
  }
  const doc = docs[index]
  if (doc.status === 'confirmed') {
    return {
      ok: false,
      code: 'conflict',
      message: `交接单 ${doc.code} 已由 ${doc.outLeader ?? '交班负责人'} → ${doc.inLeader ?? '接班负责人'} 于 ${doc.confirmedAt ?? ''} 确认落库，后到的确认不予保存`,
    }
  }
  if (doc.baseRevision !== input.expectedRevision) {
    return {
      ok: false,
      code: 'conflict',
      message: `交接单 ${doc.code} 已被另一位负责人先确认（当前版本号 ${doc.baseRevision}），本次确认基于过期版本 ${input.expectedRevision}，存在冲突`,
    }
  }
  const outLeader = input.outLeader.trim()
  const inLeader = input.inLeader.trim()
  if (!outLeader || !inLeader) {
    return { ok: false, code: 'invalid', message: '交班、接班两位班次负责人都要签字才能确认' }
  }

  // 落库瞬间按起草时锁定的口径重判并冻结快照，之后口径再调整也不改这张单。
  const built = buildDocSections(doc.date, doc.policyVersion)
  const confirmedAt = nowStamp()
  const confirmed: HandoverDoc = {
    ...doc,
    status: 'confirmed',
    remarks: input.remarks,
    outLeader,
    inLeader,
    confirmedAt,
    baseRevision: doc.baseRevision + 1,
    sections: built.sections,
    cards: built.cards,
  }

  const todos = readTodos()
  const created: HandoverTodo[] = [
    {
      id: nextTodoId(todos),
      module: 'artifact',
      kind: 'review',
      title: `遗物复核清单（${doc.code}）`,
      detail: `交接单 ${doc.code} 经 ${outLeader} 与 ${inLeader} 确认：下列出土遗物当班未决，须逐件复核编号、质地与入库状态。`,
      sourceHandoverId: doc.id,
      sourceCode: doc.code,
      sourceDate: doc.date,
      itemRefs: built.sections
        .find((section) => section.key === 'artifact')!
        .items.filter((item) => item.pending)
        .map((item) => item.code),
      done: false,
      createdAt: confirmedAt,
    },
    {
      id: nextTodoId(todos) + 1,
      module: 'flotation',
      kind: 'submit',
      title: `浮选送检清单（${doc.code}）`,
      detail: `交接单 ${doc.code} 经 ${outLeader} 与 ${inLeader} 确认：下列浮选样本当班未决，须完成分拣并安排送出检测。`,
      sourceHandoverId: doc.id,
      sourceCode: doc.code,
      sourceDate: doc.date,
      itemRefs: built.sections
        .find((section) => section.key === 'flotation')!
        .items.filter((item) => item.pending)
        .map((item) => item.code),
      done: false,
      createdAt: confirmedAt,
    },
  ]

  const nextDocs = [...docs]
  nextDocs[index] = confirmed
  writeDocs(nextDocs)
  writeTodos([...todos, ...created])

  return {
    ok: true,
    doc: confirmed,
    todos: created,
    message: `交接单 ${doc.code} 已确认落库（${policyInfo(doc.policyVersion).label}），遗物复核、浮选送检两张清单已写入对应页面待办区`,
  }
}

// ---------- 跨页待办 ----------

export function listTodos(module?: HandoverTodo['module']): HandoverTodo[] {
  ensureSeeded()
  const todos = readTodos()
  return todos
    .filter((todo) => !module || todo.module === module)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function completeTodo(id: number): HandoverTodo | null {
  const todos = readTodos()
  const index = todos.findIndex((todo) => todo.id === id)
  if (index < 0) {
    return null
  }
  if (todos[index].done) {
    return todos[index]
  }
  const updated: HandoverTodo = { ...todos[index], done: true, doneAt: nowStamp() }
  const next = [...todos]
  next[index] = updated
  writeTodos(next)
  return updated
}

// ---------- 口径设置 ----------

export function getActivePolicy(): StatPolicyVersion {
  ensureSeeded()
  return activePolicy()
}

export function setActivePolicy(version: StatPolicyVersion): void {
  const settings = readSettings()
  writeSettings({ ...settings, activePolicy: version })
}

export function areaBackfillStat(): { total: number; fallbackTotal: number } {
  return {
    total: storeMeta().areaBackfillTotal,
    fallbackTotal: countBackfilledRows(allRows()),
  }
}

// ---------- 首次播种：一张已确认的旧口径交接单，演示旧单冻结 ----------

function ensureSeeded(): void {
  if (typeof window === 'undefined') {
    return
  }
  const settings = readSettings()
  if (settings.seeded) {
    return
  }
  if (readDocs().length === 0) {
    const date = '2026-09-15'
    const shift: ShiftCode = 'day'
    const policy: StatPolicyVersion = 'v1'
    const built = buildDocSections(date, policy)
    const doc: HandoverDoc = {
      id: 1,
      code: docCode(date, shift),
      date,
      shift,
      status: 'confirmed',
      policyVersion: policy,
      remarks: 'T2 东隔梁地层包含物较杂，接班请继续清理；FLOT-0001 土样晾置中。',
      createdAt: `${date}T19:35:00.000Z`,
      baseRevision: 1,
      outLeader: '周一鸣',
      inLeader: '何文瑾',
      confirmedAt: `${date}T12:05:00.000Z`,
      sections: built.sections,
      cards: built.cards,
    }
    const stamp = `${date}T12:05:00.000Z`
    const todos: HandoverTodo[] = [
      {
        id: 1,
        module: 'artifact',
        kind: 'review',
        title: `遗物复核清单（${doc.code}）`,
        detail: `交接单 ${doc.code} 经 ${doc.outLeader} 与 ${doc.inLeader} 确认：下列出土遗物当班未决，须逐件复核编号、质地与入库状态。`,
        sourceHandoverId: doc.id,
        sourceCode: doc.code,
        sourceDate: date,
        itemRefs: built.sections
          .find((section) => section.key === 'artifact')!
          .items.filter((item) => item.pending)
          .map((item) => item.code),
        done: false,
        createdAt: stamp,
      },
      {
        id: 2,
        module: 'flotation',
        kind: 'submit',
        title: `浮选送检清单（${doc.code}）`,
        detail: `交接单 ${doc.code} 经 ${doc.outLeader} 与 ${doc.inLeader} 确认：下列浮选样本当班未决，须完成分拣并安排送出检测。`,
        sourceHandoverId: doc.id,
        sourceCode: doc.code,
        sourceDate: date,
        itemRefs: built.sections
          .find((section) => section.key === 'flotation')!
          .items.filter((item) => item.pending)
          .map((item) => item.code),
        done: false,
        createdAt: stamp,
      },
    ]
    writeDocs([doc])
    writeTodos(todos)
  }
  writeSettings({ ...settings, seeded: true })
}
