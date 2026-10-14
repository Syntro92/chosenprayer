<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';
import ImageUpload from '@/components/shared/ImageUpload.vue';
import { api, ApiError, errorMessage } from '@/utils/api';

const router = useRouter();
const categories = ref<{ slug: string; name: string }[]>([]);
const form = ref({
  handle: '',
  name: '',
  category: '',
  description: '',
  mission: '',
  about: '',
  ownerUsername: '',
  status: 'active',
  featured: false,
  verified: false,
  showBlessings: true,
  avatarPath: null as string | null,
  avatarUrl: null as string | null,
  coverPath: null as string | null,
  coverUrl: null as string | null
});
const saving = ref(false);
const error = ref('');
const fieldErrors = ref<Record<string, string>>({});

onMounted(async () => {
  try {
    categories.value = await api.get('/categories');
    if (!form.value.category && categories.value[0]) form.value.category = categories.value[0].slug;
  } catch (e) {
    error.value = errorMessage(e);
  }
});

async function save(e: Event) {
  e.preventDefault();
  saving.value = true;
  error.value = '';
  fieldErrors.value = {};
  const f = form.value;
  try {
    const created = await api.post<{ id: string }>('/channels', {
      handle: f.handle,
      name: f.name,
      category: f.category,
      description: f.description,
      mission: f.mission,
      about: f.about
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean),
      ownerUsername: f.ownerUsername.trim() || undefined,
      status: f.status,
      featured: f.featured,
      verified: f.verified,
      showBlessings: f.showBlessings,
      avatarPath: f.avatarPath,
      coverPath: f.coverPath
    });
    router.push(`/channels/${created.id}`);
  } catch (err) {
    if (err instanceof ApiError) fieldErrors.value = err.fields;
    error.value = errorMessage(err);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseBreadcrumb
    title="Add Channel"
    :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Channels', disabled: false, href: '/admin/channels' }, { title: 'Add Channel', disabled: true, href: '#' }]"
  />
  <v-row>
    <v-col cols="12" md="8">
      <UiParentCard title="New channel">
        <v-form @submit="save">
          <ImageUpload label="Channel image (profile picture)" shape="avatar" :path="form.avatarPath" :url="form.avatarUrl" hint="Square works best. Shown on cards and the channel page." @change="(v) => { form.avatarPath = v.path; form.avatarUrl = v.url; }" />
          <ImageUpload label="Cover image" shape="cover" :path="form.coverPath" :url="form.coverUrl" hint="Wide image, about 1600 × 600. Leave empty to use the generated cover." @change="(v) => { form.coverPath = v.path; form.coverUrl = v.url; }" />
          <v-text-field variant="outlined" rounded="0" density="comfortable" v-model="form.handle" label="Handle (the web address)" prefix="@" hint="3–30 letters, numbers or underscores. It cannot be changed later." persistent-hint :error-messages="fieldErrors.handle" class="mb-3" />
          <v-text-field variant="outlined" rounded="0" density="comfortable" v-model="form.name" label="Channel name" :error-messages="fieldErrors.name" class="mb-3" />
          <v-select variant="outlined" rounded="0" density="comfortable" v-model="form.category" :items="categories" item-title="name" item-value="slug" label="Category" :error-messages="fieldErrors.category" class="mb-3" />
          <v-text-field variant="outlined" rounded="0" density="comfortable" v-model="form.description" label="One-line summary" counter="200" maxlength="200" class="mb-3" />
          <v-textarea variant="outlined" rounded="0" density="comfortable" v-model="form.mission" label="Mission" rows="2" counter="600" maxlength="600" class="mb-3" />
          <v-textarea variant="outlined" rounded="0" density="comfortable" v-model="form.about" label="About (separate paragraphs with a blank line)" rows="5" class="mb-3" />
          <v-text-field variant="outlined" rounded="0" density="comfortable" v-model="form.ownerUsername" label="Owner's username (optional)" hint="The member who runs this channel. They are notified when it goes live." persistent-hint :error-messages="fieldErrors.ownerUsername" class="mb-3" />
          <v-select variant="outlined" rounded="0" density="comfortable" v-model="form.status" :items="[{ title: 'Active (publish now)', value: 'active' }, { title: 'Pending (review later)', value: 'pending' }]" label="Status" class="mb-3" />
          <v-switch v-model="form.featured" label="Featured on the directory" color="primary" hide-details density="compact" />
          <v-switch v-model="form.verified" label="Verified badge" color="primary" hide-details density="compact" />
          <v-switch v-model="form.showBlessings" label="Show blessings on this channel's page" color="primary" hide-details density="compact" class="mb-4" />
          <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
          <v-btn color="primary" type="submit" rounded="0" :loading="saving" class="mr-2">Create channel</v-btn>
          <v-btn variant="tonal" rounded="0" to="/channels">Cancel</v-btn>
        </v-form>
      </UiParentCard>
    </v-col>
  </v-row>
</template>
