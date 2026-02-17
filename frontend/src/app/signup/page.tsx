'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { motion } from 'framer-motion';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) setError(error.message);
    else router.push('/login');
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-4">
      {/* Animated Gradient Background */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #fbc2eb, #a6c1ee, #fbc2eb)',
          backgroundSize: '400% 400%',
        }}
        animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Signup Form */}
      <motion.div
        initial={{ y: 30, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 bg-white/80 backdrop-blur-md shadow-md rounded-xl p-8 w-full max-w-md border border-slate-200"
      >
        <h2 className="text-2xl font-bold text-blue-600 mb-2 text-center">
          Sign Up 👤
        </h2>

        <p className="text-slate-600 text-center mb-6">
          Create your DancePerfect account
        </p>

        {error && <p className="text-red-600 mb-4 text-center">{error}</p>}

        <form onSubmit={handleSignup} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-slate-300 rounded-lg w-full p-3"
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-slate-300 rounded-lg w-full p-3"
            required
          />

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            {loading ? 'Signing up...' : 'Sign Up'}
          </motion.button>
        </form>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/login')}
          className="mt-5 w-full text-blue-600 hover:underline font-semibold"
        >
          ← Back to Login
        </motion.button>
      </motion.div>
    </div>
  );
}