import type {
  EntryRow,
  HandoverItem,
  HandoverSection,
  HandoverSectionKey,
  PolicyInfo,
  SectionColumnDef,
  StatPolicyVersion,
} from './types'

// 统计口径版本表：口径调整只影响调整生效之后新建立的交接单，
// 旧交接单始终冻结在交接当日生效的版本上展示。
export const STAT_POLICIES: PolicyInfo[] = [
  {
    version: 'v1',
    label: 'v1 初版口径',
    effectiveDate: '2026-09-01',
    desc: '未决直接取记录登记时写入的 pending 标记，不复核状态机。',
  },
  {
    version: 'v2',
    label: 'v2 状态机口径',
    effectiveDate: '2026-10-01',
    desc: '未决按当前状态与末态重判，登记标记仅作参考，不再直接采信。',
  },
  {
    version: 'v3',
    label: 'v3 异常单列口径',
    effectiveDate: '2026-10-05',
    desc: '在 v2 基础上把异常记录从「未决」中剔除、单独统计，避免异常量冲大班次未决。',
  },
]

export const POLICY_BY_VERSION = new Map<StatPolicyVersion, PolicyInfo>(
  STAT_POLICIES.map((item) => [item.version, item]),
)

/** 某一日期生效的口径：取生效日期不晚于该日期的最新版本。 */
export function policyOn(date: string): StatPolicyVersion {
  let current: StatPolicyVersion = STAT_POLICIES[0].version
  for (const policy of STAT_POLICIES) {
    if (policy.effectiveDate <= date) {
      current = policy.version
    }
  }
  return current
}

export function policyInfo(version: StatPolicyVersion): PolicyInfo {
  return POLICY_BY_VERSION.get(version) ?? STAT_POLICIES[0]
}

// 五个交接模块的末态：v2 起未决 = 当前状态不是末态。
export const TERMINAL_STATUSES: Record<HandoverSectionKey, string[]> = {
  stratum: ['已校核'],
  feature: ['已归档'],
  artifact: ['已入库', '借出展示'],
  flotation: ['已送检', '已返回'],
  dating: ['已出结果', '已归档'],
}

export const HANDOVER_SECTIONS: SectionColumnDef[] = [
  {
    key: 'stratum',
    name: '地层',
    entity: '地层',
    codeField: '地层编号',
    locationLabel: '所属探方',
    locationField: '所属探方',
    summaryFields: ['层位序号', '土质描述', '土色描述'],
  },
  {
    key: 'feature',
    name: '遗迹',
    entity: '遗迹',
    codeField: '遗迹编号',
    locationLabel: '所属探方',
    locationField: '所属探方',
    summaryFields: ['遗迹类型', '开口层位', '平面形状'],
  },
  {
    key: 'artifact',
    name: '遗物',
    entity: '出土遗物',
    codeField: '器物编号',
    locationLabel: '出土探方',
    locationField: '出土探方',
    summaryFields: ['器物质地', '器物类型', '完残程度'],
  },
  {
    key: 'flotation',
    name: '浮选',
    entity: '浮选样本',
    codeField: '样本编号',
    locationLabel: '采样单位',
    locationField: '采样单位',
    dateField: '浮选日期',
    summaryFields: ['采样层位', '土样重量', '轻浮物类型'],
  },
  {
    key: 'dating',
    name: '测年',
    entity: '测年送检单',
    codeField: '送检编号',
    locationLabel: '采样单位',
    locationField: '采样单位',
    dateField: '送检日期',
    summaryFields: ['样品类型', '送检方法', '采样层位'],
  },
]

export const SECTION_BY_KEY = new Map<HandoverSectionKey, SectionColumnDef>(
  HANDOVER_SECTIONS.map((item) => [item.key, item]),
)

/** 按指定口径判定一条记录是否属于当班未决。 */
export function isUnresolved(
  section: HandoverSectionKey,
  row: EntryRow,
  policy: StatPolicyVersion,
): boolean {
  if (policy === 'v1') {
    return Boolean(row.pending)
  }
  const isTerminal = TERMINAL_STATUSES[section].includes(String(row.status))
  if (policy === 'v3') {
    return !isTerminal && !row.abnormal
  }
  return !isTerminal
}

function rowText(row: EntryRow, field: string): string {
  const value = row[field]
  return value === undefined || value === null ? '' : String(value)
}

export type BuildContext = {
  rowsByModule: Record<string, EntryRow[]>
  resolveArea: (section: HandoverSectionKey, row: EntryRow) => string
  policy: StatPolicyVersion
  date: string
}

function toItem(
  section: HandoverSectionKey,
  row: EntryRow,
  ctx: BuildContext,
): HandoverItem {
  const def = SECTION_BY_KEY.get(section)!
  const summary = def.summaryFields
    .map((field) => rowText(row, field))
    .filter((text) => text.length > 0)
    .join(' / ')
  return {
    id: `${section}-${row.id}`,
    module: section,
    code: rowText(row, def.codeField),
    location: rowText(row, def.locationField),
    area: ctx.resolveArea(section, row),
    summary,
    status: String(row.status),
    pending: isUnresolved(section, row, ctx.policy),
    abnormal: Boolean(row.abnormal),
    itemDate: def.dateField ? rowText(row, def.dateField) : ctx.date,
  }
}

/** 按当日口径重判五个模块，生成交接单中部清单与汇总卡片。 */
export function buildSections(ctx: BuildContext): {
  sections: HandoverSection[]
  cards: { total: number; pending: number; abnormal: number }
} {
  const sections = HANDOVER_SECTIONS.map((def) => {
    const rows = ctx.rowsByModule[def.key] ?? []
    const items = rows.map((row) => toItem(def.key, row, ctx))
    return {
      key: def.key,
      name: def.name,
      entity: def.entity,
      total: items.length,
      pendingCount: items.filter((item) => item.pending).length,
      abnormalCount: items.filter((item) => item.abnormal).length,
      items,
    }
  })
  const cards = {
    total: sections.reduce((sum, section) => sum + section.total, 0),
    pending: sections.reduce((sum, section) => sum + section.pendingCount, 0),
    abnormal: sections.reduce((sum, section) => sum + section.abnormalCount, 0),
  }
  return { sections, cards }
}
