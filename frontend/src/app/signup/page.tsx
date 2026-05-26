'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';
import { FiLock, FiMail, FiAlertCircle, FiArrowLeft } from 'react-icons/fi';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Dynamic Branding
  const [systemName, setSystemName] = useState('DancePerfect');
  const [primaryColor, setPrimaryColor] = useState('#7C3AED');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchBranding = async () => {
      const { data } = await supabase.from('app_settings').select('system_name, logo_url, primary_color').single();
      if (data) {
        if (data.system_name) setSystemName(data.system_name);
        if (data.primary_color) setPrimaryColor(data.primary_color);
        if (data.logo_url) setLogoUrl(data.logo_url);
      }
    };
    fetchBranding();
  }, []);

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: signUpError } = await supabase.auth.signUp({ 
        email, 
        password,
        options: { emailRedirectTo: `${window.location.origin}/login` }
      });
      
      if (signUpError) throw signUpError;
      
      alert('Signup successful! Please check your email to confirm your account.');
      router.push('/login');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[#c7baff] via-[#d6e9ff] to-white antialiased">
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md p-6 sm:p-10 bg-white/80 backdrop-blur-xl border border-white rounded-3xl shadow-xl shadow-slate-200/50 text-center"
      >
        {/* Branding */}
        {logoUrl && (
          <img src={logoUrl} alt="Logo" className="h-14 w-14 mx-auto mb-4 rounded-2xl object-contain shadow-sm" />
        )}
        <h2 className="text-3xl font-black tracking-tight mb-1" style={{ color: primaryColor }}>Create Account</h2>
        <p className="text-slate-500 font-medium text-sm mb-8">Join {systemName} today</p>

        {/* Error Feedback */}
        <AnimatePresence mode="popLayout">
          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-rose-50 border border-rose-100 text-rose-800 rounded-xl p-3.5 mb-5 text-sm font-medium text-left flex items-start gap-2.5"
            >
              <FiAlertCircle className="text-rose-500 shrink-0 mt-0.5" size={16} />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><FiMail size={16} /></div>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-slate-400 bg-white/70 shadow-2xs"
              required
            />
          </div>

          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><FiLock size={16} /></div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-slate-400 bg-white/70 shadow-2xs"
              required
            />
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-white shadow-md hover:brightness-95 transition-all disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </motion.button>
        </form>

        <button
          onClick={() => router.push('/login')}
          className="mt-6 flex items-center justify-center gap-2 w-full text-slate-500 hover:text-slate-800 font-semibold text-sm transition-all"
        >
          <FiArrowLeft size={16} />
          Back to Login
        </button>
      </motion.div>
    </div>
  );
}
