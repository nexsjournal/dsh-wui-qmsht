<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { CameraRig, SCROLL_H, SCROLL_W } from '@/core/camera'
import { PanZoom } from '@/core/panzoom'
import { detectLowEnd, prefersReducedMotion } from '@/core/perf'
import { characters, charById, world } from '@/data'
import { useNavStore } from '@/stores/nav'
import MiniNav from '@/components/MiniNav.vue'

type Tier = 'low' | 'mid' | 'hi'
const TIER_N: Record<Tier, number> = { low: 1, mid: 4, hi: 8 }
const TIER_CAP: Record<Tier, number> = { low: 1, mid: 5, hi: 3 }

const nav = useNavStore()
const wrap = ref<HTMLElement>()
const stage = ref<HTMLElement>()
const lowImg = ref<HTMLImageElement>()
const midLayer = ref<HTMLElement>()
const hiLayer = ref<HTMLElement>()

const lowEnd = detectLowEnd()
const reduced = prefersReducedMotion()
// 低档（LCP 元素）与 index.html 静态 boot 图同 URL（roll-preview.webp），
// 浏览器解析 HTML 时即开始下载，Vue 挂载后命中缓存无缝接管。
// 人物指引默认开启：红点+名牌一开始就可见，用户可手动关闭
const guideOn = ref(true)
const hoverId = ref<string | null>(null)
const selectedId = ref<string | null>(null)
const miniNav = ref<InstanceType<typeof MiniNav> | null>(null)
// z 分档（0: <1.5 / 1: ≥1.5）——rig.z 非响应式，需在 rAF 循环里跨档时写回
const zBand = ref(0)
const named = computed(() => guideOn.value || zBand.value === 1)

let rig!: CameraRig
let pz!: PanZoom
let ro: ResizeObserver | null = null
let rafId = 0
let activeTier: Tier = 'low'
let lastTry = 0
const tileMap: Record<'mid' | 'hi', Map<number, HTMLImageElement>> = { mid: new Map(), hi: new Map() }

function tierOf(z: number): Tier {
  if (z < 1.7) return 'low'
  if (z < 2.7) return 'mid'
  return lowEnd ? 'mid' : 'hi'
}

function ensureTiles(tier: Tier): boolean {
  if (tier === 'low') return lowImg.value ? lowImg.value.complete && lowImg.value.naturalWidth > 0 : false
  const n = TIER_N[tier]
  const layer = tier === 'mid' ? midLayer.value : hiLayer.value
  if (!layer) return false
  const [x0, x1] = rig.visibleXRange()
  const margin = (x1 - x0) * 0.3
  const i0 = Math.max(0, Math.floor(((x0 - margin) / SCROLL_W) * n))
  const i1 = Math.min(n - 1, Math.floor(((x1 + margin) / SCROLL_W) * n))
  let ready = true
  for (let i = i0; i <= i1; i++) {
    let img = tileMap[tier].get(i)
    if (!img) {
      img = document.createElement('img')
      img.draggable = false
      img.decoding = 'async'
      img.alt = ''
      img.className = 'tile'
      img.style.cssText = `left:${(100 * i) / n}%;width:${100 / n}%;`
      layer.appendChild(img)
      tileMap[tier].set(i, img)
    }
    if (!img.dataset.loaded) {
      img.onload = () => {
        img.dataset.loaded = '1'
        img.classList.add('ready')
      }
      img.onerror = () => img.classList.add('failed')
      img.src = `/media/scroll/${tier}/${i}.webp`
    }
    if (!img.dataset.loaded) ready = false
  }
  lru(tier, i0, i1)
  return ready
}

function lru(tier: 'mid' | 'hi', i0: number, i1: number) {
  const map = tileMap[tier]
  if (map.size <= TIER_CAP[tier]) return
  const [x0, x1] = rig.visibleXRange()
  const cx = (x0 + x1) / 2
  const entries = [...map.entries()].filter(([i]) => i < i0 - 1 || i > i1 + 1)
  entries.sort((a, b) => Math.abs(b[0] * SCROLL_W - cx) - Math.abs(a[0] * SCROLL_W - cx))
  while (map.size > TIER_CAP[tier] && entries.length) {
    const [i, img] = entries.shift()!
    img.src = ''
    img.remove()
    map.delete(i)
  }
}

