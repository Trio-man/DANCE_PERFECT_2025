'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
interface DeviationMoment {
  rank: number;
  issue: string;
  recommendation: string;
  user_time_clip_label: string;
  gif_path: string;
}

interface AnalysisData {
  comparison: {
    similarity_score: number;
    deviation_moments_ui: {
      summaries: {
        what_went_well: string;
        where_to_improve: string;
      };
      deviation_moments: DeviationMoment[];
    };
  };
}

// ─────────────────────────────────────────────
// RESULTS CONTENT
// ─────────────────────────────────────────────
function ResultsContent() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Read from browser storage
    const savedData = localStorage.getItem('analysis_results');
    
    if (savedData) {
      try {
        setData(JSON.parse(savedData));
      } catch (e) {
        console.error("Data corruption error:", e);
        router.push('/');
      }
    } else {
      // If no data found, return to upload page
      router.push('/');
    }
  }, [router]);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse font-mono text-slate-400 text-lg">
          FETCHING ANALYSIS...
        </div>
      </div>
    );
  }

  const score = data?.comparison?.similarity_score ?? 0;
  const summaries = data?.comparison?.deviation_moments_ui?.summaries;
  const moments = data?.comparison?.deviation_moments_ui?.deviation_moments ?? [];

  const getProxyUrl = (path: string) => {
    if (!path) return "";
    return `/api/assets/${path}`;
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 bg-slate-50 min-h-screen">
      
      {/* 1. Similarity Score Card */}
      <div className="bg-white rounded-3xl shadow-sm p-10 text-center border border-gray-100">
        <h2 className="text-purple-600 font-bold text-xl mb-4 tracking-tight">Performance Score</h2>
        <div className="text-8xl font-black text-slate-900 tabular-nums">
          {score.toFixed(1)}
        </div>
        <p className="text-slate-400 font-medium mt-2 tracking-widest uppercase text-xs">
          Overall Similarity
        </p>
      </div>

      {/* 2. AI Summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
          <h3 className="text-emerald-700 font-bold mb-2 flex items-center gap-2">
            ✨ What Went Well
          </h3>
          <p className="text-emerald-900 text-sm leading-relaxed">{summaries?.what_went_well}</p>
        </div>
        <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100">
          <h3 className="text-orange-700 font-bold mb-2 flex items-center gap-2">
            🚀 Improvement Tips
          </h3>
          <p className="text-orange-900 text-sm leading-relaxed">{summaries?.where_to_improve}</p>
        </div>
      </div>

      {/* 3. Detailed Moment Breakdown */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Visual Analysis</h2>
        {moments.map((moment, index) => (
          <div 
            key={index} 
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col md:row"
          >
            {/* Asset Preview (GIF) */}
            <div className="w-full md:w-1/2 bg-black aspect-video flex items-center justify-center overflow-hidden">
              <img 
                src={getProxyUrl(moment.gif_path)} 
                alt={`Deviation Moment ${moment.rank}`}
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://placehold.co/600x400?text=Processing+Visual...';
                }}
              />
            </div>
            
            {/* Feedback Content */}
            <div className="p-6 md:w-1/2 flex flex-col justify-center">
              <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">
                Priority {moment.rank} Correction
              </span>
              <h4 className="text-lg font-bold text-slate-900 mb-3 leading-tight">
                {moment.issue}
              </h4>
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                <p className="text-purple-900 text-sm italic">
                  &quot;{moment.recommendation}&quot;
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>Timestamp: {moment.user_time_clip_label}</span>
                <span className="px-2 py-0.5 bg-slate-100 rounded">AI DETECTED</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Navigation */}
      <div className="text-center pt-8">
        <button 
          onClick={() => router.push('/')}
          className="text-slate-400 hover:text-purple-600 text-sm font-medium transition-colors"
        >
          ← Analyze Another Dance
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE EXPORT
// ─────────────────────────────────────────────
export default function ResultsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500 animate-pulse">Loading analysis dashboard...</p>
      </div>
    }>
      <ResultsContent />
    </Suspense>
  );
}
