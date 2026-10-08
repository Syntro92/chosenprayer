<script setup lang="ts">
import { supportBreakdown, money } from '../overviewData';

const options = {
  chart: { type: 'donut', fontFamily: 'inherit', sparkline: { enabled: true } },
  labels: supportBreakdown.map((s) => s.label),
  colors: supportBreakdown.map((s) => s.color),
  legend: { show: false },
  dataLabels: { enabled: false },
  stroke: { width: 2 },
  plotOptions: { pie: { donut: { size: '72%' } } },
  tooltip: { y: { formatter: (v: number) => money(v) } }
};
const series = supportBreakdown.map((s) => s.amount);
</script>

<template>
  <v-card elevation="0" class="h-100">
    <v-card variant="outlined" class="h-100">
      <v-card-text>
        <h4 class="text-h4 mt-1 mb-4">Support Breakdown</h4>
        <div class="d-flex justify-center">
          <apexchart type="donut" width="200" height="200" :options="options" :series="series" />
        </div>
        <div v-for="s in supportBreakdown" :key="s.label" class="d-flex align-center py-2">
          <span class="dot mr-3" :style="{ background: s.color }" />
          <span class="font-weight-medium">{{ s.label }}</span>
          <span class="ml-auto font-weight-medium">{{ money(s.amount) }}</span>
          <span class="ml-3 text-disabled" style="width: 36px; text-align: right">{{ s.pct }}%</span>
        </div>
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
