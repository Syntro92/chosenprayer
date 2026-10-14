import { createRouter, createWebHistory } from 'vue-router';
import MainRoutes from './MainRoutes';
import PublicRoutes from './PublicRoutes';
import { useAuthStore } from '@/stores/auth';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/:pathMatch(.*)*',
      component: () => import('@/views/pages/maintenance/error/Error404Page.vue')
    },
    MainRoutes,
    PublicRoutes
  ]
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.restore();

  const authRequired = to.matched.some((record) => record.meta.requiresAuth);
  if (authRequired && !auth.user) {
    auth.returnUrl = to.fullPath;
    return '/login';
  }
  // A temporary password must be replaced before anything else is reachable.
  if (auth.user?.mustChangePassword && to.path !== '/change-password') return '/change-password';
  if (to.path === '/change-password') return auth.user ? (auth.user.mustChangePassword ? true : '/dashboard/default') : '/login';
  if (auth.user && to.path === '/login') return '/dashboard/default';
  return true;
});
