import React, { useState } from 'react';
import { useApp } from '../state.jsx';
import { downloadFile } from '../api.js';
import { PagePad, PageTitle, DataTable, StatTileRow, ChartCard, RangeChips, LockedPage, NoticeBar, aggregateDaily, SplitCard, StoreFilter } from '../components.jsx';
import { PlatformLogo } from '../brand.jsx';

const fmt = v => (v === null || v === undefined ? '—' : v);

export function SalesConv() {
  const { toast, settings, stats } = useApp();
  const [range, setRange] = useState('Day');
  const cur = settings?.currency || 'PHP';
  const t = stats?.totals;
  const hs = stats?.handlerSplit;
  const g = (grp, field) => hs?.[grp]?.[field];
  const num = (v) => (v === null || v === undefined ? '—' : v);

  const agg = aggregateDaily(stats?.daily, range.toLowerCase(), ['inquiries', 'orders']);
  const guideBuyersTotal = hs ? ['ai', 'human', 'joint'].reduce((s, k) => s + (hs[k].guideBuyers || 0), 0) : 0;

  return (
    <PagePad wide>
      <PageTitle title="Sales Conversion" sub="From first question to paid order — and who did the guiding: your AI, your agents, or both." />
      <div className="toolbar-row">
        <StoreFilter />
        <RangeChips options={['Day', 'Week', 'Month']} active={range} onChange={setRange} />
        <div className="spacer" />
        <button className="btn-sm" onClick={() => {
          downloadFile('bilisops-sales-conversion.csv',
            `Metric,Total,AI,Agents,Joint\nSessions,${t?.replied ?? 0},${g('ai','sessions') ?? 0},${g('human','sessions') ?? 0},${g('joint','sessions') ?? 0}\nOrders,${t?.orders ?? 0},${g('ai','orders') ?? 0},${g('human','orders') ?? 0},${g('joint','orders') ?? 0}\nAmount (${cur}),${t?.amount ?? 0},${g('ai','amount') ?? 0},${g('human','amount') ?? 0},${g('joint','amount') ?? 0}\n`,
            'text/csv');
          toast('Report exported as CSV');
        }}>Export</button>
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
          <SplitCard title={`Amount guided (${cur})`} total={t?.amount != null ? t.amount.toLocaleString() : '—'}
            get={k => (g(k, 'amount') != null ? g(k, 'amount').toLocaleString() : '—')} />
        </div>
      </div>

      <ChartCard
        legend={[
          { label: 'Buyer inquiries', color: '#f97316' },
          { label: 'Orders', color: '#1d4ed8' },
        ]}
        labels={agg?.labels}
        series={agg ? [
          { color: '#f97316', values: agg.values[0] },
          { color: '#1d4ed8', values: agg.values[1] },
        ] : null}
        mode={range.toLowerCase()}
      />
    </PagePad>
  );
}

// ---------- Product / Order Loss ----------
export function LossPage({ id, title, sub, notice }) {
  const { toast, settings, stats } = useApp();
  const [range, setRange] = useState('Day');
  const cur = settings?.currency || 'PHP';
  const t = stats?.totals;
  const agg = aggregateDaily(stats?.daily, range.toLowerCase(), ['orders', 'cancelled']);

  return (
    <PagePad wide>
      <PageTitle title={title} sub={sub} />
      {notice && <NoticeBar>{notice}</NoticeBar>}
      <div className="toolbar-row">
        <StoreFilter />
        <select><option>COD status: any</option><option>COD only</option><option>Non-COD</option></select>
        <div className="spacer" />
        <RangeChips options={['Day', 'Week', 'Month']} active={range} onChange={setRange} />
        <button className="btn-sm" onClick={() => {
          downloadFile(`bilisops-${id}.csv`,
            `Metric,Value\nTotal orders,${t?.orders ?? 0}\nCancelled orders,${t?.cancelled ?? 0}\nLoss rate,${t?.lossRatePct ?? 0}%\nTotal order amount,${t?.amount ?? 0} ${cur}\nCancelled amount,${t?.cancelledAmount ?? 0} ${cur}\n`,
            'text/csv');
          toast('Report exported as CSV');
        }}>Export</button>
      </div>
      <StatTileRow tiles={[
        { lbl: 'Total orders', num: String(t?.orders ?? 0) },
        { lbl: 'Cancelled orders', num: String(t?.cancelled ?? 0) },
        { lbl: 'Loss rate', num: t?.lossRatePct != null ? `${t.lossRatePct}%` : '—' },
        { lbl: 'Total order amount', num: `${(t?.amount ?? 0).toLocaleString()} ${cur}` },
        { lbl: 'Cancelled amount', num: `${(t?.cancelledAmount ?? 0).toLocaleString()} ${cur}` },
        { lbl: 'Recovered orders', num: '0', cmp: 'Recovery flows not yet live' },
      ]} />
      <ChartCard
        legend={[
          { label: 'Total orders', color: '#f97316' },
          { label: 'Cancelled', color: '#b91c1c' },
        ]}
        labels={agg?.labels}
        series={agg ? [
          { color: '#f97316', values: agg.values[0] },
          { color: '#b91c1c', values: agg.values[1] },
        ] : null}
        mode={range.toLowerCase()}
      />
    </PagePad>
  );
}

