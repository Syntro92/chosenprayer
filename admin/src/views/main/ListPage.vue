<script setup lang="ts">
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';
import { statusColor } from './data';

defineProps<{
  title: string;
  headers: { title: string; key: string }[];
  items: Record<string, any>[];
  detailBase: string;
  addTo?: string;
}>();
</script>

<template>
  <BaseBreadcrumb :title="title" :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title, disabled: true, href: '#' }]" />
  <v-row>
    <v-col cols="12">
      <UiParentCard :title="title">
        <template #action>
          <v-btn v-if="addTo" color="primary" :to="addTo">Add Channel</v-btn>
        </template>
        <v-data-table :headers="[...headers, { title: '', key: 'actions', sortable: false }]" :items="items" hover>
          <template v-for="h in headers" :key="h.key" #[`item.${h.key}`]="{ item }">
            <v-chip v-if="h.key === 'status'" size="small" :color="statusColor(item.status)" variant="tonal">{{ item.status }}</v-chip>
            <span v-else-if="['amount', 'raised'].includes(h.key)">${{ item[h.key].toLocaleString() }}</span>
            <span v-else>{{ item[h.key] }}</span>
          </template>
          <template #item.actions="{ item }">
            <v-btn size="small" variant="text" color="primary" :to="`${detailBase}/${item.id}`">View</v-btn>
          </template>
        </v-data-table>
      </UiParentCard>
    </v-col>
  </v-row>
</template>
