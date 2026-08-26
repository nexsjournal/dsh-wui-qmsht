<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import gsap from 'gsap'
import { CameraRig, SCROLL_H, SCROLL_W } from '@/core/camera'
import { PanZoom } from '@/core/panzoom'
import { detectLowEnd, prefersReducedMotion } from '@/core/perf'
import { AmbientEngine } from '@/core/ambient'
import { characters, charById, factionById, relations, world, type Landmark, type TourStop } from '@/data'
import { useNavStore } from '@/stores/nav'
import { useMusicStore } from '@/stores/music'
import { useSceneFxStore } from '@/stores/sceneFx'
import { useFindStore } from '@/stores/find'
import { useQuestStore, edgeKey } from '@/stores/quest'
import MiniNav from '@/components/MiniNav.vue'

type Tier = 'low' | 'mid' | 'hi'
const TIER_N: Record<Tier, number> = { low: 1, mid: 4, hi: 8 }
const TIER_CAP: Record<Tier, number> = { low: 1, mid: 5, hi: 4 }

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
// 「汴京一日」自动巡览
const tourOn = ref(false)
const tourPaused = ref(false)
const tourStop = ref<TourStop | null>(null)
const fx = useSceneFxStore()
const music = useMusicStore()
const find = useFindStore()
const quest = useQuestStore()
// 地标信息卡
const markCard = ref<Landmark | null>(null)
// 寻人/案情 HUD 抖动反馈（共用）
const findShake = ref(false)
// z 分档（0: <1.5 / 1: ≥1.5）——rig.z 非响应式，需在 rAF 循环里跨档时写回
const zBand = ref(0)
const named = computed(() => guideOn.value || zBand.value === 1)

let rig!: CameraRig
let pz!: PanZoom
let ro: ResizeObserver | null = null
let rafId = 0
let activeTier: Tier = 'low'
let lastTry = 0
let openTl: gsap.core.Tween | null = null
let tourTl: gsap.core.Timeline | null = null
let ambient: AmbientEngine
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
      // 运行时创建的 img 没有 scoped 属性，scoped 的 .tile 规则不会命中 → 定位样式必须内联
      img.style.cssText = `position:absolute;top:0;height:100%;object-fit:fill;opacity:0;transition:opacity .15s linear;left:${(100 * i) / n}%;width:${100 / n}%;`
      layer.appendChild(img)
      tileMap[tier].set(i, img)
    }
    if (!img.dataset.loaded) {
      img.onload = () => {
        img.dataset.loaded = '1'
        img.style.opacity = '1'
        img.classList.add('ready')
      }
      img.onerror = () => {
        img.style.display = 'none'
        img.classList.add('failed')
      }
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
  // 低档常开做兜底：瓦片加载空窗/镜头飞行被手势打断时不露深色底（寻人入口黑屏的根因）
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
  // 环境音交叉淡化（引擎内部 150ms 节流）
  if (nav.mode === 'roll') ambient.update(((mx0 + mx1) / 2) / SCROLL_W, music.playing, performance.now())
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
  // 案情：寻人阶段点中本章目标=解锁关系边；点错不扣分，连错 3 次给镜头提示
  if (quest.active && quest.phase === 'seeking') {
    const st = quest.stage
    const id = hitTest(x, y, 46)
    if (st && id === st.target) {
      quest.onCorrect()
      const c = charById.get(id)!
      rig.centerOn(c.pos, Math.max(rig.z, 2), reduced ? 0 : 650)
      highlight(id)
    } else if (id) {
      quest.onMiss()
      findShake.value = true
      window.setTimeout(() => (findShake.value = false), 450)
      if (quest.missCount >= 3) questHint()
    }
    return
  }
  // 寻人玩法：点中目标=答对；点错=扣铜钱，连错 3 次给镜头提示
  if (find.active && !find.won) {
    const id = hitTest(x, y, 46)
    if (id && id === find.currentId) {
      find.roundWin()
      const c = charById.get(id)!
      rig.centerOn(c.pos, Math.max(rig.z, 2), reduced ? 0 : 650)
      highlight(id)
    } else if (id) {
      find.roundMiss()
      findShake.value = true
      window.setTimeout(() => (findShake.value = false), 450)
      if (find.attempts >= 3) hintTarget()
    }
    return
  }
  const id = hitTest(x, y, 32)
  if (id) select(id)
}

