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
  ToggleLeftIcon,
  EyeIcon,
  UserIcon,
  PlusIcon,
  ListDetailsIcon
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
    title: 'Channel Details',
    icon: ListDetailsIcon,
    to: '/channels/1'
  },
  {
    title: 'Add Channel',
    icon: PlusIcon,
    to: '/channels/add'
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
    title: 'User Details',
    icon: UserIcon,
    to: '/users/1'
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
    title: 'Feature Management',
    icon: ToggleLeftIcon,
    to: '/features'
  },
  {
    title: 'Settings',
    icon: SettingsIcon,
    to: '/settings'
  }
];

export default sidebarItem;
