<script setup lang="ts">
import { ref } from 'vue'
import { charById, world } from '@/data'
import { useNavStore } from '@/stores/nav'

const nav = useNavStore()
const poems = world.poems

/** 当前展开的诗（默认展开第一首，让「诗中之人」跳转一眼可见） */
const openId = ref<string | null>(poems[0]?.id ?? null)

function toggle(id: string) {
  openId.value = openId.value === id ? null : id
}

/** 诗中之人 → 回展卷，镜头飞到该人物并高亮 */
function gotoChar(charId: string, src?: string) {
  nav.focusInRoll(charId, src)
}
</script>

<template>
  <div class="poem-view">
    <div class="pv-scroll">
      <header class="pv-head">
        <h1 class="pv-title">清明诗韵</h1>
        <p class="pv-sub">{{ poems.length }} 首 · 诗里藏着画中人，点「诗中之人」回长卷里找他</p>
      </header>

      <article
        v-for="p in poems"
        :key="p.id"
        class="pv-card"
        :class="{ open: openId === p.id }"
      >
        <header class="pv-card-head" @click="toggle(p.id)">
          <span class="pv-tag">{{ p.tag }}</span>
          <span class="pv-t">《{{ p.title }}》</span>
          <span class="pv-a">{{ p.dynasty }} · {{ p.author }}</span>
          <span class="pv-caret" aria-hidden="true">{{ openId === p.id ? '▲' : '▼' }}</span>
        </header>
        <div v-if="openId === p.id" class="pv-body" :key="p.id + '-body'">
          <p v-for="(l, i) in p.lines" :key="i" class="pv-line">{{ l }}</p>
          <p class="pv-eye">诗眼 · {{ p.eye }}</p>
          <div class="pv-links">
            <span class="pv-links-t">诗中之人</span>
            <button
              v-for="lk in p.links"
              :key="lk.charId"
              class="pv-link"
              @click="gotoChar(lk.charId, p.title)"
            >
              <b>{{ charById.get(lk.charId)?.name }}</b>
              <span>{{ lk.note }}</span>
            </button>
          </div>
        </div>
      </article>

      <footer class="pv-foot">— 诗词据通行本 · 与画境相映处皆为演绎 —</footer>
    </div>
  </div>
</template>

<style scoped>
.poem-view {
  position: absolute;
  inset: 0 0 calc(var(--tabbar-h) + var(--safe-b)) 0;
  background: radial-gradient(ellipse at 50% 20%, rgba(176, 58, 46, 0.08), transparent 55%), var(--night);
  overflow: hidden;
}
.pv-scroll {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: calc(20px + env(safe-area-inset-top, 0px)) 16px 32px;
}
.pv-head {
  max-width: 720px;
  margin: 0 auto 18px;
  text-align: center;
}
.pv-title {
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: normal;
  letter-spacing: 10px;
  text-indent: 10px;
  color: var(--text);
}
.pv-sub {
  margin-top: 8px;
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--text-2);
}
.pv-card {
  max-width: 720px;
  margin: 0 auto 12px;
  background: var(--panel);
  border: 1px solid var(--panel-line);
  transition: border-color 0.25s var(--ease-ink);
}
.pv-card.open {
  border-color: rgba(201, 169, 106, 0.55);
}
.pv-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  cursor: pointer;
}
.pv-tag {
  flex: none;
  font-size: 10.5px;
  letter-spacing: 2px;
  color: var(--gold);
  border: 1px solid rgba(201, 169, 106, 0.4);
  padding: 2px 7px;
}
.pv-t {
  font-family: var(--font-display);
  font-size: 16.5px;
  letter-spacing: 2px;
  color: var(--text);
}
.pv-a {
  margin-left: auto;
  font-size: 11.5px;
  letter-spacing: 1px;
  color: var(--text-2);
}
.pv-caret {
  font-size: 10px;
  color: var(--text-2);
}
.pv-body {
  padding: 2px 16px 16px;
  animation: pv-in 0.3s var(--ease-ink);
}
@keyframes pv-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
.pv-line {
  margin: 6px 0 0;
  font-family: var(--font-display);
  font-size: 15px;
  letter-spacing: 3px;
  line-height: 2;
  color: var(--text);
}
.pv-eye {
  margin: 10px 0 0;
  padding-left: 10px;
  border-left: 2px solid var(--cinnabar);
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--gold);
}
.pv-links {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pv-links-t {
  font-size: 11px;
  letter-spacing: 3px;
  color: var(--text-2);
}
.pv-link {
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
  padding: 10px 12px;
  background: rgba(201, 169, 106, 0.05);
  border: 1px solid var(--panel-line);
  transition:
    border-color 0.2s var(--ease-ink),
    transform 0.2s var(--ease-ink);
}
.pv-link:hover {
  border-color: var(--gold);
  transform: translateX(3px);
}
.pv-link b {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: normal;
  letter-spacing: 2px;
  color: var(--gold);
}
.pv-link span {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-2);
}
.pv-foot {
  max-width: 720px;
  margin: 22px auto 0;
  text-align: center;
  font-size: 11px;
  letter-spacing: 2px;
  color: rgba(232, 224, 208, 0.4);
}
</style>
