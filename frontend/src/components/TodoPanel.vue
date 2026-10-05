<template>
  <section class="todo-panel">
    <header class="todo-head">
      <strong>{{ title }}</strong>
      <span class="todo-sub">交接确认后自动写入本页待办区，共 {{ openCount }} 项待办 / {{ items.length }} 项明细</span>
    </header>
    <p v-if="!checklists.length" class="todo-empty">暂无交接下发的{{ title }}，待班次负责人确认交接后自动出现。</p>
    <article v-for="checklist in checklists" :key="checklist.id" class="todo-checklist">
      <div class="todo-checklist-head">
        <span class="todo-tag">{{ checklist.id }}</span>
        <span>来源交接单 {{ checklist.handoverDate }} 班次</span>
        <span class="todo-count">{{ itemsOf(checklist.id).length }} 项</span>
        <RouterLink class="link" :to="{ path: '/', hash: `#${checklist.handoverId}` }">查看交接单</RouterLink>
      </div>
      <ul class="todo-items">
        <li v-for="item in itemsOf(checklist.id)" :key="item.id" :class="{ done: item.done }">
          <label>
            <input type="checkbox" :checked="item.done" @change="onToggle(item.id, ($event.target as HTMLInputElement).checked)" />
            <span class="todo-code">{{ item.sourceCode }}</span>
            <span class="todo-area" :class="{ missing: item.area === AREA_MISSING }">{{ item.area }}</span>
            <span class="todo-detail">{{ item.detail }}</span>
          </label>
        </li>
        <li v-if="!itemsOf(checklist.id).length" class="todo-empty">本清单无明细项（交接时该模块未决为 0，仍按规定留底建单）。</li>
      </ul>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { listTodos, toggleTodoItem } from '@/api/handover-service'
import { AREA_MISSING } from '@/data/area'
import type { TodoChecklist, TodoItem, TodoKey } from '@/data/handover-types'

const props = defineProps<{ todoKey: TodoKey; title: string }>()

const checklists = ref<TodoChecklist[]>([])
const items = ref<TodoItem[]>([])

const openCount = computed(() => items.value.filter((item) => !item.done).length)

function itemsOf(checklistId: string): TodoItem[] {
  return items.value.filter((item) => item.checklistId === checklistId)
}

function onToggle(itemId: string, done: boolean) {
  toggleTodoItem(itemId, done)
  reload()
}

function reload() {
  const payload = listTodos(props.todoKey)
  checklists.value = payload.checklists
  items.value = payload.items
}

onMounted(reload)
</script>

<style scoped>
.todo-panel {
  background: #fff8ec;
  border: 1px solid #e8c479;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.todo-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.todo-sub { font-size: 12px; color: var(--muted); }
.todo-empty { font-size: 12px; color: var(--muted); margin: 6px 0 0; list-style: none; }
.todo-checklist { margin-top: 8px; border-top: 1px dashed #e8c479; padding-top: 8px; }
.todo-checklist-head { display: flex; gap: 10px; align-items: center; font-size: 12px; color: var(--muted); flex-wrap: wrap; }
.todo-tag { background: #b45309; color: #fff; border-radius: 4px; padding: 1px 8px; font-size: 12px; }
.todo-count { font-weight: 600; color: #b45309; }
.todo-items { margin: 6px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.todo-items li { font-size: 13px; }
.todo-items label { display: flex; gap: 8px; align-items: baseline; }
.todo-code { font-weight: 600; min-width: 92px; }
.todo-area { font-size: 12px; color: #475569; min-width: 150px; }
.todo-area.missing { color: #b42318; }
.todo-detail { color: #334155; }
.todo-items li.done .todo-code,
.todo-items li.done .todo-detail { text-decoration: line-through; color: #94a3b8; }
</style>
