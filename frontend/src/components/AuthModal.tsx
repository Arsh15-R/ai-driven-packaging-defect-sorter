import React, { useState } from 'react';
import { X, Lock, Mail, User, ShieldCheck, AlertTriangle } from 'lucide-react';
import { signIn, signUp, isSupabaseConfigured } from '../supabaseClient';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (userEmail: string, userId: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthSuccess }) => {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const configured = isSupabaseConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      if (tab === 'signin') {
        const { user, error } = await signIn(email, password);
        if (error) {
          setErrorMsg(error.message);
        } else if (user) {
          onAuthSuccess(user.email || email, user.id);
          onClose();
        }
      } else {
        const { user, error } = await signUp(email, password);
        if (error) {
          setErrorMsg(error.message);
        } else if (user) {
          onAuthSuccess(user.email || email, user.id);
          onClose();
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication error.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = () => {
    onAuthSuccess('guest.inspector@factory.local', 'guest-local-user');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md flat-panel bg-[#0d121f] border border-[#1e2638] shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2638] bg-[#0a0e19]">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#3b82f6]" />
            <span className="font-mono text-sm font-bold tracking-wider text-slate-100">
              INSPECTOR AUTHENTICATION
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-[#1e2638] bg-[#0d121f]">
          <button
            type="button"
            onClick={() => { setTab('signin'); setErrorMsg(null); }}
            className={`flex-1 py-3 text-xs font-mono font-bold tracking-wider text-center transition-colors border-b-2 ${
              tab === 'signin'
                ? 'border-[#3b82f6] text-[#3b82f6] bg-[#111728]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            SIGN IN
          </button>
          <button
            type="button"
            onClick={() => { setTab('signup'); setErrorMsg(null); }}
            className={`flex-1 py-3 text-xs font-mono font-bold tracking-wider text-center transition-colors border-b-2 ${
              tab === 'signup'
                ? 'border-[#3b82f6] text-[#3b82f6] bg-[#111728]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            CREATE ACCOUNT
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {!configured && (
            <div className="flat-well p-3 border border-[#f59e0b]/40 text-amber-200 text-xs font-mono flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-amber-300">Supabase Environment Unset</div>
                <div className="text-[11px] text-amber-200/80 mt-0.5 leading-relaxed">
                  Provide <code className="text-amber-100">VITE_SUPABASE_URL</code> and{' '}
                  <code className="text-amber-100">VITE_SUPABASE_ANON_KEY</code> in{' '}
                  <code className="text-amber-100">frontend/.env</code> to connect cloud authentication.
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-[#2d0f12] border border-[#ef4444] text-[#fca5a5] text-xs font-mono">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-slate-300 uppercase tracking-wider mb-1.5">
                Inspector Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@manufacturing.line"
                  required
                  className="w-full bg-[#080b12] border border-[#1e2638] focus:border-[#3b82f6] focus:outline-none pl-9 pr-3 py-2 text-sm text-slate-100 font-mono placeholder:text-slate-600 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  minLength={6}
                  className="w-full bg-[#080b12] border border-[#1e2638] focus:border-[#3b82f6] focus:outline-none pl-9 pr-3 py-2 text-sm text-slate-100 font-mono placeholder:text-slate-600 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-mono font-bold text-xs uppercase tracking-wider border border-[#3b82f6] transition-colors disabled:opacity-50"
            >
              {loading ? 'AUTHENTICATING...' : tab === 'signin' ? 'AUTHENTICATE SESSION' : 'REGISTER INSPECTOR'}
            </button>
          </form>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-[#1e2638]"></div>
            <span className="flex-shrink mx-3 text-[10px] font-mono uppercase text-slate-500">or</span>
            <div className="flex-grow border-t border-[#1e2638]"></div>
          </div>

          <button
            type="button"
            onClick={handleGuestLogin}
            className="w-full py-2 px-3 bg-[#111728] hover:bg-[#162035] text-slate-300 hover:text-white font-mono text-xs border border-[#1e2638] transition-colors flex items-center justify-center gap-2"
          >
            <User className="w-3.5 h-3.5" />
            <span>CONTINUE AS GUEST INSPECTOR</span>
          </button>
        </div>
      </div>
    </div>
  );
};
