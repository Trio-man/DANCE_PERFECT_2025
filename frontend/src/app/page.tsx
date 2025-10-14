'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { motion } from 'framer-motion';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function HomePage() {
  const router = useRouter();
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) router.push('/upload');
      else router.push('/login');
    }, 2500); // intro shows for 3 seconds
    return () => clearTimeout(timer);
  }, [router]);

  if (!showIntro) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white">
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="text-5xl font-extrabold text-blue-600"
      >
        DancePerfect
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="text-xl text-slate-600 mt-2"
      >
        Let’s Dance!
      </motion.p>
    </div>
  );
}
