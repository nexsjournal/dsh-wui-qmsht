import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { characters } from '@/data'

/**
 * 「找画中人」玩法：给线索（职衔+小传+阵营），在长卷中找出对应人物。
 * 计分：10 铜钱底分 + 速度分（6s 内满 10）；点错 -2；连续答对连击 +1/题（上限 5）。
 * 进度持久化 localStorage（coins + 每人最佳用时）。
 */
const LS_KEY = 'qmsht.find.v1'

interface Persist {
  coins: number
  found: Record<string, number>
}

function load(): Persist {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Persist
      if (typeof p.coins === 'number' && p.found && typeof p.found === 'object') return p
    }
  } catch {
    /* 忽略损坏数据 */
  }
  return { coins: 0, found: {} }
}

export const useFindStore = defineStore('find', () => {
  const p = load()
  const active = ref(false)
  const currentId = ref<string | null>(null)
  const attempts = ref(0)
  const elapsed = ref(0)
  const coins = ref(p.coins)
  const found = ref<Record<string, number>>({ ...p.found })
  /** 本轮已答对，等结算 */
  const won = ref(false)
  const lastGain = ref(0)
  let streak = 0
  let timer = 0

  const foundCount = computed(() => Object.keys(found.value).length)
  const progress = computed(() => `${foundCount.value}/${characters.length}`)
  const streakBonus = streak

  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ coins: coins.value, found: found.value } satisfies Persist))
    } catch {
      /* 隐私模式等场景静默 */
    }
  }

  function nextTarget(exclude?: string | null): string {
    const pool = characters.filter((c) => c.id !== exclude)
    const unsolved = pool.filter((c) => !found.value[c.id])
    const list = unsolved.length ? unsolved : pool
    return list[Math.floor(Math.random() * list.length)].id
  }

  function start() {
    if (active.value) return
    active.value = true
    streak = 0
    roundNext()
  }

  function roundNext() {
    currentId.value = nextTarget(currentId.value)
    attempts.value = 0
    won.value = false
    lastGain.value = 0
    elapsed.value = 0
    window.clearInterval(timer)
    timer = window.setInterval(() => {
      if (!won.value) elapsed.value += 0.2
    }, 200)
  }

  function roundWin() {
    if (won.value || !currentId.value) return
    won.value = true
    window.clearInterval(timer)
    streak += 1
    const gain = 10 + Math.max(0, 10 - Math.floor(elapsed.value / 6)) + Math.min(5, streak - 1)
    lastGain.value = gain
    coins.value += gain
    const id = currentId.value
    found.value[id] = Math.min(found.value[id] ?? Infinity, Math.round(elapsed.value))
    persist()
  }

  function roundMiss() {
    if (won.value) return
    attempts.value += 1
    streak = 0
    coins.value = Math.max(0, coins.value - 2)
    persist()
  }

  function end() {
    active.value = false
    won.value = false
    currentId.value = null
    window.clearInterval(timer)
  }

  return {
    active,
    currentId,
    attempts,
    elapsed,
    coins,
    found,
    foundCount,
    progress,
    won,
    lastGain,
    streakBonus,
    start,
    end,
    roundNext,
    roundWin,
    roundMiss,
  }
})
