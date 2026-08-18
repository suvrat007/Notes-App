import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../../utils/api';
import { useAuth } from '../../utils/AuthContext';
import { useToast } from '../../utils/ToastContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { requestGoogleAccessToken, isGoogleConfigured } from '../../utils/google';
import ColdStart from '../../components/ColdStart';

const Signup = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleReady = isGoogleConfigured();
  const navigate = useNavigate();
  const { setAuthenticated } = useAuth();
  const showToast = useToast();

  /** Same route the Login page uses; the server issues the same cookie. */
  const handleGoogle = async () => {
    
    setGoogleBusy(true);
    try {
      const accessToken = await requestGoogleAccessToken();
      await api.post('/auth/google', { accessToken });
      setAuthenticated();
      navigate('/');
    } catch (err) {
      showToast(
        err.response?.data?.message || err.message || 'Google sign-in failed. Try again.',
        'error',
      );
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    
    if (password.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/create-account', { fullName, email, password });
      setAuthenticated();
      navigate('/');
    } catch (err) {
      showToast(err.response?.data?.message || 'An error occurred. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  /*
     * The Google round trip ends in the same cold backend as everything else,
     * so it gets the same screen rather than a button that says nothing is
     * happening. A label on a disabled button is not a loading state.
     */
  if (googleBusy) return <ColdStart waitingFor="Google" />;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 bg-[#0d0f12]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="w-full max-w-[420px] bg-[#16191e] border border-white/5 rounded-3xl overflow-hidden py-6 px-6 sm:px-10 relative"
      >
        <h2 className="font-heading text-center text-xl font-medium tracking-widest text-white/80 mb-5">FORGE</h2>
        
        <div className="text-center mb-5">
          <h1 className="font-sans text-2xl font-bold text-white mb-1.5">Start Tracking</h1>
          <p className="text-white/60 text-sm">Create an account to begin</p>
        </div>
        
        {/* Failures go to the toast stack, not inline. */}
        
        <form onSubmit={handleSignup} className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-white/90">Full Name</Label>
            <Input 
              type="text" 
              placeholder="Enter your name" 
              className="bg-[#0d0f12] text-white border border-white/10 h-12 rounded-xl px-4 placeholder:text-white/30 font-medium"
              value={fullName} 
              onChange={e => setFullName(e.target.value)} 
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-white/90">Email</Label>
            <Input 
              type="email" 
              placeholder="name@example.com" 
              className="bg-[#0d0f12] text-white border border-white/10 h-12 rounded-xl px-4 placeholder:text-white/30 font-medium"
              value={email} 
              onChange={e => setEmail(e.target.value)} 
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-white/90">Password</Label>
            <Input 
              type="password" 
              placeholder="Create a strong password" 
              className="bg-[#0d0f12] text-white border border-white/10 h-12 rounded-xl px-4 placeholder:text-white/30 font-medium"
              value={password} 
              onChange={e => setPassword(e.target.value)} 
            />
          </div>

          <Button 
            type="submit" 
            disabled={submitting}
            className="w-full h-12 bg-focus-green hover:bg-focus-green-soft text-white font-bold tracking-widest text-sm mt-4 rounded-[20px] transition-colors"
          >
            {submitting ? 'Creating account...' : 'Sign Up'}
          </Button>
        </form>

        {googleReady && (
          <>
            <div className="mt-6 flex items-center gap-4">
              <div className="h-[1px] flex-1 bg-white/10" />
              <span className="text-[9px] font-bold tracking-[0.2em] text-white/30">OR</span>
              <div className="h-[1px] flex-1 bg-white/10" />
            </div>

            {/* Same button as Login, and the same server route behind it: an
                account created this way is an ordinary account. */}
            <Button
              type="button"
              variant="outline"
              disabled={googleBusy || submitting}
              onClick={handleGoogle}
              className="w-full h-12 mt-4 bg-transparent border-white/10 text-white hover:bg-white/5 hover:text-white font-semibold text-xs tracking-wider"
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              CONTINUE WITH GOOGLE
            </Button>
          </>
        )}

        <p className="text-center mt-6 text-sm font-medium text-white/60">
          Already have an account? <span className="text-white font-bold hover:text-gray-200 cursor-pointer ml-1" onClick={() => navigate('/login')}>Login</span>
        </p>

        <div className="mt-5 text-center">
          <div className="flex items-center justify-center gap-4">
            <div className="h-[1px] w-8 bg-white/10"></div>
            <span className="text-[9px] font-bold tracking-[0.2em] text-white/30">SYSTEM OPS V1.0</span>
            <div className="h-[1px] w-8 bg-white/10"></div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Signup;
