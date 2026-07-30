import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

const ConfigContext = createContext(null);

/**
 * Public instance configuration.
 *
 * Tells the SPA which auth methods to offer so it does not present a signup
 * form the server will reject. These are presentation hints only — every gate is
 * enforced again server-side.
 */
const FALLBACK = {
  registrationEnabled: true,
  socialLoginEnabled: true,
  passwordResetEnabled: true,
  maintenanceMode: false,
  maintenanceMessage: '',
};

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get('/api/config')
      .then(({ data }) => {
        if (active && data) setConfig({ ...FALLBACK, ...data });
      })
      .catch(() => {
        // Keep the permissive fallback; the server still enforces the real rules.
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => ({ ...config, loaded }), [config, loaded]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) throw new Error('useConfig must be used inside a ConfigProvider');
  return context;
}
