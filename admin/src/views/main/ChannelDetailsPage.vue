<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';
import ImageUpload from '@/components/shared/ImageUpload.vue';
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue';
import { api, ApiError, errorMessage } from '@/utils/api';
import { dateOnly, label, money, statusColor } from '@/utils/format';

interface Channel {
  id: string;
  handle: string;
  name: string;
  description: string;
  mission: string;
  about: string[];
  category: string;
  categorySlug: string;
  coverTone: string;
  coverScene: string;
  avatarPath: string | null;
  coverPath: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  status: 'pending' | 'active' | 'paused' | 'archived';
  featured: boolean;
  verified: boolean;
  showBlessings: boolean;
  followers: number;
  supporters: number;
  blessings: number;
  raisedCents: number;
  donationCount: number;
  youtubeChannelId: string | null;
  youtubeSubscribers: number | null;
  youtubeSyncedAt: string | null;
  facebookPageId: string | null;
  facebookFollowers: number | null;
  facebookSyncedAt: string | null;
  currency: string;
  owner: { name: string; username: string } | null;
  createdAt: string;
  publishedAt: string | null;
}

interface ContentItem {
  id: string;
  kind: 'reflection' | 'video' | 'message' | 'story';
  title: string;
  date: string;
  youtubeId: string | null;
  facebookId: string | null;
  featuredPosition: number | null;
}

const route = useRoute();
const id = String(route.params.id);
const channel = ref<Channel | null>(null);
const categories = ref<{ slug: string; name: string }[]>([]);
const loadError = ref('');
const saving = ref(false);
const saved = ref(false);
const saveError = ref('');
const fieldErrors = ref<Record<string, string>>({});
const form = ref({ name: '', description: '', mission: '', about: '', category: '', coverTone: 'cream', coverScene: 'horizon', featured: false, verified: false, showBlessings: true, avatarPath: null as string | null, avatarUrl: null as string | null, coverPath: null as string | null, coverUrl: null as string | null });

function fill(c: Channel) {
  channel.value = c;
  form.value = {
    name: c.name,
    description: c.description,
    mission: c.mission,
    about: c.about.join('\n\n'),
    category: c.categorySlug,
    coverTone: c.coverTone,
    coverScene: c.coverScene,
    featured: c.featured,
    verified: c.verified,
    showBlessings: c.showBlessings,
    avatarPath: c.avatarPath,
    avatarUrl: c.avatarUrl,
    coverPath: c.coverPath,
    coverUrl: c.coverUrl
  };
}

onMounted(async () => {
  try {
    const [c, cats] = await Promise.all([api.get<Channel>(`/channels/${id}`), api.get<{ slug: string; name: string }[]>('/categories')]);
    categories.value = cats;
    fill(c);
    // Keep the subscriber count fresh: re-fetch from YouTube when it has never synced or is over an hour old.
    if (c.youtubeChannelId && (!c.youtubeSyncedAt || Date.now() - new Date(c.youtubeSyncedAt).getTime() > 3600_000)) void syncYoutube(true);
    if (c.facebookPageId && (!c.facebookSyncedAt || Date.now() - new Date(c.facebookSyncedAt).getTime() > 3600_000)) void syncFacebook(true);
  } catch (e) {
    loadError.value = errorMessage(e);
  }
  void loadContent();
});

async function save(e: Event) {
  e.preventDefault();
  saving.value = true;
  saved.value = false;
  saveError.value = '';
  fieldErrors.value = {};
  const f = form.value;
  try {
    fill(
      await api.patch<Channel>(`/channels/${id}`, {
        name: f.name,
        description: f.description,
        mission: f.mission,
        about: f.about
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean),
        category: f.category,
        coverTone: f.coverTone,
        coverScene: f.coverScene,
        featured: f.featured,
        verified: f.verified,
        showBlessings: f.showBlessings,
        avatarPath: f.avatarPath,
        coverPath: f.coverPath
      })
    );
    saved.value = true;
  } catch (err) {
    if (err instanceof ApiError) fieldErrors.value = err.fields;
    saveError.value = errorMessage(err);
  } finally {
    saving.value = false;
  }
}

// YouTube link: subscribers and recent videos are pulled in by the server (and refreshed daily).
const ytInput = ref('');
const ytBusy = ref(false);
const ytMessage = ref('');
const ytError = ref('');
async function syncYoutube(quiet = false) {
  ytBusy.value = true;
  ytMessage.value = '';
  ytError.value = '';
  try {
    const r = await api.post<{ videos: number }>(`/channels/${id}/youtube`, ytInput.value.trim() ? { youtubeChannel: ytInput.value.trim() } : {});
    ytInput.value = '';
    fill(await api.get<Channel>(`/channels/${id}`));
    void loadContent();
    if (!quiet) ytMessage.value = `Synced. ${r.videos} recent video${r.videos === 1 ? '' : 's'} up to date.`;
  } catch (err) {
    if (!quiet) ytError.value = errorMessage(err);
  } finally {
    ytBusy.value = false;
  }
}

