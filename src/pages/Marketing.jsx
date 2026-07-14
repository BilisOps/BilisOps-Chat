import React, { useState } from 'react';
import { useApp, useLocal } from '../state.jsx';
import { downloadFile } from '../api.js';
import { PagePad, PageTitle, SubTabs, DataTable, StatusPill, NoticeBar, FeatureToggleList, FormDialog } from '../components.jsx';
import { FLOW_STAGES, PLATFORM_TABS, BROADCAST_QUOTA } from '../data.js';

// ---------- Order Follow-Up ----------
export function Followup() {
  const { toast, logOp } = useApp();
  const [enabled, setEnabled] = useLocal('followup_map', {});
  const totalFns = FLOW_STAGES.reduce((n, s) => n + s.fns.length, 0);
  const count = Object.values(enabled).filter(Boolean).length;

  return (
    <PagePad wide>
      <div className="flow-banner">
        <h3>🎯 Follow the buyer, close the sale</h3>
        <p>Turn on a step below and BilisOps Chat nudges every buyer at the right moment — automatically.</p>
      </div>
      <div className="flow-count">Functions enabled: {count}/{totalFns}</div>
      <div className="flow-row">
        {FLOW_STAGES.map(stage => (
          <div key={stage.title} className="flow-stage">
            <div className="s-icon">{stage.icon}</div>
            <div className="s-title">{stage.title}</div>
            <div className="s-sub">{stage.sub}</div>
            {!stage.fns.length && <div style={{ textAlign: 'center', fontSize: 26 }}>💰</div>}
            {stage.fns.map(fn => (
              <button key={fn} className={`flow-fn${enabled[fn] ? ' on' : ''}`}
                onClick={() => {
                  const on = !enabled[fn];
                  setEnabled(prev => ({ ...prev, [fn]: on }));
                  toast(`${fn} ${on ? 'enabled' : 'disabled'}`);
                  logOp(`Follow-up "${fn}" ${on ? 'enabled' : 'disabled'}`);
                }}>{fn}</button>
            ))}
          </div>
        ))}
      </div>
    </PagePad>
  );
}

// ---------- Message Broadcast ----------
export function Broadcast({ openPage }) {
  const { toast, logOp, plan, conversations, connected, user } = useApp();
  const [tasks, setTasks] = useLocal('broadcasts', []);
  const [tab, setTab] = useState(PLATFORM_TABS[0]);
  const [editorOpen, setEditorOpen] = useState(false);

  const keyByTab = { Shopee: 'shopee', Lazada: 'lazada', TikTok: 'tiktok', Facebook: 'fb' };

  function openEditor() {
    if (plan === 'Free') { toast('Broadcasts need a paid plan — upgrade first.'); return; }
    const integ = connected.find(i => i.key === keyByTab[tab]);
    if (integ && !integ.connected) { toast(`Connect ${tab} first (Settings → Store Authorization)`); return; }
    setEditorOpen(true);
  }

  function addTask({ name, msg }) {
    const audience = conversations.filter(c => c.platform === keyByTab[tab]).length;
    const task = { platform: tab, name, msg, status: 'Queued', planned: audience, ok: 0, fail: 0, creator: user?.name || 'Seller', time: new Date().toLocaleString() };
    setTasks(prev => [task, ...prev]);
    logOp(`Created broadcast task "${name}" (${tab})`);
    toast('Broadcast task queued');
    setTimeout(() => {
      setTasks(prev => prev.map(t => (t.name === name && t.time === task.time)
        ? { ...t, status: 'Sent', ok: t.planned } : t));
      toast(`Broadcast "${name}" sent to ${audience} buyer${audience === 1 ? '' : 's'}`);
    }, 1500);
  }

  const list = tasks.filter(t => t.platform === tab);
  const rows = list.map((t, i) => (
    <tr key={i}>
      <td><b>{t.name}</b><br /><span style={{ color: 'var(--muted)', fontSize: 11.5 }}>{t.msg}</span></td>
      <td><StatusPill ok={t.status === 'Sent'}>{t.status}</StatusPill></td>
      <td>{t.planned}</td><td>{t.ok}</td><td>{t.fail}</td>
      <td>{t.creator}<br /><span style={{ color: 'var(--muted)', fontSize: 11 }}>{t.time}</span></td>
      <td><button className="btn-sm danger" onClick={() => { setTasks(prev => prev.filter(x => x !== list[i])); toast('Task deleted'); }}>Delete</button></td>
    </tr>
  ));

  return (
    <PagePad wide>
      <PageTitle title="Message Broadcast" sub="Send one announcement to many buyers — promos, restocks, holiday notices." />
      <SubTabs tabs={PLATFORM_TABS} active={tab} onChange={setTab} />
      <NoticeBar>
        {BROADCAST_QUOTA[plan] || BROADCAST_QUOTA.Free}{' '}
        <a style={{ cursor: 'pointer', fontWeight: 700 }} onClick={() => openPage('plans')}>View plans</a>
      </NoticeBar>
      <div className="toolbar-row">
        <select><option>Any status</option><option>Queued</option><option>Sent</option></select>
        <input type="text" placeholder="Search task name..." />
        <div className="spacer" />
        <button className="btn-sm primary" onClick={openEditor}>+ Add Task</button>
      </div>
      <DataTable
        columns={['Task', 'Status', 'Planned sends', 'Successful', 'Failed', 'Creator', 'Actions']}
        rows={rows}
        empty={`No broadcast tasks for ${tab} yet.`} />

      {editorOpen && (
        <FormDialog
          title={`New broadcast — ${tab}`}
          sub="This message goes to your recent buyers on this platform, within its messaging window rules."
          submitLabel="Queue broadcast"
          fields={[
            { key: 'name', label: 'Task name', placeholder: 'e.g. 7.7 Sale blast', required: true },
            { key: 'msg', label: 'Broadcast message', type: 'textarea', rows: 6, required: true,
              placeholder: 'e.g. 7.7 SALE is live! Everything ships within 24 hours this week only. Reply here if you have questions.' },
          ]}
          onClose={() => setEditorOpen(false)}
          onSubmit={addTask}
        />
      )}
    </PagePad>
  );
}

