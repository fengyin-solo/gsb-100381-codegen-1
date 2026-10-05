<template>
  <section class="page handover-page">
    <header class="page-head">
      <div>
        <h2>发掘交接台账</h2>
        <p class="page-desc">按日期与班次推进：顶部时间轴跟办当班未决事项，中部按模块核对地层、遗迹、遗物、浮选、测年记录，底部留存交接意见并由双方负责人确认。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="togglePolicyPanel">
          {{ showPolicyPanel ? '收起口径设置' : '统计口径设置' }}
        </button>
        <button class="btn primary" type="button" @click="ensureDraft">为当班建草稿</button>
      </div>
    </header>

    <!-- 统计口径：调整后只对新交接单重判，旧单冻结在交接当日口径 -->
    <section v-if="showPolicyPanel" class="policy-panel">
      <header>
        <strong>统计口径</strong>
        <span class="policy-hint">调整口径只对之后新建的交接单重判；已确认的旧交接单始终显示交接当日的口径快照。</span>
      </header>
      <div class="policy-options">
        <label v-for="policy in STAT_POLICIES" :key="policy.version" class="policy-option">
          <input
            type="radio"
            name="policy"
            :value="policy.version"
            :checked="activePolicy === policy.version"
            @change="changePolicy(policy.version)"
          />
          <span>
            <strong>{{ policy.label }}</strong>
            <em>{{ policy.effectiveDate }} 起生效</em>
            <small>{{ policy.desc }}</small>
          </span>
        </label>
      </div>
    </section>

    <!-- 旧记录缺发掘区归属的补录留痕 -->
    <section v-if="areaStat.fallbackTotal > 0" class="area-banner">
      <strong>旧记录发掘区补录：</strong>
      建账时迁移补录 {{ areaStat.total }} 条缺归属旧记录，当前仍有 {{ areaStat.fallbackTotal }} 条沿用兜底归属
      「{{ FALLBACK_AREA_CONST }}」——地层/遗迹/遗物先回查探方链，回查不到才进兜底区；浮选、测年只有采样单位，不臆测归属，台账中以「—」留空。
    </section>

    <!-- 顶部：按日期推进的时间轴 -->
    <section class="ledger-timeline">
      <div class="date-strip">
        <button class="btn ghost" type="button" @click="stepDay(-1)">← 前一天</button>
        <div class="date-track">
          <button
            v-for="slot in timelineSlots"
            :key="slot.date"
            type="button"
            class="date-node"
            :class="{ active: slot.date === currentDate, [slot.kind]: true }"
            :title="slot.tip"
            @click="selectDate(slot.date)"
          >
            <span class="date-node-day">{{ slot.date.slice(5) }}</span>
            <span class="date-node-mark">{{ slot.mark }}</span>
          </button>
        </div>
        <button class="btn ghost" type="button" @click="stepDay(1)">后一天 →</button>
      </div>

      <div class="shift-switch">
        <button
          v-for="option in shiftOptions"
          :key="option.value"
          type="button"
          class="shift-tab"
          :class="{ active: currentShift === option.value }"
          @click="currentShift = option.value"
        >
          {{ option.label }}
        </button>
        <span v-if="currentDoc" class="doc-code">{{ currentDoc.code }} · {{ docStatusText(currentDoc.status) }}</span>
      </div>

      <h3 class="timeline-title">
        当班未决事项
        <small>{{ currentDate }} {{ SHIFT_LABELS[currentShift] }}</small>
      </h3>
      <ol v-if="timelineItems.length" class="pending-timeline">
        <li v-for="item in timelineItems" :key="item.id" class="pending-node" :class="{ abnormal: item.abnormal }">
          <span class="pending-dot"></span>
          <div class="pending-body">
            <div class="pending-line">
              <span class="pending-module">{{ moduleName(item.module) }}</span>
              <strong>{{ item.code }}</strong>
              <span class="pending-status">{{ item.status }}</span>
              <span v-if="item.abnormal" class="pending-abnormal">异常</span>
            </div>
            <p class="pending-meta">
              <span>记录日期 {{ item.itemDate || currentDate }}</span>
              <span>位置 {{ item.location || '—' }}</span>
              <span>发掘区 {{ item.area || '—' }}</span>
              <span v-if="item.summary">{{ item.summary }}</span>
            </p>
          </div>
        </li>
      </ol>
      <p v-else class="timeline-empty">本班次没有未决事项，可以放心交接。</p>
    </section>

    <!-- 中部：五个业务模块台账 -->
    <section class="ledger-sections">
      <div class="ledger-cards">
        <article class="stat-card">
          <span class="stat-label">五模块记录总量</span>
          <strong class="stat-value">{{ built.cards.total }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">当班未决</span>
          <strong class="stat-value">{{ built.cards.pending }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">异常记录</span>
          <strong class="stat-value">{{ built.cards.abnormal }}</strong>
        </article>
        <article class="stat-card policy-card">
          <span class="stat-label">本单统计口径</span>
          <strong class="stat-value">{{ currentPolicyInfo.version.toUpperCase() }}</strong>
          <small>{{ currentPolicyInfo.label }} · {{ currentPolicyInfo.effectiveDate }} 起生效</small>
          <small v-if="frozenPolicy">旧交接单冻结口径，调整全局口径不会重算本单</small>
        </article>
      </div>

      <article v-for="section in built.sections" :key="section.key" class="module-section">
        <header class="module-section-head" @click="toggleSection(section.key)">
          <div>
            <strong>{{ section.name }}记录</strong>
            <span class="module-summary">
              共 {{ section.total }} 条 · 未决 {{ section.pendingCount }} · 异常 {{ section.abnormalCount }}
            </span>
          </div>
          <span class="module-toggle">{{ collapsed[section.key] ? '展开' : '收起' }}</span>
        </header>
        <table v-if="!collapsed[section.key]" class="data-table module-table">
          <thead>
            <tr>
              <th>编号</th>
              <th>{{ sectionDef(section.key).locationLabel }}</th>
              <th>发掘区</th>
              <th>摘要</th>
              <th>记录日期</th>
              <th>当前状态</th>
              <th>未决判定</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in section.items" :key="item.id" :class="{ unresolved: item.pending }">
              <td>{{ item.code }}</td>
              <td>{{ item.location || '—' }}</td>
              <td>{{ item.area || '—' }}</td>
              <td>{{ item.summary || '—' }}</td>
              <td>{{ item.itemDate || '—' }}</td>
              <td>{{ item.status }}</td>
              <td>
                <span v-if="item.pending" class="tag pending-tag">未决</span>
                <span v-else-if="item.abnormal" class="tag abnormal-tag">异常单列</span>
                <span v-else class="tag done-tag">已闭环</span>
              </td>
            </tr>
          </tbody>
        </table>
      </article>
    </section>

    <!-- 底部：交接意见与确认 -->
    <section class="ledger-foot">
      <header class="foot-head">
        <h3>交接意见</h3>
        <span class="policy-hint">底部留存本班次工作交代、风险与遗留问题，双方负责人确认后冻结。</span>
      </header>

      <div v-if="currentDoc?.status === 'confirmed'" class="confirmed-box">
        <p class="confirmed-remarks">{{ currentDoc.remarks || '（交接时未填写文字意见）' }}</p>
        <dl class="sign-grid">
          <div><dt>交班负责人</dt><dd>{{ currentDoc.outLeader }}</dd></div>
          <div><dt>接班负责人</dt><dd>{{ currentDoc.inLeader }}</dd></div>
          <div><dt>确认时间</dt><dd>{{ formatTime(currentDoc.confirmedAt) }}</dd></div>
          <div><dt>落库口径</dt><dd>{{ policyInfo(currentDoc.policyVersion).label }}</dd></div>
        </dl>
        <p class="confirmed-tip">已按确认时版本落库，遗物复核与浮选送检清单已写入对应页面待办区。</p>
      </div>

      <template v-else>
        <textarea
          v-model="remarksDraft"
          class="remarks-input"
          rows="4"
          placeholder="记录本班次进展、未决事项与风险，例如：T2 东隔梁地层需继续清理、FLOT-0002 明日送检……"
        ></textarea>
        <div class="foot-actions">
          <button class="btn" type="button" @click="saveDraftRemarks">暂存意见</button>
          <button class="btn primary" type="button" @click="openConfirm">班次负责人确认交接</button>
        </div>
      </template>
    </section>

    <footer class="page-foot">
      <span>交接记录与跨页待办保存在本机浏览器；确认时按当时口径冻结快照。</span>
      <span v-if="feedback" :class="feedback.ok ? 'success-text' : 'error-text'">{{ feedback.text }}</span>
    </footer>

    <!-- 双负责人确认 / 并发冲突演示 -->
    <div v-if="confirmOpen" class="modal-mask" @click.self="closeConfirm">
      <div class="modal">
        <header class="modal-head">
          <h3>确认交接 · {{ currentDate }} {{ SHIFT_LABELS[currentShift] }}</h3>
          <button class="link" type="button" @click="closeConfirm">关闭</button>
        </header>
        <div class="modal-body">
          <p class="modal-hint">两位班次负责人分别签字后提交。若两位负责人几乎同时确认同一交接单，只有第一个版本落库，后到者收到冲突提示。</p>
          <label class="modal-field">
            <span>交班负责人</span>
            <input v-model="outLeaderInput" placeholder="交班负责人姓名" />
          </label>
          <label class="modal-field">
            <span>接班负责人</span>
            <input v-model="inLeaderInput" placeholder="接班负责人姓名" />
          </label>
          <label class="modal-field">
            <span>交接意见</span>
            <textarea v-model="confirmRemarks" rows="3"></textarea>
          </label>
          <p v-if="confirmResult" :class="confirmResult.ok ? 'success-text' : 'error-text'">
            {{ confirmResult.text }}
          </p>
        </div>
        <footer class="modal-foot">
          <button class="btn" type="button" :disabled="busy" @click="submitConfirm(false)">第一位负责人确认</button>
          <button class="btn primary" type="button" :disabled="busy" @click="submitConfirm(true)">
            模拟两位负责人同时确认
          </button>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  SHIFT_LABELS,
  areaBackfillStat,
  confirmHandover,
  createDraft,
  docView,
  getActivePolicy,
  listDocs,
  pendingItems,
  saveRemarks,
  setActivePolicy,
} from '@/api/handover'
import { FALLBACK_AREA } from '@/data/area-register'
import { SECTION_BY_KEY, STAT_POLICIES, policyInfo } from '@/data/stat-policy'
import { useSessionStore } from '@/stores/session'
import type {
  HandoverDoc,
  HandoverItem,
  HandoverSectionKey,
  ShiftCode,
  StatPolicyVersion,
} from '@/data/types'

const session = useSessionStore()

const FALLBACK_AREA_CONST = FALLBACK_AREA

const shiftOptions: { value: ShiftCode; label: string }[] = [
  { value: 'day', label: '白班 08:00-20:00' },
  { value: 'night', label: '夜班 20:00-次日08:00' },
]

function toDateText(offset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

const currentDate = ref(toDateText(0))
const currentShift = ref<ShiftCode>('day')
const showPolicyPanel = ref(false)
const activePolicy = ref<StatPolicyVersion>('v1')
const areaStat = ref({ total: 0, fallbackTotal: 0 })
const feedback = ref<{ ok: boolean; text: string } | null>(null)
const remarksDraft = ref('')

const collapsed = reactive<Record<HandoverSectionKey, boolean>>({
  stratum: false,
  feature: false,
  artifact: false,
  flotation: false,
  dating: false,
})

const confirmOpen = ref(false)
const busy = ref(false)
const outLeaderInput = ref(session.operator)
const inLeaderInput = ref('')
const confirmRemarks = ref('')
const confirmResult = ref<{ ok: boolean; text: string } | null>(null)

const docs = ref<HandoverDoc[]>([])

const view = ref<ReturnType<typeof docView>>({
  doc: null,
  built: { sections: [], cards: { total: 0, pending: 0, abnormal: 0 } },
  policy: 'v1' as StatPolicyVersion,
})

const currentDoc = computed(() => view.value.doc)
const built = computed(() => view.value.built)
const currentPolicyInfo = computed(() => policyInfo(view.value.policy))
const frozenPolicy = computed(
  () => currentDoc.value?.status === 'confirmed' && currentDoc.value.policyVersion !== activePolicy.value,
)
const timelineItems = computed<HandoverItem[]>(() => pendingItems(currentDate.value, currentShift.value))

const timelineSlots = computed(() => {
  const indexOffset = [-2, -1, 0, 1, 2]
  return indexOffset.map((offset) => {
    const date = toDateText(offset)
    const dayDocs = docs.value.filter((doc) => doc.date === date)
    const confirmed = dayDocs.filter((doc) => doc.status === 'confirmed').length
    const draft = dayDocs.some((doc) => doc.status === 'draft')
    let kind = 'empty'
    let mark = '无单'
    if (confirmed > 0 && draft) {
      kind = 'mixed'
      mark = `已交${confirmed}/草稿`
    } else if (confirmed > 0) {
      kind = 'confirmed'
      mark = `已交接×${confirmed}`
    } else if (draft) {
      kind = 'draft'
      mark = '草稿'
    }
    return {
      date,
      kind,
      mark,
      tip: `${date}：${mark}`,
    }
  })
})

function reload() {
  docs.value = listDocs()
  view.value = docView(currentDate.value, currentShift.value)
  activePolicy.value = getActivePolicy()
  areaStat.value = areaBackfillStat()
  remarksDraft.value = currentDoc.value?.status === 'draft' ? currentDoc.value.remarks : ''
}

function selectDate(date: string) {
  currentDate.value = date
  feedback.value = null
  reload()
}

function stepDay(delta: number) {
  const date = new Date(`${currentDate.value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  currentDate.value = date.toISOString().slice(0, 10)
  feedback.value = null
  reload()
}

function ensureDraft() {
  createDraft(currentDate.value, currentShift.value)
  feedback.value = { ok: true, text: '已为当班生成草稿，口径按当前生效版本锁定，可在底部填写交接意见。' }
  reload()
}

function saveDraftRemarks() {
  const updated = saveRemarks(currentDate.value, currentShift.value, remarksDraft.value)
  if (!updated) {
    feedback.value = { ok: false, text: '还没有这一班次的交接单，请先为当班建草稿。' }
    return
  }
  feedback.value = { ok: true, text: '交接意见已暂存到草稿。' }
  reload()
}

function togglePolicyPanel() {
  showPolicyPanel.value = !showPolicyPanel.value
}

function changePolicy(version: StatPolicyVersion) {
  setActivePolicy(version)
  activePolicy.value = version
  feedback.value = {
    ok: true,
    text: `统计口径已切换为${policyInfo(version).label}，仅对之后新建的交接单生效，已确认旧单仍按交接当日口径显示。`,
  }
  reload()
}

function toggleSection(key: HandoverSectionKey) {
  collapsed[key] = !collapsed[key]
}

function moduleName(key: HandoverSectionKey): string {
  return SECTION_BY_KEY.get(key)?.name ?? key
}

function sectionDef(key: HandoverSectionKey) {
  return SECTION_BY_KEY.get(key)!
}

function docStatusText(status: HandoverDoc['status']): string {
  return status === 'confirmed' ? '已确认落库' : '草稿'
}

function formatTime(stamp?: string): string {
  if (!stamp) {
    return '—'
  }
  return stamp.replace('T', ' ').slice(0, 16)
}

function openConfirm() {
  let doc = getDocForConfirm()
  if (!doc) {
    doc = createDraft(currentDate.value, currentShift.value)
    reload()
  }
  outLeaderInput.value = session.operator
  inLeaderInput.value = ''
  confirmRemarks.value = remarksDraft.value
  confirmResult.value = null
  confirmOpen.value = true
}

function getDocForConfirm(): HandoverDoc | undefined {
  return docs.value.find((doc) => doc.date === currentDate.value && doc.shift === currentShift.value)
}

function closeConfirm() {
  confirmOpen.value = false
  busy.value = false
  confirmResult.value = null
}

function submitConfirm(simulateConcurrent: boolean) {
  const doc = getDocForConfirm()
  if (!doc) {
    confirmResult.value = { ok: false, text: '交接单不存在，请先建草稿。' }
    return
  }
  confirmResult.value = null
  busy.value = true

  const expectedRevision = doc.baseRevision
  const payload = {
    date: currentDate.value,
    shift: currentShift.value,
    outLeader: outLeaderInput.value,
    inLeader: inLeaderInput.value,
    remarks: confirmRemarks.value,
    expectedRevision,
  }

  // 第一个版本落库；随后携带同一 baseRevision 的第二次确认必须收到冲突。
  const first = confirmHandover(payload)
  if (!simulateConcurrent) {
    busy.value = false
    finishConfirm([first])
    return
  }
  const second = confirmHandover({ ...payload, inLeader: `${payload.inLeader || '接班负责人'}（重复提交）` })
  busy.value = false
  finishConfirm([first, second])
}

function finishConfirm(results: ReturnType<typeof confirmHandover>[]) {
  const lines: string[] = []
  let anyOk = false
  for (const result of results) {
    lines.push(result.ok ? `✓ ${result.message}` : `✗ ${result.message}`)
    if (result.ok) {
      anyOk = true
    }
  }
  // 并发模拟时一个成功一个冲突，整体按冲突警示呈现，提示后到者没落库。
  confirmResult.value = { ok: results.length === 1 && anyOk, text: lines.join('\n') }
  reload()
  if (anyOk && results.length === 1) {
    setTimeout(() => {
      confirmOpen.value = false
    }, 900)
  }
}

onMounted(reload)
</script>
