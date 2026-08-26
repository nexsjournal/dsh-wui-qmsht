<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { SCROLL_W } from '@/core/camera'

/**
 * 迷你导航条：长卷缩略 + 当前视口框 + 可拖手柄 + 场景分段。
 * 由 RollView 的 rAF 循环调用 update() 直写 DOM（零响应式开销）。
 * 点按条上位置 = 镜头飞行到该处（拖拽仍为平移）。
 */
export interface MiniNavScene {
  name: string
  xRange: [number, number]
}

const props = defineProps<{
  onGetCamX: () => number
  onPanX: (camX: number) => void
  onInterrupt?: () => void
  onTapX?: (canvasX: number) => void
  scenes: MiniNavScene[]
}>()

const root = ref<HTMLElement>()
const strip = ref<HTMLDivElement>()
const vpBox = ref<HTMLDivElement>()
const thumb = ref<HTMLImageElement>()

let dragging = false
let dragStartX = 0
let dragStartCamX = 0
let downT = 0
let downMoved = 0
let activeIdx = -1

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
  // 当前场景高亮
  const cx = (x0 + x1) / 2
  const idx = props.scenes.findIndex((s) => cx >= s.xRange[0] && cx <= s.xRange[1])
  if (idx !== activeIdx) {
    activeIdx = idx
    el.querySelectorAll<HTMLElement>('.mn-scene').forEach((n, i) =>
      n.classList.toggle('active', i === idx),
    )
  }
}

function onDown(e: PointerEvent) {
  dragging = true
  downMoved = 0
  downT = performance.now()
  dragStartX = e.clientX
  dragStartCamX = props.onGetCamX()
  props.onInterrupt?.()
  strip.value?.setPointerCapture(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!dragging) return
  downMoved = Math.max(downMoved, Math.abs(e.clientX - dragStartX))
  const w = strip.value?.clientWidth ?? 1
  const dCanvas = ((e.clientX - dragStartX) / w) * SCROLL_W
  props.onPanX(dragStartCamX - dCanvas)
}
function onUp(e: PointerEvent) {
  const wasTap = downMoved < 8 && performance.now() - downT < 260
  dragging = false
  if (wasTap && props.onTapX) {
    const r = strip.value!.getBoundingClientRect()
    props.onTapX(((e.clientX - r.left) / r.width) * SCROLL_W)
  }
}

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
      <div class="mn-scenes" aria-hidden="true">
        <span
          v-for="(s, i) in scenes"
          :key="i"
          class="mn-scene"
          :style="{ left: s.xRange[0] * 100 + '%', width: (s.xRange[1] - s.xRange[0]) * 100 + '%' }"
        >
          {{ s.name }}
        </span>
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
/* 场景分段：边界线 + 段名 */
.mn-scenes {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.mn-scene {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px solid rgba(201, 169, 106, 0.4);
  font-family: var(--font-display);
  font-size: 10px;
  letter-spacing: 1px;
  line-height: 28px;
  padding-left: 4px;
  color: rgba(232, 224, 208, 0.55);
  white-space: nowrap;
  overflow: hidden;
  transition: color 0.25s var(--ease-ink), background 0.25s var(--ease-ink);
}
.mn-scene.active {
  color: var(--text);
  background: rgba(176, 58, 46, 0.14);
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
  .mn-scene {
    line-height: 22px;
    font-size: 9px;
  }
}
</style>
