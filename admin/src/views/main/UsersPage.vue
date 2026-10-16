<script setup lang="ts">
import { useRouter } from 'vue-router';
import ListPage from './ListPage.vue';
import { usePaged } from '@/utils/usePaged';
import { dateOnly, label, statusColor } from '@/utils/format';

interface User {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: string;
  status: string;
  verified: boolean;
  joinedAt: string;
}

const router = useRouter();
const { filters, items, total, page, pageSize, loading, error, reload } = usePaged<User>('/users', { q: '', role: '', status: '' });

const headers = [
  { title: 'Member', key: 'name', sortable: false },
  { title: 'Email', key: 'email', sortable: false },
  { title: 'Role', key: 'role', sortable: false },
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Joined', key: 'joinedAt', sortable: false }
];
const opts = (values: string[], all: string) => [{ title: all, value: '' }, ...values.map((v) => ({ title: label(v), value: v }))];
</script>

<template>
  <ListPage
    v-model:page="page"
    title="Users"
    add-to="/users/new"
    add-label="Add user"
    :headers="headers"
    :items="items"
    :total="total"
    :loading="loading"
    :error="error"
    :page-size="pageSize"
    @retry="reload"
    @row="(u: User) => router.push(`/users/${u.id}`)"
  >
    <template #filters>
      <v-row dense>
        <v-col cols="12" md="5"><v-text-field v-model="filters.q" label="Search name, username or email" density="comfortable" hide-details clearable variant="outlined" /></v-col>
        <v-col cols="6" md="3"><v-select v-model="filters.role" :items="opts(['member', 'admin'], 'All roles')" label="Role" density="comfortable" hide-details variant="outlined" /></v-col>
        <v-col cols="6" md="3"><v-select v-model="filters.status" :items="opts(['active', 'suspended'], 'All statuses')" label="Status" density="comfortable" hide-details variant="outlined" /></v-col>
      </v-row>
    </template>
    <template #item.name="{ item }">
      <div class="font-weight-medium">{{ item.name }}<v-chip v-if="item.verified" size="x-small" class="ml-2" variant="outlined">Verified</v-chip></div>
      <div class="text-caption text-disabled">@{{ item.username }}</div>
    </template>
    <template #item.email="{ item }">{{ item.email ?? '—' }}</template>
    <template #item.role="{ item }"><v-chip size="small" :color="statusColor(item.role)" variant="tonal">{{ label(item.role) }}</v-chip></template>
    <template #item.status="{ item }"><v-chip size="small" :color="statusColor(item.status)" variant="tonal">{{ label(item.status) }}</v-chip></template>
    <template #item.joinedAt="{ item }">{{ dateOnly(item.joinedAt) }}</template>
  </ListPage>
</template>
