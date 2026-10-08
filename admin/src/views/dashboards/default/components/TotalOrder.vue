<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { UsersIcon } from 'vue-tabler-icons';
import { summary, visitorActivity } from '../overviewData';

const tab = ref<'30m' | '1h' | '24h'>('30m');
const visitors = ref(summary.liveVisitors.value);

// Simulated live update every 5s. Replace with a real-time API / websocket later.
let timer: number | undefined;
onMounted(() => {
  timer = window.setInterval(() => {
    visitors.value = Math.max(0, visitors.value + Math.round((Math.random() - 0.45) * 8));
  }, 5000);
});
onUnmounted(() => window.clearInterval(timer));

const chartOptions = {
  chart: { type: 'area', height: 90, fontFamily: 'inherit', foreColor: '#a1aab2', sparkline: { enabled: true } },
  dataLabels: { enabled: false },
  colors: ['#fff'],
  fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0 } },
  stroke: { curve: 'smooth', width: 2 },
  tooltip: { theme: 'light', fixed: { enabled: false }, x: { show: false }, y: { title: { formatter: () => 'Visitors' } }, marker: { show: false } }
};
const series = computed(() => [{ name: 'Visitors', data: visitorActivity[tab.value] }]);
</script>

<template>
  <v-card elevation="0" class="h-100 bg-primary overflow-hidden bubble-shape bubble-primary-shape">
    <v-card-text>
      <div class="d-flex align-start mb-3">
        <v-btn icon rounded="sm" color="darkprimary" variant="flat">
          <UsersIcon stroke-width="1.5" width="20" />
        </v-btn>
        <div class="ml-auto z-1">
          <v-tabs v-model="tab" class="theme-tab" density="compact" align-tabs="end">
            <v-tab value="30m" hide-slider color="transparent">30 Min</v-tab>
            <v-tab value="1h" hide-slider color="transparent">1 Hour</v-tab>
            <v-tab value="24h" hide-slider color="transparent">24 Hours</v-tab>
          </v-tabs>
        </div>
      </div>
      <v-row class="z-1">
        <v-col cols="6">
          <h2 class="text-h1 font-weight-medium">{{ visitors }}</h2>
          <div class="text-subtitle-1 text-white">Live Visitors</div>
          <div class="live-now text-caption text-white mt-1"><span class="live-dot" />Live now</div>
        </v-col>
        <v-col cols="6">
          <apexchart type="area" height="90" :options="chartOptions" :series="series" />
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<style scoped lang="scss">
.live-now {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
}
.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #7e9b83;
  box-shadow: 0 0 0 0 rgba(126, 155, 131, 0.7);
  animation: live-pulse 1.8s infinite;
}
@keyframes live-pulse {
  70% {
    box-shadow: 0 0 0 7px rgba(126, 155, 131, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(126, 155, 131, 0);
  }
}
</style>
