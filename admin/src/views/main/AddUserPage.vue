<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';
import { api, ApiError, errorMessage } from '@/utils/api';

const router = useRouter();
const form = ref({ fullName: '', email: '', password: '', role: 'member' });
const showPassword = ref(false);
const saving = ref(false);
const error = ref('');
const fieldErrors = ref<Record<string, string>>({});

const roles = [
  { title: 'Admin — full dashboard access', value: 'admin' },
  { title: 'Member — website only, no dashboard', value: 'member' }
];

async function save(e: Event) {
  e.preventDefault();
  saving.value = true;
  error.value = '';
  fieldErrors.value = {};
  try {
    const created = await api.post<{ id: string }>('/users', { ...form.value });
    router.push(`/users/${created.id}`);
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
    title="Add User"
    :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Users', disabled: false, href: '/admin/users' }, { title: 'Add User', disabled: true, href: '#' }]"
  />
  <v-row>
    <v-col cols="12" md="6">
      <UiParentCard title="New user">
        <v-form @submit="save">
          <v-text-field v-model="form.fullName" variant="outlined" rounded="0" density="comfortable" label="Full name" :error-messages="fieldErrors.fullName" autocomplete="off" class="mb-3" />
          <v-text-field v-model="form.email" variant="outlined" rounded="0" density="comfortable" label="Email" type="email" :error-messages="fieldErrors.email" autocomplete="off" class="mb-3" />
          <v-text-field
            v-model="form.password"
            variant="outlined"
            rounded="0"
            density="comfortable"
            label="Temporary password"
            :type="showPassword ? 'text' : 'password'"
            hint="At least 8 characters. Share it with the user. They must choose their own password the first time they sign in."
            persistent-hint
            :error-messages="fieldErrors.password"
            autocomplete="new-password"
            class="mb-1"
          />
          <v-checkbox v-model="showPassword" label="Show password" density="compact" hide-details class="mb-3" />
          <v-select v-model="form.role" variant="outlined" rounded="0" density="comfortable" :items="roles" label="Role" :error-messages="fieldErrors.role" hint="Only admins can sign in to this dashboard." persistent-hint class="mb-4" />
          <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
          <v-btn color="primary" type="submit" rounded="0" :loading="saving" class="mr-2">Create user</v-btn>
          <v-btn variant="tonal" rounded="0" to="/users">Cancel</v-btn>
        </v-form>
      </UiParentCard>
    </v-col>
  </v-row>
</template>
