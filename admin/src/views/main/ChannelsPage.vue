<script setup lang="ts">
import { useRouter } from 'vue-router';
import ListPage from './ListPage.vue';
import SupportSettingsCard from './SupportSettingsCard.vue';
import { usePaged } from '@/utils/usePaged';
import { label, money, statusColor } from '@/utils/format';

interface Channel {
  id: string;
  handle: string;
  name: string;
  category: string;
  status: string;
  followers: number;
  raisedCents: number;
  featured: boolean;
  verified: boolean;
  owner: { name: string } | null;
}

const router = useRouter();
const { filters, items, total, page, pageSize, loading, error, reload } = usePaged<Channel>('/channels', { q: '', status: '' });

const headers = [
  { title: 'Channel', key: 'name', sortable: false },
  { title: 'Category', key: 'category', sortable: false },
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Raised', key: 'raised', sortable: false },
  { title: 'Followers', key: 'followers', sortable: false },
  { title: 'Owner', key: 'owner', sortable: false }
];
const statuses = ['pending', 'active', 'paused', 'archived'];
</script>

<template>
  <ListPage
    v-model:page="page"
    title="Channels"
    :headers="headers"
    :items="items"
    :total="total"
    :loading="loading"
    :error="error"
    :page-size="pageSize"
    add-to="/channels/add"
    add-label="Add Channel"
    @retry="reload"
    @row="(c: Channel) => router.push(`/channels/${c.id}`)"
  >
    <template #above><SupportSettingsCard /></template>
    <template #filters>
      <v-row dense>
        <v-col cols="12" sm="6" md="4">
          <v-text-field v-model="filters.q" label="Search name or handle" density="comfortable" hide-details clearable variant="outlined" />
        </v-col>
        <v-col cols="12" sm="6" md="3">
          <v-select
            v-model="filters.status"
            :items="[{ title: 'All statuses', value: '' }, ...statuses.map((s) => ({ title: label(s), value: s }))]"
            label="Status"
            density="comfortable"
            hide-details
            variant="outlined"
          />
        </v-col>
      </v-row>
    </template>
    <template #item.name="{ item }">
      <div class="font-weight-medium">{{ item.name }}</div>
      <div class="text-caption text-disabled">@{{ item.handle }}</div>
    </template>
    <template #item.status="{ item }">
      <v-chip size="small" :color="statusColor(item.status)" variant="tonal">{{ label(item.status) }}</v-chip>
      <v-chip v-if="item.featured" size="x-small" class="ml-1" variant="outlined">Featured</v-chip>
      <v-chip v-if="item.verified" size="x-small" class="ml-1" variant="outlined">Verified</v-chip>
    </template>
    <template #item.raised="{ item }">{{ money(item.raisedCents) }}</template>
    <template #item.followers="{ item }">{{ item.followers.toLocaleString() }}</template>
    <template #item.owner="{ item }">{{ item.owner?.name ?? '—' }}</template>
  </ListPage>
</template>
