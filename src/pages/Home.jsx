import React, { useState } from 'react';
import { useApp } from '../state.jsx';
import { api } from '../api.js';
import { PagePad, SplitCard } from '../components.jsx';
import { PlatformLogo } from '../brand.jsx';

export default function Home({ openPage }) {
  const { plan, conversations, connected, settings, toast, syncAll, stats } = useApp();
  const [updated, setUpdated] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  const pending = conversations.filter(c => c.unread).length;
  const served = conversations.filter(c => c.resolved).length;
  const currency = settings?.currency || 'PHP';
  const t = stats?.totals;
  const hs = stats?.handlerSplit;
  const g = (grp, field) => hs?.[grp]?.[field];
  const num = v => (v === null || v === undefined ? '—' : v);
  const fmt = v => (v === null || v === undefined ? '—' : v);
  const guideBuyersTotal = hs ? ['ai', 'human', 'joint'].reduce((s, k) => s + (hs[k].guideBuyers || 0), 0) : 0;

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
          <span className="home-card-note">
            Last 90 days · who handled it: 🤖 AI, 👤 Agents, or 🤝 Joint
            <button className="btn-sm" style={{ fontSize: 11 }} onClick={() => openPage('salesconv')}>Full report →</button>
          </span>
        </div>
        <div className="funnel-wrap">
          <div className="funnel">
            <div className="fn-stage s1">
              <div className="fn-lbl">Buyer inquiries</div>
              <div className="fn-num">{fmt(t?.conversations)}</div>
            </div>
            <div className="fn-stage s2">
              <div className="fn-lbl">Reception sessions</div>
              <div className="fn-num">{fmt(t?.replied)}</div>
            </div>
            <div className="fn-stage s3">
              <div className="fn-lbl">Orders guided</div>
              <div className="fn-num">{fmt(t?.orders)}</div>
            </div>
            <div className="fn-rate r1">
              <span>Response rate</span>
              <b>{t?.responseRatePct != null ? `${t.responseRatePct}%` : '--'}</b>
            </div>
            <div className="fn-rate r2">
              <span>Order conversion</span>
              <b>{t?.conversionPct != null ? `${t.conversionPct}%` : '--'}</b>
            </div>
          </div>

          <div className="split-grid">
            <SplitCard title="Buyer inquiries" total={fmt(t?.conversations)}
              get={k => num(g(k, 'sessions'))} />
            <SplitCard title="Reception sessions" total={fmt(t?.replied)}
              get={k => num(g(k, 'sessions'))} />
            <SplitCard title="Response rate" total={t?.responseRatePct != null ? `${t.responseRatePct}%` : '—'}
              get={k => (t?.replied ? Math.round(((g(k, 'sessions') || 0) / t.replied) * 100) : '—')} suffix="%" />
            <SplitCard title="Avg. first response (min)" total={fmt(t?.avgFirstResponseMin)}
              get={k => num(g(k, 'avgFirstResponseMin'))} />
            <SplitCard title="Guide buyers" total={guideBuyersTotal}
              get={k => num(g(k, 'guideBuyers'))} />
            <SplitCard title="Guide orders" total={fmt(t?.orders)}
              get={k => num(g(k, 'orders'))} />
            <SplitCard title="Order conversion rate" total={t?.conversionPct != null ? `${t.conversionPct}%` : '—'}
              get={k => num(g(k, 'conversionPct'))} suffix="%" />
            <SplitCard title={`Amount guided (${currency})`} total={t?.amount != null ? t.amount.toLocaleString() : '—'}
              get={k => (g(k, 'amount') != null ? g(k, 'amount').toLocaleString() : '—')} />
          </div>
        </div>
      </div>
    </PagePad>
  );
}
