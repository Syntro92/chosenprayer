<script setup lang="ts">
import { computed } from 'vue';
import { UsersGroupIcon } from 'vue-tabler-icons';
import { change, money } from '@/utils/format';
import { useDashboard } from '../useDashboard';

const { dashboard } = useDashboard();
const d = computed(() => dashboard.value!);
const monthPct = computed(() => change(d.value.month.raisedCents, d.value.month.previousCents));
const donorPct = computed(() => change(d.value.month.donors, d.value.month.previousDonors));
const sign = (n: number | null) => (n === null ? 'new' : (n >= 0 ? '+' : '') + n + '%');
</script>

<template>
  <v-card elevation="0" class="bg-primary overflow-hidden bubble-shape-sm bubble-primary mb-6">
    <v-card-text class="pa-5">
      <div class="d-flex align-center ga-4">
        <v-btn color="darkprimary" icon rounded="sm" variant="flat">
          <TableIcon stroke-width="1.5" width="25" />
        </v-btn>
        <div>
          <h4 class="text-h4 font-weight-medium">
            {{ money(d.month.raisedCents, d.currency) }} <span class="text-subtitle-2 ml-1">{{ sign(monthPct) }}</span>
          </h4>
          <span class="text-subtitle-2 text-medium-emphasis text-white">This Month</span>
          <div class="text-caption text-white" style="opacity: 0.8">vs. last month ({{ money(d.month.previousCents, d.currency) }})</div>
        </div>
      </div>
    </v-card-text>
  </v-card>

  <v-card elevation="0" class="bubble-shape-sm overflow-hidden bubble-warning">
    <v-card-text class="pa-5">
      <div class="d-flex align-center ga-4">
        <v-btn color="lightwarning" icon rounded="sm" variant="flat">
          <UsersGroupIcon stroke-width="1.5" width="25" class="text-warning" />
        </v-btn>
        <div>
          <h4 class="text-h4 font-weight-medium">{{ d.totals.donors.toLocaleString() }}</h4>
          <span class="text-subtitle-2 text-disabled font-weight-medium">Total Supporters</span>
          <div class="text-caption text-disabled">{{ d.month.donors }} this month · {{ sign(donorPct) }}</div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>
