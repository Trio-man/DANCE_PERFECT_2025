'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Image from 'next/image';

// -----------------------------
// TYPES
// -----------------------------
type TimelineItem = {
  start?: string;
  end?: string;
  severity?: string;
  body_part?: string;
  joint?: string;
  message?: string;
};

type Feedback = {
  summary?: string;
  timing?: string;
  body_part_comments?: string[];
  top_errors?: string[];
  detailed_timeline?: TimelineItem[];
};

type Visuals = {
  reference?: { preview_images?: string[]; overlay_video?: string };
  user?: { preview_images?: string[]; overlay_video?: string };
};

type AnalysisResult = {
  score?: number;
  feedback?: Feedback;
  comparison?: {
    similarity_score?: number;
    feedback?: Feedback;
  };
  visuals?: Visuals;
  outputs?: { visuals?: Visuals };
};

// -----------------------------
// MAIN
// -----------------------------
function ResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || '';

  const toBackendUrl = (p?: string) => {
    if (!p) return '';
    if (p.startsWith('http')) return p;
    return `${BACKEND_URL}${p.startsWith('/') ? '' : '/'}${p}`;
  };

  // -----------------------------
  // LOAD RESULT (STABLE)
  // -----------------------------
  useEffect(() => {
    const stored =
      sessionStorage.getItem('dp_result') ||
      localStorage.getItem('dp_last_result');

    if (errorParam) {
      setLoading(false);
      return;
    }

    if (!stored) {
      setLoading(false);
      router.replace('/upload');
      return;
    }

    try {
      setResult(JSON.parse(stored));
    } catch {
      router.replace('/upload');
    } finally {
      setLoading(false);
    }
  }, [router, errorParam]);

  // -----------------------------
  // DERIVED DATA
  // -----------------------------
  const feedback = useMemo<Feedback>(() => {
    return result?.feedback || result?.comparison?.feedback || {};
  }, [result]);

  const visuals = useMemo(() => {
    return result?.outputs?.visuals || result?.visuals || null;
  }, [result]);

  const score = result?.score ?? result?.comparison?.similarity_score ?? 0;

  const timeline = feedback.detailed_timeline ?? [];
  const topErrors = feedback.top_errors ?? [];
  const bodyComments = feedback.body_part_comments ?? [];

  // -----------------------------
  // SIMULATED METRICS (NO BACKEND REQUIRED)
  // -----------------------------
  const metrics = useMemo(() => {
    const base = Number(score) || 0;

    return {
      stability: Math.min(100, base + 5),
      timing: Math.max(0, base - 3),
      form: Math.min(100, base + 2),
    };
  }, [score]);

  // -----------------------------
  // LOADING
  // -----------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#cde7ff] to-[#d6c1ff]">
        <div className="text-center bg-white/70 p-10 rounded-xl">
          <div className="animate-spin h-10 w-10 border-4 border-t-purple-700 border-gray-300 mx-auto mb-3 rounded-full" />
          <p className="font-semibold">Loading your performance...</p>
        </div>
      </div>
    );
  }

  // -----------------------------
  // EMPTY STATE
  // -----------------------------
  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center bg-white/70 p-10 rounded-xl">
          <p>No results found</p>
          <button
            onClick={() => router.push('/upload')}
            className="mt-4 bg-purple-700 text-white px-4 py-2 rounded"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#cde7ff] to-[#d6c1ff] px-4 py-10 flex justify-center">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-6xl bg-white/70 backdrop-blur-md rounded-2xl p-8 space-y-8"
      >

        {/* HEADER */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-purple-800">
            Here are your results
          </h1>
          <p className="text-gray-600 mt-2">
            Performance breakdown and movement analysis
          </p>

          <p className="text-5xl font-bold mt-6">
            {Number(score).toFixed(1)}
          </p>
        </div>

        {/* METRICS GRID */}
        <Section title="Movement Quality">
          <div className="grid md:grid-cols-3 gap-4">
            <Metric label="Stability" value={metrics.stability} />
            <Metric label="Timing" value={metrics.timing} />
            <Metric label="Form" value={metrics.form} />
          </div>
        </Section>

        {/* SUMMARY */}
        <Section title="AI Summary">
          {feedback.summary || "No summary available yet."}
        </Section>

        {/* VISUALS */}
        {visuals && (
          <Section title="Visual Analysis">
            <div className="grid md:grid-cols-2 gap-4">
              {visuals.reference?.overlay_video && (
                <video className="rounded-xl" controls src={toBackendUrl(visuals.reference.overlay_video)} />
              )}
              {visuals.user?.overlay_video && (
                <video className="rounded-xl" controls src={toBackendUrl(visuals.user.overlay_video)} />
              )}
            </div>
          </Section>
        )}

        {/* INSIGHTS */}
        <Section title="Key Insights">
          {topErrors.length === 0 && bodyComments.length === 0 ? (
            <p className="text-gray-500">No issues detected.</p>
          ) : (
            <>
              {topErrors.map((e, i) => (
                <div key={i} className="bg-red-50 p-3 rounded mb-2">
                  {e}
                </div>
              ))}

              {bodyComments.map((c, i) => (
                <div key={i} className="bg-blue-50 p-3 rounded mb-2">
                  {c}
                </div>
              ))}
            </>
          )}
        </Section>

        {/* TIMELINE */}
        <Section title="Frame-by-Frame Coaching">
          {timeline.length === 0 ? (
            <p className="text-gray-500">No detailed timeline available.</p>
          ) : (
            <div className="space-y-3">
              {timeline.map((t, i) => (
                <div key={i} className="border p-4 rounded-xl bg-white/60">
                  <p className="font-semibold">
                    {t.start} - {t.end}
                  </p>
                  <p className="text-sm text-gray-700">{t.message}</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <button
          onClick={() => router.push('/upload')}
          className="w-full bg-purple-800 text-white py-3 rounded-lg"
        >
          Analyze Again
        </button>

      </motion.div>
    </div>
  );
}

// -----------------------------
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white/60 p-4 rounded-xl text-center">
      <p className="font-semibold">{label}</p>
      <p className="text-2xl font-bold text-purple-800">{value.toFixed(1)}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/60 rounded-xl p-5 space-y-3">
      <h2 className="font-bold text-lg">{title}</h2>
      {children}
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading...</div>}>
      <ResultsContent />
    </Suspense>
  );
}
