import React, { useState, useEffect } from 'react';
import { useApp, useLocal } from '../state.jsx';
import { api } from '../api.js';
import { PagePad, PageTitle, DataTable, StatusPill, Toggle, FeatureToggleList, StatTileRow, ChartCard, FormDialog } from '../components.jsx';

// ---------- AI Chatbot hub ----------
const FEATURES = [
  { t: '💡 Smart Reply', d: "Reads the buyer's question, pulls the right product details, and drafts the answer in context." },
  { t: '🛍️ Product Recommendations', d: "Suggests in-stock alternatives when something's sold out, and upsells when buyers are ready." },
  { t: '🎨 Your Store\'s Voice', d: 'Learns from your past replies so the AI sounds like you — Taglish and all.' },
  { t: '💢 Frustration Detection', d: 'Spots upset buyers and quietly hands the chat to a human before it becomes a 1-star review.' },
  { t: '🕐 Reception Control', d: 'Decide when AI answers alone, when it drafts for approval, and when it stays out of the way.' },
  { t: '📚 Knowledge Pack', d: 'Feed it your FAQs, policies, and size charts — it answers from your facts, not guesses.' },
];

export function AiHub({ openPage }) {
  const { toast, logOp } = useApp();
  const [trial, setTrial] = useLocal('ai_trial', false);
  const [knowledge, setKnowledge] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api('/api/knowledge').then(d => { setKnowledge(d.text); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  async function saveKnowledge() {
    await api('/api/knowledge', { method: 'PUT', body: { text: knowledge } });
    logOp('Updated AI knowledge pack');
    toast('Knowledge pack saved — AI drafts will use it');
  }

  return (
    <PagePad>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <h2 className="page-title">BilisBot — your AI co-seller</h2>
        <p className="page-sub" style={{ marginBottom: 14 }}>Answers buyers in seconds, around the clock, in their language.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn-sm primary" onClick={() => openPage('plans')}>Get AI Assist Add-on</button>
          <button className="btn-sm" onClick={() => toast('Support will reach out shortly!')}>Talk to support</button>
        </div>
      </div>

      <div className="ai-hub-grid">
        <div>
          <div className="ai-stat-card"><div className="big">⚡</div><div className="num">Seconds</div><div className="lbl">First reply time, day or night</div></div>
          <div className="ai-stat-card"><div className="big">💬</div><div className="num">Most FAQs</div><div className="lbl">Answered without an agent touching the keyboard</div></div>
          <div className="ai-stat-card"><div className="big">🧑‍💼</div><div className="num">More selling</div><div className="lbl">Your team handles the chats that actually need a human</div></div>
        </div>

        <div>
          <div className="ai-feature-grid">
            {FEATURES.map(f => (
              <div key={f.t} className="ai-feature"><div className="t">{f.t}</div><div className="d">{f.d}</div></div>
            ))}
          </div>

          <div className="ai-trial-bar">
            <span>AI suggested replies — the ✨ AI Draft button in Chats</span>
            <Toggle checked={trial} onChange={v => { setTrial(v); toast(v ? 'AI suggested replies enabled' : 'AI suggested replies disabled'); }} />
          </div>

          <div className="home-card" style={{ marginTop: 18 }}>
            <div className="home-card-head"><h3>📚 Knowledge Pack</h3><span className="home-card-note">Facts the AI is allowed to use in drafts</span></div>
            <textarea
              rows={6}
              style={{ width: '100%', padding: '11px 13px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
              placeholder={'e.g.\nShipping: nationwide via J&T, 2-3 days Luzon, 5-7 days Vis/Min. Free shipping over ₱499.\nReturns: 7 days, unused items only.\nSizes: S (36), M (38), L (40), XL (42).'}
              value={knowledge}
              disabled={!loaded}
              onChange={e => setKnowledge(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="btn-sm primary" onClick={saveKnowledge}>Save Knowledge Pack</button>
            </div>
          </div>

          <div className="home-card" style={{ marginTop: 18 }}>
            <div className="home-card-head"><h3>🔌 How the real AI works here</h3></div>
            <ol className="ai-guide-steps">
              <li>The backend already calls the Claude API for ✨ AI Draft — set ANTHROPIC_API_KEY where the server runs to switch from template drafts to Claude drafts.</li>
              <li>Each draft sends the recent chat history plus your Knowledge Pack, so answers use your store's real facts.</li>
              <li>Connect real marketplace webhooks (Shopee / Lazada / TikTok / Meta open platforms) to replace the 🧪 test simulator.</li>
              <li>Start in draft mode — an agent approves every AI reply — then graduate FAQs to full auto-reply.</li>
            </ol>
          </div>
        </div>
      </div>
    </PagePad>
  );
}

// ---------- Monitor ----------
export function AiMonitor() {
  return (
    <PagePad>
      <PageTitle title="AI Chatbot Monitor" sub="How your AI is performing across every store." />
      <StatTileRow tiles={[
        { lbl: 'Chats handled by AI', num: '0', cmp: 'Last period —' },
        { lbl: 'Resolved without human', num: '0', cmp: 'Last period —' },
        { lbl: 'Handed to agents', num: '0', cmp: 'Last period —' },
        { lbl: 'Avg. AI reply time', num: '—', cmp: 'Last period —' },
      ]} />
      <ChartCard legend={[{ label: 'AI-handled chats', color: '#ff5a1f' }]} mode="day" />
    </PagePad>
  );
}

// ---------- Toggle pages ----------
export function TogglesPage({ title, sub, storageKey, items }) {
  const { toast, logOp } = useApp();
  const [values, setValues] = useLocal(storageKey, {});
  return (
    <PagePad>
      <PageTitle title={title} sub={sub} />
      <FeatureToggleList items={items} values={values}
        onToggle={(t, v) => {
          setValues(prev => ({ ...prev, [t]: v }));
          toast(`${t} ${v ? 'enabled' : 'disabled'}`);
          logOp(`${t} ${v ? 'enabled' : 'disabled'}`);
        }} />
    </PagePad>
  );
}

export const RECEPTION_ITEMS = [
  { t: 'Instant welcome', d: 'Greet every new buyer within a second, in their language.' },
  { t: 'Off-hours reception', d: 'AI covers chats completely outside your office hours.' },
  { t: 'Queue overflow assist', d: 'When all agents are busy, AI keeps buyers engaged instead of waiting in silence.' },
];

export const HANDOVER_ITEMS = [
  { t: 'Frustrated buyer → human', d: 'Negative sentiment hands the chat to an agent immediately.' },
  { t: 'Refund or dispute keywords → human', d: 'Money matters always get a human touch.' },
  { t: 'Repeat buyer / VIP → human', d: 'Your best customers skip the bot when they want to.' },
];

// ---------- AI rules pages ----------
export function AiRulesPage({ title, sub, storageKey, columns, prompts, empty, openPage }) {
  const { toast, logOp, addons } = useApp();
  const [rules, setRules] = useLocal(storageKey, []);
  const [editor, setEditor] = useState(null); // null | {rule?}

  function openEditor(rule) {
    if (!addons.length) {
      toast(`${title} needs the AI Assist add-on — grab it in Plans & Billing.`);
      openPage('plans');
      return;
    }
    setEditor({ rule });
  }

  const rows = rules.map((r, i) => (
    <tr key={i}>
      <td><b>{r.rule}</b></td>
      <td>{r.detail}</td>
      <td><StatusPill ok={r.status}>{r.status ? 'On' : 'Off'}</StatusPill></td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="btn-sm" onClick={() => openEditor(rules[i])}>Edit</button>{' '}
        <button className="btn-sm" onClick={() => {
          setRules(prev => prev.map((x, j) => j === i ? { ...x, status: !x.status } : x));
          toast(`${r.rule} ${r.status ? 'disabled' : 'enabled'}`);
        }}>{r.status ? 'Disable' : 'Enable'}</button>{' '}
        <button className="btn-sm danger" onClick={() => {
          setRules(prev => prev.filter((_, j) => j !== i));
          toast('Rule deleted');
        }}>Delete</button>
      </td>
    </tr>
  ));

  return (
    <PagePad wide>
      <PageTitle title={title} sub={sub} />
      <div className="toolbar-row">
        <div className="spacer" />
        <button className="btn-sm primary" onClick={() => openEditor(null)}>+ New rule</button>
      </div>
      <DataTable columns={columns} rows={rows} empty={empty} />

      {editor && (
        <FormDialog
          title={editor.rule ? `Edit "${editor.rule.rule}"` : `New rule — ${title}`}
          sub="Describe the rule in your own words — this is what the AI follows."
          submitLabel={editor.rule ? 'Save changes' : 'Create rule'}
          fields={[
            { key: 'rule', label: prompts[0].replace(/:$/, ''), required: true, value: editor.rule?.rule },
            { key: 'detail', label: prompts[1].replace(/:$/, ''), type: 'textarea', rows: 5, required: true, value: editor.rule?.detail },
          ]}
          onClose={() => setEditor(null)}
          onSubmit={v => {
            if (editor.rule) {
              setRules(prev => prev.map(x => x === editor.rule ? { ...x, ...v } : x));
              toast('Rule updated');
            } else {
              setRules(prev => [...prev, { ...v, status: true }]);
              logOp(`Added ${title} rule "${v.rule}"`);
              toast('Rule added');
            }
          }}
        />
      )}
    </PagePad>
  );
}
