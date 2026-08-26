import { ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * 场景氛围：环境音（四区联动）/ 昼夜时辰。
 * 环境音默认关（依赖用户手势启动 AudioContext）；
 * phase 循环：day → dusk → night。
 */
export type DayPhase = 'day' | 'dusk' | 'night'
export const useSceneFxStore = defineStore('sceneFx', () => {
  const ambientOn = ref(false)
  const phase = ref<DayPhase>('day')
  function cyclePhase() {
    phase.value = phase.value === 'day' ? 'dusk' : phase.value === 'dusk' ? 'night' : 'day'
  }
  return { ambientOn, phase, cyclePhase }
})
