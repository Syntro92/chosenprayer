import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { api, errorMessage } from '@/utils/api';

export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * A filterable, server-paged list. Changing any filter returns to page 1; text filters are debounced.
 * The latest request wins, so a slow earlier response can never overwrite a newer one.
 */
export function usePaged<T>(path: string, initial: Record<string, string> = {}, pageSize = 20) {
  const filters = reactive<Record<string, string>>({ ...initial });
  const items = ref<T[]>([]);
  const total = ref(0);
  const page = ref(1);
  const loading = ref(true);
  const error = ref('');
  let seq = 0;
  let timer: number | undefined;

  async function load() {
    const mine = ++seq;
    loading.value = true;
    error.value = '';
    try {
      const res = await api.get<PagedResponse<T>>(path, { ...filters, page: page.value, pageSize });
      if (mine !== seq) return;
      items.value = res.items;
      total.value = res.total;
    } catch (e) {
      if (mine !== seq) return;
      error.value = errorMessage(e);
    } finally {
      if (mine === seq) loading.value = false;
    }
  }

  watch(
    filters,
    () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (page.value !== 1) page.value = 1; // the page watcher reloads
        else load();
      }, 300);
    },
    { deep: true }
  );
  watch(page, load);
  onMounted(load);
  onBeforeUnmount(() => window.clearTimeout(timer));

  return { filters, items, total, page, pageSize, loading, error, reload: load };
}
