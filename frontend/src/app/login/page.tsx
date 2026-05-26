'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';
import { FiLock, FiMail, FiAlertCircle } from 'react-icons/fi';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const router = useRouter();

  // Inputs & Control States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Dynamic CMS Settings Configuration
  const [systemName, setSystemName] = useState('DancePerfect');
  const [primaryColor, setPrimaryColor] = useState('#7C3AED');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Pull active system branding from Supabase matching your dashboard config
  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const { data, error } = await supabase.from('app_settings').select('system_name, logo_url, primary_color').single();
        if (data && !error) {
          if (data.system_name) setSystemName(data.system_name);
          if (data.primary_color) setPrimaryColor(data.primary_color);
          if (data.logo_url) setLogoUrl(data.logo_url);
        }
      } catch (err) {
        console.error('Failed to resolve dynamic app branding settings:', err);
      }
    };
    fetchBranding();
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (!data?.user) {
        setError('Login failed. Please try again.');
        return;
      }

      // Check account activation profile status
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('is_active, role')
        .eq('id', data.user.id)
        .single();

      if (profileErr) throw profileErr;

      if (profile?.is_active === false) {
        await supabase.auth.signOut();
        setError('Your account has been deactivated. Please contact the administrator.');
        return;
      }

      const role = (profile?.role || 'user').toLowerCase().trim();
      const isAdmin = ['admin', 'super_admin', 'it_admin'].includes(role);

      router.replace(isAdmin ? '/admin' : '/upload');

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err) || '';

      if (msg.toLowerCase().includes('email not confirmed')) {
        setError('Email address not confirmed. Please verify your email inbox or contact your administrator.');
      } else if (msg.toLowerCase().includes('invalid login credentials')) {
        setError('Invalid email or password configuration.');
      } else if (msg.toLowerCase().includes('no api key')) {
        setError('Supabase connection error. Missing credentials. Verify environment variables.');
      } else {
        setError(msg || 'An unhandled login authentication error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white antialiased selection:bg-violet-200">
      
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md p-6 sm:p-10 bg-white/80 backdrop-blur-xl border border-white rounded-3xl shadow-xl shadow-slate-200/50 text-center"
      >
        {/* Dynamic Logo Block */}
        {logoUrl && (
          <img 
            src={logoUrl} 
            alt="Application Branding Logo" 
            className="h-14 w-14 mx-auto mb-4 rounded-2xl object-contain shadow-sm border border-slate-100 bg-white p-1" 
          />
        )}

        <h1 className="text-3xl font-black tracking-tight mb-1" style={{ color: primaryColor }}>
          {systemName}
        </h1>
        <p className="text-slate-500 font-medium text-sm sm:text-base mb-8">Welcome back! Sign in to continue</p>

        {/* Dynamic Error Feedback Card */}
        <AnimatePresence mode="popLayout">
          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-rose-50 border border-rose-100 text-rose-800 rounded-xl p-3.5 mb-5 text-xs sm:text-sm font-medium text-left flex items-start gap-2.5"
            >
              <FiAlertCircle className="text-rose-500 shrink-0 mt-0.5" size={16} />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleLogin} className="space-y-4">
          
          {/* Email input module */}
          <div className="relative text-left">
            <label className="sr-only">Email Address</label>
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <FiMail size={16} />
            </div>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 text-sm font-medium text-slate-800 bg-white/70 border border-slate-200 rounded-xl outline-none focus:border-slate-400 focus:bg-white transition-all placeholder:text-slate-400 shadow-2xs"
              required
            />
          </div>

          {/* Password input module */}
          <div className="relative text-left">
            <label className="sr-only">Password</label>
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <FiLock size={16} />
            </div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 text-sm font-medium text-slate-800 bg-white/70 border border-slate-200 rounded-xl outline-none focus:border-slate-400 focus:bg-white transition-all placeholder:text-slate-400 shadow-2xs"
              required
            />
          </div>

          {/* Core action button */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-white shadow-md shadow-slate-200 hover:brightness-95 transition-all disabled:opacity-50 text-sm tracking-wide flex items-center justify-center gap-2"
            style={{ backgroundColor: primaryColor }}
          >
            {loading ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </motion.button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col items-center gap-2">
          <p className="text-xs text-slate-400 font-medium">New to the platform?</p>
          <button
            type="button"
            onClick={() => router.push('/signup')}
            className="text-xs font-bold hover:underline tracking-wide transition-all"
            style={{ color: primaryColor }}
          >
            Create an Account
          </button>
        </div>

      </motion.div>
    </div>
  );
}
