<script setup lang="ts">
import { UsersGroupIcon } from 'vue-tabler-icons';
import { summary, money } from '../overviewData';
const m = summary.thisMonth;
const s = summary.totalSupporters;
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
            {{ money(m.value) }} <span class="text-subtitle-2 ml-1">+{{ m.changePct }}%</span>
          </h4>
          <span class="text-subtitle-2 text-medium-emphasis text-white">This Month</span>
          <div class="text-caption text-white" style="opacity: 0.8">vs. {{ m.comparedTo }}</div>
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
          <h4 class="text-h4 font-weight-medium">{{ s.value.toLocaleString() }}</h4>
          <span class="text-subtitle-2 text-disabled font-weight-medium">Total Supporters</span>
          <div class="text-caption text-disabled">Active supporters · +{{ s.changePct }}% {{ s.period }}</div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>
