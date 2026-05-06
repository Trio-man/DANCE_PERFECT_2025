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
  message?: string;
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

  const toBackendUrl = (p: string): string => {
    if (!p) return '';
    if (p.startsWith('http')) return p;
    return `${BACKEND_URL}${p.startsWith('/') ? '' : '/'}${p}`;
  };

  // -----------------------------
  // LOAD DATA
  // -----------------------------
  useEffect(() => {
    try {
      if (errorParam) {
        setLoading(false);
        return;
      }

      const stored =
        sessionStorage.getItem('dp_results') ||
        localStorage.getItem('dp_last_result');

      if (!stored) {
        router.replace('/upload');
        return;
      }

      const parsed: AnalysisResult = JSON.parse(stored);
      setResult(parsed);
    } catch (e) {
      console.error(e);
      router.replace('/upload');
    } finally {
      setLoading(false);
    }
  }, [router, errorParam]);

  // -----------------------------
  // DERIVED METRICS (ENTERPRISE LAYER)
  // -----------------------------
  const score = result?.score ?? result?.comparison?.similarity_score ?? 0;

  const comparison = result?.comparison;

  const visuals = result?.outputs?.visuals || result?.visuals || undefined;

  const feedback = useMemo((): Feedback => {
    return result?.feedback || result?.comparison?.feedback || {};
  }, [result]);

  const timeline = useMemo<TimelineItem[]>(() => {
    return feedback?.detailed_timeline ?? [];
  }, [feedback]);

  const insights = useMemo(() => {
    return {
      errors: feedback?.top_errors ?? [],
      body: feedback?.body_part_comments ?? [],
    };
  }, [feedback]);

  const kpis = useMemo(() => {
    return {
      score,
      framesCompared: comparison?.frames_compared ?? 0,
      meanDistance: comparison?.mean_landmark_distance ?? 0,
      errorCount: insights.errors.length,
    };
  }, [score, comparison, insights]);

  // -----------------------------
  // LOADING
  // -----------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#cde7ff] to-[#d6c1ff]">
        <div className="text-center bg-white/70 p-10 rounded-xl">
          <div className="animate-spin h-10 w-10 border-4 border-gray-300 border-t-[#4b0082] mx-auto mb-3" />
          <p className="font-semibold">Analyzing performance...</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <button
          onClick={() => router.push('/upload')}
          className="bg-[#4b0082] text-white px-6 py-3 rounded-lg"
        >
          Back to Upload
        </button>
      </div>
    );
  }

  // -----------------------------
  // DASHBOARD UI
  // -----------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#cde7ff] to-[#d6c1ff] px-4 py-10">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* HEADER */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/70 backdrop-blur-md rounded-2xl p-6"
        >
          <h1 className="text-2xl font-bold text-[#4b0082]">
            Performance Analytics Dashboard
          </h1>
          <p className="text-gray-600">
            Enterprise motion analysis report
          </p>
        </motion.div>

        {/* KPI GRID */}
        <div className="grid md:grid-cols-4 gap-4">
          <KPI label="Score" value={kpis.score.toFixed(1)} />
          <KPI label="Frames Compared" value={kpis.framesCompared} />
          <KPI label="Landmark Distance" value={kpis.meanDistance.toFixed(3)} />
          <KPI label="Detected Issues" value={kpis.errorCount} />
        </div>

        {/* VISUALS */}
        {(visuals?.reference?.overlay_video || visuals?.user?.overlay_video) && (
          <Panel title="Motion Overlay Comparison">
            <div className="grid md:grid-cols-2 gap-4">
              {visuals?.reference?.overlay_video && (
                <video
                  className="rounded-xl"
                  controls
                  src={toBackendUrl(visuals.reference.overlay_video)}
                />
              )}
              {visuals?.user?.overlay_video && (
                <video
                  className="rounded-xl"
                  controls
                  src={toBackendUrl(visuals.user.overlay_video)}
                />
              )}
            </div>
          </Panel>
        )}

        {/* INSIGHTS */}
        <Panel title="AI Insights">
          <div className="space-y-2">
            {insights.errors.map((e: string, i: number) => (
              <p key={i} className="text-red-600">⚠ {e}</p>
            ))}
            {insights.body.map((b: string, i: number) => (
              <p key={i} className="text-gray-700">• {b}</p>
            ))}
          </div>
        </Panel>

        {/* TIMELINE */}
        <Panel title="Frame-by-Frame Coaching Timeline">
          <div className="space-y-3">
            {timeline.map((t: TimelineItem, i: number) => (
              <div key={i} className="p-4 bg-white/60 rounded-xl">
                <p className="font-semibold">
                  {t.start} - {t.end} ({t.body_part})
                </p>
                <p className="text-sm text-gray-700">{t.message}</p>
              </div>
            ))}
          </div>
        </Panel>

        {/* ACTION */}
        <button
          onClick={() => router.push('/upload')}
          className="w-full bg-[#4b0082] text-white py-3 rounded-lg font-semibold"
        >
          Run New Analysis
        </button>
      </div>
    </div>
  );
}

// -----------------------------
// COMPONENTS
// -----------------------------
function KPI({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/70 rounded-xl p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/70 rounded-2xl p-6 space-y-4">
      <h2 className="font-bold text-lg text-[#4b0082]">{title}</h2>
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
