'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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

type Comparison = {
  frames_compared?: number;
  mean_landmark_distance?: number;
  similarity_score?: number;
  feedback?: Feedback;
};

type Visuals = {
  reference?: { preview_images?: string[]; overlay_video?: string };
  user?: { preview_images?: string[]; overlay_video?: string };
};

type AnalysisResult = {
  score?: number;
  feedback?: Feedback;
  comparison?: Comparison;
  log_file?: string;
  visuals?: Visuals;
  outputs?: { visuals?: Visuals };
  message?: string;
};

// -----------------------------
// Main component
// -----------------------------
function ResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const errorParam = searchParams.get('error');

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  const BACKEND_URL = 'http://localhost:5000';
  const toBackendUrl = (p: string) => {
    if (!p) return p;
    if (p.startsWith('http://') || p.startsWith('https://')) return p;
    if (p.startsWith('/')) return `${BACKEND_URL}${p}`;
    return `${BACKEND_URL}/${p}`;
  };

  // -----------------------------
  // Load result from sessionStorage
  // -----------------------------
  useEffect(() => {
    let cancelled = false;

    const run = () => {
      try {
        if (errorParam) {
          if (!cancelled) setLoading(false);
          return;
        }

        const storedErr = sessionStorage.getItem('dp_result_error');
        const stored = sessionStorage.getItem('dp_result');

        if (storedErr && !stored) {
          if (!cancelled) setLoading(false);
          return;
        }

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

    return () => { cancelled = true; };
  }, [router, errorParam]);

  // -----------------------------
  // Derived data
  // -----------------------------
  const feedback: Feedback = useMemo(() => {
    if (!result) return {};
    return result.feedback || result.comparison?.feedback || {};
  }, [result]);

  const bodyPartComments = feedback.body_part_comments ?? [];
  const topErrors = feedback.top_errors ?? [];
  const timeline = feedback.detailed_timeline ?? [];

  // Extract visuals safely
  const visuals: Visuals | null = useMemo(() => {
    if (!result) return null;
    return result.outputs?.visuals || result.visuals || null;
  }, [result]);

  const refPreviews: string[] = visuals?.reference?.preview_images ?? [];
  const usrPreviews: string[] = visuals?.user?.preview_images ?? [];
  const refOverlay: string | null = visuals?.reference?.overlay_video ?? null;
  const usrOverlay: string | null = visuals?.user?.overlay_video ?? null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading results...</p>
      </div>
    );
  }

  const storedErr = typeof window !== 'undefined' ? sessionStorage.getItem('dp_result_error') : null;

  if (errorParam || (storedErr && !result)) {
    const msg = errorParam ? decodeURIComponent(errorParam) : storedErr ?? 'Unknown error';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="bg-white shadow-lg rounded-2xl p-10 text-center w-full max-w-md">
          <h1 className="text-2xl font-bold text-red-600">Analysis Failed</h1>
          <p className="mt-4 text-gray-600">{msg}</p>
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

  const score = result.score ?? result.comparison?.similarity_score ?? 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="bg-white shadow-lg rounded-2xl p-10 w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-green-600 text-center">Your Score</h1>
        <p className="mt-4 text-5xl font-bold text-gray-800 text-center">
          {Number(score).toFixed(2)}
        </p>

        {/* Visual Outputs */}
        {(refOverlay || usrOverlay || refPreviews.length > 0 || usrPreviews.length > 0) && (
          <div className="mt-8">
            <h2 className="font-semibold text-lg text-gray-800">Visual Outputs</h2>

            {(refOverlay || usrOverlay) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                {/* Reference Overlay */}
                <div className="border rounded-xl p-3 bg-gray-50">
                  <p className="font-semibold text-gray-700 text-center mb-2">Reference Overlay</p>
                  {refOverlay ? (
                    <video controls className="w-full rounded-lg border bg-black" src={toBackendUrl(refOverlay)} />
                  ) : <p className="text-sm text-gray-500 text-center">No reference overlay generated.</p>}
                </div>

                {/* User Overlay */}
                <div className="border rounded-xl p-3 bg-gray-50">
                  <p className="font-semibold text-gray-700 text-center mb-2">User Overlay</p>
                  {usrOverlay ? (
                    <video controls className="w-full rounded-lg border bg-black" src={toBackendUrl(usrOverlay)} />
                  ) : <p className="text-sm text-gray-500 text-center">No user overlay generated.</p>}
                </div>
              </div>
            )}

            {/* Preview Frames */}
            {(refPreviews.length > 0 || usrPreviews.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {/* Reference Previews */}
                <div className="border rounded-xl p-3 bg-gray-50">
                  <p className="font-semibold text-gray-700 text-center mb-2">Reference Preview Frames</p>
                  {refPreviews.length > 0 ? (
                    <div className="flex flex-wrap gap-3 justify-center">
                      {refPreviews.map((url, idx) => (
                        <img key={idx} src={toBackendUrl(url)} alt={`ref preview ${idx + 1}`} className="w-44 rounded-lg border bg-white" />
                      ))}
                    </div>
                  ) : <p className="text-sm text-gray-500 text-center">No reference frames generated.</p>}
                </div>

                {/* User Previews */}
                <div className="border rounded-xl p-3 bg-gray-50">
                  <p className="font-semibold text-gray-700 text-center mb-2">User Preview Frames</p>
                  {usrPreviews.length > 0 ? (
                    <div className="flex flex-wrap gap-3 justify-center">
                      {usrPreviews.map((url, idx) => (
                        <img key={idx} src={toBackendUrl(url)} alt={`user preview ${idx + 1}`} className="w-44 rounded-lg border bg-white" />
                      ))}
                    </div>
                  ) : <p className="text-sm text-gray-500 text-center">No user frames generated.</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Feedback Summary */}
        {feedback.summary && (
          <div className="mt-8 bg-white border rounded-xl p-4">
            <p className="font-semibold text-slate-700 mb-1">Feedback Summary</p>
            <p className="text-slate-600">{feedback.summary}</p>
          </div>
        )}

        {/* Timing Analysis */}
        {feedback.timing && (
          <div className="mt-4 bg-white border rounded-xl p-4">
            <p className="font-semibold text-slate-700 mb-1">Timing Analysis</p>
            <p className="text-slate-600">{feedback.timing}</p>
          </div>
        )}

        {/* Body Part Feedback */}
        {bodyPartComments.length > 0 && (
          <div className="mt-4 bg-white border rounded-xl p-4">
            <p className="font-semibold text-slate-700 mb-1">Body Part Feedback</p>
            <ul className="list-disc pl-5 space-y-1">
              {bodyPartComments.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}

        {/* Top Errors */}
        {topErrors.length > 0 && (
          <div className="mt-4 bg-white border rounded-xl p-4">
            <p className="font-semibold text-slate-700 mb-1">Top Errors</p>
            <ul className="list-disc pl-5 space-y-1">
              {topErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {/* Detailed Timeline */}
        {timeline.length > 0 && (
          <div className="mt-4 bg-white border rounded-xl p-4">
            <p className="font-semibold text-slate-700 mb-1">Detailed Timeline Coaching</p>
            {timeline.map((t, idx) => (
              <div key={idx} className="border rounded-lg p-3 bg-gray-50 mt-2">
                <p className="font-semibold text-gray-800">{t.start} – {t.end} • {t.body_part} • {String(t.severity).toUpperCase()}</p>
                <p className="text-gray-700 mt-1">{t.message}</p>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => router.push('/upload')}
          className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition"
        >
          Compare Again
        </button>
      </div>
    </div>
  );
}

// -----------------------------
// Suspense Wrapper
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