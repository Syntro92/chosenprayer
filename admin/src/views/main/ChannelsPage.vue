<script setup lang="ts">
import ListPage from './ListPage.vue';
import { channels } from './data';
const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Type', key: 'type' },
  { title: 'Status', key: 'status' },
  { title: 'Raised', key: 'raised' },
  { title: 'Donors', key: 'donors' }
];
</script>
<template><ListPage title="Channels" :headers="headers" :items="channels" detail-base="/channels" add-to="/channels/add" /></template>
