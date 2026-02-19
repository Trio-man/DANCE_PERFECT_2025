'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type RunRow = {
  id: string;
  user_id: string;
  created_at: string;
  status: string | null;
  score: number | null;
  summary_feedback: string | null;
  run_folder: string | null;
  result_json: any | null;
};

export default function AdminRunDetailPage() {
  const router = useRouter();
  const params = useParams();
  const runId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<RunRow | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) {
        router.push('/login');
        return;
      }

      console.log("AUTH USER ID:", authData.user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      const role = (profile?.role || 'user').toLowerCase();
      const isAdmin = ['admin', 'super_admin', 'it_admin'].includes(role);

      if (!isAdmin) {
        router.push('/upload');
        return;
      }

      const { data } = await supabase
        .from('analysis_runs')
        .select('*')
        .eq('id', runId)
        .single();

      setRun(data as RunRow);
      setLoading(false);
    };

    if (runId) load();
  }, [runId, router]);

  if (loading) return <div style={{ padding: 40 }}>Loading run...</div>;
  if (!run) return <div style={{ padding: 40 }}>Run not found.</div>;

  return (
    <div style={{ padding: 40 }}>
      <h1>Run Details</h1>

      <button onClick={() => router.push('/admin')}>
        Back to Dashboard
      </button>

      <hr style={{ margin: '20px 0' }} />

      <p><b>Run ID:</b> {run.id}</p>
      <p><b>User ID:</b> {run.user_id}</p>
      <p><b>Status:</b> {run.status}</p>
      <p><b>Score:</b> {run.score}</p>
      <p><b>Created:</b> {new Date(run.created_at).toLocaleString()}</p>

      <hr style={{ margin: '20px 0' }} />

      <h3>Summary Feedback</h3>
      <div style={{ border: '1px solid #ccc', padding: 10 }}>
        {run.summary_feedback || '—'}
      </div>

      <h3 style={{ marginTop: 20 }}>Result JSON</h3>
      <pre style={{ border: '1px solid #ccc', padding: 10 }}>
        {run.result_json
          ? JSON.stringify(run.result_json, null, 2)
          : '—'}
      </pre>
    </div>
  );
}