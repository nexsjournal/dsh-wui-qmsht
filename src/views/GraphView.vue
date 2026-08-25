<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CameraRig } from '@/core/camera'
import { PanZoom } from '@/core/panzoom'
import { GRAPH_H, GRAPH_W, layoutGraph, SCENE_CENTERS, type GNode } from '@/core/graph-layout'
import { characters, factionById, relations, world, RELATION_TYPE_META } from '@/data'
import { useNavStore } from '@/stores/nav'
import { prefersReducedMotion } from '@/core/perf'
import WorldView from '@/views/WorldView.vue'

const nav = useNavStore()
const reduced = prefersReducedMotion()

const wrap = ref<HTMLElement>()
const viewport = ref<SVGGElement>()
const svgEl = ref<SVGSVGElement>()

const layout = ref(layoutGraph())
const { nodes, links, relax } = layout.value
const sceneXY = (id: string) => SCENE_CENTERS[id as keyof typeof SCENE_CENTERS] ?? { x: 0, y: 0 }

let rig!: CameraRig
let pz!: PanZoom
let ro: ResizeObserver | null = null

const query = ref('')
const factionSel = ref<string | null>(null)
const typeSel = ref<string | null>(null)
const hoverNode = ref<GNode | null>(null)
const focusId = ref<string | null>(null)
const showWorld = ref(false)

/** 筛选命中的节点集合（null = 无筛选） */
const matched = computed<Set<string> | null>(() => {
  const q = query.value.trim()
  const f = factionSel.value
  const t = typeSel.value
  if (!q && !f && !t) return null
  const byType = new Set<string>()
  if (t) for (const r of relations) if (r.type === t) { byType.add(r.from); byType.add(r.to) }
  const set = new Set<string>()
  for (const c of characters) {
    const okQ = !q || c.name.includes(q) || c.title.includes(q)
    const okF = !f || c.faction === f
    const okT = !t || byType.has(c.id)
    if (okQ && okF && okT) set.add(c.id)
  }
  return set
})
const isDim = (id: string) => matched.value !== null && !matched.value.has(id)

function nodeScreen(n: GNode) {
  return { x: (n.x ?? 0) * rig.cam.scale + rig.cam.x, y: (n.y ?? 0) * rig.cam.scale + rig.cam.y }
}

function linkPath(l: (typeof links)[number]) {
  const s = l.source as GNode
  const t = l.target as GNode
  const mx = ((s.x ?? 0) + (t.x ?? 0)) / 2
  const my = ((s.y ?? 0) + (t.y ?? 0)) / 2
  const dx = (t.x ?? 0) - (s.x ?? 0)
  const dy = (t.y ?? 0) - (s.y ?? 0)
  const len = Math.hypot(dx, dy) || 1
  const off = Math.min(30, len * 0.12)
  return `M ${s.x} ${s.y} Q ${mx - (dy / len) * off} ${my + (dx / len) * off} ${t.x} ${t.y}`
}

// 节点拖拽 / 点击
let dragNode: GNode | null = null
let dragMoved = false
let dragStart = { x: 0, y: 0 }

function toCanvas(sx: number, sy: number) {
  const r = wrap.value!.getBoundingClientRect()
  return { x: (sx - r.left - rig.cam.x) / rig.cam.scale, y: (sy - r.top - rig.cam.y) / rig.cam.scale }
}

function onNodeDown(e: PointerEvent, n: GNode) {
  e.stopPropagation()
  dragNode = n
  dragMoved = false
  dragStart = { x: e.clientX, y: e.clientY }
  // 捕获在 svg 上，使 move/up 仍派发回 svg（wrap 的 PanZoom 已被 stopPropagation 拦下）
  svgEl.value?.setPointerCapture(e.pointerId)
}
function onNodeMove(e: PointerEvent) {
  if (!dragNode) return
  if (!dragMoved && Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) < 8) return
  dragMoved = true
  const p = toCanvas(e.clientX, e.clientY)
  dragNode.fx = dragNode.x = p.x
  dragNode.fy = dragNode.y = p.y
}
function onNodeUp(e: PointerEvent) {
  if (!dragNode) return
  const n = dragNode
  dragNode = null
  if (dragMoved) {
    n.fx = undefined
    n.fy = undefined
    relax(n, 30)
  } else {
    nav.push(n.id)
  }
}

