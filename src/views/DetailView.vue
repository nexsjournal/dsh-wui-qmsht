<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { charById, factionById, relationsOf, world } from '@/data'
import { useNavStore } from '@/stores/nav'
import { SCROLL_H, SCROLL_W } from '@/core/camera'
import { cropRegion } from '@/core/crop'
import ChatOverlay from '@/components/ChatOverlay.vue'
import { prefersReducedMotion } from '@/core/perf'

const nav = useNavStore()
const reduced = prefersReducedMotion()

const chatOpen = ref(false)

const roller = defineModel<{ focusCharacter?: (id: string) => void } | null>({ default: null })

const c = computed(() => (nav.detail ? (charById.get(nav.detail) ?? null) : null))
const rels = computed(() => (c.value ? relationsOf(c.value.id) : []))
const faction = computed(() => (c.value ? factionById.get(c.value.faction) : null))

/** 诗韵回响：引用当前人物的诗词（反向链接） */
const echoes = computed(() =>
  c.value
    ? world.poems
        .filter((p) => p.links.some((l) => l.charId === c.value!.id))
        .map((p) => ({ poem: p, note: p.links.find((l) => l.charId === c.value!.id)!.note }))
    : [],
)

/** 诗韵回响原地展开：点开看全文，不关弹窗 */
const expandedPoemId = ref<string | null>(null)
function togglePoem(id: string) {
  expandedPoemId.value = expandedPoemId.value === id ? null : id
}

const dir = ref<'push' | 'pop'>('push')
const expanded = ref(false)
const bgUrl = ref('')
const portraitUrl = ref('')

// 入场方向：压栈=自左滑入，出栈=自右滑回
watch(
  () => nav.detailStack.length,
  (n, o) => {
    if (o !== undefined) dir.value = n > o ? 'push' : 'pop'
  },
)

// 背景裁剪 + 立绘（懒生成，零额外网络请求）
watch(
  c,
  (ch) => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    expanded.value = false
    expandedPoemId.value = null
    portraitUrl.value = ch?.portrait ?? ''
    if (!ch) return
    const cx = ch.pos.x * SCROLL_W
    const cy = ch.pos.y * SCROLL_H
    cropRegion(cx, cy, ch.crop.w, ch.crop.h, 960, 540).then((u) => (bgUrl.value = u ?? ''))
    if (!ch.portrait) {
      cropRegion(cx, cy, 700, 933, 420, 560).then((u) => {
        if (!c.value?.portrait) portraitUrl.value = u ?? ''
      })
    }
  },
  { immediate: true },
)

const shownStory = computed(() => (expanded.value || !c.value ? c.value?.story ?? [] : c.value.story.slice(0, 1)))

function go(id: string) {
  nav.push(id)
}
function back() {
  // 走浏览器历史 → popstate → onPopState 统一出栈（单一事实源，避免双重 pop）
  history.back()
}
function closeAll() {
  // 只清栈；历史回退由下方 watch 统一执行（避免双重 history.go 越过栈底）
  nav.closeAll()
}
function viewInRoll() {
  const id = nav.detail!
  closeAll()
  queueMicrotask(() => roller.value?.focusCharacter?.(id))
}
function viewInGraph() {
  const id = nav.detail!
  nav.focusInGraph(id)
  closeAll()
}

// ============ 小传朗读（Web Speech） ============
function speak() {
  const ch = c.value
  if (!ch || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(`${ch.name}，${ch.title}。${ch.shortBio}`)
  u.lang = 'zh-CN'
  u.rate = 0.95
  window.speechSynthesis.speak(u)
}

// ============ 分享卡（canvas 海报 → 下载） ============
const DISP = "'LXGW WenKai TC', 'Kaiti SC', 'STKaiti', 'KaiTi', 'Noto Serif SC', serif"

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxW: number,
  lh: number,
  maxLines: number,
) {
  let line = ''
  let lines = 0
  for (const ch of text) {
    const test = line + ch
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, y)
      line = ch
      lines++
      if (lines >= maxLines) return
      y += lh
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, cx, y)
}

