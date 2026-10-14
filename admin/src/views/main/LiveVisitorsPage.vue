<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';
import { api, errorMessage } from '@/utils/api';
import { timeAgo } from '@/utils/format';

interface Live {
  windowMinutes: number;
  online: number;
  visitors: { visitor: string; path: string; country: string | null; device: string | null; lastSeen: string; pages: number }[];
  topPaths: { path: string; visitors: number }[];
}

const headers = [
  { title: 'Visitor', key: 'visitor' },
  { title: 'Country', key: 'country' },
  { title: 'Page', key: 'path' },
  { title: 'Device', key: 'device' },
  { title: 'Pages seen', key: 'pages' },
  { title: 'Last seen', key: 'lastSeen' }
];
const data = ref<Live | null>(null);
const error = ref('');
let timer: number | undefined;

async function load() {
  try {
    data.value = await api.get<Live>('/live');
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e);
  }
}
onMounted(() => {
  load();
  timer = window.setInterval(load, 15000);
});
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<template>
  <BaseBreadcrumb title="Live Visitors" :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Live Visitors', disabled: true, href: '#' }]" />
  <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
  <v-row>
    <v-col cols="12" lg="8">
      <UiParentCard title="Visitors online now">
        <template #action><v-chip color="success" variant="tonal">{{ data?.online ?? 0 }} online · last {{ data?.windowMinutes ?? 5 }} min</v-chip></template>
        <v-data-table :headers="headers" :items="data?.visitors ?? []" :loading="!data && !error" no-data-text="Nobody is browsing the site right now.">
          <template #item.visitor="{ item }"><code>#{{ item.visitor }}</code></template>
          <template #item.country="{ item }">{{ item.country ?? '—' }}</template>
          <template #item.device="{ item }">{{ item.device ?? '—' }}</template>
          <template #item.lastSeen="{ item }">{{ timeAgo(item.lastSeen) }}</template>
        </v-data-table>
      </UiParentCard>
    </v-col>
    <v-col cols="12" lg="4">
      <UiParentCard title="Where they are">
        <div v-if="!data?.topPaths.length" class="text-disabled">No activity yet.</div>
        <div v-for="p in data?.topPaths ?? []" :key="p.path" class="d-flex py-1"><span class="text-truncate mr-2">{{ p.path }}</span><span class="ml-auto font-weight-medium">{{ p.visitors }}</span></div>
      </UiParentCard>
      <div class="text-caption text-disabled mt-3">Refreshes every 15 seconds. Visitors are anonymous and shown by a short code only.</div>
    </v-col>
  </v-row>
</template>
