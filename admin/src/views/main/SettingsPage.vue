<script setup lang="ts">
import { ref } from 'vue';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';

const form = ref({ siteName: 'Donation', email: 'admin@example.com', currency: 'USD', notify: true });
const saved = ref(false);
</script>

<template>
  <BaseBreadcrumb title="Settings" :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Settings', disabled: true, href: '#' }]" />
  <v-row>
    <v-col cols="12" md="8">
      <UiParentCard title="General settings">
        <v-form @submit.prevent="saved = true">
          <v-text-field v-model="form.siteName" label="Site name" />
          <v-text-field v-model="form.email" label="Contact email" type="email" />
          <v-select v-model="form.currency" label="Currency" :items="['USD', 'AUD', 'EUR', 'GBP', 'INR']" />
          <v-switch v-model="form.notify" color="primary" label="Email me about new donations" hide-details class="mb-4" />
          <v-btn color="primary" type="submit">Save changes</v-btn>
          <v-alert v-if="saved" type="success" variant="tonal" class="mt-4">Settings saved.</v-alert>
        </v-form>
      </UiParentCard>
    </v-col>
  </v-row>
</template>
