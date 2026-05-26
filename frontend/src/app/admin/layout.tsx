'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient, User } from '@supabase/supabase-js';
import { FiLogOut, FiLayout, FiFileText, FiHelpCircle, FiCpu, FiSettings, FiSliders, FiArrowLeft, FiTrendingUp } from 'react-icons/fi';

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white font-semibold text-slate-600 text-sm">
        <div className="animate-spin h-5 w-5 border-2 border-slate-300 border-t-violet-600 rounded-full mr-3" />
        Authenticating terminal environment...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white antialiased text-slate-800">
      <div className="w-full max-w-7xl mx-auto px-4 py-6 md:py-10">
        
        {/* SOLID RECTILINEAR MATTE HUB FRAMEWORK CONTAINER */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-300/40 border border-slate-200 overflow-hidden flex flex-col">
          
          {/* HEADER BRAND NAV BAR */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 gap-4">
            <div className="flex items-center gap-3">
              {/* Dynamic Motion Branding Token */}
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                <FiTrendingUp size={16} className="animate-pulse" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-base tracking-tight leading-tight">DancePerfect Hub</h2>
                <div className="text-xs text-slate-500 mt-0.5">
                  Identity: <span className="text-slate-700 font-semibold">{user?.email?.split('@')[0]}</span> •{' '}
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-violet-100 text-violet-800 font-bold uppercase tracking-wide text-[10px] ml-1">
                    {role}
                  </span>
                </div>
              </div>
            </div>

            {/* HEADER INTERACTION SWITCHES */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={() => router.push('/upload')}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all"
              >
                <FiArrowLeft size={14} className="text-violet-500" />
                Go to Upload
              </button>
              
              <button
                onClick={logout}
                className="px-3 py-1.5 rounded-lg border border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all"
              >
                <FiLogOut size={14} />
                Logout
              </button>
            </div>
          </div>

          {/* MAIN COLUMN BODY LAYOUT */}
          <div className="flex flex-col md:flex-row min-h-[650px]">
            
            {/* SIDEBAR NAVIGATION CONTROL BOARD */}
            <aside className="w-full md:w-56 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/20 shrink-0">
              <nav className="flex md:flex-col flex-row overflow-x-auto p-3 gap-1 md:space-y-0.5 scrollbar-none">
                {nav.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={[
                        'flex items-center gap-2 px-3 py-2 rounded-lg font-bold text-xs tracking-wide transition-all shrink-0',
                        active
                          ? 'bg-slate-100 border border-slate-200/80 text-violet-700 shadow-xs'
                          : 'bg-transparent border border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800',
                      ].join(' ')}
                    >
                      <Icon size={14} className={active ? 'text-violet-600' : 'text-slate-400'} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </aside>

            {/* NESTED RENDER CONTENT VIEWPORTS */}
            <main className="flex-1 p-5 md:p-8 overflow-hidden bg-white">
              {children}
            </main>
          </div>

        </div>
      </div>
    </div>
  );
}