function onNodeHover(n: GNode | null) {
  hoverNode.value = n
}

/** 详情「在图谱中查看」→ 飞行定位 + 高亮 */
let mounted = false
function applyFocusSafe() {
  if (!mounted || !rig) return
  applyFocus()
}
function applyFocus() {
  if (!mounted) return
  const id = nav.graphFocus
  if (!id) return
  const n = nodes.find((x) => x.id === id)
  if (!n) return
  nav.graphFocus = null
  const scale = Math.max(rig.cam.scale, rig.baseScale * 1.6)
  rig.centerCanvas(n.x!, n.y!, scale, reduced ? 0 : 650)
  focusId.value = id
  window.setTimeout(() => {
    if (focusId.value === id) focusId.value = null
  }, 2600)
}

onMounted(() => {
  rig = new CameraRig(viewport.value!, GRAPH_W, GRAPH_H)
  rig.minZ = 0.3
  rig.maxZ = 4
  rig.resize(wrap.value!.clientWidth, wrap.value!.clientHeight)
  rig.fitView()
  ro = new ResizeObserver(() => rig.resize(wrap.value!.clientWidth, wrap.value!.clientHeight))
  ro.observe(wrap.value!)

  pz = new PanZoom(wrap.value!, rig, {
    onDoubleTap: (x, y) => {
      if (rig.z > 1.4) rig.zoomTo(1, undefined, reduced ? 0 : 450)
      else rig.zoomTo(2, { x, y }, reduced ? 0 : 450)
    },
    onEscape: () => {
      // 详情打开时 Esc 由 DetailView 独占；这里只处理世界书页
      if (showWorld.value) showWorld.value = false
    },
  })

  mounted = true
  applyFocus()
  // 详情「在图谱中查看」可能发生在图谱已挂载之后
  watch(() => nav.graphFocus, (id) => {
    if (id) applyFocusSafe()
  })
})
onBeforeUnmount(() => {
  pz?.dispose()
  ro?.disconnect()
})
</script>

