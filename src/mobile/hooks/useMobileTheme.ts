import { useEffect, useState } from 'react';

const KEY = 'mc.mobile.theme';

export type MobileTheme = 'light' | 'dark';

function read(): MobileTheme {
  if (typeof window === 'undefined') return 'light';
  const v = window.localStorage.getItem(KEY);
  if (v === 'dark' || v === 'light') return v;
  return 'light';
}

export function useMobileTheme() {
  const [theme, setTheme] = useState<MobileTheme>(read);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, theme);
    } catch {
      /* noop */
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  return { theme, toggle, isDark: theme === 'dark' };
}
