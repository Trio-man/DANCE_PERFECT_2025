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

  // Points to our secure Next.js API proxy tunnel
  const PROXY_URL = "/api/assets/deviation_gifs";

  useEffect(() => {
    const stored = sessionStorage.getItem('dp_result');
    if (stored) {
      try {
        const parsed: BackendResult = JSON.parse(stored);
        setData(parsed);
      } catch (err) {
        console.error('Failed to parse result:', err);
      }
    }
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <button 
          onClick={() => router.push('/upload')} 
          className="bg-purple-700 text-white px-6 py-2 rounded-lg hover:bg-purple-800 transition-colors shadow-md"
        >
          No data found. Return to Upload
        </button>
      </div>
    );
  }

  // FIXED SCORE LOGIC: Fallback through all possible backend field names
  const displayScore = data.score ?? 
                       data.comparison?.dtw_similarity_score ?? 
                       data.comparison?.similarity_score ?? 
                       0;

  const ui = data.deviation_moments_ui;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f3e8ff] to-[#f0f9ff] px-4 py-10 flex justify-center text-slate-900">
      <div className="w-full max-w-5xl space-y-8">

        {/* 1. SCORE CARD */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="bg-white/80 backdrop-blur shadow-xl rounded-3xl p-10 text-center border border-white"
        >
          <h1 className="text-xl font-bold text-purple-800 uppercase tracking-widest">Similarity Score</h1>
          <p className="text-9xl font-black text-slate-900 mt-2 tracking-tighter">
            {Number(displayScore).toFixed(1)}
          </p>
        </motion.div>

        {/* 2. SUMMARIES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-green-50 p-6 rounded-2xl border border-green-100 shadow-sm">
            <h3 className="font-bold text-green-800 flex items-center gap-2">✨ What Went Well</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              {ui?.summaries?.what_went_well || "Good effort on this session!"}
            </p>
          </div>
          <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 shadow-sm">
            <h3 className="font-bold text-amber-800 flex items-center gap-2">🚀 Where to Improve</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              {ui?.summaries?.where_to_improve || "Keep practicing the key moves."}
            </p>
          </div>
        </div>

        {/* 3. MOMENTS TIMELINE */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold px-2 text-slate-800">Analysis Breakdown</h2>
          {ui?.deviation_moments && ui.deviation_moments.length > 0 ? (
            ui.deviation_moments.map((moment, i) => {
              // Extract filename safely to avoid double-pathing issues
              const filename = moment.gif_path?.includes('/') 
                ? moment.gif_path.split('/').pop() 
                : moment.gif_path;

              const finalImageUrl = `${PROXY_URL}/${filename}`;

              return (
                <motion.div 
                  key={i} 
                  initial={{ y: 20, opacity: 0 }} 
                  animate={{ y: 0, opacity: 1 }} 
                  transition={{ delay: i * 0.1 }}
                  className="bg-white rounded-3xl shadow-lg overflow-hidden border border-slate-100 flex flex-col lg:flex-row hover:shadow-2xl transition-shadow"
                >
                  {/* GIF Preview */}
                  <div className="lg:w-1/2 bg-black aspect-video relative flex items-center justify-center">
                    {filename ? (
                      <img 
                        src={finalImageUrl} 
                        className="w-full h-full object-contain"
                        alt={`Moment ${i + 1}`}
                        loading="lazy"
                        onError={(e) => {
                          if (!e.currentTarget.src.includes('placehold.co')) {
                            e.currentTarget.src = `https://placehold.co/600x400/000000/FFFFFF/png?text=Preview+Moment+${i+1}`;
                          }
                        }}
                      />
                    ) : (
                      <div className="text-slate-500 text-xs italic">Visual unavailable</div>
                    )}
                    <div className="absolute top-4 left-4 bg-purple-600/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-bold shadow-md">
                      {moment.user_time_clip_label || moment.user_time}
                    </div>
                  </div>

                  {/* Feedback Details */}
                  <div className="lg:w-1/2 p-8 flex flex-col justify-center">
                    <span className="text-amber-600 font-bold text-xs uppercase tracking-widest">Issue Found</span>
                    <h3 className="text-xl font-bold mt-1 text-slate-900 leading-tight">{moment.issue}</h3>
                    <div className="mt-6 p-4 bg-purple-50 rounded-xl border border-purple-100">
                      <p className="text-purple-900 text-sm italic font-medium leading-relaxed">
                        &quot; {moment.recommendation} &quot;
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="py-12 text-center bg-white rounded-3xl border border-dashed border-slate-300 text-slate-400 italic">
              No specific moments found to highlight.
            </div>
          )}
        </div>

        {/* 4. ACTIONS */}
        <button 
          onClick={() => router.push('/upload')} 
          className="w-full py-5 bg-slate-900 text-white font-bold rounded-2xl shadow-xl hover:bg-black transition-all active:scale-[0.98] mb-12"
        >
          Start New Analysis
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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center font-medium">Loading Analysis Results...</div>}>
      <ResultsContent />
    </Suspense>
  );
}
