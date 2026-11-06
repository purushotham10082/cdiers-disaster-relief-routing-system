import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useData = () => useContext(Ctx);
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function Providers({ children }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const last = React.useRef('');
  const refresh = useCallback(async () => { try { const j = await api('GET', '/bootstrap'); const s = JSON.stringify(j); if (s !== last.current) { last.current = s; setD(j); } setError(null); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [refresh]);
  const toast = useCallback((msg, tone = 'ok') => { const id = Math.random(); setToasts((t) => [...t, { id, msg, tone }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'err' ? 7000 : 4500); }, []);
  const value = useMemo(() => {
    if (!d) return { d: null, refresh, error };
    const locMap = Object.fromEntries(d.locations.map((l) => [l.id, l]));
    return { d, refresh, error, locMap, name: (id) => locMap[id]?.name || id };
  }, [d, refresh, error]);
  return (
    <Ctx.Provider value={value}>
      <ToastCtx.Provider value={toast}>
        {children}
        <div className="toasts" role="status">{toasts.map((t) => <div key={t.id} className={'toast ' + t.tone}>{t.msg}</div>)}</div>
      </ToastCtx.Provider>
    </Ctx.Provider>
  );
}
// run an API action, toast the result, refresh data
export function useAction() {
  const { refresh } = useData();
  const toast = useToast();
  return async (fn, okMsg) => { try { const r = await fn(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); await refresh(); return r; } catch (e) { toast(e.message, 'err'); return null; } };
}
