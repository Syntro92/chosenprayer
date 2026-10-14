<script setup lang="ts">
import TotalEarning from './components/TotalEarning.vue'; // Total Support
import TotalOrder from './components/TotalOrder.vue'; // Live Visitors
import TotalIncome from './components/TotalIncome.vue'; // This Month + Total Supporters
import TotalGrowth from './components/TotalGrowth.vue'; // Support, last 30 days
import PopularStocks from './components/PopularStocks.vue'; // Top Channels
import RecentTransactions from './components/RecentTransactions.vue';
import SiteHealth from './components/SiteHealth.vue';
import LiveActivity from './components/LiveActivity.vue';
import SupportBreakdown from './components/SupportBreakdown.vue';
import { provideDashboard } from './useDashboard';

const { dashboard, error, loading, reload } = provideDashboard();
</script>

<template>
  <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
    {{ error }}
    <template #append><v-btn size="small" variant="text" @click="reload">Retry</v-btn></template>
  </v-alert>
  <v-alert v-if="dashboard && dashboard.pendingApprovals" type="warning" variant="tonal" class="mb-4">
    <router-link to="/channels">{{ dashboard.pendingApprovals }} channel{{ dashboard.pendingApprovals === 1 ? '' : 's' }}</router-link> waiting for approval.
  </v-alert>
  <v-progress-linear v-if="loading && !dashboard" indeterminate class="mb-4" />
  <v-row v-if="dashboard">
    <v-col cols="12" md="4"><TotalEarning /></v-col>
    <v-col cols="12" md="4"><TotalOrder /></v-col>
    <v-col cols="12" md="4"><TotalIncome /></v-col>

    <v-col cols="12" lg="8"><TotalGrowth /></v-col>
    <v-col cols="12" lg="4"><PopularStocks /></v-col>

    <v-col cols="12" lg="8"><RecentTransactions /></v-col>
    <v-col cols="12" lg="4"><SiteHealth /></v-col>

    <v-col cols="12" lg="8"><LiveActivity /></v-col>
    <v-col cols="12" lg="4"><SupportBreakdown /></v-col>
  </v-row>
</template>