// Facebook link: followers and recent posts are pulled in by the server (and refreshed daily).
const fbInput = ref('');
const fbBusy = ref(false);
const fbMessage = ref('');
const fbError = ref('');
async function syncFacebook(quiet = false) {
  fbBusy.value = true;
  fbMessage.value = '';
  fbError.value = '';
  try {
    const r = await api.post<{ posts: number }>(`/channels/${id}/facebook`, fbInput.value.trim() ? { facebookPage: fbInput.value.trim() } : {});
    fbInput.value = '';
    fill(await api.get<Channel>(`/channels/${id}`));
    void loadContent();
    if (!quiet) fbMessage.value = `Synced. ${r.posts} recent post${r.posts === 1 ? '' : 's'} up to date.`;
  } catch (err) {
    if (!quiet) fbError.value = errorMessage(err);
  } finally {
    fbBusy.value = false;
  }
}

// Featured content: which 3 synced videos/posts fill the "Latest from" slots on the public page,
// and in what order. A slot left on "Auto" falls back to the most recently synced item.
const content = ref<ContentItem[]>([]);
const contentLoadError = ref('');
const slots = ref<(string | null)[]>([null, null, null]);
const contentBusy = ref(false);
const contentSaved = ref(false);
const contentError = ref('');

async function loadContent() {
  try {
    content.value = await api.get<ContentItem[]>(`/channels/${id}/content`);
    const s: (string | null)[] = [null, null, null];
    for (const item of content.value) if (item.featuredPosition) s[item.featuredPosition - 1] = item.id;
    slots.value = s;
  } catch (e) {
    contentLoadError.value = errorMessage(e);
  }
}

function itemLabel(item: ContentItem) {
  return `${label(item.kind)} — ${item.title} (${dateOnly(item.date)})`;
}
/** Items still available for a slot: not already chosen in one of the other two slots. */
function optionsFor(slotIndex: number) {
  const chosenElsewhere = new Set(slots.value.filter((v, i) => i !== slotIndex && v));
  return content.value.filter((c) => !chosenElsewhere.has(c.id));
}

async function saveFeatured() {
  contentBusy.value = true;
  contentSaved.value = false;
  contentError.value = '';
  try {
    content.value = await api.put<ContentItem[]>(`/channels/${id}/content`, { featured: slots.value });
    contentSaved.value = true;
  } catch (e) {
    contentError.value = errorMessage(e);
  } finally {
    contentBusy.value = false;
  }
}

// Status changes (approve / pause / resume / archive)
interface StatusAction {
  status: string;
  title: string;
  message: string;
  color: string;
  button: string;
}
const pending = ref<StatusAction | null>(null);
const dialog = ref(false);
const actions = computed<StatusAction[]>(() => {
  const s = channel.value?.status;
  if (s === 'pending') return [{ status: 'active', button: 'Approve & publish', color: 'success', title: 'Approve this channel?', message: 'It goes live immediately and its owner is notified.' }, { status: 'archived', button: 'Reject (archive)', color: 'error', title: 'Reject this channel?', message: 'It will be archived and stay hidden. You can add a note for the owner.' }];
  if (s === 'active') return [{ status: 'paused', button: 'Pause', color: 'warning', title: 'Pause this channel?', message: 'It disappears from the site and stops taking donations until resumed.' }, { status: 'archived', button: 'Archive', color: 'error', title: 'Archive this channel?', message: 'It is hidden from the site. Past donations are kept.' }];
  if (s === 'paused') return [{ status: 'active', button: 'Resume', color: 'success', title: 'Resume this channel?', message: 'It goes live again.' }, { status: 'archived', button: 'Archive', color: 'error', title: 'Archive this channel?', message: 'It is hidden from the site. Past donations are kept.' }];
  return [{ status: 'active', button: 'Restore', color: 'success', title: 'Restore this channel?', message: 'It goes live again.' }];
});
function ask(a: StatusAction) {
  pending.value = a;
  dialog.value = true;
}
async function changeStatus(note: string) {
  if (!pending.value) return;
  fill(await api.post<Channel>(`/channels/${id}/status`, { status: pending.value.status, note: note || undefined }));
}
</script>