<template>
  <div ref="wrap" class="graph-view">
    <!-- 顶部筛选栏 -->
    <div class="gv-top">
      <div class="gv-title">人物图谱</div>
      <div class="gv-tools">
        <input v-model="query" class="gv-search" type="search" placeholder="搜名号 / 职衔" aria-label="搜索角色" />
        <button class="gv-world" @click="showWorld = true">世界</button>
      </div>
    </div>
    <div class="gv-filters">
      <button
        class="gv-chip"
        :class="{ on: factionSel === null }"
        @click="factionSel = null"
      >
        全部
      </button>
      <button
        v-for="f in world.factions"
        :key="f.id"
        class="gv-chip"
        :class="{ on: factionSel === f.id }"
        :style="factionSel === f.id ? { borderColor: f.color, color: f.color } : {}"
        @click="factionSel = factionSel === f.id ? null : f.id"
      >
        <i :style="{ background: f.color }"></i>{{ f.name }}
      </button>
      <span class="gv-sep"></span>
      <button
        v-for="(meta, t) in RELATION_TYPE_META"
        :key="t"
        class="gv-chip"
        :class="{ on: typeSel === t }"
        :style="typeSel === t ? { borderColor: meta.color, color: meta.color } : {}"
        @click="typeSel = typeSel === t ? null : t"
      >
        {{ meta.name }}
      </button>
    </div>

    <!-- 图谱画布（指针捕获在 wrap 上，move/up 监听也放 wrap） -->
    <svg ref="svgEl" class="gv-svg" @pointermove="onNodeMove" @pointerup="onNodeUp" @pointercancel="onNodeUp">
      <g ref="viewport">
        <!-- 场景水印 -->
        <text v-for="s in world.scenes" :key="s.id" class="gv-watermark" :x="sceneXY(s.id).x" :y="sceneXY(s.id).y - 200">
          {{ s.name }}
        </text>

        <!-- 关系边 -->
        <g>
          <path
            v-for="l in links"
            :key="l.rel.from + l.rel.to"
            class="gv-edge"
            :class="{ dim: isDim((l.rel.from as string)) || isDim(l.rel.to as string) }"
            :stroke="RELATION_TYPE_META[l.rel.type].color"
            :stroke-dasharray="l.rel.type === 'companion' ? '7 5' : l.rel.type === 'crowd' ? '2 5' : 'none'"
            :d="linkPath(l)"
          >
            <title>{{ l.rel.label }} · {{ l.rel.note }}</title>
          </path>
        </g>

        <!-- 节点 -->
        <g
          v-for="n in nodes"
          :key="n.id"
          class="gv-node"
          :class="{ dim: isDim(n.id), focus: focusId === n.id }"
          :transform="`translate(${n.x}, ${n.y})`"
          @pointerdown="onNodeDown($event, n)"
          @pointerenter="onNodeHover(n)"
          @pointerleave="onNodeHover(null)"
        >
          <circle r="62" class="gv-hit" />
          <circle class="gv-focus-ring" r="34" />
          <circle class="gv-halo" :r="n.r + 12" :stroke="factionById.get(n.char.faction)?.color" />
          <circle class="gv-body" :r="n.r" :fill="factionById.get(n.char.faction)?.color" />
          <text class="gv-char" dy="0.34em">{{ n.char.name[0] }}</text>
          <text class="gv-label" :y="n.r + 22">{{ n.char.name }}</text>
        </g>
      </g>
    </svg>

    <!-- hover 浮层 -->
    <div
      v-if="hoverNode && !dragNode"
      class="gv-tip"
      :style="{ left: nodeScreen(hoverNode).x + 'px', top: nodeScreen(hoverNode).y + 'px' }"
    >
      <b>{{ hoverNode.char.name }} · {{ hoverNode.char.title }}</b>
      <p>{{ hoverNode.char.shortBio }}</p>
      <span>点按识人</span>
    </div>

    <!-- 世界书页 -->
    <WorldView v-if="showWorld" @close="showWorld = false" />
  </div>
</template>

<style scoped>
.graph-view {
  position: absolute;
  inset: 0 0 calc(var(--tabbar-h) + var(--safe-b)) 0;
  overflow: hidden;
  background: radial-gradient(ellipse at 50% 38%, rgba(62, 92, 99, 0.14), transparent 62%), var(--night);
  cursor: grab;
}
.graph-view:active {
  cursor: grabbing;
}

