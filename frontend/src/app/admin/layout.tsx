'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient, User } from '@supabase/supabase-js';
import { FiLogOut, FiLayout, FiFileText, FiHelpCircle, FiCpu, FiSettings, FiSliders, FiArrowLeft } from 'react-icons/fi';
import { motion } from 'framer-motion';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string>('user');

  // Navigation schema with matching context icons
  const nav = useMemo(
    () => [
      { href: '/admin', label: 'Dashboard', icon: FiLayout },
      { href: '/admin/pages', label: 'Content Pages', icon: FiFileText },
      { href: '/admin/faqs', label: 'FAQs', icon: FiHelpCircle },
      { href: '/admin/analysis-settings', label: 'Analysis Settings', icon: FiSliders },
      { href: '/admin/settings', label: 'System Settings', icon: FiSettings },
      { href: '/admin/runs', label: 'Runs', icon: FiCpu },
    ],
    []
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        router.replace('/login');
        return;
      }
      setUser(data.user);

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      const r = (myProfile?.role || 'user').toLowerCase().trim();
      setRole(r);

      const isAdmin = ['admin', 'super_admin', 'it_admin'].includes(r);
      if (!isAdmin) {
        router.replace('/upload');
        return;
      }

      setLoading(false);
    };

    load();
  }, [router]);

  const logout = async () => {
    await supabase.auth.signOut();
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-')) localStorage.removeItem(key);
    });
    router.replace('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white antialiased">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 rounded-full border-4 border-slate-200 border-t-violet-600 mx-auto mb-4" />
          <p className="text-slate-700 font-bold text-sm tracking-wide">Loading secure admin environment...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start px-4 md:px-8 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white antialiased selection:bg-violet-200">
      <div className="w-full max-w-7xl flex flex-col gap-6 py-6 md:py-10">
        
        {/* MASTER FROSTED FRAMEWORK CONTAINER */}
        <div className="bg-white/80 backdrop-blur-xl border border-white shadow-xl shadow-slate-200/50 rounded-3xl overflow-hidden flex flex-col">
          
          {/* TOP BAR BRAND BAR */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-5 sm:px-8 py-5 border-b border-slate-100 bg-white/40 gap-4">
            <div className="flex items-center gap-3.5">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-md shadow-violet-200 shrink-0 tracking-wider">
                DP
              </div>
              <div>
                <div className="font-black text-slate-800 text-lg tracking-tight">DancePerfect Hub</div>
                <div className="text-xs font-medium text-slate-500 mt-0.5">
                  Signed in as <span className="text-slate-700 font-bold">{user?.email?.split('@')[0]}</span> •{' '}
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-violet-50 border border-violet-100 text-violet-700 font-bold uppercase tracking-wide scale-90">
                    {role}
                  </span>
                </div>
              </div>
            </div>

            {/* ACTION TRIGGERS */}
            <div className="flex items-center gap-2.5 self-end sm:self-auto">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/upload')}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs md:text-sm font-bold shadow-sm flex items-center gap-2 transition-all"
              >
                <FiArrowLeft size={16} className="text-violet-500" />
                Go to Upload
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={logout}
                className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50/80 text-rose-700 hover:bg-rose-100 text-xs md:text-sm font-bold shadow-sm flex items-center gap-2 transition-all"
              >
                <FiLogOut size={16} />
                Logout
              </motion.button>
            </div>
          </div>

          {/* MAIN MANAGEMENT GRID PANELS */}
          <div className="flex flex-col md:flex-row min-h-[600px]">
            
            {/* SIDEBAR NAVIGATION REGISTRY */}
            <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-100 bg-white/20 shrink-0">
              <nav className="flex md:flex-col flex-row overflow-x-auto p-4 gap-1.5 md:space-y-1 scrollbar-none">
                {nav.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={[
                        'flex items-center gap-2.5 px-4 py-2.5 rounded-xl border font-bold text-xs md:text-sm transition-all duration-200 shrink-0 select-none relative',
                        active
                          ? 'bg-white border-slate-200/80 text-violet-600 shadow-sm shadow-slate-100'
                          : 'bg-transparent border-transparent text-slate-500 hover:bg-white/50 hover:border-slate-100 hover:text-slate-800',
                      ].join(' ')}
                    >
                      <Icon size={16} className={active ? 'text-violet-600' : 'text-slate-400'} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </aside>

            {/* NESTED CONTENT MOUNT DISPLAY BLOCK */}
            <main className="flex-1 p-5 sm:p-8 bg-white/10 overflow-hidden">
              {children}
            </main>
          </div>

        </div>
      </div>
    </div>
  );
}
