import React, { useState } from 'react';
import { CircleDot, Loader2 } from 'lucide-react';
import { useAuth } from './AuthContext';

/* AuthScreen — minimalist login/signup. Same dark canvas + dot grid +
   editorial serif title as the main app, so the transition into the
   authenticated experience feels seamless rather than like a separate
   product. Mobile-first: layout is centered and breathes well at 375px. */

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');     // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        const { user, session } = await signUp(email.trim(), password);
        // Supabase returns a session immediately if email confirmation is OFF;
        // otherwise the user must click the link in their inbox.
        if (user && !session) {
          setInfo('Check your inbox for a confirmation link, then sign in.');
          setMode('signin');
          setPassword('');
        }
      }
    } catch (err) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap');
        .auth-display { font-family: 'Fraunces', Georgia, serif; font-feature-settings: 'ss01'; }
        .auth-mono    { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .auth-grid::before {
          content: '';
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          opacity: 0.5;
          background-image: radial-gradient(circle, #262626 1px, transparent 1px);
          background-size: 24px 24px;
          mask-image: radial-gradient(circle at 50% 40%, black, transparent 70%);
          -webkit-mask-image: radial-gradient(circle at 50% 40%, black, transparent 70%);
        }
      `}</style>

      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6 auth-grid relative">
        {/* Crimson accent bar at top */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, #E11D48, transparent)' }}
        />

        <div className="relative w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-10">
            <div
              className="inline-flex h-12 w-12 rounded-xl items-center justify-center mb-5"
              style={{
                background: 'linear-gradient(135deg, #E11D48 0%, #881337 100%)',
                boxShadow: '0 0 40px rgba(225,29,72,0.45)',
              }}
            >
              <CircleDot size={20} className="text-white" />
            </div>
            <h1 className="auth-display text-5xl tracking-tight text-neutral-50 leading-none">
              Your New Life<span className="text-rose-600">.</span>
            </h1>
            <p className="auth-mono text-[11px] uppercase tracking-[0.25em] text-neutral-500 mt-3">
              Self-Development OS
            </p>
          </div>

          {/* Mode tabs */}
          <div className="flex bg-neutral-900 border border-neutral-800 rounded-md p-0.5 mb-6">
            {[
              { key: 'signin', label: 'Sign In' },
              { key: 'signup', label: 'Create Account' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => { setMode(tab.key); setError(''); setInfo(''); }}
                className={`flex-1 py-2 text-xs uppercase tracking-wider auth-mono rounded transition-colors
                  ${mode === tab.key
                    ? 'bg-rose-600 text-white'
                    : 'text-neutral-400 hover:text-neutral-200'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div>
              <label className="auth-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 block mb-1.5">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="you@example.com"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3.5 py-3 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-rose-600/50 focus:ring-1 focus:ring-rose-600/30 transition"
              />
            </div>
            <div>
              <label className="auth-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 block mb-1.5">
                Password
              </label>
              <input
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3.5 py-3 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-rose-600/50 focus:ring-1 focus:ring-rose-600/30 transition"
              />
            </div>

            {error && (
              <div className="text-xs text-rose-400 bg-rose-600/10 border border-rose-600/30 rounded px-3 py-2">
                {error}
              </div>
            )}
            {info && (
              <div className="text-xs text-emerald-400 bg-emerald-600/10 border border-emerald-600/30 rounded px-3 py-2">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="bg-rose-600 hover:bg-rose-500 disabled:bg-rose-800 disabled:cursor-not-allowed text-white py-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 mt-2"
              style={{ boxShadow: '0 4px 24px rgba(225,29,72,0.35)' }}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
                    : (mode === 'signin' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <p className="auth-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600 text-center mt-8">
            Discipline is freedom
          </p>
        </div>
      </div>
    </>
  );
}
