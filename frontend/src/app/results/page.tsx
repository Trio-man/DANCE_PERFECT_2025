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

  // This points to our Next.js API proxy, which handles the HTTPS-to-HTTP tunnel
  const STORAGE_URL = "/api/assets/deviation_gifs";

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
          <button 
            onClick={() => router.push('/upload')} 
            className="bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:bg-purple-800 transition-colors"
          >
            Go to Upload
          </button>
        </div>
      </div>
    );
  }

  // Fallback chain for the score to ensure we don't just see 0.0
  const displayScore = data.score ?? 
                       data.comparison?.dtw_similarity_score ?? 
                       data.comparison?.similarity_score ?? 
                       0;

  const ui = data.deviation_moments_ui;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white px-4 py-10 flex justify-center text-gray-900">
      <div className="w-full max-w-6xl space-y-8">

        {/* 1. SCORE CARD */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="bg-white/60 backdrop-blur p-8 rounded-3xl text-center shadow-xl border border-white/50"
        >
          <h1 className="text-2xl font-bold text-purple-700">Analysis Results</h1>
          <p className="text-8xl font-black mt-4 tracking-tighter bg-gradient-to-r from-purple-800 to-indigo-700 bg-clip-text text-transparent">
            {Number(displayScore).toFixed(1)}
          </p>
          <p className="text-gray-500 uppercase tracking-widest text-sm font-bold">Similarity Score</p>
        </motion.div>

        {/* 2. SUMMARIES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div 
            initial={{ opacity: 0, x: -20 }} 
            animate={{ opacity: 1, x: 0 }}
            className="bg-green-50/80 p-6 rounded-2xl border border-green-200 shadow-sm"
          >
            <h3 className="font-bold text-green-800 flex items-center gap-2 text-lg">✨ What Went Well</h3>
            <p className="mt-2 text-gray-700 leading-relaxed italic">
              {ui?.summaries?.what_went_well || "The system captured your overall rhythm successfully."}
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }}
            className="bg-orange-50/80 p-6 rounded-2xl border border-orange-200 shadow-sm"
          >
            <h3 className="font-bold text-orange-800 flex items-center gap-2 text-lg">🚀 Where to Improve</h3>
            <p className="mt-2 text-gray-700 leading-relaxed italic">
              {ui?.summaries?.where_to_improve || "Focus on the specific moments highlighted below."}
            </p>
          </motion.div>
        </div>

        {/* 3. GIF TIMELINE */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold ml-2 text-gray-800">Key Moments to Review</h2>
          {ui?.deviation_moments && ui.deviation_moments.length > 0 ? (
            ui.deviation_moments.map((moment, i) => {
              // Clean the filename in case it includes the folder prefix already
              const gifName = moment.gif_path?.split('/').pop();

              return (
                <motion.div 
                  key={i} 
                  initial={{ y: 30, opacity: 0 }} 
                  animate={{ y: 0, opacity: 1 }} 
                  transition={{ delay: i * 0.1 }} 
                  className="bg-white rounded-3xl shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 border border-gray-100"
                >
                  {/* Visual Container */}
                  <div className="relative bg-black aspect-video flex items-center justify-center group">
                    {gifName ? (
                      <img 
                        src={`${STORAGE_URL}/${gifName}`} 
                        className="w-full h-full object-contain transition-transform group-hover:scale-105"
                        alt={`Moment ${i + 1}`}
                        onError={(e) => {
                          e.currentTarget.src = "https://via.placeholder.com/600x400?text=GIF+Loading...";
                        }}
                      />
                    ) : (
                      <div className="text-gray-400 text-sm italic">Video clip unavailable</div>
                    )}
                    <div className="absolute top-4 left-4 bg-purple-700/90 backdrop-blur-sm text-white px-4 py-1 rounded-full text-xs font-bold shadow-lg">
                      {moment.user_time_clip_label || `Time: ${moment.user_time}`}
                    </div>
                  </div>

                  {/* Text Feedback */}
                  <div className="p-10 flex flex-col justify-center bg-white">
                    <span className="text-orange-600 font-black text-xs uppercase tracking-[0.2em] mb-2">Moment {i + 1}</span>
                    <h3 className="text-2xl font-bold text-gray-900 leading-tight">{moment.issue}</h3>
                    <div className="mt-8 p-5 bg-purple-50/50 rounded-2xl border border-purple-100">
                      <span className="text-purple-700 font-bold text-sm flex items-center gap-2">
                        💡 Action Tip:
                      </span>
                      <p className="text-gray-700 mt-2 italic leading-relaxed">
                        {moment.recommendation}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="text-center py-20 bg-white/40 rounded-3xl border border-dashed border-gray-300">
              <p className="text-gray-500 italic">No specific deviation clips found for this session.</p>
            </div>
          )}
        </div>

        {/* 4. RE-TRY ACTION */}
        <button 
          onClick={() => router.push('/upload')} 
          className="w-full bg-purple-700 hover:bg-purple-800 text-white py-5 rounded-2xl font-bold text-xl shadow-2xl transition-all active:scale-[0.98] mb-10"
        >
          Analyze New Session
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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading Your Feedback...</div>}>
      <ResultsContent />
    </Suspense>
  );
}
