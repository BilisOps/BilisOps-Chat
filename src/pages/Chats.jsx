import React, { useState, useRef, useEffect } from 'react';
import { useApp, useLocal } from '../state.jsx';
import { api, initials } from '../api.js';
import { platformMeta } from '../data.js';
import { FormDialog } from '../components.jsx';

const FILTERS = [
  { key: 'all', label: 'All' }, { key: 'unread', label: 'Unread' },
  { key: 'shopee', label: 'Shopee' }, { key: 'lazada', label: 'Lazada' },
  { key: 'tiktok', label: 'TikTok' }, { key: 'fb', label: 'Facebook' },
];

export default function Chats() {
  const { conversations, syncConversations, toast, user, stores } = useApp();
  const [filter, setFilter] = useState('all');
  const [storeFilter, setStoreFilter] = useState('all'); // 'all' | storeId
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [composer, setComposer] = useState('');
  const [translate, setTranslate] = useState(false);
  const [quickReplies] = useLocal('quickreplies', []);
  const [sensitiveWords] = useLocal('sensitivewords', []);
  const [drafting, setDrafting] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [agents] = useLocal('agents', []);
  const bodyRef = useRef(null);

  const selected = conversations.find(c => c.id === selectedId) || null;

  const filtered = conversations.filter(c => {
    if (storeFilter !== 'all' && c.storeId !== storeFilter) return false;
    if (filter === 'unread' && !c.unread) return false;
    if (!['all', 'unread'].includes(filter) && c.platform !== filter) return false;
    const q = search.toLowerCase();
    if (q && !c.name.toLowerCase().includes(q) && !c.preview.toLowerCase().includes(q)) return false;
    return true;
  });

  const unreadFor = (storeId) => conversations.filter(c =>
    (storeId === 'all' || c.storeId === storeId) && c.unread).length;

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [selected?.messages.length, selectedId]);

  async function open(conv) {
    setSelectedId(conv.id);
    if (conv.unread) {
      api(`/api/conversations/${conv.id}/read`, { method: 'POST' }).then(syncConversations).catch(() => {});
    }
  }

  async function send() {
    const text = composer.trim();
    if (!text) return;
    if (!selected) { toast('Select a conversation first'); return; }
    const hit = sensitiveWords.find(w => text.toLowerCase().includes(String(w).toLowerCase()));
    if (hit) { toast(`Blocked: message contains sensitive word "${hit}"`); return; }
    setComposer('');
    try {
      await api(`/api/conversations/${selected.id}/reply`, { method: 'POST', body: { text } });
      await syncConversations();
    } catch {
      toast('Failed to send — try again');
      setComposer(text);
    }
  }

  async function aiDraft() {
    if (!selected) { toast('Select a conversation first'); return; }
    setDrafting(true);
    try {
      const res = await api('/api/ai/draft', { method: 'POST', body: { conversationId: selected.id } });
      setComposer(res.draft);
      toast(res.engine === 'claude' ? '✨ Draft written by Claude' : `✨ Template draft — ${res.note || ''}`);
    } catch (e) {
      toast(e?.error === 'no_buyer_message' ? 'No buyer message to reply to yet' : 'Draft failed — try again');
    } finally {
      setDrafting(false);
    }
  }

  async function resolve() {
    if (!selected) { toast('Select a conversation first'); return; }
    await api(`/api/conversations/${selected.id}/resolve`, { method: 'POST', body: { resolved: !selected.resolved } });
    await syncConversations();
    toast(selected.resolved ? 'Conversation reopened' : 'Conversation marked resolved');
  }

  async function simulate() {
    try {
      const result = await api('/api/dev/simulate', { method: 'POST' });
      await syncConversations();
      toast(`Test message received via ${result.platform} webhook 🧪`);
    } catch (e) {
      toast(e?.message || 'Authorize a store first (Settings → Store Authorization)');
    }
  }

  const meta = selected ? platformMeta[selected.platform] : null;

  return (
    <div className="chats-layout">
      <aside className="store-col">
        <div className="store-col-title">Stores</div>
        <div className={`store-item${storeFilter === 'all' ? ' active' : ''}`} onClick={() => setStoreFilter('all')}>
          <span className="store-ic"><i className="ti ti-building-store" aria-hidden="true" /></span>
          <span className="store-name">All stores</span>
          {unreadFor('all') > 0 && <span className="store-badge">{unreadFor('all')}</span>}
        </div>
        {stores.map(s => {
          const m = platformMeta[s.key];
          const n = unreadFor(s.id);
          return (
            <div key={s.id} className={`store-item${storeFilter === s.id ? ' active' : ''}`}
              title={`${s.platform} — ${s.nickname || s.name}`} onClick={() => setStoreFilter(s.id)}>
              <span className="store-ic">{m?.icon || '🏬'}</span>
              <span className="store-name">{s.nickname || s.name}</span>
              {n > 0 && <span className="store-badge">{n}</span>}
            </div>
          );
        })}
        {!stores.length && (
          <div className="store-hint">Connect a store in Settings → Store Authorization to see it here.</div>
        )}
      </aside>

      <section className="conv-col">
        <div className="conv-header">
          <h2>
            Chats
            <button className="btn-sm" style={{ float: 'right', fontSize: 11.5 }}
              title="Simulate an incoming buyer message, like a webhook test" onClick={simulate}>
              🧪 Test message
            </button>
          </h2>
          <div className="search-box">
            <input type="text" placeholder="Search conversations..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="filter-chips">
            {FILTERS.map(f => (
              <div key={f.key} className={`chip${filter === f.key ? ' active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</div>
            ))}
          </div>
        </div>
        <div className="conv-list">
          {!filtered.length ? (
            <div className="empty-state">
              {conversations.length
                ? 'No conversations match this filter.'
                : 'No conversations yet. Authorize a store in Settings → Store Authorization, then try 🧪 Test message.'}
            </div>
          ) : filtered.map(c => {
            const m = platformMeta[c.platform];
            return (
              <div key={c.id} className={`conv-item${selectedId === c.id ? ' active' : ''}`} onClick={() => open(c)}>
                <div className="conv-avatar">
                  {initials(c.name)}
                  <span className={`platform-dot ${m?.dot || ''}`}>{m?.icon}</span>
                </div>
                <div className="conv-main">
                  <div className="conv-top">
                    <span className="conv-name">{c.name}{c.resolved && <span className="resolved-tag">Resolved</span>}</span>
                    <span className="conv-time">{c.time}</span>
                  </div>
                  <div className="conv-preview">{c.preview}</div>
                </div>
                {c.unread && <span className="unread-dot" />}
              </div>
            );
          })}
        </div>
      </section>

      <section className="chat-col">
        <div className="chat-header">
          <div className="chat-header-info">
            <div className="conv-avatar" style={{ width: 36, height: 36 }}>{selected ? initials(selected.name) : '—'}</div>
            <div>
              <div className="name">{selected ? selected.name : 'No conversation selected'}</div>
              <div className="meta">{selected ? `${meta?.label} · last message ${selected.time}` : 'Messages will appear here'}</div>
            </div>
          </div>
          <div className="chat-actions">
            <button className={`icon-btn${translate ? ' on' : ''}`} title="Translate"
              onClick={() => { if (!selected) { toast('Select a conversation first'); return; } setTranslate(t => !t); }}>
              <i className="ti ti-language" aria-hidden="true" /></button>
            <button className="icon-btn" title="Assign"
              onClick={() => {
                if (!selected) { toast('Select a conversation first'); return; }
                setAssignOpen(true);
              }}><i className="ti ti-users" aria-hidden="true" /></button>
            <button className={`icon-btn${selected?.resolved ? ' on' : ''}`} title="Mark resolved" onClick={resolve}>
              <i className="ti ti-check" aria-hidden="true" /></button>
          </div>
        </div>

        <div className="chat-body" ref={bodyRef}>
          {!selected ? (
            <div className="empty-state">Select a conversation to view messages.</div>
          ) : !selected.messages.length ? (
            <div className="empty-state">No messages in this conversation yet.</div>
          ) : selected.messages.map((m, i) => (
            <div key={i} className={`msg ${m.direction}`}>
              {m.text}
              <div className="msg-time">{m.time}</div>
              {translate && m.direction === 'in' && (
                <div className="msg-translation">🌐 EN (auto): {m.text}</div>
              )}
            </div>
          ))}
        </div>

        <div className="chat-composer">
          <div className="quick-replies">
            {quickReplies.map(t => (
              <div key={t.shortcut} className="qr-chip" onClick={() => setComposer(t.text)}>⚡ {t.shortcut}</div>
            ))}
          </div>
          <div className="composer-row">
            <textarea placeholder="Type a reply..." value={composer}
              onChange={e => setComposer(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="btn-sm" style={{ alignSelf: 'flex-end' }} disabled={drafting} onClick={aiDraft}>
              {drafting ? '…' : '✨ AI Draft'}
            </button>
            <button className="send-btn" onClick={send}>Send</button>
          </div>
        </div>
      </section>

      {assignOpen && (
        <FormDialog
          title={`Assign conversation — ${selected?.name || ''}`}
          sub="Hand this chat to a teammate."
          submitLabel="Assign"
          fields={[
            {
              key: 'agent', label: 'Assign to', type: 'select',
              options: agents.length ? agents.map(a => a.name) : [user?.name || 'Me'],
            },
            { key: 'note', label: 'Note for the agent', type: 'textarea', rows: 3, placeholder: 'Optional context, e.g. buyer wants a bulk quote' },
          ]}
          onClose={() => setAssignOpen(false)}
          onSubmit={({ agent }) => toast(`Assigned to ${agent}`)}
        />
      )}

      <aside className="info-col">
        <div className="info-profile">
          <div className="info-avatar">{selected ? initials(selected.name) : '—'}</div>
          <div className="name">{selected ? selected.name : 'No buyer selected'}</div>
          <div className="platform-tag">{selected ? `${meta?.icon} ${meta?.label} buyer` : '—'}</div>
        </div>
        <div className="info-section">
          <h4>Buyer Stats</h4>
          <div className="stat-grid">
            <div className="stat-box"><div className="num">{selected ? 1 : 0}</div><div className="lbl">Orders</div></div>
            <div className="stat-box"><div className="num">—</div><div className="lbl">Rating</div></div>
          </div>
        </div>
        <div className="info-section">
          <h4>Order Details</h4>
          <div className="info-row"><span>Order ID</span><span>—</span></div>
          <div className="info-row"><span>Status</span><span>—</span></div>
          <div className="info-row"><span>Amount</span><span>—</span></div>
          <div className="info-row"><span>Tracking</span><span>—</span></div>
        </div>
        <div className="info-section">
          <h4>Tags</h4>
          <div className="tag-list">
            {selected?.test
              ? <div className="tag">🧪 Test buyer</div>
              : <div className="empty-state" style={{ padding: 0, textAlign: 'left' }}>No tags yet.</div>}
          </div>
        </div>
      </aside>
    </div>
  );
}
