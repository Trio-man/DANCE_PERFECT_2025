'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, User } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import {
  FiArrowLeft,
  FiTrash2,
  FiEye,
  FiClock,
  FiActivity,
  FiCalendar,
  FiRefreshCw,
} from 'react-icons/fi';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AnalysisRow = {
  id: string;
  user_id: string;
  created_at: string;
  status: string | null;
  score: number | null;
  summary_feedback: string | null;
  processing_time_seconds: number | null;
  result_json: any;
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatProcessingTime(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return 'N/A';

  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;

  if (minutes > 0) {
    return `${minutes} min ${remainingSeconds} sec`;
  }

  return `${remainingSeconds} sec`;
}

export default function UserDashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [runs, setRuns] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = async () => {
    setLoading(true);
    setError(null);

    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      router.replace('/login');
      return;
    }

    setUser(authData.user);

    const { data, error } = await supabase
      .from('analysis_runs')
      .select(
        'id,user_id,created_at,status,score,summary_feedback,processing_time_seconds,result_json'
      )
      .eq('user_id', authData.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      setError(error.message);
      setRuns([]);
    } else {
      setRuns((data ?? []) as AnalysisRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const handleViewResult = (run: AnalysisRow) => {
    const json = run.result_json ?? {};

    const deviationMoments = Array.isArray(json.deviation_moments)
      ? json.deviation_moments
      : Array.isArray(json.detected_deviations)
        ? json.detected_deviations.map((item: any, index: number) => ({
            rank: index + 1,
            issue: `Incorrect ${item.body_part ?? 'Body Joint'} position sequence.`,
            recommendation: `Review and adjust ${item.body_part ?? 'this movement'} based on the reference guide.`,
            user_time_clip_label:
              item.user_time_clip_label ?? `Frame ${item.user_start_frame ?? 'N/A'}`,
            gif_path: item.gif_path ?? '',
          }))
        : [];

    const resultForResultsPage = {
      status: run.status ?? 'done',
      run_id: run.id,
      processing_time_seconds:
        run.processing_time_seconds ?? json.processing_time_seconds ?? null,
      processing_time_display:
        json.processing_time_display ??
        formatProcessingTime(run.processing_time_seconds ?? json.processing_time_seconds),
      dtw_distance: json.dtw_distance ?? 0,
      dtw_similarity_score: Number(run.score ?? json.dtw_similarity_score ?? 0),
      summaries: {
        what_went_well:
          json.summaries?.what_went_well ??
          json.summary_good ??
          'Analysis completed successfully.',
        where_to_improve:
          run.summary_feedback ??
          json.summaries?.where_to_improve ??
          json.summary_bad ??
          'Review the highlighted deviation moments.',
      },
      deviation_moments: deviationMoments,
    };

    localStorage.setItem('analysis_results', JSON.stringify(resultForResultsPage));
    router.push('/results');
  };

  const handleDelete = async (runId: string) => {
    if (!user) return;

    const confirmed = window.confirm(
      'Delete this analysis from your dashboard? This will remove the analysis record, but old GIF files will be cleaned by the server schedule.'
    );

    if (!confirmed) return;

    setDeletingId(runId);
    setError(null);

    const { error } = await supabase
      .from('analysis_runs')
      .delete()
      .eq('id', runId)
      .eq('user_id', user.id);

    if (error) {
      setError(error.message);
    } else {
      setRuns((prev) => prev.filter((run) => run.id !== runId));
    }

    setDeletingId(null);
  };

  return (
    <div className="min-h-screen px-4 py-10 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => router.push('/upload')}
            className="flex items-center gap-2 text-purple-700 font-semibold hover:text-purple-900 transition-all"
          >
            <FiArrowLeft /> Back to Upload
          </button>

          <button
            onClick={loadRuns}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-white/70 border border-white/60 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-white transition"
          >
            <FiRefreshCw className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/70 backdrop-blur-md border border-white/60 shadow-xl rounded-3xl p-8"
        >
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-slate-900">
                My Dashboard
              </h1>
              <p className="text-slate-500 mt-2 text-sm">
                View your previous DancePerfect analysis results.
              </p>
            </div>

            <div className="bg-purple-100/60 border border-purple-200 rounded-2xl px-5 py-3">
              <p className="text-xs text-purple-500 font-semibold uppercase tracking-wider">
                Total Runs
              </p>
              <p className="text-2xl font-black text-purple-700">
                {runs.length}
              </p>
            </div>
          </div>
        </motion.div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-5 py-3 text-sm font-medium">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white/70 border border-white/60 rounded-3xl p-10 text-center shadow-lg">
            <div className="animate-spin h-10 w-10 rounded-full border-4 border-slate-200 border-t-slate-800 mx-auto mb-4" />
            <p className="text-slate-600 font-semibold">Loading analysis history...</p>
          </div>
        ) : runs.length === 0 ? (
          <div className="bg-white/70 border border-white/60 rounded-3xl p-10 text-center shadow-lg">
            <FiActivity className="mx-auto text-purple-500 mb-4" size={36} />
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              No analysis history yet
            </h2>
            <p className="text-slate-500 text-sm mb-6">
              Upload a dance performance to generate your first analysis.
            </p>
            <button
              onClick={() => router.push('/upload')}
              className="rounded-xl bg-purple-600 text-white px-6 py-3 font-bold hover:bg-purple-700 transition"
            >
              Start Analysis
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5">
            {runs.map((run, index) => (
              <motion.div
                key={run.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="bg-white/80 backdrop-blur-md border border-white/60 rounded-3xl shadow-lg p-6"
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-bold uppercase tracking-wider">
                        {run.status ?? 'done'}
                      </span>

                      <span className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                        <FiCalendar />
                        {formatDate(run.created_at)}
                      </span>
                    </div>

                    <div>
                      <h2 className="text-2xl font-black text-slate-900">
                        Score: {Number(run.score ?? 0).toFixed(1)}
                      </h2>
                      <p className="text-sm text-slate-500 mt-1">
                        {run.summary_feedback ?? 'Analysis completed.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <FiClock className="text-purple-500" />
                      <span>Processing Time:</span>
                      <span className="font-bold text-slate-700">
                        {formatProcessingTime(run.processing_time_seconds)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => handleViewResult(run)}
                      className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white px-5 py-3 text-sm font-bold hover:bg-slate-800 transition"
                    >
                      <FiEye />
                      View Results
                    </button>

                    <button
                      onClick={() => handleDelete(run.id)}
                      disabled={deletingId === run.id}
                      className="flex items-center justify-center gap-2 rounded-xl bg-red-50 text-red-600 border border-red-100 px-5 py-3 text-sm font-bold hover:bg-red-100 transition disabled:opacity-60"
                    >
                      <FiTrash2 />
                      {deletingId === run.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
