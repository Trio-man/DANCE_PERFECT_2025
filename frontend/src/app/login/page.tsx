'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';

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

      // ✅ Check if account is deactivated in public.profiles
      // ✅ ADDED: also fetch role
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('is_active, role') // ✅ ADDED role
        .eq('id', data.user.id)
        .single();

      if (profileErr) throw profileErr;

      if (profile?.is_active === false) {
        await supabase.auth.signOut();
        setError('Your account has been deactivated. Please contact the administrator.');
        return;
      }

      // ✅ ADDED: role-based redirect
      const role = (profile?.role || 'user').toLowerCase();
      const isAdmin = ['admin', 'super_admin', 'it_admin'].includes(role);

      router.replace(isAdmin ? '/admin' : '/upload'); // ✅ UPDATED

    } catch (err: any) {
      const msg = err?.message || '';

      if (msg.toLowerCase().includes('email not confirmed')) {
        setError('Email not confirmed. Please verify your email or ask admin to disable confirmation.');
      } else if (msg.toLowerCase().includes('invalid login credentials')) {
        setError('Invalid email or password.');
      } else if (msg.toLowerCase().includes('no api key')) {
        setError('Supabase config error (missing API key). Check NEXT_PUBLIC env vars and restart dev server.');
      } else {
        setError(msg || 'Login failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="min-h-screen flex items-center justify-center px-4
                 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white
                 animate-gradient bg-[length:400%_400%]"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md p-10 bg-white/70 backdrop-blur-lg rounded-xl shadow-lg text-center"
      >
        <h1 className="text-3xl font-bold text-[#4b0082] mb-2">Welcome Back 👋</h1>
        <p className="text-slate-700 mb-8">Sign in to continue</p>

        {error && <p className="text-red-700 mb-4 font-medium">{error}</p>}

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 rounded-lg border border-slate-300 outline-none
                       focus:ring-2 focus:ring-[#4b0082] bg-white/60 placeholder:text-gray-400"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 rounded-lg border border-slate-300 outline-none
                       focus:ring-2 focus:ring-[#4b0082] bg-white/60 placeholder:text-gray-400"
            required
          />

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg font-semibold
                       bg-[#4b0082] text-white hover:bg-[#37006b]
                       transition disabled:opacity-60"
          >
            {loading ? 'Logging in...' : 'Login'}
          </motion.button>
        </form>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/signup')}
          className="mt-6 w-full text-[#4b0082] hover:underline font-semibold"
        >
          Sign Up
        </motion.button>
      </motion.div>
    </motion.div>
  );
}