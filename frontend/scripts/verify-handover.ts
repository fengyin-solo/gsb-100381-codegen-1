/* 交接台账业务规则的 Node 端到端校验（不进构建产物，仅本地验证）。 */
import {
  backfillArea,
  confirmHandover,
  createSheet,
  listSheets,
  listTodos,
  rebuildDraft,
} from '../src/api/handover-service'
import { buildSnapshot } from '../src/data/handover-snapshot'
import { caliberMeta } from '../src/data/caliber'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n   expected=${JSON.stringify(expected)}\n   actual  =${JSON.stringify(actual)}`}`)
  if (!ok) failures++
}

// 1. 种子：两张历史 v1 单 + 一张当班 v2 草稿。
const sheets = listSheets()
check('交接单数量', sheets.length, 3)
const s03 = sheets.find((s) => s.id === 'HO-20261003')!
const s04 = sheets.find((s) => s.id === 'HO-20261004')!
const s05 = sheets.find((s) => s.id === 'HO-20261005')!
check('旧单口径冻结为 v1', s03.caliberVersion, 'v1')
check('当班草稿口径为 v2', s05.caliberVersion, 'v2')

// 2. v1 与 v2 差异：同样的当前台账
//    - DATI-0004 abnormal 且非 pending：v1 不判未决，v2 判未决；
//    - ARTI-0002 残缺+未入库：v1 因 pending=true 已未决；ARTI-0003 pending=false 但残缺：仅 v2 加判；
//    - FLOT-0003 9-28 已分拣超 3 天：仅 v2 加判。
const v1 = buildSnapshot('v1', '2026-10-05', {})
const v2 = buildSnapshot('v2', '2026-10-05', {})
const v1PendingCodes = v1.pendingItems.map((p) => p.code).sort()
const v2PendingCodes = v2.pendingItems.map((p) => p.code).sort()
check('v1 未决清单', v1PendingCodes, ['ARTI-0001','ARTI-0002','DATI-0001','DATI-0002','FEAT-0001','FEAT-0002','FLOT-0001','FLOT-0002','STRA-0001','STRA-0002'])
check('v2 未决清单（含加判）', v2PendingCodes, ['ARTI-0001','ARTI-0002','ARTI-0003','DATI-0001','DATI-0002','DATI-0004','FEAT-0001','FEAT-0002','FLOT-0001','FLOT-0002','FLOT-0003','STRA-0001','STRA-0002'])
check('v2 加严命中条数', v2.pendingItems.filter((p) => p.escalated).length, 6)
check('v2 相对 v1 新增未决条数', v2.pendingItems.length - v1.pendingItems.length, 3)

// 3. 旧单快照保持交接当日口径：10-04 旧单里 DATI-0004 不应出现，FLOT-0003 也不加判。
check('旧单不含 v2 加判项', s04.pendingItems.map((p) => p.code).includes('DATI-0004'), false)

// 4. 发掘区归属：编码反推 + 补录覆盖 + 缺失归类。
const flot3 = v2.rows.find((r) => r.code === 'FLOT-0003')!
check('无编码旧记录归入待补录', flot3.areaMissing, true)
const stra3 = s03.rows.find((r) => r.code === 'STRA-0003')!
check('旧单经补录覆盖显示发掘Ⅲ区', stra3.area, '发掘Ⅲ区')
check('旧单补录标记', stra3.areaBackfilled, true)
const arti1 = v2.rows.find((r) => r.code === 'ARTI-0001')!
check('探方编码反推发掘区', arti1.area, '发掘Ⅰ区')

// 5. 确认落库 + 两张清单写入别的页面待办区。
const beforeArt = listTodos('artifact_recheck').items.length
const beforeFlot = listTodos('flotation_submit').items.length
const r1 = confirmHandover('HO-20261005', 0, '王晓峰')
check('第一个确认成功', r1.ok, true)
const confirmed = listSheets().find((s) => s.id === 'HO-20261005')!
check('确认后版本号自增', confirmed.version, 1)
check('确认后状态', confirmed.status, 'confirmed')
check('遗物待办新增数', listTodos('artifact_recheck').items.length - beforeArt, v2.rows.filter((r) => r.module === 'artifact' && r.pending).length)
check('浮选待办新增数', listTodos('flotation_submit').items.length - beforeFlot, v2.rows.filter((r) => r.module === 'flotation' && r.pending).length)
check('交接单留存两张清单引用', confirmed.todos.map((t) => t.todoKey), ['artifact_recheck', 'flotation_submit'])
check('待办条目带发掘区', listTodos('artifact_recheck').items.some((i) => i.sourceCode === 'ARTI-0001' && i.area === '发掘Ⅰ区'), true)

// 6. 并发：第二位负责人基于 v0 再确认 → 冲突，不落第二份。
const r2 = confirmHandover('HO-20261005', 0, '陈晓东')
check('后到确认被拒', r2.ok, false)
check('后到确认标记冲突', r2.conflict, true)
const after = listSheets().filter((s) => s.id === 'HO-20261005')
check('只有一份交接单落库', after.length, 1)
check('落库人仍是第一个确认者', after[0].confirmedBy, '王晓峰')

// 7. 新日期新建单按现行 v2 口径建档；补录只影响草稿。
const s06 = createSheet('2026-10-06', '白班 08:00-20:00')
check('10-06 新单使用 v2', s06.caliberVersion, 'v2')
backfillArea('flotation', 3, '发掘Ⅲ区')
rebuildDraft('HO-20261006')
const s06b = listSheets().find((s) => s.id === 'HO-20261006')!
check('补录后草稿记录归属更新', s06b.rows.find((r) => r.rowId === 3 && r.module === 'flotation')?.area, '发掘Ⅲ区')
const old03Again = listSheets().find((s) => s.id === 'HO-20261003')!
check('补录不回改历史单（仍为当时补录值）', old03Again.rows.find((r) => r.rowId === 3 && r.module === 'flotation')?.area, '未划分发掘区（待补录）')

console.log(caliberMeta('v2').summary)
console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
