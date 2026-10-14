<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import BaseBreadcrumb from '@/components/shared/BaseBreadcrumb.vue';
import UiParentCard from '@/components/shared/UiParentCard.vue';
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue';
import { api, errorMessage } from '@/utils/api';
import { dateTime, label, money, statusColor } from '@/utils/format';

interface Tx {
  id: string;
  donor: { name: string; email: string | null; userId: string | null; guest: boolean };
  channel: { id: string; handle: string; name: string };
  amountCents: number;
  feeCents: number;
  currency: string;
  frequency: string;
  status: string;
  source: string;
  provider: string;
  createdAt: string;
  paidAt: string | null;
  providerPaymentId: string | null;
  providerSubscriptionId: string | null;
  failureReason: string | null;
  refundedAt: string | null;
  receiptSentAt: string | null;
  receiptUrl: string | null;
  blessing: { message: string; displayName: string | null } | null;
  refund: { reason: string | null; by: string | null; at: string } | null;
}

const route = useRoute();
const id = String(route.params.id);
const tx = ref<Tx | null>(null);
const error = ref('');
const dialog = ref(false);

onMounted(async () => {
  try {
    tx.value = await api.get<Tx>(`/transactions/${id}`);
  } catch (e) {
    error.value = errorMessage(e);
  }
});

async function refund(reason: string) {
  tx.value = await api.post<Tx>(`/transactions/${id}/refund`, { reason });
}

const rows = (t: Tx): [string, string][] => [
  ['Amount', money(t.amountCents, t.currency)],
  ['Fee', money(t.feeCents, t.currency)],
  ['Type', t.frequency === 'monthly' ? 'Monthly' : 'One-time'],
  ['Source', label(t.source)],
  ['Created', dateTime(t.createdAt)],
  ['Paid', dateTime(t.paidAt)],
  ['Receipt emailed', dateTime(t.receiptSentAt)],
  ['Provider', t.provider],
  ['Payment ID', t.providerPaymentId ?? '—'],
  ['Subscription ID', t.providerSubscriptionId ?? '—']
];
</script>

<template>
  <BaseBreadcrumb
    title="Transaction Details"
    :breadcrumbs="[{ title: 'Main', disabled: false, href: '#' }, { title: 'Transactions', disabled: false, href: '/admin/transactions' }, { title: 'Transaction Details', disabled: true, href: '#' }]"
  />
  <v-alert v-if="error" type="error" variant="tonal">{{ error }}</v-alert>
  <v-progress-linear v-else-if="!tx" indeterminate />
  <v-row v-else>
    <v-col cols="12" md="7">
      <UiParentCard :title="`${money(tx.amountCents, tx.currency)} to ${tx.channel.name}`">
        <template #action><v-chip :color="statusColor(tx.status)" variant="tonal">{{ label(tx.status) }}</v-chip></template>
        <v-table density="comfortable">
          <tbody>
            <tr v-for="[k, v] in rows(tx)" :key="k"><td class="text-disabled" style="width: 40%">{{ k }}</td><td class="text-break">{{ v }}</td></tr>
            <tr v-if="tx.failureReason"><td class="text-disabled">Failure reason</td><td>{{ tx.failureReason }}</td></tr>
          </tbody>
        </v-table>
        <div v-if="tx.refund || tx.refundedAt" class="mt-4">
          <v-alert type="info" variant="tonal">
            Refunded {{ dateTime(tx.refund?.at ?? tx.refundedAt) }}<template v-if="tx.refund?.by"> by {{ tx.refund.by }}</template>.
            <template v-if="tx.refund?.reason"> Reason: {{ tx.refund.reason }}</template>
          </v-alert>
        </div>
        <div class="d-flex flex-wrap ga-3 mt-4">
          <v-btn v-if="tx.receiptUrl" color="primary" variant="flat" :href="tx.receiptUrl" target="_blank" rel="noopener noreferrer">Download Stripe receipt</v-btn>
          <v-btn v-if="tx.status === 'succeeded'" color="error" variant="flat" @click="dialog = true">Refund this donation</v-btn>
        </div>
      </UiParentCard>
    </v-col>
    <v-col cols="12" md="5">
      <UiParentCard title="Donor">
        <div class="text-h5">{{ tx.donor.name }}</div>
        <div class="text-medium-emphasis mb-2">{{ tx.donor.email ?? 'No email on file' }}</div>
        <v-chip size="small" variant="tonal" class="mb-3">{{ tx.donor.guest ? 'Guest checkout' : 'Member' }}</v-chip>
        <div v-if="tx.donor.userId"><v-btn variant="text" size="small" :to="`/users/${tx.donor.userId}`">Open member profile</v-btn></div>
        <div><v-btn variant="text" size="small" :to="`/channels/${tx.channel.id}`">Open channel</v-btn></div>
      </UiParentCard>
      <UiParentCard v-if="tx.blessing" title="Blessing" class="mt-6">
        <p class="mb-2">“{{ tx.blessing.message }}”</p>
        <div class="text-caption text-disabled">— {{ tx.blessing.displayName ?? 'Anonymous' }}</div>
      </UiParentCard>
    </v-col>
  </v-row>
  <ConfirmDialog
    v-if="tx"
    v-model="dialog"
    title="Refund this donation?"
    :message="`The ${money(tx.amountCents, tx.currency)} gift is returned to the donor and they are emailed. This cannot be undone.`"
    confirm-label="Refund"
    color="error"
    reason-label="Reason (kept in the audit log)"
    reason-required
    :on-confirm="refund"
  />
</template>
