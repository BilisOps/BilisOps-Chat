import React, { useState } from 'react';
import { useApp } from '../state.jsx';
import { downloadFile } from '../api.js';
import { PagePad, PageTitle, SubTabs, DataTable, StatTileRow, ChartCard, RangeChips, LockedPage, NoticeBar, aggregateDaily } from '../components.jsx';

const fmt = v => (v === null || v === undefined ? '—' : v);

// ---------- Sales Conversion ----------
export function SalesConv() {
  const { toast, settings, stats } = useApp();
  const [range, setRange] = useState('Day');
  const [tab, setTab] = useState('Pre-Sales Conversion');
  const cur = settings?.currency || 'PHP';
  const t = stats?.totals;

  const agg = aggregateDaily(stats?.daily, range.toLowerCase(), ['inquiries', 'orders']);
  const replies = stats?.daily?.reduce((s, d) => s + d.replies, 0) ?? 0;

  return (
    <PagePad wide>
      <PageTitle title="Sales Conversion" sub="From first question to paid order — where buyers convert and where they drop." />
      <div className="toolbar-row">
        <select><option>All stores</option></select>
        <input type="text" value="Last 90 days" readOnly style={{ width: 120 }} />
        <div className="spacer" />
        <RangeChips options={['Day', 'Week', 'Month']} active={range} onChange={setRange} />
        <button className="btn-sm" onClick={() => {
          downloadFile('bilisops-sales-conversion.csv',
            `Metric,Combined\nBuyer inquiries,${t?.conversations ?? 0}\nOrders guided,${t?.orders ?? 0}\nOrder conversion rate,${t?.conversionPct ?? 0}%\nAmount guided to payment (${cur}),${t?.amount ?? 0}\n`,
            'text/csv');
          toast('Report exported as CSV');
        }}>Export</button>
      </div>
      <SubTabs tabs={['Pre-Sales Conversion', 'Overall Conversion']} active={tab} onChange={setTab} />
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
        {[
          ['Orders guided', fmt(t?.orders), 'ti-shopping-cart'],
          ['Order conversion rate', t?.conversionPct != null ? `${t.conversionPct}%` : '—', 'ti-trending-up'],
          [`Guided sales (${cur})`, t?.amount != null ? t.amount.toLocaleString() : '—', 'ti-coin'],
        ].map(([title, val, icon]) => (
          <div key={title} className="kpi">
            <div className="kpi-top">
              <span className="kpi-lbl">{title}</span>
              <i className={`ti ${icon}`} aria-hidden="true" />
            </div>
            <div className="kpi-val">{val}</div>
            <div className="kpi-split">
              <span className="k-ai">AI 0</span>
              <span>·</span>
              <span className="k-agents">Agents {val}</span>
            </div>
          </div>
        ))}
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
      <h3 style={{ margin: '22px 0 12px', fontSize: 15 }}>Conversation activity</h3>
      <StatTileRow tiles={[
        { lbl: 'Buyer inquiries', num: String(t?.conversations ?? 0) },
        { lbl: 'Conversations replied', num: String(t?.replied ?? 0) },
        { lbl: 'Response rate', num: t?.responseRatePct != null ? `${t.responseRatePct}%` : '—' },
        { lbl: 'Orders', num: String(t?.orders ?? 0) },
        { lbl: 'Order sales', num: `${(t?.amount ?? 0).toLocaleString()} ${cur}` },
        { lbl: 'Replies sent', num: String(replies) },
      ]} />
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
        <select><option>All stores</option></select>
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
      <PageTitle title="Review Analysis" sub="AI-attributed reasons behind every neutral and negative review." />
      <StatTileRow tiles={[
        { lbl: 'Neutral & negative reviews', num: '0' },
        { lbl: 'Reasons identified', num: '0' },
        { lbl: 'Orders involved', num: '0' },
        { lbl: 'Products involved', num: '0' },
      ]} />
      <ChartCard legend={[{ label: 'Negative review trend', color: '#ff5a1f' }]} mode="day" />
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

// ---------- Store Health ----------
export function StoreHealth() {
  const { conversations, stats } = useApp();
  const unreplied = conversations.filter(c => c.unread).length;
  const t = stats?.totals;
  return (
    <PagePad>
      <PageTitle title="Store Health" sub="Early warnings before small problems become penalties." />
      <StatTileRow tiles={[
        { lbl: 'Response rate', num: t?.responseRatePct != null ? `${t.responseRatePct}%` : '—' },
        { lbl: 'Unreplied chats', num: String(unreplied) },
        { lbl: 'Avg. first response', num: t?.avgFirstResponseMin != null ? `${t.avgFirstResponseMin} min` : '—' },
        { lbl: 'Cancelled orders', num: String(t?.cancelled ?? 0) },
      ]} />
      <NoticeBar info>💡 Marketplaces reward fast responders with better search ranking. Keep response rate above 90% to stay in their good graces.</NoticeBar>
    </PagePad>
  );
}
