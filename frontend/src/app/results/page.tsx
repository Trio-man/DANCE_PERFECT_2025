'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Image from 'next/image';

// -----------------------------
// Types
// -----------------------------
type TimelineItem = {
  start: string;
  end: string;
  severity: string;
  body_part: string;
  joint: string;
  message: string;
};

type Feedback = {
  summary?: string;
  timing?: string;
  body_part_comments?: string[];
  top_errors?: string[];
  detailed_timeline?: TimelineItem[];
};

type Comparison = {
  similarity_score?: number;
  frames_compared?: number;
  mean_landmark_distance?: number;
  feedback?: Feedback;
};

type Visuals = {
  reference?: { preview_images?: string[]; overlay_video?: string };
  user?: { preview_images?: string[]; overlay_video?: string };
};

type AnalysisResult = {
  score?: number;
  feedback?: Feedback;
  comparison?: Comparison;
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

  const toBackendUrl = (p: string) => {
    if (!p) return '';
    if (p.startsWith('http')) return p;
    return `${BACKEND_URL}${p.startsWith('/') ? '' : '/'}${p}`;
  };

  // -----------------------------
  // LOAD
  // -----------------------------
  useEffect(() => {
    try {
      if (errorParam) {
        setLoading(false);
        return;
      }

      const stored =
        sessionStorage.getItem('dp_results') ||
        sessionStorage.getItem('dp_result') ||
        localStorage.getItem('dp_last_result');

      if (!stored) {
        setLoading(false);
        return;
      }

      const parsed: AnalysisResult = JSON.parse(stored);
      setResult(parsed);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [errorParam]);

  // -----------------------------
  // DERIVED DATA
  // -----------------------------
  const feedback = useMemo(() => {
    return result?.feedback || result?.comparison?.feedback || {};
  }, [result]);

  const visuals = useMemo(() => {
    return result?.outputs?.visuals || result?.visuals || null;
  }, [result]);

  const timeline = feedback.detailed_timeline ?? [];

  const score = result?.score ?? result?.comparison?.similarity_score ?? 0;

  // -----------------------------
  // METRICS
  // -----------------------------
  const metrics = useMemo(() => {
    return {
      similarity: result?.comparison?.similarity_score ?? score,
      frames: result?.comparison?.frames_compared ?? 0,
      error: result?.comparison?.mean_landmark_distance ?? 0,
    };
  }, [result, score]);

  // -----------------------------
  // JOINT ANALYTICS
  // -----------------------------
  const jointStats = useMemo(() => {
    const map: Record<string, number> = {};

    timeline.forEach((t) => {
      if (!t.joint) return;
      map[t.joint] = (map[t.joint] || 0) + 1;
    });

    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [timeline]);

  // -----------------------------
  // LOADING
  // -----------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#cde7ff] to-[#d6c1ff]">
        <div className="text-center bg-white/70 p-10 rounded-xl">
          <div className="animate-spin h-10 w-10 border-4 border-gray-300 border-t-[#4b0082] mx-auto mb-3" />
          <p className="font-semibold">Loading results...</p>
        </div>
      </div>
    );
  }

  // -----------------------------
  // EMPTY
  // -----------------------------
  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#cde7ff] to-[#d6c1ff]">
        <div className="text-center bg-white/70 p-10 rounded-xl">
          <p>No results found</p>
          <button
            onClick={() => router.push('/upload')}
            className="mt-4 bg-[#4b0082] text-white px-4 py-2 rounded"
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
        className="w-full max-w-5xl bg-white/70 rounded-2xl p-8 space-y-8"
      >
        {/* SCORE */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#4b0082]">Score</h1>
          <p className="text-6xl font-extrabold mt-3">
            {Number(score).toFixed(1)}
          </p>
        </div>

        {/* METRICS CARD */}
        <Section title="Performance Metrics">
          <div className="grid md:grid-cols-3 gap-4 text-center">
            <Metric label="Similarity" value={metrics.similarity} />
            <Metric label="Frames" value={metrics.frames} />
            <Metric label="Movement Error" value={metrics.error} />
          </div>
        </Section>

        {/* TIMING */}
        {feedback.timing && (
          <Section title="Timing Analysis">
            <p>{feedback.timing}</p>
          </Section>
        )}

        {/* JOINT ANALYTICS */}
        {jointStats.length > 0 && (
          <Section title="Problem Areas (Joints)">
            <div className="space-y-2">
              {jointStats.map(([joint, count]) => (
                <div
                  key={joint}
                  className="flex justify-between bg-white/60 p-2 rounded"
                >
                  <span>{joint}</span>
                  <span className="font-bold">{count}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* SUMMARY */}
        {feedback.summary && (
          <Section title="Summary">
            <p>{feedback.summary}</p>
          </Section>
        )}

        {/* TIMELINE */}
        {timeline.length > 0 && (
          <Section title="Timeline (Detailed)">
            <div className="space-y-3">
              {timeline.map((t, i) => (
                <div key={i} className="p-4 bg-white/60 rounded-xl">
                  <p className="font-semibold">
                    {t.start} - {t.end} ({t.joint})
                  </p>

                  <p className="text-sm text-gray-700">{t.message}</p>

                  {/* Severity badge */}
                  <span
                    className={`text-xs px-2 py-1 rounded mt-2 inline-block ${
                      t.severity === 'high'
                        ? 'bg-red-200'
                        : t.severity === 'medium'
                        ? 'bg-yellow-200'
                        : 'bg-green-200'
                    }`}
                  >
                    {t.severity}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ACTION */}
        <button
          onClick={() => router.push('/upload')}
          className="w-full bg-[#4b0082] text-white py-3 rounded-lg"
        >
          Analyze Again
        </button>
      </motion.div>
    </div>
  );
}

// -----------------------------
function Metric({ label, value }: any) {
  return (
    <div className="bg-white/60 p-4 rounded-xl">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

// -----------------------------
function Section({ title, children }: any) {
  return (
    <div className="bg-white/60 rounded-xl p-5 space-y-3">
      <h2 className="font-bold text-lg">{title}</h2>
      {children}
    </div>
  );
}

// -----------------------------
export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading...</div>}>
      <ResultsContent />
    </Suspense>
  );
}