async function shareCard() {
  const ch = c.value
  const f = faction.value
  if (!ch || !f) return
  const W = 1080
  const H = 1350
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')
  if (!ctx) return
  // 绢底 + 丝纹
  ctx.fillStyle = '#f4ede0'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(201, 169, 106, 0.08)'
  ctx.lineWidth = 1
  for (let x = 44; x < W - 44; x += 9) {
    ctx.beginPath()
    ctx.moveTo(x, 44)
    ctx.lineTo(x, H - 44)
    ctx.stroke()
  }
  // 双线框
  ctx.strokeStyle = 'rgba(176, 58, 46, 0.8)'
  ctx.lineWidth = 5
  ctx.strokeRect(34, 34, W - 68, H - 68)
  ctx.strokeStyle = 'rgba(201, 169, 106, 0.65)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(52, 52, W - 104, H - 104)
  ctx.textAlign = 'center'
  // 标题
  ctx.fillStyle = '#6b5636'
  ctx.font = `42px ${DISP}`
  ctx.fillText('清明上河图 · 众生图鉴', W / 2, 140)
  // 立绘
  let y = 190
  if (portraitUrl.value) {
    try {
      const img = await loadImage(portraitUrl.value)
      const box = 620
      const x = (W - box) / 2
      const sc = Math.max(box / img.width, box / img.height)
      ctx.save()
      roundRectPath(ctx, x, y, box, box, 10)
      ctx.clip()
      ctx.drawImage(img, x + (box - img.width * sc) / 2, y + (box - img.height * sc) / 2, img.width * sc, img.height * sc)
      ctx.restore()
      ctx.strokeStyle = 'rgba(201, 169, 106, 0.9)'
      ctx.lineWidth = 3
      roundRectPath(ctx, x, y, box, box, 10)
      ctx.stroke()
      y += box + 90
    } catch {
      y += 60
    }
  } else {
    y += 80
  }
  // 名号
  ctx.fillStyle = '#2a2620'
  ctx.font = `108px ${DISP}`
  ctx.fillText(ch.name, W / 2, y)
  y += 80
  // 职衔 · 阵营
  ctx.fillStyle = '#8c5b3f'
  ctx.font = `44px ${DISP}`
  ctx.fillText(`${ch.title} · ${f.name}`, W / 2, y)
  y += 100
  // 小传（折行）
  ctx.fillStyle = '#4a443a'
  ctx.font = `37px ${DISP}`
  wrapText(ctx, ch.shortBio, W / 2, y, W - 280, 56, 3)
  // 印章
  ctx.fillStyle = 'rgba(176, 58, 46, 0.9)'
  ctx.fillRect(W - 160, H - 230, 64, 64)
  ctx.fillStyle = '#f4ede0'
  ctx.font = `40px ${DISP}`
  ctx.fillText('图', W - 160 + 32, H - 230 + 44)
  // 落款
  ctx.fillStyle = 'rgba(107, 86, 54, 0.85)'
  ctx.font = `33px ${DISP}`
  ctx.fillText('一船之故 · 汴京一日', W / 2, H - 122)
  ctx.fillStyle = 'rgba(107, 86, 54, 0.55)'
  ctx.font = `28px ${DISP}`
  ctx.fillText('展卷 · 点将 · 观天下', W / 2, H - 78)
  const a = document.createElement('a')
  a.download = `${ch.name} · 众生图鉴.png`
  a.href = cv.toDataURL('image/png')
  a.click()
}

// 浏览器返回键 ↔ 关系栈
let fromPopstate = false
function onPopState() {
  if (nav.detailStack.length > 0) {
    fromPopstate = true
    nav.pop()
    queueMicrotask(() => (fromPopstate = false))
  }
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && nav.detailStack.length > 0) history.back()
}
watch(
  () => nav.detailStack.length,
  (n, o) => {
    if (o === undefined) return
    if (n > o) history.pushState({ qmsht: n }, '')
    else if (n < o && !fromPopstate) history.go(-(o - n))
  },
)

onMounted(() => {
  window.addEventListener('popstate', onPopState)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('popstate', onPopState)
  window.removeEventListener('keydown', onKey)
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
})
</script>