// ---------- Quick Reply ----------
export function QuickReply() {
  const { toast, logOp } = useApp();
  const [templates, setTemplates] = useLocal('quickreplies', []);
  const [tab, setTab] = useState(PLATFORM_TABS[0]);
  const [editor, setEditor] = useState(null); // null | {tpl?}

  function importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const items = JSON.parse(reader.result);
          if (!Array.isArray(items)) throw new Error('not a list');
          const valid = items.filter(it => it.shortcut && it.text)
            .map(it => ({ shortcut: String(it.shortcut), text: String(it.text), group: String(it.group || 'General') }));
          setTemplates(prev => [...prev, ...valid]);
          logOp(`Imported ${valid.length} quick replies`);
          toast(`Imported ${valid.length} quick repl${valid.length === 1 ? 'y' : 'ies'}`);
        } catch {
          toast('Import failed — expected a JSON list of {shortcut, text, group}');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  const rows = templates.map((t, i) => (
    <tr key={i}>
      <td><b>⚡ {t.shortcut}</b></td>
      <td>{t.text}</td>
      <td>{t.group}</td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="btn-sm" onClick={() => setEditor({ tpl: templates[i] })}>Edit</button>{' '}
        <button className="btn-sm danger" onClick={() => { setTemplates(prev => prev.filter((_, j) => j !== i)); toast('Template deleted'); }}>Delete</button>
      </td>
    </tr>
  ));

  return (
    <PagePad wide>
      <PageTitle title="Quick Reply"
        sub={'Canned responses your team inserts with one click — use {{buyer_name}}, {{order_id}}, {{tracking_no}} as variables.'} />
      <SubTabs tabs={PLATFORM_TABS} active={tab} onChange={setTab} />
      <div className="toolbar-row">
        <select><option>All groups</option><option>General</option><option>Shipping</option><option>Returns</option></select>
        <input type="text" placeholder="Search replies..." />
        <div className="spacer" />
        <button className="btn-sm" onClick={importJson}>Import</button>
        <button className="btn-sm" onClick={() => {
          if (!templates.length) { toast('Nothing to export yet'); return; }
          downloadFile('bilisops-quick-replies.json', JSON.stringify(templates, null, 2), 'application/json');
          toast('Quick replies exported');
        }}>Export</button>
        <button className="btn-sm primary" onClick={() => setEditor({})}>+ Add Reply</button>
      </div>
      <DataTable columns={['Shortcut', 'Reply content', 'Group', 'Actions']} rows={rows}
        empty='No quick replies yet. Click "+ Add Reply" to create your first template.' />

      {editor && (
        <FormDialog
          title={editor.tpl ? `Edit "${editor.tpl.shortcut}"` : 'New quick reply'}
          sub="Write the reply exactly as your agents should send it — one click inserts it into the chat composer."
          submitLabel={editor.tpl ? 'Save changes' : 'Add reply'}
          fields={[
            { key: 'shortcut', label: 'Shortcut name', placeholder: 'e.g. Welcome', required: true, value: editor.tpl?.shortcut },
            { key: 'group', label: 'Group', type: 'select', options: ['General', 'Shipping', 'Returns', 'Promos'], value: editor.tpl?.group },
            { key: 'text', label: 'Reply content', type: 'textarea', rows: 6, required: true, value: editor.tpl?.text,
              placeholder: 'e.g. Hi {buyer_name}! Thanks for your order {order_id} — it ships within 24 hours. Salamat po!',
              hint: 'Variables you can use: {buyer_name}, {order_id}, {tracking_no}' },
          ]}
          onClose={() => setEditor(null)}
          onSubmit={v => {
            if (editor.tpl) {
              setTemplates(prev => prev.map(x => x === editor.tpl ? { ...x, ...v } : x));
              toast('Template updated');
            } else {
              setTemplates(prev => [...prev, v]);
              logOp(`Added quick reply "${v.shortcut}"`);
              toast('Quick reply added');
            }
          }}
        />
      )}
    </PagePad>
  );
}

