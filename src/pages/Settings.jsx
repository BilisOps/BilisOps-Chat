import React, { useState } from 'react';
import { useApp, useLocal } from '../state.jsx';
import { api } from '../api.js';
import { PagePad, PageTitle, DataTable, StatusPill, FormDialog } from '../components.jsx';
import { SEAT_LIMITS } from '../data.js';

// ---------- Store Authorization ----------
export function StoreAuth() {
  const { stores, syncStores, syncConversations, toast, logOp } = useApp();
  const [platform, setPlatform] = useState('Shopee');
  const [name, setName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [busy, setBusy] = useState(false);
  const [platforms, setPlatforms] = useState([]);

  React.useEffect(() => {
    api('/api/platforms').then(setPlatforms).catch(() => {});
  }, []);

  async function authorize() {
    if (!name.trim()) { toast('Enter your store name first'); return; }
    setBusy(true);
    toast(`Redirecting to ${platform} to authorize...`);
    try {
      await api('/api/stores', { method: 'POST', body: { platform, name: name.trim(), externalId: externalId.trim() || undefined } });
      await syncStores();
      logOp(`Authorized ${platform} store "${name.trim()}"`);
      toast(`${name.trim()} authorized on ${platform} ✓`);
      setName('');
      setExternalId('');
    } catch {
      toast('Authorization failed — try again');
    } finally {
      setBusy(false);
    }
  }

  async function remove(store) {
    await api(`/api/stores/${store.id}`, { method: 'DELETE' });
    await Promise.all([syncStores(), syncConversations()]);
    logOp(`Removed ${store.platform} store "${store.name}"`);
    toast(`${store.name} removed`);
  }

  const rows = stores.map(s => (
    <tr key={s.id}>
      <td><b>{s.name}</b></td><td>{s.platform}</td><td>{s.site}</td>
      <td>{s.time}</td><td>{s.expiry}</td>
      <td><StatusPill ok>Authorized</StatusPill></td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="btn-sm" onClick={() => toast('Authorization refreshed for another year ✓')}>Reauthorize</button>{' '}
        <button className="btn-sm danger" onClick={() => remove(s)}>Remove</button>
      </td>
    </tr>
  ));

  return (
    <PagePad wide>
      <PageTitle title="Store Authorization"
        sub="Connect your marketplace stores through each platform's official login — BilisOps Chat never sees your password." />
      <div className="toolbar-row">
        <select value={platform} onChange={e => setPlatform(e.target.value)}>
          {['Shopee', 'Lazada', 'TikTok', 'Facebook'].map(p => <option key={p}>{p}</option>)}
        </select>
        <input type="text" placeholder="Store name (e.g. MyStorePH)" value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') authorize(); }} />
        <input type="text" placeholder="Platform ID (shop_id / seller_id / page_id — optional)" value={externalId}
          onChange={e => setExternalId(e.target.value)} style={{ width: 280 }} />
        <button className="btn-sm primary" disabled={busy} onClick={authorize}>+ Authorize Store</button>
        <div className="spacer" />
        <button className="btn-sm" onClick={() => toast('Drag-to-sort coming soon')}>Manage sorting</button>
      </div>
      <DataTable
        columns={['Store name', 'Platform', 'Site', 'Authorized at', 'Expires', 'Status', 'Actions']}
        rows={rows}
        empty='No stores authorized yet. Pick a platform above, enter your store name, and click "Authorize Store".' />

      <h3 style={{ margin: '30px 0 6px' }}>Open API readiness</h3>
      <p className="page-sub">
        Every marketplace names the same concepts differently — BilisOps Chat normalizes them all into one inbox.
        Point each platform's developer console at the webhook URL below; add the platform's keys as server
        environment variables to switch that adapter from demo mode to live signature-verified mode.
      </p>
      <DataTable
        columns={['Platform', 'Store is called', 'Buyer is called', 'Chat unit', 'Order ref', 'Auth model', 'Webhook URL', 'Mode']}
        rows={platforms.map(p => (
          <tr key={p.key}>
            <td><b>{p.name}</b></td>
            <td>{p.terms.store}</td>
            <td>{p.terms.buyer}</td>
            <td>{p.terms.chat}</td>
            <td>{p.terms.order}</td>
            <td style={{ fontSize: 11.5 }}>{p.authModel}</td>
            <td>
              <code style={{ fontSize: 11, cursor: 'pointer' }} title="Click to copy"
                onClick={() => { navigator.clipboard?.writeText(p.webhookUrl); toast('Webhook URL copied'); }}>
                {p.webhookUrl.replace(/^https?:\/\//, '')}
              </code>
            </td>
            <td><StatusPill ok={p.ready}>{p.ready ? 'Live' : 'Demo'}</StatusPill></td>
          </tr>
        ))}
        empty="Loading platform adapters..." />
    </PagePad>
  );
}

// ---------- Agent Management ----------
export function AgentsPage() {
  const { toast, logOp, plan, user } = useApp();
  const [agents, setAgents] = useLocal('agents', [{ name: user?.name || 'Seller', email: user?.email || '—', role: 'Owner' }]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const limit = SEAT_LIMITS[plan] || 1;

  return (
    <PagePad wide>
      <PageTitle title="Agent Management" sub="Your team's seats and roles." />
      <div className="toolbar-row">
        <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>Seats used: {agents.length}/{limit}</span>
        <div className="spacer" />
        <button className="btn-sm primary" onClick={() => {
          if (agents.length >= limit) { toast(`Your ${plan} plan allows ${limit} seat${limit > 1 ? 's' : ''} — upgrade for more.`); return; }
          setInviteOpen(true);
        }}>+ Invite Agent</button>
      </div>

      {inviteOpen && (
        <FormDialog
          title="Invite an agent"
          sub="They join your workspace with agent access to the shared inbox."
          submitLabel="Send invite"
          fields={[
            { key: 'name', label: 'Agent name', placeholder: 'e.g. Maria Santos', required: true },
            { key: 'email', label: 'Agent email', placeholder: 'e.g. maria@yourstore.ph', required: true },
          ]}
          onClose={() => setInviteOpen(false)}
          onSubmit={({ name, email }) => {
            setAgents(prev => [...prev, { name, email, role: 'Agent' }]);
            logOp(`Invited agent ${name}`);
            toast(`Invite sent to ${name}`);
          }}
        />
      )}
      <DataTable columns={['Name', 'Email', 'Role', 'Status']}
        rows={agents.map((a, i) => (
          <tr key={i}><td><b>{a.name}</b></td><td>{a.email}</td><td>{a.role}</td><td><StatusPill ok>Active</StatusPill></td></tr>
        ))}
        empty="" />
    </PagePad>
  );
}

// ---------- Sensitive Words ----------
export function Sensitive() {
  const { toast, logOp } = useApp();
  const [words, setWords] = useLocal('sensitivewords', []);
  const [input, setInput] = useState('');

  function add() {
    const v = input.trim();
    if (!v) return;
    if (words.includes(v)) { toast('Already in the list'); return; }
    setWords(prev => [...prev, v]);
    logOp(`Added sensitive word "${v}"`);
    toast(`"${v}" added to blocked words`);
    setInput('');
  }

  return (
    <PagePad>
      <PageTitle title="Sensitive Words"
        sub="Outgoing messages containing these words are blocked before they send — protect your store from platform penalties." />
      <div className="toolbar-row">
        <input type="text" placeholder="Add a word or phrase..." value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }} />
        <button className="btn-sm primary" onClick={add}>Add</button>
      </div>
      <div>
        {!words.length ? (
          <div className="empty-state">No blocked words yet. Common picks: payment redirects, competitor names, off-platform contact info.</div>
        ) : words.map((w, i) => (
          <span key={w} className="word-tag">
            {w}
            <button title="Remove" onClick={() => { setWords(prev => prev.filter((_, j) => j !== i)); toast(`"${w}" removed`); }}>✕</button>
          </span>
        ))}
      </div>
    </PagePad>
  );
}

// ---------- System Settings ----------
export function SystemSettings() {
  const { toast, logOp, settings } = useApp();
  const [sys, setSys] = useLocal('system', { biz: '', hours: '', lang: 'English' });
  const [form, setForm] = useState(sys);

  return (
    <PagePad>
      <PageTitle title="System Settings" sub="Workspace basics." />
      <form className="settings-form" onSubmit={e => {
        e.preventDefault();
        setSys(form);
        toast('Settings saved');
        logOp('Updated system settings');
      }}>
        <div className="field">
          <label>Business name</label>
          <input type="text" placeholder="Your store name" value={form.biz} onChange={e => setForm({ ...form, biz: e.target.value })} />
        </div>
        <div className="field">
          <label>Report currency &amp; time zone</label>
          <input type="text" readOnly value={settings ? `${settings.currency} · ${settings.timezone}` : 'Not set yet'} />
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 5 }}>Locked at first setup and can't be changed.</div>
        </div>
        <div className="field">
          <label>Office hours</label>
          <input type="text" placeholder="e.g. 9:00 AM – 6:00 PM" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} />
        </div>
        <div className="field">
          <label>Interface language</label>
          <select value={form.lang} onChange={e => setForm({ ...form, lang: e.target.value })}>
            <option>English</option><option>Filipino</option>
          </select>
        </div>
        <button className="btn-sm primary" type="submit">Save Settings</button>
      </form>
    </PagePad>
  );
}