function setTier(t: Tier) {
  lowImg.value?.classList.toggle('on', t === 'low')
  midLayer.value?.classList.toggle('on', t === 'mid')
  hiLayer.value?.classList.toggle('on', t === 'hi')
  activeTier = t
}

let lastInv = -1
function loop() {
  const z = rig.z
  // 名牌显隐分档：跨 1.5 阈值时写回响应式
  const band = z >= 1.5 ? 1 : 0
  if (band !== zBand.value) zBand.value = band
  const target = tierOf(z)
  if (target !== activeTier) {
    if (ensureTiles(target)) setTier(target)
    else if (performance.now() - lastTry > 200) {
      lastTry = performance.now()
      ensureTiles(target)
    }
  } else if (target !== 'low') {
    ensureTiles(target)
  }
  // 迷你导航条视口框
  const [mx0, mx1] = rig.visibleXRange()
  miniNav.value?.update(mx0, mx1)
  // 锚点反向缩放：屏幕尺寸恒定
  const inv = 1 / rig.cam.scale
  if (Math.abs(inv - lastInv) / inv > 0.002) {
    stage.value?.style.setProperty('--inv', inv.toFixed(4))
    lastInv = inv
  }
  rafId = requestAnimationFrame(loop)
}

/** 屏幕坐标 → 命中最近锚点（半径 r 像素） */
function hitTest(x: number, y: number, r: number): string | null {
  const s = rig.cam.scale
  let best: string | null = null
  let bestD = r
  for (const c of characters) {
    const dx = c.pos.x * SCROLL_W * s + rig.cam.x - x
    const dy = c.pos.y * SCROLL_H * s + rig.cam.y - y
    const d = Math.hypot(dx, dy)
    if (d < bestD) {
      bestD = d
      best = c.id
    }
  }
  return best
}

function onTap(x: number, y: number) {
  const id = hitTest(x, y, 32)
  if (id) select(id)
}

function select(id: string) {
  selectedId.value = id
  nav.push(id)
}

// 桌面 hover
let mouseRaf = 0
function onHover(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return
  if (mouseRaf) return
  mouseRaf = requestAnimationFrame(() => {
    mouseRaf = 0
    if (nav.detail) return
    const r = wrap.value!.getBoundingClientRect()
    hoverId.value = hitTest(e.clientX - r.left, e.clientY - r.top, 28)
  })
}

let highlightTimer = 0
function highlight(id: string) {
  const c = charById.get(id)
  if (!c) return
  selectedId.value = id
  window.clearTimeout(highlightTimer)
  highlightTimer = window.setTimeout(() => (selectedId.value = null), 2600)
}

function onLandmark(l: { pos: { x: number; y: number } }) {
  rig.centerOn(l.pos, Math.max(rig.z, 1.3), reduced ? 0 : 650)
}

