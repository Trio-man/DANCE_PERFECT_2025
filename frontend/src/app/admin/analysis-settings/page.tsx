'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AnalysisSettingsRow = {
  id: number;
  excellent_threshold: number;
  good_threshold: number;
  acceptable_threshold: number;
};

export default function AdminAnalysisSettingsPage() {
  const router = useRouter();

  const [role, setRole] = useState<string | null>(null);
  const [row, setRow] = useState<AnalysisSettingsRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) {
        router.push('/login');
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      if (profErr) {
        setError(profErr.message);
        return;
      }

      const r = (prof?.role || 'user').toLowerCase();
      setRole(r);
      if (!['super_admin', 'it_admin'].includes(r)) return router.push('/admin');
        return;
      }

      const { data, error } = await supabase.from('analysis_settings').select('*').single();
      if (error) {
        setError(error.message);
        return;
      }

      setRow(data as AnalysisSettingsRow);
    };

    load();
  }, [router]);

  const save = async () => {
    if (!row) return;

    // Simple sanity checks (thesis-safe)
    if (row.excellent_threshold < 0 || row.good_threshold < 0 || row.acceptable_threshold < 0) {
      setError('Thresholds must be 0 or greater.');
      return;
    }
    if (!(row.excellent_threshold <= row.good_threshold && row.good_threshold <= row.acceptable_threshold)) {
      setError('Expected: excellent ≤ good ≤ acceptable.');
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from('analysis_settings')
      .update({
        excellent_threshold: row.excellent_threshold,
        good_threshold: row.good_threshold,
        acceptable_threshold: row.acceptable_threshold,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (error) setError(error.message);
    setSaving(false);
  };

  if (!row) return <div style={{ padding: 40 }}>Loading analysis settings...</div>;

  return (
    <div style={{ padding: 40 }}>
      <h1>Analysis Settings</h1>
      <p>Role: {role}</p>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <p style={{ marginTop: 10 }}>
        These thresholds can be adjusted by Super Admin to calibrate scoring based on expert feedback.
      </p>

      <div style={{ marginTop: 18 }}>
        <label>Excellent Threshold</label>
        <br />
        <input
          type="number"
          value={row.excellent_threshold}
          onChange={(e) => setRow({ ...row, excellent_threshold: Number(e.target.value) })}
          style={{ width: 180 }}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <label>Good Threshold</label>
        <br />
        <input
          type="number"
          value={row.good_threshold}
          onChange={(e) => setRow({ ...row, good_threshold: Number(e.target.value) })}
          style={{ width: 180 }}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <label>Acceptable Threshold</label>
        <br />
        <input
          type="number"
          value={row.acceptable_threshold}
          onChange={(e) => setRow({ ...row, acceptable_threshold: Number(e.target.value) })}
          style={{ width: 180 }}
        />
      </div>

      <button onClick={save} disabled={saving} style={{ marginTop: 22 }}>
        {saving ? 'Saving...' : 'Save Thresholds'}
      </button>

      <div style={{ marginTop: 20 }}>
        <button onClick={() => router.push('/admin')}>Back</button>
      </div>
    </div>
  );
}
