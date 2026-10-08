<script setup lang="ts">
import { ref, computed } from 'vue';
import { months, supportByRange, rangeOptions, money } from '../overviewData';

const select = ref(rangeOptions[0]);
const data = computed(() => supportByRange[select.value]);

const chartOptions1 = {
  chart: { type: 'bar', height: 480, fontFamily: `inherit`, foreColor: '#a1aab2', stacked: true, toolbar: { show: false } },
  colors: ['#5e35b1', '#1e88e5'],
  responsive: [{ breakpoint: 480, options: { legend: { position: 'bottom', offsetX: -10, offsetY: 0 } } }],
  plotOptions: { bar: { horizontal: false, columnWidth: '50%' } },
  xaxis: { type: 'category', categories: months },
  yaxis: { labels: { formatter: (v: number) => '$' + v / 1000 + 'k' } },
  legend: {
    show: true,
    fontFamily: `'Roboto', sans-serif`,
    position: 'top',
    horizontalAlign: 'left',
    markers: { width: 16, height: 16, radius: 5 },
    itemMargin: { horizontal: 15, vertical: 8 }
  },
  fill: { type: 'solid' },
  dataLabels: { enabled: false },
  grid: { show: true, borderColor: '#E2E6E3' },
  tooltip: { theme: 'light', y: { formatter: (v: number) => money(v) } }
};
const series = computed(() => [
  { name: 'One-time Support', data: data.value.oneTime },
  { name: 'Monthly Support', data: data.value.monthly }
]);
</script>

<template>
  <v-card elevation="0">
    <v-card variant="outlined">
      <v-card-text>
        <v-row>
          <v-col cols="12" sm="9">
            <span class="text-subtitle-2 text-disabled font-weight-bold">Support Overview</span>
            <h3 class="text-h3 mt-1">
              {{ money(data.total) }}
              <span class="text-subtitle-2 font-weight-medium" style="color: #7e9b83">+{{ data.changePct }}% this month</span>
            </h3>
          </v-col>
          <v-col cols="12" sm="3">
            <v-select color="primary" variant="outlined" hide-details v-model="select" :items="rangeOptions" single-line />
          </v-col>
        </v-row>
        <div class="mt-4">
          <apexchart type="bar" height="480" :options="chartOptions1" :series="series" />
        </div>
      </v-card-text>
    </v-card>
  </v-card>
</template>
