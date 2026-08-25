import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type MusicState = 'probing' | 'absent' | 'ready' | 'playing' | 'paused'

/** 候选音源：放入 public/media/audio/ 即自动生效（M4 选曲后归档 docs/audio-license/） */
const CANDIDATES = ['/media/audio/bgm-1.mp3', '/media/audio/bgm-1.ogg']
const VOLUME = 0.5
const FADE_MS = 800

async function probe(src: string): Promise<boolean> {
  try {
    const r = await fetch(src, { method: 'HEAD' })
    return r.ok
  } catch {
    return false
  }
}

export const useMusicStore = defineStore('music', () => {
  const state = ref<MusicState>('probing')
  const toast = ref('')
  let toastTimer = 0
  let audio: HTMLAudioElement | null = null
  let fadeRaf = 0
  let probed = false

  const playing = computed(() => state.value === 'playing')
  const ready = computed(() => state.value !== 'probing' && state.value !== 'absent')

  function showToast(msg: string) {
    toast.value = msg
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => (toast.value = ''), 2200)
  }

  function ensureAudio(src: string): HTMLAudioElement {
    if (audio && audio.dataset.src === src) return audio
    audio = new Audio(src)
    audio.dataset.src = src
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = 0
    audio.addEventListener('playing', () => {
      if (state.value !== 'playing') state.value = 'playing'
    })
    audio.addEventListener('pause', () => {
      if (state.value === 'playing') state.value = 'paused'
    })
    audio.addEventListener('error', () => {
      if (state.value !== 'absent') {
        state.value = 'absent'
        showToast('音源加载失败')
      }
    })
    return audio
  }

  function fadeTo(vol: number, ms: number) {
    cancelAnimationFrame(fadeRaf)
    const a = audio
    if (!a) return
    const from = a.volume
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      a.volume = from + (vol - from) * p
      if (p < 1) fadeRaf = requestAnimationFrame(tick)
    }
    fadeRaf = requestAnimationFrame(tick)
  }

  /** 启动时探测音源（可重复调用，仅首次生效） */
  async function boot() {
    if (probed) return
    probed = true
    for (const src of CANDIDATES) {
      if (await probe(src)) {
        ensureAudio(src)
        state.value = 'ready'
        return
      }
    }
    state.value = 'absent'
  }

  async function toggle() {
    if (state.value === 'probing') await boot()
    if (state.value === 'absent') {
      showToast('音源未就绪：public/media/audio/bgm-1.mp3')
      return
    }
    if (!audio) return
    if (state.value === 'playing') {
      fadeTo(0, FADE_MS)
      audio.pause()
      state.value = 'paused'
    } else {
      try {
        await audio.play()
        state.value = 'playing'
        fadeTo(VOLUME, FADE_MS)
      } catch {
        showToast('浏览器阻止了自动播放，再点一次试试')
      }
    }
  }

  return { state, playing, ready, toast, boot, toggle, showToast }
})
