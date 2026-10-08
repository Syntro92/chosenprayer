<script setup lang="ts">
import { ref } from 'vue';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';

const features = ref([
  { name: 'Online donations', desc: 'Accept donations on the website', on: true },
  { name: 'Recurring donations', desc: 'Let donors give monthly', on: true },
  { name: 'Donor wall', desc: 'Show recent donors publicly', on: false },
  { name: 'Email receipts', desc: 'Send receipts after each donation', on: true },
  { name: 'Campaign goals', desc: 'Show progress bars on channels', on: false }
]);
</script>

<template>
  <BaseBreadcrumb title="Feature Management" :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Feature Management', disabled: true, href: '#' }]" />
  <v-row>
    <v-col cols="12" md="8">
      <UiParentCard title="Features">
        <v-list>
          <v-list-item v-for="f in features" :key="f.name">
            <v-list-item-title>{{ f.name }}</v-list-item-title>
            <v-list-item-subtitle>{{ f.desc }}</v-list-item-subtitle>
            <template #append><v-switch v-model="f.on" color="primary" hide-details density="compact" /></template>
          </v-list-item>
        </v-list>
      </UiParentCard>
    </v-col>
  </v-row>
</template>
