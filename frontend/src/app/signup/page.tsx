'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image';
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

  const [systemName, setSystemName] = useState('DancePerfect');
  const [primaryColor, setPrimaryColor] = useState('#4b0082');
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
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[#c7baff] via-[#d6e9ff] to-white antialiased">
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 sm:p-10 bg-white/80 backdrop-blur-xl border border-white rounded-3xl shadow-xl text-center"
      >
        {logoUrl && (
          <div className="relative h-14 w-14 mx-auto mb-4">
              <Image src={logoUrl} alt="Logo" fill className="rounded-2xl object-contain bg-white p-1" />
          </div>
        )}
        <h2 className="text-3xl font-black tracking-tight mb-1" style={{ color: primaryColor }}>Create Account</h2>
        <p className="text-slate-500 font-medium text-sm mb-8">Join {systemName} today</p>

        <AnimatePresence mode="popLayout">
          {error && (
            <motion.div className="bg-rose-50 text-rose-800 rounded-xl p-3.5 mb-5 text-sm font-medium text-left flex items-start gap-2.5">
              <FiAlertCircle className="shrink-0 mt-0.5" size={16} />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSignup} className="space-y-4">
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 outline-none" required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 outline-none" required />
          <button disabled={loading} type="submit" className="w-full py-3 rounded-xl font-bold text-white transition-all disabled:opacity-50" style={{ backgroundColor: primaryColor }}>
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>

        <button onClick={() => router.push('/login')} className="mt-6 flex items-center justify-center gap-2 w-full text-slate-500 hover:text-slate-800 font-semibold text-sm">
          <FiArrowLeft size={16} /> Back to Login
        </button>
      </motion.div>
    </div>
  );
}
