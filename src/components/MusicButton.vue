<script setup lang="ts">
import { onMounted } from 'vue'
import { useMusicStore } from '@/stores/music'
import { useSceneFxStore } from '@/stores/sceneFx'

const music = useMusicStore()
const fx = useSceneFxStore()
onMounted(() => music.boot())
</script>

<template>
  <div class="music-wrap">
    <button class="music-btn" :class="{ playing: music.playing }" aria-label="音乐开关" @click="music.toggle">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <!-- 音符：双八分音符 -->
        <path d="M9 18V5l12-2v13" stroke-linejoin="round" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
      <span class="wave" v-if="music.playing" aria-hidden="true"></span>
    </button>
    <!-- 环境音（四区联动，Web Audio 合成） -->
    <button
      class="fx-btn"
      :class="{ on: fx.ambientOn }"
      :aria-label="fx.ambientOn ? '关闭环境音' : '开启环境音'"
      @click="fx.ambientOn = !fx.ambientOn"
    >
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <!-- 水波 -->
        <path d="M3 10c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
        <path d="M3 15c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" opacity="0.55" />
      </svg>
    </button>
    <!-- 昼夜时辰：白昼 → 暮色 → 夜 -->
    <button
      class="fx-btn"
      :class="{ on: fx.phase !== 'day' }"
      aria-label="切换时辰"
      @click="fx.cyclePhase()"
    >
      <svg v-if="fx.phase === 'day'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" />
      </svg>
      <svg v-else-if="fx.phase === 'dusk'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M17 18a5 5 0 0 0-10 0" />
        <path d="M12 9.5V3M5.4 6.4 7 8M18.6 6.4 17 8M2.5 18h19" />
      </svg>
      <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M20 13A8.5 8.5 0 1 1 11 4a7 7 0 0 0 9 9z" />
      </svg>
    </button>
    <transition name="toast">
      <div v-if="music.toast" class="toast">{{ music.toast }}</div>
    </transition>
  </div>
</template>

<style scoped>
.music-wrap {
  position: fixed;
  right: 14px;
  bottom: calc(var(--tabbar-h) + var(--safe-b) + 14px);
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.music-btn {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--panel-line);
  position: relative;
  transition: transform 0.2s var(--ease-ink);
}
.music-btn:active {
  transform: scale(0.92);
}
.music-btn.playing svg {
  animation: strum 1.6s ease-in-out infinite;
}
@keyframes strum {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(1.5px);
  }
}
.fx-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--text-2);
  background: var(--panel);
  border: 1px solid rgba(201, 169, 106, 0.25);
  transition:
    color 0.25s var(--ease-ink),
    border-color 0.25s var(--ease-ink),
    transform 0.2s var(--ease-ink);
}
.fx-btn:active {
  transform: scale(0.92);
}
.fx-btn.on {
  color: var(--text);
  border-color: var(--gold);
  box-shadow: 0 0 8px rgba(201, 169, 106, 0.25);
}
.wave {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1px solid rgba(201, 169, 106, 0.5);
  animation: wave 2s var(--ease-ink) infinite;
}
@keyframes wave {
  0% {
    transform: scale(1);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}
.toast {
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--panel-line);
  padding: 5px 12px;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s var(--ease-ink), transform 0.25s var(--ease-ink);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
