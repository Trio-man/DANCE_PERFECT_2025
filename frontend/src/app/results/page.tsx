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
// TYPES (NO ANY)
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
  reference?: {
    preview_images?: string[];
    overlay_video?: string;
  };
  user?: {
    preview_images?: string[];
    overlay_video?: string;
  };
};

type AnalysisResult = {
  score?: number;
  feedback?: Feedback;
  comparison?: {
    similarity_score?: number;
    feedback?: Feedback;
  };
  visuals?: Visuals;
  outputs?: {
    visuals?: Visuals;
  };
};

// -----------------------------
// MAIN
// -----------------------------
function ResultsContent() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [time, setTime] = useState(0);

  // -----------------------------
  // LOAD SAFE
  // -----------------------------
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

  // -----------------------------
  // DERIVED DATA
  // -----------------------------
  const score =
    result?.score ??
    result?.comparison?.similarity_score ??
    0;

  const feedback = result?.feedback || result?.comparison?.feedback || {};

  const timeline = feedback?.detailed_timeline ?? [];

  const topErrors = feedback?.top_errors ?? [];

  // -----------------------------
  // CHART DATA (V4 FEATURE)
  // -----------------------------
  const chartData = useMemo(() => {
    return timeline.map((t, i) => ({
      frame: i + 1,
      score: t.score ?? Math.max(50, score - i * 2)
    }));
  }, [timeline, score]);

  // -----------------------------
  // VIDEO SCRUBBER
  // -----------------------------
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setTime(videoRef.current.currentTime);
    }
  };

  // -----------------------------
  // EMPTY STATE
  // -----------------------------
  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <button
          onClick={() => router.push('/upload')}
          className="bg-purple-600 text-white px-6 py-3 rounded-xl"
        >
          No results — Go back
        </button>
      </div>
    );
  }

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-purple-100 p-6 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">

        {/* HERO SCORE */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/70 backdrop-blur p-8 rounded-2xl text-center"
        >
          <h1 className="text-2xl font-bold text-purple-700">
            Results Dashboard V4
          </h1>

          <p className="text-6xl font-extrabold mt-4">
            {Number(score).toFixed(1)}
          </p>

          <p className="text-gray-600 mt-2">
            Overall performance score
          </p>
        </motion.div>

        {/* VIDEO SCRUBBER */}
        <div className="bg-white/70 p-6 rounded-2xl">
          <h2 className="font-bold mb-3">Frame Scrubber</h2>

          <video
            ref={videoRef}
            onTimeUpdate={handleTimeUpdate}
            controls
            className="w-full rounded-xl"
            src={result?.visuals?.user?.overlay_video || ''}
          />

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

        {/* KEY ERRORS */}
        <div className="bg-white/70 p-6 rounded-2xl">
          <h2 className="font-bold mb-3">Key Mistakes</h2>

          {topErrors.length === 0 ? (
            <p className="text-gray-500">No major errors detected.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {topErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        {/* TIMELINE INSIGHTS */}
        <div className="bg-white/70 p-6 rounded-2xl">
          <h2 className="font-bold mb-3">Frame Insights</h2>

          {timeline.length === 0 ? (
            <p className="text-gray-500">No frame breakdown available.</p>
          ) : (
            <div className="space-y-3">
              {timeline.map((t, i) => (
                <div
                  key={i}
                  className="border rounded-xl p-4 bg-white"
                >
                  <p className="font-semibold">
                    {t.start} - {t.end} • {t.body_part}
                  </p>
                  <p className="text-gray-700">
                    {t.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ACTION */}
        <button
          onClick={() => router.push('/upload')}
          className="w-full bg-purple-700 text-white py-3 rounded-xl font-semibold"
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
