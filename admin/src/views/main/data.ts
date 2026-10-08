export const channels = [
  { id: 1, name: 'Website Donate Button', type: 'Web', status: 'Active', raised: 12450, donors: 312 },
  { id: 2, name: 'Facebook Campaign', type: 'Social', status: 'Active', raised: 8300, donors: 190 },
  { id: 3, name: 'Instagram Stories', type: 'Social', status: 'Paused', raised: 2150, donors: 64 },
  { id: 4, name: 'Email Newsletter', type: 'Email', status: 'Active', raised: 5920, donors: 141 },
  { id: 5, name: 'QR Code Poster', type: 'Offline', status: 'Inactive', raised: 780, donors: 25 }
];
export const transactions = [
  { id: 1001, donor: 'Aarav Sharma', channel: 'Website Donate Button', amount: 250, status: 'Completed', date: '2026-10-07' },
  { id: 1002, donor: 'Priya Nair', channel: 'Facebook Campaign', amount: 100, status: 'Completed', date: '2026-10-07' },
  { id: 1003, donor: 'John Smith', channel: 'Email Newsletter', amount: 500, status: 'Pending', date: '2026-10-06' },
  { id: 1004, donor: 'Mei Chen', channel: 'Website Donate Button', amount: 75, status: 'Failed', date: '2026-10-06' },
  { id: 1005, donor: 'Liam Brown', channel: 'Instagram Stories', amount: 40, status: 'Completed', date: '2026-10-05' }
];
export const users = [
  { id: 1, name: 'Aarav Sharma', email: 'aarav@example.com', role: 'Admin', status: 'Active', joined: '2026-01-12' },
  { id: 2, name: 'Priya Nair', email: 'priya@example.com', role: 'Editor', status: 'Active', joined: '2026-02-03' },
  { id: 3, name: 'John Smith', email: 'john@example.com', role: 'Donor', status: 'Active', joined: '2026-03-21' },
  { id: 4, name: 'Mei Chen', email: 'mei@example.com', role: 'Donor', status: 'Suspended', joined: '2026-05-09' },
  { id: 5, name: 'Liam Brown', email: 'liam@example.com', role: 'Donor', status: 'Active', joined: '2026-06-30' }
];
const colors: Record<string, string> = {
  Active: 'success',
  Completed: 'success',
  Paused: 'warning',
  Pending: 'warning',
  Inactive: 'grey',
  Failed: 'error',
  Suspended: 'error'
};
export const statusColor = (s: string) => colors[s] || 'primary';