onMounted(() => {
  rig = new CameraRig(stage.value!)
  rig.maxZ = lowEnd ? 3 : 4
  rig.rubber = lowEnd ? 24 : 40
  rig.resize(wrap.value!.clientWidth, wrap.value!.clientHeight)
  rig.initView()
  ro = new ResizeObserver(() => rig.resize(wrap.value!.clientWidth, wrap.value!.clientHeight))
  ro.observe(wrap.value!)

  pz = new PanZoom(wrap.value!, rig, {
    onTap,
    onDoubleTap: (x, y) => {
      if (rig.z > 1.9) rig.zoomTo(1, undefined, reduced ? 0 : 450)
      else rig.zoomTo(2.2, { x, y }, reduced ? 0 : 450)
    },
    // Esc 由顶层 DetailView 独占处理（详情打开时）；无详情时无需动作
    onSettle: () => {
      if (!rig.inBounds()) {
        const s = rig.cam.scale
        rig.flyTo(
          {
            x: Math.min(0, Math.max(rig.vw - SCROLL_W * s, rig.cam.x)),
            y: Math.min(0, Math.max(rig.vh - SCROLL_H * s, rig.cam.y)),
            scale: s,
          },
          300,
        )
      }
    },
  })
  wrap.value!.addEventListener('pointermove', onHover)
  rafId = requestAnimationFrame(loop)

  // LCP boot 图：全览档就绪后移除（避免双份渲染开销）
  const li = lowImg.value
  const hideBoot = () => document.getElementById('boot-scroll')?.remove()
  if (li) {
    if (li.complete && li.naturalWidth > 0) hideBoot()
    else li.addEventListener('load', hideBoot, { once: true })
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  pz?.dispose()
  ro?.disconnect()
  wrap.value?.removeEventListener('pointermove', onHover)
  for (const t of ['mid', 'hi'] as const) {
    for (const [, img] of tileMap[t]) img.remove()
    tileMap[t].clear()
  }
})

/** 详情「在画卷中查看」：镜头飞行 + 锚点高亮 */
defineExpose({
  focusCharacter: (id: string) => {
    const c = charById.get(id)
    if (!c) return
    rig.centerOn(c.pos, Math.max(rig.z, 2), reduced ? 0 : 650)
    highlight(id)
  },
})
</script>

<template>
  <div ref="wrap" class="roll-view">
    <div ref="stage" class="stage" :class="{ named }">
      <img
        ref="lowImg"
        class="layer layer-low on"
        src="/media/scroll/roll-preview.webp"
        alt="清明上河图"
        draggable="false"
        fetchpriority="high"
      />
      <div ref="midLayer" class="layer layer-tiles"></div>
      <div ref="hiLayer" class="layer layer-tiles"></div>

      <!-- 地标浮标 -->
      <div class="landmarks">
        <button
          v-for="l in world.landmarks"
          :key="l.id"
          class="landmark"
          :style="{ left: l.pos.x * 4206 + 'px', top: l.pos.y * 1733 + 'px' }"
          :title="l.hint"
          @pointerdown.stop
          @click="onLandmark(l)"
        >
          {{ l.name }}
        </button>
      </div>

      <!-- 角色锚点 -->
      <div class="anchors">
        <div
          v-for="c in characters"
          :key="c.id"
          class="anchor"
          :data-id="c.id"
          :class="{ hovered: hoverId === c.id, selected: selectedId === c.id }"
          :style="{ left: c.pos.x * 4206 + 'px', top: c.pos.y * 1733 + 'px' }"
        >
          <span class="dot"></span>
          <span class="ring" aria-hidden="true"></span>
          <span class="plate">{{ c.name }}</span>
        </div>
      </div>
    </div>

    <div class="title-corner">
      <span class="tc-main">清明上河图</span>
      <span class="tc-sub">众生图鉴</span>
      <button class="guide-btn" :class="{ on: guideOn }" @click="guideOn = !guideOn">
        <span class="g-dot"></span>人物指引
      </button>
    </div>
    <MiniNav
      ref="miniNav"
      :on-get-cam-x="() => rig.cam.x"
      :on-pan-x="(x: number) => {
        rig.cam.x = x
        rig.clamp()
        rig.apply()
      }"
      :on-interrupt="() => pz.interrupt()"
    />
    <div class="zoom-hint" aria-hidden="true">拖曳展卷 · 双指细看 · 点人物识人</div>
  </div>
</template>

<style scoped>
.roll-view {
  position: absolute;
  inset: 0 0 calc(var(--tabbar-h) + var(--safe-b)) 0;
  overflow: hidden;
  cursor: grab;
}
.roll-view:active {
  cursor: grabbing;
}

.stage {
  position: absolute;
  left: 0;
  top: 0;
  width: 4206px;
  height: 1733px;
  background: var(--night-2);
  contain: layout paint;
  --inv: 1;
}

.layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.15s linear;
}
.layer.on {
  opacity: 1;
}
.layer-low {
  object-fit: fill;
  display: block;
}
.tile {
  position: absolute;
  top: 0;
  height: 100%;
  object-fit: fill;
  opacity: 0;
  transition: opacity 0.15s linear;
  display: block;
}
.tile.ready {
  opacity: 1;
}
.tile.failed {
  display: none;
}

