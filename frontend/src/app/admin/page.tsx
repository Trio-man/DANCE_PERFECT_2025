'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient, Session } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const API_BASE = 'http://localhost:5000';

type ProfileRow = {
  id: string;
  email: string | null;
  role: 'user' | 'it_admin' | 'super_admin' | string;
  created_at: string;
  is_active: boolean | null;
  display_name: string | null;
};

type RunRow = {
  id: string;
  user_id: string;
  created_at: string;
  status: string | null;
  score: number | null;
  summary_feedback: string | null;
  profile?: { email?: string | null } | null;
};

type AppSettingsRow = {
  id: number;
  system_name: string;
  logo_url: string | null;
  primary_color: string;
};

type ContentPageRow = {
  id: number;
  slug: string;
  title: string;
  body: string;
  is_active: boolean;
  updated_at?: string | null;
};

type FaqRow = {
  id: number;
  question: string;
  answer: string;
  is_active: boolean;
  updated_at?: string | null;
};

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border border-white/60 bg-white/70">
      {children}
    </span>
  );
}

export default function AdminPage() {
  const router = useRouter();

  // -------------------------
  // AUTH / ROLE
  // -------------------------
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string>('user');

  // -------------------------
  // DASHBOARD DATA (existing)
  // -------------------------
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'it_admin' | 'super_admin'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [confirm, setConfirm] = useState<{ open: boolean; userId: string; nextActive: boolean }>({
    open: false,
    userId: '',
    nextActive: false,
  });

  // -------------------------
  // CMS STATE (NEW)
  // -------------------------
  const [cmsTab, setCmsTab] = useState<'dashboard' | 'cms'>('dashboard');

  const [appSettings, setAppSettings] = useState<AppSettingsRow | null>(null);
  const [appSettingsDraft, setAppSettingsDraft] = useState<AppSettingsRow | null>(null);
  const [pages, setPages] = useState<ContentPageRow[]>([]);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [cmsSaving, setCmsSaving] = useState(false);
  const [cmsMsg, setCmsMsg] = useState<string | null>(null);

  const [editPage, setEditPage] = useState<ContentPageRow | null>(null);
  const [editFaq, setEditFaq] = useState<FaqRow | null>(null);
  const [newFaq, setNewFaq] = useState<{ question: string; answer: string }>({ question: '', answer: '' });

  const normRole = (role || 'user').toLowerCase().trim();
  const canManageUsers = normRole === 'it_admin' || normRole === 'super_admin';
  const canChangeRoles = normRole === 'super_admin';
  const canManageCMS = normRole === 'it_admin' || normRole === 'super_admin';

  const primaryColor = appSettings?.primary_color || '#7C3AED';
  const systemName = appSettings?.system_name || 'DancePerfect';

  const totalUsers = users.length;
  const totalRuns = runs.length;
  const todayRuns = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();
    return runs.filter((r) => {
      const dt = new Date(r.created_at);
      return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
    }).length;
  }, [runs]);

  const getEmail = (r: RunRow) => r.profile?.email || '—';

  // -------------------------
  // LOADERS
  // -------------------------
  const refreshUsers = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) throw new Error('No access token found.');

    const res = await fetch(`${API_BASE}/admin/users`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = await res.json();

    if (!res.ok) {
      throw new Error(payload?.error || 'Failed to load users.');
    }

    setUsers(((payload.users ?? []) as unknown) as ProfileRow[]);
  };

  const refreshRuns = async () => {
    const { data: runRows, error: runsErr } = await supabase
      .from('analysis_runs')
      .select(
        `
        id,
        user_id,
        created_at,
        status,
        score,
        summary_feedback,
        profile:profiles(email)
      `
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (runsErr) {
      setRuns([]);
      return;
    }
    setRuns((runRows ?? []) as unknown as RunRow[]);
  };

  const loadCMS = async () => {
    setCmsMsg(null);

    // app_settings (single row)
    const { data: settingsRow, error: sErr } = await supabase
      .from('app_settings')
      .select('id,system_name,logo_url,primary_color')
      .single();

    if (sErr) throw sErr;
    const row = settingsRow as AppSettingsRow;
    setAppSettings(row);
    setAppSettingsDraft({ ...row });

    // content_pages
    const { data: pagesRows, error: pErr } = await supabase
      .from('content_pages')
      .select('id,slug,title,body,is_active,updated_at')
      .order('id', { ascending: true })
      .limit(200);

    if (pErr) throw pErr;
    setPages(((pagesRows ?? []) as unknown) as ContentPageRow[]);

    // faqs
    const { data: faqRows, error: fErr } = await supabase
      .from('faqs')
      .select('id,question,answer,is_active,updated_at')
      .order('id', { ascending: false })
      .limit(200);

    if (fErr) throw fErr;
    setFaqs(((faqRows ?? []) as unknown) as FaqRow[]);
  };

  // -------------------------
  // INIT
  // -------------------------
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        router.push('/login');
        return;
      }

      const { data: myProfile, error: profErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      if (profErr || !myProfile) {
        setError(`Failed to load profile: ${profErr?.message || 'profile row missing'}`);
        setLoading(false);
        return;
      }

      const userRole = (myProfile.role || 'user').toLowerCase().trim();
      setRole(userRole);

      // If not admin, you can redirect away
      if (userRole !== 'it_admin' && userRole !== 'super_admin') {
        router.push('/upload');
        return;
      }

      try {
        await refreshRuns();
        await refreshUsers();
        await loadCMS();
      } catch (e: any) {
        setError(e?.message || 'Failed to load admin data.');
      }

      setLoading(false);
    };

    load();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session: Session | null) => {
        if (!session?.user) router.replace('/login');
      }
    );

    return () => listener.subscription.unsubscribe();
  }, [router]);

  // -------------------------
  // USERS ACTIONS
  // -------------------------
  const updateUserRole = async (userId: string, nextRole: string) => {
    if (!canChangeRoles) return;
    setSavingUserId(userId);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) throw new Error('No access token found.');

      const res = await fetch(`${API_BASE}/admin/users/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: userId,
          role: nextRole,
        }),
      });

      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to update role.');
      }

      await refreshUsers();
    } catch (e: any) {
      setError(e?.message || 'Failed to update role.');
    } finally {
      setSavingUserId(null);
    }
  };

  const toggleUserActive = async (userId: string, nextActive: boolean) => {
    if (!canManageUsers) return;
    setSavingUserId(userId);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) throw new Error('No access token found.');

      const res = await fetch(`${API_BASE}/admin/users/active`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: userId,
          is_active: nextActive,
        }),
      });

      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to update active status.');
      }

      await refreshUsers();
    } catch (e: any) {
      setError(e?.message || 'Failed to update active status.');
    } finally {
      setSavingUserId(null);
    }
  };

  // -------------------------
  // CMS ACTIONS
  // -------------------------
  const saveAppSettings = async () => {
    if (!canManageCMS || !appSettingsDraft) return;
    setCmsSaving(true);
    setCmsMsg(null);

    try {
      const { error } = await supabase
        .from('app_settings')
        .update({
          system_name: appSettingsDraft.system_name,
          logo_url: appSettingsDraft.logo_url,
          primary_color: appSettingsDraft.primary_color,
        })
        .eq('id', appSettingsDraft.id);

      if (error) throw error;

      await loadCMS();
      setCmsMsg('✅ App settings saved.');
    } catch (e: any) {
      setCmsMsg(`❌ Failed to save settings: ${e?.message || 'Unknown error'}`);
    } finally {
      setCmsSaving(false);
    }
  };

  const saveContentPage = async () => {
    if (!canManageCMS || !editPage) return;
    setCmsSaving(true);
    setCmsMsg(null);

    try {
      const { error } = await supabase
        .from('content_pages')
        .update({
          title: editPage.title,
          body: editPage.body,
          is_active: editPage.is_active,
        })
        .eq('id', editPage.id);

      if (error) throw error;

      setEditPage(null);
      await loadCMS();
      setCmsMsg('✅ Page saved.');
    } catch (e: any) {
      setCmsMsg(`❌ Failed to save page: ${e?.message || 'Unknown error'}`);
    } finally {
      setCmsSaving(false);
    }
  };

  const togglePageActive = async (pageId: number, nextActive: boolean) => {
    if (!canManageCMS) return;
    setCmsSaving(true);
    setCmsMsg(null);

    try {
      const { error } = await supabase.from('content_pages').update({ is_active: nextActive }).eq('id', pageId);
      if (error) throw error;
      await loadCMS();
    } catch (e: any) {
      setCmsMsg(`❌ Failed to update page: ${e?.message || 'Unknown error'}`);
    } finally {
      setCmsSaving(false);
    }
  };

  const addFaq = async () => {
    if (!canManageCMS) return;
    const q = newFaq.question.trim();
    const a = newFaq.answer.trim();
    if (!q || !a) {
      setCmsMsg('❌ Please fill question and answer.');
      return;
    }

    setCmsSaving(true);
    setCmsMsg(null);

    try {
      const { error } = await supabase.from('faqs').insert({
        question: q,
        answer: a,
        is_active: true,
      });

      if (error) throw error;

      setNewFaq({ question: '', answer: '' });
      await loadCMS();
      setCmsMsg('✅ FAQ added.');
    } catch (e: any) {
      setCmsMsg(`❌ Failed to add FAQ: ${e?.message || 'Unknown error'}`);
    } finally {
      setCmsSaving(false);
    }
  };

  const saveFaq = async () => {
    if (!canManageCMS || !editFaq) return;
    setCmsSaving(true);
    setCmsMsg(null);

    try {
      const { error } = await supabase
        .from('faqs')
        .update({
          question: editFaq.question,
          answer: editFaq.answer,
          is_active: editFaq.is_active,
        })
        .eq('id', editFaq.id);

      if (error) throw error;

      setEditFaq(null);
      await loadCMS();
      setCmsMsg('✅ FAQ saved.');
    } catch (e: any) {
      setCmsMsg(`❌ Failed to save FAQ: ${e?.message || 'Unknown error'}`);
    } finally {
      setCmsSaving(false);
    }
  };

  const toggleFaqActive = async (faqId: number, nextActive: boolean) => {
    if (!canManageCMS) return;
    setCmsSaving(true);
    setCmsMsg(null);

    try {
      const { error } = await supabase.from('faqs').update({ is_active: nextActive }).eq('id', faqId);
      if (error) throw error;
      await loadCMS();
    } catch (e: any) {
      setCmsMsg(`❌ Failed to update FAQ: ${e?.message || 'Unknown error'}`);
    } finally {
      setCmsSaving(false);
    }
  };

  // -------------------------
  // FILTERED USERS
  // -------------------------
  const filteredUsers = useMemo(() => {
    const query = q.trim().toLowerCase();

    return users
      .filter((u) => {
        const email = (u.email || '').toLowerCase();
        const r = (u.role || 'user').toLowerCase().trim();
        const active = u.is_active !== false;

        if (query && !email.includes(query)) return false;
        if (roleFilter !== 'all' && r !== roleFilter) return false;
        if (statusFilter === 'active' && !active) return false;
        if (statusFilter === 'inactive' && active) return false;

        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [users, q, roleFilter, statusFilter]);

  if (loading) return <div className="p-6">Loading dashboard…</div>;

  return (
    <div className="min-h-screen px-4 py-8 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white">
      <div className="w-full max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-3xl font-bold" style={{ color: primaryColor }}>
              {systemName} Admin
            </div>
            <div className="text-slate-600 text-sm">Role: {normRole}</div>
          </div>

          <div className="flex gap-2">
            <button
              className={[
                'px-3 py-2 rounded-lg border',
                cmsTab === 'dashboard' ? 'bg-black text-white' : 'bg-white/70 hover:bg-white',
              ].join(' ')}
              onClick={() => setCmsTab('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={[
                'px-3 py-2 rounded-lg border',
                cmsTab === 'cms' ? 'bg-black text-white' : 'bg-white/70 hover:bg-white',
              ].join(' ')}
              onClick={() => setCmsTab('cms')}
              disabled={!canManageCMS}
              title={!canManageCMS ? 'Only it_admin / super_admin' : 'Content Management'}
            >
              Content Management
            </button>

            <Link className="px-3 py-2 rounded-lg border bg-white/70 hover:bg-white" href="/upload">
              Back to Upload
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3">{error}</div>
        )}

        {/* DASHBOARD TAB */}
        {cmsTab === 'dashboard' && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white/60 border border-white/70 rounded-xl p-4">
                <div className="text-sm text-slate-600">Total Users</div>
                <div className="text-2xl font-bold">{totalUsers}</div>
              </div>
              <div className="bg-white/60 border border-white/70 rounded-xl p-4">
                <div className="text-sm text-slate-600">Total Runs</div>
                <div className="text-2xl font-bold">{totalRuns}</div>
              </div>
              <div className="bg-white/60 border border-white/70 rounded-xl p-4">
                <div className="text-sm text-slate-600">Runs Today</div>
                <div className="text-2xl font-bold">{todayRuns}</div>
              </div>
              <div className="bg-white/60 border border-white/70 rounded-xl p-4">
                <div className="text-sm text-slate-600">Your Role</div>
                <div className="text-2xl font-bold">{normRole}</div>
              </div>
            </div>

            {/* Recent runs */}
            <div className="bg-white/60 border border-white/70 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold">Recent Analysis Runs</div>
                <Link className="text-sm underline" href="/admin/runs">
                  View all
                </Link>
              </div>

              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">User</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Score</th>
                      <th className="py-2 pr-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.length === 0 ? (
                      <tr>
                        <td className="py-3" colSpan={5}>
                          No runs found.
                        </td>
                      </tr>
                    ) : (
                      runs.map((r) => (
                        <tr key={r.id} className="border-t border-white/60">
                          <td className="py-2 pr-3">{new Date(r.created_at).toLocaleString()}</td>
                          <td className="py-2 pr-3">{getEmail(r)}</td>
                          <td className="py-2 pr-3">
                            <Badge>{r.status || '—'}</Badge>
                          </td>
                          <td className="py-2 pr-3">{r.score ?? '—'}</td>
                          <td className="py-2 pr-3">
                            <button className="underline" onClick={() => router.push(`/admin/runs/${r.id}`)}>
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Users */}
            <div className="bg-white/60 border border-white/70 rounded-xl p-4">
              <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between mb-4">
                <div className="font-bold">Users</div>

                <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search email…"
                    className="px-3 py-2 rounded-lg border border-white/70 bg-white/70 w-full md:w-64"
                  />

                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value as any)}
                    className="px-3 py-2 rounded-lg border border-white/70 bg-white/70"
                  >
                    <option value="all">All roles</option>
                    <option value="user">user</option>
                    <option value="it_admin">it_admin</option>
                    <option value="super_admin">super_admin</option>
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="px-3 py-2 rounded-lg border border-white/70 bg-white/70"
                  >
                    <option value="all">All status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Deactivated</option>
                  </select>
                </div>
              </div>

              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600">
                      <th className="py-2 pr-3">Email</th>
                      <th className="py-2 pr-3">Role</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Created</th>
                      {canManageUsers && <th className="py-2 pr-3">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td className="py-3" colSpan={canManageUsers ? 5 : 4}>
                          No users match filters.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const currentRole = (u.role || 'user').toLowerCase().trim();
                        const active = u.is_active !== false;

                        return (
                          <tr key={u.id} className="border-t border-white/60">
                            <td className="py-2 pr-3">{u.email || '—'}</td>

                            <td className="py-2 pr-3">
                              {canChangeRoles ? (
                                <select
                                  value={currentRole}
                                  onChange={(e) => updateUserRole(u.id, e.target.value)}
                                  disabled={savingUserId === u.id}
                                  className="px-2 py-1 rounded-lg border border-white/70 bg-white/70"
                                >
                                  <option value="user">user</option>
                                  <option value="it_admin">it_admin</option>
                                  <option value="super_admin">super_admin</option>
                                </select>
                              ) : (
                                <Badge>{currentRole}</Badge>
                              )}
                            </td>

                            <td className="py-2 pr-3">
                              <Badge>{active ? 'Active' : 'Deactivated'}</Badge>
                            </td>

                            <td className="py-2 pr-3">{new Date(u.created_at).toLocaleDateString()}</td>

                            {canManageUsers && (
                              <td className="py-2 pr-3">
                                <button
                                  className={[
                                    'px-3 py-1.5 rounded-lg border',
                                    active
                                      ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                                      : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
                                  ].join(' ')}
                                  disabled={savingUserId === u.id}
                                  onClick={() => setConfirm({ open: true, userId: u.id, nextActive: !active })}
                                >
                                  {active ? 'Deactivate' : 'Activate'}
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Confirm modal */}
            {confirm.open && (
              <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 z-50">
                <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-white/60 p-5">
                  <div className="font-bold text-lg mb-2">
                    {confirm.nextActive ? 'Activate account?' : 'Deactivate account?'}
                  </div>
                  <div className="text-sm text-slate-600 mb-4">
                    {confirm.nextActive
                      ? 'This user will be able to login and use the system again.'
                      : 'This user will no longer be able to login or use the system.'}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      className="px-3 py-2 rounded-lg border bg-white hover:bg-black/5"
                      onClick={() => setConfirm({ open: false, userId: '', nextActive: false })}
                    >
                      Cancel
                    </button>
                    <button
                      className="px-3 py-2 rounded-lg border bg-black text-white hover:opacity-90"
                      onClick={async () => {
                        const { userId, nextActive } = confirm;
                        setConfirm({ open: false, userId: '', nextActive: false });
                        await toggleUserActive(userId, nextActive);
                      }}
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* CMS TAB */}
        {cmsTab === 'cms' && (
          <div className="space-y-6">
            {!canManageCMS && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-xl p-3">
                You do not have permission to manage content.
              </div>
            )}

            {cmsMsg && (
              <div className="bg-white/70 border border-white/70 rounded-xl p-3 text-sm">{cmsMsg}</div>
            )}

            {/* App settings */}
            <div className="bg-white/60 border border-white/70 rounded-xl p-4">
              <div className="font-bold mb-3">App Settings</div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-slate-600 mb-1">System Name</div>
                  <input
                    value={appSettingsDraft?.system_name ?? ''}
                    onChange={(e) =>
                      setAppSettingsDraft((prev) => (prev ? { ...prev, system_name: e.target.value } : prev))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-white/70 bg-white/70"
                    disabled={cmsSaving}
                  />
                </div>

                <div>
                  <div className="text-xs text-slate-600 mb-1">Logo URL</div>
                  <input
                    value={appSettingsDraft?.logo_url ?? ''}
                    onChange={(e) =>
                      setAppSettingsDraft((prev) => (prev ? { ...prev, logo_url: e.target.value } : prev))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-white/70 bg-white/70"
                    disabled={cmsSaving}
                  />
                </div>

                <div>
                  <div className="text-xs text-slate-600 mb-1">Primary Color</div>
                  <input
                    value={appSettingsDraft?.primary_color ?? ''}
                    onChange={(e) =>
                      setAppSettingsDraft((prev) => (prev ? { ...prev, primary_color: e.target.value } : prev))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-white/70 bg-white/70"
                    disabled={cmsSaving}
                    placeholder="#7C3AED"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={saveAppSettings}
                  disabled={cmsSaving || !canManageCMS}
                  className="px-4 py-2 rounded-lg border bg-black text-white hover:opacity-90 disabled:opacity-50"
                >
                  {cmsSaving ? 'Saving…' : 'Save Settings'}
                </button>
              </div>
            </div>

            {/* Pages */}
            <div className="bg-white/60 border border-white/70 rounded-xl p-4">
              <div className="font-bold mb-3">Content Pages</div>

              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600">
                      <th className="py-2 pr-3">Slug</th>
                      <th className="py-2 pr-3">Title</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages.length === 0 ? (
                      <tr>
                        <td className="py-3" colSpan={4}>
                          No pages found.
                        </td>
                      </tr>
                    ) : (
                      pages.map((p) => (
                        <tr key={p.id} className="border-t border-white/60">
                          <td className="py-2 pr-3">
                            <Badge>{p.slug}</Badge>
                          </td>
                          <td className="py-2 pr-3">{p.title}</td>
                          <td className="py-2 pr-3">
                            <Badge>{p.is_active ? 'Active' : 'Inactive'}</Badge>
                          </td>
                          <td className="py-2 pr-3 flex gap-2">
                            <button
                              className="underline"
                              onClick={() => setEditPage({ ...p })}
                              disabled={cmsSaving}
                            >
                              Edit
                            </button>
                            <button
                              className="underline"
                              onClick={() => togglePageActive(p.id, !p.is_active)}
                              disabled={cmsSaving}
                            >
                              {p.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FAQs */}
            <div className="bg-white/60 border border-white/70 rounded-xl p-4">
              <div className="font-bold mb-3">FAQs</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div>
                  <div className="text-xs text-slate-600 mb-1">New Question</div>
                  <input
                    value={newFaq.question}
                    onChange={(e) => setNewFaq((p) => ({ ...p, question: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-white/70 bg-white/70"
                    disabled={cmsSaving}
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-600 mb-1">New Answer</div>
                  <input
                    value={newFaq.answer}
                    onChange={(e) => setNewFaq((p) => ({ ...p, answer: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-white/70 bg-white/70"
                    disabled={cmsSaving}
                  />
                </div>
              </div>

              <div className="flex justify-end mb-4">
                <button
                  onClick={addFaq}
                  disabled={cmsSaving || !canManageCMS}
                  className="px-4 py-2 rounded-lg border bg-black text-white hover:opacity-90 disabled:opacity-50"
                >
                  {cmsSaving ? 'Saving…' : 'Add FAQ'}
                </button>
              </div>

              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600">
                      <th className="py-2 pr-3">Question</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faqs.length === 0 ? (
                      <tr>
                        <td className="py-3" colSpan={3}>
                          No FAQs found.
                        </td>
                      </tr>
                    ) : (
                      faqs.map((f) => (
                        <tr key={f.id} className="border-t border-white/60">
                          <td className="py-2 pr-3">
                            <div className="font-semibold text-slate-800">{f.question}</div>
                            <div className="text-slate-600">{f.answer}</div>
                          </td>
                          <td className="py-2 pr-3">
                            <Badge>{f.is_active ? 'Active' : 'Inactive'}</Badge>
                          </td>
                          <td className="py-2 pr-3 flex gap-2">
                            <button className="underline" onClick={() => setEditFaq({ ...f })} disabled={cmsSaving}>
                              Edit
                            </button>
                            <button
                              className="underline"
                              onClick={() => toggleFaqActive(f.id, !f.is_active)}
                              disabled={cmsSaving}
                            >
                              {f.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Edit Page Modal */}
            {editPage && (
              <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 z-50">
                <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-white/60 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-bold text-lg">
                      Edit Page: <span className="text-slate-600">{editPage.slug}</span>
                    </div>
                    <button className="px-3 py-1 rounded-lg border" onClick={() => setEditPage(null)}>
                      Close
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <div className="text-xs text-slate-600 mb-1">Title</div>
                      <input
                        value={editPage.title}
                        onChange={(e) => setEditPage((p) => (p ? { ...p, title: e.target.value } : p))}
                        className="w-full px-3 py-2 rounded-lg border border-white/70 bg-white/70"
                      />
                    </div>

                    <div>
                      <div className="text-xs text-slate-600 mb-1">Body</div>
                      <textarea
                        value={editPage.body}
                        onChange={(e) => setEditPage((p) => (p ? { ...p, body: e.target.value } : p))}
                        className="w-full px-3 py-2 rounded-lg border border-white/70 bg-white/70 min-h-[180px]"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editPage.is_active}
                        onChange={(e) => setEditPage((p) => (p ? { ...p, is_active: e.target.checked } : p))}
                      />
                      Active
                    </label>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <button className="px-4 py-2 rounded-lg border" onClick={() => setEditPage(null)} disabled={cmsSaving}>
                      Cancel
                    </button>
                    <button
                      className="px-4 py-2 rounded-lg border bg-black text-white hover:opacity-90 disabled:opacity-50"
                      onClick={saveContentPage}
                      disabled={cmsSaving}
                    >
                      {cmsSaving ? 'Saving…' : 'Save Page'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Edit FAQ Modal */}
            {editFaq && (
              <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 z-50">
                <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-white/60 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-bold text-lg">Edit FAQ #{editFaq.id}</div>
                    <button className="px-3 py-1 rounded-lg border" onClick={() => setEditFaq(null)}>
                      Close
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <div className="text-xs text-slate-600 mb-1">Question</div>
                      <input
                        value={editFaq.question}
                        onChange={(e) => setEditFaq((p) => (p ? { ...p, question: e.target.value } : p))}
                        className="w-full px-3 py-2 rounded-lg border border-white/70 bg-white/70"
                      />
                    </div>

                    <div>
                      <div className="text-xs text-slate-600 mb-1">Answer</div>
                      <textarea
                        value={editFaq.answer}
                        onChange={(e) => setEditFaq((p) => (p ? { ...p, answer: e.target.value } : p))}
                        className="w-full px-3 py-2 rounded-lg border border-white/70 bg-white/70 min-h-[140px]"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editFaq.is_active}
                        onChange={(e) => setEditFaq((p) => (p ? { ...p, is_active: e.target.checked } : p))}
                      />
                      Active
                    </label>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <button className="px-4 py-2 rounded-lg border" onClick={() => setEditFaq(null)} disabled={cmsSaving}>
                      Cancel
                    </button>
                    <button
                      className="px-4 py-2 rounded-lg border bg-black text-white hover:opacity-90 disabled:opacity-50"
                      onClick={saveFaq}
                      disabled={cmsSaving}
                    >
                      {cmsSaving ? 'Saving…' : 'Save FAQ'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}