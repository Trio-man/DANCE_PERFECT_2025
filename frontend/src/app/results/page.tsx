'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Image from 'next/image';

type TimelineItem = {
  start?: string;
  end?: string;
  message?: string;
};

type AnalysisResult = {
  score?: number;
  feedback?: {
    summary?: string;
    top_errors?: string[];
    body_part_comments?: string[];
    detailed_timeline?: TimelineItem[];
  };
  visuals?: any;
  comparison?: {
    similarity_score?: number;
  };
};

function ResultsContent() {
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  // -----------------------------
  // LOAD SAFE (NO REDIRECT)
  // -----------------------------
  useEffect(() => {
    const stored = sessionStorage.getItem('dp_result');

    if (!stored) {
      setLoading(false);
      return;
    }

    try {
      setResult(JSON.parse(stored));
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // -----------------------------
  const feedback = result?.feedback ?? {};
  const score = result?.score ?? result?.comparison?.similarity_score ?? 0;

  const timeline = feedback.detailed_timeline ?? [];
  const errors = feedback.top_errors ?? [];
  const body = feedback.body_part_comments ?? [];

  // -----------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-t-purple-700 rounded-full" />
      </div>
    );
  }

  // -----------------------------
  // EMPTY STATE (FIXED UX)
  // -----------------------------
  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center bg-white/60 p-10 rounded-xl">
          <p className="font-semibold">No results found</p>
          <button
            onClick={() => router.push('/upload')}
            className="mt-4 bg-purple-700 text-white px-4 py-2 rounded"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-100 to-purple-200 p-6 flex justify-center">
      <motion.div className="w-full max-w-5xl bg-white/70 p-8 rounded-2xl space-y-8">

        {/* HEADER */}
        <div className="text-center">
          <h1 className="text-3xl font-bold">Here are your results</h1>
          <p className="text-gray-600">AI movement analysis complete</p>
          <p className="text-5xl font-bold mt-6">{Number(score).toFixed(1)}</p>
        </div>

        {/* SUMMARY */}
        <Section title="AI Insights">
          {feedback.summary || 'No AI summary available yet.'}
        </Section>

        {/* ERRORS */}
        <Section title="Key Insights">
          {errors.length === 0 && body.length === 0 ? (
            <p className="text-gray-500">No issues detected.</p>
          ) : (
            <>
              {errors.map((e, i) => (
                <div key={i} className="bg-red-50 p-2 rounded mb-2">
                  {e}
                </div>
              ))}
              {body.map((b, i) => (
                <div key={i} className="bg-blue-50 p-2 rounded mb-2">
                  {b}
                </div>
              ))}
            </>
          )}
        </Section>

        {/* TIMELINE */}
        <Section title="Frame-by-Frame Coaching">
          {timeline.length === 0 ? (
            <p className="text-gray-500">No timeline available.</p>
          ) : (
            timeline.map((t, i) => (
              <div key={i} className="border p-3 rounded mb-2">
                <p className="font-semibold">
                  {t.start} - {t.end}
                </p>
                <p className="text-sm">{t.message}</p>
              </div>
            ))
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

function Section({ title, children }: any) {
  return (
    <div className="bg-white/60 p-5 rounded-xl space-y-3">
      <h2 className="font-bold">{title}</h2>
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
