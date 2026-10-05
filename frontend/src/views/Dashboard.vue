<template>
  <section class="page ledger">
    <header class="page-head">
      <div>
        <h2>发掘交接台账</h2>
        <p class="page-desc">按日期推进：顶部时间轴盯当班未决事项，中部逐模块核对地层、遗迹、遗物、浮选、测年记录，底部填写交接意见并由两位负责人确认。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="rebuildCurrent">按当前台账重判草稿</button>
        <button class="btn" type="button" @click="reload()">刷新台账</button>
      </div>
    </header>

    <!-- 顶部：日期时间轴 -->
    <div class="date-rail">
      <button
        v-for="day in dateRail"
        :key="day.date"
        class="date-node"
        :class="{ active: day.date === selectedDate, empty: !day.sheet, confirmed: day.sheet?.status === 'confirmed' }"
        type="button"
        @click="selectDate(day)"
      >
        <span class="date-weekday">{{ weekday(day.date) }}</span>
        <span class="date-main">{{ day.date.slice(5) }}</span>
        <span v-if="day.sheet" class="date-badge">
          {{ day.sheet.status === 'confirmed' ? `已交接 v${day.sheet.version}` : `草稿 ${day.sheet.pendingItems.length} 未决` }}
        </span>
        <span v-else class="date-badge placeholder">+ 新建</span>
      </button>
    </div>

    <template v-if="sheet">
      <div class="sheet-meta">
        <div>
          <strong class="sheet-id">{{ sheet.id }}</strong>
          <span class="sheet-caliber" :class="sheet.caliberVersion">
            统计口径：{{ caliberMeta(sheet.caliberVersion).name }}（{{ sheet.caliberVersion }}，{{ sheet.caliberVersion === 'v2' ? '加严规则仅重判新单' : '交接当日口径已冻结' }}）
          </span>
        </div>
        <label class="shift-pick">
          班次
          <select :value="sheet.shift" :disabled="sheet.status === 'confirmed'" @change="onShiftChange(($event.target as HTMLSelectElement).value)">
            <option v-for="shift in shifts" :key="shift" :value="shift">{{ shift }}</option>
          </select>
        </label>
      </div>

      <!-- 当班未决事项时间轴 -->
      <section class="pending-timeline card-block">
        <h3>当班未决事项（{{ sheet.pendingItems.length }}）</h3>
        <p class="block-hint" v-if="sheet.caliberVersion === 'v2'">
          按{{ caliberMeta('v2').name }}重判：自带待处理标记与加严规则命中的事项全部上墙；<em class="escalated">橙色</em>为新口径加判。
        </p>
        <p class="block-hint" v-else>本单为历史交接单，未决事项按交接当日的{{ caliberMeta('v1').name }}冻结显示，口径调整不回溯。</p>
        <ol v-if="sheet.pendingItems.length" class="timeline">
          <li v-for="item in sheet.pendingItems" :key="`${item.module}-${item.rowId}`" :class="{ escalated: item.escalated }">
            <span class="timeline-dot"></span>
            <div class="timeline-body">
              <div class="timeline-line">
                <span class="mod-tag">{{ item.moduleName }}</span>
                <strong>{{ item.code }}</strong>
                <span class="area-tag" :class="{ missing: item.areaMissing }">{{ item.area }}</span>
                <span v-if="item.escalated" class="escalate-tag">新口径加判</span>
              </div>
              <p class="timeline-reasons">
                <span v-for="reason in item.reasons" :key="reason" class="reason-chip">{{ reason }}</span>
              </p>
            </div>
          </li>
        </ol>
        <p v-else class="empty-state">本班没有未决事项。</p>
      </section>

      <!-- 中部：业务模块分区 -->
      <section v-for="section in sheet.sections" :key="section.module" class="module-section card-block">
        <details :open="section.pending > 0">
          <summary>
            <span class="mod-title">{{ section.moduleName }}记录</span>
            <span class="mod-stat">在册 {{ section.total }}</span>
            <span class="mod-stat">当日新增 {{ section.created ?? '—' }}</span>
            <span class="mod-stat" :class="{ hot: section.pending > 0 }">未决 {{ section.pending }}</span>
            <span class="mod-stat" :class="{ hot: section.abnormal > 0 }">异常 {{ section.abnormal }}</span>
            <button class="link backfill-link" type="button" @click.prevent="openBackfill(section.module)">补录发掘区</button>
          </summary>
          <table class="data-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>发掘区归属</th>
                <th v-for="field in displayFields(section.module)" :key="field">{{ field }}</th>
                <th>状态</th>
                <th>未决/原因</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rowsOf(section.module)" :key="`${row.module}-${row.rowId}`" :class="{ rowwarn: row.pending }">
                <td>{{ row.code }}</td>
                <td>
                  <span :class="{ missing: row.areaMissing, backfilled: row.areaBackfilled }">
                    {{ row.area }}
                    <small v-if="row.areaBackfilled">（已补录）</small>
                  </span>
                  <button v-if="row.areaMissing" class="link" type="button" @click="openBackfillRow(section.module, row.rowId)">补录</button>
                </td>
                <td v-for="field in displayFields(section.module)" :key="field">{{ row.fields[field] || '—' }}</td>
                <td>{{ row.status }}<small v-if="row.abnormal" class="abnormal-flag"> 异常</small></td>
                <td>
                  <template v-if="row.pending">
                    <span v-for="reason in row.reasons" :key="reason" class="reason-chip" :class="{ escalated: !reason.includes('待处理标记') }">{{ reason }}</span>
                  </template>
                  <span v-else>已闭环</span>
                </td>
              </tr>
            </tbody>
          </table>
        </details>
      </section>

      <!-- 底部：交接意见与确认 -->
      <section class="handover-foot card-block">
        <h3>交接意见</h3>
        <textarea
          v-model="opinionDraft"
          :disabled="sheet.status === 'confirmed'"
          rows="3"
          placeholder="记录本班工作进展、遗留问题与下一班注意事项…"
          @blur="persistOpinion"
        ></textarea>
        <div class="leaders">
          <label>
            交班负责人
            <input v-model="shiftLeaderDraft" :disabled="sheet.status === 'confirmed'" @blur="persistLeaders" />
          </label>
          <label>
            接班负责人
            <input v-model="nextLeaderDraft" :disabled="sheet.status === 'confirmed'" @blur="persistLeaders" />
          </label>
          <span v-if="sheet.status === 'confirmed'" class="confirmed-note">
            已于 {{ sheet.confirmedAt }} 由 {{ sheet.confirmedBy }} 确认落库（v{{ sheet.version }}），内容不再改写
          </span>
        </div>

        <div v-if="sheet.status === 'draft'" class="confirm-bar">
          <button class="btn primary" type="button" @click="confirmAs(sheet.shiftLeader || shiftLeaderDraft)">交班负责人确认交接</button>
          <button class="btn" type="button" @click="confirmAs(sheet.nextLeader || nextLeaderDraft)">接班负责人同时确认（冲突演示）</button>
          <span class="confirm-hint">同一交接单只能第一个确认版本落库；两位负责人同时确认时，后到者收到冲突提示。</span>
        </div>
        <div v-else class="confirm-bar">
          <ul class="todo-refs">
            <li v-for="ref in sheet.todos" :key="ref.checklistId">
              <RouterLink class="btn ghost" :to="ref.todoKey === 'artifact_recheck' ? '/artifact' : '/flotation'">
                {{ ref.title }}（{{ ref.count }} 项）→ {{ ref.todoKey === 'artifact_recheck' ? '出土遗物页' : '浮选采样页' }}待办区
              </RouterLink>
            </li>
          </ul>
        </div>
        <p v-if="actionMessage" class="action-message" :class="{ conflict: lastConflict, ok: !lastConflict }">{{ actionMessage }}</p>
      </section>
    </template>

    <Teleport to="body">
      <div v-if="backfillTarget" class="modal-mask" @click.self="backfillTarget = null">
        <div class="modal">
          <h3>补录发掘区归属</h3>
          <p>{{ backfillTarget.code }} 当前归属「{{ backfillTarget.area }}」。补录只写覆盖表并重算当班草稿，不回改原始记录与历史交接单。</p>
          <select v-model="backfillAreaDraft">
            <option v-for="choice in backfillChoices" :key="choice" :value="choice">{{ choice }}</option>
          </select>
          <p>发掘区也可手工填写：</p>
          <input v-model="backfillAreaDraft" placeholder="如：发掘Ⅳ区" />
          <div class="modal-actions">
            <button class="btn ghost" type="button" @click="backfillTarget = null">取消</button>
            <button class="btn primary" type="button" @click="submitBackfill">保存补录</button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  HANDOVER_SHIFTS,
  backfillArea,
  confirmHandover,
  createSheet,
  listSheets,
  rebuildDraft,
  saveLeaders,
  saveOpinion,
} from '@/api/handover-service'
import { caliberMeta } from '@/data/caliber'
import { HANDOVER_MODULE_CONFIG } from '@/data/handover-snapshot'
import type { HandoverModuleKey, HandoverSheet, RowSnapshot } from '@/data/handover-types'

