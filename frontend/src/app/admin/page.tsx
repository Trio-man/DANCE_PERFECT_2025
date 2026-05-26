'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { FiArrowLeft, FiUsers, FiCpu, FiTrendingUp, FiShield, FiSearch, FiSliders, FiEye } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;

type ProfileRow = {
  id: string;
  email: string | null;
  role: string | null;
  created_at: string;
  is_active?: boolean | null;
  display_name?: string | null;
};

type RunRow = {
  id: string;
  user_id: string;
  created_at: string;
  status: string | null;
  score: number | null;
  summary_feedback: string | null;
  profile: { email: string | null } | { email: string | null }[] | null;
};

function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'purple' | 'success' | 'danger' }) {
  const baseStyle = "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border tracking-wide shadow-sm";
  const styles = {
    default: "bg-slate-100/80 border-slate-200 text-slate-700",
    purple: "bg-violet-50/80 border-violet-200 text-violet-700",
    success: "bg-emerald-50/80 border-emerald-200 text-emerald-700",
    danger: "bg-rose-50/80 border-rose-200 text-rose-700"
  };

  return (
    <span className={`${baseStyle} ${styles[variant]}`}>
      {children}
    </span>
  );
}

function isRole(value: string): value is 'all' | 'user' | 'it_admin' | 'super_admin' {
  return ['all', 'user', 'it_admin', 'super_admin'].includes(value);
}

function isStatus(value: string): value is 'all' | 'active' | 'inactive' {
  return ['all', 'all', 'active', 'inactive'].includes(value);
}

