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

import type {
  AnalysisResponse,
  DeviationMomentsUI
} from '@/types/analysis';

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

  // NEW BACKEND DATA
  deviation_moments_ui?: DeviationMomentsUI;
};

// -----------------------------
// SAFE HELPERS
// -----------------------------
function getVideo(result: AnalysisResult | null) {
  return (
    result?.visuals?.user?.overlay_video ||
    result?.outputs?.visuals?.user?.overlay_video ||
    result?.visuals?.reference?.overlay_video ||
    ''
  );
}

function normalizeTimeline(t?: TimelineItem[]) {
  if (!Array.isArray(t)) return [];
  return t.filter(Boolean);
}

function resolveMediaUrl(path?: string | null) {
  if (!path) return '';

  if (path.startsWith('http')) {
    return path;
  }

  const BACKEND_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    '';

  return `${BACKEND_URL}/${path}`;
}

// -----------------------------
// MAIN
// -----------------------------
function ResultsContent() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analysisUI, setAnalysisUI] =
    useState<DeviationMomentsUI | null>(null);

  const [time, setTime] = useState(0);

  // -----------------------------
  // LOAD
  // -----------------------------
  useEffect(() => {
    const stored = sessionStorage.getItem('dp_result');

    if (!stored) {
      setResult(null);
      return;
    }

    try {
      const parsed: AnalysisResponse =
        JSON.parse(stored);

      setResult(parsed);

      setAnalysisUI(
        parsed.deviation_moments_ui ?? null
      );
    } catch {
      setResult(null);
    }
  }, []);

  // -----------------------------
  // CORE DATA
  // -----------------------------
  const score =
    result?.score ??
    result?.comparison?.similarity_score ??
    0;

  const feedback =
    result?.feedback ||
    result?.comparison?.feedback ||
    {};

  const timeline = useMemo(
    () => normalizeTimeline(feedback?.detailed_timeline),
    [feedback]
  );

  const topErrors = feedback?.top_errors ?? [];

  const videoSrc = getVideo(result);

  // -----------------------------
  // CHART
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white">
        <button
          onClick={() => router.push('/upload')}
          className="bg-purple-700 text-white px-6 py-3 rounded-xl"
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
    <div className="min-h-screen bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white px-4 py-10 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">

        {/* HERO */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/60 backdrop-blur border border-white/70 p-8 rounded-2xl text-center"
        >
          <h1 className="text-2xl font-bold text-purple-700">
            Here are your results
          </h1>

          <p className="text-6xl font-extrabold mt-4 text-gray-900">
            {Number(score).toFixed(1)}
          </p>

          <p className="text-gray-700 mt-2">
            Overall performance score
          </p>
        </motion.div>

        {/* VIDEO SCRUBBER */}
        <div className="bg-white/60 border border-white/70 p-6 rounded-2xl">
          <h2 className="font-bold mb-3 text-purple-700">
            Frame Scrubber
          </h2>

          {videoSrc ? (
            <>
              <video
                ref={videoRef}
                onTimeUpdate={handleTimeUpdate}
                controls
                className="w-full rounded-xl"
                src={videoSrc}
              />

              <p className="text-sm text-gray-600 mt-2">
                Time: {time.toFixed(2)}s
              </p>
            </>
          ) : (
            <p className="text-gray-500">
              No video available
            </p>
          )}
        </div>

        {/* FEEDBACK OVERVIEW */}
        {analysisUI && (
          <div className="bg-white/60 border border-white/70 p-6 rounded-2xl space-y-4">
            <h2 className="font-bold text-purple-700 text-xl">
              Feedback Overview
            </h2>

            <p className="text-gray-700">
              {analysisUI.feedback_overview}
            </p>

            <div>
              <h3 className="font-semibold text-green-700">
                What Went Well
              </h3>

              <p>
                {analysisUI.summaries?.what_went_well}
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-orange-700">
                Where To Improve
              </h3>

              <p>
                {analysisUI.summaries?.where_to_improve}
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-purple-700">
                Practice Tips
              </h3>

              <ul className="list-disc pl-5 space-y-1">
                {analysisUI.practice_tips?.map(
                  (tip, i) => (
                    <li key={i}>{tip}</li>
                  )
                )}
              </ul>
            </div>
          </div>
        )}

        {/* PERFORMANCE GRAPH */}
        <div className="bg-white/60 border border-white/70 p-6 rounded-2xl">
          <h2 className="font-bold mb-3 text-purple-700">
            Performance Trend
          </h2>

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
        <div className="bg-white/60 border border-white/70 p-6 rounded-2xl">
          <h2 className="font-bold mb-3 text-purple-700">
            Key Mistakes
          </h2>

          {topErrors.length ? (
            <ul className="list-disc pl-5 space-y-1">
              {topErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">
              No major errors detected.
            </p>
          )}
        </div>

        {/* DEVIATION MOMENTS */}
        {analysisUI?.deviation_moments?.length ? (
          <div className="bg-white/60 border border-white/70 p-6 rounded-2xl">
            <h2 className="font-bold mb-6 text-purple-700 text-xl">
              Key Deviations
            </h2>

            <div className="space-y-6">
              {analysisUI.deviation_moments.map(
                (moment, idx) => (
                  <div
                    key={idx}
                    className="border rounded-2xl p-5 bg-white/70 space-y-4"
                  >
                    <div>
                      <h3 className="font-bold text-lg">
                        Deviation #{idx + 1}
                      </h3>

                      <p className="text-sm text-gray-600">
                        Peak Time: {moment.user_time}
                      </p>

                      <p className="text-sm text-gray-600">
                        Clip Range:{' '}
                        {moment.user_time_clip_label}
                      </p>
                    </div>

                    {moment.gif_path && (
                      <img
                        src={resolveMediaUrl(moment.gif_path)}
                        alt={`Deviation ${idx + 1}`}
                        className="rounded-xl w-full"
                      />
                    )}

                    {moment.screenshot_path && (
                      <img
                        src={resolveMediaUrl(
                          moment.screenshot_path
                        )}
                        alt={`Deviation still ${idx + 1}`}
                        className="rounded-xl w-full"
                      />
                    )}

                    <div>
                      <h4 className="font-semibold">
                        Issue
                      </h4>

                      <p className="text-gray-700">
                        {moment.issue}
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold">
                        Recommendation
                      </h4>

                      <p className="text-gray-700">
                        {moment.recommendation}
                      </p>
                    </div>

                    {moment.user_time_clip_start !==
                      undefined && (
                      <button
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime =
                              moment.user_time_clip_start || 0;

                            videoRef.current.play();
                          }
                        }}
                        className="bg-purple-700 text-white px-4 py-2 rounded-xl"
                      >
                        Jump To Clip
                      </button>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        ) : null}

        {/* TIMELINE */}
        <div className="bg-white/60 border border-white/70 p-6 rounded-2xl">
          <h2 className="font-bold mb-3 text-purple-700">
            Frame Insights
          </h2>

          {timeline.length ? (
            <div className="space-y-3">
              {timeline.map((t, i) => (
                <div
                  key={i}
                  className="border rounded-xl p-4 bg-white/70"
                >
                  <p className="font-semibold">
                    {t.start} - {t.end} •{' '}
                    {t.body_part}
                  </p>

                  <p className="text-gray-700">
                    {t.message}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">
              Frame breakdown not available
              (backend did not return timeline
              data).
            </p>
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
    <Suspense
      fallback={
        <div className="p-10 text-center">
          Loading...
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
