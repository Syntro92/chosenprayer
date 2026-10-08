<script setup lang="ts">
import DetailPage from './DetailPage.vue';
import { users } from './data';
</script>
<template><DetailPage title="User Details" list-to="/users" list-title="Users" :items="users" /></template>
