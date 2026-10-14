<script setup lang="ts">
import { onMounted, ref } from 'vue';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';
import ImageUpload from '@/components/shared/ImageUpload.vue';
import { api, ApiError, errorMessage } from '@/utils/api';

const form = ref({ siteName: '', contactEmail: '', defaultCurrency: 'USD', notifyOnDonation: true, heroImagePath: null as string | null });
const heroUrl = ref<string | null>(null);
const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const error = ref('');
const fieldErrors = ref<Record<string, string>>({});

type Saved = Omit<typeof form.value, 'contactEmail'> & { contactEmail: string | null; heroImageUrl: string | null };
function apply(s: Saved) {
  form.value = { siteName: s.siteName, contactEmail: s.contactEmail ?? '', defaultCurrency: s.defaultCurrency, notifyOnDonation: s.notifyOnDonation, heroImagePath: s.heroImagePath };
  heroUrl.value = s.heroImageUrl;
}

onMounted(async () => {
  try {
    apply(await api.get<Saved>('/settings'));
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
    apply(await api.put<Saved>('/settings', form.value));
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
          <ImageUpload
            label="Landing page cover"
            hint="Wallpaper-sized (landscape, at least 1920×1080) JPG, PNG or WebP, up to 4 MB. Remove it to go back to the default."
            shape="cover"
            upload-path="/settings/hero-image"
            :path="form.heroImagePath"
            :url="heroUrl"
            @change="(v) => { form.heroImagePath = v.path; heroUrl = v.url; saved = false; }"
          />
          <div class="text-caption text-medium-emphasis mb-4">The cover goes live on the landing page when you save.</div>
          <v-switch v-model="form.notifyOnDonation" color="primary" label="Notify channel owners about new donations" hide-details class="mb-4" />
          <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
            {{ error }}
            <div v-for="(msg, field) in fieldErrors" :key="field" class="text-caption">{{ field }}: {{ msg }}</div>
          </v-alert>
          <v-alert v-if="saved" type="success" variant="tonal" class="mb-4">Settings saved.</v-alert>
          <v-btn color="primary" type="submit" rounded="0" :loading="saving">Save changes</v-btn>
        </v-form>
      </UiParentCard>
    </v-col>
  </v-row>
</template>
