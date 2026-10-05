/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

/** 交接台账中部展开的五个业务模块。 */
export type HandoverSectionKey = 'stratum' | 'feature' | 'artifact' | 'flotation' | 'dating'

/** 统计口径版本：旧交接单冻结在它交接当日生效的版本上。 */
export type StatPolicyVersion = 'v1' | 'v2' | 'v3'

export type ShiftCode = 'day' | 'night'

/** 交接单内一条业务记录（按当日口径重判后落进快照）。 */
export type HandoverItem = {
  id: string
  module: HandoverSectionKey
  code: string
  location: string
  area: string
  summary: string
  status: string
  pending: boolean
  abnormal: boolean
  itemDate: string
}

export type HandoverSection = {
  key: HandoverSectionKey
  name: string
  entity: string
  total: number
  pendingCount: number
  abnormalCount: number
  items: HandoverItem[]
}

export type HandoverCards = {
  total: number
  pending: number
  abnormal: number
}

export type HandoverDoc = {
  id: number
  code: string
  date: string
  shift: ShiftCode
  status: 'draft' | 'confirmed'
  /** 起草时锁定的统计口径版本；之后口径再调整也不影响这张单。 */
  policyVersion: StatPolicyVersion
  remarks: string
  createdAt: string
  /** 乐观锁版本号：两位负责人同时确认时只有携带首个版本的请求能落库。 */
  baseRevision: number
  outLeader?: string
  inLeader?: string
  confirmedAt?: string
  /** 确认时冻结的当日口径快照；草稿不挂快照，一律按最新数据即时重判。 */
  sections?: HandoverSection[]
  cards?: HandoverCards
}

/** 确认交接后写进别的页面（出土遗物 / 浮选采样）待办区的清单。 */
export type HandoverTodo = {
  id: number
  module: 'artifact' | 'flotation'
  kind: 'review' | 'submit'
  title: string
  detail: string
  sourceHandoverId: number
  sourceCode: string
  sourceDate: string
  itemRefs: string[]
  done: boolean
  createdAt: string
  doneAt?: string
}

export type ConfirmHandoverResult =
  | { ok: true; doc: HandoverDoc; todos: HandoverTodo[]; message: string }
  | { ok: false; message: string; code: 'not-found' | 'conflict' | 'invalid' }

export type PolicyInfo = {
  version: StatPolicyVersion
  label: string
  effectiveDate: string
  desc: string
}

export type SectionColumnDef = {
  key: HandoverSectionKey
  name: string
  entity: string
  codeField: string
  locationLabel: string
  locationField: string
  dateField?: string
  summaryFields: string[]
}

export type BuiltSections = {
  sections: HandoverSection[]
  cards: HandoverCards
}