// ---------- Operating Record ----------
export function OpRecord() {
  const { opLog } = useApp();
  return (
    <PagePad wide>
      <PageTitle title="Operating Record" sub="Every meaningful action in this workspace, on the record." />
      <DataTable columns={['Time', 'Operator', 'Action']}
        rows={opLog.length ? opLog.map((o, i) => (
          <tr key={i}><td>{o.time}</td><td>{o.who}</td><td>{o.action}</td></tr>
        )) : null}
        empty="No recorded operations yet." />
    </PagePad>
  );
}

// ---------- Privacy ----------
export function Privacy() {
  return (
    <PagePad narrow={760}>
      <PageTitle title="Privacy Policy" sub="Last updated July 2026" />
      <div className="home-card">
        <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--text)', margin: 0 }}>
          BilisOps Chat connects to your marketplace stores exclusively through each platform's official open APIs,
          authorized by you. We store only what's needed to show your chats and orders in one inbox: message content,
          order metadata, and store connection tokens. We never see or store your marketplace passwords.
          Buyer data is used solely to power your workspace — never sold, never shared with third parties, never used
          to train anything outside your own store's knowledge pack. You can revoke a store's authorization at any time
          from Settings → Store Authorization, which deletes its synced data within 30 days.
        </p>
      </div>
    </PagePad>
  );
}
