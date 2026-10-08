<script setup lang="ts">
// Chosen Bless — Admin Overview
import TotalEarning from './components/TotalEarning.vue'; // Total Support
import TotalOrder from './components/TotalOrder.vue'; // Live Visitors
import TotalIncome from './components/TotalIncome.vue'; // This Month + Total Supporters
import TotalGrowth from './components/TotalGrowth.vue'; // Support Overview
import PopularStocks from './components/PopularStocks.vue'; // Top Channels
import RecentTransactions from './components/RecentTransactions.vue';
import SiteHealth from './components/SiteHealth.vue';
import LiveActivity from './components/LiveActivity.vue';
import SupportBreakdown from './components/SupportBreakdown.vue';
</script>

<template>
  <v-row>
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
