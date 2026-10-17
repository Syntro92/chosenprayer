<script setup lang="ts">
import { useSlots } from 'vue';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';

/**
 * Shared shell for the server-paged admin tables: breadcrumb, a card with an optional action button
 * and filter row, the table itself, and an error/empty state. Cells are rendered by the caller via
 * the usual `item.<key>` slots.
 */
defineProps<{
  title: string;
  headers: { title: string; key: string; sortable?: boolean; align?: 'start' | 'end' | 'center' }[];
  items: any[];
  total: number;
  loading: boolean;
  error?: string;
  pageSize: number;
  addTo?: string;
  addLabel?: string;
}>();
const slotNames: string[] = Object.keys(useSlots()).filter((n) => n !== 'filters' && n !== 'above');
const page = defineModel<number>('page', { required: true });
defineEmits<{ (e: 'retry'): void; (e: 'row', item: any): void }>();
</script>

<template>
  <BaseBreadcrumb :title="title" :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title, disabled: true, href: '#' }]" />
  <v-row v-if="$slots.above">
    <v-col cols="12"><slot name="above" /></v-col>
  </v-row>
  <v-row>
    <v-col cols="12">
      <UiParentCard :title="title">
        <template #action>
          <v-btn v-if="addTo" color="primary" :to="addTo">{{ addLabel ?? 'Add' }}</v-btn>
        </template>
        <div class="mb-4"><slot name="filters" /></div>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
          {{ error }}
          <template #append><v-btn size="small" variant="text" @click="$emit('retry')">Retry</v-btn></template>
        </v-alert>
        <v-data-table-server
          v-model:page="page"
          :headers="headers"
          :items="items"
          :items-length="total"
          :items-per-page="pageSize"
          :loading="loading"
          :items-per-page-options="[pageSize]"
          hover
          no-data-text="Nothing here yet."
          @click:row="(_: Event, row: any) => $emit('row', row.item)"
        >
          <template v-for="n in slotNames" :key="n" #[n]="slotProps"><slot :name="n" v-bind="slotProps ?? {}" /></template>
        </v-data-table-server>
      </UiParentCard>
    </v-col>
  </v-row>
</template>
