<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';
import { api, errorMessage } from '@/utils/api';
import { money } from '@/utils/format';

interface Analytics {
  days: number;
  traffic: { views: number; visitors: number; viewsSeries: { date: string; views: number; visitors: number }[] };
  topPages: { path: string; views: number }[];
  topReferrers: { referrer: string; views: number }[];
  devices: { device: string; views: number }[];
  countries: { country: string; views: number }[];
  giving: { raisedCents: number; donations: number; averageCents: number; series: { date: string; amountCents: number; donations: number }[] };
  conversionRate: number | null;
}

const range = ref<'7d' | '30d' | '90d'>('30d');
const data = ref<Analytics | null>(null);
const loading = ref(true);
const error = ref('');
let seq = 0;

watch(
  range,
  async () => {
    const mine = ++seq;
    loading.value = true;
    error.value = '';
    try {
      const res = await api.get<Analytics>('/analytics', { range: range.value });
      if (mine === seq) data.value = res;
    } catch (e) {
      if (mine === seq) error.value = errorMessage(e);
    } finally {
      if (mine === seq) loading.value = false;
    }
  },
  { immediate: true }
);

const short = (d: string) => d.slice(5);
const givingOptions = computed(() => ({
  chart: { toolbar: { show: false }, fontFamily: 'inherit' },
  xaxis: { categories: data.value?.giving.series.map((s) => short(s.date)) ?? [], tickAmount: 8 },
  yaxis: { labels: { formatter: (v: number) => money(v * 100) } },
  stroke: { curve: 'smooth' },
  dataLabels: { enabled: false },
  colors: ['#5e35b1']
}));
const givingSeries = computed(() => [{ name: 'Raised', data: data.value?.giving.series.map((s) => s.amountCents / 100) ?? [] }]);
const trafficOptions = computed(() => ({
  chart: { toolbar: { show: false }, fontFamily: 'inherit' },
  xaxis: { categories: data.value?.traffic.viewsSeries.map((s) => short(s.date)) ?? [], tickAmount: 8 },
  stroke: { curve: 'smooth' },
  dataLabels: { enabled: false },
  colors: ['#1e88e5', '#7e9b83']
}));
const trafficSeries = computed(() => [
  { name: 'Page views', data: data.value?.traffic.viewsSeries.map((s) => s.views) ?? [] },
  { name: 'Visitors', data: data.value?.traffic.viewsSeries.map((s) => s.visitors) ?? [] }
]);
const noTraffic = computed(() => !!data.value && data.value.traffic.views === 0);
</script>

<template>
  <BaseBreadcrumb title="Analytics" :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Analytics', disabled: true, href: '#' }]" />
  <div class="mb-4">
    <v-btn-toggle v-model="range" mandatory density="comfortable" color="primary" variant="outlined" divided>
      <v-btn value="7d">7 days</v-btn>
      <v-btn value="30d">30 days</v-btn>
      <v-btn value="90d">90 days</v-btn>
    </v-btn-toggle>
  </div>
  <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
  <v-progress-linear v-if="loading && !data" indeterminate />
  <v-row v-if="data">
    <v-col v-for="s in [
      { label: 'Raised', value: money(data.giving.raisedCents) },
      { label: 'Donations', value: data.giving.donations.toLocaleString() },
      { label: 'Average gift', value: money(data.giving.averageCents) },
      { label: 'Conversion', value: data.conversionRate === null ? '—' : data.conversionRate + '%' }
    ]" :key="s.label" cols="6" md="3">
      <v-card variant="flat"><v-card-text>
        <div class="text-subtitle-2 text-medium-emphasis">{{ s.label }}</div>
        <div class="text-h3 mt-1">{{ s.value }}</div>
      </v-card-text></v-card>
    </v-col>
    <v-col cols="12" lg="6">
      <UiParentCard title="Money raised"><apexchart type="area" height="300" :options="givingOptions" :series="givingSeries" /></UiParentCard>
    </v-col>
    <v-col cols="12" lg="6">
      <UiParentCard :title="`Traffic · ${data.traffic.views.toLocaleString()} views, ${data.traffic.visitors.toLocaleString()} visitors`">
        <v-alert v-if="noTraffic" type="info" variant="tonal" class="mb-3">No page views recorded yet. Visitor tracking is switched on in the next milestone.</v-alert>
        <apexchart type="area" height="300" :options="trafficOptions" :series="trafficSeries" />
      </UiParentCard>
    </v-col>
    <v-col v-for="t in [
      { title: 'Top pages', rows: data.topPages.map((r) => [r.path, r.views]) },
      { title: 'Top referrers', rows: data.topReferrers.map((r) => [r.referrer, r.views]) },
      { title: 'Devices', rows: data.devices.map((r) => [r.device, r.views]) },
      { title: 'Countries', rows: data.countries.map((r) => [r.country, r.views]) }
    ]" :key="t.title" cols="12" sm="6" lg="3">
      <UiParentCard :title="t.title">
        <div v-if="!t.rows.length" class="text-disabled">No data yet.</div>
        <div v-for="[name, views] in t.rows" :key="String(name)" class="d-flex py-1"><span class="text-truncate mr-2">{{ name }}</span><span class="ml-auto font-weight-medium">{{ views }}</span></div>
      </UiParentCard>
    </v-col>
  </v-row>
</template>