<template>
  <div v-if="c" class="detail">
    <div class="d-bg" aria-hidden="true">
      <img v-if="bgUrl" :src="bgUrl" alt="" />
    </div>
    <div class="d-mask" aria-hidden="true"></div>

    <div class="d-panel" :key="c.id" :class="dir">
      <!-- 头部 -->
      <header class="d-header">
        <div class="d-portrait">
          <img v-if="portraitUrl" :src="portraitUrl" :alt="c.name" />
          <div v-else class="d-portrait-loading">{{ c.name[0] }}</div>
        </div>
        <div class="d-head">
          <button v-if="nav.detailStack.length > 1" class="d-back" @click="back">‹ 上一位</button>
          <h2 class="d-name">{{ c.name }}</h2>
          <div class="d-title">{{ c.title }}</div>
          <div class="d-seal" :style="{ background: faction?.color }">{{ faction?.name }}</div>
        </div>
        <button class="d-close" aria-label="关闭详情" @click="closeAll">
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.6" fill="none">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <!-- 小传 -->
      <section class="d-bio">
        <p class="d-bio-text">{{ c.shortBio }}</p>
      </section>

      <!-- 背景故事 -->
      <section class="d-sec">
        <h3 class="d-h"><i>一</i>背景故事</h3>
        <p v-for="(p, i) in shownStory" :key="i" class="d-p">{{ p }}</p>
        <button v-if="c.story.length > 1" class="d-more" @click="expanded = !expanded">
          {{ expanded ? '收起 ▲' : '展开全文 ▼' }}
        </button>
      </section>

      <!-- 人物设定 -->
      <section class="d-sec">
        <h3 class="d-h"><i>二</i>人物设定</h3>
        <div class="d-grid">
          <div v-for="[k, v] in c.settings" :key="k" class="d-kv">
            <span class="d-k">{{ k }}</span>
            <span class="d-v">{{ v }}</span>
          </div>
        </div>
      </section>

      <!-- 人物关系 -->
      <section class="d-sec">
        <h3 class="d-h"><i>三</i>人物关系<em>（点按识人）</em></h3>
        <ul class="d-rels">
          <li v-for="r in rels" :key="r.relation.from + r.relation.to" class="d-rel" @click="go(r.other.id)">
            <span class="r-avatar">{{ r.other.name[0] }}</span>
            <span class="r-main">
              <span class="r-name">{{ r.other.name }}</span>
              <span class="r-sub">{{ r.other.title }}</span>
            </span>
            <span class="r-label" :data-type="r.relation.type" :title="r.relation.note">{{ r.relation.label }}</span>
          </li>
        </ul>
      </section>

      <!-- 诗韵回响 -->
      <section v-if="echoes.length" class="d-sec">
        <h3 class="d-h"><i>四</i>诗韵回响<em>（点按展开）</em></h3>
        <ul class="d-echoes">
          <li
            v-for="e in echoes"
            :key="e.poem.id"
            class="d-echo"
            :class="{ open: expandedPoemId === e.poem.id }"
            @click="togglePoem(e.poem.id)"
          >
            <span class="e-poem"
              >《{{ e.poem.title }}》{{ e.poem.dynasty }} · {{ e.poem.author }}
              <i class="e-caret" aria-hidden="true">{{ expandedPoemId === e.poem.id ? '▲' : '▼' }}</i></span
            >
            <span class="e-note">{{ e.note }}</span>
            <div v-if="expandedPoemId === e.poem.id" class="e-body">
              <p v-for="(l, i) in e.poem.lines" :key="i" class="e-line">{{ l }}</p>
              <p class="e-eye">「{{ e.poem.eye }}」</p>
              <div v-if="e.poem.links.length > 1" class="e-others">
                <span class="e-others-t">诗里还有</span>
                <button
                  v-for="lk in e.poem.links"
                  :key="lk.charId"
                  v-show="lk.charId !== c.id"
                  class="e-other"
                  @click.stop="go(lk.charId)"
                >
                  {{ charById.get(lk.charId)?.name }}
                </button>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <!-- 操作 -->
      <footer class="d-foot">
        <button class="d-act" @click="viewInRoll">在画卷中查看</button>
        <button class="d-act" @click="viewInGraph">在图谱中查看</button>
        <button class="d-act" @click="shareCard">生成分享卡</button>
        <button class="d-act" @click="speak">听小传</button>
        <button class="d-act" @click="chatOpen = true">与他谈</button>
      </footer>
    </div>
    <ChatOverlay :char="c" :open="chatOpen" @close="chatOpen = false" />
  </div>
