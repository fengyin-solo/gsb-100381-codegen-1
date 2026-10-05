import { resolveArea, type AreaResolution } from './area'
import { MODULE_NAMES, v2Escalation } from './caliber'
import type {
  CaliberVersion,
  HandoverModuleKey,
  HandoverSection,
  PendingItem,
  RowSnapshot,
} from './handover-types'
import { listRows } from './local-store'
import type { EntryRow } from './types'

/** 五个交接业务模块的取值约定：编码字段、出土单位字段、台账展示字段、当日新增所用日期字段。 */
export const HANDOVER_MODULE_CONFIG: {
  module: HandoverModuleKey
  codeField: string
  unitField: string
  dateField: string | null
  displayFields: string[]
}[] = [
  {
    module: 'stratum',
    codeField: '地层编号',
    unitField: '所属探方',
    dateField: null,
    displayFields: ['层位序号', '土质描述', '土色描述', '包含物特征', '记录人'],
  },
  {
    module: 'feature',
    codeField: '遗迹编号',
    unitField: '所属探方',
    dateField: null,
    displayFields: ['遗迹类型', '开口层位', '打破关系', '平面形状', '填土特征'],
  },
  {
    module: 'artifact',
    codeField: '器物编号',
    unitField: '出土探方',
    dateField: null,
    displayFields: ['出土层位', '器物质地', '器物类型', '完残程度', '登记人'],
  },
  {
    module: 'flotation',
    codeField: '样本编号',
    unitField: '采样单位',
    dateField: '浮选日期',
    displayFields: ['采样层位', '土样重量', '浮选日期', '轻浮物类型', '操作人'],
  },
  {
    module: 'dating',
    codeField: '送检编号',
    unitField: '采样单位',
    dateField: '送检日期',
    displayFields: ['样品类型', '采样层位', '送检方法', '送检日期', '预计返回'],
  },
]

const PENDING_BASE_REASON = '记录自带待处理标记'

export type HandoverSnapshot = {
  sections: HandoverSection[]
  rows: RowSnapshot[]
  pendingItems: PendingItem[]
}

function toRowSnapshot(
  module: HandoverModuleKey,
  row: EntryRow,
  config: (typeof HANDOVER_MODULE_CONFIG)[number],
  caliber: CaliberVersion,
  overrides: Record<string, string>,
): RowSnapshot {
  const unit = String(row[config.unitField] ?? '')
  const resolution: AreaResolution = resolveArea(module, Number(row.id), unit, overrides)
  const escalation = caliber === 'v2' ? v2Escalation(module, row) : null
  const reasons: string[] = []
  if (row.pending) {
    reasons.push(PENDING_BASE_REASON)
  }
  if (escalation) {
    reasons.push(escalation)
  }
  const pending = row.pending || escalation !== null
  const fields: Record<string, string> = {}
  for (const field of config.displayFields) {
    fields[field] = String(row[field] ?? '')
  }
  return {
    module,
    rowId: Number(row.id),
    code: String(row[config.codeField] ?? `#${row.id}`),
    area: resolution.area,
    areaMissing: resolution.missing,
    areaBackfilled: resolution.backfilled,
    status: String(row.status),
    pending,
    abnormal: Boolean(row.abnormal),
    reasons,
    escalated: escalation !== null,
    fields,
  }
}

/**
 * 按指定口径把当前台账重判一遍，生成可冻结的交接快照。
 * 口径调整后只对新交接单调用本函数；旧交接单沿用落库时的快照，永不重判。
 */
export function buildSnapshot(
  caliber: CaliberVersion,
  date: string,
  overrides: Record<string, string>,
): HandoverSnapshot {
  const sections: HandoverSection[] = []
  const rows: RowSnapshot[] = []
  const pendingItems: PendingItem[] = []

  for (const config of HANDOVER_MODULE_CONFIG) {
    const moduleRows = listRows(config.module).map((row) =>
      toRowSnapshot(config.module, row, config, caliber, overrides),
    )
    moduleRows.sort((a, b) => a.code.localeCompare(b.code, 'zh-Hans-CN'))
    rows.push(...moduleRows)

    const created =
      config.dateField === null
        ? null
        : moduleRows.filter((row) => row.fields[config.dateField as string] === date).length
    const section: HandoverSection = {
      module: config.module,
      moduleName: MODULE_NAMES[config.module],
      total: moduleRows.length,
      created,
      pending: moduleRows.filter((row) => row.pending).length,
      abnormal: moduleRows.filter((row) => row.abnormal).length,
    }
    sections.push(section)

    for (const row of moduleRows.filter((item) => item.pending)) {
      pendingItems.push({
        module: config.module,
        moduleName: MODULE_NAMES[config.module],
        rowId: row.rowId,
        code: row.code,
        area: row.area,
        areaMissing: row.areaMissing,
        status: row.status,
        reasons: row.reasons,
        escalated: row.escalated,
      })
    }
  }
  return { sections, rows, pendingItems }
}
