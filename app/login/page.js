'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Authentication failed.');
      router.replace('/');
      router.refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="authPage">
      <section className="authCard">
        <div className="authLogo">S</div>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="authIntro">{mode === 'login' ? 'Log in to see your group expenses and balances.' : 'Create an account to keep your SplitSmart group private.'}</p>
        <form className="authForm" onSubmit={submit}>
          <label>Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="your_name" required /></label>
          <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required /></label>
          {error && <div className="authError" role="alert">{error}</div>}
          <button className="authSubmit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}</button>
        </form>
        <p className="authSwitch">{mode === 'login' ? 'No account yet?' : 'Already have an account?'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>{mode === 'login' ? 'Sign up' : 'Log in'}</button></p>
      </section>
    </main>
  );
}
