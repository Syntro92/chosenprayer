const MainRoutes = {
  path: '/main',
  meta: {
    requiresAuth: true
  },
  redirect: '/main/dashboard/default',
  component: () => import('@/layouts/full/FullLayout.vue'),
  children: [
    {
      name: 'Channels',
      path: '/channels',
      component: () => import('@/views/main/ChannelsPage.vue')
    },
    {
      name: 'Add Channel',
      path: '/channels/add',
      component: () => import('@/views/main/AddChannelPage.vue')
    },
    {
      name: 'Channel Details',
      path: '/channels/:id',
      component: () => import('@/views/main/ChannelDetailsPage.vue')
    },
    {
      name: 'Transactions',
      path: '/transactions',
      component: () => import('@/views/main/TransactionsPage.vue')
    },
    {
      name: 'Transaction Details',
      path: '/transactions/:id',
      component: () => import('@/views/main/TransactionDetailsPage.vue')
    },
    {
      name: 'Users',
      path: '/users',
      component: () => import('@/views/main/UsersPage.vue')
    },
    {
      name: 'User Details',
      path: '/users/:id',
      component: () => import('@/views/main/UserDetailsPage.vue')
    },
    {
      name: 'Analytics',
      path: '/analytics',
      component: () => import('@/views/main/AnalyticsPage.vue')
    },
    {
      name: 'Live Visitors',
      path: '/live-visitors',
      component: () => import('@/views/main/LiveVisitorsPage.vue')
    },
    {
      name: 'Site Health',
      path: '/site-health',
      component: () => import('@/views/main/SiteHealthPage.vue')
    },
    {
      name: 'Feature Management',
      path: '/features',
      component: () => import('@/views/main/FeatureManagementPage.vue')
    },
    {
      name: 'Settings',
      path: '/settings',
      component: () => import('@/views/main/SettingsPage.vue')
    },
    {
      name: 'LandingPage',
      path: '/',
      component: () => import('@/views/dashboards/default/DefaultDashboard.vue')
    },
    {
      name: 'Default',
      path: '/dashboard/default',
      component: () => import('@/views/dashboards/default/DefaultDashboard.vue')
    },
    {
      name: 'Starter',
      path: '/starter',
      component: () => import('@/views/StarterPage.vue')
    },
    {
      name: 'Tabler Icons',
      path: '/icons/tabler',
      component: () => import('@/views/utilities/icons/TablerIcons.vue')
    },
    {
      name: 'Material Icons',
      path: '/icons/material',
      component: () => import('@/views/utilities/icons/MaterialIcons.vue')
    },
    {
      name: 'Typography',
      path: '/utils/typography',
      component: () => import('@/views/utilities/typography/TypographyPage.vue')
    },
    {
      name: 'Shadows',
      path: '/utils/shadows',
      component: () => import('@/views/utilities/shadows/ShadowPage.vue')
    },
    {
      name: 'Colors',
      path: '/utils/colors',
      component: () => import('@/views/utilities/colors/ColorPage.vue')
    }
  ]
};

export default MainRoutes;
