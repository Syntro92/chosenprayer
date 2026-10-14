<script setup lang="ts">
import { ref, watch } from 'vue';

/** Confirm an action, optionally collecting a note/reason. `onConfirm` may throw; its message is shown inline. */
const props = withDefaults(
  defineProps<{
    title: string;
    message?: string;
    confirmLabel?: string;
    color?: string;
    /** When set, shows a text box with this label. */
    reasonLabel?: string;
    reasonRequired?: boolean;
    onConfirm: (reason: string) => Promise<void>;
  }>(),
  { confirmLabel: 'Confirm', color: 'primary', reasonRequired: false }
);
const open = defineModel<boolean>({ required: true });
const reason = ref('');
const busy = ref(false);
const error = ref('');

watch(open, (v) => {
  if (v) {
    reason.value = '';
    error.value = '';
  }
});

async function go() {
  if (props.reasonLabel && props.reasonRequired && !reason.value.trim()) {
    error.value = 'Please fill this in.';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    await props.onConfirm(reason.value.trim());
    open.value = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="460" :persistent="busy">
    <v-card>
      <v-card-title class="pt-5">{{ title }}</v-card-title>
      <v-card-text>
        <p v-if="message" class="mb-4">{{ message }}</p>
        <v-textarea v-if="reasonLabel" v-model="reason" :label="reasonLabel" rows="2" maxlength="300" counter auto-grow />
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-2">{{ error }}</v-alert>
      </v-card-text>
      <v-card-actions class="pb-4 px-6">
        <v-spacer />
        <v-btn variant="text" :disabled="busy" @click="open = false">Cancel</v-btn>
        <v-btn :color="color" variant="flat" :loading="busy" @click="go">{{ confirmLabel }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
