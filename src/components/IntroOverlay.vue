<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const visible = ref(true)
let timer = 0

function close() {
  if (!visible.value) return
  visible.value = false
}

onMounted(() => {
  // 2.5s 自动结束；任意点按跳过
  timer = window.setTimeout(close, 2500)
})
onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <div v-if="visible" class="intro" @pointerdown="close" role="presentation">
    <div class="intro-inner">
      <div class="bar bar-l" aria-hidden="true"></div>
      <div class="bar bar-r" aria-hidden="true"></div>
      <div class="intro-title">清明上河图</div>
      <div class="intro-sub">众 生 图 鉴</div>
      <div class="intro-stamp" aria-hidden="true">展</div>
    </div>
  </div>
</template>

<style scoped>
.intro {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: var(--night);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: intro-out 0.4s ease 2.05s forwards;
  cursor: pointer;
}
@keyframes intro-out {
  to {
    opacity: 0;
    visibility: hidden;
  }
}

.intro-inner {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 48px 56px;
}

/* 卷轴杆：自中向两侧展开 */
.bar {
  position: absolute;
  top: -22px;
  bottom: -22px;
  width: 10px;
  background: linear-gradient(90deg, #3a2f22, #6b5636 50%, #3a2f22);
  border-radius: 5px;
  left: calc(50% - 5px);
}
.bar-l {
  animation: bar-l 0.9s var(--ease-ink) forwards;
}
.bar-r {
  animation: bar-r 0.9s var(--ease-ink) forwards;
}
@keyframes bar-l {
  to {
    left: 0;
  }
}
@keyframes bar-r {
  to {
    left: calc(100% - 10px);
  }
}

.intro-title {
  font-family: var(--font-display);
  font-size: 44px;
  letter-spacing: 10px;
  color: var(--text);
  opacity: 0;
  animation: fade-up 0.7s var(--ease-ink) 0.55s forwards;
}
.intro-sub {
  font-family: var(--font-display);
  font-size: 15px;
  letter-spacing: 12px;
  text-indent: 12px;
  color: var(--gold);
  opacity: 0;
  animation: fade-up 0.7s var(--ease-ink) 1.05s forwards;
}
.intro-stamp {
  margin-top: 10px;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 24px;
  color: #f4ede0;
  background: var(--cinnabar);
  border-radius: 4px;
  transform: scale(0);
  animation: stamp 0.35s var(--ease-ink) 1.6s forwards;
  box-shadow: 0 2px 12px rgba(176, 58, 46, 0.5);
}
@keyframes stamp {
  0% {
    transform: scale(1.6) rotate(-8deg);
    opacity: 0;
  }
  100% {
    transform: scale(1) rotate(0);
    opacity: 1;
  }
}
@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 480px) {
  .intro-title {
    font-size: 34px;
    letter-spacing: 7px;
  }
  .intro-inner {
    padding: 40px 40px;
  }
}
</style>
