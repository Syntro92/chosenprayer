<script setup lang="ts">
import ListPage from './ListPage.vue';
import { transactions } from './data';
const headers = [
  { title: 'ID', key: 'id' },
  { title: 'Donor', key: 'donor' },
  { title: 'Channel', key: 'channel' },
  { title: 'Amount', key: 'amount' },
  { title: 'Status', key: 'status' },
  { title: 'Date', key: 'date' }
];
</script>
<template><ListPage title="Transactions" :headers="headers" :items="transactions" detail-base="/transactions" /></template>
