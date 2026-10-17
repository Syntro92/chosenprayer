<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';
import { api, ApiError, errorMessage } from '@/utils/api';

/** Site-wide support settings: apply to every channel's Support card and Top Supporters list. */
interface GivingSettings {
  minDonation: number;
  presets: number[];
  showTopSupporters: boolean;
}

const SUGGESTED = [10, 25, 50, 55, 100, 111, 250, 500, 555, 999, 1000];
const MAX_PRESETS = 5;

const form = ref<GivingSettings>({ minDonation: 25, presets: [], showTopSupporters: false });
const minText = ref('25');
const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const error = ref('');
const fieldErrors = ref<Record<string, string>>({});

// The combobox hands back numbers from the list and strings for anything typed.
const presets = computed({
  get: () => form.value.presets,
  set: (v: (string | number)[]) => {
    const nums = v.map((x) => Number(String(x).replace(/[$,\s]/g, ''))).filter((n) => Number.isFinite(n) && n > 0);
    form.value.presets = [...new Set(nums.map(Math.floor))].sort((a, b) => a - b).slice(0, MAX_PRESETS);
  }
});
const presetError = computed(() => fieldErrors.value.presets ?? Object.entries(fieldErrors.value).find(([k]) => k.startsWith('presets.'))?.[1]);
const tooLow = computed(() => form.value.presets.filter((n) => n < Number(minText.value)));

function apply(s: GivingSettings) {
  form.value = { minDonation: s.minDonation, presets: [...s.presets], showTopSupporters: s.showTopSupporters };
  minText.value = String(s.minDonation);
}

onMounted(async () => {
  try {
    apply(await api.get<GivingSettings>('/giving-settings'));
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
    apply(await api.put<GivingSettings>('/giving-settings', { ...form.value, minDonation: Number(minText.value) }));
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
  <UiParentCard title="Support settings">
    <p class="text-body-2 text-medium-emphasis mb-4">These apply to every channel's page.</p>
    <v-progress-linear v-if="loading" indeterminate />
    <v-form v-else @submit="save">
      <v-row dense>
        <v-col cols="12" md="4">
          <v-text-field
            v-model="minText"
            label="Minimum donation ($)"
            type="number"
            min="1"
            hint="The smallest gift anyone can make."
            persistent-hint
            :error-messages="fieldErrors.minDonation"
            variant="outlined"
            density="comfortable"
          />
        </v-col>
        <v-col cols="12" md="8">
          <v-combobox
            v-model="presets"
            :items="SUGGESTED"
            multiple
            chips
            closable-chips
            label="Amount buttons ($)"
            :hint="`Pick or type up to ${MAX_PRESETS} amounts, then press Enter. They show as buttons next to Custom.`"
            persistent-hint
            :error-messages="presetError"
            variant="outlined"
            density="comfortable"
          />
          <v-alert v-if="tooLow.length && !presetError" type="warning" variant="tonal" density="compact" class="mt-2">
            {{ tooLow.map((n) => '$' + n).join(', ') }} {{ tooLow.length === 1 ? 'is' : 'are' }} below the minimum donation and won't be accepted.
          </v-alert>
        </v-col>
      </v-row>
      <v-switch
        v-model="form.showTopSupporters"
        label="Show Top Supporters on channel pages"
        hint="Lists each channel's top 5 supporters by total given. Supporters with no name, or who chose to stay anonymous, appear as Anonymous."
        persistent-hint
        color="primary"
        density="compact"
        class="mb-4"
      />
      <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
      <v-alert v-if="saved" type="success" variant="tonal" class="mb-4">Saved. Channel pages are updated.</v-alert>
      <v-btn color="primary" type="submit" rounded="0" :loading="saving">Save support settings</v-btn>
    </v-form>
  </UiParentCard>
</template>
