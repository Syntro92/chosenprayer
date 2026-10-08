// Sample data for the Chosen Bless Overview page.
// Every export below is shaped like an API response so it can later be replaced by a fetch to the real API/database.

export const palette = {
  yellow: '#FFBE00',
  success: '#7E9B83',
  warning: '#D99A24',
  error: '#C85C5C',
  border: '#E2E6E3',
  textPrimary: '#171918',
  textSecondary: '#66706D'
};

export const summary = {
  totalSupport: { value: 203482, changePct: 18.4, period: 'this month' },
  liveVisitors: { value: 248 },
  thisMonth: { value: 38420, changePct: 24.8, comparedTo: 'last month' },
  totalSupporters: { value: 8421, changePct: 11.2, period: 'this month' }
};

// Live visitor activity, one entry per range (visitors per bucket)
export const visitorActivity: Record<'30m' | '1h' | '24h', number[]> = {
  '30m': [180, 195, 210, 205, 224, 238, 230, 241, 236, 248],
  '1h': [140, 165, 172, 190, 185, 210, 220, 215, 238, 248],
  '24h': [60, 45, 38, 52, 90, 140, 180, 210, 232, 220, 241, 248]
};

export const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const supportByRange: Record<string, { oneTime: number[]; monthly: number[]; total: number; changePct: number }> = {
  'This Year': {
    oneTime: [6200, 7100, 7800, 8600, 9400, 10200, 11800, 12900, 14600, 15800, 17200, 18400],
    monthly: [1800, 2100, 2500, 2900, 3300, 3700, 4200, 4800, 5400, 6100, 6900, 7600],
    total: 38420,
    changePct: 24.8
  },
  'Last Year': {
    oneTime: [4200, 4600, 5100, 5500, 6000, 6400, 6900, 7300, 7900, 8400, 9100, 9700],
    monthly: [900, 1100, 1300, 1500, 1700, 1900, 2200, 2500, 2800, 3100, 3400, 3800],
    total: 21850,
    changePct: 12.3
  }
};
export const rangeOptions = Object.keys(supportByRange);

export const topChannels = [
  { name: 'Noble Soul', amount: 12840, supporters: 1284, changePct: 18.4, trend: [0, 15, 10, 50, 30, 40, 25] },
  { name: 'The Guiding Light', amount: 9421, supporters: 892, changePct: 12.1 },
  { name: 'El Elegido 1111', amount: 5882, supporters: 641, changePct: 8.7 },
  { name: 'Create & Inspire', amount: 4210, supporters: 428, changePct: 6.3 }
];

export type TxStatus = 'Completed' | 'Pending' | 'Failed' | 'Refunded';
export const recentTransactions: { supporter: string; channel: string; amount: number; status: TxStatus; time: string }[] = [
  { supporter: 'Sarah M.', channel: 'Noble Soul', amount: 55, status: 'Completed', time: '2 min ago' },
  { supporter: 'Daniel R.', channel: 'The Guiding Light', amount: 25, status: 'Completed', time: '8 min ago' },
  { supporter: 'Anonymous', channel: 'Noble Soul', amount: 111, status: 'Completed', time: '12 min ago' },
  { supporter: 'James K.', channel: 'Create & Inspire', amount: 11, status: 'Pending', time: '18 min ago' }
];
export const statusStyle: Record<TxStatus, { bg: string; fg: string }> = {
  Completed: { bg: '#7E9B8326', fg: '#5f7d65' },
  Pending: { bg: '#D99A2426', fg: '#A6761A' },
  Failed: { bg: '#C85C5C26', fg: '#C85C5C' },
  Refunded: { bg: '#66706D1f', fg: '#66706D' }
};

export const siteHealth = [
  { name: 'Website', status: 'Operational' },
  { name: 'API', status: 'Operational' },
  { name: 'Payments', status: 'Operational' },
  { name: 'Database', status: 'Operational' },
  { name: 'Email', status: 'Operational' }
];

export type ActivityKind = 'support' | 'supporter' | 'blessing' | 'view';
export const liveActivity: { kind: ActivityKind; title: string; channel: string; ago: string }[] = [
  { kind: 'support', title: 'New $25 support received', channel: 'The Guiding Light', ago: '34 seconds ago' },
  { kind: 'supporter', title: 'New supporter joined', channel: 'Noble Soul', ago: '1 minute ago' },
  { kind: 'blessing', title: 'New blessing received', channel: 'Noble Soul', ago: '2 minutes ago' },
  { kind: 'view', title: 'New channel viewed', channel: 'Create & Inspire', ago: '3 minutes ago' },
  { kind: 'support', title: 'New $55 support received', channel: 'Noble Soul', ago: '4 minutes ago' }
];

export const supportBreakdown = [
  { label: 'One-time', amount: 28420, pct: 74, color: '#5e35b1' },
  { label: 'Monthly', amount: 10000, pct: 26, color: '#1e88e5' }
];

export const money = (n: number) => '$' + n.toLocaleString('en-US');
