<script setup lang="ts">
import { onMounted } from 'vue'
import { useMusicStore } from '@/stores/music'

const music = useMusicStore()
onMounted(() => music.boot())
</script>

<template>
  <div class="music-wrap">
    <button class="music-btn" :class="{ playing: music.playing }" aria-label="音乐开关" @click="music.toggle">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <!-- 琴弦 -->
        <path d="M4 9c4-3 12-3 16 0M4 12c4-2.4 12-2.4 16 0M4 15c4-1.8 12-1.8 16 0" />
        <circle cx="12" cy="12" r="0.5" fill="currentColor" />
      </svg>
      <span class="wave" v-if="music.playing" aria-hidden="true"></span>
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
