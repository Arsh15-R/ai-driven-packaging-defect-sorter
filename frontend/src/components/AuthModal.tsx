import React, { useState } from 'react';
import { X, Lock, Mail, User, ShieldCheck, AlertTriangle, Sparkles } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-md apple-glass rounded-3xl shadow-2xl overflow-hidden border border-white/15">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">
              Inspector Authentication
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection (Segmented Pill Switcher) */}
        <div className="px-6 pt-4">
          <div className="bg-black/40 backdrop-blur-xl p-1 rounded-full border border-white/10 flex items-center">
            <button
              type="button"
              onClick={() => {
                setTab('signin');
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-all ${
                tab === 'signin'
                  ? 'bg-white/20 text-white shadow-sm border border-white/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('signup');
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-all ${
                tab === 'signup'
                  ? 'bg-white/20 text-white shadow-sm border border-white/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="auth-email-input"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                id="auth-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@company.com"
                className="apple-glass-input w-full pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-500 rounded-2xl"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="auth-password-input"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                id="auth-password-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="apple-glass-input w-full pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-500 rounded-2xl"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="apple-btn-primary w-full py-2.5 text-xs font-semibold shadow-lg"
          >
            {loading ? 'Authenticating...' : tab === 'signin' ? 'Sign In to VisionOS' : 'Create Account'}
          </button>

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={handleGuestLogin}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Continue as Local Guest Operator
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
