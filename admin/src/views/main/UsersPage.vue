<script setup lang="ts">
import ListPage from './ListPage.vue';
import { users } from './data';
const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Email', key: 'email' },
  { title: 'Role', key: 'role' },
  { title: 'Status', key: 'status' },
  { title: 'Joined', key: 'joined' }
];
</script>
<template><ListPage title="Users" :headers="headers" :items="users" detail-base="/users" /></template>
