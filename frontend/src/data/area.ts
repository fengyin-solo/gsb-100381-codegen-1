import { listRows } from './local-store'
import type { HandoverModuleKey } from './handover-types'

/**
 * 发掘区归属解析：
 * 1. 地层/遗迹/遗物/浮选/测年记录本身不带发掘区字段，只有探方/采样单位；
 * 2. 优先用人工补录的覆盖表（见 handover-store 持久化），便于追溯且不回改原记录；
 * 3. 覆盖表没有时，按单位里的探方编码（T0101 这类四位码）去探方台账反推「所属发掘区」；
 * 4. 都对不上的，归入「未划分发掘区（待补录）」，由台账页补录。
 */
export const AREA_MISSING = '未划分发掘区（待补录）'

const TRENCH_CODE_RE = /T\s?\d{4}/i

let trenchAreaCache: Map<string, string> | null = null

export function trenchAreaMap(): Map<string, string> {
  if (trenchAreaCache) {
    return trenchAreaCache
  }
  const map = new Map<string, string>()
  for (const row of listRows('trench')) {
    const code = String(row['探方编号'] ?? '').trim()
    const area = String(row['所属发掘区'] ?? '').trim()
    if (code && area) {
      map.set(code.toUpperCase(), area)
    }
  }
  trenchAreaCache = map
  return map
}

/** 清掉探方缓存：探方数据被重置后调用。 */
export function invalidateTrenchAreaCache(): void {
  trenchAreaCache = null
}

export function extractTrenchCode(unit: string): string | null {
  const matched = unit.match(TRENCH_CODE_RE)
  return matched ? matched[0].replace(/\s+/g, '').toUpperCase() : null
}

export type AreaResolution = {
  area: string
  missing: boolean
  /** true 表示来自人工补录覆盖表。 */
  backfilled: boolean
  /** 从探方台账反推出的编码，供补录界面预填。 */
  inferredTrench: string | null
}

export function resolveArea(
  module: HandoverModuleKey,
  rowId: number,
  unit: string,
  overrides: Record<string, string>,
): AreaResolution {
  const overrideKey = `${module}:${rowId}`
  const override = overrides[overrideKey]?.trim()
  if (override) {
    return { area: override, missing: false, backfilled: true, inferredTrench: null }
  }
  const code = extractTrenchCode(unit)
  if (code) {
    const area = trenchAreaMap().get(code)
    if (area) {
      return { area, missing: false, backfilled: false, inferredTrench: code }
    }
  }
  return { area: AREA_MISSING, missing: true, backfilled: false, inferredTrench: code }
}
