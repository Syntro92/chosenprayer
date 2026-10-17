<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';
import ImageUpload from '@/components/shared/ImageUpload.vue';
import { api, ApiError, errorMessage } from '@/utils/api';
import { dateOnly } from '@/utils/format';

interface YoutubePreview {
  channelId: string;
  title: string;
  description: string;
  handle: string | null;
  thumbnailUrl: string | null;
  subscribers: number | null;
  videoCount: number;
  videos: { videoId: string; title: string; publishedAt: string; thumbnailUrl: string | null }[];
}

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
  avatarUrl: null as string | null
});
const youtubeInput = ref('');
const youtube = ref<YoutubePreview | null>(null);
const fetching = ref(false);
const youtubeError = ref('');
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

/** Look the channel up on YouTube, show what will be imported, and pre-fill empty fields from it. */
async function fetchYoutube() {
  fetching.value = true;
  youtubeError.value = '';
  youtube.value = null;
  try {
    const y = await api.get<YoutubePreview>('/youtube', { channel: youtubeInput.value });
    youtube.value = y;
    const f = form.value;
    if (!f.name) f.name = y.title.slice(0, 80);
    if (!f.description) f.description = y.description.split('\n')[0].slice(0, 200);
    if (!f.handle && y.handle) f.handle = y.handle.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
  } catch (err) {
    youtubeError.value = errorMessage(err);
  } finally {
    fetching.value = false;
  }
}

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
      youtubeChannel: youtube.value?.channelId,
      status: f.status,
      featured: f.featured,
      verified: f.verified,
      showBlessings: f.showBlessings,
      avatarPath: f.avatarPath
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
          <div class="mb-6">
            <div class="d-flex ga-2 align-start">
              <v-text-field variant="outlined" rounded="0" density="comfortable" v-model="youtubeInput" label="YouTube channel ID (optional)" placeholder="UCxxxxxxxxxxxxxxxxxxxxxx" hint="Paste the channel ID, a channel link or an @handle, then fetch. We import the subscriber count and recent videos." persistent-hint :error-messages="youtubeError" @keydown.enter.prevent="fetchYoutube" />
              <v-btn color="primary" variant="tonal" rounded="0" height="48" :loading="fetching" :disabled="!youtubeInput.trim()" @click="fetchYoutube">Fetch</v-btn>
            </div>
            <v-card v-if="youtube" variant="tonal" rounded="0" class="mt-3 pa-4">
              <div class="d-flex align-center ga-3 mb-3">
                <v-avatar v-if="youtube.thumbnailUrl" size="48"><v-img :src="youtube.thumbnailUrl" /></v-avatar>
                <div>
                  <div class="text-subtitle-1">{{ youtube.title }}</div>
                  <div class="text-body-2 text-medium-emphasis">
                    {{ youtube.subscribers === null ? 'Subscribers hidden' : youtube.subscribers.toLocaleString() + ' subscribers' }} · {{ youtube.videoCount.toLocaleString() }} videos
                  </div>
                </div>
              </div>
              <div class="text-caption text-disabled mb-1">Recent videos that will be added to the channel</div>
              <div v-for="v in youtube.videos" :key="v.videoId" class="text-body-2 d-flex justify-space-between ga-3">
                <span class="text-truncate">{{ v.title }}</span><span class="text-disabled flex-shrink-0">{{ dateOnly(v.publishedAt) }}</span>
              </div>
              <div v-if="!youtube.videos.length" class="text-body-2 text-medium-emphasis">No public videos yet.</div>
            </v-card>
            <v-alert v-if="fieldErrors.youtubeChannel" type="error" variant="tonal" class="mt-3">{{ fieldErrors.youtubeChannel }}</v-alert>
          </div>
          <ImageUpload label="Channel image (profile picture)" shape="avatar" :path="form.avatarPath" :url="form.avatarUrl" hint="Square works best. Shown on cards and the channel page." @change="(v) => { form.avatarPath = v.path; form.avatarUrl = v.url; }" />
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
