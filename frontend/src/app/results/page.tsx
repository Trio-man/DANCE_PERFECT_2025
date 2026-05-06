'use client';

import { useEffect, useMemo, useState, Suspense, ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';

// -----------------------------
// TYPES
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
  detailed_timeline?: TimelineItem[];
};

type Comparison = {
  similarity_score?: number;
  frames_compared?: number;
  mean_landmark_distance?: number;
  feedback?: Feedback;
};

type AnalysisResult = {
  score?: number;
  feedback?: Feedback;
  comparison?: Comparison;
};

// -----------------------------
// MAIN
// -----------------------------
function ResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  // -----------------------------
  // LOAD
  // -----------------------------
  useEffect(() => {
    try {
      const stored =
        sessionStorage.getItem('dp_results') ||
        sessionStorage.getItem('dp_result') ||
        localStorage.getItem('dp_last_result');

      if (!stored) {
        setLoading(false);
        return;
      }

      setResult(JSON.parse(stored));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // -----------------------------
  // DATA
  // -----------------------------
  const feedback = result?.feedback || result?.comparison?.feedback || {};
  const timeline = feedback.detailed_timeline ?? [];

  const score = result?.score ?? result?.comparison?.similarity_score ?? 0;

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
  const joints = useMemo(() => {
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
          <div className="animate-spin h-10 w-10 border-4 border-t-[#4b0082] border-gray-300 mx-auto mb-3" />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <button
          onClick={() => router.push('/upload')}
          className="bg-[#4b0082] text-white px-5 py-3 rounded-lg"
        >
          Go Back
        </button>
      </div>
    );
  }

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#cde7ff] to-[#d6c1ff] px-4 py-10 flex justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-6xl space-y-8"
      >
        {/* HEADER SCORE */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#4b0082]">Performance Dashboard</h1>

          {/* SCORE RING */}
          <div className="relative w-40 h-40 mx-auto mt-6">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke="#e5e7eb"
                strokeWidth="10"
                fill="none"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke="#4b0082"
                strokeWidth="10"
                fill="none"
                strokeDasharray={`${score * 2.5}, 1000`}
                strokeLinecap="round"
              />
            </svg>

            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-2xl font-bold">{Number(score).toFixed(1)}</p>
            </div>
          </div>
        </div>

        {/* METRICS */}
        <Section title="Performance Metrics">
          <div className="grid md:grid-cols-3 gap-4 text-center">
            <Metric label="Similarity" value={metrics.similarity} />
            <Metric label="Frames" value={metrics.frames} />
            <Metric label="Error" value={metrics.error} />
          </div>
        </Section>

        {/* COACH INSIGHT */}
        <Section title="AI Coach Insight">
          <p className="text-gray-700">
            {score > 85
              ? 'Excellent synchronization. Minor refinements will make it professional-level.'
              : score > 70
              ? 'Good performance but timing and joint alignment need improvement.'
              : 'Significant improvement needed in timing, posture, and coordination.'}
          </p>
        </Section>

        {/* JOINT ANALYSIS */}
        {joints.length > 0 && (
          <Section title="Weak Body Areas">
            <div className="space-y-2">
              {joints.map(([joint, count]) => (
                <div
                  key={joint}
                  className="flex justify-between bg-white/60 p-3 rounded-lg"
                >
                  <span>{joint}</span>
                  <span className="font-bold">{count}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* TIMELINE */}
        {timeline.length > 0 && (
          <Section title="Timeline Analysis">
            <div className="space-y-3">
              {timeline.map((t, i) => (
                <div key={i} className="p-4 bg-white/60 rounded-xl">
                  <p className="font-semibold">
                    {t.start} - {t.end} ({t.joint})
                  </p>
                  <p className="text-sm text-gray-700">{t.message}</p>

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

        {/* BUTTON */}
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
function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white/60 p-4 rounded-xl">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
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
