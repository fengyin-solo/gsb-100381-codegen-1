import type { CaliberVersion, HandoverModuleKey } from './handover-types'
import type { EntryRow } from './types'

/**
 * 统计口径版本：
 * - v1 只认记录自带的 pending 标记；
 * - v2（2026-10-05 起）在 v1 基础上按模块加严，新口径只重判新交接单，旧单随单冻结。
 */
export type CaliberMeta = {
  version: CaliberVersion
  name: string
  effectiveFrom: string
  summary: string
  rules: string[]
}

export const CALIBERS: CaliberMeta[] = [
  {
    version: 'v1',
    name: '初版口径',
    effectiveFrom: '2026-09-01',
    summary: '仅以各模块记录自带的待处理标记为准，异常不自动算未决。',
    rules: ['记录 pending 标记为真即未决，否则视为已闭环。'],
  },
  {
    version: 'v2',
    name: '加严口径',
    effectiveFrom: '2026-10-05',
    summary: '在初版口径上加严：残缺遗物未复核、浮选样本超期未送检、异常测年单一律挂未决。',
    rules: [
      '出土遗物：完残程度含「残/碎/缺」且未复核入库的，计入未决',
      '浮选采样：采集后超过 3 天仍停留在「已浮选/已分拣」的，计入未决',
      '测年送检：标记异常（abnormal）的送检单，不论状态一律计入未决',
    ],
  },
]

export const CURRENT_CALIBER: CaliberVersion = 'v2'

export function caliberMeta(version: CaliberVersion): CaliberMeta {
  return CALIBERS.find((item) => item.version === version) ?? CALIBERS[0]
}

/** 按交接日期选择口径：早于 v2 生效日的交接单仍按 v1 建档。 */
export function caliberForDate(date: string): CaliberVersion {
  return date >= CALIBERS[1].effectiveFrom ? 'v2' : 'v1'
}

export const MODULE_NAMES: Record<HandoverModuleKey, string> = {
  stratum: '地层',
  feature: '遗迹',
  artifact: '遗物',
  flotation: '浮选',
  dating: '测年',
}

/** v2 加严判定：返回新判未决的理由；返回 null 表示 v2 没有额外加判。 */
export function v2Escalation(module: HandoverModuleKey, row: EntryRow): string | null {
  const status = String(row.status)
  if (module === 'artifact') {
    const damage = String(row['完残程度'] ?? '')
    const notClosed = status !== '已入库' && status !== '借出展示'
    if (/[残碎缺]/.test(damage) && notClosed) {
      return `完残程度为「${damage}」尚未复核入库`
    }
  }
  if (module === 'flotation') {
    const days = flotationAgeDays(row)
    if (days !== null && days > 3 && (status === '已浮选' || status === '已分拣')) {
      return `采集已 ${days} 天仍停留在「${status}」，超过 3 天送检时限`
    }
  }
  if (module === 'dating') {
    if (row.abnormal) {
      return `测年送检单标记异常（当前状态「${status}」），需跟办闭环`
    }
  }
  return null
}

/** 浮选样本距采集的天数：没有可解析的浮选日期时返回 null，不加判。 */
function flotationAgeDays(row: EntryRow): number | null {
  const raw = String(row['浮选日期'] ?? '')
  const date = new Date(`${raw}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  const today = new Date('2026-10-05T00:00:00')
  return Math.max(0, Math.round((today.getTime() - date.getTime()) / 86_400_000))
}