export default function AdminDashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>('user');

  const normRole = (role || '').toLowerCase().trim();
  const canManageUsers = ['super_admin', 'it_admin'].includes(normRole);
  const canChangeRoles = normRole === 'super_admin';

  const [runs, setRuns] = useState<RunRow[]>([]);
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'it_admin' | 'super_admin'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [confirm, setConfirm] = useState<{ open: boolean; userId: string; nextActive: boolean }>({
    open: false,
    userId: '',
    nextActive: false,
  });

  const getEmail = (r: RunRow) => {
    if (!r.profile) return '—';
    return Array.isArray(r.profile) ? (r.profile[0]?.email ?? '—') : (r.profile.email ?? '—');
  };

  const safeReadJson = async (res: Response): Promise<unknown> => {
    try {
      return await res.json();
    } catch {
      return null;
    }
  };

  const getSessionToken = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }, []);

  const refreshUsers = useCallback(async () => {
    setError(null);

    const token = await getSessionToken();
    if (!token) {
      setError('No session token. Please login again.');
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = await safeReadJson(res);

      if (!res.ok) {
        const msg =
          typeof payload === 'object' && payload !== null && 'error' in payload
            ? String((payload as { error?: unknown }).error ?? '')
            : '';

        setError(msg || `Failed to load users from backend. (${res.status})`);
        setUsers([]);
        return;
      }

      if (typeof payload === 'object' && payload !== null && 'users' in payload) {
        setUsers(((payload as { users?: unknown }).users ?? []) as ProfileRow[]);
      } else {
        setUsers([]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch';
      setError(`Backend not reachable: ${msg}`);
      setUsers([]);
    }
  }, [getSessionToken]);

  const updateUserRole = useCallback(
    async (userId: string, newRole: string) => {
      if (!canChangeRoles) return;
      if (!['user', 'it_admin', 'super_admin'].includes(newRole)) return;

      setSavingUserId(userId);
      setError(null);

      const token = await getSessionToken();
      if (!token) {
        setError('No session token. Please login again.');
        setSavingUserId(null);
        return;
      }

      try {
        const res = await fetch(`${BACKEND_URL}/admin/users/${userId}/role`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ role: newRole }),
        });

        const payload = await safeReadJson(res);

        if (!res.ok) {
          const msg =
            typeof payload === 'object' && payload !== null && 'error' in payload
              ? String((payload as { error?: unknown }).error ?? '')
              : '';

          setError(msg || `Failed to update role. (${res.status})`);
          setSavingUserId(null);
          return;
        }

        await refreshUsers();
        setSavingUserId(null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to fetch';
        setError(`Backend not reachable: ${msg}`);
        setSavingUserId(null);
      }
    },
    [canChangeRoles, getSessionToken, refreshUsers]
  );

  const toggleUserActive = useCallback(
    async (userId: string, nextActive: boolean) => {
      if (!canManageUsers) return;

      setSavingUserId(userId);
      setError(null);

      const token = await getSessionToken();
      if (!token) {
        setError('No session token. Please login again.');
        setSavingUserId(null);
        return;
      }

      const endpoint = nextActive
        ? `${BACKEND_URL}/admin/users/${userId}/activate`
        : `${BACKEND_URL}/admin/users/${userId}/deactivate`;

      try {
        const res = await fetch(endpoint, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        });

        const payload = await safeReadJson(res);

        if (!res.ok) {
          const msg =
            typeof payload === 'object' && payload !== null && 'error' in payload
              ? String((payload as { error?: unknown }).error ?? '')
              : '';

          setError(msg || `Failed to update active status. (${res.status})`);
          setSavingUserId(null);
          return;
        }

        await refreshUsers();
        setSavingUserId(null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to fetch';
        setError(`Backend not reachable: ${msg}`);
        setSavingUserId(null);
      }
    },
    [canManageUsers, getSessionToken, refreshUsers]
  );

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
      } else {
        setRuns((runRows ?? []) as unknown as RunRow[]);
      }

      await refreshUsers();
      setLoading(false);
    };

    load();
  }, [router, refreshUsers]);

  const todayRuns = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return runs.filter((r) => new Date(r.created_at).getTime() >= startOfDay).length;
  }, [runs]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white antialiased">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 rounded-full border-4 border-slate-200 border-t-violet-600 mx-auto mb-4" />
          <p className="text-slate-700 font-bold text-base tracking-wide">Loading dashboard telemetry maps...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start px-4 md:px-8 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white antialiased selection:bg-violet-200">
      <div className="w-full max-w-7xl flex flex-col gap-8 py-8 md:py-12">
        
        {/* Top Header Row */}
        <div className="flex items-center justify-between w-full">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.back()} 
            className="text-slate-500 hover:text-slate-800 transition-colors p-2.5 rounded-xl bg-white/80 border border-white shadow-sm flex items-center gap-2 text-sm font-bold"
            aria-label="Go back"
          >
            <FiArrowLeft size={18} className="text-violet-500" />
            Back to Application
          </motion.button>
          
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-800 flex items-center gap-2">
            System Administration
          </h1>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 text-sm font-medium shadow-sm">{error}</div>
        )}

        {/* ─── 1. KPI COUNTER SUMMARY METRICS ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white/80 backdrop-blur-xl border border-white shadow-lg shadow-slate-200/40 rounded-2xl p-5 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Total System Users</div>
              <div className="text-3xl font-black text-slate-800 mt-1">{users.length}</div>
            </div>
            <div className="p-3 bg-violet-50 rounded-xl border border-violet-100 text-violet-500"><FiUsers size={22} /></div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white/80 backdrop-blur-xl border border-white shadow-lg shadow-slate-200/40 rounded-2xl p-5 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Analysis Runs</div>
              <div className="text-3xl font-black text-slate-800 mt-1">{runs.length}</div>
            </div>
            <div className="p-3 bg-violet-50 rounded-xl border border-violet-100 text-violet-500"><FiCpu size={22} /></div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white/80 backdrop-blur-xl border border-white shadow-lg shadow-slate-200/40 rounded-2xl p-5 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Analysis Runs Today</div>
              <div className="text-3xl font-black text-slate-800 mt-1">{todayRuns}</div>
            </div>
            <div className="p-3 bg-violet-50 rounded-xl border border-violet-100 text-violet-500"><FiTrendingUp size={22} /></div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white/80 backdrop-blur-xl border border-white shadow-lg shadow-slate-200/40 rounded-2xl p-5 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Your Current Role</div>
              <div className="text-lg font-extrabold text-violet-600 uppercase tracking-wide mt-2 bg-violet-50 border border-violet-100 px-3 py-1 rounded-lg w-fit">{normRole}</div>
            </div>
            <div className="p-3 bg-violet-50 rounded-xl border border-violet-100 text-violet-500"><FiShield size={22} /></div>
          </motion.div>
        </div>

        {/* ─── 2. RECENT RUNS TRACKING INTERFACE ─── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white/80 backdrop-blur-xl border border-white shadow-xl shadow-slate-200/50 rounded-3xl p-5 md:p-6">
          <div className="flex items-center justify-between mb-5 px-1">
            <h2 className="text-lg md:text-xl font-bold text-slate-800 tracking-tight">Recent Analysis Engines</h2>
            <Link className="text-xs font-bold text-violet-600 hover:text-violet-800 bg-violet-50 border border-violet-100 px-3 py-1.5 rounded-xl transition-colors" href="/admin/runs">
              View All Logs
            </Link>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="text-slate-400 uppercase text-xs font-bold tracking-wider border-b border-slate-100 bg-slate-50/50">
                  <th className="py-3 px-4">Date Time Stamp</th>
                  <th className="py-3 px-4">User Identifier</th>
                  <th className="py-3 px-4 text-center">Engine Status</th>
                  <th className="py-3 px-4 text-center">Score Metric</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/60 font-medium text-slate-700">
                {runs.length === 0 ? (
                  <tr>
                    <td className="py-6 text-center text-slate-400" colSpan={5}>No analysis runs detected in system.</td>
                  </tr>
                ) : (
                  runs.map((r) => (
                    <tr key={r.id} className="hover:bg-white/70 transition-colors">
                      <td className="py-3.5 px-4 text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">{getEmail(r)}</td>
                      <td className="py-3.5 px-4 text-center">
                        <Badge variant={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'danger' : 'purple'}>
                          {r.status || '—'}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-center font-black text-slate-800">{r.score ?? '—'}</td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          className="text-violet-600 hover:text-violet-800 font-bold text-xs flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 px-2.5 py-1.5 rounded-lg border border-violet-100 ml-auto transition-all"
                          onClick={() => router.push(`/admin/runs/${r.id}`)}
                        >
                          <FiEye size={13} /> View File
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* ─── 3. USER MANAGEMENT PROFILE DIRECTORY ─── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white/80 backdrop-blur-xl border border-white shadow-xl shadow-slate-200/50 rounded-3xl p-5 md:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between mb-6 px-1">
            <h2 className="text-lg md:text-xl font-bold text-slate-800 tracking-tight">Active Accounts Registry</h2>

            {/* Comprehensive Toolbar Filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-center w-full lg:w-auto">
              <div className="relative w-full sm:w-64">
                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Query directory email..."
                  className="pl-10 pr-4 py-2 w-full text-sm font-medium text-slate-700 rounded-xl border border-slate-200 bg-white/90 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all placeholder:text-slate-400"
                />
              </div>

              <div className="flex gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-initial">
                  <select
                    value={roleFilter}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (isRole(v)) setRoleFilter(v);
                    }}
                    className="px-3 py-2 pr-8 w-full text-xs md:text-sm font-bold text-slate-700 rounded-xl border border-slate-200 bg-white/90 focus:outline-none appearance-none cursor-pointer hover:bg-white"
                  >
                    <option value="all">All Roles</option>
                    <option value="user">User</option>
                    <option value="it_admin">IT Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                  <FiSliders className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
                </div>

                <div className="relative flex-1 sm:flex-initial">
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (isStatus(v)) setStatusFilter(v);
                    }}
                    className="px-3 py-2 pr-8 w-full text-xs md:text-sm font-bold text-slate-700 rounded-xl border border-slate-200 bg-white/90 focus:outline-none appearance-none cursor-pointer hover:bg-white"
                  >
                    <option value="all">All Lifecycles</option>
                    <option value="active">Active Accounts</option>
                    <option value="inactive">Deactivated</option>
                  </select>
                  <FiSliders className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="text-slate-400 uppercase text-xs font-bold tracking-wider border-b border-slate-100 bg-slate-50/50">
                  <th className="py-3 px-4">Account Workspace Email</th>
                  <th className="py-3 px-4">Assigned Authority Role</th>
                  <th className="py-3 px-4 text-center">Lifecycle Status</th>
                  <th className="py-3 px-4">Created Date</th>
                  {canManageUsers && <th className="py-3 px-4 text-right">Administrative Interventions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/60 font-medium text-slate-700">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td className="py-6 text-center text-slate-400" colSpan={canManageUsers ? 5 : 4}>No workspace user parameters match criteria filters.</td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const currentRole = (u.role || 'user').toLowerCase().trim();
                    const active = u.is_active !== false;

                    return (
                      <tr key={u.id} className="hover:bg-white/70 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-800">{u.email || '—'}</td>

                        <td className="py-3.5 px-4">
                          {canChangeRoles ? (
                            <select
                              value={currentRole}
                              onChange={(e) => updateUserRole(u.id, e.target.value)}
                              disabled={savingUserId === u.id}
                              className="px-2.5 py-1 text-xs font-bold text-slate-700 rounded-lg border border-slate-200 bg-white focus:outline-none cursor-pointer hover:border-violet-300 transition-colors"
                            >
                              <option value="user">user</option>
                              <option value="it_admin">it_admin</option>
                              <option value="super_admin">super_admin</option>
                            </select>
                          ) : (
                            <Badge variant="purple">{currentRole}</Badge>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <Badge variant={active ? 'success' : 'danger'}>{active ? 'Active' : 'Deactivated'}</Badge>
                        </td>

                        <td className="py-3.5 px-4 text-xs text-slate-500">{new Date(u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</td>

                        {canManageUsers && (
                          <td className="py-3.5 px-4 text-right">
                            <button
                              className={[
                                'px-3 py-1.5 text-xs font-bold rounded-xl border transition-all duration-200 shadow-sm',
                                active
                                  ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
                              ].join(' ')}
                              disabled={savingUserId === u.id}
                              onClick={() =>
                                setConfirm({ open: true, userId: u.id, nextActive: !active })
                              }
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
        </motion.div>

      </div>

      {/* Confirmation Modal Overlay */}
      <AnimatePresence>
        {confirm.open && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center px-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="w-full max-w-md bg-white border border-slate-100 shadow-2xl rounded-2xl p-6">
              <div className="font-extrabold text-slate-800 text-lg mb-2">
                {confirm.nextActive ? 'Activate account workspace?' : 'Deactivate account workspace?'}
              </div>
              <div className="text-sm font-medium text-slate-500 leading-relaxed mb-5">
                {confirm.nextActive
                  ? 'This profile token will recover immediate permissions parameters to initialize core operations on the application.'
                  : 'This terminal identity lock out overrides ongoing session authorizations immediately. User will be blocked.'}
              </div>
              <div className="flex justify-end gap-2.5">
                <button
                  className="px-4 py-2 text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all"
                  onClick={() => setConfirm({ open: false, userId: '', nextActive: false })}
                >
                  Cancel Interrupt
                </button>
                <button
                  className={`px-4 py-2 text-xs font-bold text-white rounded-xl shadow-md transition-all ${confirm.nextActive ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                  onClick={async () => {
                    const { userId, nextActive } = confirm;
                    setConfirm({ open: false, userId: '', nextActive: false });
                    await toggleUserActive(userId, nextActive);
                  }}
                >
                  Confirm Action
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
