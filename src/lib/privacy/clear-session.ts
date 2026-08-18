import { usePosterStore } from '@/store/use-poster-store';

export function clearSession() {
  usePosterStore.getState().resetSession();
  if (typeof document !== 'undefined') {
    document.querySelectorAll<HTMLInputElement>('input[type=file]').forEach((input) => { input.value = ''; });
  }
}
