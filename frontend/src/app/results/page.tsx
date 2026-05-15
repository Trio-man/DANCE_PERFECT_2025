'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';

interface DeviationMoment {
  rank: number;
  issue: string;
  recommendation: string;
  user_time_clip_label: string;
  gif_path: string;
}

interface AnalysisData {
  comparison?: {
    similarity_score: number;
    deviation_moments_ui: {
      summaries: {
        what_went_well: string;
        where_to_improve: string;
      };
      deviation_moments: DeviationMoment[];
    };
  };
  score?: number; // Fallback key
}

function ResultsContent() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const router = useRouter();

  useEffect(() => {
    const savedData = localStorage.getItem('analysis_results');
    if (savedData) {
      try {
        setData(JSON.parse(savedData));
      } catch (e) {
        router.push('/');
      }
    } else {
      router.push('/');
    }
  }, [router]);

  if (!data) return <div className="min-h-screen flex items-center justify-center font-mono">LOADING DATA...</div>;

  const score = data?.comparison?.similarity_score ?? data?.score ?? 0;
  const summaries = data?.comparison?.deviation_moments_ui?.summaries;
  const moments = data?.comparison?.deviation_moments_ui?.deviation_moments ?? [];

  return (
    <div className="p-4 md:p-10 max-w-5xl mx-auto space-y-8 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-3xl shadow-sm p-12 text-center border border-gray-100">
        <h2 className="text-purple-600 font-bold text-xl mb-2">Dance Performance</h2>
        <div className="text-8xl font-black text-slate-900">{score.toFixed(1)}</div>
        <p className="text-slate-400 font-medium tracking-widest uppercase text-xs mt-2">Similarity Score</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
          <h3 className="text-emerald-700 font-bold mb-2">✨ Strengths</h3>
          <p className="text-emerald-900 text-sm">{summaries?.what_went_well}</p>
        </div>
        <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100">
          <h3 className="text-orange-700 font-bold mb-2">🚀 Growth Areas</h3>
          <p className="text-orange-900 text-sm">{summaries?.where_to_improve}</p>
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-2xl font-bold text-slate-800">Key Moments</h3>
        {moments.map((moment, idx) => (
          <div key={idx} className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden flex flex-col md:flex-row">
            <div className="w-full md:w-1/2 bg-black aspect-video flex items-center justify-center">
              <img 
                src={`/api/assets/${moment.gif_path}`} 
                alt="Deviation"
                className="w-full h-full object-contain"
                onError={(e) => (e.currentTarget.src = 'https://placehold.co/600x400?text=GIF+Loading...')}
              />
            </div>
            <div className="p-6 md:w-1/2 flex flex-col justify-center">
              <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Moment Rank #{moment.rank}</span>
              <h4 className="text-lg font-bold text-slate-900 mt-1 mb-3">{moment.issue}</h4>
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                <p className="text-purple-900 text-sm italic">&quot;{moment.recommendation}&quot;</p>
              </div>
              <p className="mt-4 text-[10px] text-slate-400 font-mono uppercase">Detected @ {moment.user_time_clip_label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div>Loading Dashboard...</div>}>
      <ResultsContent />
    </Suspense>
  );
}
