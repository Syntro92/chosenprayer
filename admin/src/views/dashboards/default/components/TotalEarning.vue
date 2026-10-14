<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { ArchiveIcon, CopyIcon, DownloadIcon, FileExportIcon } from 'vue-tabler-icons';
import iconCard from '@/assets/images/icons/icon-card.svg';
import { change, money } from '@/utils/format';
import { useDashboard } from '../useDashboard';

const { dashboard } = useDashboard();
const items = shallowRef([
  { title: 'Import Card', icon: DownloadIcon },
  { title: 'Copy Data', icon: CopyIcon },
  { title: 'Export', icon: FileExportIcon },
  { title: 'Archive File', icon: ArchiveIcon }
]);
const total = computed(() => money(dashboard.value?.totals.raisedCents ?? 0, dashboard.value?.currency));
const pct = computed(() => (dashboard.value ? change(dashboard.value.month.raisedCents, dashboard.value.month.previousCents) : null));
const pctText = computed(() => (pct.value === null ? 'No earlier month to compare' : (pct.value >= 0 ? '+' : '') + pct.value + '% vs last month'));
</script>

<template>
  <v-card elevation="0" class="h-100 bg-secondary overflow-hidden bubble-shape bubble-secondary-shape">
    <v-card-text>
      <div class="d-flex align-start mb-6">
        <v-btn icon rounded="sm" color="darksecondary" variant="flat">
          <img :src="iconCard" width="25" />
        </v-btn>
        <div class="ml-auto z-1">
          <v-menu :close-on-content-click="false">
            <template v-slot:activator="{ props }">
              <v-btn icon rounded="sm" color="secondary" variant="flat" size="small" v-bind="props">
                <DotsIcon stroke-width="1.5" width="20" />
              </v-btn>
            </template>
            <v-sheet rounded="md" width="150" class="elevation-10">
              <v-list density="compact">
                <v-list-item v-for="(item, index) in items" :key="index" :value="index">
                  <template v-slot:prepend>
                    <component :is="item.icon" stroke-width="1.5" size="20" />
                  </template>
                  <v-list-item-title class="ml-2">{{ item.title }}</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-sheet>
          </v-menu>
        </div>
      </div>
      <h2 class="text-h1 font-weight-medium">
        {{ total }} <a href="#"><CircleArrowUpRightIcon stroke-width="1.5" width="28" class="text-white" /> </a>
      </h2>
      <div class="text-subtitle-1 text-white">Total Support</div>
      <div class="text-caption text-white" style="opacity: 0.8">{{ dashboard?.totals.donations ?? 0 }} completed gifts</div>
      <div class="text-subtitle-2 text-white mt-2 font-weight-medium">{{ pctText }}</div>
    </v-card-text>
  </v-card>
</template>
