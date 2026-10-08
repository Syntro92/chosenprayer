<script setup lang="ts">
import { ChevronUpIcon } from 'vue-tabler-icons';
import { topChannels, money } from '../overviewData';

const [featured, ...others] = topChannels;

const chartOptions1 = {
  chart: { type: 'area', height: 95, fontFamily: `inherit`, foreColor: '#a1aab2', sparkline: { enabled: true } },
  colors: ['#5e35b1'],
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 1 },
  tooltip: { theme: 'light', fixed: { enabled: false }, x: { show: false }, y: { title: { formatter: () => 'Support ' } }, marker: { show: false } }
};
const lineChart1 = { series: [{ data: featured.trend }] };
</script>

<template>
  <v-card elevation="0">
    <v-card variant="outlined">
      <v-card-text>
        <div class="d-flex align-center">
          <h4 class="text-h4 mt-1">Top Channels</h4>
          <div class="ml-auto">
            <v-menu transition="slide-y-transition">
              <template v-slot:activator="{ props }">
                <v-btn color="primary" size="small" icon rounded="sm" variant="text" v-bind="props">
                  <DotsIcon stroke-width="1.5" width="25" />
                </v-btn>
              </template>
              <v-sheet rounded="md" width="150" class="elevation-10">
                <v-list>
                  <v-list-item value="1"><v-list-item-title>Today</v-list-item-title></v-list-item>
                  <v-list-item value="2"><v-list-item-title>This Month</v-list-item-title></v-list-item>
                  <v-list-item value="3"><v-list-item-title>This Year</v-list-item-title></v-list-item>
                </v-list>
              </v-sheet>
            </v-menu>
          </div>
        </div>

        <v-card class="bg-lightsecondary mt-5">
          <div class="pa-5">
            <div class="d-flex align-start justify-space-between">
              <div>
                <h6 class="text-secondary text-h5">{{ featured.name }}</h6>
                <span class="text-subtitle-2 text-medium-emphasis font-weight-bold">{{ featured.supporters.toLocaleString() }} supporters</span>
                <div class="text-subtitle-2 font-weight-bold" style="color: #7e9b83">+{{ featured.changePct }}%</div>
              </div>
              <h4 class="text-h4">{{ money(featured.amount) }}</h4>
            </div>
          </div>
          <apexchart type="area" height="95" :options="chartOptions1" :series="lineChart1.series" />
        </v-card>
        <div class="mt-4">
          <v-list lines="two" class="py-0">
            <v-list-item v-for="c in others" :key="c.name" :value="c.name" color="secondary" rounded="sm">
              <template v-slot:append>
                <div class="bg-lightsuccess rounded-sm d-flex align-center justify-center ml-3" style="width: 20px; height: 20px">
                  <ChevronUpIcon stroke-width="1.5" width="20" class="text-success" />
                </div>
              </template>
              <div class="d-inline-flex align-center justify-space-between w-100">
                <div>
                  <h6 class="text-subtitle-1 text-medium-emphasis font-weight-bold">{{ c.name }}</h6>
                  <span class="text-subtitle-2 text-disabled">{{ c.supporters.toLocaleString() }} supporters</span>
                  <span class="text-subtitle-2 ml-2" style="color: #7e9b83">+{{ c.changePct }}%</span>
                </div>
                <div class="ml-auto text-subtitle-1 text-medium-emphasis font-weight-bold">{{ money(c.amount) }}</div>
              </div>
            </v-list-item>
          </v-list>
        </div>
      </v-card-text>
    </v-card>
  </v-card>
</template>
