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
    <!-- 展卷：绢帛自中向两侧展开，轴杆随绢缘同步外移
         （真实卷轴展开时余卷半径 ∝ √(1-p)，绢长进度呈先慢后快，故取 ease-in 二次曲线） -->
    <div class="silk" aria-hidden="true">
      <div class="silk-paper"></div>
      <div class="dowel dowel-l"></div>
      <div class="dowel dowel-r"></div>
    </div>
    <div class="intro-inner">
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

/* 绢帛（长卷本体） */
.silk {
  position: absolute;
  left: 7vw;
  right: 7vw;
  top: 50%;
  height: min(58vh, 430px);
  transform: translateY(-50%);
}
.silk-paper {
  position: absolute;
  inset: 0;
  transform: scaleX(0);
  animation: silk-open 1.15s cubic-bezier(0.11, 0, 0.5, 0) 0.1s forwards;
  background:
    repeating-linear-gradient(90deg, rgba(201, 169, 106, 0.05) 0 1px, transparent 1px 7px),
    linear-gradient(180deg, rgba(244, 237, 224, 0.04), rgba(244, 237, 224, 0.09) 50%, rgba(244, 237, 224, 0.04));
  border-top: 1px solid rgba(201, 169, 106, 0.28);
  border-bottom: 1px solid rgba(201, 169, 106, 0.28);
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.35) inset;
}
@keyframes silk-open {
  to {
    transform: scaleX(1);
  }
}

/* 轴杆：与绢缘同速外移（同一缓动曲线） */
.dowel {
  position: absolute;
  top: -14px;
  bottom: -14px;
  width: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, #2c2418, #6b5636 50%, #2c2418);
  box-shadow: 0 0 14px rgba(0, 0, 0, 0.6);
}
.dowel-l {
  left: calc(50% - 6px);
  animation: dowel-l 1.15s cubic-bezier(0.11, 0, 0.5, 0) 0.1s forwards;
}
.dowel-r {
  right: calc(50% - 6px);
  animation: dowel-r 1.15s cubic-bezier(0.11, 0, 0.5, 0) 0.1s forwards;
}
@keyframes dowel-l {
  to {
    left: 0;
  }
}
@keyframes dowel-r {
  to {
    right: 0;
  }
}

.intro-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 48px 56px;
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
  .silk {
    left: 4vw;
    right: 4vw;
  }
}
</style>
