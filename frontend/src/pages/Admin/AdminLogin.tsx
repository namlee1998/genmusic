import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminStore } from '@/store/useAdminStore';

export function AdminLogin() {
  const login = useAdminStore((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/admin/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden font-sans">
      {/* Background glow effects */}
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[10%] w-[500px] h-[500px] rounded-full bg-secondary/5 blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm bg-surface-container border border-outline-variant rounded shadow-xl p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-bold text-white tracking-tight font-headline">Admin Login</h1>
          <div className="px-2.5 py-0.5 rounded border border-secondary/30 bg-secondary/10 text-secondary text-[10px] font-bold tracking-wider uppercase font-label-mono">
            Secure
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase font-label-mono tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@aidlc.ai"
              className="w-full h-10 px-3 bg-[#050505] border border-outline-variant rounded text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:border-secondary focus:ring-1 focus:ring-secondary/40 outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase font-label-mono tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full h-10 px-3 bg-[#050505] border border-outline-variant rounded text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:border-secondary focus:ring-1 focus:ring-secondary/40 outline-none transition-colors"
            />
          </div>
          
          {error && (
            <div className="p-3 text-xs text-error bg-error/10 rounded border border-error/20">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 text-xs font-semibold bg-primary hover:opacity-95 text-on-primary rounded shadow-[0_0_10px_rgba(99,102,241,0.2)] transition-all disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div 
          className="mt-6 p-4 rounded border border-primary/20 bg-surface-container-high/30 hover:border-primary/40 cursor-pointer transition-all group"
          onClick={() => {
            setEmail('admin@aidlc.ai');
            setPassword('admin123');
          }}
        >
          <p className="text-[9px] font-label-mono text-on-surface-variant/80 tracking-wider mb-2 uppercase">Demo Admin - Click to Autofill</p>
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-[9px] font-label-mono text-primary uppercase">ADMIN</span>
            <span className="text-xs font-mono text-on-surface-variant group-hover:text-white transition-colors">admin@aidlc.ai / admin123</span>
          </div>
        </div>
      </div>
    </div>
  );
}
