import React, { useState, useEffect, useRef } from 'react';
import { useToast, useApp } from './state.jsx';
import { PlatformLogo } from './brand.jsx';

export function PagePad({ wide, narrow, children }) {
  const style = wide ? { maxWidth: 'none' } : narrow ? { maxWidth: narrow } : undefined;
  return <div className="page-pad" style={style}>{children}</div>;
}

export function PageTitle({ title, sub }) {
  return (
    <>
      <h2 className="page-title">{title}</h2>
      {sub && <p className="page-sub">{sub}</p>}
    </>
  );
}

export function SubTabs({ tabs, active, onChange }) {
  return (
    <div className="subtabs">
      {tabs.map(t => (
        <div key={t} className={`subtab${t === active ? ' active' : ''}`} onClick={() => onChange(t)}>{t}</div>
      ))}
    </div>
  );
}

export function DataTable({ columns, rows, empty }) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <tbody>
          <tr>{columns.map(c => <th key={c}>{c}</th>)}</tr>
          {rows && rows.length ? rows : (
            <tr>
              <td colSpan={columns.length}>
                <div className="table-empty"><div className="big">📭</div>{empty}</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function StatusPill({ ok, children }) {
  return <span className={`status-pill ${ok ? 'ok' : 'off'}`}>{children}</span>;
}

export function Toggle({ checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track" />
    </label>
  );
}

export function FeatureToggleList({ items, values, onToggle }) {
  return (
    <div className="card-list">
      {items.map(it => (
        <div key={it.t} className="feature-card">
          <div className="fc-main">
            <div className="fc-title">{it.t}</div>
            <div className="fc-sub">{it.d}</div>
          </div>
          <Toggle checked={!!values[it.t]} onChange={v => onToggle(it.t, v)} />
        </div>
      ))}
    </div>
  );
}

export function StatTileRow({ tiles }) {
  return (
    <div className="stat-tile-row">
      {tiles.map((t, i) => (
        <div key={i} className="stat-tile">
          <div className="lbl">{t.lbl}</div>
          <div className="num">{t.num}</div>
          {t.cmp && <div className="cmp">{t.cmp}</div>}
        </div>
      ))}
    </div>
  );
}

export function chartLabels(mode) {
  const labels = [];
  if (mode === 'week') {
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      labels.push(`Wk of ${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
  } else if (mode === 'month') {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      labels.push(names[d.getMonth()]);
    }
  } else {
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - 1 - i);
      labels.push(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
  }
  return labels;
}

// Line chart for real data. `labels`: x labels; `series`: [{color, values}].
// With no data (or all zeros) it renders a flat baseline — honest empty state.
export function SeriesChart({ labels, series }) {
  const w = 760, h = 200, left = 38, right = 16, top = 14, bottom = 26;
  const plotW = w - left - right, plotH = h - top - bottom;
  const baseY = top + plotH;
  const n = Math.max(1, labels.length - 1);
  const x = i => left + (plotW / n) * i;
  const maxVal = Math.max(1, ...series.flatMap(s => s.values));
  const yFor = v => baseY - (v / maxVal) * plotH;
  const gridYs = [0, 1, 2, 3, 4].map(i => top + (plotH / 4) * i);
  // thin x labels when crowded
  const step = Math.ceil(labels.length / 10);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {gridYs.map((y, i) => (
        <g key={i}>
          <line x1={left} y1={y} x2={left + plotW} y2={y} stroke="var(--border)" strokeWidth="1" />
          <text x={left - 8} y={y + 4} fontSize="10" fill="var(--muted)" textAnchor="end">
            {Math.round(maxVal * (1 - i * 0.25))}
          </text>
        </g>
      ))}
      {labels.map((lb, i) => (i % step === 0 ? (
        <text key={lb + i} x={x(i)} y={h - 8} fontSize="10" fill="var(--muted)" textAnchor="middle">{lb}</text>
      ) : null))}
      {series.map((s, si) => (
        <g key={si}>
          <polyline points={s.values.map((v, i) => `${x(i)},${yFor(v)}`).join(' ')}
            fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
          {s.values.length <= 16 && s.values.map((v, i) => (
            <circle key={i} cx={x(i)} cy={yFor(v)} r="3" fill="var(--panel)" stroke={s.color} strokeWidth="2" />
          ))}
        </g>
      ))}
    </svg>
  );
}

export function ZeroChart({ mode = 'day' }) {
  const labels = chartLabels(mode);
  return <SeriesChart labels={labels} series={[{ color: '#f97316', values: labels.map(() => 0) }]} />;
}

export function ChartCard({ legend, mode, labels, series }) {
  return (
    <div className="chart-card">
      <div className="chart-legend">
        {legend.map(l => (
          <span key={l.label}><span className="key" style={{ background: l.color }} />{l.label}</span>
        ))}
      </div>
      {labels && series ? <SeriesChart labels={labels} series={series} /> : <ZeroChart mode={mode} />}
    </div>
  );
}

// Aggregate the server's daily stats into chart-ready labels + values.
// range: 'day' (last 7 daily) | 'week' (6 weekly sums) | 'month' (3 monthly sums)
export function aggregateDaily(daily, range, fields) {
  if (!daily?.length) return null;
  const take = (arr, from) => arr.slice(Math.max(0, from));
  if (range === 'week') {
    const weeks = [];
    for (let w = 5; w >= 0; w--) {
      const chunk = daily.slice(Math.max(0, daily.length - (w + 1) * 7), daily.length - w * 7);
      if (chunk.length) weeks.push(chunk);
    }
    return {
      labels: weeks.map(c => `Wk of ${c[0].date.slice(5)}`),
      values: fields.map(f => weeks.map(c => c.reduce((s, d) => s + d[f], 0))),
    };
  }
  if (range === 'month') {
    const byMonth = {};
    daily.forEach(d => {
      const m = d.date.slice(0, 7);
      byMonth[m] = byMonth[m] || [];
      byMonth[m].push(d);
    });
    const months = Object.keys(byMonth).sort().slice(-3);
    return {
      labels: months,
      values: fields.map(f => months.map(m => byMonth[m].reduce((s, d) => s + d[f], 0))),
    };
  }
  const last7 = take(daily, daily.length - 7);
  return {
    labels: last7.map(d => d.date.slice(5)),
    values: fields.map(f => last7.map(d => d[f])),
  };
}

export function RangeChips({ options, active, onChange }) {
  return (
    <div className="range-row" style={{ margin: 0 }}>
      {options.map(o => (
        <button key={o} className={`btn-sm${o === active ? ' active' : ''}`} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
}

export function LockedPage({ title, copy, primaryLabel, onPrimary }) {
  const toast = useToast();
  return (
    <div className="locked-page">
      <div className="big">🔒</div>
      <h2>{title}</h2>
      <p>{copy}</p>
      <div className="btns">
        <button className="btn-sm primary" onClick={onPrimary}>{primaryLabel}</button>
        <button className="btn-sm" onClick={() => toast('Support will reach out shortly!')}>Talk to support</button>
      </div>
      <div className="locked-preview">A preview of these insights unlocks the moment you upgrade — charts, breakdowns, and per-store drilldowns.</div>
    </div>
  );
}

export function NoticeBar({ info, children }) {
  return <div className={`notice-bar${info ? ' info' : ''}`}>{children}</div>;
}

// Simple prompt-based add flows reused across pages
export function useRangeState(initial = 'Day') {
  const [range, setRange] = useState(initial);
  return { range, setRange, mode: range.toLowerCase() };
}

// ---------- StoreFilter — multi-select store scope for every dashboard ----------
export function StoreFilter() {
  const { stores, statStores, setStatStores } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const toggle = (id) => setStatStores(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const label = !statStores.length
    ? 'All stores'
    : statStores.length === 1
      ? (() => { const s = stores.find(x => x.id === statStores[0]); return s ? (s.nickname || s.name) : '1 store'; })()
      : `${statStores.length} stores`;

  return (
    <div className="storefilter" ref={ref}>
      <button className={`btn-sm${statStores.length ? ' active' : ''}`} onClick={() => setOpen(o => !o)}>
        <i className="ti ti-building-store" aria-hidden="true" style={{ marginRight: 5 }} />
        {label} <span className="sf-caret">▾</span>
      </button>
      {open && (
        <div className="sf-panel">
          <div className={`sf-item${!statStores.length ? ' checked' : ''}`} onClick={() => setStatStores([])}>
            <span className="sf-ic"><i className="ti ti-building-store" aria-hidden="true" /></span>
            <span className="sf-name">All stores</span>
            {!statStores.length && <span className="sf-check">✓</span>}
          </div>
          <div className="sf-sep" />
          {!stores.length && <div className="sf-empty">No stores connected yet.</div>}
          {stores.map(s => {
            const on = statStores.includes(s.id);
            return (
              <div key={s.id} className={`sf-item${on ? ' checked' : ''}`} onClick={() => toggle(s.id)}>
                <span className="sf-ic"><PlatformLogo k={s.key} size={13} title={s.platform} /></span>
                <span className="sf-name">{s.nickname || s.name}</span>
                {on && <span className="sf-check">✓</span>}
              </div>
            );
          })}
          {stores.length > 1 && (
            <div className="sf-hint">Tick several stores to combine them.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- SplitCard — metric with AI / Agents / Joint handler breakdown ----------
const HANDLERS = [
  ['ai', '🤖 AI'],
  ['human', '👤 Agents'],
  ['joint', '🤝 Joint'],
];

export function SplitCard({ title, total, get, suffix = '' }) {
  return (
    <div className="split-card">
      <div className="sc-title">{title}</div>
      <div className="sc-val">{total}</div>
      <div className="sc-rows">
        {HANDLERS.map(([k, label]) => (
          <div className="sc-row" key={k}>
            <span className={`sc-h ${k}`}>{label}</span>
            <span className="sc-n">{get(k)}{suffix && get(k) !== '—' ? suffix : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- FormDialog — the white editor used by every "Add / Edit" button ----------
// fields: [{ key, label, type: 'text'|'textarea'|'select', placeholder, options,
//            rows, required, value, hint }]
export function FormDialog({ title, sub, fields, submitLabel = 'Save', onSubmit, onClose }) {
  const optValue = o => (o && typeof o === 'object' ? o.value : o);
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map(f => [f.key, f.value ?? (f.type === 'select' ? (optValue(f.options?.[0]) ?? '') : '')])));
  const [errs, setErrs] = useState({});

  function set(key, v) {
    setValues(prev => ({ ...prev, [key]: v }));
  }

  function submit(e) {
    e?.preventDefault();
    const bad = {};
    fields.forEach(f => { if (f.required && !String(values[f.key]).trim()) bad[f.key] = true; });
    setErrs(bad);
    if (Object.keys(bad).length) return;
    onSubmit(values);
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal-card modal-lg" onMouseDown={e => e.stopPropagation()} onSubmit={submit}>
        <h3>{title}</h3>
        {sub && <p className="dialog-sub">{sub}</p>}
        {fields.map((f, i) => (
          <div className="field" key={f.key}>
            <label>{f.label}{f.required ? ' *' : ''}</label>
            {f.type === 'textarea' ? (
              <textarea
                rows={f.rows || 5}
                placeholder={f.placeholder}
                value={values[f.key]}
                autoFocus={i === 0}
                onChange={e => set(f.key, e.target.value)}
              />
            ) : f.type === 'select' ? (
              <select value={values[f.key]} onChange={e => set(f.key, e.target.value)}>
                {(f.options || []).map(o => {
                  const v = optValue(o);
                  return <option key={v} value={v}>{o && typeof o === 'object' ? o.label : o}</option>;
                })}
              </select>
            ) : (
              <input
                type="text"
                placeholder={f.placeholder}
                value={values[f.key]}
                autoFocus={i === 0}
                onChange={e => set(f.key, e.target.value)}
              />
            )}
            {f.hint && <div className="dialog-hint">{f.hint}</div>}
            {errs[f.key] && <div className="field-error">This field is required.</div>}
          </div>
        ))}
        <div className="modal-actions">
          <button type="button" className="btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-sm primary">{submitLabel}</button>
        </div>
      </form>
    </div>
  );
}
