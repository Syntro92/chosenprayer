<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { errorMessage } from '@/utils/api';

const email = ref('');
const password = ref('');
const show = ref(false);
const loading = ref(false);
const error = ref('');

const emailRules = [(v: string) => !!v || 'Email is required', (v: string) => /.+@.+\..+/.test(v) || 'Enter a valid email'];
const passwordRules = [(v: string) => !!v || 'Password is required'];

async function submit(e: Event) {
  e.preventDefault();
  if (loading.value || !email.value || !password.value) return;
  loading.value = true;
  error.value = '';
  try {
    await useAuthStore().login(email.value.trim(), password.value);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <h5 class="text-h5 text-center my-4 mb-8">Sign in with your staff account</h5>
  <v-form class="mt-7 loginForm" @submit="submit">
    <v-text-field
      v-model="email"
      :rules="emailRules"
      label="Email address"
      type="email"
      autocomplete="username"
      class="mt-4 mb-6"
      density="comfortable"
      hide-details="auto"
      variant="outlined"
      color="primary"
    />
    <v-text-field
      v-model="password"
      :rules="passwordRules"
      label="Password"
      autocomplete="current-password"
      density="comfortable"
      variant="outlined"
      color="primary"
      hide-details="auto"
      :append-inner-icon="show ? '$eye' : '$eyeOff'"
      :type="show ? 'text' : 'password'"
      @click:append-inner="show = !show"
    />
    <v-btn color="secondary" :loading="loading" block class="mt-6" variant="flat" size="large" rounded="0" type="submit">Sign In</v-btn>
    <v-alert v-if="error" type="error" variant="tonal" class="mt-4" role="alert">{{ error }}</v-alert>
  </v-form>
  <div class="mt-6 text-center text-caption text-disabled">Admins only. Use the same email and password as on the website.</div>
</template>
