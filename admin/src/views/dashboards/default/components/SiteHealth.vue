<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { siteHealth, palette } from '../overviewData';

// Simulated auto-refresh every 30s. Replace with a real health-check API later.
const checkedAt = ref(Date.now());
const now = ref(Date.now());
let timer: number | undefined;
onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now();
    if (now.value - checkedAt.value >= 30000) checkedAt.value = now.value;
  }, 5000);
});
onUnmounted(() => window.clearInterval(timer));

const lastChecked = computed(() => {
  const s = Math.floor((now.value - checkedAt.value) / 1000);
  return s < 10 ? 'Just now' : `${s} seconds ago`;
});
const allOk = computed(() => siteHealth.every((s) => s.status === 'Operational'));
const dot = (status: string) => (status === 'Operational' ? palette.success : status === 'Degraded' ? palette.warning : palette.error);
</script>

<template>
  <v-card elevation="0" class="h-100">
    <v-card variant="outlined" class="h-100">
      <v-card-text>
        <h4 class="text-h4 mt-1 mb-4">Site Health</h4>
        <div v-for="s in siteHealth" :key="s.name" class="d-flex align-center py-2">
          <span class="dot mr-3" :style="{ background: dot(s.status) }" />
          <span class="font-weight-medium">{{ s.name }}</span>
          <span class="ml-auto text-subtitle-2" :style="{ color: dot(s.status) }">{{ s.status }}</span>
        </div>
        <v-divider class="my-3" />
        <div class="font-weight-medium" :style="{ color: allOk ? palette.success : palette.warning }">
          {{ allOk ? 'All systems operational' : 'Some systems need attention' }}
        </div>
        <div class="text-caption text-disabled">Last checked: {{ lastChecked }}</div>
      </v-card-text>
    </v-card>
  </v-card>
</template>

<style scoped>
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
</style>
