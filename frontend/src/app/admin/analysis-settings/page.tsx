'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { FiSliders, FiAlertCircle, FiCheckCircle, FiSave, FiCornerUpLeft, FiInfo } from 'react-icons/fi';

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
  const [saveSuccess, setSaveSuccess] = useState(false);

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
      if (!['super_admin', 'it_admin'].includes(r)) {
        router.push('/admin');
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

    // Simple sanity checks (thesis-safe validation matrix)
    if (row.excellent_threshold < 0 || row.good_threshold < 0 || row.acceptable_threshold < 0) {
      setError('Threshold parameter metrics must be 0 or greater.');
      return;
    }
    if (!(row.excellent_threshold <= row.good_threshold && row.good_threshold <= row.acceptable_threshold)) {
      setError('Invalid logical order. Expected configuration boundary: Excellent ≤ Good ≤ Acceptable.');
      return;
    }

    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    const { error } = await supabase
      .from('analysis_settings')
      .update({
        excellent_threshold: row.excellent_threshold,
        good_threshold: row.good_threshold,
        acceptable_threshold: row.acceptable_threshold,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (error) {
      setError(error.message);
    } else {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
    setSaving(false);
  };

  if (!row) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 font-medium text-sm">
        <div className="animate-spin h-5 w-5 border-2 border-slate-300 border-t-slate-600 rounded-full mr-3" />
        Loading analytical validation matrices...
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-3xl">
      
      {/* Upper Title Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Analysis Settings</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Calibrate core mechanical engine algorithm scores based on domain expert parameters.
          </p>
        </div>
        <button
          onClick={() => router.push('/admin')}
          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all w-full sm:w-auto justify-center"
        >
          <FiCornerUpLeft size={14} />
          Back to Dashboard
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-100 text-rose-800 rounded-xl p-3.5 text-sm font-medium flex items-center gap-2">
          <FiAlertCircle className="text-rose-500 shrink-0" size={16} />
          {error}
        </div>
      )}

      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-3.5 text-sm font-medium flex items-center gap-2 transition-all">
          <FiCheckCircle className="text-emerald-500 shrink-0" size={16} />
          Engine algorithmic thresholds updated successfully.
        </div>
      )}

      {/* Information Banner block */}
      <div className="bg-blue-50/60 border border-blue-100/70 rounded-xl p-4 flex items-start gap-2.5 text-blue-800">
        <FiInfo className="text-blue-500 shrink-0 mt-0.5" size={16} />
        <p className="text-xs font-medium leading-relaxed">
          These limits adjust performance evaluations generated inside analytical pipelines. Changing these numbers directly recalculates status ranges immediately across all public evaluation runs.
        </p>
      </div>

      {/* Primary Configuration Workspace Panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 md:p-6 shadow-sm space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          
          {/* Excellent Limit Setting Row */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Excellent Threshold</label>
            <div className="relative">
              <input
                type="number"
                step="any"
                value={row.excellent_threshold}
                onChange={(e) => setRow({ ...row, excellent_threshold: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:ring-0 transition-all"
              />
            </div>
            <span className="text-[10px] text-slate-400 block font-medium leading-tight">
              Maximum tolerance limit for premium grading tier evaluations.
            </span>
          </div>

          {/* Good Limit Setting Row */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Good Threshold</label>
            <div className="relative">
              <input
                type="number"
                step="any"
                value={row.good_threshold}
                onChange={(e) => setRow({ ...row, good_threshold: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:ring-0 transition-all"
              />
            </div>
            <span className="text-[10px] text-slate-400 block font-medium leading-tight">
              Intermediate target mapping value index boundary.
            </span>
          </div>

          {/* Acceptable Limit Setting Row */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Acceptable Threshold</label>
            <div className="relative">
              <input
                type="number"
                step="any"
                value={row.acceptable_threshold}
                onChange={(e) => setRow({ ...row, acceptable_threshold: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:ring-0 transition-all"
              />
            </div>
            <span className="text-[10px] text-slate-400 block font-medium leading-tight">
              Baseline limit floor before classification tags fall into variance warnings.
            </span>
          </div>

        </div>

        {/* Action Triggers Grid Footer */}
        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="w-full sm:w-auto px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:bg-slate-300 text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all"
          >
            {saving ? (
              <>
                <div className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full" />
                Saving Framework Values...
              </>
            ) : (
              <>
                <FiSave size={14} />
                Save Thresholds
              </>
            )}
          </button>
        </div>

      </div>

    </div>
  );
}
