'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
type DeviationMoment = {
  issue: string;
  recommendation: string;
  user_time: string;
  user_time_clip_label: string;
  gif_path: string | null;
  screenshot_path: string | null;
};

type DeviationMomentsUI = {
  practice_tips: string[];
  summaries: {
    where_to_improve: string;
    what_went_well: string;
  };
  deviation_moments: DeviationMoment[];
};

type Comparison = {
  similarity_score?: number;
  dtw_similarity_score?: number;
  practice_tips?: string[];
  recommendation?: string;
};

type BackendResult = {
  comparison?: Comparison;
  score?: number; 
  deviation_moments_ui?: DeviationMomentsUI;
};

// ─────────────────────────────────────────────
// RESULTS CONTENT
// ─────────────────────────────────────────────
function ResultsContent() {
  const router = useRouter();
  const [data, setData] = useState<BackendResult | null>(null);

  // Uses your environment variable for the browser to fetch GIFs directly from Flask
  const STORAGE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  useEffect(() => {
    const stored = sessionStorage.getItem('dp_result');
    if (!stored) {
      setData(null);
      return;
    }
    try {
      const parsed: BackendResult = JSON.parse(stored);
      setData(parsed);
    } catch (err) {
      console.error('Failed to parse result:', err);
      setData(null);
    }
  }, []);

  // ── Empty state ──────────────────────────────
  if (!data) {
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

  // Logic to find the best score to display
  const displayScore = data.score ?? data.comparison?.dtw_similarity_score ?? 0;
  const ui = data.deviation_moments_ui;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white px-4 py-10 flex justify-center">
      <div className="w-full max-w-6xl space-y-8">

        {/* 1. MAIN SCORE CARD */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="bg-white/60 backdrop-blur p-8 rounded-3xl text-center shadow-xl border border-white/50"
        >
          <h1 className="text-2xl font-bold text-purple-700">Dance Analysis Complete</h1>
          <p className="text-8xl font-black mt-4 text-gray-900 tracking-tighter">
            {Number(displayScore).toFixed(1)}
          </p>
          <p className="text-gray-500 uppercase tracking-widest text-sm font-bold">Similarity Score</p>
        </motion.div>

        {/* 2. HIGHLIGHT SUMMARIES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div 
            initial={{ x: -20, opacity: 0 }} 
            animate={{ x: 0, opacity: 1 }} 
            className="bg-green-50/80 p-6 rounded-2xl border border-green-200"
          >
            <h3 className="font-bold text-green-800 flex items-center gap-2">✨ What Went Well</h3>
            <p className="text-gray-700 mt-2">{ui?.summaries?.what_went_well || "Great energy and rhythm throughout the performance!"}</p>
          </motion.div>

          <motion.div 
            initial={{ x: 20, opacity: 0 }} 
            animate={{ x: 0, opacity: 1 }} 
            className="bg-orange-50/80 p-6 rounded-2xl border border-orange-200"
          >
            <h3 className="font-bold text-orange-800 flex items-center gap-2">🚀 Where to Improve</h3>
            <p className="text-gray-700 mt-2">{ui?.summaries?.where_to_improve || "Focus on matching the reference posture in the key transitions."}</p>
          </motion.div>
        </div>

        {/* 3. THE DEVIATION TIMELINE (GIF CARDS) */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-gray-800 ml-2">Key Moments to Review</h2>
          {ui?.deviation_moments && ui.deviation_moments.length > 0 ? (
            ui.deviation_moments.map((moment, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: i * 0.1 }}
                className="bg-white rounded-3xl shadow-lg overflow-hidden grid grid-cols-1 lg:grid-cols-2"
              >
                {/* Left Side: The GIF */}
                <div className="relative bg-black aspect-video flex items-center justify-center">
                  {moment.gif_path ? (
                    <img 
                      src={`${STORAGE_URL}/${moment.gif_path}`} 
                      className="w-full h-full object-contain"
                      alt="Correction Clip"
                    />
                  ) : (
                    <div className="text-white text-xs">Visual processing...</div>
                  )}
                  <div className="absolute top-4 left-4 bg-purple-700 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md">
                    {moment.user_time_clip_label}
                  </div>
                </div>

                {/* Right Side: The Feedback */}
                <div className="p-8 flex flex-col justify-center">
                  <span className="text-orange-600 font-bold text-sm uppercase tracking-wider">The Issue</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">{moment.issue}</h3>
                  <div className="mt-6 p-4 bg-purple-50 rounded-xl border border-purple-100">
                    <span className="text-purple-700 font-bold text-sm">Actionable Tip:</span>
                    <p className="text-gray-700 mt-1 italic">{moment.recommendation}</p>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <p className="text-gray-500 italic ml-2 text-center py-10">No specific deviations recorded for this session.</p>
          )}
        </div>

        {/* 4. GENERAL PRACTICE TIPS */}
        <div className="bg-white/40 p-8 rounded-3xl border border-white/60">
          <h3 className="font-bold text-purple-800 text-lg">General Practice Tips</h3>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            {(ui?.practice_tips || data.comparison?.practice_tips || []).map((tip, i) => (
              <li key={i} className="bg-white/80 p-3 rounded-lg text-gray-700 border border-purple-100 shadow-sm flex items-start gap-2">
                <span className="text-purple-500 font-bold">✔</span> {tip}
              </li>
            ))}
          </ul>
        </div>

        {/* 5. BACK TO ACTION */}
        <button
          onClick={() => router.push('/upload')}
          className="w-full bg-purple-700 hover:bg-purple-800 text-white py-4 rounded-2xl font-bold text-lg shadow-lg transition-transform active:scale-95"
        >
          Analyze Another Session
        </button>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE EXPORT
// ─────────────────────────────────────────────
export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-gray-600">Preparing your feedback...</div>}>
      <ResultsContent />
    </Suspense>
  );
}
