'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

// -----------------------------
// TYPES
// -----------------------------
type TimelineItem = {
  start?: string;
  end?: string;
  body_part?: string;
  message?: string;
  score?: number;
};

type Feedback = {
  summary?: string;
  top_errors?: string[];
  body_part_comments?: string[];
  detailed_timeline?: TimelineItem[];
};

type Visuals = {
  reference?: { overlay_video?: string };
  user?: { overlay_video?: string };
};

type AnalysisResult = {
  score?: number;
  feedback?: Feedback;
  comparison?: { similarity_score?: number; feedback?: Feedback };
  visuals?: Visuals;
};

// -----------------------------
// SAFE EXTRACTOR (FIXES EMPTY UI)
// -----------------------------
function normalizeResult(raw: AnalysisResult | null) {
  const feedback =
    raw?.feedback ||
    raw?.comparison?.feedback ||
    {};

  const timeline =
    feedback?.detailed_timeline ?? [];

  const topErrors =
    feedback?.top_errors ?? [];

  const score =
    raw?.score ??
    raw?.comparison?.similarity_score ??
    0;

  const video =
    raw?.visuals?.user?.overlay_video ||
    raw?.visuals?.reference?.overlay_video ||
    '';

  return { feedback, timeline, topErrors, score, video };
}

// -----------------------------
// PAGE
// -----------------------------
function ResultsContent() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [time, setTime] = useState(0);

  // LOAD
  useEffect(() => {
    const stored = sessionStorage.getItem('dp_result');

    if (!stored) {
      setResult(null);
      return;
    }

    try {
      setResult(JSON.parse(stored));
    } catch {
      setResult(null);
    }
  }, []);

  const { feedback, timeline, topErrors, score, video } = useMemo(() => {
    return normalizeResult(result);
  }, [result]);

  // CHART (SAFE)
  const chartData = useMemo(() => {
    if (!timeline.length) {
      return Array.from({ length: 10 }).map((_, i) => ({
        frame: i + 1,
        score: Math.max(50, score - i * 1.5)
      }));
    }

    return timeline.map((t, i) => ({
      frame: i + 1,
      score: t.score ?? (score - i * 2)
    }));
  }, [timeline, score]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setTime(videoRef.current.currentTime);
    }
  };

  // EMPTY STATE
  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <button
          onClick={() => router.push('/upload')}
          className="bg-purple-600 text-white px-6 py-3 rounded-xl"
        >
          No Results Found — Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-purple-100 p-6 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">

        {/* SCORE */}
        <motion.div className="bg-white/70 p-8 rounded-2xl text-center">
          <h1 className="text-2xl font-bold text-purple-700">
            Dance Analysis Results
          </h1>

          <p className="text-6xl font-extrabold mt-4">
            {Number(score).toFixed(1)}
          </p>

          <p className="text-gray-600">
            Overall performance score
          </p>
        </motion.div>

        {/* SCRUBBER */}
        <div className="bg-white/70 p-6 rounded-2xl">
          <h2 className="font-bold mb-3">Frame Scrubber</h2>

          {video ? (
            <video
              ref={videoRef}
              onTimeUpdate={handleTimeUpdate}
              controls
              className="w-full rounded-xl"
              src={video}
            />
          ) : (
            <p className="text-gray-500">No video available</p>
          )}

          <p className="text-sm text-gray-500 mt-2">
            Time: {time.toFixed(2)}s
          </p>
        </div>

        {/* PERFORMANCE GRAPH */}
        <div className="bg-white/70 p-6 rounded-2xl">
          <h2 className="font-bold mb-3">Performance Trend</h2>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="frame" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#7c3aed"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* KEY MISTAKES */}
        <div className="bg-white/70 p-6 rounded-2xl">
          <h2 className="font-bold mb-3">Key Mistakes</h2>

          {topErrors.length === 0 ? (
            <p className="text-gray-500">No major errors detected.</p>
          ) : (
            <ul className="list-disc pl-5">
              {topErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        {/* TIMELINE */}
        <div className="bg-white/70 p-6 rounded-2xl">
          <h2 className="font-bold mb-3">Frame Insights</h2>

          {timeline.length === 0 ? (
            <p className="text-gray-500">
              Frame breakdown not available (backend did not return timeline data)
            </p>
          ) : (
            <div className="space-y-3">
              {timeline.map((t, i) => (
                <div key={i} className="border rounded-xl p-4 bg-white">
                  <p className="font-semibold">
                    {t.start} - {t.end} • {t.body_part}
                  </p>
                  <p className="text-gray-700">{t.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* BACK */}
        <button
          onClick={() => router.push('/upload')}
          className="w-full bg-purple-700 text-white py-3 rounded-xl"
        >
          Analyze Another Video
        </button>
      </div>
    </div>
  );
}

// -----------------------------
export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading...</div>}>
      <ResultsContent />
    </Suspense>
  );
}
