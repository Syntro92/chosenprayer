<script setup lang="ts">
import { computed } from 'vue';
import { CoinIcon, UserPlusIcon, HeartIcon } from 'vue-tabler-icons';
import { timeAgo } from '@/utils/format';
import { useDashboard } from '../useDashboard';

type Kind = 'support' | 'supporter' | 'blessing';
const icons = { support: CoinIcon, supporter: UserPlusIcon, blessing: HeartIcon };
const tints: Record<Kind, { bg: string; fg: string }> = {
  support: { bg: '#FFBE0026', fg: '#B88600' },
  supporter: { bg: '#7E9B8326', fg: '#5f7d65' },
  blessing: { bg: '#ede7f6', fg: '#5e35b1' }
};

const { dashboard } = useDashboard();
const items = computed(() => (dashboard.value?.activity ?? []).slice(0, 6));
</script>

<template>
  <v-card elevation="0" class="h-100">
    <v-card variant="outlined" class="h-100">
      <v-card-text>
        <div class="d-flex align-center mb-3">
          <h4 class="text-h4 mt-1">Live Activity</h4>
          <span class="ml-3 live"><span class="live-dot" />Updates every 30 s</span>
        </div>
        <div v-if="!items.length" class="text-disabled py-4">Nothing has happened yet.</div>
        <div v-for="(a, i) in items" :key="a.at + i" class="d-flex align-center py-3 feed-row">
          <div class="icon-wrap mr-4" :style="{ background: tints[a.kind].bg, color: tints[a.kind].fg }">
            <component :is="icons[a.kind]" stroke-width="1.5" width="20" />
          </div>
          <div>
            <div class="font-weight-medium">{{ a.title }}</div>
            <div v-if="a.channel" class="text-subtitle-2 text-disabled">{{ a.channel }}</div>
          </div>
          <div class="ml-auto text-caption text-disabled">{{ timeAgo(a.at) }}</div>
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
