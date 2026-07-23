import React, { useState } from 'react';
import { useApp } from '../state.jsx';
import { api } from '../api.js';
import { PagePad, RangeChips } from '../components.jsx';
import { PlatformLogo } from '../brand.jsx';

export default function Home({ openPage }) {
  const { plan, conversations, connected, settings, toast, syncAll, stats } = useApp();
  const [range, setRange] = useState('Yesterday');
  const [updated, setUpdated] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  const pending = conversations.filter(c => c.unread).length;
  const served = conversations.filter(c => c.resolved).length;
  const total = conversations.length;
  const handled = conversations.filter(c => c.messages.some(m => m.direction === 'out')).length;
  const currency = settings?.currency || 'PHP';
  const t = stats?.totals;
  const fmt = v => (v === null || v === undefined ? '—' : v);

  // Combined (all channels) values come straight from server stats;
  // AI is 0 until the auto-reply engine sends messages itself.
  const metrics = [
    ['Buyers served', t?.replied, 'ti-users'],
    ['Reception sessions', t?.conversations, 'ti-message-circle'],
    ['Response rate', t?.responseRatePct != null ? `${t.responseRatePct}%` : null, 'ti-activity'],
    ['Avg. first response', t?.avgFirstResponseMin != null ? `${t.avgFirstResponseMin} min` : null, 'ti-clock'],
    ['Guided buyers', t?.orders ? t.replied : t?.orders, 'ti-user-check'],
    ['Guided orders', t?.orders, 'ti-shopping-cart'],
    ['Order conversion', t?.conversionPct != null ? `${t.conversionPct}%` : null, 'ti-trending-up'],
    [`Guided sales (${currency})`, t?.amount != null ? t.amount.toLocaleString() : null, 'ti-coin'],
  ];

  const journey = [
    { icon: 'ti-message-circle', label: 'Buyer inquiries', val: total || '—' },
    { icon: 'ti-headset', label: 'Conversations handled', val: total ? handled : '—' },
    { icon: 'ti-shopping-cart-check', label: 'Orders guided', val: t?.orders ?? '—' },
  ];
  const pctHandled = total ? `${Math.round((handled / total) * 100)}% replied` : '—';
  const pctConvert = t?.conversionPct != null ? `${t.conversionPct}% convert` : '—';

  async function simulateOrder() {
    try {
      const r = await api('/api/dev/simulate-order', { method: 'POST' });
      await syncAll();
      toast(`Test order ${r.orderRef} (${r.status}, ${currency} ${r.amount}) via ${r.platform} 🧪`);
    } catch (e) {
      toast(e?.message || 'Authorize a store first');
    }
  }

  return (
    <PagePad>
      <div className="home-topline">
        <div>
          <h2 className="page-title">Home</h2>
          <p className="page-sub" style={{ marginBottom: 0 }}>Your whole operation at a glance — every store, every chat.</p>
        </div>
        <div className="plan-chip-wrap">
          <span className="plan-chip">💎 {plan}</span>
          <button className="btn-sm primary" onClick={() => openPage('plans')}>Upgrade Now</button>
        </div>
      </div>

      <div className="home-card">
        <div className="home-card-head">
          <h3>Store Connections</h3>
          <span className="home-card-note">Manage in Settings → Store Authorization</span>
        </div>
        <div className="platform-row">
          {connected.map(i => (
            <div key={i.name} className={`platform-tile${i.connected ? ' connected' : ''}`} onClick={() => openPage('storeauth')}>
              <div className="p-icon"><PlatformLogo k={i.key} size={26} title={i.name} /></div>
              <div className="p-name">{i.name}</div>
              <div className="p-state">{i.connected ? 'Connected' : 'Not connected'}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="home-card">
        <div className="home-card-head">
          <h3>Real-Time Snapshot</h3>
          <span className="home-card-note">
            <span>Updated {updated}</span>
            <button className="btn-sm" style={{ fontSize: 11 }} title="Simulate an order webhook" onClick={simulateOrder}>
              🧪 Test order
            </button>
            <button
              className="icon-btn"
              title="Refresh"
              style={{ width: 26, height: 26, fontSize: 12 }}
              onClick={async () => {
                await syncAll();
                setUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                toast('Real-time data refreshed');
              }}
            >🔄</button>
          </span>
        </div>
        <div className="rt-grid">
          <div className="rt-stat"><div className="lbl">Pending replies</div><div className="num">{pending}</div></div>
          <div className="rt-stat"><div className="lbl">Buyers served today</div><div className="num">{served}</div></div>
          <div className="rt-stat"><div className="lbl">Avg. response time today</div><div className="num">—</div></div>
        </div>
      </div>

      <div className="home-card">
        <div className="home-card-head"><h3>Shortcuts</h3></div>
        <div className="quick-nav-row">
          <button className="btn-sm" onClick={() => openPage('quickreply')}>⚡ Quick Reply</button>
          <button className="btn-sm" onClick={() => openPage('autoreply')}>🤖 Auto Reply</button>
          <button className="btn-sm" onClick={() => openPage('broadcast')}>📣 Message Broadcast</button>
          <button className="btn-sm" onClick={() => openPage('followup')}>🎁 Order Follow-Up</button>
          <button className="btn-sm" onClick={() => openPage('salesconv')}>📊 Sales Conversion</button>
        </div>
      </div>

      <div className="home-card">
        <div className="home-card-head">
          <h3>Conversation Overview</h3>
          <RangeChips options={['Yesterday', 'Last 7 days', 'Last 30 days']} active={range} onChange={setRange} />
        </div>
        <div className="journey">
          {journey.map((s, i) => (
            <React.Fragment key={s.label}>
              <div className="j-step">
                <div className="j-ic"><i className={`ti ${s.icon}`} aria-hidden="true" /></div>
                <div>
                  <div className="j-val">{s.val}</div>
                  <div className="j-lbl">{s.label}</div>
                </div>
              </div>
              {i < journey.length - 1 && (
                <div className="j-link">
                  <i className="ti ti-arrow-right" aria-hidden="true" />
                  <span className="j-pct">{i === 0 ? pctHandled : pctConvert}</span>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="kpi-grid">
          {metrics.map(([title, combined, icon]) => (
            <div key={title} className="kpi">
              <div className="kpi-top">
                <span className="kpi-lbl">{title}</span>
                <i className={`ti ${icon}`} aria-hidden="true" />
              </div>
              <div className="kpi-val">{fmt(combined)}</div>
              <div className="kpi-split">
                <span className="k-ai">AI 0</span>
                <span>·</span>
                <span className="k-agents">Agents {fmt(combined)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PagePad>
  );
}
