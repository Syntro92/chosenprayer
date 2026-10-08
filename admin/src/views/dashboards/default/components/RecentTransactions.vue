<script setup lang="ts">
import { recentTransactions, statusStyle } from '../overviewData';
// Newest first
const rows = recentTransactions;
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
            <tr v-for="(t, i) in rows" :key="i">
              <td class="font-weight-medium">{{ t.supporter }}</td>
              <td>{{ t.channel }}</td>
              <td class="font-weight-medium">${{ t.amount.toFixed(2) }}</td>
              <td>
                <span class="badge" :style="{ background: statusStyle[t.status].bg, color: statusStyle[t.status].fg }">{{ t.status }}</span>
              </td>
              <td class="text-disabled">{{ t.time }}</td>
            </tr>
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
