import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthActions } from '@/hooks/useAuthActions';
import { PASSWORD_RECOVERY_FLOW_KEY, useAuthStore } from '@/store/useAuthStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, Eye, EyeOff, Github } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

type AuthMode =
  | 'signin'
  | 'signup'
  | 'success'
  | 'forgot-password'
  | 'reset-sent'
  | 'update-password';

const getFriendlyAuthError = (err: any, fallback: string) => {
  const raw = err?.response?.data?.message || err?.message || fallback;
  const normalized = String(raw).toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'Email hoặc mật khẩu chưa đúng. Vui lòng thử lại.';
  }
  if (normalized.includes('email not confirmed') || normalized.includes('confirm')) {
    return 'Tài khoản chưa xác thực email. Vui lòng kiểm tra hộp thư và xác thực trước khi đăng nhập.';
  }
  if (normalized.includes('network') || normalized.includes('failed to fetch')) {
    return 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.';
  }
  if (normalized.includes('expired') || normalized.includes('invalid token')) {
    return 'Liên kết đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu lại.';
  }
  if (normalized.includes('password should be')) {
    return 'Mật khẩu chưa đáp ứng chính sách bảo mật. Vui lòng thử mật khẩu mạnh hơn.';
  }

  return raw;
};

export function AuthPage() {
  const navigate = useNavigate();
  const authActions = useAuthActions();
  const { session, setSession, signOut } = useAuthStore();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    const isRecoveryFlow = sessionStorage.getItem(PASSWORD_RECOVERY_FLOW_KEY) === '1';
    if (!session) return;

    if (isRecoveryFlow) {
      setMode('update-password');
      setNotice('Bạn đang ở chế độ khôi phục mật khẩu. Hãy đặt mật khẩu mới để tiếp tục.');
      return;
    }

    navigate('/sdlc');
  }, [session, navigate]);

  useEffect(() => {
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/[0-9]/.test(password)) strength += 25;
    if (/[^A-Za-z0-9]/.test(password)) strength += 25;
    setPasswordStrength(strength);
  }, [password]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === 'signup') {
        const result = await authActions.signUpWithEmail({
          email,
          password,
          company_name: companyName || undefined,
          company_email: companyEmail || undefined,
          job_title: jobTitle || undefined,
          redirect_to: `${window.location.origin}/auth`,
        });
        if (result.session) {
          setSession(result.session);
          navigate('/sdlc');
        } else {
          setMode('success');
        }
      } else {
        const result = await authActions.signInWithEmail({ email, password });
        if (!result.session) throw new Error('No active session returned');
        setSession(result.session);
        navigate('/sdlc');
      }
    } catch (err: any) {
      setError(getFriendlyAuthError(err, 'Authentication failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSocialAuth = async (provider: 'google' | 'github') => {
    try {
      setLoading(true);
      setError(null);
      const { url } = await authActions.getOAuthUrl({
        provider,
        redirect_to: `${window.location.origin}/auth`,
      });
      if (!url) throw new Error('OAuth URL is not available');
      window.location.href = url;
    } catch (err: any) {
      setError(getFriendlyAuthError(err, `Failed to authenticate with ${provider}`));
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      await authActions.requestPasswordReset({
        email,
        redirect_to: `${window.location.origin}/auth`,
      });
      setMode('reset-sent');
    } catch (err: any) {
      setError(getFriendlyAuthError(err, 'Không thể gửi email khôi phục mật khẩu'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    if (!newPassword || newPassword.length < 8) {
      setError('Mật khẩu mới cần ít nhất 8 ký tự.');
      setLoading(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      setLoading(false);
      return;
    }

    try {
      await authActions.updatePassword({ password: newPassword });
      await signOut();
      sessionStorage.removeItem(PASSWORD_RECOVERY_FLOW_KEY);
      setMode('signin');
      setNotice('Mật khẩu đã được cập nhật. Bạn có thể đăng nhập bằng mật khẩu mới.');
      setNewPassword('');
      setConfirmPassword('');
      setPassword('');
    } catch (err: any) {
      setError(getFriendlyAuthError(err, 'Không thể cập nhật mật khẩu'));
    } finally {
      setLoading(false);
    }
  };

  const resetToSignIn = async () => {
    sessionStorage.removeItem(PASSWORD_RECOVERY_FLOW_KEY);
    if (session) {
      await signOut();
    }
    setMode('signin');
    setError(null);
  };

  if (mode === 'success' || mode === 'reset-sent') {
    const isResetSent = mode === 'reset-sent';
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-surface-container border border-outline-variant rounded shadow-xl p-8 text-center space-y-6"
        >
          <div className="w-16 h-16 bg-primary/10 text-primary border border-primary/30 rounded flex items-center justify-center mx-auto shadow-[0_0_15px_rgba(99,102,241,0.15)]">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-xl font-bold text-white">
            {isResetSent ? 'Check your inbox' : 'Registration Successful'}
          </h2>
          <p className="text-xs text-on-surface-variant/80">
            {isResetSent
              ? 'We sent a password recovery link. Please open your email and follow the instructions.'
              : 'Please check your email to verify your account before signing in.'}
          </p>
          <button className="w-full h-11 bg-primary hover:opacity-90 text-on-primary text-xs font-semibold rounded shadow-[0_0_10px_rgba(99,102,241,0.2)] transition-all" onClick={() => setMode('signin')}>
            Back to Sign In
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex overflow-hidden font-sans">
      {/* Left Column */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:flex-none lg:w-[480px] xl:w-[540px] bg-background z-10 relative border-r border-outline-variant">
        <div className="mx-auto w-full max-w-sm py-12 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Logo area matching screenshot */}
            <div className="flex justify-between items-center mb-16">
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold text-white tracking-wide">AIDLC Platform</span>
              </div>
              <div className="px-3 py-1 rounded border border-secondary/30 bg-secondary/10 text-secondary text-xs font-bold tracking-wider uppercase">
                Demo
              </div>
            </div>

            <h2 className="text-[32px] font-bold tracking-tight text-white mb-2 leading-tight">
              {mode === 'signin' && 'Welcome back'}
              {mode === 'signup' && 'Create an account'}
              {mode === 'forgot-password' && 'Reset password'}
              {mode === 'update-password' && 'Set new password'}
            </h2>

            {(mode === 'signin' || mode === 'signup') && (
              <p className="text-xs text-on-surface-variant mb-8">
                {mode === 'signin' ? 'Sign in to access the Autonomous Software Factory' : 'Sign up to access the Autonomous Software Factory'}
              </p>
            )}

            {mode === 'forgot-password' && (
              <p className="text-xs text-on-surface-variant mb-8">
                Enter your account email and we will send you a recovery link.
              </p>
            )}
          </motion.div>

          <div className="mt-8">
            {(mode === 'signin' || mode === 'signup') && (
              <form onSubmit={handleEmailAuth} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase font-label-mono tracking-wider">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@aidlc.ai"
                    autoComplete="email"
                    className="w-full h-10 px-3 bg-[#050505] border border-outline-variant rounded text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:border-secondary focus:ring-1 focus:ring-secondary/40 outline-none transition-colors"
                  />
                </div>

                <div className="relative group">
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-semibold text-on-surface-variant uppercase font-label-mono tracking-wider">Password</label>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    className="w-full h-10 pl-3 pr-10 bg-[#050505] border border-outline-variant rounded text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:border-secondary focus:ring-1 focus:ring-secondary/40 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-[30px] text-on-surface-variant hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {notice && (
                  <div className="p-3 text-xs text-primary bg-primary/10 rounded border border-primary/20">
                    {notice}
                  </div>
                )}
                {error && (
                  <div className="p-3 text-xs text-error bg-error/10 rounded border border-error/20">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full h-11 text-xs font-semibold bg-primary hover:opacity-95 text-on-primary rounded shadow-[0_0_10px_rgba(99,102,241,0.2)] transition-all"
                  disabled={loading}
                >
                  {loading ? 'Processing...' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              </form>
            )}

            {mode === 'forgot-password' && (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase font-label-mono tracking-wider">Account Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@aidlc.ai"
                    autoComplete="email"
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
                  className="w-full h-11 text-xs font-semibold bg-primary hover:opacity-95 text-on-primary rounded shadow-[0_0_10px_rgba(99,102,241,0.2)] transition-all"
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
                <button
                  type="button"
                  className="w-full text-xs text-on-surface-variant hover:text-white transition-colors mt-4"
                  onClick={() => setMode('signin')}
                >
                  Back to sign in
                </button>
              </form>
            )}

            {mode === 'update-password' && (
              <form onSubmit={handleUpdatePassword} className="space-y-5">
                 <div className="relative group">
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase font-label-mono tracking-wider">New Password</label>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full h-10 pl-3 pr-10 bg-[#050505] border border-outline-variant rounded text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:border-secondary focus:ring-1 focus:ring-secondary/40 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-[30px] text-on-surface-variant hover:text-white transition-colors"
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase font-label-mono tracking-wider">Confirm New Password</label>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
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
                  className="w-full h-11 text-xs font-semibold bg-primary hover:opacity-95 text-on-primary rounded shadow-[0_0_10px_rgba(99,102,241,0.2)] transition-all"
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update password'}
                </button>
                <button
                  type="button"
                  className="w-full text-xs text-on-surface-variant hover:text-white transition-colors mt-4"
                  onClick={resetToSignIn}
                >
                  Cancel and return to sign in
                </button>
              </form>
            )}

            {/* Demo Account Autofill Card */}
            {(mode === 'signin') && (
              <div 
                className="mt-8 p-4 rounded border border-primary/20 bg-surface-container hover:border-primary/40 cursor-pointer transition-all group"
                onClick={() => {
                  setEmail('dev@aidlc.ai');
                  setPassword('dev123');
                }}
              >
                <p className="text-[9px] font-label-mono text-on-surface-variant/80 tracking-wider mb-2.5 uppercase">Demo Account - Click to Autofill</p>
                <div className="flex items-center gap-3">
                  <span className="px-2 py-1 rounded border border-primary/30 bg-primary/10 text-[9px] font-label-mono text-primary uppercase">DEVELOPER</span>
                  <span className="text-xs font-mono text-on-surface-variant group-hover:text-white transition-colors">dev@aidlc.ai - dev123</span>
                </div>
              </div>
            )}
            
            {(mode === 'signin' || mode === 'signup') && (
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => {
                    setMode(mode === 'signin' ? 'signup' : 'signin');
                    setError(null);
                    setNotice(null);
                  }}
                  className="text-xs font-medium text-on-surface-variant hover:text-white transition-colors"
                >
                  {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                </button>

                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot-password');
                      setError(null);
                      setNotice(null);
                    }}
                    className="text-xs font-medium text-secondary hover:underline transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column */}
      <div className="hidden lg:flex relative flex-1 bg-background overflow-hidden items-center justify-center">
        {/* Glow Effects */}
        <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] left-[10%] w-[600px] h-[600px] rounded-full bg-secondary/5 blur-[100px] pointer-events-none" />
        
        <div className="relative z-20 w-full max-w-[600px] px-12 xl:px-16">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <h1 className="text-[40px] xl:text-[48px] font-bold text-white tracking-tight leading-[1.1] mb-6">
              End-to-End<br />
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Autonomous</span><br />
              <span className="text-on-surface">Software Factory</span>
            </h1>
            
            <p className="text-xs xl:text-sm text-on-surface-variant leading-relaxed mb-10 max-w-lg">
              Supervisor-worker workflow: one supervisor fans out PO, UX, DEV, and QA workers in parallel, then fans in for HITL review.<br/>
              Full Human-in-the-Loop control with audit-ready artifacts.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {/* Feature Cards with 4px rounded and 1px border */}
              <div className="p-4 rounded border border-outline-variant bg-surface-container/30">
                <div className="font-semibold text-xs text-on-surface mb-1">Branching</div>
                <p className="text-[11px] text-on-surface-variant">Parallel execution with worker branching</p>
              </div>
              <div className="p-4 rounded border border-outline-variant bg-surface-container/30">
                <div className="font-semibold text-xs text-on-surface mb-1">HITL Gates</div>
                <p className="text-[11px] text-on-surface-variant">HITL review gates: approve / reject / rework</p>
              </div>
              <div className="p-4 rounded border border-outline-variant bg-surface-container/30">
                <div className="font-semibold text-xs text-on-surface mb-1">Audit Trail</div>
                <p className="text-[11px] text-on-surface-variant">Immutable logs with export options</p>
              </div>
              <div className="p-4 rounded border border-outline-variant bg-surface-container/30">
                <div className="font-semibold text-xs text-on-surface mb-1">Risk Controls</div>
                <p className="text-[11px] text-on-surface-variant">Risk-based HITL gate enforcement</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
