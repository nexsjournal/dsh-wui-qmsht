<script setup lang="ts">
import { useNavStore } from '@/stores/nav'

const nav = useNavStore()
</script>

<template>
  <nav class="tabbar" aria-label="主导航">
    <button class="tab" :class="{ active: nav.mode === 'roll' }" @click="nav.setMode('roll')">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <!-- 卷轴 -->
        <path d="M4 5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h1M4 5h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4" />
        <path d="M22 7c0-1.1-.9-2-2-2H8" opacity="0" />
        <path d="M7 9h7M7 12h9M7 15h6" />
      </svg>
      <span>展卷</span>
    </button>
    <button class="tab" :class="{ active: nav.mode === 'graph' }" @click="nav.setMode('graph')">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <!-- 图谱 -->
        <circle cx="6" cy="6" r="2.4" />
        <circle cx="18" cy="8" r="2.4" />
        <circle cx="12" cy="18" r="2.4" />
        <path d="M8 7.2 15.8 8M7 8.2l4 7.6M17 10l-3.6 6" />
      </svg>
      <span>图谱</span>
    </button>
  </nav>
</template>

<style scoped>
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  height: calc(var(--tabbar-h) + var(--safe-b));
  padding-bottom: var(--safe-b);
  display: flex;
  background: rgba(27, 26, 23, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid rgba(201, 169, 106, 0.22);
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: var(--text-2);
  position: relative;
  transition: color 0.25s var(--ease-ink);
}
.tab span {
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 4px;
  text-indent: 4px;
}
.tab svg {
  transition: transform 0.25s var(--ease-ink);
}
.tab.active {
  color: var(--cinnabar);
}
.tab.active span {
  color: var(--text);
}
.tab.active::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cinnabar);
  box-shadow: 0 0 8px rgba(176, 58, 46, 0.8);
}
.tab:active svg {
  transform: scale(0.9);
}
</style>