/** 点名牌直接开详情（寻人/案情寻人中禁用，防误触泄题） */
function plateClick(id: string) {
  if (find.active || (quest.active && quest.phase === 'seeking')) return
  select(id)
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

// 「寻到」强调：跨视图跳来（诗中之人/详情回卷）时红点爆闪 + 金环扩散 + 名牌放大 + 底部字幕
const flashId = ref<string | null>(null)
const foundCap = ref<{ name: string; title: string; src?: string } | null>(null)
let flashTimer = 0
function focusFlash(id: string, src?: string) {
  const c = charById.get(id)
  if (!c) return
  flashId.value = id
  foundCap.value = { name: c.name, title: c.title, src }
  window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => {
    flashId.value = null
    foundCap.value = null
  }, 3000)
}

function onLandmark(l: Landmark) {
  rig.centerOn(l.pos, Math.max(rig.z, 1.3), reduced ? 0 : 650)
  markCard.value = find.active ? null : l
}

/** 迷你导航条点按：镜头飞行到该画布 x 居中 */
function onMiniTap(cx: number) {
  if (tourOn.value) endTour()
  const s = rig.cam.scale
  const target = Math.min(0, Math.max(rig.vw - SCROLL_W * s, rig.vw / 2 - cx * s))
  rig.flyTo({ x: target, y: rig.cam.y, scale: s }, reduced ? 0 : 550)
}

// ============ 「汴京一日」自动巡览 ============
function tourTarget(t: TourStop) {
  const scale = rig.baseScale * t.zoom
  return {
    x: rig.vw / 2 - t.target.x * SCROLL_W * scale,
    y: rig.vh / 2 - t.target.y * SCROLL_H * scale,
    scale,
  }
}
function startTour() {
  if (tourOn.value) return
  const fly = reduced ? 400 : 1500
  tourTl = gsap.timeline({
    onUpdate: () => {
      rig.clamp()
      rig.apply()
    },
    onComplete: () => endTour(),
  })
  for (let i = 0; i < world.tour.length; i++) {
    const t = world.tour[i]
    tourTl.call(() => (tourStop.value = t))
    const cam = tourTarget(t)
    tourTl.to(rig.cam, { x: cam.x, y: cam.y, scale: cam.scale, duration: fly / 1000, ease: 'power2.inOut' })
    tourTl.to({}, { duration: t.dwell })
  }
  tourStop.value = null
  markCard.value = null
  tourOn.value = true
  tourPaused.value = false
}
function endTour() {
  tourTl?.kill()
  tourTl = null
  tourOn.value = false
  tourPaused.value = false
  tourStop.value = null
}
function toggleTour() {
  if (!tourOn.value) startTour()
  else if (tourPaused.value) {
    tourTl?.resume()
    tourPaused.value = false
  } else {
    tourTl?.pause()
    tourPaused.value = true
  }
}

// ============ 「找画中人」寻人玩法 ============
const curFind = computed(() => (find.currentId ? (charById.get(find.currentId) ?? null) : null))
const curFaction = computed(() => (curFind.value ? (factionById.get(curFind.value.faction) ?? null) : null))
const findTimeStr = computed(() => {
  const t = Math.floor(find.elapsed)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
})
const nearbyChars = computed(() => {
  const l = markCard.value
  if (!l) return []
  return characters
    .filter((c) => Math.hypot(c.pos.x - l.pos.x, c.pos.y - l.pos.y) < 0.15)
    .sort((a, b) => a.pos.x - b.pos.x)
    .slice(0, 4)
})

