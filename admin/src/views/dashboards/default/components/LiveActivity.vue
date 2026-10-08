<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { CoinIcon, UserPlusIcon, HeartIcon, EyeIcon } from 'vue-tabler-icons';
import { liveActivity, type ActivityKind } from '../overviewData';

const icons = { support: CoinIcon, supporter: UserPlusIcon, blessing: HeartIcon, view: EyeIcon };
const tints: Record<ActivityKind, { bg: string; fg: string }> = {
  support: { bg: '#FFBE0026', fg: '#B88600' },
  supporter: { bg: '#7E9B8326', fg: '#5f7d65' },
  blessing: { bg: '#ede7f6', fg: '#5e35b1' },
  view: { bg: '#e3f2fd', fg: '#1e88e5' }
};

const items = ref(liveActivity.map((a) => ({ ...a })));

// Simulated live feed. Replace with a websocket / polling API later.
const samples = [
  { kind: 'support', title: 'New $11 support received', channel: 'Create & Inspire' },
  { kind: 'blessing', title: 'New blessing received', channel: 'The Guiding Light' },
  { kind: 'supporter', title: 'New supporter joined', channel: 'El Elegido 1111' },
  { kind: 'view', title: 'New channel viewed', channel: 'Noble Soul' }
] as const;
let timer: number | undefined;
onMounted(() => {
  timer = window.setInterval(() => {
    const s = samples[Math.floor(Math.random() * samples.length)];
    items.value = [{ ...s, ago: 'just now' }, ...items.value].slice(0, 5);
  }, 12000);
});
onUnmounted(() => window.clearInterval(timer));
</script>

<template>
  <v-card elevation="0" class="h-100">
    <v-card variant="outlined" class="h-100">
      <v-card-text>
        <div class="d-flex align-center mb-3">
          <h4 class="text-h4 mt-1">Live Activity</h4>
          <span class="ml-3 live"><span class="live-dot" />Live</span>
        </div>
        <div v-for="(a, i) in items" :key="a.title + a.ago + i" class="d-flex align-center py-3 feed-row">
          <div class="icon-wrap mr-4" :style="{ background: tints[a.kind].bg, color: tints[a.kind].fg }">
            <component :is="icons[a.kind]" stroke-width="1.5" width="20" />
          </div>
          <div>
            <div class="font-weight-medium">{{ a.title }}</div>
            <div class="text-subtitle-2 text-disabled">{{ a.channel }}</div>
          </div>
          <div class="ml-auto text-caption text-disabled">{{ a.ago }}</div>
        </div>
      </v-card-text>
    </v-card>
  </v-card>
</template>

<style scoped lang="scss">
.feed-row + .feed-row {
  border-top: 1px solid #e2e6e3;
}
.icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #5f7d65;
}
.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #7e9b83;
  animation: blink 1.6s infinite;
}
</style>
