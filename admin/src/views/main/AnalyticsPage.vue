<script setup lang="ts">
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';

const stats = [
  { label: 'Total Raised', value: '$29,600' },
  { label: 'Donations', value: '732' },
  { label: 'Avg. Donation', value: '$40.4' },
  { label: 'Conversion Rate', value: '3.8%' }
];
const options = {
  chart: { toolbar: { show: false } },
  xaxis: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  stroke: { curve: 'smooth' }
};
const series = [{ name: 'Donations', data: [120, 180, 150, 220, 260, 310, 280] }];
</script>

<template>
  <BaseBreadcrumb title="Analytics" :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Analytics', disabled: true, href: '#' }]" />
  <v-row>
    <v-col v-for="s in stats" :key="s.label" cols="6" md="3">
      <v-card variant="flat">
        <v-card-text>
          <div class="text-subtitle-2 text-medium-emphasis">{{ s.label }}</div>
          <div class="text-h3 mt-1">{{ s.value }}</div>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col cols="12">
      <UiParentCard title="Donations this week">
        <apexchart type="area" height="320" :options="options" :series="series" />
      </UiParentCard>
    </v-col>
  </v-row>
</template>
