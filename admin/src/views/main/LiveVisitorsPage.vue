<script setup lang="ts">
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';

const headers = [
  { title: 'Visitor', key: 'visitor' },
  { title: 'Location', key: 'location' },
  { title: 'Page', key: 'page' },
  { title: 'Device', key: 'device' },
  { title: 'Time on site', key: 'time' }
];
const items = [
  { visitor: '#4821', location: 'Sydney, AU', page: '/', device: 'Mobile', time: '2m 14s' },
  { visitor: '#4822', location: 'Mumbai, IN', page: '/about', device: 'Desktop', time: '45s' },
  { visitor: '#4823', location: 'London, UK', page: '/channels', device: 'Desktop', time: '5m 02s' },
  { visitor: '#4824', location: 'Toronto, CA', page: '/', device: 'Tablet', time: '1m 30s' }
];
</script>

<template>
  <BaseBreadcrumb title="Live Visitors" :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Live Visitors', disabled: true, href: '#' }]" />
  <v-row>
    <v-col cols="12">
      <UiParentCard title="Visitors online now">
        <template #action><v-chip color="success" variant="tonal">{{ items.length }} online</v-chip></template>
        <v-data-table :headers="headers" :items="items" />
      </UiParentCard>
    </v-col>
  </v-row>
</template>
