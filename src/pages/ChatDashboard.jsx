import React, { useState, useEffect } from 'react';
import { useApp } from '../state.jsx';
import { api } from '../api.js';
import { PagePad, PageTitle, RangeChips } from '../components.jsx';
import { platformMeta } from '../data.js';
import { PlatformLogo } from '../brand.jsx';

const CAT_ICONS = {
  complaint: 'ti-alert-triangle',
  assistance: 'ti-lifebuoy',
  price: 'ti-tag',
  shipping: 'ti-truck-delivery',
  inquiry: 'ti-message-question',
  other: 'ti-dots',
};

const RANGE_DAYS = { 'Last 7 days': 7, 'Last 30 days': 30, 'Last 90 days': 90 };

export default function ChatDashboard({ openPage }) {
  const { toast } = useApp();

  // jump to the conversation in the Chats tab
  function openConversation(convId) {
    if (!convId) return;
    sessionStorage.setItem('bilisops_open_conv', convId);
    window.dispatchEvent(new Event('bilisops-open-conv'));
    openPage?.('chats');
  }
  const [range, setRange] = useState('Last 30 days');
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    setData(null);
    api(`/api/chat-insights?days=${RANGE_DAYS[range]}`).then(setData).catch(() => setData({ error: true }));
  }, [range]);

  async function generateSummary() {
    setSummarizing(true);
    try {
      const res = await api('/api/ai/chat-summary', { method: 'POST' });
      setSummary(res.summary);
      if (res.engine === 'deepseek') toast('AI summary generated ✨');
    } catch {
      toast('Could not generate the summary — try again');
    } finally {
      setSummarizing(false);
    }
  }

  const t = data?.totals;
  const cats = data?.categories || [];
  const totalIn = t?.messagesIn || 0;
  const pct = (n) => (totalIn ? Math.round((n / totalIn) * 100) : 0);

  return (
    <PagePad wide>
      <PageTitle title="Chat Dashboard"
        sub="Every buyer message, sorted into what it actually is — inquiries, complaints, assistance — so you know where the day went." />
      <div className="toolbar-row">
        <RangeChips options={Object.keys(RANGE_DAYS)} active={range} onChange={setRange} />
        <div className="spacer" />
        <button className="btn-sm primary" disabled={summarizing} onClick={generateSummary}>
          {summarizing ? 'Summarizing…' : '✨ AI summary'}
        </button>
      </div>

      {!data ? (
        <div className="empty-state">Loading insights…</div>
      ) : (
        <>
          <div className="kpi-grid" style={{ marginBottom: 18 }}>
            <div className="kpi">
              <div className="kpi-top"><span className="kpi-lbl">Buyer messages</span><i className="ti ti-inbox" /></div>
              <div className="kpi-val">{t.messagesIn}</div>
            </div>
            <div className="kpi">
              <div className="kpi-top"><span className="kpi-lbl">Replies sent</span><i className="ti ti-send" /></div>
              <div className="kpi-val">{t.messagesOut}</div>
              <div className="kpi-split"><span className="k-ai">AI {t.aiReplies}</span> · <span className="k-agents">Agents {t.messagesOut - t.aiReplies}</span></div>
            </div>
            <div className="kpi">
              <div className="kpi-top"><span className="kpi-lbl">Conversations</span><i className="ti ti-messages" /></div>
              <div className="kpi-val">{t.conversations}</div>
            </div>
            <div className="kpi">
              <div className="kpi-top"><span className="kpi-lbl">Complaints share</span><i className="ti ti-alert-triangle" /></div>
              <div className="kpi-val">{pct(cats.find(c => c.key === 'complaint')?.count || 0)}%</div>
            </div>
          </div>

          {summary && (
            <div className="home-card" style={{ marginBottom: 18 }}>
              <div className="home-card-head"><h3>✨ AI summary</h3><span className="home-card-note">What BilisBot sees in your recent chats</span></div>
              <div style={{ fontSize: 13.5, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{summary}</div>
            </div>
          )}

          <div className="cat-grid">
            {cats.map(cat => (
              <div key={cat.key} className={`cat-card${cat.key === 'complaint' && cat.count ? ' hot' : ''}`}>
                <div className="cat-head">
                  <i className={`ti ${CAT_ICONS[cat.key] || 'ti-dots'}`} aria-hidden="true" />
                  <span className="cat-label">{cat.label}</span>
                  <span className="cat-count">{cat.count}</span>
                  <span className="cat-pct">{pct(cat.count)}%</span>
                </div>
                <div className="cat-bar"><span style={{ width: `${pct(cat.count)}%` }} /></div>
                {cat.examples.length ? (
                  <ul className="cat-examples">
                    {cat.examples.map((ex, i) => (
                      <li key={i} className="clickable" title="Open this conversation in Chats"
                        onClick={() => openConversation(ex.conversationId)}>
                        <span className="ex-logo"><PlatformLogo k={ex.platform} size={11} /></span>
                        <span className="ex-buyer">{ex.buyerName}:</span> {ex.text}
                        <span className="ex-go">→</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="cat-empty">No messages in this category.</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </PagePad>
  );
}
