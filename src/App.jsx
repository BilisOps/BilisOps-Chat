import React, { useState } from 'react';
import { getSession, setSession, api } from './api.js';
import { AppProvider } from './state.jsx';
import Login from './Login.jsx';
import Workspace from './Workspace.jsx';

export default function App() {
  const [authed, setAuthed] = useState(() => !!getSession()?.token);

  function logout() {
    api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setSession(null);
    setAuthed(false);
  }

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <AppProvider onLogout={logout}>
      <Workspace />
    </AppProvider>
  );
}