function resetCamOverview() {
  const s = rig.baseScale
  rig.flyTo({ x: rig.vw / 2 - SCROLL_W * 0.5 * s, y: 0, scale: s }, reduced ? 0 : 700)
}
// 诗韵页「诗中之人」跳转：镜头飞到该人物并高亮（消费 nav.rollFocus）
watch(
  () => nav.rollFocus,
  (f) => {
    if (!f) return
    nav.rollFocus = null
    const c = charById.get(f.id)
    if (!c) return
    if (tourOn.value) endTour()
    rig.centerOn(c.pos, Math.max(rig.z, 2.2), reduced ? 0 : 700)
    highlight(f.id)
    focusFlash(f.id, f.src)
  },
)

function exitFind() {
  find.end()
  nav.setMode('roll')
}
function nextFind() {
  find.roundNext()
  resetCamOverview()
}
let findHinted = false
function hintTarget() {
  if (findHinted || !find.currentId) return
  findHinted = true
  const c = charById.get(find.currentId)
  if (c) rig.centerOn(c.pos, 1.9, reduced ? 0 : 800)
}

// ============ 「一船之故」剧情任务线 ============
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
const curTarget = computed(() => (quest.stage ? (charById.get(quest.stage.target) ?? null) : null))
const revealPair = computed(() => {
  const st = quest.stage
  if (!st) return ''
  const a = charById.get(st.edge[0])
  const b = charById.get(st.edge[1])
  const rel = relations.find((r) => edgeKey(r.from, r.to) === edgeKey(st.edge[0], st.edge[1]))
  if (!a || !b || !rel) return ''
  return `${a.name} ↔ ${b.name} · ${rel.label}`
})
/** 案情卡（intro/reveal/done 显示，seeking 隐藏） */
const storyCard = computed(() => {
  if (!quest.active) return null
  return quest.phase === 'seeking' ? null : quest
})
let questHinted = false
function startSeeking() {
  quest.beginSeeking()
  resetCamOverview()
}
function questHint() {
  if (questHinted || !quest.stage) return
  questHinted = true
  const c = charById.get(quest.stage.target)
  if (c) rig.centerOn(c.pos, 1.9, reduced ? 0 : 800)
}
function storyExit() {
  nav.setMode('roll')
}
function viewEdgeInGraph() {
  nav.setMode('graph')
}

