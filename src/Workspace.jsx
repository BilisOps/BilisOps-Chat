import React, { useState, useEffect, useRef } from 'react';
import { useApp } from './state.jsx';
import { RAIL_TOP, RAIL_BOTTOM } from './data.js';
import Home from './pages/Home.jsx';
import Chats from './pages/Chats.jsx';
import Tickets from './pages/Tickets.jsx';
import Plans from './pages/Plans.jsx';
import { AiHub, AiMonitor, TogglesPage, AiRulesPage, RECEPTION_ITEMS, HANDOVER_ITEMS } from './pages/Ai.jsx';
import { Followup, Broadcast, QuickReply, AutoReply, ReplyReview, Reminders } from './pages/Marketing.jsx';
import { SalesConv, LossPage, ReviewAnalysis, CsPerf, StorePerf, StoreHealth } from './pages/Analytics.jsx';
import { StoreAuth, AgentsPage, Sensitive, SystemSettings, OpRecord, Privacy } from './pages/Settings.jsx';

const PAGES = {
  home: { title: 'Home', rail: 'home', render: (p) => <Home {...p} /> },
  chats: { title: 'Chats', rail: 'chats', render: () => <Chats /> },
  tickets: { title: 'Ticket Center', rail: 'tickets', render: () => <Tickets /> },
  'ai-hub': { title: 'AI Chatbot', rail: 'ai', render: (p) => <AiHub {...p} /> },
  'ai-monitor': { title: 'AI Chatbot Monitor', rail: 'ai', render: () => <AiMonitor /> },
  'ai-reception': {
    title: 'Auto Reception', rail: 'ai',
    render: () => <TogglesPage title="Auto Reception" sub="What the AI does the moment a buyer messages you." storageKey="ai_reception_map" items={RECEPTION_ITEMS} />,
  },
  'ai-handover': {
    title: 'Human Handover Rules', rail: 'ai',
    render: () => <TogglesPage title="Human Handover Rules" sub="When the AI should step aside and call in your team." storageKey="ai_handover_map" items={HANDOVER_ITEMS} />,
  },
  'ai-recs': {
    title: 'Product Recommendations', rail: 'ai',
    render: (p) => <AiRulesPage {...p}
      title="Product Recommendations" sub="Rules for when the AI suggests products in chat."
      storageKey="airecrules" columns={['Rule', 'Trigger / products', 'Status', 'Actions']}
      prompts={['Rule name (e.g. "Out-of-stock alternative"):', 'Trigger / which products (e.g. "sold-out item asked → suggest 3 similar"):']}
      empty='No recommendation rules yet. Example: "when asked about an out-of-stock item, suggest 3 similar in-stock products."' />,
  },
  'ai-replyrules': {
    title: 'AI Reply Rules', rail: 'ai',
    render: (p) => <AiRulesPage {...p}
      title="AI Reply Rules" sub="Fine-tune which questions the AI may answer on its own."
      storageKey="aireplyrules" columns={['Rule', 'Behavior', 'Status', 'Actions']}
      prompts={['Question type (e.g. "Shipping questions"):', 'Behavior (e.g. "auto-answer" or "draft only"):']}
      empty='No AI reply rules yet. Example: "shipping questions → auto-answer; pricing negotiations → draft only."' />,
  },
  followup: { title: 'Order Follow-Up', rail: 'marketing', render: () => <Followup /> },
  broadcast: { title: 'Message Broadcast', rail: 'marketing', render: (p) => <Broadcast {...p} /> },
  quickreply: { title: 'Quick Reply', rail: 'marketing', render: () => <QuickReply /> },
  autoreply: { title: 'Auto Reply', rail: 'marketing', render: () => <AutoReply /> },
  replyreview: { title: 'Reply Review', rail: 'marketing', render: () => <ReplyReview /> },
  reminders: { title: 'Important Reminders', rail: 'marketing', render: () => <Reminders /> },
  salesconv: { title: 'Sales Conversion', rail: 'analytics', render: () => <SalesConv /> },
  productloss: {
    title: 'Product Loss', rail: 'analytics',
    render: () => <LossPage id="productloss" title="Product Loss" sub="Which products buyers ask about but never buy — and how much it costs you." />,
  },
  orderloss: {
    title: 'Order Loss', rail: 'analytics',
    render: () => <LossPage id="orderloss" title="Order Loss" sub="Abandoned and cancelled orders, and how many you win back."
      notice="ℹ️ Loss data takes about 7 days to settle after a store is authorized — early numbers may look low." />,
  },
  reviewanalysis: { title: 'Review Analysis', rail: 'analytics', render: (p) => <ReviewAnalysis {...p} /> },
  csperf: { title: 'Agent Performance', rail: 'analytics', render: () => <CsPerf /> },
  storeperf: { title: 'Store Performance', rail: 'analytics', render: (p) => <StorePerf {...p} /> },
  storehealth: { title: 'Store Health', rail: 'analytics', render: () => <StoreHealth /> },
  storeauth: { title: 'Store Authorization', rail: 'settings', render: () => <StoreAuth /> },
  csmanage: { title: 'Agent Management', rail: 'settings', render: () => <AgentsPage /> },
  reception: {
    title: 'Chat Reception Settings', rail: 'settings',
    render: () => <TogglesPage title="Chat Reception Settings" sub="How incoming chats get distributed to your team." storageKey="reception_map" items={[
      { t: 'Round-robin assignment', d: 'New chats rotate evenly across online agents.' },
      { t: 'Chat cap per agent', d: 'No agent juggles more than 8 active chats at once.' },
      { t: 'Offline overflow queue', d: 'When nobody is online, chats queue up with an auto-acknowledgement.' },
    ]} />,
  },
  sensitive: { title: 'Sensitive Words', rail: 'settings', render: () => <Sensitive /> },
  system: { title: 'System Settings', rail: 'settings', render: () => <SystemSettings /> },
  oprecord: { title: 'Operating Record', rail: 'settings', render: () => <OpRecord /> },
  plans: { title: 'Plans & Billing', rail: 'settings', render: () => <Plans /> },
  privacy: { title: 'Privacy Policy', rail: 'settings', render: () => <Privacy /> },
};

