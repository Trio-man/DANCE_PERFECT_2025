'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';

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

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      router.push('/login');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-violet-300 via-pink-300 to-cyan-300"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md p-10 bg-white/85 backdrop-blur-lg rounded-xl shadow-md text-center"
      >
        {/* Animated neon border highlights */}
        <motion.div
          className="absolute inset-0 rounded-xl border-2 border-transparent pointer-events-none"
          animate={{ borderColor: ['#8a2be2', '#ff00ff', '#00ffff', '#8a2be2'] }}
          transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
        />

        <h2 className="text-2xl font-bold text-blue-700 mb-2">Sign Up 👤</h2>
        <p className="text-slate-600 mb-6">Create your DancePerfect account</p>

        {error && <p className="text-red-600 mb-4 font-medium">{error}</p>}

        <form onSubmit={handleSignup} className="space-y-4 relative z-10">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-slate-300 rounded-lg w-full p-3 outline-none focus:ring-2 focus:ring-pink-300"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-slate-300 rounded-lg w-full p-3 outline-none focus:ring-2 focus:ring-pink-300"
            required
          />

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-60"
          >
            {loading ? 'Signing up...' : 'Sign Up'}
          </motion.button>
        </form>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/login')}
          className="mt-5 w-full text-blue-700 hover:underline font-semibold"
        >
          ← Back to Login
        </motion.button>
      </motion.div>
    </motion.div>
  );
}