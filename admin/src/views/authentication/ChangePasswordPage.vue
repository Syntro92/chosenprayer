<script setup lang="ts">
import { ref } from 'vue';
import Logo from '@/layouts/full/logo/LogoDark.vue';
import { useAuthStore } from '@/stores/auth';
import { api, ApiError, errorMessage } from '@/utils/api';

const auth = useAuthStore();
const password = ref('');
const confirm = ref('');
const show = ref(false);
const loading = ref(false);
const error = ref('');
const fieldErrors = ref<Record<string, string>>({});

async function submit(e: Event) {
  e.preventDefault();
  if (loading.value) return;
  loading.value = true;
  error.value = '';
  fieldErrors.value = {};
  try {
    await auth.changePassword(password.value, confirm.value);
  } catch (err) {
    if (err instanceof ApiError) fieldErrors.value = err.fields;
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <v-row class="h-screen" no-gutters>
    <v-col cols="12" class="d-flex align-center bg-lightprimary">
      <v-container>
        <div class="pa-7 pa-sm-12">
          <v-row justify="center">
            <v-col cols="12" lg="10" xl="6" md="7">
              <v-card elevation="0" class="changeBox">
                <v-card variant="outlined">
                  <v-card-text class="pa-9">
                    <div class="text-center">
                      <Logo />
                      <h2 class="text-secondary text-h2 mt-8">Choose a new password</h2>
                      <h4 class="text-disabled text-h4 mt-3">You signed in with a temporary password. Set your own to continue.</h4>
                    </div>
                    <v-form class="mt-7" @submit="submit">
                      <v-text-field
                        v-model="password"
                        label="New password"
                        autocomplete="new-password"
                        density="comfortable"
                        variant="outlined"
                        color="primary"
                        hint="At least 8 characters."
                        persistent-hint
                        :error-messages="fieldErrors.password"
                        :append-inner-icon="show ? '$eye' : '$eyeOff'"
                        :type="show ? 'text' : 'password'"
                        class="mb-4"
                        @click:append-inner="show = !show"
                      />
                      <v-text-field
                        v-model="confirm"
                        label="Confirm new password"
                        autocomplete="new-password"
                        density="comfortable"
                        variant="outlined"
                        color="primary"
                        :error-messages="fieldErrors.confirm"
                        :type="show ? 'text' : 'password'"
                      />
                      <v-btn color="secondary" :loading="loading" :disabled="!password || !confirm" block class="mt-6" variant="flat" size="large" rounded="0" type="submit">Save and continue</v-btn>
                      <v-alert v-if="error" type="error" variant="tonal" class="mt-4" role="alert">{{ error }}</v-alert>
                    </v-form>
                    <div class="mt-6 text-center"><v-btn variant="text" size="small" @click="auth.logout()">Sign out</v-btn></div>
                  </v-card-text>
                </v-card>
              </v-card>
            </v-col>
          </v-row>
        </div>
      </v-container>
    </v-col>
  </v-row>
</template>

<style lang="scss">
.changeBox {
  max-width: 475px;
  margin: 0 auto;
}
</style>
