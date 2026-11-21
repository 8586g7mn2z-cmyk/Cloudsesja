import { useState } from 'react';
import { post } from '../lib/api';
import { useApp } from '../lib/store';
import { Input, Modal, Notice } from '../components/ui';

export function LoginPage() {
  const { setUser } = useApp();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post('/api/auth/login', { login, password });
      setUser(r.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={submit}>
        <h1>DIAGNOS</h1>
        <p className="muted small">Zaloguj się kontem operatora.</p>
        <div className="col mt12">
          <label className="small muted" htmlFor="login">Login</label>
          <Input id="login" autoFocus autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} />
          <label className="small muted" htmlFor="password">Hasło</label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <Notice kind="error">{error}</Notice>}
          <button className="btn primary mt8" disabled={busy || !login || !password} style={{ justifyContent: 'center' }}>
            {busy ? 'Logowanie…' : 'Zaloguj'}
          </button>
        </div>
      </form>
    </div>
  );
}

function PasswordFields({ onDone }: { onDone: () => void }) {
  const { toast } = useApp();
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    if (pw !== pw2) return setError('Hasła nie są identyczne.');
    try {
      await post('/api/auth/password', { current, password: pw });
      toast('Hasło zostało zmienione.');
      onDone();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return { save, ui: (
    <div className="col">
      <label className="small muted" htmlFor="pw-cur">Obecne hasło</label>
      <Input id="pw-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <label className="small muted" htmlFor="pw-new">Nowe hasło (min. 8 znaków, litery i cyfry)</label>
      <Input id="pw-new" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      <label className="small muted" htmlFor="pw-new2">Powtórz nowe hasło</label>
      <Input id="pw-new2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      {error && <Notice kind="error">{error}</Notice>}
    </div>
  ) } as any;
}

export function ChangePasswordPage() {
  const { user, setUser } = useApp();
  const f = PasswordFields({ onDone: () => setUser({ ...user!, must_change_password: 0 }) });
  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={(e) => (e.preventDefault(), f.save())}>
        <h1>Zmiana hasła startowego</h1>
        <p className="muted small">Przed rozpoczęciem pracy ustaw własne hasło dla konta „{user?.login}”.</p>
        <div className="mt12">{f.ui}</div>
        <button className="btn primary mt12" style={{ justifyContent: 'center', width: '100%' }}>Zmień hasło</button>
        <button type="button" className="btn ghost mt8" style={{ width: '100%', justifyContent: 'center' }} onClick={() => post('/api/auth/logout').finally(() => setUser(null))}>Wyloguj</button>
      </form>
    </div>
  );
}

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const f = PasswordFields({ onDone: onClose });
  return (
    <Modal title="Zmiana hasła" onClose={onClose} width={420} onSubmit={() => f.save()} footer={<><button type="button" className="btn" onClick={onClose}>Anuluj</button><button className="btn primary">Zmień hasło</button></>}>
      {f.ui}
    </Modal>
  );
}