onMounted(() => {
  rig = new CameraRig(stage.value!)
  rig.maxZ = lowEnd ? 3 : 4
  rig.rubber = lowEnd ? 24 : 40
  rig.resize(wrap.value!.clientWidth, wrap.value!.clientHeight)
  rig.initView()
  // 开场镜头：从 1.5 倍回落到全览（与展卷开场动画同步，手势可打断）
  if (!reduced) {
    const s0 = rig.baseScale * 1.5
    const fin = { x: rig.cam.x, y: rig.cam.y, scale: rig.cam.scale }
    rig.cam.x = rig.vw / 2 - SCROLL_W * 0.6 * s0
    rig.cam.y = (rig.vh - SCROLL_H * s0) / 2
    rig.cam.scale = s0
    rig.apply()
    openTl = gsap.to(rig.cam, {
      ...fin,
      duration: 2.2,
      delay: 0.4,
      ease: 'power2.inOut',
      onUpdate: () => {
        rig.clamp()
        rig.apply()
      },
      onComplete: () => (openTl = null),
    })
  }
  ro = new ResizeObserver(() => {
    rig.resize(wrap.value!.clientWidth, wrap.value!.clientHeight)
  })
  ro.observe(wrap.value!)

  ambient = new AmbientEngine(world.scenes.map((sc) => sc.xRange))

  pz = new PanZoom(wrap.value!, rig, {
    onGestureStart: () => {
      openTl?.kill()
      openTl = null
      if (tourOn.value) endTour()
    },
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

watch(
  () => fx.ambientOn,
  (v) => {
    // 开关点击即用户手势，可在此创建 AudioContext
    ambient?.start()
    ambient?.setEnabled(v)
  },
)
watch(
  () => nav.mode,
  (m) => {
    if (m !== 'roll' && tourOn.value) endTour()
    if (m === 'find') {
      markCard.value = null
      if (!find.active) {
        find.start()
        resetCamOverview()
      }
    } else if (find.active) {
      find.end()
    }
    if (m === 'story') {
      markCard.value = null
      if (!quest.active) {
        quest.start()
        resetCamOverview()
      }
    } else if (quest.active) {
      quest.end()
    }
  },
)
watch(
  () => quest.stageIdx,
  () => (questHinted = false),
)
watch(
  () => find.currentId,
  () => (findHinted = false),
)
watch(
  () => nav.detail,
  (d) => {
    if (d && tourOn.value) endTour()
  },
)

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  openTl?.kill()
  endTour()
  ambient?.dispose()
  pz?.dispose()
  ro?.disconnect()
  wrap.value?.removeEventListener('pointermove', onHover)
  window.clearTimeout(flashTimer)
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
    focusFlash(id)
  },
})
</script>

<template>
  <div ref="wrap" class="roll-view">
    <div ref="stage" class="stage" :class="{ named, seeking: find.active || (quest.active && quest.phase === 'seeking'), dusk: fx.phase === 'dusk', night: fx.phase === 'night' }">
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

      <!-- 昼夜：灯笼（暮起渐亮，夜最亮） -->
      <div class="lanterns" aria-hidden="true">
        <i
          v-for="(pt, i) in world.lanterns"
          :key="i"
          :style="{ left: pt.x * 4206 + 'px', top: pt.y * 1733 + 'px', animationDelay: i * 0.9 + 's' }"
        ></i>
      </div>

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
          :class="{
            hovered: hoverId === c.id,
            selected: selectedId === c.id,
            flash: flashId === c.id,
          }"
          :style="{ left: c.pos.x * 4206 + 'px', top: c.pos.y * 1733 + 'px' }"
        >
          <span class="dot"></span>
          <span class="ring" aria-hidden="true"></span>
          <span class="plate" data-no-pan @click="plateClick(c.id)">{{ c.name }}</span>
        </div>
      </div>
    </div>

    <div class="title-corner" :class="{ hidden: find.active || quest.active }">
      <span class="tc-main">清明上河图</span>
      <span class="tc-sub">众生图鉴</span>
      <button class="guide-btn" :class="{ on: guideOn }" @click="guideOn = !guideOn">
        <span class="g-dot"></span>人物指引
      </button>
      <button class="guide-btn" :class="{ on: tourOn }" @click="toggleTour">
        <svg v-if="!tourOn || tourPaused" viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
          <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
          <path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor" />
        </svg>
        {{ tourOn ? (tourPaused ? '继续' : '暂停') : '导览' }}
      </button>
    </div>
    <!-- 寻人 HUD -->
    <div v-if="find.active" class="find-hud" :class="{ shake: findShake }" data-no-pan>
      <button class="find-exit" @click="exitFind">退出</button>
      <div class="find-clue">
        <div class="find-clue-t">
          {{ curFind?.title }}<i>{{ curFaction?.name }}</i><em>{{ find.progress }}</em>
        </div>
        <p>{{ curFind?.shortBio }}</p>
      </div>
      <div class="find-stats">
        <span class="find-time">{{ findTimeStr }}</span>
        <span class="find-coins">{{ find.coins }}<i>铜</i></span>
      </div>
    </div>

    <!-- 地标信息卡 -->
    <transition name="mark">
      <div v-if="markCard" class="mark-card" data-no-pan>
        <button class="mark-close" aria-label="关闭" @click="markCard = null">×</button>
        <div class="mark-name">{{ markCard.name }}</div>
        <p class="mark-hint">{{ markCard.hint }}</p>
        <div v-if="nearbyChars.length" class="mark-near">
          <span class="mark-near-t">附近人物</span>
          <button v-for="c in nearbyChars" :key="c.id" class="mark-chip" @click="select(c.id)">{{ c.name }}</button>
        </div>
      </div>
    </transition>

    <!-- 案情 HUD -->
    <div v-if="quest.active" class="find-hud" :class="{ shake: findShake, 'story-hud': true }" data-no-pan>
      <button class="find-exit" @click="storyExit">退出</button>
      <div class="find-clue">
        <div class="find-clue-t">「一船之故」<i>{{ quest.progress }}</i></div>
        <p v-if="quest.stage && quest.phase !== 'done'">
          第{{ CN_NUM[quest.stageIdx] }}章 · {{ quest.stage.title }}
        </p>
      </div>
    </div>

    <!-- 案情卡：读案 / 揭晓 / 完结 -->
    <transition name="find-win">
      <div v-if="storyCard" class="find-win story-card" data-no-pan :key="quest.phase + quest.stageIdx">
        <template v-if="quest.phase === 'intro' && quest.stage">
          <div class="fw-head">第{{ CN_NUM[quest.stageIdx] }}章 · {{ quest.stage.title }}</div>
          <div class="fw-name">寻 {{ curTarget?.name }}<i>{{ curTarget?.title }}</i></div>
          <p class="fw-bio">{{ quest.stage.intro }}</p>
          <div class="fw-acts">
            <button class="fw-btn fw-main" @click="startSeeking">出发找人</button>
          </div>
        </template>
        <template v-else-if="quest.phase === 'reveal' && quest.stage">
          <div class="fw-head">第{{ CN_NUM[quest.stageIdx] }}章 · 线索相连</div>
          <div class="fw-name fw-pair">{{ revealPair }}</div>
          <p class="fw-bio">{{ quest.stage.reveal }}</p>
          <div class="fw-acts">
            <button class="fw-btn" @click="viewEdgeInGraph">图谱中看</button>
            <button class="fw-btn fw-main" @click="quest.nextStage()">
              {{ quest.stageIdx + 1 >= quest.total ? '完结' : '下一章' }}
            </button>
          </div>
        </template>
        <template v-else-if="quest.phase === 'done'">
          <div class="fw-head">「一船之故」· 全九章已毕</div>
          <div class="fw-name">大船过桥<i>一船之故，汴京一日</i></div>
          <p class="fw-bio">九段关系已在图谱中点亮。这条船、这座桥、这一天，都留在这卷里了。</p>
          <div class="fw-acts">
            <button class="fw-btn" @click="storyExit">退出案情</button>
            <button class="fw-btn fw-main" @click="viewEdgeInGraph">查看图谱</button>
          </div>
        </template>
      </div>
    </transition>

    <!-- 寻人胜利卡 -->
    <transition name="find-win">
      <div v-if="find.active && find.won && curFind" class="find-win" data-no-pan>
        <div class="fw-head">找到了 · <b>+{{ find.lastGain }}</b> 铜钱</div>
        <div class="fw-name">{{ curFind.name }}<i>{{ curFind.title }}</i></div>
        <p class="fw-bio">{{ curFind.shortBio }}</p>
        <div class="fw-acts">
          <button class="fw-btn" @click="nav.push(find.currentId!)">查看小传</button>
          <button class="fw-btn fw-main" @click="nextFind">下一位</button>
        </div>
      </div>
    </transition>

    <!-- 寻到字幕：诗中之人/详情回卷的落点提示 -->
    <transition name="found-cap">
      <div v-if="foundCap" class="found-cap" data-no-pan>
        <span v-if="foundCap.src" class="fc-src">《{{ foundCap.src }}》· 诗中之人</span>
        <span v-else class="fc-src">画中寻到</span>
        <span class="fc-name">{{ foundCap.name }}</span>
        <span class="fc-title">{{ foundCap.title }}</span>
      </div>
    </transition>
    <MiniNav
      ref="miniNav"
      :on-get-cam-x="() => rig.cam.x"
      :on-pan-x="(x: number) => {
        rig.cam.x = x
        rig.clamp()
        rig.apply()
      }"
      :on-interrupt="() => pz.interrupt()"
      :on-tap-x="onMiniTap"
      :scenes="world.scenes"
    />
    <transition name="tour-cap">
      <div v-if="tourOn && tourStop" class="tour-card" :key="tourStop.title" aria-live="polite">
        <div class="tc-meta">
          <span class="tc-time">{{ tourStop.time }}</span>
          <i>{{ tourStop.scene }}</i>
        </div>
        <div class="tc-head">{{ tourStop.title }}</div>
        <p class="tc-body">{{ tourStop.text }}</p>
      </div>
    </transition>
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
  transition: filter 1.4s ease;
}
.stage.dusk {
  filter: saturate(0.72) brightness(0.85) sepia(0.2);
}
.stage.night {
  filter: saturate(0.5) brightness(0.58) sepia(0.32) hue-rotate(-8deg);
}
/* 灯笼：暮起渐亮，夜最亮；点亮后轻微闪烁 */
.lanterns i {
  position: absolute;
  width: 26px;
  height: 26px;
  transform: scale(var(--inv)) translate(-50%, -50%);
  background: radial-gradient(circle, rgba(255, 214, 140, 0.98) 0 16%, rgba(255, 172, 82, 0.6) 42%, transparent 68%);
  box-shadow: 0 0 36px 14px rgba(255, 160, 60, 0.25);
  opacity: 0;
  transition: opacity 1.6s ease;
  pointer-events: none;
}
.stage.dusk .lanterns i {
  opacity: 0.5;
  animation: lantern-dusk 3.4s ease-in-out 1.6s infinite;
}
.stage.night .lanterns i {
  opacity: 1;
  animation: lantern-night 2.7s ease-in-out 1.6s infinite;
}
@keyframes lantern-dusk {
  0%,
  100% {
    opacity: 0.5;
  }
  45% {
    opacity: 0.34;
  }
  60% {
    opacity: 0.46;
  }
}
@keyframes lantern-night {
  0%,
  100% {
    opacity: 1;
  }
  45% {
    opacity: 0.7;
  }
  60% {
    opacity: 0.94;
  }
}
/* 寻人/案情寻人模式：名牌隐藏（只留红点，靠画中人辨识）；
   权重需压过下方 .stage.named .anchor .plate 等 opacity:1 规则 */
