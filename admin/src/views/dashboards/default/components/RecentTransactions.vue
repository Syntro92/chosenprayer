<script setup lang="ts">
import { computed } from 'vue';
import { label, money, timeAgo } from '@/utils/format';
import { statusStyle } from '../overviewData';
import { useDashboard } from '../useDashboard';

const { dashboard } = useDashboard();
const rows = computed(() => dashboard.value?.recentTransactions ?? []);
const style = (status: string) => statusStyle[status] ?? statusStyle.pending;
</script>

<template>
  <v-card elevation="0">
    <v-card variant="outlined">
      <v-card-text>
        <div class="d-flex align-center mb-2">
          <h4 class="text-h4 mt-1">Recent Transactions</h4>
          <v-btn class="ml-auto" color="primary" variant="text" to="/transactions">
            View All
            <template v-slot:append><ChevronRightIcon stroke-width="1.5" width="20" /></template>
          </v-btn>
        </div>
        <v-table class="tx-table">
          <thead>
            <tr>
              <th>Supporter</th>
              <th>Channel</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in rows" :key="t.id" style="cursor: pointer" @click="$router.push(`/transactions/${t.id}`)">
              <td class="font-weight-medium">{{ t.donor.name }}</td>
              <td>{{ t.channel.name }}</td>
              <td class="font-weight-medium">{{ money(t.amountCents, t.currency) }}</td>
              <td>
                <span class="badge" :style="{ background: style(t.status).bg, color: style(t.status).fg }">{{ label(t.status) }}</span>
              </td>
              <td class="text-disabled">{{ timeAgo(t.createdAt) }}</td>
            </tr>
          <tr v-if="!rows.length"><td colspan="5" class="text-center text-disabled py-6">No transactions yet.</td></tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>
  </v-card>
</template>

<style scoped lang="scss">
.badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}
.tx-table {
  white-space: nowrap;
}
</style>
