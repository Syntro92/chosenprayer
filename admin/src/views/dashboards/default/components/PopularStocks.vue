<script setup lang="ts">
import { computed } from 'vue';
import { ChevronUpIcon } from 'vue-tabler-icons';
import { money } from '@/utils/format';
import { useDashboard } from '../useDashboard';

const { dashboard } = useDashboard();
const channels = computed(() => dashboard.value?.topChannels ?? []);
const featured = computed(() => channels.value[0]);
const others = computed(() => channels.value.slice(1));
const currency = computed(() => dashboard.value?.currency);
</script>

<template>
  <v-card elevation="0">
    <v-card variant="outlined">
      <v-card-text>
        <div class="d-flex align-center">
          <h4 class="text-h4 mt-1">Top Channels</h4>
          
        </div>

        <div v-if="!featured" class="text-disabled mt-5">No completed gifts yet.</div>
        <v-card v-else class="bg-lightsecondary mt-5">
          <div class="pa-5">
            <div class="d-flex align-start justify-space-between">
              <div>
                <h6 class="text-secondary text-h5">{{ featured.name }}</h6>
                <span class="text-subtitle-2 text-medium-emphasis font-weight-bold">{{ featured.donations.toLocaleString() }} {{ featured.donations === 1 ? 'gift' : 'gifts' }}</span>
              </div>
              <h4 class="text-h4">{{ money(featured.raisedCents, currency) }}</h4>
            </div>
          </div>
          
        </v-card>
        <div class="mt-4">
          <v-list lines="two" class="py-0">
            <v-list-item v-for="c in others" :key="c.handle" :value="c.handle" color="secondary" rounded="sm">
              <template v-slot:append>
                <div class="bg-lightsuccess rounded-sm d-flex align-center justify-center ml-3" style="width: 20px; height: 20px">
                  <ChevronUpIcon stroke-width="1.5" width="20" class="text-success" />
                </div>
              </template>
              <div class="d-inline-flex align-center justify-space-between w-100">
                <div>
                  <h6 class="text-subtitle-1 text-medium-emphasis font-weight-bold">{{ c.name }}</h6>
                  <span class="text-subtitle-2 text-disabled">{{ c.donations.toLocaleString() }} {{ c.donations === 1 ? 'gift' : 'gifts' }}</span>
                </div>
                <div class="ml-auto text-subtitle-1 text-medium-emphasis font-weight-bold">{{ money(c.raisedCents, currency) }}</div>
              </div>
            </v-list-item>
          </v-list>
        </div>
      </v-card-text>
    </v-card>
  </v-card>
</template>
