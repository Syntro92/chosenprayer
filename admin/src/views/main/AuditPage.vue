<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';
import { api, errorMessage } from '@/utils/api';
import { dateTime } from '@/utils/format';

interface Entry {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { name: string; username: string } | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const items = ref<Entry[]>([]);
const next = ref<string | null>(null);
const loading = ref(true);
const error = ref('');
const type = ref('');
let seq = 0;

async function load(more = false) {
  const mine = ++seq;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get<{ items: Entry[]; nextCursor: string | null }>('/audit', { entityType: type.value, cursor: more ? next.value : undefined });
    if (mine !== seq) return;
    items.value = more ? [...items.value, ...res.items] : res.items;
    next.value = res.nextCursor;
  } catch (e) {
    if (mine === seq) error.value = errorMessage(e);
  } finally {
    if (mine === seq) loading.value = false;
  }
}
onMounted(() => load());
watch(type, () => load());

const types = ['post', 'comment', 'report', 'user', 'donation', 'channel', 'setting'];
const headers = [
  { title: 'When', key: 'createdAt', sortable: false },
  { title: 'Who', key: 'actor', sortable: false },
  { title: 'Action', key: 'action', sortable: false },
  { title: 'Target', key: 'entityId', sortable: false },
  { title: 'Details', key: 'metadata', sortable: false }
];
const details = (m: Record<string, unknown>) =>
  Object.entries(m)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' · ');
</script>

<template>
  <BaseBreadcrumb title="Audit Log" :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Audit Log', disabled: true, href: '#' }]" />
  <UiParentCard title="Admin and moderator actions">
    <v-select v-model="type" :items="[{ title: 'Everything', value: '' }, ...types.map((t) => ({ title: t, value: t }))]" label="Type" density="comfortable" hide-details variant="outlined" style="max-width: 240px" class="mb-4" />
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
    <v-data-table :headers="headers" :items="items" :loading="loading" :items-per-page="-1" hide-default-footer no-data-text="No entries.">
      <template #item.createdAt="{ item }">{{ dateTime(item.createdAt) }}</template>
      <template #item.actor="{ item }">{{ item.actor ? item.actor.name : 'System' }}</template>
      <template #item.action="{ item }"><code>{{ item.action }}</code></template>
      <template #item.entityId="{ item }"><span class="text-caption">{{ item.entityType }} {{ item.entityId?.slice(0, 8) }}</span></template>
      <template #item.metadata="{ item }"><span class="text-caption text-medium-emphasis">{{ details(item.metadata) }}</span></template>
    </v-data-table>
    <div v-if="next" class="text-center mt-4"><v-btn variant="tonal" :loading="loading" @click="load(true)">Load more</v-btn></div>
  </UiParentCard>
</template>
