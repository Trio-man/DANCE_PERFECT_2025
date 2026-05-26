'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { FiUsers, FiCpu, FiTrendingUp, FiShield, FiSearch, FiEye, FiAlertCircle } from 'react-icons/fi';

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
  const styles = {
    default: "bg-slate-100 border-slate-200 text-slate-700",
    purple: "bg-violet-50 border-violet-100 text-violet-700",
    success: "bg-emerald-50 border-emerald-100 text-emerald-700",
    danger: "bg-rose-50 border-rose-100 text-rose-700"
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[variant]}`}>
      {children}
    </span>
  );
}

function isRole(value: string): value is 'all' | 'user' | 'it_admin' | 'super_admin' {
  return ['all', 'user', 'it_admin', 'super_admin'].includes(value);
}

function isStatus(value: string): value is 'all' | 'active' | 'inactive' {
  return ['all', 'active', 'inactive'].includes(value);
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
        const msg = typeof payload === 'object' && payload !== null && 'error' in payload
            ? String((payload as { error?: unknown }).error ?? '') : '';
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

  const updateUserRole = useCallback(async (userId: string, newRole: string) => {
    if (!canChangeRoles) return;
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
        const msg = typeof payload === 'object' && payload !== null && 'error' in payload
            ? String((payload as { error?: unknown }).error ?? '') : '';
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
  }, [canChangeRoles, getSessionToken, refreshUsers]);

  const toggleUserActive = useCallback(async (userId: string, nextActive: boolean) => {
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
        const msg = typeof payload === 'object' && payload !== null && 'error' in payload
            ? String((payload as { error?: unknown }).error ?? '') : '';
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
  }, [canManageUsers, getSessionToken, refreshUsers]);

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

      setRole((myProfile.role || 'user').toLowerCase().trim());

      const { data: runRows, error: runsErr } = await supabase
        .from('analysis_runs')
        .select(`id, user_id, created_at, status, score, summary_feedback, profile:profiles(email)`)
        .order('created_at', { ascending: false })
        .limit(50);

      setRuns(runsErr ? [] : (runRows ?? []) as unknown as RunRow[]);
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
      <div className="flex items-center justify-center py-12 text-slate-500 font-medium text-sm">
        <div className="animate-spin h-5 w-5 border-2 border-slate-300 border-t-slate-600 rounded-full mr-3" />
        Synchronizing system operations metrics...
      </div>
    );
  }

  return (
    <div className="space-y-8 w-full">
      
      {/* Page Title Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">System Overview Dashboard</h1>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-100 text-rose-800 rounded-xl p-3.5 text-sm font-medium flex items-center gap-2">
          <FiAlertCircle className="text-rose-500 shrink-0" size={16} />
          {error}
        </div>
      )}

      {/* KPI COUNTER METRICS BLOCK */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">Total Active Users</span>
            <span className="text-2xl font-bold text-slate-800 tracking-tight block mt-1">{users.length}</span>
          </div>
          <div className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-lg shadow-sm"><FiUsers size={18} /></div>
        </div>

        <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">Total Analysis Runs</span>
            <span className="text-2xl font-bold text-slate-800 tracking-tight block mt-1">{runs.length}</span>
          </div>
          <div className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-lg shadow-sm"><FiCpu size={18} /></div>
        </div>

        <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">Processed Today</span>
            <span className="text-2xl font-bold text-slate-800 tracking-tight block mt-1">{todayRuns}</span>
          </div>
          <div className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-lg shadow-sm"><FiTrendingUp size={18} /></div>
        </div>

        <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">Authorization Node</span>
            <span className="text-xs font-bold text-violet-700 bg-violet-50 border border-violet-100 rounded-md px-2 py-0.5 uppercase tracking-wide block w-fit mt-2">{normRole}</span>
          </div>
          <div className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-lg shadow-sm"><FiShield size={18} /></div>
        </div>
      </div>

      {/* RECENT ENGINE ANALYSIS TABLE */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-800">Recent Analysis Runs Logs</h2>
          <button onClick={() => router.push('/admin/runs')} className="text-xs font-semibold text-violet-600 hover:text-violet-700 transition-colors">
            View All Logs →
          </button>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-xs text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 bg-slate-50/30">
                <th className="py-2.5 px-4">Date & Time</th>
                <th className="py-2.5 px-4">User Email</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                <th className="py-2.5 px-4 text-center">Score</th>
                <th className="py-2.5 px-4 text-right pr-5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
              {runs.length === 0 ? (
                <tr>
                  <td className="py-6 text-center text-slate-400" colSpan={5}>No evaluation matrices recorded in cluster.</td>
                </tr>
              ) : (
                runs.map((r) => {
                  const statusNormalized = (r.status || 'pending').toLowerCase().trim();
                  const isDone = statusNormalized === 'done' || statusNormalized === 'completed';
                  const isFailed = statusNormalized === 'failed';

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="py-3 px-4 text-slate-400 font-normal">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="py-3 px-4 text-slate-800 font-semibold">{getEmail(r)}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={isDone ? 'success' : isFailed ? 'danger' : 'purple'}>
                          {r.status || 'pending'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-900">{r.score ?? '—'}</td>
                      <td className="py-3 px-4 text-right pr-5">
                        <button
                          className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded-md shadow-sm transition-all text-[11px]"
                          onClick={() => router.push(`/admin/runs/${r.id}`)}
                        >
                          <FiEye size={12} /> View File
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DIRECTORY PROFILE REGISTRY */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between px-4 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-800">Account Registry Directory</h2>

          <div className="flex flex-col sm:flex-row gap-2 items-center w-full lg:w-auto">
            <div className="relative w-full sm:w-56">
              <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search database emails..."
                className="pl-8 pr-3 py-1.5 w-full text-xs font-medium text-slate-700 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-slate-400 transition-all placeholder:text-slate-400"
              />
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              <select
                value={roleFilter}
                onChange={(e) => isRole(e.target.value) && setRoleFilter(e.target.value)}
                className="px-2 py-1.5 text-xs font-semibold text-slate-600 rounded-lg border border-slate-200 bg-white focus:outline-none cursor-pointer w-full sm:w-auto"
              >
                <option value="all">All Roles</option>
                <option value="user">User</option>
                <option value="it_admin">IT Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => isStatus(e.target.value) && setStatusFilter(e.target.value)}
                className="px-2 py-1.5 text-xs font-semibold text-slate-600 rounded-lg border border-slate-200 bg-white focus:outline-none cursor-pointer w-full sm:w-auto"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Deactivated</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-xs text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 bg-slate-50/30">
                <th className="py-2.5 px-4">User Email</th>
                <th className="py-2.5 px-4">System Role</th>
                <th className="py-2.5 px-4 text-center">Account Status</th>
                <th className="py-2.5 px-4">Joined Date</th>
                {canManageUsers && <th className="py-2.5 px-4 text-right pr-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td className="py-6 text-center text-slate-400" colSpan={canManageUsers ? 5 : 4}>No directory configurations match selected parameter maps.</td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const currentRole = (u.role || 'user').toLowerCase().trim();
                  const active = u.is_active !== false;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="py-3 px-4 text-slate-800 font-semibold">{u.email || '—'}</td>
                      <td className="py-3 px-4">
                        {canChangeRoles ? (
                          <select
                            value={currentRole}
                            onChange={(e) => updateUserRole(u.id, e.target.value)}
                            disabled={savingUserId === u.id}
                            className="px-2 py-1 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none cursor-pointer"
                          >
                            <option value="user">user</option>
                            <option value="it_admin">it_admin</option>
                            <option value="super_admin">super_admin</option>
                          </select>
                        ) : (
                          <Badge variant="purple">{currentRole}</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={active ? 'success' : 'danger'}>{active ? 'Active' : 'Suspended'}</Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-normal">{new Date(u.created_at).toLocaleDateString()}</td>
                      {canManageUsers && (
                        <td className="py-3 px-4 text-right pr-5">
                          <button
                            disabled={savingUserId === u.id}
                            onClick={() => setConfirm({ open: true, userId: u.id, nextActive: !active })}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-md border shadow-sm transition-colors ${
                              active ? 'bg-white border-rose-200 text-rose-600 hover:bg-rose-50' : 'bg-white border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                            }`}
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

      {/* Confirmatory Popups */}
      {confirm.open && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center px-4 z-50">
          <div className="w-full max-w-sm bg-white border border-slate-200 shadow-xl rounded-xl p-5">
            <h3 className="font-bold text-slate-900 text-sm">
              {confirm.nextActive ? 'Restore Account Access?' : 'Suspend Account Permissions?'}
            </h3>
            <p className="text-xs text-slate-500 leading-normal mt-1.5">
              {confirm.nextActive
                ? 'This profile token will recover functional authorization parameters immediately.'
                : 'This action immediately revokes active session configurations and terminates active authorization maps.'}
            </p>
            <div className="flex justify-end gap-2 mt-4 text-xs font-bold">
              <button
                className="px-3 py-1.5 text-slate-500 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100"
                onClick={() => setConfirm({ open: false, userId: '', nextActive: false })}
              >
                Cancel
              </button>
              <button
                className={`px-3 py-1.5 text-white rounded-md shadow-sm ${confirm.nextActive ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
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
    </div>
  );
}
