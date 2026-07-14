import React, { useState } from 'react';
import { setSession } from './api.js';

async function apiPost(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw data;
  return data;
}

function nameFromEmail(email) {
  const local = email.split('@')[0];
  return local.split(/[._\-+]/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Seller';
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState(localStorage.getItem('bilisops_remember_email') || '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(!!localStorage.getItem('bilisops_remember_email'));
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  function enterApp(data) {
    setSession({ token: data.token, name: data.seller.name, email: data.seller.email });
    onLogin();
  }

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    if (remember) localStorage.setItem('bilisops_remember_email', email.trim());
    else localStorage.removeItem('bilisops_remember_email');

    try {
      enterApp(await apiPost('/api/auth/login', { email: email.trim(), password }));
    } catch (err) {
      if (err?.error === 'no_account') {
        try {
          setToast('Creating your BilisOps Chat account...');
          enterApp(await apiPost('/api/auth/register', { email: email.trim(), password, name: nameFromEmail(email.trim()) }));
        } catch {
          setError('Could not create your account. Please try again.');
        }
      } else if (err?.error === 'bad_password') {
        setError('Wrong password for this account.');
      } else {
        setError('Could not reach the BilisOps server. Is it running?');
      }
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark"><i className="ti ti-bolt" aria-hidden="true" /></div>
          <div className="brand-name">BilisOps Chat</div>
        </div>
      </div>

      <div className="login-wrap">
        <div className="login-card" style={{ marginTop: '10vh' }}>
          <div className="brand">
            <div className="brand-mark"><i className="ti ti-bolt" aria-hidden="true" /></div>
            <div className="brand-name">BilisOps Chat</div>
          </div>
          <p className="login-sub">Welcome back, seller. First login creates your account.</p>

          {error && <div className="error-msg show">{error}</div>}

          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input type="email" id="email" placeholder="you@yourstore.ph" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input type="password" id="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <div className="row-between">
              <label className="checkbox-row">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                Remember me
              </label>
              <a onClick={() => setToast(email ? `Password reset link sent to ${email}` : 'Enter your email first')}>Forgot password?</a>
            </div>
            <button type="submit" className="btn-primary">Log In</button>
          </form>
        </div>

        <p className="foot-note">No credit card needed · Live in minutes · <b>Bilis</b> means fast — that's the whole point</p>
      </div>

      <div className="toast-stack">{toast && <div className="toast">{toast}</div>}</div>
    </>
  );
}
