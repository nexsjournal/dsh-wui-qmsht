import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { world } from '@/data'

/**
 * 「一船之故」剧情任务线：9 章，每章在长卷中找到一个人物，
 * 完成即解锁一条关系边（图谱中金色高亮）。进度持久化 localStorage，可断点续读。
 */
const LS_KEY = 'qmsht.quest.v1'

export type QuestPhase = 'intro' | 'seeking' | 'reveal' | 'done'

interface Persist {
  stage: number
  /** 已解锁关系边（规范化 key：a|b，a<b） */
  unlocked: string[]
}

export function edgeKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

function load(): Persist {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Persist
      if (typeof p.stage === 'number' && Array.isArray(p.unlocked)) return p
    }
  } catch {
    /* 忽略损坏数据 */
  }
  return { stage: 0, unlocked: [] }
}

export const useQuestStore = defineStore('quest', () => {
  const p = load()
  const stages = world.quest
  const total = stages.length

  const active = ref(false)
  const stageIdx = ref(0)
  const phase = ref<QuestPhase>('intro')
  const missCount = ref(0)
  const unlocked = ref<Set<string>>(new Set(p.unlocked))

  const stage = computed(() => stages[stageIdx.value] ?? null)
  const progress = computed(() => `${Math.min(stageIdx.value + 1, total)}/${total}`)
  const unlockedList = computed(() => [...unlocked.value])

  function persist() {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ stage: stageIdx.value, unlocked: unlockedList.value } satisfies Persist),
      )
    } catch {
      /* 隐私模式等场景静默 */
    }
  }

  /** 进入案情页：有未完成进度则续读，已完成则从头再讲 */
  function start() {
    if (active.value) return
    active.value = true
    if (p.stage >= total) {
      stageIdx.value = 0
    } else {
      stageIdx.value = p.stage
    }
    phase.value = 'intro'
    missCount.value = 0
  }

  function end() {
    active.value = false
  }

  function beginSeeking() {
    phase.value = 'seeking'
    missCount.value = 0
  }

  /** 点中本章目标：解锁关系边，进入揭晓 */
  function onCorrect() {
    const st = stage.value
    if (!st || phase.value !== 'seeking') return
    unlocked.value.add(edgeKey(st.edge[0], st.edge[1]))
    phase.value = 'reveal'
    persist()
  }

  function onMiss() {
    if (phase.value !== 'seeking') return
    missCount.value += 1
  }

  function nextStage() {
    if (stageIdx.value + 1 >= total) {
      phase.value = 'done'
      persist()
      return
    }
    stageIdx.value += 1
    phase.value = 'intro'
    missCount.value = 0
    persist()
  }

  return {
    stages,
    total,
    active,
    stageIdx,
    phase,
    missCount,
    unlocked,
    stage,
    progress,
    unlockedList,
    start,
    end,
    beginSeeking,
    onCorrect,
    onMiss,
    nextStage,
  }
})
