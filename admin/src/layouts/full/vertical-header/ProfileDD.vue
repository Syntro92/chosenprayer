<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { LogoutIcon, ExternalLinkIcon } from 'vue-tabler-icons';

const authStore = useAuthStore();
const greeting = computed(() => {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
});
</script>

<template>
  <div class="pa-4" style="min-width: 260px">
    <h4 class="mb-n1">{{ greeting }}, <span class="font-weight-regular">{{ authStore.user?.name }}</span></h4>
    <span class="text-subtitle-2 text-medium-emphasis text-capitalize">{{ authStore.user?.role }} · @{{ authStore.user?.username }}</span>

    <v-divider class="my-3"></v-divider>

    <v-list>
      <v-list-item href="/" target="_blank" color="secondary" rounded="md">
        <template v-slot:prepend><ExternalLinkIcon size="20" class="mr-2" /></template>
        <v-list-item-title class="text-subtitle-2">View website</v-list-item-title>
      </v-list-item>
      <v-list-item @click="authStore.logout()" color="secondary" rounded="md">
        <template v-slot:prepend><LogoutIcon size="20" class="mr-2" /></template>
        <v-list-item-title class="text-subtitle-2">Logout</v-list-item-title>
      </v-list-item>
    </v-list>
  </div>
</template>
