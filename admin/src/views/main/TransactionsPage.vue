<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import ListPage from './ListPage.vue';
import { usePaged } from '@/utils/usePaged';
import { dateTime, label, money, statusColor } from '@/utils/format';

interface Tx {
  id: string;
  donor: { name: string; email: string | null; guest: boolean };
  channel: { handle: string; name: string };
  amountCents: number;
  currency: string;
  frequency: string;
  status: string;
  source: string;
  createdAt: string;
}

const route = useRoute();
const router = useRouter();
const { filters, items, total, page, pageSize, loading, error, reload } = usePaged<Tx>('/transactions', {
  q: '',
  status: '',
  source: '',
  channel: typeof route.query.channel === 'string' ? route.query.channel : '',
  from: '',
  to: ''
});

const headers = [
  { title: 'Date', key: 'createdAt', sortable: false },
  { title: 'Donor', key: 'donor', sortable: false },
  { title: 'Channel', key: 'channel', sortable: false },
  { title: 'Amount', key: 'amount', sortable: false },
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Source', key: 'source', sortable: false }
];
const opts = (values: string[], all: string) => [{ title: all, value: '' }, ...values.map((v) => ({ title: label(v), value: v }))];
</script>

<template>
  <ListPage
    v-model:page="page"
    title="Transactions"
    :headers="headers"
    :items="items"
    :total="total"
    :loading="loading"
    :error="error"
    :page-size="pageSize"
    @retry="reload"
    @row="(t: Tx) => router.push(`/transactions/${t.id}`)"
  >
    <template #filters>
      <v-row dense>
        <v-col cols="12" md="3"><v-text-field v-model="filters.q" label="Search donor, email, channel or ID" density="comfortable" hide-details clearable variant="outlined" /></v-col>
        <v-col cols="6" md="2"><v-select v-model="filters.status" :items="opts(['succeeded', 'pending', 'failed', 'refunded', 'canceled'], 'All statuses')" label="Status" density="comfortable" hide-details variant="outlined" /></v-col>
        <v-col cols="6" md="2"><v-select v-model="filters.source" :items="opts(['web', 'mobile', 'social', 'email', 'offline', 'other'], 'All sources')" label="Source" density="comfortable" hide-details variant="outlined" /></v-col>
        <v-col cols="6" md="2"><v-text-field v-model="filters.from" label="From" type="date" density="comfortable" hide-details variant="outlined" /></v-col>
        <v-col cols="6" md="2"><v-text-field v-model="filters.to" label="To" type="date" density="comfortable" hide-details variant="outlined" /></v-col>
        <v-col v-if="filters.channel" cols="12" md="3" class="d-flex align-center">
          <v-chip closable @click:close="filters.channel = ''">Channel: @{{ filters.channel }}</v-chip>
        </v-col>
      </v-row>
    </template>
    <template #item.createdAt="{ item }">{{ dateTime(item.createdAt) }}</template>
    <template #item.donor="{ item }">
      <div class="font-weight-medium">{{ item.donor.name }}</div>
      <div class="text-caption text-disabled">{{ item.donor.email ?? 'no email' }}{{ item.donor.guest ? ' · guest' : '' }}</div>
    </template>
    <template #item.channel="{ item }">{{ item.channel.name }}</template>
    <template #item.amount="{ item }">
      <span class="font-weight-medium">{{ money(item.amountCents, item.currency) }}</span>
      <span v-if="item.frequency === 'monthly'" class="text-caption text-disabled"> /mo</span>
    </template>
    <template #item.status="{ item }"><v-chip size="small" :color="statusColor(item.status)" variant="tonal">{{ label(item.status) }}</v-chip></template>
    <template #item.source="{ item }">{{ label(item.source) }}</template>
  </ListPage>
</template>
