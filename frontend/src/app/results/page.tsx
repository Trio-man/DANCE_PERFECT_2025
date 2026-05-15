'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';

// --- Types ---
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

function ResultsContent() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const router = useRouter();

  useEffect(() => {
    // READ from the browser's storage
    const savedData = localStorage.getItem('analysis_results');
    
    if (savedData) {
      try {
        setData(JSON.parse(savedData));
      } catch (e) {
        console.error("Data corruption error:", e);
        router.push('/');
      }
    } else {
      // If no data found, go back to upload
      router.push('/');
    }
  }, [router]);

  if (!data) return <div className="p-20 text-center font-mono">Loading Results...</div>;

  // Use optional chaining and default values to prevent crashes
  const score = data?.comparison?.similarity_score ?? 0;
  const summaries = data?.comparison?.deviation_moments_ui?.summaries;
  const moments = data?.comparison?.deviation_moments_ui?.deviation_moments ?? [];

  // Helper to route GIF requests through your Next.js API proxy
  const getProxyUrl = (path: string) => {
    if (!path) return "";
    return `/api/assets/${path}`;
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 bg-slate-50 min-h-screen">
      {/* 75.7 Score Card */}
      <div className="bg-white rounded-3xl shadow-sm p-12 text-center border border-gray-100">
        <h2 className="text-purple-600 font-bold text-xl mb-4">Dance Performance</h2>
        <div className="text-8xl font-black text-slate-900">
          {score.toFixed(1)}
        </div>
        <p className="text-slate-400 font-medium mt-2 tracking-widest uppercase text-sm">
          Similarity Score
        </p>
      </div>

      {/* AI Summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
          <h3 className="text-emerald-700 font-bold mb-2 flex items-center gap-2">✨ What Went Well</h3>
          <p className="text-emerald-900 text-sm leading-relaxed">{summaries?.what_went_well}</p>
        </div>
        <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100">
          <h3 className="text-orange-700 font-bold mb-2 flex items-center gap-2">🚀 Pro Tips</h3>
          <p className="text-orange-900 text-sm leading-relaxed">{summaries?.where_to_improve}</p>
        </div>
      </div>

      {/* Visual Analysis Cards */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-800">Review Key Moments</h2>
        {moments.map((moment, index) => (
          <div key={index} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col md:flex-row">
            {/* The GIF Preview */}
            <div className="w-full md:w-1/2 bg-black aspect-video flex items-center justify-center">
              <img 
                src={getProxyUrl(moment.gif_path)} 
                alt={`Moment ${moment.rank}`}
                className="w-full h-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/600x400?text=Processing+GIF...'; }}
              />
            </div>
            
            {/* Context Info */}
            <div className="p-6 md:w-1/2 flex flex-col justify-center">
              <span className="text-xs font-bold text-orange-500 uppercase">Rank {moment.rank} Improvement</span>
              <h4 className="text-lg font-bold text-slate-900 mt-1 mb-3">{moment.issue}</h4>
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                <p className="text-purple-900 text-sm leading-relaxed italic">"{moment.recommendation}"</p>
              </div>
              <div className="mt-4 text-[10px] text-slate-400 font-mono">Timestamp: {moment.user_time_clip_label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="p-20 text-center">Preparing Dashboard...</div>}>
      <ResultsContent />
    </Suspense>
  );
}
