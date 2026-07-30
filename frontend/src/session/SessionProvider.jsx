import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, onSessionLoss, SessionExpiredError } from '@/lib/api';

const SessionContext = createContext(null);

const STATUS = {
  loading: 'loading',
  authenticated: 'authenticated',
  anonymous: 'anonymous',
};

/**
 * Holds the signed-in user.
 *
 * Express used to gate each page server-side with an `access_token` cookie
 * check. Now that pages are static files on S3 the gate moves here: we probe
 * `/api/oauth/userinfo` once on boot and route from the result. The cookie
 * itself stays httpOnly and is never readable by this code.
 */
export function SessionProvider({ children }) {
  const [status, setStatus] = useState(STATUS.loading);
  const [user, setUser] = useState(null);
  const inFlight = useRef(null);

  const load = useCallback(async () => {
    if (inFlight.current) return inFlight.current;

    const promise = (async () => {
      try {
        const { data } = await api.post('/api/oauth/userinfo');
        setUser(data);
        setStatus(STATUS.authenticated);
        return data;
      } catch (error) {
        if (!(error instanceof SessionExpiredError)) {
          // A server-side failure is indistinguishable from "not signed in"
          // as far as routing goes, so treat both as anonymous.
          console.error('Failed to load session', error);
        }
        setUser(null);
        setStatus(STATUS.anonymous);
        return null;
      } finally {
        inFlight.current = null;
      }
    })();

    inFlight.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const clear = useCallback(() => {
    setUser(null);
    setStatus(STATUS.anonymous);
  }, []);

  // Any API call can be the one that discovers the cookie has expired, hours
  // after the boot probe succeeded. Dropping to anonymous here lets the route
  // guards do the redirecting, so individual pages never have to.
  useEffect(() => onSessionLoss(clear), [clear]);

  const value = useMemo(
    () => ({
      status,
      user,
      isLoading: status === STATUS.loading,
      isAuthenticated: status === STATUS.authenticated,
      refresh: load,
      clear,
    }),
    [status, user, load, clear],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside a SessionProvider');
  return context;
}