.roll-view .stage.seeking .anchor .plate,
.roll-view .stage.seeking .anchor.hovered .plate,
.roll-view .stage.seeking .anchor.selected .plate {
  opacity: 0;
  pointer-events: none;
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
/* 瓦片 img 运行时创建、无 scoped 属性：样式在 ensureTiles 内联，不在此定义 */

/* ============ 锚点 ============ */
.anchors {
  position: absolute;
  inset: 0;
  z-index: 4;
  /* 容器不拦截指针：空隙处点击透传给地标/舞台 */
  pointer-events: none;
}
.anchor {
  position: absolute;
  width: 44px;
  height: 44px;
  transform: scale(var(--inv)) translate(-50%, -50%);
  cursor: pointer;
  pointer-events: auto;
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
  .anchor.flash .dot,
  .anchor.flash .ring,
  .anchor.flash .plate {
    animation: none;
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
  /* 名牌底缘抬到红点上方（红点半径 8px + 2px 缝隙），不再与圆点叠压 */
  bottom: 32px;
  --px: -50%;
  transform: translateX(var(--px));
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
  pointer-events: auto;
  cursor: pointer;
}
/* 偶数锚点的名牌错排到红点左侧，密集区（轿队等）减叠压 */
.anchor:nth-child(even) .plate {
  --px: -108%;
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
/* 「寻到」强调（跨视图跳转 3 秒）：红点爆闪、金环四连扩散、名牌放大金边 */
.anchor.flash .dot {
  animation: found-dot 0.7s ease-in-out 4;
  background: #ff5a3c;
  box-shadow: 0 0 16px rgba(255, 90, 60, 0.95);
}
@keyframes found-dot {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    transform: translate(-50%, -50%) scale(2.1);
  }
}
.anchor.flash .ring {
  border-color: var(--gold);
  animation: found-ring 0.75s ease-out 4;
}
@keyframes found-ring {
  0% {
    transform: translate(-50%, -50%) scale(0.5);
    opacity: 0.95;
  }
  100% {
    transform: translate(-50%, -50%) scale(4.6);
    opacity: 0;
  }
}
.anchor.flash .plate {
  opacity: 1;
  border-color: var(--gold);
  box-shadow:
    0 0 18px rgba(201, 169, 106, 0.6),
    0 0 6px rgba(176, 58, 46, 0.9);
  animation: found-plate 2.8s var(--ease-ink) forwards;
}
@keyframes found-plate {
  0% {
    transform: translateX(var(--px)) scale(1);
  }
  12% {
    transform: translateX(var(--px)) scale(1.5);
  }
  24% {
    transform: translateX(var(--px)) scale(1.22);
  }
  100% {
    transform: translateX(var(--px)) scale(1.22);
  }
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
.title-corner.hidden {
  display: none;
}
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

/* ============ 诗句飘落层 ============ */

/* ============ 巡览字幕卡 ============ */
.tour-card {
  position: absolute;
  left: 50%;
  bottom: calc(var(--tabbar-h) + var(--safe-b) + 56px);
  transform: translateX(-50%);
  z-index: 6;
  width: min(88vw, 460px);
  padding: 12px 18px 14px;
  background: var(--panel);
  border: 1px solid var(--panel-line);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  pointer-events: none;
}
.tc-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tc-time {
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 2px;
  color: var(--gold);
}
.tc-meta i {
  font-style: normal;
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--text-2);
  border: 1px solid rgba(201, 169, 106, 0.35);
  padding: 0 6px;
}
.tc-head {
  font-family: var(--font-display);
  font-size: 21px;
  letter-spacing: 4px;
  margin-top: 4px;
}
.tc-body {
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-2);
  margin-top: 4px;
}
.tour-cap-enter-active,
.tour-cap-leave-active {
  transition: opacity 0.45s var(--ease-ink), transform 0.45s var(--ease-ink);
}
.tour-cap-enter-from,
.tour-cap-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
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

/* ============ 寻人 HUD ============ */
.found-cap {
  position: absolute;
  left: 50%;
  bottom: 58px;
  transform: translateX(-50%);
  z-index: 9;
  display: flex;
  align-items: baseline;
  gap: 8px;
  max-width: min(92vw, 560px);
  padding: 8px 16px;
  background: rgba(27, 26, 23, 0.9);
  border: 1px solid var(--cinnabar);
  box-shadow:
    0 8px 28px rgba(0, 0, 0, 0.5),
    0 0 12px rgba(176, 58, 46, 0.25);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.fc-src {
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--gold);
  white-space: nowrap;
}
.fc-name {
  font-family: var(--font-display);
  font-size: 17px;
  letter-spacing: 4px;
  color: #f4ede0;
  white-space: nowrap;
}
.fc-title {
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--text-2);
  white-space: nowrap;
}
.found-cap-enter-active,
.found-cap-leave-active {
  transition:
    opacity 0.3s var(--ease-ink),
    transform 0.3s var(--ease-ink);
}
.found-cap-enter-from,
.found-cap-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

