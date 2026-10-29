<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue';
import { api, errorMessage } from '@/utils/api';
import { dateTime, timeAgo } from '@/utils/format';

interface Counter {
  views: number;
  visitors: number;
  since: string;
}

interface Live {
  windowMinutes: number;
  online: number;
  visitors: { visitor: string; path: string; country: string | null; device: string | null; lastSeen: string; pages: number }[];
  topPaths: { path: string; visitors: number }[];
  counter: Counter;
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
const confirmClear = ref(false);
let timer: number | undefined;

async function load() {
  try {
    data.value = await api.get<Live>('/live');
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e);
  }
}
async function clearCount() {
  const counter = await api.del<Counter>('/live/counter');
  if (data.value) data.value = { ...data.value, counter };
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
      <UiParentCard title="Visit count" class="mb-6">
        <template #action>
          <v-btn color="error" variant="tonal" size="small" :disabled="!data" @click="confirmClear = true">Clear count</v-btn>
        </template>
        <v-row dense>
          <v-col cols="6">
            <div class="text-h3 font-weight-bold">{{ (data?.counter.visitors ?? 0).toLocaleString() }}</div>
            <div class="text-subtitle-2 text-medium-emphasis">Visitors</div>
          </v-col>
          <v-col cols="6">
            <div class="text-h3 font-weight-bold">{{ (data?.counter.views ?? 0).toLocaleString() }}</div>
            <div class="text-subtitle-2 text-medium-emphasis">Page views</div>
          </v-col>
        </v-row>
        <div class="text-caption text-disabled mt-3">Counting since {{ data ? dateTime(data.counter.since) : '—' }}. Saved, so it keeps growing until you clear it.</div>
      </UiParentCard>
      <UiParentCard title="Where they are">
        <div v-if="!data?.topPaths.length" class="text-disabled">No activity yet.</div>
        <div v-for="p in data?.topPaths ?? []" :key="p.path" class="d-flex py-1"><span class="text-truncate mr-2">{{ p.path }}</span><span class="ml-auto font-weight-medium">{{ p.visitors }}</span></div>
      </UiParentCard>
      <div class="text-caption text-disabled mt-3">Refreshes every 15 seconds. Visitors are anonymous and shown by a short code only.</div>
    </v-col>
  </v-row>
  <ConfirmDialog
    v-model="confirmClear"
    title="Clear the visit count?"
    message="Visitors and page views go back to 0 and start counting again from now. The analytics history is not affected."
    confirm-label="Clear count"
    color="error"
    :on-confirm="clearCount"
  />
</template>
