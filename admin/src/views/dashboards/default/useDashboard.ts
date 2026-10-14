import { inject, onBeforeUnmount, onMounted, provide, ref, type InjectionKey, type Ref } from 'vue';
import { api, errorMessage } from '@/utils/api';

export interface Tx {
  id: string;
  donor: { name: string };
  channel: { name: string };
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
}
export interface DashboardData {
  currency: string;
  totals: { raisedCents: number; donations: number; donors: number; averageCents: number; refundedCents: number; activeChannels: number; pendingChannels: number; members: number };
  series: { date: string; amountCents: number; donations: number }[];
  topChannels: { handle: string; name: string; raisedCents: number; donations: number }[];
  recentTransactions: Tx[];
  pendingApprovals: number;
  month: { raisedCents: number; previousCents: number; donors: number; previousDonors: number };
  breakdown: { onceCents: number; monthlyCents: number };
  activity: { kind: 'support' | 'blessing' | 'supporter'; title: string; channel: string | null; at: string }[];
}
export interface LiveData {
  online: number;
  hourly: number[];
}
export interface HealthData {
  ok: boolean;
  checks: {
    database: { ok: boolean; ms: number };
    payments: { ok: boolean; provider: string; testMode: boolean };
    email: { ok: boolean };
    webhooks: { ok: boolean };
  };
}

interface State {
  dashboard: Ref<DashboardData | null>;
  live: Ref<LiveData | null>;
  health: Ref<HealthData | null>;
  error: Ref<string>;
  loading: Ref<boolean>;
  reload: () => Promise<void>;
}
const KEY: InjectionKey<State> = Symbol('dashboard');

/** Call once in the dashboard page: loads everything in parallel and refreshes every 30 seconds. */
export function provideDashboard() {
  const dashboard = ref<DashboardData | null>(null);
  const live = ref<LiveData | null>(null);
  const health = ref<HealthData | null>(null);
  const error = ref('');
  const loading = ref(true);
  let timer: number | undefined;

  async function reload() {
    const [d, l, h] = await Promise.allSettled([api.get<DashboardData>('/dashboard'), api.get<LiveData>('/live'), api.get<HealthData>('/health')]);
    if (d.status === 'fulfilled') dashboard.value = d.value;
    if (l.status === 'fulfilled') live.value = l.value;
    if (h.status === 'fulfilled') health.value = h.value;
    // A failed refresh keeps the last good numbers on screen and says so.
    error.value = d.status === 'rejected' ? errorMessage(d.reason) : '';
    loading.value = false;
  }
  onMounted(() => {
    reload();
    timer = window.setInterval(reload, 30000);
  });
  onBeforeUnmount(() => window.clearInterval(timer));

  const state: State = { dashboard, live, health, error, loading, reload };
  provide(KEY, state);
  return state;
}

export function useDashboard(): State {
  const s = inject(KEY);
  if (!s) throw new Error('useDashboard() needs provideDashboard() in a parent');
  return s;
}