// ---------- Auto Reply ----------
const AUTOREPLY_TRIGGERS = ['First message (welcome)', 'Outside office hours', 'Keyword match', 'Every new conversation'];

export function AutoReply() {
  const { toast, logOp } = useApp();
  const [rules, setRules] = useLocal('autorules', []);
  const [tab, setTab] = useState(PLATFORM_TABS[0]);
  const [editor, setEditor] = useState(null); // null | {rule?} — open editor, optionally editing

  const list = rules.filter(r => r.platform === tab);
  const rows = list.map((r, i) => (
    <tr key={i}>
      <td>All {tab} stores</td>
      <td>
        <b>{r.template}</b>
        {r.message && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3, maxWidth: 420 }}>{r.message}</div>}
      </td>
      <td>{r.trigger || 'Instant'}</td>
      <td><StatusPill ok={r.status}>{r.status ? 'On' : 'Off'}</StatusPill></td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="btn-sm" onClick={() => setEditor({ rule: list[i] })}>Edit</button>{' '}
        <button className="btn-sm" onClick={() => {
          setRules(prev => prev.map(x => x === list[i] ? { ...x, status: !x.status } : x));
          toast(`${r.template} ${r.status ? 'disabled' : 'enabled'}`);
        }}>{r.status ? 'Disable' : 'Enable'}</button>{' '}
        <button className="btn-sm danger" onClick={() => {
          setRules(prev => prev.filter(x => x !== list[i]));
          toast('Rule deleted');
        }}>Delete</button>
      </td>
    </tr>
  ));

  return (
    <PagePad wide>
      <PageTitle title="Auto Reply" sub="Messages that fire on their own — welcomes, away notices, keyword triggers." />
      <SubTabs tabs={PLATFORM_TABS} active={tab} onChange={setTab} />
      <div className="toolbar-row">
        <select><option>All stores</option></select>
        <select><option>Any status</option><option>On</option><option>Off</option></select>
        <div className="spacer" />
        <button className="btn-sm primary" onClick={() => setEditor({})}>+ Add Rule</button>
      </div>
      <DataTable columns={['Store / Site', 'Rule', 'Trigger', 'Status', 'Actions']} rows={rows}
        empty={`No auto-reply rules for ${tab} yet. Add a welcome message or a keyword trigger.`} />

      {editor && (
        <FormDialog
          title={editor.rule ? 'Edit auto-reply rule' : `New auto-reply rule — ${tab}`}
          sub="Write the exact message buyers will receive. Keep it within the platform's messaging policy."
          submitLabel={editor.rule ? 'Save changes' : 'Create rule'}
          fields={[
            { key: 'template', label: 'Rule name', placeholder: 'e.g. Welcome message', required: true, value: editor.rule?.template },
            { key: 'trigger', label: 'Trigger', type: 'select', options: AUTOREPLY_TRIGGERS, value: editor.rule?.trigger },
            { key: 'message', label: 'Reply message', type: 'textarea', rows: 6, required: true, value: editor.rule?.message,
              placeholder: 'e.g. Hi! Thanks for messaging us. Our team replies within minutes during office hours (9AM-6PM). For orders, you can also type your order number.',
              hint: 'Variables you can use: {buyer_name}, {order_id}, {tracking_no}' },
          ]}
          onClose={() => setEditor(null)}
          onSubmit={v => {
            if (editor.rule) {
              setRules(prev => prev.map(x => x === editor.rule ? { ...x, ...v } : x));
              toast('Rule updated');
            } else {
              setRules(prev => [...prev, { platform: tab, status: true, ...v }]);
              logOp(`Added auto-reply rule "${v.template}" (${tab})`);
              toast('Auto-reply rule added');
            }
          }}
        />
      )}
    </PagePad>
  );
}

// ---------- Reply Review ----------
export function ReplyReview() {
  return (
    <PagePad wide>
      <PageTitle title="Reply Review" sub="Approve auto-replies and AI drafts before they reach buyers." />
      <DataTable
        columns={['Buyer', 'Platform', 'Draft reply', 'Source', 'Waiting since', 'Actions']}
        empty='Nothing waiting for review. Drafts appear here when "draft mode" is on for AI or auto-replies.' />
    </PagePad>
  );
}

// ---------- Important Reminders ----------
const REMINDER_ITEMS = [
  { t: 'Unreplied chat over 5 minutes', d: 'Ping the team when a buyer is left waiting.' },
  { t: 'Negative review posted', d: 'Alert immediately so you can respond while it matters.' },
  { t: 'Order pending payment > 24h', d: 'A nudge to send that payment reminder.' },
];

export function Reminders() {
  const { toast } = useApp();
  const [values, setValues] = useLocal('reminder_map', {});
  return (
    <PagePad>
      <PageTitle title="Important Reminders" sub="Never miss the moments that cost sales." />
      <FeatureToggleList items={REMINDER_ITEMS} values={values}
        onToggle={(t, v) => { setValues(prev => ({ ...prev, [t]: v })); toast(`${t} ${v ? 'on' : 'off'}`); }} />
    </PagePad>
  );
}
