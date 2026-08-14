import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../../utils/api';
import { useAuth } from '../../utils/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, AtSign, TerminalSquare } from 'lucide-react';
import { requestGoogleAccessToken, isGoogleConfigured } from '../../utils/google';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const navigate = useNavigate();
  const { setAuthenticated } = useAuth();
  const googleReady = isGoogleConfigured();

  /**
   * Google gets us a token; the SERVER decides whether it means anything and
   * issues the same httpOnly cookie the password path does. Neither way in is
   * privileged, and nothing downstream can tell them apart.
   */
  const handleGoogle = async () => {
    setError('');
    setGoogleBusy(true);
    try {
      const accessToken = await requestGoogleAccessToken();
      await api.post('/auth/google', { accessToken });
      setAuthenticated();
      navigate('/');
    } catch (err) {
      setError(
        err.response?.data?.message
        || err.message
        || 'Google sign-in failed. Try again.',
      );
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/login', { email, password });
      setAuthenticated();
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /*
   * The page states its own background.
   *
   * These pages render before the dashboard sets the theme attribute, so
   * anything inherited is the light default: a white page around a dark card.
   *
   * 100dvh rather than 100vh because on mobile vh counts browser chrome that
   * is not actually there, which pushes the card under the address bar.
   */
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 bg-[#0d0f12]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="w-full max-w-[420px] bg-[#16191e] border border-white/10 rounded-[22px] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 sm:px-8 pt-6 pb-4 border-b border-white/5">
          <span className="font-heading font-bold text-white tracking-widest text-sm">FOCUS</span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-focus-teal font-semibold tracking-wider">V2.4.0</span>
            <div className="p-1.5 border border-white/20 rounded bg-black/40">
              <TerminalSquare size={14} className="text-white/70" />
            </div>
          </div>
        </div>

        <div className="px-6 sm:px-8 py-7">
          <h2 className="font-heading text-3xl font-bold text-white tracking-tight mb-2">WELCOME BACK</h2>
          <p className="text-white/60 text-sm mb-7">Continue your productivity journey.</p>
          
          {error && <p className="text-focus-red text-sm mb-6 text-center">{error}</p>}
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold tracking-widest text-white/70 uppercase">Email</Label>
              <div className="relative">
                <Input 
                  type="email" 
                  placeholder="OPERATOR@SYSTEM.COM" 
                  className="bg-[#0d0f12] border-white/10 text-white placeholder:text-white/30 pl-4 pr-10 h-12 text-xs font-mono tracking-wider"
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                />
                <AtSign size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-bold tracking-widest text-white/70 uppercase">Password</Label>
                <a href="#" className="text-[10px] font-bold tracking-widest text-purple-400 hover:text-purple-300">Forgot?</a>
              </div>
              <div className="relative">
                <Input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  className="bg-[#0d0f12] border-white/10 text-white placeholder:text-white/30 pl-4 pr-10 h-12 text-lg tracking-widest"
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  /* The icon is 18px; the button it sits in has to be bigger
                     than the icon for a thumb to land on it. */
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 grid place-items-center rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <Eye size={18} />
                </button>
              </div>
            </div>

            {/* The whole row is the target. An 18px glyph is not something a
                thumb aims at, and the label was already the easier hit. */}
            <label
              htmlFor="remember"
              className="flex items-center gap-3 py-2.5 cursor-pointer select-none"
            >
              <Checkbox id="remember" className="h-5 w-5 border-white/20 data-[checked]:bg-focus-green data-[checked]:border-focus-green rounded-sm" />
              <span className="text-xs font-semibold text-white/70">
                Stay logged in for this session
              </span>
            </label>

            <Button 
              type="submit" 
              disabled={submitting}
              className="w-full h-12 bg-focus-green hover:bg-focus-green-soft text-white font-bold tracking-widest text-sm mt-4 rounded-md transition-colors"
            >
              {submitting ? 'LOGGING IN...' : 'LOGIN →'}
            </Button>
          </form>

          <div className="mt-8 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-center">
              <span className="bg-[#16191e] px-4 text-[10px] uppercase font-bold tracking-widest text-white/40">
                Or connect with
              </span>
            </div>
          </div>

          {/* GitHub sat here too, but nothing was ever wired behind it, a
              button that silently does nothing is worse than no button. */}
          <div className="mt-5">
            <Button
              type="button"
              variant="outline"
              disabled={!googleReady || submitting}
              onClick={handleGoogle}
              className="w-full h-12 bg-transparent border-white/10 text-white hover:bg-white/5 hover:text-white font-semibold text-xs tracking-wider"
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {googleBusy ? 'WAITING FOR GOOGLE...' : 'GOOGLE'}
            </Button>
            {!googleReady && (
              <p className="text-[10px] text-white/40 text-center mt-3 tracking-wider">
                Set VITE_GOOGLE_CLIENT_ID to enable Google sign-in.
              </p>
            )}
          </div>

          <p className="text-center mt-7 text-xs font-medium text-white/60">
            Don't have an account? <span className="text-[#e2d5f8] hover:text-white cursor-pointer ml-1" onClick={() => navigate('/signup')}>Sign up</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
