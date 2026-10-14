<script setup lang="ts">
import { computed } from 'vue';
import { UsersIcon } from 'vue-tabler-icons';
import { useDashboard } from '../useDashboard';

const { live } = useDashboard();
const visitors = computed(() => live.value?.online ?? 0);

const chartOptions = {
  chart: { type: 'area', height: 90, fontFamily: 'inherit', foreColor: '#a1aab2', sparkline: { enabled: true } },
  dataLabels: { enabled: false },
  colors: ['#fff'],
  fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0 } },
  stroke: { curve: 'smooth', width: 2 },
  tooltip: { theme: 'light', fixed: { enabled: false }, x: { show: false }, y: { title: { formatter: () => 'Visitors ' } }, marker: { show: false } }
};
const series = computed(() => [{ name: 'Visitors', data: live.value?.hourly ?? [] }]);
</script>

<template>
  <v-card elevation="0" class="h-100 bg-primary overflow-hidden bubble-shape bubble-primary-shape">
    <v-card-text>
      <div class="d-flex align-start mb-3">
        <v-btn icon rounded="sm" color="darkprimary" variant="flat">
          <UsersIcon stroke-width="1.5" width="20" />
        </v-btn>
        <div class="ml-auto z-1 text-caption text-white" style="opacity: 0.8">Last 24 hours</div>
      </div>
      <v-row class="z-1">
        <v-col cols="6">
          <h2 class="text-h1 font-weight-medium">{{ visitors }}</h2>
          <div class="text-subtitle-1 text-white">Live Visitors</div>
          <div class="live-now text-caption text-white mt-1"><span class="live-dot" />Last 5 minutes</div>
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
