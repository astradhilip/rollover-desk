'use client';

import { Button, TextField } from '@rollover-desk/ui-web';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export default function SignInPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
      });
      if (response.ok) {
        router.replace('/');
        router.refresh();
        return;
      }
      if (response.status === 429) setError('Too many attempts. Wait 15 minutes and try again.');
      else if (response.status === 400 || response.status === 401)
        setError('That email and password don’t match.');
      else setError('Sign-in isn’t available right now. Try again shortly.');
    } catch {
      setError('The server could not be reached. Check your connection and try again.');
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-tile">
        <h1 className="text-h1-sm font-semibold tracking-tight text-ink">Rollover Desk</h1>
        <p className="mt-1 mb-5 text-base text-muted">Sign in to review rent rolls and rollover risk.</p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <TextField label="Email" name="email" type="email" autoComplete="username" required />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {error ? (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Signing in' : 'Sign in'}
          </Button>
        </form>
      </div>
    </main>
  );
}
