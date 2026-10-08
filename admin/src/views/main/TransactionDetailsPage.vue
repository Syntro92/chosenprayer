<script setup lang="ts">
import DetailPage from './DetailPage.vue';
import { transactions } from './data';
</script>
<template><DetailPage title="Transaction Details" list-to="/transactions" list-title="Transactions" :items="transactions" /></template>
