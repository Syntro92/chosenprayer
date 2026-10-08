<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';
import { statusColor } from './data';

const props = defineProps<{ title: string; listTo: string; listTitle: string; items: Record<string, any>[] }>();
const route = useRoute();
const item = computed(() => props.items.find((i) => String(i.id) === String(route.params.id)));
const label = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
</script>

<template>
  <BaseBreadcrumb
    :title="title"
    :breadcrumbs="[
      { title: 'Main', disabled: false, href: '#' },
      { title: listTitle, disabled: false, href: `/admin${listTo}` },
      { title, disabled: true, href: '#' }
    ]"
  />
  <v-row>
    <v-col cols="12" md="8">
      <UiParentCard :title="title">
        <template #action><v-btn variant="tonal" color="primary" :to="listTo">Back to {{ listTitle }}</v-btn></template>
        <v-list v-if="item" lines="one">
          <v-list-item v-for="(v, k) in item" :key="k">
            <v-list-item-title class="text-medium-emphasis">{{ label(String(k)) }}</v-list-item-title>
            <v-chip v-if="k === 'status'" size="small" :color="statusColor(String(v))" variant="tonal" class="mt-1">{{ v }}</v-chip>
            <div v-else class="text-h5 mt-1">{{ ['amount', 'raised'].includes(String(k)) ? '$' + Number(v).toLocaleString() : v }}</div>
          </v-list-item>
        </v-list>
        <p v-else>Not found.</p>
      </UiParentCard>
    </v-col>
  </v-row>
</template>
