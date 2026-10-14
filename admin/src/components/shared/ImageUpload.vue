<script setup lang="ts">
import { computed, ref } from 'vue';
import { api, ApiError, errorMessage } from '@/utils/api';

// Picks an image, uploads it right away and reports the storage key. The parent saves that key
// with the rest of the form. `path` null = no image (the site falls back to its default look).
const props = defineProps<{
  label: string;
  hint?: string;
  /** Current storage key (null when none). */
  path: string | null;
  /** Public URL for the current image (shown as the preview). */
  url: string | null;
  shape: 'avatar' | 'cover';
}>();
const emit = defineEmits<{ (e: 'change', value: { path: string | null; url: string | null }): void }>();

const MAX_BYTES = 4 * 1024 * 1024;
const input = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const error = ref('');
const previewable = computed(() => !!props.url);

async function onPick(e: Event) {
  const el = e.target as HTMLInputElement;
  const file = el.files?.[0];
  el.value = ''; // so picking the same file again still fires
  if (!file) return;
  error.value = '';
  if (!/\.(jpe?g|png|webp)$/i.test(file.name)) {
    error.value = 'Use a JPG, PNG or WebP image.';
    return;
  }
  if (file.size > MAX_BYTES) {
    error.value = 'The image is larger than 4 MB.';
    return;
  }
  busy.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await api.upload<{ path: string; url: string }>('/channels/images', form);
    emit('change', { path: res.path, url: res.url });
  } catch (err) {
    error.value = err instanceof ApiError && err.fields.file ? err.fields.file : errorMessage(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mb-4">
    <div class="text-subtitle-2 mb-2">{{ label }}</div>
    <div class="d-flex align-center ga-4 flex-wrap">
      <div
        class="image-upload-preview d-flex align-center justify-center bg-lightprimary"
        :class="shape === 'avatar' ? 'is-avatar' : 'is-cover'"
      >
        <img v-if="previewable" :src="url!" :alt="label" />
        <span v-else class="text-caption text-medium-emphasis">{{ shape === 'avatar' ? 'No photo' : 'No cover image' }}</span>
      </div>
      <div>
        <input ref="input" type="file" accept="image/jpeg,image/png,image/webp" class="d-none" @change="onPick" />
        <v-btn variant="tonal" color="primary" rounded="0" size="small" :loading="busy" @click="input?.click()">
          {{ path ? 'Replace image' : 'Upload image' }}
        </v-btn>
        <v-btn v-if="path" variant="text" color="error" size="small" class="ml-1" :disabled="busy" @click="emit('change', { path: null, url: null })">Remove</v-btn>
        <div class="text-caption text-medium-emphasis mt-1">{{ hint ?? 'JPG, PNG or WebP, up to 4 MB.' }}</div>
      </div>
    </div>
    <div v-if="error" class="text-caption text-error mt-1">{{ error }}</div>
  </div>
</template>

<style scoped>
.image-upload-preview {
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  flex-shrink: 0;
}
.image-upload-preview.is-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
}
.image-upload-preview.is-cover {
  width: 220px;
  height: 100px;
  border-radius: 8px;
}
.image-upload-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
