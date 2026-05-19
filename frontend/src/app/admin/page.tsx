'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ✅ Fixed: Changed prefix to NEXT_PUBLIC_ so it securely exposes the API endpoint to the browser
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-black/5 border border-black/10 text-xs">
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

  // Derived tracking values using useMemo arrays
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

  if (loading) return <div className="p-8 text-slate-500 font-medium">Loading dashboard telemetry maps…</div>;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3">{error}</div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white/60 border border-white/70 rounded-xl p-4">
          <div className="text-sm text-slate-600">Total Users</div>
          <div className="text-2xl font-bold">{users.length}</div>
        </div>
        <div className="bg-white/60 border border-white/70 rounded-xl p-4">
          <div className="text-sm text-slate-600">Total Runs</div>
          <div className="text-2xl font-bold">{runs.length}</div>
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
                      <button
                        className="underline"
                        onClick={() => router.push(`/admin/runs/${r.id}`)}
                      >
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

      {/* Users table */}
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
              onChange={(e) => {
                const v = e.target.value;
                if (isRole(v)) setRoleFilter(v);
              }}
              className="px-3 py-2 rounded-lg border border-white/70 bg-white/70"
            >
              <option value="all">All roles</option>
              <option value="user">user</option>
              <option value="it_admin">it_admin</option>
              <option value="super_admin">super_admin</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                const v = e.target.value;
                if (isStatus(v)) setStatusFilter(v);
              }}
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
                              'px-3 py-1.5 rounded-lg border transition-colors',
                              active
                                ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
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
      </div>

      {/* Confirmation Modal */}
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
    </div>
  );
}