</template>

<style scoped>
.detail {
  position: fixed;
  inset: 0;
  z-index: 55;
  overflow: hidden;
}
.d-bg {
  position: absolute;
  inset: 0;
}
.d-bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(14px) brightness(0.42) saturate(0.85);
  transform: scale(1.08);
}
.d-mask {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(27, 26, 23, 0.55), rgba(27, 26, 23, 0.82));
}

.d-panel {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: calc(54px + env(safe-area-inset-top, 0px)) 20px calc(30px + env(safe-area-inset-bottom, 0px));
}
.d-panel.push {
  animation: d-in 0.3s var(--ease-ink);
}
.d-panel.pop {
  animation: d-in-r 0.3s var(--ease-ink);
}
@keyframes d-in {
  from {
    opacity: 0;
    transform: translateX(-28px);
  }
}
@keyframes d-in-r {
  from {
    opacity: 0;
    transform: translateX(28px);
  }
}

/* 头部 */
.d-header {
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  gap: 18px;
  align-items: center;
  position: relative;
}
.d-portrait {
  width: 128px;
  height: 170px;
  flex: none;
  border: 1px solid var(--panel-line);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
  background: var(--night-2);
  overflow: hidden;
}
.d-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.d-portrait-loading {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 52px;
  color: var(--gold);
  opacity: 0.7;
}
.d-head {
  flex: 1;
  min-width: 0;
}
.d-back {
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--text-2);
  border: 1px solid rgba(201, 169, 106, 0.3);
  background: var(--panel);
  padding: 3px 10px;
  margin-bottom: 10px;
}
.d-name {
  font-family: var(--font-display);
  font-size: 34px;
  letter-spacing: 6px;
  line-height: 1.25;
  color: var(--text);
}
.d-title {
  font-size: 13px;
  letter-spacing: 3px;
  color: var(--text-2);
  margin-top: 4px;
}
.d-seal {
  display: inline-block;
  margin-top: 10px;
  font-family: var(--font-display);
  font-size: 12px;
  letter-spacing: 2px;
  color: #f4ede0;
  padding: 3px 8px;
  border-radius: 2px;
  transform: rotate(-2deg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.d-close {
  position: absolute;
  top: calc(-34px + env(safe-area-inset-top, 0px));
  right: 0;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--panel-line);
  border-radius: 50%;
}

/* 区块 */
.d-bio {
  max-width: 760px;
  margin: 22px auto 0;
  border-left: 3px solid var(--cinnabar);
  background: rgba(27, 26, 23, 0.5);
  padding: 12px 16px;
}
.d-bio-text {
  font-size: 15.5px;
  line-height: 1.95;
  color: var(--text);
}
.d-bio-text::first-letter {
  font-family: var(--font-display);
  font-size: 1.5em;
  color: var(--cinnabar);
}

.d-sec {
  max-width: 760px;
  margin: 26px auto 0;
}
.d-h {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: normal;
  letter-spacing: 4px;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.d-h i {
  font-style: normal;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  font-size: 13px;
  color: var(--gold);
  border: 1px solid rgba(201, 169, 106, 0.45);
  border-radius: 2px;
}
.d-h em {
  font-style: normal;
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--text-2);
}
.d-p {
  font-size: 14.5px;
  line-height: 2;
  color: rgba(232, 224, 208, 0.92);
  margin-bottom: 10px;
  text-align: justify;
}
.d-more {
  font-size: 12px;
  letter-spacing: 2px;
  color: var(--gold);
  padding: 4px 0;
}

.d-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.d-kv {
  background: rgba(27, 26, 23, 0.5);
  border: 1px solid rgba(201, 169, 106, 0.18);
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.d-k {
  font-size: 11px;
  letter-spacing: 3px;
  color: var(--text-2);
}
.d-v {
  font-size: 14px;
  color: var(--text);
}

/* 关系 */
.d-rels {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.d-rel {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(27, 26, 23, 0.5);
  border: 1px solid rgba(201, 169, 106, 0.18);
  padding: 9px 12px;
  cursor: pointer;
  transition: border-color 0.2s var(--ease-ink), transform 0.2s var(--ease-ink);
}
.d-rel:hover {
  border-color: var(--gold);
  transform: translateX(3px);
}
.r-avatar {
  width: 38px;
  height: 38px;
  flex: none;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 19px;
  color: #f4ede0;
  background: var(--dai);
  border-radius: 3px;
}
.r-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.r-name {
  font-family: var(--font-display);
  font-size: 15px;
  letter-spacing: 2px;
  color: var(--text);
}
.r-sub {
  font-size: 11px;
  color: var(--text-2);
  letter-spacing: 1px;
}
.r-label {
  flex: none;
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--text);
  border: 1px solid;
  padding: 2px 8px;
  border-radius: 2px;
}
.r-label[data-type='kinship'] {
  color: #d98a80;
  border-color: rgba(176, 58, 46, 0.6);
}
.r-label[data-type='trade'] {
  color: #c49a7c;
  border-color: rgba(140, 91, 63, 0.6);
}
.r-label[data-type='companion'] {
  color: #8fb3ba;
  border-color: rgba(62, 92, 99, 0.7);
}
.r-label[data-type='hire'] {
  color: #a8b494;
  border-color: rgba(92, 107, 79, 0.7);
}
.r-label[data-type='crowd'] {
  color: var(--text-2);
  border-color: rgba(107, 98, 87, 0.6);
}
.r-label[data-type='conflict'] {
  color: #cf6a5a;
  border-color: rgba(122, 46, 36, 0.8);
}

/* 底部操作 */
.d-echoes {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.d-echo {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid var(--panel-line);
  background: rgba(201, 169, 106, 0.05);
  cursor: pointer;
  transition: border-color 0.2s;
}
.d-echo:hover {
  border-color: var(--gold);
}
.e-poem {
  font-family: var(--font-display);
  font-size: 13.5px;
  letter-spacing: 1px;
  color: var(--gold);
}
.e-note {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-2);
}
.d-echo.open {
  border-color: var(--gold);
}
.e-caret {
  margin-left: 6px;
  font-style: normal;
  font-size: 10px;
  color: var(--text-2);
}
.e-body {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--panel-line);
  animation: echo-in 0.25s var(--ease-ink);
}
@keyframes echo-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
.e-line {
  margin: 2px 0;
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 2px;
  line-height: 1.9;
  color: var(--text);
}
.e-eye {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--gold);
  opacity: 0.9;
}
.e-others {
  margin-top: 8px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.e-others-t {
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--text-2);
}
.e-other {
  font-family: var(--font-display);
  font-size: 12.5px;
  letter-spacing: 1px;
  color: var(--gold);
  background: rgba(201, 169, 106, 0.06);
  border: 1px solid var(--panel-line);
  padding: 3px 10px;
  transition: border-color 0.2s;
}
.e-other:hover {
  border-color: var(--gold);
}

.d-foot {
  max-width: 760px;
  margin: 30px auto 0;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.d-foot .d-act {
  flex: 1 1 40%;
}
.d-act {
  flex: 1;
  font-family: var(--font-display);
  font-size: 15px;
  letter-spacing: 4px;
  color: var(--text);
  background: rgba(27, 26, 23, 0.6);
  border: 1px solid var(--panel-line);
  padding: 11px 0;
  transition: all 0.25s var(--ease-ink);
}
.d-act:hover {
  border-color: var(--cinnabar);
  color: #fff;
  box-shadow: 0 0 16px rgba(176, 58, 46, 0.25);
}

/* 桌面双栏 */
@media (min-width: 1024px) {
  .d-panel {
    padding: calc(70px + env(safe-area-inset-top, 0px)) 48px 48px;
  }
  .d-header {
    max-width: 960px;
  }
  .d-portrait {
    width: 200px;
    height: 266px;
  }
  .d-name {
    font-size: 44px;
  }
  .d-bio,
  .d-sec {
    max-width: 960px;
  }
  .d-foot {
    max-width: 960px;
  }
  .d-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
