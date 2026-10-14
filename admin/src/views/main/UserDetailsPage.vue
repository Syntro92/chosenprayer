<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue';
import { api, errorMessage } from '@/utils/api';
import { useAuthStore } from '@/stores/auth';
import { dateOnly, dateTime, label, money, statusColor } from '@/utils/format';

interface User {
  id: string;
  name: string;
  username: string;
  email: string | null;
  bio: string;
  role: 'member' | 'moderator' | 'admin';
  status: 'active' | 'suspended';
  verified: boolean;
  joinedAt: string;
  lastSignInAt: string | null;
  stats: { posts: number; comments: number; donations: number; givenCents: number; reportsAgainst: number };
  history: { action: string; at: string; by: string | null; metadata: Record<string, unknown> }[];
}

const route = useRoute();
const id = String(route.params.id);
const me = useAuthStore();
const user = ref<User | null>(null);
const error = ref('');
const actionError = ref('');
const role = ref<User['role']>('member');
const savingRole = ref(false);
const suspendDialog = ref(false);

function fill(u: User) {
  user.value = u;
  role.value = u.role;
}
onMounted(async () => {
  try {
    fill(await api.get<User>(`/users/${id}`));
  } catch (e) {
    error.value = errorMessage(e);
  }
});

async function patch(body: Record<string, unknown>) {
  fill(await api.patch<User>(`/users/${id}`, body));
}
async function run(body: Record<string, unknown>) {
  actionError.value = '';
  try {
    await patch(body);
  } catch (e) {
    actionError.value = errorMessage(e);
  }
}
async function saveRole() {
  savingRole.value = true;
  await run({ role: role.value });
  savingRole.value = false;
}
const isMe = () => user.value?.id === me.user?.id;
const describe = (h: User['history'][number]) => {
  const m = h.metadata as Record<string, any>;
  switch (h.action) {
    case 'user.suspend':
      return `Suspended${m.reason ? `: ${m.reason}` : ''}`;
    case 'user.unsuspend':
      return 'Suspension lifted';
    case 'user.set_role':
      return `Role changed from ${m.from} to ${m.to}`;
    case 'user.verify':
      return m.verified ? 'Verified badge added' : 'Verified badge removed';
    default:
      return h.action;
  }
};
</script>

<template>
  <BaseBreadcrumb
    title="User Details"
    :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Users', disabled: false, href: '/admin/users' }, { title: 'User Details', disabled: true, href: '#' }]"
  />
  <v-alert v-if="error" type="error" variant="tonal">{{ error }}</v-alert>
  <v-progress-linear v-else-if="!user" indeterminate />
  <v-row v-else>
    <v-col cols="12" md="5">
      <UiParentCard :title="user.name">
        <template #action><v-chip :color="statusColor(user.status)" variant="tonal">{{ label(user.status) }}</v-chip></template>
        <div class="text-medium-emphasis">@{{ user.username }}</div>
        <div class="mb-2">{{ user.email ?? 'No email' }}</div>
        <p v-if="user.bio" class="text-body-2 mb-3">{{ user.bio }}</p>
        <div class="text-body-2"><span class="text-disabled">Joined:</span> {{ dateOnly(user.joinedAt) }}</div>
        <div class="text-body-2 mb-4"><span class="text-disabled">Last sign-in:</span> {{ dateTime(user.lastSignInAt) }}</div>
        <v-row dense>
          <v-col cols="6"><div class="text-caption text-disabled">Posts</div><div class="text-h4">{{ user.stats.posts }}</div></v-col>
          <v-col cols="6"><div class="text-caption text-disabled">Comments</div><div class="text-h4">{{ user.stats.comments }}</div></v-col>
          <v-col cols="6"><div class="text-caption text-disabled">Gifts</div><div class="text-h4">{{ user.stats.donations }} · {{ money(user.stats.givenCents) }}</div></v-col>
          <v-col cols="6"><div class="text-caption text-disabled">Reports against</div><div class="text-h4">{{ user.stats.reportsAgainst }}</div></v-col>
        </v-row>
      </UiParentCard>
    </v-col>
    <v-col cols="12" md="7">
      <UiParentCard title="Manage account">
        <v-alert v-if="actionError" type="error" variant="tonal" class="mb-4">{{ actionError }}</v-alert>
        <div class="d-flex align-center ga-3 mb-2">
          <v-select v-model="role" :items="['member', 'moderator', 'admin']" label="Role" density="comfortable" hide-details :disabled="isMe()" style="max-width: 220px" />
          <v-btn color="primary" variant="flat" :disabled="role === user.role || isMe()" :loading="savingRole" @click="saveRole">Save role</v-btn>
        </div>
        <div v-if="isMe()" class="text-caption text-disabled mb-2">You can’t change your own role or suspend yourself.</div>
        <v-switch :model-value="user.verified" label="Verified badge" color="primary" hide-details density="compact" class="mb-3" @update:model-value="(v: any) => run({ verified: !!v })" />
        <v-btn v-if="user.status === 'active'" color="error" variant="flat" :disabled="isMe() || user.role === 'admin'" @click="suspendDialog = true">Suspend account</v-btn>
        <v-btn v-else color="success" variant="flat" @click="run({ status: 'active' })">Lift suspension</v-btn>
        <div v-if="user.role === 'admin' && !isMe()" class="text-caption text-disabled mt-2">Admins can’t be suspended. Change their role first.</div>
      </UiParentCard>
      <UiParentCard title="History" class="mt-6">
        <div v-if="!user.history.length" class="text-disabled">No admin actions on this account yet.</div>
        <v-timeline v-else density="compact" side="end" line-thickness="2">
          <v-timeline-item v-for="(h, i) in user.history" :key="i" size="x-small" dot-color="primary">
            <div class="font-weight-medium">{{ describe(h) }}</div>
            <div class="text-caption text-disabled">{{ dateTime(h.at) }}<template v-if="h.by"> · by {{ h.by }}</template></div>
          </v-timeline-item>
        </v-timeline>
      </UiParentCard>
    </v-col>
  </v-row>
  <ConfirmDialog
    v-model="suspendDialog"
    title="Suspend this account?"
    message="They are signed out and can’t sign in or post until the suspension is lifted. Their existing posts stay visible."
    confirm-label="Suspend"
    color="error"
    reason-label="Reason (kept in the audit log)"
    reason-required
    :on-confirm="(reason: string) => patch({ status: 'suspended', reason })"
  />
</template>
