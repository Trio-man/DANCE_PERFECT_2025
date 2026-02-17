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
      className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-white via-[#cde7ff] to-[#d6c1ff] animate-gradient"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md p-10 bg-white/85 backdrop-blur-lg rounded-xl shadow-md text-center"
      >
        <h2 className="text-2xl font-bold text-purple-700 mb-2">Sign Up 👤</h2>
        <p className="text-slate-600 mb-6">Create your DancePerfect account</p>

        {error && <p className="text-red-600 mb-4 font-medium">{error}</p>}

        <form onSubmit={handleSignup} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-slate-300 rounded-lg w-full p-3 outline-none focus:ring-2 focus:ring-purple-300"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-slate-300 rounded-lg w-full p-3 outline-none focus:ring-2 focus:ring-purple-300"
            required
          />

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition disabled:opacity-60"
          >
            {loading ? 'Signing up...' : 'Sign Up'}
          </motion.button>
        </form>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/login')}
          className="mt-5 w-full text-purple-700 hover:underline font-semibold"
        >
          ← Back to Login
        </motion.button>
      </motion.div>
    </motion.div>
  );
}