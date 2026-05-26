'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image';
import { FiLock, FiMail, FiAlertCircle } from 'react-icons/fi';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
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
      try {
        const { data } = await supabase.from('app_settings').select('system_name, logo_url, primary_color').single();
        if (data) {
          if (data.system_name) setSystemName(data.system_name);
          if (data.primary_color) setPrimaryColor(data.primary_color);
          if (data.logo_url) setLogoUrl(data.logo_url);
        }
      } catch (_err) {
        console.error('Branding fetch skipped.');
      }
    };
    fetchBranding();
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      if (!data?.user) throw new Error('Login failed.');

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_active, role')
        .eq('id', data.user.id)
        .single();

      if (profile?.is_active === false) {
        await supabase.auth.signOut();
        throw new Error('Account deactivated. Contact administrator.');
      }

      const role = (profile?.role || 'user').toLowerCase().trim();
      router.replace(['admin', 'super_admin', 'it_admin'].includes(role) ? '/admin' : '/upload');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white antialiased">
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
        <h1 className="text-3xl font-black tracking-tight mb-1" style={{ color: primaryColor }}>{systemName}</h1>
        <p className="text-slate-500 font-medium text-sm mb-8">Welcome back! Sign in to continue</p>

        <AnimatePresence mode="popLayout">
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-rose-50 text-rose-800 rounded-xl p-3 mb-5 text-sm flex items-center gap-2">
              <FiAlertCircle size={16} /> {error}
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative">
            <FiMail className="absolute left-3 top-3 text-slate-400" size={16} />
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-10 p-3 rounded-xl border border-slate-200 outline-none focus:border-slate-400" required />
          </div>
          <div className="relative">
            <FiLock className="absolute left-3 top-3 text-slate-400" size={16} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 p-3 rounded-xl border border-slate-200 outline-none focus:border-slate-400" required />
          </div>
          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl font-bold text-white transition-all disabled:opacity-50" style={{ backgroundColor: primaryColor }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <button onClick={() => router.push('/signup')} className="mt-6 text-sm font-bold hover:underline" style={{ color: primaryColor }}>
          Create an Account
        </button>
      </motion.div>
    </div>
  );
}
