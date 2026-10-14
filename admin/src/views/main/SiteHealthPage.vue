<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import { api, errorMessage } from '@/utils/api';
import { timeAgo } from '@/utils/format';

interface Health {
  ok: boolean;
  checks: {
    database: { ok: boolean; ms: number };
    payments: { ok: boolean; provider: string; testMode: boolean; detail: string };
    email: { ok: boolean; pending: number; failed: number; oldestPendingMinutes: number | null };
    webhooks: { ok: boolean; eventsLastDay: number; lastEventAt: string | null };
  };
  cron: { job: string; lastRunAt: string; ok: boolean; detail: string | null; stale: boolean }[];
}

const data = ref<Health | null>(null);
const error = ref('');
const loading = ref(false);
let timer: number | undefined;

async function load() {
  loading.value = true;
  try {
    data.value = await api.get<Health>('/health');
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(() => {
  load();
  timer = window.setInterval(load, 30000);
});
onBeforeUnmount(() => window.clearInterval(timer));

const cards = computed(() => {
  const h = data.value;
  if (!h) return [];
  return [
    { name: 'Database', ok: h.checks.database.ok, detail: h.checks.database.ok ? `Responding in ${h.checks.database.ms} ms` : 'Not reachable' },
    {
      name: 'Payments',
      ok: h.checks.payments.ok,
      detail: `${h.checks.payments.provider} · ${h.checks.payments.detail}`,
      warn: h.checks.payments.testMode
    },
    {
      name: 'Email',
      ok: h.checks.email.ok,
      detail: `${h.checks.email.pending} waiting, ${h.checks.email.failed} failed${h.checks.email.oldestPendingMinutes ? `, oldest ${h.checks.email.oldestPendingMinutes} min` : ''}`
    },
    {
      name: 'Payment events',
      ok: h.checks.webhooks.ok,
      detail: `${h.checks.webhooks.eventsLastDay} in the last 24 h${h.checks.webhooks.lastEventAt ? ` · last ${timeAgo(h.checks.webhooks.lastEventAt)}` : ''}`
    }
  ];
});
</script>

<template>
  <BaseBreadcrumb title="Site Health" :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Site Health', disabled: true, href: '#' }]" />
  <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
  <v-progress-linear v-if="!data && !error" indeterminate />
  <template v-if="data">
    <v-alert :type="data.ok ? 'success' : 'warning'" variant="tonal" class="mb-4">
      {{ data.ok ? 'All systems operational.' : 'Something needs attention.' }}
      <template #append><v-btn size="small" variant="text" :loading="loading" @click="load">Refresh</v-btn></template>
    </v-alert>
    <v-row>
      <v-col v-for="c in cards" :key="c.name" cols="12" sm="6" md="3">
        <v-card variant="flat"><v-card-text>
          <div class="d-flex justify-space-between align-center">
            <div class="text-h5">{{ c.name }}</div>
            <v-chip size="small" :color="!c.ok ? 'error' : c.warn ? 'warning' : 'success'" variant="tonal">{{ !c.ok ? 'Problem' : c.warn ? 'Test mode' : 'Healthy' }}</v-chip>
          </div>
          <div class="text-body-2 text-medium-emphasis mt-2">{{ c.detail }}</div>
        </v-card-text></v-card>
      </v-col>
      <v-col cols="12">
        <v-card variant="flat">
          <v-card-title class="pt-4">Scheduled jobs</v-card-title>
          <v-card-text>
            <v-table density="comfortable">
              <thead><tr><th>Job</th><th>Last run</th><th>Result</th><th>Details</th></tr></thead>
              <tbody>
                <tr v-for="j in data.cron" :key="j.job">
                  <td class="font-weight-medium">{{ j.job }}</td>
                  <td>{{ j.lastRunAt ? timeAgo(j.lastRunAt) : 'never' }}</td>
                  <td><v-chip size="small" :color="j.stale ? 'warning' : j.ok ? 'success' : 'error'" variant="tonal">{{ j.stale ? 'Overdue' : j.ok ? 'OK' : 'Failed' }}</v-chip></td>
                  <td class="text-medium-emphasis">{{ j.detail ?? '' }}</td>
                </tr>
              </tbody>
            </v-table>
            <div class="text-caption text-disabled mt-3">Jobs run when a scheduler calls /api/cron/email and /api/cron/sweep. “Overdue” means no scheduler has called recently.</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </template>
</template>