.gv-top {
  position: absolute;
  top: calc(10px + env(safe-area-inset-top, 0px));
  left: 16px;
  right: 16px;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.gv-title {
  font-family: var(--font-display);
  font-size: 22px;
  letter-spacing: 6px;
  color: var(--text);
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.6);
}
.gv-tools {
  display: flex;
  gap: 8px;
}
.gv-search {
  width: 170px;
  background: var(--panel);
  border: 1px solid var(--panel-line);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  padding: 5px 10px;
  outline: none;
}
.gv-search::placeholder {
  color: var(--text-2);
}
.gv-world {
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 3px;
  color: #f4ede0;
  background: rgba(176, 58, 46, 0.85);
  padding: 4px 12px;
  border-radius: 3px;
  transform: rotate(-2deg);
  box-shadow: 0 2px 10px rgba(176, 58, 46, 0.4);
}
.gv-filters {
  position: absolute;
  top: calc(52px + env(safe-area-inset-top, 0px));
  left: 16px;
  right: 16px;
  z-index: 8;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 6px;
  scrollbar-width: none;
}
/* 窄屏：顶栏一行装不下（标题+搜索+世界），改为两行，筛选条下移 */
@media (max-width: 640px) {
  .gv-top {
    flex-wrap: wrap;
    row-gap: 8px;
  }
  .gv-title {
    font-size: 18px;
    letter-spacing: 4px;
  }
  .gv-tools {
    flex: 1 1 100%;
    justify-content: space-between;
    gap: 8px;
  }
  .gv-search {
    flex: 1;
    width: auto;
    min-width: 0;
  }
  .gv-world {
    transform: none;
    flex: none;
  }
  .gv-filters {
    top: calc(92px + env(safe-area-inset-top, 0px));
  }
}
.gv-filters::-webkit-scrollbar {
  display: none;
}
.gv-chip {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--text-2);
  border: 1px solid rgba(201, 169, 106, 0.25);
  background: var(--panel);
  padding: 3px 10px;
  transition: all 0.2s var(--ease-ink);
}
.gv-chip i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.gv-chip.on {
  color: var(--text);
  border-color: var(--gold);
}
.gv-sep {
  flex: none;
  width: 1px;
  background: rgba(201, 169, 106, 0.25);
  margin: 2px 4px;
}

.gv-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.gv-watermark {
  font-family: var(--font-display);
  font-size: 64px;
  letter-spacing: 14px;
  fill: rgba(232, 224, 208, 0.05);
  text-anchor: middle;
  pointer-events: none;
}

.gv-edge {
  fill: none;
  stroke-width: 1.4;
  opacity: 0.55;
  transition: opacity 0.25s var(--ease-ink);
}
.gv-edge:hover {
  opacity: 1;
  stroke-width: 2.4;
}
.gv-edge.dim {
  opacity: 0.06;
}

.gv-node {
  cursor: pointer;
  transition: opacity 0.25s var(--ease-ink);
}
.gv-node.dim {
  opacity: 0.12;
  pointer-events: none;
}
.gv-hit {
  fill: transparent;
}
.gv-halo {
  fill: none;
  stroke-width: 1;
  opacity: 0.35;
  stroke-dasharray: 3 5;
}
.gv-body {
  fill-opacity: 0.3;
  stroke-width: 2;
}
.gv-node:hover .gv-body {
  fill-opacity: 0.5;
}
.gv-char {
  font-family: var(--font-display);
  font-size: 26px;
  fill: #f4ede0;
  text-anchor: middle;
  pointer-events: none;
}
.gv-label {
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 2px;
  fill: rgba(232, 224, 208, 0.85);
  text-anchor: middle;
  paint-order: stroke;
  stroke: rgba(27, 26, 23, 0.85);
  stroke-width: 4px;
  pointer-events: none;
}
.gv-focus-ring {
  fill: none;
  stroke: var(--cinnabar);
  stroke-width: 2.5;
  opacity: 0;
  transform-origin: center;
}
.gv-node.focus .gv-focus-ring {
  animation: g-ring 1.1s var(--ease-ink) infinite;
}
@keyframes g-ring {
  0% {
    opacity: 0.9;
    transform: scale(0.8);
  }
  100% {
    opacity: 0;
    transform: scale(2);
  }
}

.gv-tip {
  position: absolute;
  z-index: 9;
  transform: translate(-50%, calc(-100% - 60px));
  width: 210px;
  background: var(--panel);
  border: 1px solid var(--panel-line);
  padding: 10px 12px;
  pointer-events: none;
  backdrop-filter: blur(6px);
}
.gv-tip b {
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 1px;
  color: var(--text);
  display: block;
  margin-bottom: 4px;
}
.gv-tip p {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-2);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.gv-tip span {
  display: block;
  margin-top: 6px;
  font-size: 10.5px;
  letter-spacing: 2px;
  color: var(--gold);
}

@media (min-width: 1024px) {
  .gv-search {
    width: 240px;
  }
  .gv-tip {
    width: 260px;
  }
}
</style>