.find-hud {
  position: absolute;
  top: calc(14px + env(safe-area-inset-top, 0px));
  left: 12px;
  right: 12px;
  z-index: 8;
  display: flex;
  align-items: stretch;
  gap: 10px;
  padding: 8px 10px;
  background: var(--panel);
  border: 1px solid var(--panel-line);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.find-hud.shake {
  animation: hud-shake 0.45s var(--ease-ink);
}
@keyframes hud-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-6px);
  }
  50% {
    transform: translateX(5px);
  }
  75% {
    transform: translateX(-3px);
  }
}
.find-exit {
  align-self: center;
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--text-2);
  border: 1px solid rgba(201, 169, 106, 0.3);
  padding: 5px 10px;
  transition: color 0.25s var(--ease-ink), border-color 0.25s var(--ease-ink);
}
.find-exit:active {
  color: var(--cinnabar);
  border-color: var(--cinnabar);
}
.find-clue {
  flex: 1;
  min-width: 0;
}
.find-clue-t {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 1px;
  color: var(--text);
}
.find-clue-t i {
  font-style: normal;
  font-size: 11px;
  color: var(--gold);
  border: 1px solid rgba(201, 169, 106, 0.4);
  padding: 0 5px;
}
.find-clue-t em {
  font-style: normal;
  margin-left: auto;
  font-size: 11px;
  color: var(--text-2);
}
.find-clue p {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.find-stats {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  text-align: right;
  font-family: var(--font-display);
}
.find-time {
  font-size: 16px;
  letter-spacing: 1px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.find-coins {
  font-size: 12px;
  color: var(--gold);
}
.find-coins i {
  font-style: normal;
  margin-left: 2px;
  font-size: 10px;
}

/* ============ 地标信息卡 ============ */
.mark-card {
  position: absolute;
  left: 16px;
  bottom: calc(var(--tabbar-h) + var(--safe-b) + 64px);
  z-index: 7;
  width: min(64vw, 280px);
  padding: 12px 14px;
  background: var(--panel);
  border: 1px solid var(--panel-line);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.mark-close {
  position: absolute;
  top: 4px;
  right: 8px;
  font-size: 16px;
  color: var(--text-2);
  padding: 2px 6px;
}
.mark-name {
  font-family: var(--font-display);
  font-size: 18px;
  letter-spacing: 3px;
}
.mark-hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-2);
}
.mark-near {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.mark-near-t {
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--text-2);
  margin-right: 2px;
}
.mark-chip {
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--text);
  border: 1px solid rgba(201, 169, 106, 0.4);
  padding: 2px 9px;
  transition: border-color 0.25s var(--ease-ink), background 0.25s var(--ease-ink);
}
.mark-chip:active {
  border-color: var(--cinnabar);
  background: rgba(176, 58, 46, 0.18);
}
.mark-enter-active,
.mark-leave-active {
  transition: opacity 0.3s var(--ease-ink), transform 0.3s var(--ease-ink);
}
.mark-enter-from,
.mark-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* ============ 寻人胜利卡 ============ */
.find-win {
  position: absolute;
  left: 50%;
  bottom: calc(var(--tabbar-h) + var(--safe-b) + 64px);
  transform: translateX(-50%);
  z-index: 8;
  width: min(88vw, 420px);
  padding: 14px 18px;
  background: var(--panel);
  border: 1px solid var(--cinnabar);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.fw-head {
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 2px;
  color: var(--gold);
}
.fw-head b {
  font-size: 16px;
  color: var(--text);
}
.fw-name {
  margin-top: 6px;
  font-family: var(--font-display);
  font-size: 24px;
  letter-spacing: 3px;
}
.fw-name i {
  font-style: normal;
  margin-left: 8px;
  font-size: 13px;
  letter-spacing: 1px;
  color: var(--text-2);
}
.fw-bio {
  margin-top: 6px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-2);
}
.fw-acts {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.fw-btn {
  flex: 1;
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 2px;
  padding: 8px 0;
  border: 1px solid var(--panel-line);
  color: var(--text-2);
  transition: all 0.25s var(--ease-ink);
}
.fw-btn:active {
  transform: scale(0.97);
}
.fw-btn.fw-main {
  border-color: var(--cinnabar);
  color: var(--text);
  background: rgba(176, 58, 46, 0.16);
}
/* 案情卡：金色描边区分于寻人（朱砂） */
.story-card {
  border-color: var(--gold);
}
.fw-pair {
  font-size: 19px;
  letter-spacing: 1px;
}
.find-win-enter-active,
.find-win-leave-active {
  transition: opacity 0.4s var(--ease-ink), transform 0.4s var(--ease-ink);
}
.find-win-enter-from,
.find-win-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}

@media (min-width: 1024px) {
  .tc-main {
    font-size: 28px;
  }
}
@media (max-width: 560px) {
  .tc-main {
    font-size: 18px;
    letter-spacing: 2px;
  }
  .tc-sub {
    display: none;
  }
  .guide-btn {
    font-size: 11px;
    padding: 3px 8px;
  }
}
</style>