/* ============ 锚点 ============ */
.anchors {
  position: absolute;
  inset: 0;
  z-index: 4;
}
.anchor {
  position: absolute;
  width: 44px;
  height: 44px;
  transform: scale(var(--inv)) translate(-50%, -50%);
  cursor: pointer;
}
/* 红点：朱砂实心 + 米白描边（古画背景上高对比），呼吸缩放提示可点 */
.anchor .dot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 12px;
  height: 12px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 2px solid rgba(244, 237, 224, 0.95);
  background: rgba(176, 58, 46, 0.92);
  box-shadow: 0 0 8px rgba(176, 58, 46, 0.8);
  animation: dot-breathe 2.6s ease-in-out infinite;
}
@keyframes dot-breathe {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    transform: translate(-50%, -50%) scale(1.22);
  }
}
/* 呼吸圈：常开的扩散光晕，与红点同频，远处也能扫到可点位置 */
.anchor .ring {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 12px;
  height: 12px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 2px solid rgba(176, 58, 46, 0.8);
  animation: dot-pulse 2.6s ease-out infinite;
  pointer-events: none;
}
@keyframes dot-pulse {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.75;
  }
  65%,
  100% {
    transform: translate(-50%, -50%) scale(2.8);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .anchor .dot,
  .anchor .ring {
    animation: none;
  }
  .anchor .ring {
    opacity: 0.4;
  }
}
.anchor.selected .ring {
  animation: ink-ring 1.1s var(--ease-ink) infinite;
}
@keyframes ink-ring {
  0% {
    transform: translate(-50%, -50%) scale(0.4);
    opacity: 0.8;
  }
  100% {
    transform: translate(-50%, -50%) scale(3.2);
    opacity: 0;
  }
}
.anchor.selected .dot {
  background: var(--cinnabar);
  animation: none;
}
.anchor.hovered .dot {
  animation: none;
  transform: translate(-50%, -50%) scale(1.5);
  background: rgba(176, 58, 46, 0.95);
}
.anchor .plate {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  writing-mode: vertical-rl;
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 2px;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--panel-line);
  padding: 5px 3px;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.25s var(--ease-ink);
  pointer-events: none;
}
.stage.named .anchor .plate,
.anchor.hovered .plate,
.anchor.selected .plate {
  opacity: 1;
}
.anchor.selected .plate {
  border-color: var(--cinnabar);
  box-shadow: 0 0 12px rgba(176, 58, 46, 0.35);
}

/* ============ 地标浮标 ============ */
.landmarks {
  position: absolute;
  inset: 0;
  z-index: 3;
}
.landmark {
  position: absolute;
  transform: scale(var(--inv)) translate(-50%, -100%);
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 2px;
  color: rgba(232, 224, 208, 0.75);
  background: rgba(27, 26, 23, 0.5);
  border: 1px solid rgba(201, 169, 106, 0.3);
  padding: 2px 8px;
  opacity: 0.6;
  transition: opacity 0.25s var(--ease-ink), transform 0.25s var(--ease-ink);
  cursor: pointer;
}
.landmark::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  width: 1px;
  height: 12px;
  background: rgba(201, 169, 106, 0.4);
}
.landmark:hover {
  opacity: 1;
}

/* ============ 标题角 ============ */
.title-corner {
  position: absolute;
  top: calc(14px + env(safe-area-inset-top, 0px));
  left: 16px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-display);
  color: rgba(232, 224, 208, 0.75);
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
}
.tc-main {
  font-size: 22px;
  letter-spacing: 4px;
}
.tc-sub {
  font-size: 12px;
  letter-spacing: 3px;
  color: var(--gold);
  border: 1px solid rgba(201, 169, 106, 0.4);
  padding: 1px 6px;
}
.guide-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  letter-spacing: 1px;
  font-family: var(--font-display);
  color: var(--text-2);
  border: 1px solid rgba(201, 169, 106, 0.3);
  background: var(--panel);
  padding: 3px 10px;
  transition: all 0.25s var(--ease-ink);
}
.guide-btn .g-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid var(--cinnabar);
}
.guide-btn.on {
  color: var(--text);
  border-color: var(--cinnabar);
}
.guide-btn.on .g-dot {
  background: var(--cinnabar);
}

.zoom-hint {
  position: absolute;
  left: 50%;
  bottom: 48px;
  transform: translateX(-50%);
  z-index: 6;
  pointer-events: none;
  font-size: 12px;
  letter-spacing: 2px;
  color: rgba(232, 224, 208, 0.55);
  background: var(--panel);
  border: 1px solid var(--panel-line);
  padding: 4px 14px;
  animation: hint-fade 8s var(--ease-ink) forwards;
}
@keyframes hint-fade {
  0%,
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@media (min-width: 1024px) {
  .tc-main {
    font-size: 28px;
  }
}
</style>
