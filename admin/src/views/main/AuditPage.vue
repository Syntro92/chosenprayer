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
const value = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));
const label = (k: string) => k.replace(/([A-Z])/g, ' $1').toLowerCase();
const details = (m: Record<string, unknown>) =>
  Object.entries(m)
    .filter(([k]) => k !== 'handle')
    .map(([k, v]) => `${label(k)}: ${value(v)}`)
    .join(' · ');
const target = (e: Entry) => (typeof e.metadata.handle === 'string' ? `@${e.metadata.handle}` : `${e.entityType} ${e.entityId?.slice(0, 8) ?? ''}`);
</script>

<template>
  <BaseBreadcrumb title="Audit Log" :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Audit Log', disabled: true, href: '#' }]" />
  <UiParentCard title="Admin and moderator actions">
    <v-select v-model="type" :items="[{ title: 'Everything', value: '' }, ...types.map((t) => ({ title: t, value: t }))]" label="Type" density="comfortable" hide-details variant="outlined" style="max-width: 240px" class="mb-4" />
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
    <v-data-table :headers="headers" :items="items" :loading="loading" :items-per-page="-1" hide-default-footer no-data-text="No entries.">
      <template #item.createdAt="{ item }"><span class="text-no-wrap">{{ dateTime(item.createdAt) }}</span></template>
      <template #item.actor="{ item }">{{ item.actor ? item.actor.name : 'System' }}</template>
      <template #item.action="{ item }"><code>{{ item.action }}</code></template>
      <template #item.entityId="{ item }"><span class="text-caption text-no-wrap">{{ target(item) }}</span></template>
      <template #item.metadata="{ item }"><span class="text-caption text-medium-emphasis" style="word-break: break-word">{{ details(item.metadata) }}</span></template>
    </v-data-table>
    <div v-if="next" class="text-center mt-4"><v-btn variant="tonal" :loading="loading" @click="load(true)">Load more</v-btn></div>
  </UiParentCard>
</template>
