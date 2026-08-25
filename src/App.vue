<script setup lang="ts">
import { ref } from 'vue'
import { useNavStore } from '@/stores/nav'
import RollView from '@/views/RollView.vue'
import GraphView from '@/views/GraphView.vue'
import DetailView from '@/views/DetailView.vue'
import TabBar from '@/components/TabBar.vue'
import MusicButton from '@/components/MusicButton.vue'
import IntroOverlay from '@/components/IntroOverlay.vue'

const nav = useNavStore()
const rollRef = ref<InstanceType<typeof RollView> | null>(null)
</script>

<template>
  <div class="app">
    <!-- 画卷常驻（保留镜头状态），图谱按需挂载 -->
    <RollView ref="rollRef" v-show="nav.mode === 'roll'" />
    <GraphView v-if="nav.mode === 'graph'" />
    <DetailView v-if="nav.detail" :model-value="rollRef" />
    <MusicButton />
    <TabBar />
    <IntroOverlay />
    <div class="noise" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.app {
  position: fixed;
  inset: 0;
  overflow: hidden;
}
</style>
