<script setup lang="ts">
import DetailPage from './DetailPage.vue';
import { channels } from './data';
</script>
<template><DetailPage title="Channel Details" list-to="/channels" list-title="Channels" :items="channels" /></template>
