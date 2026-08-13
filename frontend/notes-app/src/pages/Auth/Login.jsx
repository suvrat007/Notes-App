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

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { setAuthenticated } = useAuth();

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

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="w-full max-w-[420px] bg-[#121214] border border-white/10 rounded-[22px] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-white/5">
          <span className="font-heading font-bold text-white tracking-widest text-sm">FOCUS</span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-focus-teal font-semibold tracking-wider">V2.4.0</span>
            <div className="p-1.5 border border-white/20 rounded bg-black/40">
              <TerminalSquare size={14} className="text-white/70" />
            </div>
          </div>
        </div>

        <div className="px-8 py-10">
          <h2 className="font-heading text-3xl font-bold text-white tracking-tight mb-2">WELCOME BACK</h2>
          <p className="text-white/60 text-sm mb-10">Continue your productivity journey.</p>
          
          {error && <p className="text-focus-red text-sm mb-6 text-center">{error}</p>}
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold tracking-widest text-white/70 uppercase">Email</Label>
              <div className="relative">
                <Input 
                  type="email" 
                  placeholder="OPERATOR@SYSTEM.COM" 
                  className="bg-[#0a0a0c] border-white/10 text-white placeholder:text-white/30 pl-4 pr-10 h-12 text-xs font-mono tracking-wider"
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
                  className="bg-[#0a0a0c] border-white/10 text-white placeholder:text-white/30 pl-4 pr-10 h-12 text-lg tracking-widest"
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  <Eye size={18} />
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <Checkbox id="remember" className="border-white/20 data-[state=checked]:bg-focus-green data-[state=checked]:border-focus-green rounded-sm" />
              <label htmlFor="remember" className="text-xs font-semibold text-white/70 cursor-pointer">
                Stay logged in for this session
              </label>
            </div>

            <Button 
              type="submit" 
              disabled={submitting}
              className="w-full h-14 bg-focus-green hover:bg-focus-green-soft text-white font-bold tracking-widest text-sm mt-4 rounded-md transition-colors"
            >
              {submitting ? 'LOGGING IN...' : 'LOGIN →'}
            </Button>
          </form>

          <div className="mt-12 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-center">
              <span className="bg-[#121214] px-4 text-[10px] uppercase font-bold tracking-widest text-white/40">
                Or connect with
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-8">
            <Button variant="outline" className="h-12 bg-transparent border-white/10 text-white hover:bg-white/5 hover:text-white font-semibold text-xs tracking-wider">
              <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg> GITHUB
            </Button>
            <Button variant="outline" className="h-12 bg-transparent border-white/10 text-white hover:bg-white/5 hover:text-white font-semibold text-xs tracking-wider">
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              GOOGLE
            </Button>
          </div>

          <p className="text-center mt-10 text-xs font-medium text-white/60">
            Don't have an account? <span className="text-[#e2d5f8] hover:text-white cursor-pointer ml-1" onClick={() => navigate('/signup')}>Sign up</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
