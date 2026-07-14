import React, { useState } from 'react';
import { PagePad, PageTitle, SubTabs, DataTable } from '../components.jsx';
import { useToast } from '../state.jsx';

const SECTIONS = {
  'Review Management': {
    columns: ['Product', 'Rating', 'Review', 'Your reply', 'Note', 'Tags', 'Actions'],
    empty: 'No reviews yet. Once buyers rate your products, they show up here for one-click replies.',
  },
  'Refund Orders': {
    columns: ['Order No.', 'Buyer', 'Platform', 'Amount', 'Reason', 'Status', 'Actions'],
    empty: 'No refund requests. When a buyer asks for a refund, handle it here without leaving the chat.',
  },
  'Order Cancellations': {
    columns: ['Order No.', 'Buyer', 'Platform', 'Amount', 'Requested at', 'Status', 'Actions'],
    empty: 'No cancellation requests right now.',
  },
  'Ticket Manager': {
    columns: ['Ticket', 'Buyer', 'Assignee', 'Priority', 'Opened', 'Status', 'Actions'],
    empty: 'No open tickets. Escalate any chat into a ticket to track it to resolution.',
  },
  'Order Tracking': {
    columns: ['Order No.', 'Buyer', 'Courier', 'Tracking No.', 'Last scan', 'Status'],
    empty: 'No shipments being tracked yet.',
  },
};

const STARS = ['All', '5★ (0)', '4★ (0)', '3★ (0)', '2★ (0)', '1★ (0)'];

export default function Tickets() {
  const toast = useToast();
  const [tab, setTab] = useState('Review Management');
  const [star, setStar] = useState('All');
  const section = SECTIONS[tab];

  return (
    <PagePad wide>
      <PageTitle title="Ticket Center" sub="Reviews, refunds, cancellations, and escalations — handled in one queue." />
      <SubTabs tabs={Object.keys(SECTIONS)} active={tab} onChange={setTab} />
      {tab === 'Review Management' && (
        <div className="toolbar-row">
          <select><option>All stores</option></select>
          <div className="filter-chips" style={{ margin: 0 }}>
            {STARS.map(s => (
              <div key={s} className={`chip${star === s ? ' active' : ''}`} onClick={() => setStar(s)}>{s}</div>
            ))}
          </div>
          <div className="spacer" />
          <label className="checkbox-row" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            <input type="checkbox" /> Negative reviews only
          </label>
          <button className="btn-sm" onClick={() => toast('Nothing to export yet')}>Export</button>
          <button className="btn-sm primary" onClick={() => toast('Reviews synced — no new reviews found')}>Sync Reviews</button>
        </div>
      )}
      <DataTable columns={section.columns} empty={section.empty} />
    </PagePad>
  );
}
