'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  FiArrowLeft,
  FiActivity,
  FiAward,
  FiCheckCircle,
  FiClock,
} from 'react-icons/fi';

// Reads your Vercel environment configuration dynamically
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface DeviationMoment {
  rank: number;
  issue: string;
  recommendation: string;
  user_time_clip_label: string;
  gif_path: string;
  path_sample_start?: number;
  path_sample_end?: number;
}

interface AnalysisData {
  status: string;
  run_id: string;
  processing_time_seconds?: number;
  processing_time_display?: string;
  ref_effective_fps?: number;
  user_effective_fps?: number;
  ref_sequence_length?: number;
  user_sequence_length?: number;
  dtw_distance: number;
  dtw_similarity_score: number;
  summaries: {
    what_went_well: string;
    where_to_improve: string;
  };
  deviation_moments: DeviationMoment[];
}

function ResultsContent() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!API_BASE_URL) {
      console.warn('Environment variable NEXT_PUBLIC_API_URL is not defined.');
    }

    const savedData = localStorage.getItem('analysis_results');

    if (savedData) {
      try {
        setData(JSON.parse(savedData));
      } catch (e) {
        router.push('/upload');
      }
    } else {
      router.push('/upload');
    }
  }, [router]);

  if (!data) return null;

  const score = data.dtw_similarity_score ?? 0;
  const summaries = data.summaries;
  const moments = data.deviation_moments ?? [];
  const processingTime = data.processing_time_display || null;

  return (
    <div className="min-h-screen py-10 px-4 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header Navigation */}
        <button
          onClick={() => router.push('/upload')}
          className="flex items-center gap-2 text-purple-700 font-semibold hover:text-purple-900 transition-all mb-4"
        >
          <FiArrowLeft /> Back to Upload
        </button>

        {/* 1. Score Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/70 backdrop-blur-md border border-white/60 shadow-xl rounded-3xl p-10 text-center"
        >
          <h2 className="text-purple-600 font-bold text-xl mb-2 flex items-center justify-center gap-2">
            <FiAward /> Similarity Score
          </h2>

          <div className="text-9xl font-black text-slate-900 drop-shadow-sm">
            {score.toFixed(1)}
          </div>

          <p className="text-slate-500 font-medium tracking-[0.2em] uppercase text-xs mt-4">
            Performance Breakdown
          </p>

         {processingTime && (
          <div className="mt-4 flex items-center justify-center gap-2 text-slate-500">
           <FiClock size={14} className="text-purple-500/70" />
           <span className="text-xs font-medium tracking-wide">
             Processing Time:
          </span>
          <span className="text-xs font-bold text-slate-700">
            {processingTime}
          </span>
        </div>
       )}

        {/* 2. Summaries */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-emerald-50/80 backdrop-blur-sm p-6 rounded-2xl border border-emerald-200 shadow-sm"
          >
            <h3 className="text-emerald-700 font-bold mb-3 flex items-center gap-2">
              <FiCheckCircle /> Strengths
            </h3>
            <p className="text-emerald-900 text-sm leading-relaxed">
              {summaries?.what_went_well}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-orange-50/80 backdrop-blur-sm p-6 rounded-2xl border border-orange-200 shadow-sm"
          >
            <h3 className="text-orange-700 font-bold mb-3 flex items-center gap-2">
              <FiActivity /> Growth Areas
            </h3>
            <p className="text-orange-900 text-sm leading-relaxed">
              {summaries?.where_to_improve}
            </p>
          </motion.div>
        </div>

        {/* 3. Visual Breakdown */}
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-slate-800 ml-2">
            Visual Breakdown
          </h3>

          {moments.map((moment, idx) => {
            const filename = moment.gif_path.split('/').pop();
            const gifUrl = `/deviation_gifs/${filename}`;

            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-white/60 overflow-hidden flex flex-col md:flex-row"
              >
                {/* GIF Preview Section */}
                <div className="w-full md:w-1/2 bg-black flex items-center justify-center overflow-hidden">
                  <img
                    src={gifUrl}
                    alt={`Moment Rank ${moment.rank}`}
                    className="w-full h-auto object-contain max-h-[500px]"
                    loading="eager"
                    onError={(e) => {
                      e.currentTarget.src =
                        'https://placehold.co/600x400/7c3aed/ffffff?text=AI+Visual+Unavailable';
                    }}
                  />
                </div>

                {/* Information Section */}
                <div className="p-8 md:w-1/2 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-purple-500 uppercase tracking-widest mb-1">
                    MOMENT RANK #{moment.rank}
                  </span>

                  <h4 className="text-xl font-bold text-slate-900 mb-4 leading-tight">
                    {moment.issue}
                  </h4>

                  <div className="bg-purple-100/50 p-5 rounded-2xl border border-purple-200">
                    <p className="text-purple-900 text-sm italic font-medium">
                      &quot;{moment.recommendation}&quot;
                    </p>
                  </div>

                  <div className="mt-6 flex items-center justify-between gap-4">
                    <span className="text-[10px] text-slate-400 font-mono">
                      TIMESTAMP: {moment.user_time_clip_label}
                    </span>

                    <span className="px-3 py-1 bg-white/50 rounded-full text-[9px] font-bold text-purple-600 border border-purple-100">
                      AI PROCESSED
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#d6c1ff] flex items-center justify-center">
          Initializing Results...
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
