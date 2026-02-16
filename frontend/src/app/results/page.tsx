'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Feedback = {
  summary?: string;
  timing?: string;
  body_part_comments?: string[];
  top_errors?: string[];
};

type Comparison = {
  frames_compared?: number;
  mean_landmark_distance?: number;
  similarity_score?: number;
  feedback?: Feedback;
};

type AnalysisResult = {
  message?: string;
  score?: number;
  feedback?: Feedback; // ✅ TOP-LEVEL feedback (your backend returns this)
  comparison?: Comparison; // ✅ fallback if feedback is nested here
  log_file?: string;
  outputs?: any;
};

// -----------------------------
// Main logic component
// -----------------------------
function ResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const errorParam = searchParams.get('error');

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = () => {
      try {
        if (errorParam) {
          if (!cancelled) setLoading(false);
          return;
        }

        const stored = sessionStorage.getItem('dp_result');
        if (!stored) {
          if (!cancelled) setLoading(false);
          router.replace('/upload');
          return;
        }

        const parsed: AnalysisResult = JSON.parse(stored);
        if (!cancelled) setResult(parsed);
      } catch (e) {
        console.error(e);
        router.replace('/upload');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [router, errorParam]);

  // ✅ Always pick feedback from top-level first, then fallback to comparison.feedback
  const feedback: Feedback = useMemo(() => {
    if (!result) return {};
    return result.feedback || result.comparison?.feedback || {};
  }, [result]);

  const bodyPart = Array.isArray(feedback.body_part_comments) ? feedback.body_part_comments : [];
  const topErrors = Array.isArray(feedback.top_errors) ? feedback.top_errors : [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading results...</p>
      </div>
    );
  }

  if (errorParam) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="bg-white shadow-lg rounded-2xl p-10 text-center w-full max-w-md">
          <h1 className="text-2xl font-bold text-red-600">Analysis Failed</h1>
          <p className="mt-4 text-gray-600">{decodeURIComponent(errorParam)}</p>
          <button
            onClick={() => router.push('/upload')}
            className="mt-8 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
          >
            Back to Upload
          </button>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">No results found. Returning to upload…</p>
      </div>
    );
  }

  const score = typeof result.score === 'number' ? result.score : 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="bg-white shadow-lg rounded-2xl p-10 w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-green-600 text-center">Your Score</h1>

        <p className="mt-4 text-5xl font-bold text-gray-800 text-center">
          {Number.isFinite(score) ? score.toFixed(2) : '0.00'}
        </p>

        <div className="mt-8 space-y-6 text-gray-700">
          <div>
            <h2 className="font-semibold text-lg">Summary</h2>
            <p className="mt-1">{feedback.summary || 'No summary available.'}</p>
          </div>

          <div>
            <h2 className="font-semibold text-lg">Timing Analysis</h2>
            <p className="mt-1">{feedback.timing || 'No timing data.'}</p>
          </div>

          <div>
            <h2 className="font-semibold text-lg">Body Part Feedback</h2>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              {bodyPart.length > 0 ? (
                bodyPart.map((comment, index) => <li key={index}>{comment}</li>)
              ) : (
                <li>No body part issues detected.</li>
              )}
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-lg">Top Errors</h2>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              {topErrors.length > 0 ? (
                topErrors.map((err, index) => <li key={index}>{err}</li>)
              ) : (
                <li>No major landmark errors detected.</li>
              )}
            </ul>
          </div>
        </div>

        <button
          onClick={() => router.push('/upload')}
          className="mt-10 w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition"
        >
          Compare Again
        </button>
      </div>
    </div>
  );
}

// -----------------------------
// Suspense wrapper (required for useSearchParams in Next 13/14/15 app router)
// -----------------------------
export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <p className="text-gray-500">Loading results...</p>
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}