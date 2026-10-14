<script setup lang="ts">
import { computed } from 'vue';
import { money } from '@/utils/format';
import { useDashboard } from '../useDashboard';

const { dashboard } = useDashboard();
const currency = computed(() => dashboard.value?.currency);
const parts = computed(() => {
  const b = dashboard.value?.breakdown ?? { onceCents: 0, monthlyCents: 0 };
  const total = b.onceCents + b.monthlyCents;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return [
    { label: 'One-time', amount: b.onceCents, pct: pct(b.onceCents), color: '#5e35b1' },
    { label: 'Monthly', amount: b.monthlyCents, pct: pct(b.monthlyCents), color: '#1e88e5' }
  ];
});
const empty = computed(() => parts.value.every((p) => p.amount === 0));
const options = computed(() => ({
  chart: { type: 'donut', fontFamily: 'inherit', sparkline: { enabled: true } },
  labels: parts.value.map((s) => s.label),
  colors: parts.value.map((s) => s.color),
  legend: { show: false },
  dataLabels: { enabled: false },
  stroke: { width: 2 },
  plotOptions: { pie: { donut: { size: '72%' } } },
  tooltip: { y: { formatter: (v: number) => money(v, currency.value) } }
}));
const series = computed(() => (empty.value ? [1, 0] : parts.value.map((s) => s.amount)));
</script>

<template>
  <v-card elevation="0" class="h-100">
    <v-card variant="outlined" class="h-100">
      <v-card-text>
        <h4 class="text-h4 mt-1 mb-4">Support Breakdown</h4>
        <div class="d-flex justify-center">
          <apexchart type="donut" width="200" height="200" :options="options" :series="series" />
        </div>
        <div v-for="s in parts" :key="s.label" class="d-flex align-center py-2">
          <span class="dot mr-3" :style="{ background: s.color }" />
          <span class="font-weight-medium">{{ s.label }}</span>
          <span class="ml-auto font-weight-medium">{{ money(s.amount, currency) }}</span>
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
