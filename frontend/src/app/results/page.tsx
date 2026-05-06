'use client';

import { useEffect, useState, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
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

type AnalysisResult = {
  score?: number;
  feedback?: Feedback;
  comparison?: {
    similarity_score?: number;
    feedback?: Feedback;
  };
};

// -----------------------------
function ResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);

  const [loading, setLoading] = useState(true);

  // -----------------------------
  // Load results safely
  // -----------------------------
  useEffect(() => {
    const stored = sessionStorage.getItem('dp_result');

    if (!stored || errorParam) {
      router.replace('/upload');
      return;
    }

    try {
      setResult(JSON.parse(stored));
    } catch {
      router.replace('/upload');
    } finally {
      setLoading(false);
    }
  }, [router, errorParam]);

  // -----------------------------
  const score =
    result?.score ?? result?.comparison?.similarity_score ?? 0;

  const feedback = result?.feedback || result?.comparison?.feedback || {};

  const timeline = feedback.detailed_timeline ?? [];

  // -----------------------------
  // Derived "AI metrics" (frontend simulation layer)
  // -----------------------------
  const radarData = useMemo(() => {
    return [
      { subject: 'Timing', value: Math.min(score + 5, 100) },
      { subject: 'Accuracy', value: score },
      { subject: 'Posture', value: Math.max(score - 10, 0) },
      { subject: 'Flow', value: Math.min(score + 2, 100) },
      { subject: 'Control', value: Math.max(score - 5, 0) },
    ];
  }, [score]);

  // -----------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        No results
      </div>
    );
  }

  // -----------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-purple-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* HEADER */}
        <div className="bg-white/70 rounded-2xl p-6 shadow">
          <h1 className="text-2xl font-bold">Results Dashboard</h1>
          <p className="text-gray-600">
            Here is your performance breakdown
          </p>
        </div>

        {/* SCORE + RADAR */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* SCORE CARD */}
          <div className="bg-white/70 rounded-2xl p-6 shadow text-center">
            <h2 className="text-lg font-semibold">Overall Score</h2>
            <p className="text-6xl font-bold text-purple-700 mt-4">
              {Number(score).toFixed(1)}
            </p>
          </div>

          {/* RADAR CHART */}
          <div className="bg-white/70 rounded-2xl p-6 shadow">
            <h2 className="text-lg font-semibold mb-3">Performance Profile</h2>

            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" />
                <Radar
                  dataKey="value"
                  stroke="#7c3aed"
                  fill="#7c3aed"
                  fillOpacity={0.4}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* FRAME SCRUBBER */}
        <div className="bg-white/70 rounded-2xl p-6 shadow">
          <h2 className="font-semibold mb-3">Frame Scrubber</h2>

          <input
            type="range"
            min={0}
            max={timeline.length - 1}
            value={frameIndex}
            onChange={(e) => setFrameIndex(Number(e.target.value))}
            className="w-full"
          />

          <div className="mt-4 p-4 bg-gray-50 rounded-xl">
            {timeline[frameIndex] ? (
              <>
                <p className="font-semibold">
                  {timeline[frameIndex].body_part}
                </p>
                <p className="text-sm text-gray-600">
                  {timeline[frameIndex].message}
                </p>
              </>
            ) : (
              <p>No timeline data</p>
            )}
          </div>
        </div>

        {/* INSIGHTS */}
        <div className="bg-white/70 rounded-2xl p-6 shadow">
          <h2 className="font-semibold mb-3">Key Insights</h2>

          {feedback.summary && (
            <p className="text-gray-700 mb-3">
              {feedback.summary}
            </p>
          )}

          <ul className="list-disc pl-5 text-gray-700">
            {(feedback.top_errors ?? []).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>

        {/* ACTION */}
        <button
          onClick={() => router.push('/upload')}
          className="w-full bg-purple-700 text-white py-3 rounded-xl"
        >
          Run Another Analysis
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
