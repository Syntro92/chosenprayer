<script setup lang="ts">
import { computed } from 'vue';
import { money } from '@/utils/format';
import { useDashboard } from '../useDashboard';

const { dashboard } = useDashboard();
const days = computed(() => dashboard.value?.series ?? []);
const total = computed(() => days.value.reduce((n, d) => n + d.amountCents, 0));

const chartOptions1 = computed(() => ({
  chart: { type: 'bar', height: 480, fontFamily: `inherit`, foreColor: '#a1aab2', toolbar: { show: false } },
  colors: ['#5e35b1'],
  plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 3 } },
  xaxis: { type: 'category', categories: days.value.map((d) => d.date.slice(5)), tickAmount: 10 },
  yaxis: { labels: { formatter: (v: number) => money(Math.round(v * 100), dashboard.value?.currency) } },
  legend: { show: false },
  fill: { type: 'solid' },
  dataLabels: { enabled: false },
  grid: { show: true, borderColor: '#E2E6E3' },
  tooltip: { theme: 'light', y: { formatter: (v: number) => money(Math.round(v * 100), dashboard.value?.currency) } }
}));
const series = computed(() => [{ name: 'Support', data: days.value.map((d) => d.amountCents / 100) }]);
</script>

<template>
  <v-card elevation="0">
    <v-card variant="outlined">
      <v-card-text>
        <span class="text-subtitle-2 text-disabled font-weight-bold">Support, last 30 days</span>
        <h3 class="text-h3 mt-1">{{ money(total, dashboard?.currency) }}</h3>
        <div class="mt-4">
          <apexchart type="bar" height="480" :options="chartOptions1" :series="series" />
        </div>
      </v-card-text>
    </v-card>
  </v-card>
</template>