// 工地台账日期固定按现场日期推进（示例环境以 2026-10-05 为当班日）。
const SITE_TODAY = '2026-10-05'
const RAIL_DATES = ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']
const shifts = HANDOVER_SHIFTS

const route = useRoute()
const router = useRouter()
const sheets = ref<HandoverSheet[]>([])
const selectedId = ref<string>('')

const opinionDraft = ref('')
const shiftLeaderDraft = ref('')
const nextLeaderDraft = ref('')
const actionMessage = ref('')
const lastConflict = ref(false)

const backfillTarget = ref<{ module: HandoverModuleKey; rowId: number; code: string; area: string } | null>(null)
const backfillAreaDraft = ref('')
const backfillChoices = ['发掘Ⅰ区', '发掘Ⅱ区', '发掘Ⅲ区']

const sheet = computed<HandoverSheet | undefined>(() =>
  sheets.value.find((item) => item.id === selectedId.value),
)

const selectedDate = computed(() => selectedId.value.slice(3))

const dateRail = computed(() =>
  RAIL_DATES.map((date) => ({
    date,
    sheet: sheets.value.find((item) => item.date === date),
  })),
)

const displayFieldMap = new Map(HANDOVER_MODULE_CONFIG.map((item) => [item.module, item.displayFields]))
function displayFields(module: HandoverModuleKey): string[] {
  return displayFieldMap.get(module) ?? []
}
function rowsOf(module: HandoverModuleKey): RowSnapshot[] {
  return sheet.value?.rows.filter((row) => row.module === module) ?? []
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
function weekday(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00`).getDay()]
}

function reload(selectHash = true) {
  sheets.value = listSheets()
  const hashId = selectHash ? String(route.hash.replace('#', '')) : ''
  if (hashId && sheets.value.some((item) => item.id === hashId)) {
    selectedId.value = hashId
  } else if (!selectedId.value || !sheets.value.some((item) => item.id === selectedId.value)) {
    const latest = [...sheets.value].sort((a, b) => b.date.localeCompare(a.date))[0]
    selectedId.value = latest?.id ?? ''
  }
  syncDrafts()
}

function syncDrafts() {
  opinionDraft.value = sheet.value?.opinion ?? ''
  shiftLeaderDraft.value = sheet.value?.shiftLeader ?? ''
  nextLeaderDraft.value = sheet.value?.nextLeader ?? ''
}

watch(sheet, syncDrafts)

function selectDate(day: { date: string; sheet?: HandoverSheet }) {
  actionMessage.value = ''
  const target = day.sheet ?? createSheet(day.date, shifts[0])
  selectedId.value = target.id
  router.replace({ hash: target.id })
  reload(false)
}

function onShiftChange(shift: string) {
  if (sheet.value) {
    saveLeaders(sheet.value.id, { shift })
    reload(false)
  }
}

function persistOpinion() {
  if (sheet.value && opinionDraft.value !== sheet.value.opinion) {
    saveOpinion(sheet.value.id, opinionDraft.value)
    reload(false)
  }
}

function persistLeaders() {
  if (!sheet.value) {
    return
  }
  saveLeaders(sheet.value.id, {
    shiftLeader: shiftLeaderDraft.value,
    nextLeader: nextLeaderDraft.value,
  })
  reload(false)
}

function confirmAs(confirmer: string) {
  if (!sheet.value) {
    return
  }
  persistLeaders()
  const expectedVersion = sheet.value?.version ?? 0
  const result = confirmHandover(selectedId.value, expectedVersion, confirmer || '未署名负责人')
  reload(false)
  lastConflict.value = Boolean(result.conflict)
  actionMessage.value = result.message
}

function openBackfill(module: HandoverModuleKey) {
  const firstMissing = rowsOf(module).find((row) => row.areaMissing)
  if (!firstMissing) {
    actionMessage.value = '本模块记录都已有发掘区归属，无需补录。'
    return
  }
  openBackfillRow(module, firstMissing.rowId)
}

function openBackfillRow(module: HandoverModuleKey, rowId: number) {
  const row = rowsOf(module).find((item) => item.rowId === rowId)
  if (!row) {
    return
  }
  backfillTarget.value = { module, rowId, code: row.code, area: row.area }
  backfillAreaDraft.value = backfillChoices[0]
}

function submitBackfill() {
  if (!backfillTarget.value) {
    return
  }
  const { module, rowId, code } = backfillTarget.value
  backfillArea(module, rowId, backfillAreaDraft.value)
  actionMessage.value = `${code} 的发掘区已补录为「${backfillAreaDraft.value}」；历史交接单维持当日归属，仅当班草稿按补录重算。`
  lastConflict.value = false
  backfillTarget.value = null
  reload(false)
}

function rebuildCurrent() {
  if (!sheet.value) {
    return
  }
  if (sheet.value.status === 'confirmed') {
    actionMessage.value = '已确认的历史交接单按交接当日口径冻结，不重判；仅草稿可按当前台账重算。'
    lastConflict.value = false
    return
  }
  rebuildDraft(sheet.value.id)
  reload(false)
  actionMessage.value = '草稿已按当前台账和现行口径重新判定。'
  lastConflict.value = false
}

onMounted(() => {
  reload()
  // 挂载时若当班草稿存在，按当前台账重判一次，保证新建/重置的数据能进草稿（历史单不动）。
  const today = sheets.value.find((item) => item.date === SITE_TODAY && item.status === 'draft')
  if (today) {
    rebuildDraft(today.id)
    reload()
  }
})
</script>

<style scoped>
.ledger { display: flex; flex-direction: column; gap: 12px; }
.date-rail { display: flex; gap: 8px; overflow-x: auto; background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 10px; }
.date-node { border: 1px solid var(--border); border-radius: 8px; background: #f8fafc; padding: 8px 10px; min-width: 92px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
.date-node.active { border-color: var(--brand); box-shadow: 0 0 0 2px rgba(31, 111, 235, 0.18); }
.date-node.confirmed .date-main { color: #0f766e; }
.date-node.empty { opacity: 0.75; }
.date-weekday { font-size: 11px; color: var(--muted); }
.date-main { font-size: 15px; font-weight: 600; }
.date-badge { font-size: 11px; color: #0f766e; }
.date-badge.placeholder { color: var(--brand); }
.card-block { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
.card-block h3 { margin: 0 0 8px; font-size: 15px; }
.block-hint { font-size: 12px; color: var(--muted); margin: 0 0 10px; }
.sheet-meta { display: flex; justify-content: space-between; align-items: center; }
.sheet-id { font-size: 16px; margin-right: 10px; }
.sheet-caliber { font-size: 12px; border-radius: 999px; padding: 2px 10px; }
.sheet-caliber.v1 { background: #e2e8f0; color: #475569; }
.sheet-caliber.v2 { background: #fef3c7; color: #92400e; }
.shift-pick { font-size: 13px; color: var(--muted); }
.shift-pick select { margin-left: 6px; padding: 4px 6px; }

.timeline { list-style: none; margin: 0; padding: 0 0 0 18px; border-left: 2px solid #cbd5e1; display: flex; flex-direction: column; gap: 10px; }
.timeline li { position: relative; }
.timeline-dot { position: absolute; left: -24px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: var(--brand); border: 2px solid #fff; box-shadow: 0 0 0 2px var(--brand); }
.timeline li.escalated .timeline-dot { background: #d97706; box-shadow: 0 0 0 2px #d97706; }
.timeline-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mod-tag { background: #1f6feb; color: #fff; border-radius: 4px; font-size: 12px; padding: 1px 8px; }
.area-tag { font-size: 12px; color: #475569; background: #f1f5f9; border-radius: 4px; padding: 1px 8px; }
.area-tag.missing, .missing { color: #b42318; }
.escalate-tag { font-size: 11px; color: #b45309; border: 1px solid #f59e0b; border-radius: 4px; padding: 0 6px; }
.timeline-reasons { margin: 4px 0 0; display: flex; gap: 6px; flex-wrap: wrap; }
.reason-chip { font-size: 12px; background: #eef2f7; border-radius: 999px; padding: 1px 10px; color: #334155; }
.reason-chip.escalated { background: #fef3c7; color: #92400e; }

.module-section summary { cursor: pointer; display: flex; align-items: center; gap: 14px; padding: 4px 0; }
.mod-title { font-weight: 600; min-width: 90px; }
.mod-stat { font-size: 12px; color: var(--muted); }
.mod-stat.hot { color: #b42318; font-weight: 600; }
.backfill-link { margin-left: auto; font-size: 12px; }
.module-section .data-table { margin-top: 10px; }
.rowwarn td { background: #fffbf2; }
.abnormal-flag { color: #b42318; }
.backfilled { color: #0f766e; }

.handover-foot textarea { width: 100%; border: 1px solid var(--border); border-radius: 6px; padding: 8px; font: inherit; resize: vertical; }
.leaders { display: flex; gap: 16px; align-items: center; margin: 10px 0; flex-wrap: wrap; }
.leaders label { font-size: 13px; color: var(--muted); display: flex; flex-direction: column; gap: 4px; }
.leaders input { padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; min-width: 180px; }
.confirmed-note { font-size: 12px; color: #0f766e; }
.confirm-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; border-top: 1px dashed var(--border); padding-top: 10px; }
.confirm-hint { font-size: 12px; color: var(--muted); }
.todo-refs { list-style: none; display: flex; gap: 8px; margin: 0; padding: 0; flex-wrap: wrap; }
.action-message { margin: 8px 0 0; font-size: 13px; }
.action-message.ok { color: #0f766e; }
.action-message.conflict { color: #b42318; font-weight: 600; }

.modal-mask { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; z-index: 50; }
.modal { background: #fff; border-radius: 10px; padding: 18px 20px; width: 420px; max-width: calc(100vw - 32px); }
.modal h3 { margin: 0 0 10px; font-size: 16px; }
.modal p { font-size: 13px; color: var(--muted); margin: 0 0 10px; }
.modal select, .modal input { width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
