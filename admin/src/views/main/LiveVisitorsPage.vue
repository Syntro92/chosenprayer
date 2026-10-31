<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CalendarIcon } from 'vue-tabler-icons';
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

interface DayVisits {
  date: string;
  views: number;
  visitors: number;
  topPaths: { path: string; views: number }[];
  historyDays: number;
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
// Calendar filter: one day of visits in the admin's own time zone. Separate from the live data and the saved counter.
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pickerOpen = ref(false);
const day = ref<Date | null>(null);
const dayData = ref<DayVisits | null>(null);
const dayError = ref('');
const dayLoading = ref(false);
const today = new Date();
const maxDay = ymd(today);
const minDay = computed(() => ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (dayData.value?.historyDays ?? 90) + 1)));
const dayLabel = computed(() => (day.value ? day.value.toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''));

async function loadDay() {
  if (!day.value) return;
  const date = ymd(day.value);
  dayLoading.value = true;
  try {
    const out = await api.get<DayVisits>('/live/day', { date, tz });
    if (day.value && ymd(day.value) === date) dayData.value = out; // ignore answers for a day no longer picked
    dayError.value = '';
  } catch (e) {
    dayError.value = errorMessage(e);
  } finally {
    dayLoading.value = false;
  }
}
watch(day, (d) => {
  pickerOpen.value = false;
  if (!d) {
    dayData.value = null;
    dayError.value = '';
  }
  loadDay();
});

async function clearCount() {
  const counter = await api.del<Counter>('/live/counter');
  if (data.value) data.value = { ...data.value, counter };
}
onMounted(() => {
  load();
  timer = window.setInterval(() => {
    load();
    if (day.value && ymd(day.value) === ymd(new Date())) loadDay(); // today's numbers keep moving
  }, 15000);
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
        <v-divider class="my-4" />
        <div class="text-subtitle-1 font-weight-medium mb-3">Filter by day</div>
        <v-menu v-model="pickerOpen" :close-on-content-click="false" location="bottom start">
          <template #activator="{ props: menu }">
            <v-text-field
              v-bind="menu"
              :model-value="dayLabel"
              placeholder="Pick a day"
              readonly
              clearable
              hide-details
              density="compact"
              @click:clear="day = null"
            >
              <template #prepend-inner><CalendarIcon size="18" stroke-width="1.5" /></template>
            </v-text-field>
          </template>
          <v-date-picker v-model="day" :min="minDay" :max="maxDay" color="primary" show-adjacent-months />
        </v-menu>
        <v-alert v-if="dayError" type="error" variant="tonal" density="compact" class="mt-3">{{ dayError }}</v-alert>
        <template v-else-if="day">
          <v-progress-linear v-if="dayLoading && !dayData" indeterminate color="primary" class="mt-3" />
          <template v-if="dayData">
            <v-row dense class="mt-3">
              <v-col cols="6">
                <div class="text-h4 font-weight-bold">{{ dayData.visitors.toLocaleString() }}</div>
                <div class="text-subtitle-2 text-medium-emphasis">Visitors</div>
              </v-col>
              <v-col cols="6">
                <div class="text-h4 font-weight-bold">{{ dayData.views.toLocaleString() }}</div>
                <div class="text-subtitle-2 text-medium-emphasis">Page views</div>
              </v-col>
            </v-row>
            <div v-if="!dayData.topPaths.length" class="text-disabled mt-2">No visits on {{ dayLabel }}.</div>
            <template v-else>
              <div class="text-caption text-medium-emphasis mt-3 mb-1">Top pages on {{ dayLabel }}</div>
              <div v-for="p in dayData.topPaths" :key="p.path" class="d-flex py-1">
                <span class="text-truncate mr-2">{{ p.path }}</span><span class="ml-auto font-weight-medium">{{ p.views }}</span>
              </div>
            </template>
          </template>
        </template>
        <div v-else class="text-caption text-disabled mt-2">Pick a day to see its visitors and page views (last {{ dayData?.historyDays ?? 90 }} days).</div>
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
