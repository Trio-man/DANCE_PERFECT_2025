'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient, User } from '@supabase/supabase-js';

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
      { href: '/admin', label: 'Dashboard' },
      { href: '/admin/pages', label: 'Content Pages' },
      { href: '/admin/faqs', label: 'FAQs' },
      { href: '/admin/analysis-settings', label: 'Analysis Settings' },
      { href: '/admin/settings', label: 'System Settings' },
      { href: '/admin/runs', label: 'Runs' },
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

      const r = (myProfile?.role || 'user').toLowerCase();
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
    router.replace('/login');
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading admin…</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg rounded-2xl overflow-hidden">
          {/* Top bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/60">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-white/70 border border-white/60 flex items-center justify-center font-bold">
                DP
              </div>
              <div>
                <div className="font-bold text-lg">DancePerfect Admin</div>
                <div className="text-xs text-slate-600">
                  Signed in as {user?.email?.split('@')[0]} •{' '}
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-black/5 border border-black/10">
                    {role}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={logout}
              className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
            >
              Logout
            </button>
          </div>

          {/* Body */}
          <div className="flex">
            {/* Sidebar */}
            <aside className="w-64 border-r border-white/60 bg-white/40">
              <nav className="p-4 space-y-1">
                {nav.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={[
                        'block px-3 py-2 rounded-lg border',
                        active
                          ? 'bg-white/70 border-white/80 font-semibold'
                          : 'bg-transparent border-transparent hover:bg-white/50 hover:border-white/60',
                      ].join(' ')}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </aside>

            {/* Content */}
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}