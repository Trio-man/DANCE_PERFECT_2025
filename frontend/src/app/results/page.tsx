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

  // ─── STORAGE LOGIC ───────────────────────────
  // We use your existing Vercel variable.
  // We remove '/api' if it exists so we can point to the root for GIF files.
  const RAW_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  const STORAGE_URL = "/api/assets";

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

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white">
        <div className="text-center space-y-4">
          <p className="text-lg font-semibold text-gray-700">No analysis found.</p>
          <button onClick={() => router.push('/upload')} className="bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold">
            Go to Upload
          </button>
        </div>
      </div>
    );
  }

  const displayScore = data.score ?? data.comparison?.dtw_similarity_score ?? 0;
  const ui = data.deviation_moments_ui;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white px-4 py-10 flex justify-center text-gray-900">
      <div className="w-full max-w-6xl space-y-8">

        {/* 1. SCORE */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white/60 backdrop-blur p-8 rounded-3xl text-center shadow-xl border border-white/50">
          <h1 className="text-2xl font-bold text-purple-700">Analysis Results</h1>
          <p className="text-8xl font-black mt-4 tracking-tighter">
            {Number(displayScore).toFixed(1)}
          </p>
          <p className="text-gray-500 uppercase tracking-widest text-sm font-bold">Similarity Score</p>
        </motion.div>

        {/* 2. SUMMARIES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-green-50/80 p-6 rounded-2xl border border-green-200">
            <h3 className="font-bold text-green-800">✨ What Went Well</h3>
            <p className="mt-2 text-gray-700 text-sm leading-relaxed">{ui?.summaries?.what_went_well || "Good overall timing."}</p>
          </div>
          <div className="bg-orange-50/80 p-6 rounded-2xl border border-orange-200">
            <h3 className="font-bold text-orange-800">🚀 Where to Improve</h3>
            <p className="mt-2 text-gray-700 text-sm leading-relaxed">{ui?.summaries?.where_to_improve || "Work on form precision."}</p>
          </div>
        </div>

        {/* 3. GIF TIMELINE */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold ml-2">Key Moments to Review</h2>
          {ui?.deviation_moments?.map((moment, i) => (
            <motion.div key={i} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.1 }} className="bg-white rounded-3xl shadow-lg overflow-hidden grid grid-cols-1 lg:grid-cols-2">
              <div className="relative bg-black aspect-video flex items-center justify-center">
                {moment.gif_path ? (
                  <img 
                    src={`${STORAGE_URL}/${moment.gif_path}`} 
                    className="w-full h-full object-contain"
                    alt="Deviation Clip"
                    onError={(e) => {
                        // Fallback if image fails to load
                        e.currentTarget.src = "https://via.placeholder.com/400x225?text=GIF+Loading...";
                    }}
                  />
                ) : (
                  <div className="text-white text-xs">Generating Visual...</div>
                )}
                <div className="absolute top-4 left-4 bg-purple-700 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md">
                  {moment.user_time_clip_label}
                </div>
              </div>
              <div className="p-8 flex flex-col justify-center">
                <span className="text-orange-600 font-bold text-xs uppercase tracking-widest">Moment {i + 1}</span>
                <h3 className="text-xl font-bold mt-1">{moment.issue}</h3>
                <div className="mt-6 p-4 bg-purple-50 rounded-xl border border-purple-100">
                  <span className="text-purple-700 font-bold text-sm">Action Tip:</span>
                  <p className="text-gray-700 mt-1 italic text-sm">{moment.recommendation}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <button onClick={() => router.push('/upload')} className="w-full bg-purple-700 hover:bg-purple-800 text-white py-4 rounded-2xl font-bold text-lg shadow-lg">
          Analyze Another Video
        </button>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading Feedback...</div>}>
      <ResultsContent />
    </Suspense>
  );
}