// ---------- Review Analysis (AI add-on gated) ----------
export function ReviewAnalysis({ openPage }) {
  const { addons } = useApp();
  if (!addons.length) {
    return (
      <PagePad>
        <LockedPage
          title="Review Analysis needs the AI Assist add-on"
          copy="Understand why buyers leave 3-star-and-below reviews, see which products and couriers cause them, and measure whether your review reminders actually pay off."
          primaryLabel="Get AI Assist Add-on"
          onPrimary={() => openPage('plans')} />
      </PagePad>
    );
  }
  return (
    <PagePad wide>
      <PageTitle title="Review Analysis" sub="Reviews, reminders that earn them, and recoveries that save them." />
      <div className="rv-grid">
        <div className="rv-card">
          <div className="rv-head">
            <span className="rv-link" onClick={() => openPage('chats')}>Go to review management ›</span>
          </div>
          <div className="rv-empty">
            <div className="rv-empty-ic">📮</div>
            <div>No data</div>
            <div className="rv-empty-sub">Reviews sync once the marketplace review scopes are approved.</div>
          </div>
        </div>

        <div className="rv-card">
          <div className="rv-head">
            <span className="rv-link" onClick={() => openPage('followup')}>Go to configure review reminders ›</span>
          </div>
          <div className="rv-funnel">
            <div className="fn-stage s1 sm">
              <div className="fn-lbl">Positive review reminders sent</div>
              <div className="fn-num">--</div>
            </div>
            <div className="fn-stage s3 sm">
              <div className="fn-lbl">Successful positive reviews</div>
              <div className="fn-num">--</div>
            </div>
            <div className="rv-rate">
              <span>Reminder success rate</span>
              <b>--</b>
            </div>
          </div>
        </div>

        <div className="rv-card">
          <div className="rv-head">
            <span className="rv-link" onClick={() => openPage('followup')}>Go to configure review care ›</span>
          </div>
          <div className="rv-funnel">
            <div className="fn-stage s1 sm">
              <div className="fn-lbl">Negative review recoveries sent</div>
              <div className="fn-num">--</div>
            </div>
            <div className="fn-stage s3 sm">
              <div className="fn-lbl">Successful recoveries</div>
              <div className="fn-num">--</div>
            </div>
            <div className="rv-rate">
              <span>Recovery rate</span>
              <b>--</b>
            </div>
          </div>
        </div>
      </div>
      <NoticeBar info>💡 Review reminders and recovery flows live in Marketing → Order Follow-Up. Their funnels fill in as soon as review data flows from the platforms.</NoticeBar>
    </PagePad>
  );
}

// ---------- Agent Performance ----------
export function CsPerf() {
  const { user, stats, conversations } = useApp();
  const t = stats?.totals;
  const resolutionPct = t?.conversations ? Math.round((t.resolved / t.conversations) * 100) : null;
  return (
    <PagePad wide>
      <PageTitle title="Agent Performance" sub="Response speed and resolution quality, per teammate." />
      <DataTable
        columns={['Agent', 'Chats handled', 'Avg. first response', 'Resolution rate', 'Guided orders']}
        rows={[(
          <tr key="owner">
            <td><b>{user?.name || 'Seller'}</b> <span className="status-pill ok">Owner</span></td>
            <td>{t?.replied ?? conversations.filter(c => c.messages.some(m => m.direction === 'out')).length}</td>
            <td>{t?.avgFirstResponseMin != null ? `${t.avgFirstResponseMin} min` : '—'}</td>
            <td>{resolutionPct != null ? `${resolutionPct}%` : '—'}</td>
            <td>{t?.orders ?? 0}</td>
          </tr>
        )]}
        empty="" />
    </PagePad>
  );
}

