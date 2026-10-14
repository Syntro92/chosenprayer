/** "$1,234.50" from integer cents. Whole amounts drop the decimals ("$25"). */
export function money(cents: number, currency = 'USD'): string {
  const units = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(units) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(units);
}

export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const dateOnly = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');

export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** +12% / −3% versus a previous value; null when there is nothing to compare with. */
export function change(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

const colors: Record<string, string> = {
  active: 'success',
  succeeded: 'success',
  member: 'grey',
  moderator: 'info',
  admin: 'primary',
  pending: 'warning',
  paused: 'warning',
  open: 'warning',
  failed: 'error',
  suspended: 'error',
  refunded: 'grey',
  canceled: 'grey',
  archived: 'grey'
};
export const statusColor = (s: string) => colors[s] ?? 'primary';
export const label = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : s);
