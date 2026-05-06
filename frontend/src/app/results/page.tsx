'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Image from 'next/image';

// -----------------------------
// TYPES (safe + flexible)
// -----------------------------
type TimelineItem = {
  start?: string;
  end?: string;
  body_part?: string;
  message?: string;
};

type Feedback = {
  summary?: string;
  timing?: string;
  body_part_comments?: string[];
  top_errors?: string[];
  detailed_timeline?: TimelineItem[];
};

type AnalysisResult = {
  score?: number;
  feedback?: Feedback;
  comparison?: {
    similarity_score?: number;
    feedback?: Feedback;
  };
  visuals?: any;
  outputs?: any;
};

// -----------------------------
// MAIN
// -----------------------------
function ResultsContent() {
  const router = useRouter();

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  // -----------------------------
  // LOAD RESULT (FIXED SAFE FLOW)
  // -----------------------------
  useEffect(() => {
    try {
      const stored =
        sessionStorage.getItem('dp_result') ||
        localStorage.getItem('dp_last_result');

      if (!stored) {
        setResult(null);
        setLoading(false);
        return;
      }

      const parsed = JSON.parse(stored);
      setResult(parsed);
    } catch (e) {
      console.error('Result parse error:', e);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // -----------------------------
  // SAFE DERIVED DATA
  // -----------------------------
  const score =
    result?.score ??
    result?.comparison?.similarity_score ??
    0;

  const feedback = result?.feedback || result?.comparison?.feedback || {};

  const timeline = feedback?.detailed_timeline ?? [];
  const topErrors = feedback?.top_errors ?? [];

  const bodyComments = feedback?.body_part_comments ?? [];

  // -----------------------------
  // LOADING
  // -----------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-blue-100 to-purple-100">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-gray-300 border-t-purple-600 mx-auto mb-4 rounded-full" />
          <p className="font-semibold">Loading your analysis...</p>
        </div>
      </div>
    );
  }

  // -----------------------------
  // EMPTY STATE (FIXED)
  // -----------------------------
  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-blue-100 to-purple-100">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center bg-white/70 p-8 rounded-xl"
        >
          <h2 className="text-xl font-bold mb-2">No Results Found</h2>
          <p className="text-gray-600 mb-4">
            Run an analysis first to see your dashboard.
          </p>
          <button
            onClick={() => router.push('/upload')}
            className="bg-purple-600 text-white px-5 py-2 rounded-lg"
          >
            Go to Upload
          </button>
        </motion.div>
      </div>
    );
  }

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-100 to-purple-100 px-4 py-10 flex justify-center">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-5xl space-y-6"
      >

        {/* HERO */}
        <div className="bg-white/70 backdrop-blur-md rounded-2xl p-8 text-center shadow-lg">
          <h1 className="text-2xl font-bold text-purple-700">
            Here are your results
          </h1>

          <p className="text-6xl font-extrabold mt-4">
            {Number(score).toFixed(1)}
          </p>

          <p className="text-gray-600 mt-2">
            Overall performance score
          </p>
        </div>

        {/* SUMMARY */}
        {feedback.summary && (
          <Section title="AI Summary">
            <p className="text-gray-700">{feedback.summary}</p>
          </Section>
        )}

        {/* KEY MISTAKES */}
        {(topErrors.length > 0 || bodyComments.length > 0) && (
          <Section title="Key Mistakes">
            <ul className="list-disc pl-5 text-gray-700 space-y-1">
              {topErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {bodyComments.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </Section>
        )}

        {/* TIMELINE (SAFE) */}
        {timeline.length > 0 && (
          <Section title="Frame-by-Frame Coaching">
            <div className="space-y-3">
              {timeline.map((t, i) => (
                <div
                  key={i}
                  className="bg-white/60 p-4 rounded-xl border"
                >
                  <p className="font-semibold">
                    {t.start} - {t.end}
                  </p>
                  <p className="text-gray-700">{t.message}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ACTION */}
        <button
          onClick={() => router.push('/upload')}
          className="w-full bg-purple-700 text-white py-3 rounded-xl font-semibold"
        >
          Analyze Another Video
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
    <div className="bg-white/60 rounded-xl p-6 space-y-3">
      <h2 className="font-bold text-lg text-purple-700">
        {title}
      </h2>
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
