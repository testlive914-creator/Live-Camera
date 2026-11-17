import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/supabase';
import { Video, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react';

export const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await authService.loginWithEmail(email || 'admin@liveselfie.connect');
      if (res.simulated) {
        navigate('/admin/dashboard');
      } else if (res.error) {
        setMessage(res.error.message);
      } else {
        setMessage('Magic login link sent to your email.');
      }
    } catch (err: any) {
      setMessage(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDevBypass = () => {
    authService.loginWithEmail('admin@liveselfie.local');
    navigate('/admin/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-[#111827] border border-gray-800 rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white mx-auto shadow-lg shadow-blue-500/20">
            <Video className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Live Selfie <span className="text-blue-500">Connect</span>
          </h1>
          <p className="text-xs text-gray-400">
            Private Admin Dashboard • Free Architecture
          </p>
        </div>

        {message && (
          <div className="p-3 bg-blue-950/40 border border-blue-800/50 rounded-lg text-xs text-blue-300 text-center">
            {message}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Admin Email
            </label>
            <input
              type="email"
              placeholder="admin@liveselfie.connect"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#0B0F19] border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center space-x-2"
          >
            <span>{loading ? 'Signing in...' : 'Sign In as Admin'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="relative flex py-2 items-center">
          <div className="flex-grow border-t border-gray-800"></div>
          <span className="flex-shrink mx-4 text-gray-500 text-[11px] uppercase">Quick Access</span>
          <div className="flex-grow border-t border-gray-800"></div>
        </div>

        <button
          type="button"
          onClick={handleDevBypass}
          className="w-full py-2.5 px-4 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-xl border border-gray-700 transition-colors flex items-center justify-center space-x-2"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>Enter Dashboard (Development Preview)</span>
        </button>

        <div className="pt-2 text-center">
          <div className="inline-flex items-center space-x-1.5 text-[11px] text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Strict Consent Architecture: Video Only, No Mic</span>
          </div>
        </div>
      </div>
    </div>
  );
};
