/** 发掘交接台账相关类型：交接单、快照、跨页待办清单都在这里声明。 */

export type CaliberVersion = 'v1' | 'v2'

export type HandoverModuleKey = 'stratum' | 'feature' | 'artifact' | 'flotation' | 'dating'

/** 未决事项：时间轴上的每一个节点。 */
export type PendingItem = {
  module: HandoverModuleKey
  moduleName: string
  rowId: number
  code: string
  area: string
  areaMissing: boolean
  status: string
  reasons: string[]
  /** v1 口径下就属于未决，还是 v2 口径加严后新判出来的。 */
  escalated: boolean
}

export type HandoverSection = {
  module: HandoverModuleKey
  moduleName: string
  total: number
  /** 当日新增：按模块内日期字段与交接日期比对，没有日期字段的模块记 null（页面显示 —）。 */
  created: number | null
  pending: number
  abnormal: number
}

export type RowSnapshot = {
  module: HandoverModuleKey
  rowId: number
  code: string
  area: string
  areaMissing: boolean
  areaBackfilled: boolean
  status: string
  pending: boolean
  abnormal: boolean
  reasons: string[]
  escalated: boolean
  fields: Record<string, string>
}

export type HandoverTodoRef = {
  checklistId: string
  todoKey: TodoKey
  title: string
  count: number
}

export type HandoverSheet = {
  id: string
  date: string
  shift: string
  status: 'draft' | 'confirmed'
  caliberVersion: CaliberVersion
  /** 乐观锁版本：确认落库时校验，后到的确认请求版本不符即冲突。 */
  version: number
  shiftLeader: string
  nextLeader: string
  opinion: string
  createdAt: string
  confirmedAt: string | null
  confirmedBy: string
  sections: HandoverSection[]
  rows: RowSnapshot[]
  pendingItems: PendingItem[]
  todos: HandoverTodoRef[]
}

export type TodoKey = 'artifact_recheck' | 'flotation_submit'

export type TodoChecklist = {
  id: string
  todoKey: TodoKey
  handoverId: string
  handoverDate: string
  count: number
  createdAt: string
}

export type TodoItem = {
  id: string
  checklistId: string
  sourceCode: string
  area: string
  detail: string
  done: boolean
}

export type ConfirmResult = {
  ok: boolean
  conflict?: boolean
  message: string
  sheet?: HandoverSheet
}
