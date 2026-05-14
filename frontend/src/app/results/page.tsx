'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

// ─────────────────────────────────────────────
// TYPES (UPDATED FOR OPTION B)
// ─────────────────────────────────────────────
type DeviationMoment = {
  issue?: string;
  recommendation?: string;
  user_time?: string;
  user_time_clip_start?: number;
  user_time_clip_end?: number;
  user_time_clip_label?: string;
  gif_path?: string;
  screenshot_path?: string;
};

type DeviationMomentsUI = {
  practice_tips?: string[];
  summaries?: {
    where_to_improve?: string;
    what_went_well?: string;
  };
  feedback_overview?: string;
  deviation_moments?: DeviationMoment[];
};

type BackendResult = {
  deviation_moments_ui?: DeviationMomentsUI;
  similarity_score?: number;
};

// ─────────────────────────────────────────────
// RESULTS CONTENT
// ─────────────────────────────────────────────
function ResultsContent() {
  const router = useRouter();
  const [result, setResult] = useState<BackendResult | null>(null);

  useEffect(() => {
    const fetchResult = async () => {
      try {
        // You will replace this with your real endpoint
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        const data = await res.json();
        setResult(data);
      } catch (err) {
        console.error('Failed to fetch result:', err);
        setResult(null);
      }
    };

    fetchResult();
  }, []);

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white">
        <div className="text-center space-y-4">
          <p className="text-lg font-semibold text-gray-700">
            No analysis found.
          </p>
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

  const ui = result.deviation_moments_ui;

  const score = result.similarity_score ?? 0;
  const tips = ui?.practice_tips ?? [];

  const summary =
    ui?.feedback_overview ||
    ui?.summaries?.where_to_improve ||
    'No summary available.';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white px-4 py-10 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">

        {/* SCORE */}
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

          <p className="text-gray-500 mt-1 text-sm">out of 100</p>
          <p className="text-gray-700 mt-1">Similarity Score</p>
        </motion.div>

        {/* FEEDBACK */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/60 border border-white/70 p-6 rounded-2xl space-y-6"
        >
          <h2 className="font-bold text-purple-700 text-xl">
            Performance Overview
          </h2>

          <p className="text-gray-700 leading-relaxed whitespace-pre-line">
            {summary}
          </p>

          {/* PRACTICE TIPS */}
          <div className="space-y-2 border-t border-white/60 pt-4">
            <h3 className="font-semibold text-purple-700">
              Practice Drills
            </h3>

            {tips.length > 0 ? (
              <ul className="list-disc pl-5 space-y-2 mt-2 text-gray-700 leading-relaxed">
                {tips.map((tip, i) => (
                  <li key={i} className="marker:text-purple-500">
                    {tip}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 mt-1">No tips available.</p>
            )}
          </div>

          {/* DEVIATION MOMENTS (GIF READY STRUCTURE) */}
          <div className="space-y-2 border-t border-white/60 pt-4">
            <h3 className="font-semibold text-purple-700">
              Key Mistakes
            </h3>

            {ui?.deviation_moments?.length ? (
              ui.deviation_moments.map((item, i) => (
                <div
                  key={i}
                  className="bg-white/40 p-4 rounded-xl space-y-2"
                >
                  {item.gif_path && (
                    <img
                      src={item.gif_path}
                      className="rounded-lg w-full"
                      alt="deviation gif"
                    />
                  )}

                  <p className="text-sm text-gray-500">
                    This clip (your time): {item.user_time_clip_label || item.user_time}
                  </p>

                  <p className="text-red-700 font-semibold">
                    Issue: {item.issue}
                  </p>

                  <p className="text-gray-700">
                    Fix: {item.recommendation}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-gray-500 mt-1">
                No deviation moments found.
              </p>
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
