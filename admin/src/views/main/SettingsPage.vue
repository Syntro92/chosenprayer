<script setup lang="ts">
import { onMounted, ref } from 'vue';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';
import { api, ApiError, errorMessage } from '@/utils/api';

const form = ref({ siteName: '', contactEmail: '', defaultCurrency: 'USD', notifyOnDonation: true });
const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const error = ref('');
const fieldErrors = ref<Record<string, string>>({});

onMounted(async () => {
  try {
    const s = await api.get<{ siteName: string; contactEmail: string | null; defaultCurrency: string; notifyOnDonation: boolean }>('/settings');
    form.value = { ...s, contactEmail: s.contactEmail ?? '' };
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
});

async function save(e: Event) {
  e.preventDefault();
  saving.value = true;
  saved.value = false;
  error.value = '';
  fieldErrors.value = {};
  try {
    const s = await api.put<typeof form.value>('/settings', form.value);
    form.value = { ...s, contactEmail: s.contactEmail ?? '' };
    saved.value = true;
  } catch (err) {
    if (err instanceof ApiError) fieldErrors.value = err.fields;
    error.value = errorMessage(err);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseBreadcrumb title="Settings" :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Settings', disabled: true, href: '#' }]" />
  <v-row>
    <v-col cols="12" md="8">
      <UiParentCard title="General settings">
        <v-progress-linear v-if="loading" indeterminate />
        <v-form v-else @submit="save">
          <v-text-field v-model="form.siteName" label="Site name" :error-messages="fieldErrors.siteName" class="mb-3" />
          <v-text-field v-model="form.contactEmail" label="Contact email" type="email" :error-messages="fieldErrors.contactEmail" class="mb-3" />
          <v-select v-model="form.defaultCurrency" label="Default currency" :items="['USD', 'AUD', 'EUR', 'GBP', 'INR', 'CAD', 'NZD']" :error-messages="fieldErrors.defaultCurrency" class="mb-3" />
          <v-switch v-model="form.notifyOnDonation" color="primary" label="Notify channel owners about new donations" hide-details class="mb-4" />
          <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
          <v-alert v-if="saved" type="success" variant="tonal" class="mb-4">Settings saved.</v-alert>
          <v-btn color="primary" type="submit" rounded="0" :loading="saving">Save changes</v-btn>
        </v-form>
      </UiParentCard>
    </v-col>
  </v-row>
</template>