<template>
  <BaseBreadcrumb
    title="Channel Details"
    :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Channels', disabled: false, href: '/admin/channels' }, { title: 'Channel Details', disabled: true, href: '#' }]"
  />
  <v-alert v-if="loadError" type="error" variant="tonal">{{ loadError }}</v-alert>
  <v-progress-linear v-else-if="!channel" indeterminate />
  <v-row v-else>
    <v-col cols="12" lg="4">
      <UiParentCard :title="channel.name">
        <template #action><v-chip :color="statusColor(channel.status)" variant="tonal">{{ label(channel.status) }}</v-chip></template>
        <div class="text-medium-emphasis mb-4">@{{ channel.handle }} · {{ channel.category }}</div>
        <v-row dense class="mb-2">
          <v-col cols="6"><div class="text-caption text-disabled">Subscribers</div><div class="text-h4">{{ channel.youtubeChannelId ? (channel.youtubeSubscribers === null ? 'Hidden' : channel.youtubeSubscribers.toLocaleString()) : '—' }}</div></v-col>
          <v-col cols="6"><div class="text-caption text-disabled">Blessings</div><div class="text-h4">{{ channel.blessings }}</div></v-col>
        </v-row>
        <v-divider class="my-3" />
        <div class="text-body-2 mb-1"><span class="text-disabled">Owner:</span> {{ channel.owner ? `${channel.owner.name} (@${channel.owner.username})` : 'None' }}</div>
        <div class="text-body-2 mb-1"><span class="text-disabled">Created:</span> {{ dateOnly(channel.createdAt) }}</div>
        <div class="text-body-2 mb-4"><span class="text-disabled">Published:</span> {{ dateOnly(channel.publishedAt) }}</div>
        <div class="d-flex flex-wrap ga-2">
          <v-btn v-for="a in actions" :key="a.status + a.button" :color="a.color" variant="flat" size="small" @click="ask(a)">{{ a.button }}</v-btn>
        </div>
        <v-btn v-if="channel.status === 'active'" class="mt-3" variant="text" size="small" :href="`/channels/${channel.handle}`" target="_blank">View on website</v-btn>
        <v-btn class="mt-3" variant="text" size="small" :to="`/transactions?channel=${channel.handle}`">See its transactions</v-btn>
      </UiParentCard>
    </v-col>
    <v-col cols="12" lg="8">
      <UiParentCard title="YouTube" class="mb-6">
        <div v-if="channel.youtubeChannelId" class="mb-3">
          <div class="text-h4">{{ channel.youtubeSubscribers === null ? 'Hidden' : channel.youtubeSubscribers.toLocaleString() }} <span class="text-body-2 text-disabled">subscribers</span></div>
          <div class="text-body-2 text-medium-emphasis">
            <a :href="`https://www.youtube.com/channel/${channel.youtubeChannelId}`" target="_blank" rel="noopener">{{ channel.youtubeChannelId }}</a> · last synced {{ dateOnly(channel.youtubeSyncedAt) }}
          </div>
        </div>
        <div v-else class="text-body-2 text-medium-emphasis mb-3">Not linked to a YouTube channel.</div>
        <div class="d-flex ga-2 align-start">
          <v-text-field v-model="ytInput" :label="channel.youtubeChannelId ? 'Link a different channel (optional)' : 'YouTube channel ID'" placeholder="UCxxxxxxxxxxxxxxxxxxxxxx" hide-details="auto" density="comfortable" />
          <v-btn color="primary" rounded="0" height="48" :loading="ytBusy" :disabled="!channel.youtubeChannelId && !ytInput.trim()" @click="syncYoutube()">{{ ytInput.trim() ? 'Link & sync' : 'Sync now' }}</v-btn>
        </div>
        <v-alert v-if="ytError" type="error" variant="tonal" class="mt-3">{{ ytError }}</v-alert>
        <v-alert v-if="ytMessage" type="success" variant="tonal" class="mt-3">{{ ytMessage }}</v-alert>
      </UiParentCard>
      <UiParentCard title="Facebook" class="mb-6">
        <div v-if="channel.facebookPageId" class="mb-3">
          <div class="text-h4">{{ channel.facebookFollowers === null ? 'Hidden' : channel.facebookFollowers.toLocaleString() }} <span class="text-body-2 text-disabled">followers</span></div>
          <div class="text-body-2 text-medium-emphasis">
            <a :href="`https://www.facebook.com/${channel.facebookPageId}`" target="_blank" rel="noopener">{{ channel.facebookPageId }}</a> · last synced {{ dateOnly(channel.facebookSyncedAt) }}
          </div>
        </div>
        <div v-else class="text-body-2 text-medium-emphasis mb-3">Not linked to a Facebook Page.</div>
        <div class="d-flex ga-2 align-start">
          <v-text-field v-model="fbInput" :label="channel.facebookPageId ? 'Link a different page (optional)' : 'Facebook Page ID'" placeholder="e.g. 100064..., a page link or username" hide-details="auto" density="comfortable" />
          <v-btn color="primary" rounded="0" height="48" :loading="fbBusy" :disabled="!channel.facebookPageId && !fbInput.trim()" @click="syncFacebook()">{{ fbInput.trim() ? 'Link & sync' : 'Sync now' }}</v-btn>
        </div>
        <v-alert v-if="fbError" type="error" variant="tonal" class="mt-3">{{ fbError }}</v-alert>
        <v-alert v-if="fbMessage" type="success" variant="tonal" class="mt-3">{{ fbMessage }}</v-alert>
      </UiParentCard>
      <UiParentCard title="Featured content" class="mb-6">
        <div class="text-body-2 text-medium-emphasis mb-3">
          Choose which synced video or post fills each of the 3 "Latest from" slots on the channel page. Leave a slot on Auto to show the most recently synced item there instead.
        </div>
        <v-alert v-if="contentLoadError" type="error" variant="tonal" class="mb-3">{{ contentLoadError }}</v-alert>
        <div v-else-if="content.length === 0" class="text-body-2 text-medium-emphasis mb-3">Nothing synced from YouTube or Facebook yet.</div>
        <template v-else>
          <v-select
            v-for="(_, i) in slots"
            :key="i"
            v-model="slots[i]"
            :items="[{ id: null, title: 'Auto (most recently synced)' }, ...optionsFor(i).map((c) => ({ id: c.id, title: itemLabel(c) }))]"
            item-title="title"
            item-value="id"
            :label="`Slot ${i + 1}`"
            density="comfortable"
            class="mb-3"
          />
          <v-btn color="primary" rounded="0" height="48" :loading="contentBusy" @click="saveFeatured">Save slots</v-btn>
          <v-alert v-if="contentError" type="error" variant="tonal" class="mt-3">{{ contentError }}</v-alert>
          <v-alert v-if="contentSaved" type="success" variant="tonal" class="mt-3">Saved.</v-alert>
        </template>
      </UiParentCard>
      <UiParentCard title="Edit details">
        <v-form @submit="save">
          <ImageUpload label="Channel image (profile picture)" shape="avatar" :path="form.avatarPath" :url="form.avatarUrl" hint="Square works best. Shown on cards and the channel page." @change="(v) => { form.avatarPath = v.path; form.avatarUrl = v.url; }" />
          <ImageUpload label="Cover image" shape="cover" :path="form.coverPath" :url="form.coverUrl" hint="Wide image, about 1600 × 600. Leave empty to use the generated cover." @change="(v) => { form.coverPath = v.path; form.coverUrl = v.url; }" />
          <v-text-field v-model="form.name" label="Channel name" :error-messages="fieldErrors.name" class="mb-3" />
          <v-select v-model="form.category" :items="categories" item-title="name" item-value="slug" label="Category" :error-messages="fieldErrors.category" class="mb-3" />
          <v-text-field v-model="form.description" label="One-line summary" counter="200" maxlength="200" class="mb-3" />
          <v-textarea v-model="form.mission" label="Mission" rows="2" counter="600" maxlength="600" class="mb-3" />
          <v-textarea v-model="form.about" label="About (separate paragraphs with a blank line)" rows="5" class="mb-3" />
          <v-row dense>
            <v-col cols="6"><v-select v-model="form.coverTone" :items="['cream', 'mist', 'sage', 'stone']" label="Cover colour" /></v-col>
            <v-col cols="6"><v-select v-model="form.coverScene" :items="['horizon', 'hills', 'sun', 'waves']" label="Cover scene" /></v-col>
          </v-row>
          <v-switch v-model="form.featured" label="Featured on the directory" color="primary" hide-details density="compact" />
          <v-switch v-model="form.verified" label="Verified badge" color="primary" hide-details density="compact" />
          <v-switch v-model="form.showBlessings" label="Show blessings on this channel's page" color="primary" hide-details density="compact" class="mb-4" />
          <v-alert v-if="saveError" type="error" variant="tonal" class="mb-4">{{ saveError }}</v-alert>
          <v-alert v-if="saved" type="success" variant="tonal" class="mb-4">Saved.</v-alert>
          <v-btn color="primary" type="submit" rounded="0" :loading="saving">Save changes</v-btn>
        </v-form>
      </UiParentCard>
    </v-col>
  </v-row>
  <ConfirmDialog
    v-if="pending"
    v-model="dialog"
    :title="pending.title"
    :message="pending.message"
    :confirm-label="pending.button"
    :color="pending.color"
    reason-label="Note for the owner (optional)"
    :on-confirm="changeStatus"
  />
</template>
