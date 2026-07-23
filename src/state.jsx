import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, load, save, timeLabel, getSession } from './api.js';
import { INTEGRATIONS } from './data.js';

const AppState = createContext(null);
export const useApp = () => useContext(AppState);

// localStorage-backed state hook
export function useLocal(key, initial) {
  const [value, setValue] = useState(() => load(key, initial));
  const set = useCallback((next) => {
    setValue(prev => {
      const v = typeof next === 'function' ? next(prev) : next;
      save(key, v);
      return v;
    });
  }, [key]);
  return [value, set];
}

// Toasts
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function AppProvider({ children, onLogout }) {
  const user = getSession();

  // toasts
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);

  // server-backed data
  const [stores, setStores] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [stats, setStats] = useState(null);

  // local (per-browser) data
  const [plan, setPlan] = useLocal('plan', 'Free');
  const [addons, setAddons] = useLocal('addons', []);
  const [settings, setSettings] = useLocal('settings', null); // {currency, timezone}
  const [opLog, setOpLog] = useLocal('oplog', []);

  const logOp = useCallback((action) => {
    setOpLog(prev => [{ time: new Date().toLocaleString(), who: user?.name || 'Seller', action }, ...prev].slice(0, 200));
  }, [user?.name, setOpLog]);

  const syncStores = useCallback(async () => {
    const list = await api('/api/stores');
    setStores(list.map(s => ({
      id: s.id, platform: s.platform, key: s.key, name: s.name, site: s.site,
      time: new Date(s.authorizedAt).toLocaleString(),
      expiry: new Date(s.expiresAt).toLocaleDateString(),
    })));
    return list;
  }, []);

  const syncConversations = useCallback(async () => {
    const list = await api('/api/conversations');
    setConversations(list.map(c => ({
      id: c.id, name: c.buyerName, platform: c.platform, storeId: c.storeId, preview: c.preview,
      time: timeLabel(c.updatedAt), unread: c.unread, resolved: c.resolved, test: c.test,
      messages: c.messages.map(m => ({ direction: m.direction, text: m.text, time: timeLabel(m.at) })),
    })));
    return list;
  }, []);

  const syncStats = useCallback(async () => {
    setStats(await api('/api/stats?days=90'));
  }, []);

  const syncAll = useCallback(async () => {
    try {
      await Promise.all([syncStores(), syncConversations(), syncStats()]);
    } catch (e) {
      if (e?.message !== 'unauthorized') console.warn('sync failed', e);
    }
  }, [syncStores, syncConversations, syncStats]);

  // initial sync + 5s polling
  const syncRef = useRef(syncAll);
  syncRef.current = syncAll;
  useEffect(() => {
    syncRef.current();
    const t = setInterval(() => syncRef.current(), 5000);
    return () => clearInterval(t);
  }, []);

  const connected = INTEGRATIONS.map(i => ({
    ...i,
    connected: stores.some(s => s.key === i.key || s.platform === i.name),
  }));

  const unread = conversations.filter(c => c.unread).length;

  const value = {
    user, onLogout, toast,
    stores, conversations, connected, unread, stats,
    syncStores, syncConversations, syncStats, syncAll,
    plan, setPlan, addons, setAddons, settings, setSettings,
    opLog, logOp,
  };

  return (
    <AppState.Provider value={value}>
      <ToastCtx.Provider value={toast}>
        {children}
        <div className="toast-stack">
          {toasts.map(t => <div key={t.id} className="toast">{t.msg}</div>)}
        </div>
      </ToastCtx.Provider>
    </AppState.Provider>
  );
}
