'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

// -----------------------------
// TYPES (MATCH YOUR BACKEND)
// -----------------------------
type AnalysisResult = {
  similarity_score?: number;

  practice_tips?: string[];

  feedback_summary_paragraph?: string;

  negative_feedback_summary?: string;

  positive_feedback_summary?: string;

  recommendation?: string;

  aligned_moments?: any[];

  worst_deviations?: {
    issue?: string;
    recommendation?: string;
    user_time?: string;
    user_time_clip_start?: number;
  }[];

  deviation_comparison_images?: string[];

  dtw_distance?: number;
  dtw_similarity_score?: number;
};

// -----------------------------
// HELPERS
// -----------------------------
function resolveMediaUrl(path?: string | null) {
  if (!path) return '';

  if (path.startsWith('http')) return path;

  const BACKEND_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    '';

  return `${BACKEND_URL}/${path}`;
}

// -----------------------------
// MAIN
// -----------------------------
function ResultsContent() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [time, setTime] = useState(0);

  // -----------------------------
  // LOAD
  // -----------------------------
  useEffect(() => {
    const stored = sessionStorage.getItem('dp_result');

    if (!stored) {
      setResult(null);
      return;
    }

    try {
      const parsed: AnalysisResult = JSON.parse(stored);
      setResult(parsed);
    } catch {
      setResult(null);
    }
  }, []);

  // -----------------------------
  // CORE DATA
  // -----------------------------
  const score = result?.similarity_score ?? 0;

  const topErrors = result?.negative_feedback_summary
    ? [result.negative_feedback_summary]
    : [];

  const videoSrc = '';

  // -----------------------------
  // EMPTY STATE
  // -----------------------------
  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white">
        <button
          onClick={() => router.push('/upload')}
          className="bg-purple-700 text-white px-6 py-3 rounded-xl"
        >
          No results — Go back
        </button>
      </div>
    );
  }

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white px-4 py-10 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">

        {/* HERO */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/60 backdrop-blur border border-white/70 p-8 rounded-2xl text-center"
        >
          <h1 className="text-2xl font-bold text-purple-700">
            Here are your results
          </h1>

          <p className="text-6xl font-extrabold mt-4 text-gray-900">
            {Number(score).toFixed(1)}
          </p>

          <p className="text-gray-700 mt-2">
            Similarity Score
          </p>
        </motion.div>

        {/* SUMMARY */}
        <div className="bg-white/60 border border-white/70 p-6 rounded-2xl space-y-4">
          <h2 className="font-bold text-purple-700 text-xl">
            Feedback Summary
          </h2>

          <p className="text-gray-700">
            {result?.feedback_summary_paragraph}
          </p>

          <div>
            <h3 className="font-semibold text-green-700">
              Positive Feedback
            </h3>
            <p>{result?.positive_feedback_summary}</p>
          </div>

          <div>
            <h3 className="font-semibold text-orange-700">
              Recommendation
            </h3>
            <p>{result?.recommendation}</p>
          </div>

          <div>
            <h3 className="font-semibold text-purple-700">
              Practice Tips
            </h3>

            <ul className="list-disc pl-5 space-y-1">
              {result?.practice_tips?.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* DEVIATIONS */}
        <div className="bg-white/60 border border-white/70 p-6 rounded-2xl">
          <h2 className="font-bold mb-3 text-purple-700">
            Key Deviations
          </h2>

          {result?.worst_deviations?.length ? (
            <div className="space-y-4">
              {result.worst_deviations.map((d, i) => (
                <div
                  key={i}
                  className="border rounded-xl p-4 bg-white/70"
                >
                  <p className="font-semibold">
                    Issue: {d.issue}
                  </p>

                  <p className="text-gray-700">
                    Recommendation: {d.recommendation}
                  </p>

                  <p className="text-sm text-gray-500">
                    Time: {d.user_time}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">
              No major deviations detected.
            </p>
          )}
        </div>

        {/* ACTION */}
        <button
          onClick={() => router.push('/upload')}
          className="w-full bg-purple-700 text-white py-3 rounded-xl font-semibold"
        >
          Analyze Another Video
        </button>
      </div>
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
