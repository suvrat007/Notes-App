import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../../utils/api';
import { useAuth } from '../../utils/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const Signup = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { setAuthenticated } = useAuth();

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/create-account', { fullName, email, password });
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
        className="w-full max-w-[420px] bg-[#121214] border border-white/5 rounded-3xl overflow-hidden py-10 px-10 relative"
      >
        <h2 className="font-heading text-center text-xl font-medium tracking-widest text-white/80 mb-10">
          FOCUS
        </h2>
        
        <div className="text-center mb-8">
          <h1 className="font-sans text-3xl font-bold text-white mb-2">Start Tracking</h1>
          <p className="text-white/60 text-sm">Create an account to begin</p>
        </div>
        
        {error && <p className="text-focus-red text-sm mb-6 text-center">{error}</p>}
        
        <form onSubmit={handleSignup} className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-white/90">Full Name</Label>
            <Input 
              type="text" 
              placeholder="Enter your name" 
              className="bg-white text-black border-0 h-12 rounded-xl px-4 placeholder:text-gray-400 font-medium"
              value={fullName} 
              onChange={e => setFullName(e.target.value)} 
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-white/90">Email</Label>
            <Input 
              type="email" 
              placeholder="name@example.com" 
              className="bg-white text-black border-0 h-12 rounded-xl px-4 placeholder:text-gray-400 font-medium"
              value={email} 
              onChange={e => setEmail(e.target.value)} 
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-white/90">Password</Label>
            <Input 
              type="password" 
              placeholder="Create a strong password" 
              className="bg-white text-black border-0 h-12 rounded-xl px-4 placeholder:text-gray-400 font-medium"
              value={password} 
              onChange={e => setPassword(e.target.value)} 
            />
          </div>

          <Button 
            type="submit" 
            disabled={submitting}
            className="w-full h-12 bg-[#e8e8e8] hover:bg-white text-black font-bold text-sm mt-4 rounded-[20px] transition-colors"
          >
            {submitting ? 'Creating account...' : 'Sign Up'}
          </Button>
        </form>

        <p className="text-center mt-8 text-sm font-medium text-white/60">
          Already have an account? <span className="text-white font-bold hover:text-gray-200 cursor-pointer ml-1" onClick={() => navigate('/login')}>Login</span>
        </p>

        <div className="mt-12 text-center">
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
