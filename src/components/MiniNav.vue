<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { SCROLL_W } from '@/core/camera'

/**
 * 迷你导航条：长卷缩略 + 当前视口框 + 可拖手柄 + 地标刻度。
 * 由 RollView 的 rAF 循环调用 update() 直写 DOM（零响应式开销）。
 */
const root = ref<HTMLElement>()
const strip = ref<HTMLDivElement>()
const vpBox = ref<HTMLDivElement>()
const thumb = ref<HTMLImageElement>()

let dragging = false
let dragStartX = 0
let dragStartCamX = 0

/** @param x0/x1 当前视口覆盖的画布 x 范围（画布坐标） */
function update(x0: number, x1: number) {
  const el = strip.value
  const box = vpBox.value
  if (!el || !box) return
  const w = el.clientWidth
  if (w <= 0) return
  const k = w / SCROLL_W
  const left = Math.max(0, x0 * k)
  const right = Math.min(w, x1 * k)
  box.style.left = left + 'px'
  box.style.width = Math.max(6, right - left) + 'px'
}

function onDown(e: PointerEvent) {
  dragging = true
  dragStartX = e.clientX
  dragStartCamX = props.onGetCamX()
  props.onInterrupt?.()
  strip.value?.setPointerCapture(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!dragging) return
  const w = strip.value?.clientWidth ?? 1
  const dCanvas = ((e.clientX - dragStartX) / w) * SCROLL_W
  props.onPanX(dragStartCamX - dCanvas)
}
function onUp() {
  dragging = false
}

const props = defineProps<{
  onGetCamX: () => number
  onPanX: (camX: number) => void
  onInterrupt?: () => void
}>()

onMounted(() => {
  strip.value?.addEventListener('pointerdown', onDown)
  strip.value?.addEventListener('pointermove', onMove)
  strip.value?.addEventListener('pointerup', onUp)
  strip.value?.addEventListener('pointercancel', onUp)
})
onBeforeUnmount(() => {
  strip.value?.removeEventListener('pointerdown', onDown)
  strip.value?.removeEventListener('pointermove', onMove)
  strip.value?.removeEventListener('pointerup', onUp)
  strip.value?.removeEventListener('pointercancel', onUp)
})

defineExpose({ update })
</script>

<template>
  <div ref="root" class="mini-nav" role="navigation" aria-label="长卷导航">
    <div ref="strip" class="mn-strip" data-no-pan>
      <img ref="thumb" class="mn-thumb" src="/media/thumb/roll-map.webp" alt="" draggable="false" />
      <div class="mn-ticks" aria-hidden="true">
        <i v-for="t in [0.05, 0.2, 0.42, 0.6, 0.85, 0.97]" :key="t" :style="{ left: t * 100 + '%' }"></i>
      </div>
      <div ref="vpBox" class="mn-vp"></div>
    </div>
  </div>
</template>

<style scoped>
.mini-nav {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  z-index: 6;
  width: min(72vw, 560px);
  pointer-events: auto;
}
.mn-strip {
  position: relative;
  height: 30px;
  border-radius: 3px;
  overflow: hidden;
  background: rgba(27, 26, 23, 0.55);
  border: 1px solid rgba(201, 169, 106, 0.28);
  cursor: ew-resize;
  touch-action: none;
}
.mn-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 0.85;
  pointer-events: none;
}
.mn-ticks i {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(201, 169, 106, 0.3);
  pointer-events: none;
}
.mn-vp {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(176, 58, 46, 0.18);
  border: 1px solid var(--cinnabar);
  border-radius: 2px;
  pointer-events: none;
  transition: none;
}
@media (max-width: 640px) {
  .mini-nav {
    width: 64vw;
  }
  .mn-strip {
    height: 24px;
  }
}
</style>
