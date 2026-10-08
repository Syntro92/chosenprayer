<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';

const router = useRouter();
const form = ref({ name: '', type: 'Web', status: 'Active', description: '' });
</script>

<template>
  <BaseBreadcrumb
    title="Add Channel"
    :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Channels', disabled: false, href: '/admin/channels' }, { title: 'Add Channel', disabled: true, href: '#' }]"
  />
  <v-row>
    <v-col cols="12" md="8">
      <UiParentCard title="Add Channel">
        <v-form @submit.prevent="router.push('/channels')">
          <v-text-field v-model="form.name" label="Channel name" required />
          <v-select v-model="form.type" label="Type" :items="['Web', 'Social', 'Email', 'Offline']" />
          <v-select v-model="form.status" label="Status" :items="['Active', 'Paused', 'Inactive']" />
          <v-textarea v-model="form.description" label="Description" rows="3" />
          <v-btn color="primary" type="submit" class="mr-2">Save</v-btn>
          <v-btn variant="tonal" to="/channels">Cancel</v-btn>
        </v-form>
      </UiParentCard>
    </v-col>
  </v-row>
</template>
