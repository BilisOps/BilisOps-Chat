import React, { useState, useRef, useEffect } from 'react';
import { useApp, useLocal } from '../state.jsx';
import { api, initials } from '../api.js';
import { platformMeta } from '../data.js';
import { FormDialog } from '../components.jsx';
import { PlatformLogo } from '../brand.jsx';

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
  const [buyerOrders, setBuyerOrders] = useState([]);
  const [infoTab, setInfoTab] = useState('order');
  const [products, setProducts] = useState([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const bodyRef = useRef(null);

  const selected = conversations.find(c => c.id === selectedId) || null;

  // deep-link from other pages (e.g. Chat Dashboard): open a specific conversation
  const convsRef = useRef(conversations);
  convsRef.current = conversations;
  useEffect(() => {
    const check = () => {
      const id = sessionStorage.getItem('bilisops_open_conv');
      if (!id) return;
      sessionStorage.removeItem('bilisops_open_conv');
      setStoreFilter('all');
      setFilter('all');
      setSelectedId(id);
      const conv = convsRef.current.find(c => c.id === id);
      if (conv?.unread) {
        api(`/api/conversations/${id}/read`, { method: 'POST' }).then(syncConversations).catch(() => {});
      }
    };
    check();
    window.addEventListener('bilisops-open-conv', check);
    return () => window.removeEventListener('bilisops-open-conv', check);
  }, []);

  // the buyer's orders (current + previous) for the info panel
  useEffect(() => {
    setBuyerOrders([]);
    setNoteOpen(false);
    if (!selectedId) return;
    api(`/api/conversations/${selectedId}/orders`).then(list => {
      setBuyerOrders(list);
      setNoteDraft(list[0]?.sellerNote || '');
    }).catch(() => {});
  }, [selectedId]);

  // product catalog for the Product tab
  useEffect(() => {
    api('/api/ai/config').then(d => setProducts((d.products || []).filter(p => p.active))).catch(() => {});
  }, []);

  async function saveNote(order) {
    try {
      const updated = await api(`/api/orders/${order.id}`, { method: 'PUT', body: { sellerNote: noteDraft } });
      setBuyerOrders(prev => prev.map(o => o.id === order.id ? updated : o));
      setNoteOpen(false);
      toast('Seller note saved');
    } catch {
      toast('Could not save the note');
    }
  }

  // "2026/07/23 14:55 (UTC+08:00)" — Manila time like the marketplaces show
  const manila = (iso) => {
    if (!iso) return '—';
    const s = new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    return s.replace(/-/g, '/') + ' (UTC+08:00)';
  };
  const logisticsText = (s) => /COMPLET|DELIVER/i.test(s) ? 'Parcel has been delivered'
    : /SHIP{1,2}ED/i.test(s) ? 'Parcel is on the way with the courier'
    : /TO_SHIP/i.test(s) ? 'Seller is preparing the parcel'
    : /CANCEL/i.test(s) ? 'Order was cancelled'
    : 'Awaiting payment';

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
              <span className="store-ic"><PlatformLogo k={s.key} size={15} title={s.platform} /></span>
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
              <div key={c.id} className={`conv-item${selectedId === c.id ? ' active' : ''}${c.unread ? ' unread' : ''}`} onClick={() => open(c)}>
                <div className="conv-avatar">
                  {initials(c.name)}
                  <span className="platform-dot logo"><PlatformLogo k={c.platform} size={11} title={m?.label} /></span>
                </div>
                <div className="conv-main">
                  <div className="conv-top">
                    <span className="conv-name">{c.name}{c.resolved && <span className="resolved-tag">Resolved</span>}</span>
                    <span className="conv-time">{c.time}</span>
                  </div>
                  <div className="conv-preview">{c.preview}</div>
                  {(() => {
                    const last = c.messages[c.messages.length - 1];
                    if (!last) return null;
                    if (last.direction === 'out') {
                      return last.ai
                        ? <span className="reply-chip ai">🤖 AI replied</span>
                        : <span className="reply-chip human">👤 Human replied</span>;
                    }
                    return <span className="reply-chip waiting">⏳ Awaiting reply</span>;
                  })()}
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
              {m.ai && <div className="msg-ai-tag">🤖 BilisBot · auto-reply</div>}
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
          <div className="platform-tag">
            {selected
              ? <><PlatformLogo k={selected.platform} size={13} title={meta?.label} /> {meta?.label} buyer</>
              : '—'}
          </div>
        </div>
        <div className="info-section">
          <h4>Buyer Stats</h4>
          <div className="stat-grid">
            <div className="stat-box"><div className="num">{buyerOrders.length}</div><div className="lbl">Orders</div></div>
            <div className="stat-box">
              <div className="num">{buyerOrders.length ? `₱${buyerOrders.reduce((s, o) => s + (o.amount || 0), 0).toLocaleString()}` : '—'}</div>
              <div className="lbl">Total spent</div>
            </div>
          </div>
        </div>
        <div className="info-tabs">
          {[['order', 'Order'], ['product', 'Product'], ['voucher', 'Voucher'], ['ticket', 'Ticket']].map(([k, label]) => (
            <button key={k} className={`info-tab${infoTab === k ? ' active' : ''}`} onClick={() => setInfoTab(k)}>{label}</button>
          ))}
        </div>

        {infoTab === 'order' && (() => {
          if (!selected) return <div className="info-section"><div className="empty-state" style={{ padding: 0, textAlign: 'left' }}>Select a conversation.</div></div>;
          if (!buyerOrders.length) return <div className="info-section"><div className="empty-state" style={{ padding: 0, textAlign: 'left' }}>No orders from this buyer yet.</div></div>;
          const [cur, ...prev] = buyerOrders;
          const cls = (s) => /COMPLET|DELIVER/i.test(s) ? 'good' : /CANCEL/i.test(s) ? 'bad' : 'mid';
          return (
            <>
              <div className="info-section">
                <div className="ord-top">
                  <span className={`ord-status ${cls(cur.status)}`}>{cur.status}</span>
                </div>
                <div className="ord-refline">
                  <span className="ord-ref" title="Click to copy"
                    onClick={() => { navigator.clipboard?.writeText(cur.orderRef); toast('Order number copied'); }}>
                    {cur.orderRef} ⧉
                  </span>
                </div>
                <div className="ord-date">{manila(cur.at)}</div>

                <div className="order-card" style={{ marginTop: 8 }}>
                  {(cur.items || []).length ? (cur.items || []).map((it, i) => (
                    <div className="ord-line" key={i}>
                      <div className="ord-line-main">
                        <span className="ord-item-name">{it.name}</span>
                        <span className="ord-item-price">₱{Number(it.price).toLocaleString()}</span>
                      </div>
                      <div className="ord-line-sub">
                        <span>Variation: {it.variation || '-'}</span>
                        <span>× {it.qty}</span>
                      </div>
                    </div>
                  )) : <div className="cat-empty">No line items on this order.</div>}
                  <div className="info-row pay-row"><span>Buyer payment amount</span><b>₱{Number(cur.amount || 0).toLocaleString()} PHP</b></div>
                  <div className="info-row"><span>Payment Method</span><span>{cur.paymentMethod || '—'}</span></div>
                  <div className="info-row"><span>Payment Time</span><span>{cur.paymentTime ? manila(cur.paymentTime) : '—'}</span></div>
                </div>
              </div>

              <div className="info-section">
                <h4>Note</h4>
                {!noteOpen && !cur.sellerNote && (
                  <button className="note-add" onClick={() => setNoteOpen(true)}>Seller Note ⓘ <span className="plus">＋</span></button>
                )}
                {!noteOpen && cur.sellerNote && (
                  <div className="note-view" onClick={() => { setNoteDraft(cur.sellerNote); setNoteOpen(true); }}>
                    📝 {cur.sellerNote}
                  </div>
                )}
                {noteOpen && (
                  <div>
                    <textarea className="note-input" rows={3} value={noteDraft} autoFocus
                      placeholder="e.g. Repeat buyer — include a freebie"
                      onChange={e => setNoteDraft(e.target.value)} />
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                      <button className="btn-sm" onClick={() => setNoteOpen(false)}>Cancel</button>
                      <button className="btn-sm primary" onClick={() => saveNote(cur)}>Save note</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="info-section">
                <h4>Logistic Information</h4>
                <div className="info-row"><span>Shipping Provider</span><span>{cur.courier || '—'}</span></div>
                <div className="info-row"><span>Tracking Number</span>
                  {cur.trackingNo
                    ? <span className="ord-ref" title="Click to copy"
                        onClick={() => { navigator.clipboard?.writeText(cur.trackingNo); toast('Tracking number copied'); }}>
                        {cur.trackingNo} ⧉
                      </span>
                    : <span>—</span>}
                </div>
                <div className="info-row"><span>Logistics Status</span>
                  <span className={`ord-logi ${cls(cur.status)}`}>
                    {/COMPLET|DELIVER/i.test(cur.status) ? '✅ Delivered' : cur.status}
                  </span>
                </div>
                <div className="info-row"><span>Latest Description</span><span>{logisticsText(cur.status)}</span></div>
              </div>

              {prev.length > 0 && (
                <div className="info-section">
                  <h4>Previous Orders ({prev.length})</h4>
                  {prev.map(o => (
                    <div className="ord-prev" key={o.id}>
                      <span className={`ord-status sm ${cls(o.status)}`}>{o.status}</span>
                      <span className="ord-prev-ref">{o.orderRef}</span>
                      <span className="ord-prev-amt">₱{Number(o.amount || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          );
        })()}

        {infoTab === 'product' && (
          <div className="info-section">
            <h4>Product Catalog</h4>
            {!products.length
              ? <div className="empty-state" style={{ padding: 0, textAlign: 'left' }}>No products yet — add them in AI → Product Catalog.</div>
              : products.map(p => (
                <div className="prod-row" key={p.id}>
                  <div className="prod-main">
                    <span className="prod-name">{p.name}</span>
                    <span className="prod-price">{p.price || '—'}</span>
                  </div>
                  <div className="prod-sub">
                    <span className={`ord-status sm ${p.stock === 'in' ? 'good' : p.stock === 'out' ? 'bad' : 'mid'}`}>
                      {p.stock === 'in' ? 'In stock' : p.stock === 'out' ? 'Out of stock' : p.stock === 'low' ? 'Low stock' : 'Pre-order'}
                    </span>
                    <button className="btn-sm" style={{ fontSize: 10.5 }}
                      onClick={() => { setComposer(`Hi po! ${p.name} — ${p.price || ''}${p.promo ? ` · ${p.promo}` : ''} 😊`); toast('Product inserted into your reply'); }}>
                      Insert to reply
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {infoTab === 'voucher' && (
          <div className="info-section">
            <h4>Vouchers</h4>
            <div className="empty-state" style={{ padding: 0, textAlign: 'left' }}>
              No vouchers yet. Platform voucher sharing arrives with the marketplace order scopes.
            </div>
          </div>
        )}

        {infoTab === 'ticket' && (
          <div className="info-section">
            <h4>Tickets</h4>
            <div className="empty-state" style={{ padding: 0, textAlign: 'left' }}>
              No tickets for this buyer. Escalations you file in the Ticket Center will show here.
            </div>
          </div>
        )}
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
