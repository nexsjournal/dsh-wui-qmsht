import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type Mode = 'roll' | 'graph' | 'find' | 'story' | 'poem'

/**
 * 多态导航：roll / graph / find（寻人玩法，复用长卷镜头）+ detail 覆盖层栈。
 * 不用 vue-router：页面形态少，自研栈可精确控制
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
  /** 切到展卷并把某角色设为「焦点」（诗韵页「诗中之人」跳转用；src 记来源，如诗题） */
  const rollFocus = ref<{ id: string; src?: string } | null>(null)
  function focusInRoll(id: string, src?: string) {
    mode.value = 'roll'
    rollFocus.value = { id, src }
  }

  return { mode, detailStack, detail, graphFocus, rollFocus, setMode, push, pop, closeAll, focusInGraph, focusInRoll }
})
