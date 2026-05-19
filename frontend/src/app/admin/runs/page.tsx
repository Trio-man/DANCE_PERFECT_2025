'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

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

  if (loading) return (
    <div className="p-8 text-slate-500 font-medium">Loading runs...</div>
  );

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Analysis Runs</h1>
          <p className="text-sm text-slate-500">{runs.length} total runs</p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search email, ID, status…"
          className="px-3 py-2 rounded-lg border border-white/70 bg-white/70 text-sm w-64"
        />
      </div>

      <div className="bg-white/60 border border-white/70 rounded-xl p-4">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/60">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">User</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Score</th>
                <th className="py-2 pr-4 font-medium">Summary</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No runs found.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-t border-white/60 hover:bg-white/40 transition-colors">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">{getEmail(r)}</td>
                    <td className="py-2 pr-4">
                      <span className={[
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        r.status === 'done'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      ].join(' ')}>
                        {r.status || 'pending'}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={[
                        'font-semibold',
                        (r.score ?? 0) >= 80 ? 'text-emerald-600' :
                        (r.score ?? 0) >= 50 ? 'text-amber-600' : 'text-red-500'
                      ].join(' ')}>
                        {r.score !== null ? `${r.score}%` : '—'}
                      </span>
                    </td>
                    <td className="py-2 pr-4 max-w-xs truncate text-slate-500">
                      {r.summary_feedback || '—'}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => router.push(`/admin/runs/${r.id}`)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium transition-colors"
                        >
                          View
                        </button>
                        <button
                          onClick={() => setConfirmDelete(r.id)}
                          disabled={deletingId === r.id}
                          className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          {deletingId === r.id ? 'Deleting…' : 'Delete'}
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

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 z-50">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-white/60 p-5">
            <div className="font-bold text-lg mb-2">Delete this run?</div>
            <div className="text-sm text-slate-600 mb-1">
              This will permanently delete the run record and its associated GIF files from the server.
            </div>
            <div className="text-xs font-mono text-slate-400 mb-4 truncate">{confirmDelete}</div>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-2 rounded-lg border bg-white hover:bg-black/5 text-sm"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-2 rounded-lg border bg-red-600 text-white hover:bg-red-700 text-sm font-medium"
                onClick={() => handleDelete(confirmDelete)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
