import { defineStore } from 'pinia';
import { router } from '@/router';
import { api, ApiError, setUnauthorizedHandler } from '@/utils/api';

export interface AdminMe {
  id: string;
  name: string;
  username: string;
  role: 'admin';
  /** Signed in with an admin-issued temporary password: only the change-password page is allowed. */
  mustChangePassword: boolean;
}

/**
 * Who is signed in. The session itself is the site's httpOnly cookie, so this store only caches the
 * answer of GET /api/admin/me for the UI. Nothing secret is kept in the browser.
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AdminMe | null,
    checked: false,
    returnUrl: null as string | null
  }),
  getters: {
    isAdmin: (s) => s.user?.role === 'admin'
  },
  actions: {
    /** Asks the server who we are (once per page load). */
    async restore() {
      if (this.checked) return;
      try {
        this.user = await api.get<AdminMe>('/me');
      } catch (e) {
        this.user = null;
        if (!(e instanceof ApiError) || (e.status !== 401 && e.status !== 403)) throw e;
      }
      this.checked = true;
    },
    async login(email: string, password: string) {
      await api.post('/session', { email, password });
      this.checked = false;
      await this.restore();
      if (!this.user) throw new ApiError(403, 'FORBIDDEN', 'This account does not have admin access.');
      if (this.user.mustChangePassword) {
        this.returnUrl = null;
        router.push('/change-password');
        return;
      }
      const to = this.returnUrl && this.returnUrl !== '/login' ? this.returnUrl : '/dashboard/default';
      this.returnUrl = null;
      router.push(to);
    },
    async changePassword(password: string, confirm: string) {
      await api.put('/password', { password, confirm });
      if (this.user) this.user.mustChangePassword = false;
      router.push('/dashboard/default');
    },
    async logout() {
      try {
        await api.del('/session');
      } finally {
        this.user = null;
        this.checked = true;
        router.push('/login');
      }
    }
  }
});

// Any 401 from the API (expired session, signed out elsewhere) returns to the login screen.
setUnauthorizedHandler(() => {
  const auth = useAuthStore();
  if (!auth.user) return;
  auth.user = null;
  auth.checked = true;
  auth.returnUrl = router.currentRoute.value.fullPath;
  router.push('/login');
});
