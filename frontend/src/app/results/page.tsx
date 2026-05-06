'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Image from 'next/image';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// -----------------------------
// Types
// -----------------------------
type TimelineItem = {
  start: string;
  end: string;
  severity: string;
  body_part: string;
  joint: string;
  message: string;
};

type Feedback = {
  summary?: string;
  timing?: string;
  body_part_comments?: string[];
  top_errors?: string[];
  detailed_timeline?: TimelineItem[];
};

type Visuals = {
  reference?: { preview_images?: string[]; overlay_video?: string };
  user?: { preview_images?: string[]; overlay_video?: string };
};

type AnalysisResult = {
  score?: number;
  feedback?: Feedback;
  comparison?: {
    similarity_score?: number;
    feedback?: Feedback;
  };
  visuals?: Visuals;
  outputs?: { visuals?: Visuals };
};

// -----------------------------
// MAIN
// -----------------------------
function ResultsContent() {
  const router = useRouter();

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [time, setTime] = useState(0);

  // -----------------------------
  // LOAD RESULT
  // -----------------------------
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('dp_result');

      if (!stored) {
        router.replace('/upload');
        return;
      }

      const parsed: AnalysisResult = JSON.parse(stored);
      setResult(parsed);
    } catch (e) {
      console.error(e);
      router.replace('/upload');
    } finally {
      setLoading(false);
    }
  }, [router]);

  // -----------------------------
  // DERIVED DATA
  // -----------------------------
  const score =
    result?.score ?? result?.comparison?.similarity_score ?? 0;

  const feedback = useMemo(() => {
    return result?.feedback || result?.comparison?.feedback || {};
  }, [result]);

  const visuals = result?.outputs?.visuals || result?.visuals;

  const timeline = feedback.detailed_timeline ?? [];
  const topErrors = feedback.top_errors ?? [];

  const chartData = useMemo(() => {
    return timeline.map((t, i) => ({
      frame: i + 1,
      severity: Number(t.severity) || 0,
    }));
  }, [timeline]);

  const videoUrl =
    visuals?.user?.overlay_video || visuals?.reference?.overlay_video || '';

  // -----------------------------
  // LOADING
  // -----------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  // -----------------------------
  // EMPTY STATE
  // -----------------------------
  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <button onClick={() => router.push('/upload')}>
          Back to Upload
        </button>
      </div>
    );
  }

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-purple-100 p-6">
      <div className="max-w-6xl mx-auto space-y-10">

        {/* SCORE HERO */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-2xl font-bold">Here are your results</h1>

          <div className="text-6xl font-extrabold mt-4 text-purple-700">
            {score.toFixed(1)}
          </div>

          <p className="text-gray-600 mt-2">
            {score > 80
              ? 'Excellent performance'
              : score > 60
              ? 'Good but needs improvement'
              : 'Needs practice'}
          </p>
        </motion.div>

        {/* VIDEO SCRUBBER */}
        {videoUrl && (
          <div className="bg-white p-4 rounded-xl shadow">
            <h2 className="font-semibold mb-3">Timeline Scrubber</h2>

            <video
              ref={videoRef}
              src={videoUrl}
              controls
              className="w-full rounded-lg"
              onTimeUpdate={(e) =>
                setTime(e.currentTarget.currentTime)
              }
            />

            <input
              type="range"
              className="w-full mt-3"
              min={0}
              max={videoRef.current?.duration || 100}
              value={time}
              onChange={(e) => {
                const t = Number(e.target.value);
                setTime(t);
                if (videoRef.current) {
                  videoRef.current.currentTime = t;
                }
              }}
            />
          </div>
        )}

        {/* CHART */}
        <div className="bg-white p-4 rounded-xl shadow">
          <h2 className="font-semibold mb-3">
            Performance Over Time
          </h2>

          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <XAxis dataKey="frame" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="severity"
                stroke="#7c3aed"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* VISUALS */}
        {(visuals?.user?.preview_images?.length ||
          visuals?.reference?.preview_images?.length) && (
          <div className="bg-white p-4 rounded-xl shadow">
            <h2 className="font-semibold mb-3">Frame Comparison</h2>

            <div className="grid grid-cols-2 gap-4">
              {visuals?.reference?.preview_images?.map((img, i) => (
                <Image
                  key={i}
                  src={img}
                  alt="ref"
                  width={400}
                  height={250}
                />
              ))}

              {visuals?.user?.preview_images?.map((img, i) => (
                <Image
                  key={i}
                  src={img}
                  alt="user"
                  width={400}
                  height={250}
                />
              ))}
            </div>
          </div>
        )}

        {/* MISTAKES */}
        <div className="bg-white p-4 rounded-xl shadow">
          <h2 className="font-semibold mb-3">Key Mistakes</h2>

          {topErrors.length === 0 ? (
            <p className="text-gray-500">No major issues detected.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-2">
              {topErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        {/* BACK */}
        <button
          onClick={() => router.push('/upload')}
          className="w-full bg-purple-700 text-white py-3 rounded-lg"
        >
          Upload Another Video
        </button>
      </div>
    </div>
  );
}

// -----------------------------
export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="p-10">Loading...</div>}>
      <ResultsContent />
    </Suspense>
  );
}
