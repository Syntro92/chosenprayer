<script setup lang="ts">
import { computed } from 'vue';
import { palette } from '../overviewData';
import { useDashboard } from '../useDashboard';

const { health } = useDashboard();
const rows = computed(() => {
  const h = health.value;
  if (!h) return [];
  return [
    { name: 'Database', status: h.checks.database.ok ? 'Operational' : 'Down' },
    { name: 'Payments', status: !h.checks.payments.ok ? 'Down' : h.checks.payments.testMode ? 'Test mode' : 'Operational' },
    { name: 'Email', status: h.checks.email.ok ? 'Operational' : 'Degraded' },
    { name: 'Payment events', status: h.checks.webhooks.ok ? 'Operational' : 'Degraded' }
  ];
});
const allOk = computed(() => !!health.value?.ok);
const dot = (status: string) => (status === 'Operational' ? palette.success : status === 'Down' ? palette.error : palette.warning);
</script>

<template>
  <v-card elevation="0" class="h-100">
    <v-card variant="outlined" class="h-100">
      <v-card-text>
        <h4 class="text-h4 mt-1 mb-4">Site Health</h4>
        <div v-for="s in rows" :key="s.name" class="d-flex align-center py-2">
          <span class="dot mr-3" :style="{ background: dot(s.status) }" />
          <span class="font-weight-medium">{{ s.name }}</span>
          <span class="ml-auto text-subtitle-2" :style="{ color: dot(s.status) }">{{ s.status }}</span>
        </div>
        <v-divider class="my-3" />
        <div class="font-weight-medium" :style="{ color: allOk ? palette.success : palette.warning }">
          {{ !health ? 'Checking...' : allOk ? 'All systems operational' : 'Some systems need attention' }}
        </div>
        <router-link to="/site-health" class="text-caption">Details</router-link>
      </v-card-text>
    </v-card>
  </v-card>
</template>

<style scoped>
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
</style>
