<script setup lang="ts">
import { world } from '@/data'

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="world" role="dialog" aria-label="世界观">
    <button class="w-close" aria-label="关闭" @click="emit('close')">
      <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="1.6" fill="none">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>

    <div class="w-scroll">
      <header class="w-head">
        <div class="w-seal" aria-hidden="true">卷</div>
        <h1 class="w-title">一船之故 · 汴京一日</h1>
        <p class="w-sub">清明上河图 · 众生图鉴 · 世界书</p>
      </header>

      <section v-for="(ch, ci) in world.chapters" :key="ci" class="w-chap">
        <h2 class="w-h">{{ ch.title }}</h2>
        <p v-for="(p, i) in ch.paras" :key="i" class="w-p">{{ p }}</p>

        <ul v-if="ch.timeline" class="w-timeline">
          <li v-for="(t, i) in world.timeline" :key="i" class="w-tl">
            <span class="w-tl-time">{{ t.time }}</span>
            <span class="w-tl-dot"></span>
            <span class="w-tl-event">{{ t.event }}<em>（{{ t.scene }}）</em></span>
          </li>
        </ul>

        <table v-if="ch.glossary" class="w-gloss">
          <tr v-for="g in world.glossary" :key="g.term">
            <td class="w-g-term">{{ g.term }}</td>
            <td class="w-g-def">{{ g.def }}</td>
          </tr>
        </table>
      </section>

      <!-- 阵营 -->
      <section class="w-chap">
        <h2 class="w-h">阵营色识</h2>
        <div class="w-facs">
          <div v-for="f in world.factions" :key="f.id" class="w-fac">
            <span class="w-fac-dot" :style="{ background: f.color }"></span>
            <div>
              <b>{{ f.name }}</b>
              <p>{{ f.desc }}</p>
            </div>
          </div>
        </div>
      </section>

      <footer class="w-foot">— 据画面考据 · 人物皆为演绎 —</footer>
    </div>
  </div>
</template>

<style scoped>
.world {
  position: fixed;
  inset: 0;
  z-index: 58;
  background: var(--night);
  overflow: hidden;
}
.w-close {
  position: absolute;
  top: calc(16px + env(safe-area-inset-top, 0px));
  right: 16px;
  z-index: 2;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--panel-line);
  border-radius: 50%;
}
.w-scroll {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: calc(70px + env(safe-area-inset-top, 0px)) 20px calc(50px + env(safe-area-inset-bottom, 0px));
}
.w-head {
  max-width: 720px;
  margin: 0 auto 40px;
  text-align: center;
}
.w-seal {
  width: 52px;
  height: 52px;
  margin: 0 auto 16px;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 30px;
  color: #f4ede0;
  background: rgba(176, 58, 46, 0.85);
  border-radius: 5px;
  transform: rotate(-3deg);
}
.w-title {
  font-family: var(--font-display);
  font-size: 30px;
  letter-spacing: 8px;
  font-weight: normal;
  color: var(--text);
}
.w-sub {
  margin-top: 8px;
  font-size: 12px;
  letter-spacing: 3px;
  color: var(--text-2);
}

.w-chap {
  max-width: 720px;
  margin: 0 auto 36px;
}
.w-h {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: normal;
  letter-spacing: 6px;
  color: var(--text);
  margin-bottom: 14px;
  padding-left: 14px;
  border-left: 3px solid var(--cinnabar);
}
.w-p {
  font-size: 14.5px;
  line-height: 2.1;
  color: rgba(232, 224, 208, 0.9);
  margin-bottom: 10px;
  text-align: justify;
}

.w-timeline {
  list-style: none;
  margin-top: 8px;
}
.w-tl {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed rgba(201, 169, 106, 0.2);
}
.w-tl-time {
  flex: none;
  width: 92px;
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 1px;
  color: var(--gold);
}
.w-tl-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cinnabar);
  transform: translateY(-2px);
}
.w-tl-event {
  font-size: 13.5px;
  line-height: 1.8;
  color: rgba(232, 224, 208, 0.88);
}
.w-tl-event em {
  font-style: normal;
  color: var(--text-2);
  font-size: 12px;
}

.w-gloss {
  width: 100%;
  border-collapse: collapse;
}
.w-g-term {
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--gold);
  letter-spacing: 2px;
  padding: 8px 14px 8px 0;
  white-space: nowrap;
  vertical-align: top;
}
.w-g-def {
  font-size: 13.5px;
  line-height: 1.8;
  color: rgba(232, 224, 208, 0.88);
  padding: 8px 0;
  border-top: 1px dashed rgba(201, 169, 106, 0.18);
}

.w-facs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.w-fac {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: rgba(27, 26, 23, 0.5);
  border: 1px solid rgba(201, 169, 106, 0.18);
  padding: 10px 14px;
}
.w-fac-dot {
  flex: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 6px;
}
.w-fac b {
  font-family: var(--font-display);
  font-size: 15px;
  letter-spacing: 2px;
  font-weight: normal;
  color: var(--text);
}
.w-fac p {
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-2);
  margin-top: 2px;
}

.w-foot {
  max-width: 720px;
  margin: 10px auto 0;
  text-align: center;
  font-size: 11.5px;
  letter-spacing: 3px;
  color: var(--text-2);
  opacity: 0.7;
}

@media (min-width: 1024px) {
  .w-title {
    font-size: 38px;
  }
  .w-p {
    font-size: 15.5px;
  }
}
</style>