function SetupModal({ onDone }) {
  const { setSettings, toast, logOp } = useApp();
  const [currency, setCurrency] = useState('');
  const [timezone, setTimezone] = useState('');
  const [errs, setErrs] = useState({});

  function confirm() {
    const e = { currency: !currency, timezone: !timezone };
    setErrs(e);
    if (e.currency || e.timezone) return;
    setSettings({ currency, timezone });
    logOp(`Set report baseline: ${currency} / ${timezone}`);
    toast(`Reports set to ${currency} · ${timezone}`);
    onDone();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h3>Set your report currency and time zone</h3>
        <div className="field">
          <label>Default currency for reports</label>
          <select className={errs.currency ? 'invalid' : ''} value={currency} onChange={e => setCurrency(e.target.value)}>
            <option value="">Choose a currency…</option>
            {['PHP', 'USD', 'SGD', 'MYR', 'IDR', 'THB', 'VND'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {errs.currency && <div className="field-error">Please choose a currency.</div>}
        </div>
        <div className="field">
          <label>Time zone for reports</label>
          <select className={errs.timezone ? 'invalid' : ''} value={timezone} onChange={e => setTimezone(e.target.value)}>
            <option value="">Choose a time zone…</option>
            {['Asia/Manila', 'Asia/Singapore', 'Asia/Jakarta', 'Asia/Bangkok', 'UTC'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {errs.timezone && <div className="field-error">Please choose a time zone.</div>}
        </div>
        <p className="modal-note">⚠️ These lock in your reporting baseline and can't be changed later — pick carefully.</p>
        <div className="modal-actions">
          <button className="btn-sm" onClick={onDone}>I'll decide later</button>
          <button className="btn-sm primary" onClick={confirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

export default function Workspace() {
  const { user, unread, plan, onLogout, settings } = useApp();
  const [tabs, setTabs] = useState(['home']);
  const [active, setActive] = useState('home');
  const [flyout, setFlyout] = useState(null); // rail item id
  const [showSetup, setShowSetup] = useState(() => !settings);
  const flyoutRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target)) setFlyout(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  function openPage(id) {
    if (!PAGES[id]) return;
    setTabs(prev => (prev.includes(id) ? prev : [...prev, id]));
    setActive(id);
    setFlyout(null);
  }

  function closeTab(id, e) {
    e.stopPropagation();
    if (id === 'home') return;
    setTabs(prev => {
      const idx = prev.indexOf(id);
      const next = prev.filter(t => t !== id);
      if (active === id) setActive(next[Math.max(0, idx - 1)] || 'home');
      return next;
    });
  }

  function railClick(item, e) {
    e.stopPropagation();
    if (item.page) { openPage(item.page); setFlyout(null); return; }
    setFlyout(f => (f === item.id ? null : item.id));
  }

  const activeRail = PAGES[active]?.rail;

  function renderFlyout(item) {
    return (
      <div className="rail-flyout" ref={flyoutRef} onClick={e => e.stopPropagation()}>
        {item.account ? (
          <>
            <div className="flyout-user">
              <div className="u-name">{user?.name || 'Seller'}</div>
              <div className="u-mail">{user?.email || '—'} · {plan} plan</div>
            </div>
            <div className="flyout-link" onClick={() => openPage('plans')}>Plans &amp; Billing</div>
            <div className="flyout-link" style={{ color: 'var(--danger)' }} onClick={onLogout}>Log out</div>
          </>
        ) : item.menu.map(group => (
          <React.Fragment key={group.label}>
            <div className="flyout-group-label">{group.label}</div>
            {group.items.map(([pid, label]) => (
              <div key={pid} className="flyout-link" onClick={() => openPage(pid)}>{label}</div>
            ))}
          </React.Fragment>
        ))}
      </div>
    );
  }

  function railItem(item) {
    return (
      <div key={item.id}
        className={`rail-item${activeRail === item.id ? ' active' : ''}${flyout === item.id ? ' flyout-open' : ''}`}
        title={item.title} onClick={e => railClick(item, e)}>
        <i className={`ti ${item.icon} rail-ic`} aria-hidden="true" />
        <span className="rail-label">{item.title}</span>
        {(item.menu || item.account) && <i className="ti ti-chevron-up chev" aria-hidden="true" />}
        {item.badge && unread > 0 && <span className="rail-badge">{unread}</span>}
        {flyout === item.id && renderFlyout(item)}
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-top">{RAIL_TOP.map(railItem)}</div>
        <div className="rail-bottom">{RAIL_BOTTOM.map(railItem)}</div>
      </aside>

      <main className="workspace">
        <header className="st-header">
          <div className="st-brandmark"><i className="ti ti-bolt" aria-hidden="true" /></div>
          <div className="st-crumb">
            <span>BilisOps Chat</span>
            <i className="ti ti-chevron-right" style={{ fontSize: 13 }} aria-hidden="true" />
            <b>{PAGES[active].title}</b>
          </div>
          <div className="sp" />
          <div className="st-cmd">
            <i className="ti ti-search" style={{ fontSize: 15 }} aria-hidden="true" />
            <input placeholder="Search or jump to" readOnly />
            <span className="st-kbd">⌘K</span>
          </div>
          <div className="st-user">
            <div className="av">{(user?.name || 'S').charAt(0).toUpperCase()}</div>
            <div className="who"><b>{user?.name || 'Seller'}</b><span>{plan} plan</span></div>
            <button className="lo" title="Sign out" onClick={onLogout}><i className="ti ti-logout" aria-hidden="true" /></button>
          </div>
        </header>

        <div className="tabbar">
          {tabs.map(id => (
            <div key={id} className={`tab${active === id ? ' active' : ''}`} onClick={() => setActive(id)}>
              <span>{PAGES[id].title}</span>
              {id !== 'home' && <span className="tab-close" onClick={e => closeTab(id, e)}>✕</span>}
            </div>
          ))}
        </div>
        <div className="pages">
          {tabs.map(id => (
            <div key={id} className="page-panel" hidden={active !== id}>
              {PAGES[id].render({ openPage })}
            </div>
          ))}
        </div>
      </main>

      {showSetup && <SetupModal onDone={() => setShowSetup(false)} />}
    </div>
  );
}
