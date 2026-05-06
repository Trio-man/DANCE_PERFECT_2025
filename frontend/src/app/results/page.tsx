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
// CONTENT
// -----------------------------
function ResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || '';

  const toBackendUrl = (p?: string) => {
    if (!p) return '';
    if (p.startsWith('http')) return p;
    return `${BACKEND_URL}${p.startsWith('/') ? '' : '/'}${p}`;
  };

  // -----------------------------
  // FIX: hydration guard (IMPORTANT)
  // -----------------------------
  useEffect(() => {
    setHydrated(true);
  }, []);

  // -----------------------------
  // FIXED LOAD LOGIC
  // -----------------------------
  useEffect(() => {
    if (!hydrated) return;

    let cancelled = false;

    const run = () => {
      try {
        if (errorParam) {
          setLoading(false);
          return;
        }

        // ✅ FIX: accept multiple possible keys
        const stored =
          sessionStorage.getItem('dp_results') ||
          sessionStorage.getItem('dp_result') ||
          sessionStorage.getItem('dp_analysis_result') ||
          localStorage.getItem('dp_last_result');

        // ✅ FIX: do NOT instantly redirect (prevents flicker bug)
        if (!stored) {
          setTimeout(() => {
            if (!cancelled) router.replace('/upload');
          }, 300);
          return;
        }

        const parsed: AnalysisResult = JSON.parse(stored);

        if (!cancelled) setResult(parsed);
      } catch (e) {
        console.error(e);
        router.replace('/upload');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [hydrated, router, errorParam]);

  // -----------------------------
  const feedback = useMemo(() => {
    return result?.feedback || result?.comparison?.feedback || {};
  }, [result]);

  const visuals = useMemo(() => {
    return result?.outputs?.visuals || result?.visuals || null;
  }, [result]);

  const score = result?.score ?? result?.comparison?.similarity_score ?? 0;

  const scoreLabel = useMemo(() => {
    if (score >= 90) return 'Excellent synchronization';
    if (score >= 80) return 'Very good performance';
    if (score >= 70) return 'Good but needs refinement';
    if (score >= 60) return 'Average coordination';
    return 'Needs improvement';
  }, [score]);

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
  // FIX: only redirect if truly empty AFTER hydration
  // -----------------------------
  if (!result && hydrated) {
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

  const timeline = feedback.detailed_timeline ?? [];
  const topErrors = feedback.top_errors ?? [];
  const bodyComments = feedback.body_part_comments ?? [];

  const refPreviews = visuals?.reference?.preview_images ?? [];
  const usrPreviews = visuals?.user?.preview_images ?? [];

  const refOverlay = visuals?.reference?.overlay_video;
  const usrOverlay = visuals?.user?.overlay_video;

  // -----------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#cde7ff] to-[#d6c1ff] px-4 py-10 flex justify-center">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-5xl bg-white/70 backdrop-blur-md rounded-2xl p-8 space-y-8"
      >
        {/* SCORE */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#4b0082]">Performance Score</h1>

          <p className="text-6xl font-extrabold mt-4">
            {Number(score).toFixed(1)}
          </p>

          <p className="text-gray-700 mt-2">{scoreLabel}</p>
        </div>

        {/* SUMMARY */}
        {feedback.summary && (
          <Section title="Summary">
            <p>{feedback.summary}</p>
          </Section>
        )}

        {/* VISUALS */}
        {(refOverlay || usrOverlay || refPreviews.length > 0 || usrPreviews.length > 0) && (
          <Section title="Visual Comparison">
            <div className="grid md:grid-cols-2 gap-4">
              {refOverlay && (
                <video src={toBackendUrl(refOverlay)} controls className="rounded-xl" />
              )}
              {usrOverlay && (
                <video src={toBackendUrl(usrOverlay)} controls className="rounded-xl" />
              )}
            </div>
          </Section>
        )}

        {/* INSIGHTS */}
        {(topErrors.length > 0 || bodyComments.length > 0) && (
          <Section title="Key Insights">
            <ul className="list-disc pl-5">
              {topErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {bodyComments.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </Section>
        )}

        {/* TIMELINE */}
        {timeline.length > 0 && (
          <Section title="Timeline Analysis">
            <div className="space-y-3">
              {timeline.map((t, i) => (
                <div key={i} className="border rounded-xl p-4 bg-white/60">
                  <p className="font-semibold">
                    {t.start} - {t.end} ({t.body_part})
                  </p>
                  <p className="text-sm text-gray-700">{t.message}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        <button
          onClick={() => router.push('/upload')}
          className="w-full bg-[#4b0082] text-white py-3 rounded-lg"
        >
          Compare Again
        </button>
      </motion.div>
    </div>
  );
}

// -----------------------------
function Section({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
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
