import { listRows } from './local-store'
import type { EntryRow, HandoverSectionKey } from './types'

// 缺发掘区归属旧记录的补录口径：
// 1) 地层 / 遗迹 / 遗物先读取自身的「发掘区归属」，再经「所属探方 / 出土探方」回查探方表；
// 2) 探方自身也缺失（示例数据里这些字段是占位文本）或回查不到的，统一补录为「Ⅰ区（系统补录）」；
// 3) 浮选、测年只有采样单位、没有可追溯的探方链，不臆测归属，返回空串在台账上留痕。
export const FALLBACK_AREA = 'Ⅰ区（系统补录）'
export const AREA_FIELD = '发掘区归属'
export const TRENCH_AREA_FIELD = '所属发掘区'

const SECTION_LOCATION_FIELD: Partial<Record<HandoverSectionKey, string>> = {
  stratum: '所属探方',
  feature: '所属探方',
  artifact: '出土探方',
}

/** 示例数据里业务字段是「探方管理样例1」这类占位文本，不能当作真实归属，按缺失处理。 */
export function isMissingAreaValue(value: string): boolean {
  const text = value.trim()
  return text.length === 0 || text.includes('样例')
}

const trenchAreaCache = new Map<string, string>()

function trenchAreaByCode(code: string): string {
  if (trenchAreaCache.has(code)) {
    return trenchAreaCache.get(code) ?? ''
  }
  const hit = listRows('trench').find((row) => String(row['探方编号']) === code)
  const area = hit ? String(hit[TRENCH_AREA_FIELD] ?? '') : ''
  const resolved = isMissingAreaValue(area) ? '' : area
  trenchAreaCache.set(code, resolved)
  return resolved
}

/** 解析单条记录的发掘区归属，找不到可靠归属时按模块决定补录或留空。 */
export function resolveRowArea(section: HandoverSectionKey, row: EntryRow): string {
  const own = String(row[AREA_FIELD] ?? '')
  if (!isMissingAreaValue(own)) {
    return own
  }
  const locationField = SECTION_LOCATION_FIELD[section]
  if (locationField) {
    const location = String(row[locationField] ?? '')
    if (!isMissingAreaValue(location)) {
      const mapped = trenchAreaByCode(location)
      if (mapped) {
        return mapped
      }
    }
    return FALLBACK_AREA
  }
  return ''
}

export type BackfillStat = {
  trench: number
  stratum: number
  feature: number
  artifact: number
  total: number
}

// 顺序很重要：探方排第一，后续模块才能回查到刚补好的探方归属。
const BACKFILL_TARGETS: {
  key: 'trench' | 'stratum' | 'feature' | 'artifact'
  areaField: string
  linkField?: string
}[] = [
  { key: 'trench', areaField: TRENCH_AREA_FIELD },
  { key: 'stratum', areaField: AREA_FIELD, linkField: '所属探方' },
  { key: 'feature', areaField: AREA_FIELD, linkField: '所属探方' },
  { key: 'artifact', areaField: AREA_FIELD, linkField: '出土探方' },
]

/** 给单个模块的一批行就地补录归属（模块重置回示例数据时复用）。 */
export function backfillModule(
  key: 'trench' | 'stratum' | 'feature' | 'artifact',
  rows: EntryRow[],
  rowsByKey: Record<string, EntryRow[]>,
): EntryRow[] {
  const target = BACKFILL_TARGETS.find((item) => item.key === key)
  if (!target) {
    return rows
  }
  for (const row of rows) {
    if (!isMissingAreaValue(String(row[target.areaField] ?? ''))) {
      continue
    }
    let area = ''
    if (target.linkField) {
      const code = String(row[target.linkField] ?? '')
      if (!isMissingAreaValue(code)) {
        const trench = rowsByKey['trench']?.find((item) => String(item['探方编号']) === code)
        const trenchArea = trench ? String(trench[TRENCH_AREA_FIELD] ?? '') : ''
        if (!isMissingAreaValue(trenchArea)) {
          area = trenchArea
        }
      }
    }
    row[target.areaField] = area || FALLBACK_AREA
  }
  trenchAreaCache.clear()
  return rows
}

/** 版本化迁移：给老版本存储里缺发掘区归属的旧记录补录，只在存储版本升级时执行一次。 */
export function backfillMissingAreas(
  rowsByKey: Record<string, EntryRow[]>,
  persist: (key: string, rows: EntryRow[]) => void,
): BackfillStat {
  const stat: BackfillStat = { trench: 0, stratum: 0, feature: 0, artifact: 0, total: 0 }

  for (const target of BACKFILL_TARGETS) {
    const rows = rowsByKey[target.key] ?? []
    const before = rows.filter((row) =>
      isMissingAreaValue(String(row[target.areaField] ?? '')),
    ).length
    if (before === 0) {
      continue
    }
    backfillModule(target.key, rows, rowsByKey)
    persist(target.key, [...rows])
    stat[target.key] = before
    stat.total += before
  }

  trenchAreaCache.clear()
  return stat
}

export function countBackfilledRows(rowsByKey: Record<string, EntryRow[]>): number {
  // 模块数据被「重置」回示例后字段会缺失，但台账展示时仍按兜底口径解析，
  // 所以这里把「字段缺失」和「显式记着兜底区」都算作沿用兜底归属，保持横幅与页面一致。
  return BACKFILL_TARGETS.reduce((sum, target) => {
    const rows = rowsByKey[target.key] ?? []
    return (
      sum
      + rows.filter((row) => {
        const value = String(row[target.areaField] ?? '')
        return value === FALLBACK_AREA || isMissingAreaValue(value)
      }).length
    )
  }, 0)
}
