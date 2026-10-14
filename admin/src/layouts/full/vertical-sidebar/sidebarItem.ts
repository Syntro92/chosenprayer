import {
  CircleIcon,
  WindmillIcon,
  TypographyIcon,
  ShadowIcon,
  PaletteIcon,
  KeyIcon,
  BugIcon,
  DashboardIcon,
  BrandChromeIcon,
  HelpIcon,
  ChartBarIcon,
  UsersIcon,
  ReceiptIcon,
  BroadcastIcon,
  SettingsIcon,
  HeartbeatIcon,
  EyeIcon,
  UserIcon,
  HistoryIcon
} from 'vue-tabler-icons';

export interface menu {
  header?: string;
  title?: string;
  icon?: object;
  to?: string;
  divider?: boolean;
  chip?: string;
  chipColor?: string;
  chipVariant?: string;
  chipIcon?: string;
  children?: menu[];
  disabled?: boolean;
  type?: string;
  subCaption?: string;
}

const sidebarItem: menu[] = [
  { header: 'Main' },
  {
    title: 'Dashboard',
    icon: DashboardIcon,
    to: '/dashboard/default'
  },
  {
    title: 'Channels',
    icon: BroadcastIcon,
    to: '/channels'
  },
  {
    title: 'Transactions',
    icon: ReceiptIcon,
    to: '/transactions'
  },
  {
    title: 'Users',
    icon: UsersIcon,
    to: '/users'
  },
  {
    title: 'Analytics',
    icon: ChartBarIcon,
    to: '/analytics'
  },
  {
    title: 'Live Visitors',
    icon: EyeIcon,
    to: '/live-visitors'
  },
  {
    title: 'Site Health',
    icon: HeartbeatIcon,
    to: '/site-health'
  },
  {
    title: 'Audit Log',
    icon: HistoryIcon,
    to: '/audit'
  },
  {
    title: 'Settings',
    icon: SettingsIcon,
    to: '/settings'
  }
];

export default sidebarItem;
