import React from 'react';
import { useApp } from '../state.jsx';
import { PagePad, PageTitle } from '../components.jsx';
import { PLANS, COMPARE_ROWS } from '../data.js';

export default function Plans() {
  const { plan, setPlan, addons, setAddons, toast, logOp } = useApp();

  function choose(p) {
    if (p.name === plan) { toast(`You're already on ${p.name}`); return; }
    setPlan(p.name);
    logOp(`Switched plan to ${p.name}`);
    toast(`${p.name} plan activated — welcome aboard! 🎉`);
  }

  function addAddon(name) {
    if (plan === 'Free') { toast('AI add-ons need a paid plan — pick one below first.'); return; }
    if (!addons.includes(name)) {
      setAddons(prev => [...prev, name]);
      logOp(`Purchased ${name} add-on`);
    }
    toast(`${name} added to your ${plan} plan 🎉`);
  }

  return (
    <PagePad>
      <PageTitle title="Plans & Billing" sub="Start free, upgrade when your chats outgrow it. Prices in PHP, cancel anytime." />

      <div className="addon-row">
        <div className="addon-card addon-a">
          <div className="addon-name">🤖 AI Assist Add-on</div>
          <div className="addon-price">₱3,990<span>/year</span></div>
          <ul className="addon-list">
            <li>Real AI reply drafts (✨ AI Draft) — you approve each send</li>
            <li>AI chat summaries on the Chat Dashboard</li>
            <li>Grounded in your catalog, rules, and knowledge pack</li>
          </ul>
          <button className="btn-sm" onClick={() => addAddon('AI Assist')}>
            {addons.includes('AI Assist') ? '✓ Added' : 'Add to plan'}
          </button>
        </div>
        <div className="addon-card addon-b">
          <div className="addon-name">🚀 AI Assist Pro Add-on</div>
          <div className="addon-price">₱5,990<span>/year</span></div>
          <ul className="addon-list">
            <li>Everything in AI Assist</li>
            <li>🤖 Full auto-reply — BilisBot answers buyers 24/7 on its own</li>
            <li>AI vs Agents reply tracking on the dashboard</li>
          </ul>
          <button className="btn-sm" onClick={() => addAddon('AI Assist Pro')}>
            {addons.includes('AI Assist Pro') ? '✓ Added' : 'Add to plan'}
          </button>
        </div>
      </div>

      <div className="plan-row">
        {PLANS.map(p => (
          <div key={p.name} className={`plan-card${p.recommended ? ' recommended' : ''}${p.name === plan ? ' current' : ''}`}>
            {p.name === plan
              ? <div className="plan-flag now">Current plan</div>
              : p.recommended && <div className="plan-flag">Recommended</div>}
            <h3>{p.name}</h3>
            <div className="p-seats">{p.seats}</div>
            <div className="p-price">{p.price}<span>{p.per}</span></div>
            <ul>{p.features.map(f => <li key={f}>{f}</li>)}</ul>
            <button className={`btn-sm ${p.name === plan ? '' : 'primary'}`} onClick={() => choose(p)}>
              {p.name === plan ? 'Current plan' : (p.name === 'Free' ? 'Downgrade' : 'Choose plan')}
            </button>
          </div>
        ))}
      </div>

      <h3 style={{ margin: '34px 0 14px' }}>Compare everything</h3>
      <div className="compare-wrap">
        <table className="compare-table">
          <tbody>
            <tr>
              <th>Feature</th>
              {PLANS.map(p => <th key={p.name}>{p.name}{p.name === plan ? ' ✦' : ''}</th>)}
            </tr>
            {COMPARE_ROWS.map((r, i) => r.cat ? (
              <tr key={i} className="cat-row"><td colSpan={6}>{r.cat}</td></tr>
            ) : (
              <tr key={i}>
                <td>{r.label}</td>
                {r.vals.map((v, j) => (
                  <td key={j} className={v === true ? 'check' : v === false ? 'dash' : ''}>
                    {v === true ? '✓' : v === false ? '—' : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PagePad>
  );
}
