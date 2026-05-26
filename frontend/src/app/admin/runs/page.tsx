'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { FiSearch, FiEye, FiTrash2, FiAlertCircle, FiActivity } from 'react-icons/fi';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://danceperfect.duckdns.org';

type RunRow = {
  id: string;
  user_id: string;
  created_at: string;
  status: string | null;
  score: number | null;
  summary_feedback: string | null;
  profile?: { email: string | null } | { email: string | null }[] | null;
};

export default function AdminRunsPage() {
  const router = useRouter();

  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const getEmail = (r: RunRow) => {
    if (!r.profile) return r.user_id.slice(0, 8) + '…';
    return Array.isArray(r.profile)
      ? (r.profile[0]?.email ?? '—')
      : (r.profile.email ?? '—');
  };

  const fetchRuns = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('analysis_runs')
      .select(`
        id,
        user_id,
        created_at,
        status,
        score,
        summary_feedback,
        profile:profiles(email)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (err) {
      setError(err.message);
      setRuns([]);
    } else {
      setRuns((data ?? []) as unknown as RunRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) { router.push('/login'); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      const role = (profile?.role || 'user').toLowerCase();
      if (!['super_admin', 'it_admin'].includes(role)) {
        router.push('/upload');
        return;
      }

      await fetchRuns();
    };
    init();
  }, [router, fetchRuns]);

  const handleDelete = async (runId: string) => {
    setDeletingId(runId);
    setConfirmDelete(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(`${BACKEND_URL}/admin/runs/${runId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.message || `Delete failed (${res.status})`);
      } else {
        setRuns((prev) => prev.filter((r) => r.id !== runId));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = runs.filter((r) => {
    const query = q.trim().toLowerCase();
    if (!query) return true;
    return (
      getEmail(r).toLowerCase().includes(query) ||
      r.id.toLowerCase().includes(query) ||
      (r.status || '').toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 font-medium text-sm=w-full">
        <div className="animate-spin h-5 w-5 border-2 border-slate-300 border-t-slate-600 rounded-full mr-3" />
        Loading system execution passes...
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5">
      {error && (
        <div className="bg-rose-50 border border-rose-100 text-rose-800 rounded-xl p-3.5 text-sm font-medium flex items-center gap-2">
          <FiAlertCircle className="text-rose-500 shrink-0" size={16} />
          {error}
        </div>
      )}

      {/* Control Actions Header Block */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FiActivity className="text-slate-500" size={20} />
            Analysis Runs
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{runs.length} total operational profiles recorded</p>
        </div>
        <div className="relative w-full sm:w-64">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email, ID, execution status…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:outline-none focus:border-slate-400 shadow-xs transition-all"
          />
        </div>
      </div>

      {/* Primary Logging Matrix Wrapper */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/70 text-slate-500 font-bold border-b border-slate-100 uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4 font-bold">Execution Date</th>
                <th className="py-3 px-4 font-bold">User Identity Node</th>
                <th className="py-3 px-4 font-bold">Status Flags</th>
                <th className="py-3 px-4 font-bold">Performance Metric</th>
                <th className="py-3 px-4 font-bold">Automated Feedback Profile</th>
                <th className="py-3 px-4 font-bold text-right">Terminal Scope</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-normal text-xs">
                    No matching pipeline run operations found in the current buffer.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{getEmail(r)}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                        r.status === 'done' || r.status === 'success'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          : 'bg-amber-50 text-amber-700 border border-amber-100'
                      }`}>
                        {r.status || 'pending'}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`font-mono font-bold text-sm ${
                        (r.score ?? 0) >= 80 ? 'text-emerald-600' :
                        (r.score ?? 0) >= 50 ? 'text-amber-500' : 'text-rose-500'
                      }`}>
                        {r.score !== null ? `${r.score}%` : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-slate-400 font-normal italic">
                      {r.summary_feedback || 'No pipeline notation provided.'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => router.push(`/admin/runs/${r.id}`)}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-2xs flex items-center gap-1 font-bold transition-all"
                          title="Inspect Vectors"
                        >
                          <FiEye size={13} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(r.id)}
                          disabled={deletingId === r.id}
                          className="p-1.5 rounded-lg border border-rose-100 bg-rose-50 text-rose-600 hover:text-rose-800 hover:bg-rose-100 disabled:opacity-40 transition-all"
                          title="Purge Record"
                        >
                          <FiTrash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm Purge Vector Overlay Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 p-5 space-y-4">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Purge Selected Execution Pass?</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                This will permanently delete the pipeline run logs and its associated posture deviation file mappings from local servers. This operational behavior is irreversible.
              </p>
            </div>
            <div className="bg-slate-50 p-2 rounded-md border border-slate-100 text-[10px] font-mono text-slate-400 truncate">
              ID: {confirmDelete}
            </div>
            <div className="flex justify-end gap-2 text-xs font-bold">
              <button
                className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel Action
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 shadow-sm transition-all"
                onClick={() => handleDelete(confirmDelete)}
              >
                Confirm System Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
