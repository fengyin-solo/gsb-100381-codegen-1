<template>
  <section class="todo-panel" :class="`todo-${module}`">
    <header class="todo-head">
      <div>
        <h3>{{ title }}</h3>
        <p class="todo-sub">由各班次负责人确认交接时写入，完成后可在本条清单上销项。</p>
      </div>
      <span class="todo-count">{{ openTodos.length }} 张未销项 / 共 {{ todos.length }} 张</span>
    </header>

    <p v-if="!todos.length" class="todo-empty">暂无交接清单，待班次负责人确认交接后会写到这里。</p>

    <article v-for="todo in todos" :key="todo.id" class="todo-card" :class="{ done: todo.done }">
      <div class="todo-card-head">
        <span class="todo-badge">{{ kindLabel(todo.kind) }}</span>
        <strong>{{ todo.title }}</strong>
        <span class="todo-state" :class="todo.done ? 'is-done' : 'is-open'">
          {{ todo.done ? '已销项' : '待处理' }}
        </span>
      </div>
      <p class="todo-detail">{{ todo.detail }}</p>
      <ul v-if="todo.itemRefs.length" class="todo-refs">
        <li v-for="code in todo.itemRefs" :key="code">{{ code }}</li>
      </ul>
      <p v-else class="todo-empty-line">本班次该模块无未决记录，清单留存备查。</p>
      <footer class="todo-card-foot">
        <span>来源：{{ todo.sourceCode }} · {{ todo.sourceDate }}</span>
        <span v-if="todo.done" class="todo-done-at">销项时间 {{ formatTime(todo.doneAt) }}</span>
        <button
          v-else
          class="link"
          type="button"
          @click="$emit('complete', todo.id)"
        >
          完成销项
        </button>
      </footer>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import type { HandoverTodo } from '@/data/types'

const props = defineProps<{
  module: HandoverTodo['module']
  title: string
  todos: HandoverTodo[]
}>()

defineEmits<{
  (event: 'complete', id: number): void
}>()

const openTodos = computed(() => props.todos.filter((todo) => !todo.done))

function kindLabel(kind: HandoverTodo['kind']): string {
  return kind === 'review' ? '遗物复核' : '浮选送检'
}

function formatTime(stamp?: string): string {
  if (!stamp) {
    return ''
  }
  return stamp.replace('T', ' ').slice(0, 16)
}
</script>
