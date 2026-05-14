'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
type WorstDeviation = {
  issue?: string;
  recommendation?: string;
  user_time?: string;
  user_time_clip_start?: number;
};

type Comparison = {
  similarity_score?: number;
  feedback_summary_paragraph?: string;
  negative_feedback_summary?: string;
  positive_feedback_summary?: string;
  recommendation?: string;
  practice_tips?: string[];
  worst_deviations?: WorstDeviation[];
  dtw_distance?: number;
  dtw_similarity_score?: number;
};

// Backend wraps everything in { comparison: { ... } }
type BackendResult = {
  message?: string;
  comparison?: Comparison;
  // Allow the old flat shape too (fallback)
  similarity_score?: number;
  feedback_summary_paragraph?: string;
  negative_feedback_summary?: string;
  positive_feedback_summary?: string;
  recommendation?: string;
  practice_tips?: string[];
  worst_deviations?: WorstDeviation[];
};

// ─────────────────────────────────────────────
// HELPER — unwrap nested or flat response
// ─────────────────────────────────────────────
function extractComparison(raw: BackendResult): Comparison {
  // Backend returns { comparison: { similarity_score, ... } }
  if (raw.comparison && typeof raw.comparison === 'object') {
    return raw.comparison;
  }
  // Fallback: flat shape (old or alternative backend)
  return raw as Comparison;
}

// ─────────────────────────────────────────────
// RESULTS CONTENT
// ─────────────────────────────────────────────
function ResultsContent() {
  const router = useRouter();
  const [result, setResult] = useState<Comparison | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('dp_result');
    if (!stored) {
      setResult(null);
      return;
    }
    try {
      const parsed: BackendResult = JSON.parse(stored);
      setResult(extractComparison(parsed));
    } catch (err) {
      console.error('Failed to parse result:', err);
      setResult(null);
    }
  }, []);

  // ── Empty state ──────────────────────────────
  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white">
        <div className="text-center space-y-4">
          <p className="text-lg font-semibold text-gray-700">No analysis found.</p>
          <button
            onClick={() => router.push('/upload')}
            className="bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold"
          >
            Go to Upload
          </button>
        </div>
      </div>
    );
  }

  const score    = result.similarity_score ?? 0;
  const tips     = result.practice_tips ?? [];
  const summary  = result.feedback_summary_paragraph
                || result.negative_feedback_summary
                || result.recommendation
                || 'No summary available.';

  // ── Render ───────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white px-4 py-10 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">

        {/* SCORE */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/60 backdrop-blur border border-white/70 p-8 rounded-2xl text-center"
        >
          <h1 className="text-2xl font-bold text-purple-700">Here are your results</h1>
          <p className="text-6xl font-extrabold mt-4 text-gray-900">
            {Number(score).toFixed(1)}
          </p>
          <p className="text-gray-500 mt-1 text-sm">out of 100</p>
          <p className="text-gray-700 mt-1">Similarity Score</p>
        </motion.div>

        {/* FEEDBACK SUMMARY */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/60 border border-white/70 p-6 rounded-2xl space-y-4"
        >
          <h2 className="font-bold text-purple-700 text-xl">Feedback Summary</h2>

          <p className="text-gray-700">{summary}</p>

          {result.positive_feedback_summary && (
            <div>
              <h3 className="font-semibold text-green-700">Positive Feedback</h3>
              <p className="text-gray-700 mt-1">{result.positive_feedback_summary}</p>
            </div>
          )}

          <div>
            <h3 className="font-semibold text-orange-700">Recommendation</h3>
            <p className="text-gray-700 mt-1">{result.recommendation || '—'}</p>
          </div>

          <div>
            <h3 className="font-semibold text-purple-700">Practice Tips</h3>
            {tips.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1 mt-1 text-gray-700">
                {tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 mt-1">No tips available.</p>
            )}
          </div>
        </motion.div>

        {/* ACTION */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/upload')}
          className="w-full bg-purple-700 text-white py-3 rounded-xl font-semibold"
        >
          Analyze Another Video
        </motion.button>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────
export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-gray-600">Loading...</div>}>
      <ResultsContent />
    </Suspense>
  );
}
