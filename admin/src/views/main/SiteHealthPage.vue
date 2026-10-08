<script setup lang="ts">
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import { statusColor } from './data';

const checks = [
  { name: 'Website', detail: 'Responding in 182 ms', status: 'Active', uptime: 99.98 },
  { name: 'API', detail: 'Responding in 96 ms', status: 'Active', uptime: 99.95 },
  { name: 'Database', detail: 'Connections normal', status: 'Active', uptime: 99.99 },
  { name: 'Payment Gateway', detail: 'Slow responses detected', status: 'Paused', uptime: 98.7 },
  { name: 'Email Service', detail: 'Delivering normally', status: 'Active', uptime: 99.9 }
];
</script>

<template>
  <BaseBreadcrumb title="Site Health" :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Site Health', disabled: true, href: '#' }]" />
  <v-row>
    <v-col v-for="c in checks" :key="c.name" cols="12" sm="6" md="4">
      <v-card variant="flat">
        <v-card-text>
          <div class="d-flex justify-space-between align-center">
            <div class="text-h5">{{ c.name }}</div>
            <v-chip size="small" :color="statusColor(c.status)" variant="tonal">{{ c.status === 'Active' ? 'Healthy' : 'Degraded' }}</v-chip>
          </div>
          <div class="text-body-2 text-medium-emphasis my-2">{{ c.detail }}</div>
          <v-progress-linear :model-value="c.uptime" :color="statusColor(c.status)" height="8" rounded />
          <div class="text-caption mt-1">Uptime {{ c.uptime }}%</div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>
