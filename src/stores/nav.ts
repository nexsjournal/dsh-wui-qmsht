import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type Mode = 'roll' | 'graph'

/**
 * 3 态导航：roll / graph + detail 覆盖层栈。
 * 不用 vue-router：只有 3 种页面形态，自研栈可精确控制
 * 「详情覆盖层 + 关系跳转栈 + 浏览器返回键」。
 */
export const useNavStore = defineStore('nav', () => {
  const mode = ref<Mode>('roll')
  const detailStack = ref<string[]>([])
  const detail = computed(() => detailStack.value[detailStack.value.length - 1] ?? null)

  function setMode(m: Mode) {
    mode.value = m
  }
  function push(id: string) {
    if (detailStack.value.length >= 20) detailStack.value.shift()
    detailStack.value.push(id)
  }
  function pop(): string | null {
    return detailStack.value.pop() ?? null
  }
  function closeAll() {
    detailStack.value = []
  }
  /** 切到图谱并把某角色设为「焦点」 */
  const graphFocus = ref<string | null>(null)
  function focusInGraph(id: string) {
    mode.value = 'graph'
    graphFocus.value = id
  }

  return { mode, detailStack, detail, graphFocus, setMode, push, pop, closeAll, focusInGraph }
})