// ---------- Store Performance (plan gated) ----------
export function StorePerf({ openPage }) {
  const { plan } = useApp();
  if (plan === 'Free') {
    return (
      <PagePad>
        <LockedPage
          title="Store Performance is a paid feature"
          copy="Compare every store side by side — chat volume, conversion, review scores, and revenue guided by chat — on any paid plan."
          primaryLabel="View plans"
          onPrimary={() => openPage('plans')} />
      </PagePad>
    );
  }
  return <StorePerfTable />;
}

function StorePerfTable() {
  const { stats, settings } = useApp();
  const cur = settings?.currency || 'PHP';
  const rows = (stats?.perStore || []).map(s => (
    <tr key={s.storeId}>
      <td><b>{s.name}</b></td>
      <td>{s.platform}</td>
      <td>{s.conversations}</td>
      <td>{s.conversations ? `${Math.round((s.orders / s.conversations) * 100)}%` : '—'}</td>
      <td>—</td>
      <td>{s.amount ? `${s.amount.toLocaleString()} ${cur}` : '0'}</td>
    </tr>
  ));
  return (
    <PagePad wide>
      <PageTitle title="Store Performance" sub="Every store, side by side." />
      <DataTable
        columns={['Store', 'Platform', 'Chats', 'Conversion', 'Avg. rating', 'Guided sales']}
        rows={rows.length ? rows : null}
        empty="No store data yet. Authorize a store to start collecting performance data." />
    </PagePad>
  );
}

// ---------- Store Health (per store) ----------
export function StoreHealth() {
  const { stats } = useApp();
  const t = stats?.totals;
  const perStore = stats?.perStore || [];

  const healthOf = (s) => {
    if (!s.conversations) return { label: 'No traffic', cls: 'mid' };
    if ((s.responseRatePct ?? 100) >= 90 && s.unreplied === 0) return { label: '✅ Good', cls: 'good' };
    return { label: '⚠️ Needs attention', cls: 'bad' };
  };

  const rows = perStore.map(s => {
    const h = healthOf(s);
    return (
      <tr key={s.storeId}>
        <td>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <PlatformLogo k={s.key} size={13} title={s.platform} />
            <b>{s.name}</b>
          </span>
        </td>
        <td>
          <span className={`ord-status sm ${(s.responseRatePct ?? 100) >= 90 ? 'good' : 'bad'}`}>
            {s.responseRatePct != null ? `${s.responseRatePct}%` : '—'}
          </span>
        </td>
        <td>{s.unreplied}</td>
        <td>{s.avgFirstResponseMin != null ? `${s.avgFirstResponseMin} min` : '—'}</td>
        <td>{s.cancelled}{s.orders ? ` / ${s.orders}` : ''}</td>
        <td><span className={`ord-status ${h.cls}`}>{h.label}</span></td>
      </tr>
    );
  });

  return (
    <PagePad wide>
      <PageTitle title="Store Health" sub="Early warnings before small problems become penalties — per shop." />
      <div className="toolbar-row"><StoreFilter /><div className="spacer" /></div>
      <StatTileRow tiles={[
        { lbl: 'Overall response rate', num: t?.responseRatePct != null ? `${t.responseRatePct}%` : '—' },
        { lbl: 'Unreplied chats', num: String(perStore.reduce((s, x) => s + x.unreplied, 0)) },
        { lbl: 'Avg. first response', num: t?.avgFirstResponseMin != null ? `${t.avgFirstResponseMin} min` : '—' },
        { lbl: 'Cancelled orders', num: String(t?.cancelled ?? 0) },
      ]} />
      <DataTable
        columns={['Store', 'Response rate', 'Unreplied', 'Avg. first response', 'Cancelled / orders', 'Health']}
        rows={rows.length ? rows : null}
        empty="No stores connected yet — connect one in Settings → Store Authorization." />
      <NoticeBar info>💡 Marketplaces reward fast responders with better search ranking. Keep every shop's response rate above 90% to stay in their good graces.</NoticeBar>
    </PagePad>
  );
}
