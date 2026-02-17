'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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

type AnalysisResult = {
  message?: string;
  score?: number;
  feedback?: Feedback;
  comparison?: Comparison;
  log_file?: string;

  // backend may put visuals here
  outputs?: any;
  visuals?: any;
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

  const BACKEND_URL = 'http://localhost:5000';
  const toBackendUrl = (p: string) => {
    if (!p) return p;
    if (p.startsWith('http://') || p.startsWith('https://')) return p;
    if (p.startsWith('/')) return `${BACKEND_URL}${p}`;
    return `${BACKEND_URL}/${p}`;
  };

  useEffect(() => {
    let cancelled = false;

    const run = () => {
      try {
        // If you ever pass error in URL
        if (errorParam) {
          if (!cancelled) setLoading(false);
          return;
        }

        // Also support error stored by Loading page
        const storedErr = sessionStorage.getItem('dp_result_error');
        if (storedErr && !sessionStorage.getItem('dp_result')) {
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
  const timeline = Array.isArray(feedback.detailed_timeline) ? feedback.detailed_timeline : [];

  // ✅ Pull visuals from common backend shapes
  const visuals = useMemo(() => {
    if (!result) return null;

    // possible shapes:
    // result.outputs.visuals
    // result.visuals
    // result.outputs
    const v =
      result.outputs?.visuals ||
      result.visuals ||
      result.outputs ||
      null;

    return v;
  }, [result]);

  const refPreviews: string[] =
    visuals?.reference?.preview_images ||
    visuals?.reference_preview_images ||
    visuals?.ref_preview_images ||
    [];

  const usrPreviews: string[] =
    visuals?.user?.preview_images ||
    visuals?.user_preview_images ||
    visuals?.usr_preview_images ||
    [];

  const refOverlay: string | null =
    visuals?.reference?.overlay_video ||
    visuals?.reference_overlay_video ||
    visuals?.ref_overlay_video ||
    null;

  const usrOverlay: string | null =
    visuals?.user?.overlay_video ||
    visuals?.user_overlay_video ||
    visuals?.usr_overlay_video ||
    null;

  // Helpful for debugging: show raw keys if visuals exist but nothing renders
  const visualsDebugKeys = useMemo(() => {
    if (!visuals || typeof visuals !== 'object') return [];
    return Object.keys(visuals);
  }, [visuals]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading results...</p>
      </div>
    );
  }

  // ✅ Prefer showing dp_result_error if present
  const storedErr = typeof window !== 'undefined' ? sessionStorage.getItem('dp_result_error') : null;

  if (errorParam || (storedErr && !result)) {
    const msg = errorParam ? decodeURIComponent(errorParam) : storedErr || 'Unknown error';
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

  const score =
    typeof result.score === 'number'
      ? result.score
      : (result as any)?.comparison?.similarity_score ?? 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="bg-white shadow-lg rounded-2xl p-10 w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-green-600 text-center">Your Score</h1>

        <p className="mt-4 text-5xl font-bold text-gray-800 text-center">
          {Number.isFinite(score) ? Number(score).toFixed(2) : '0.00'}
        </p>

        {/* ✅ NEW: Visual Outputs */}
        <div className="mt-8">
          <h2 className="font-semibold text-lg text-gray-800">Visual Outputs</h2>

          {(refOverlay || usrOverlay || refPreviews.length > 0 || usrPreviews.length > 0) ? (
            <div className="mt-3 space-y-6">
              {/* Overlays */}
              {(refOverlay || usrOverlay) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-xl p-3 bg-gray-50">
                    <p className="font-semibold text-gray-700 text-center mb-2">Reference Overlay</p>
                    {refOverlay ? (
                      <video
                        controls
                        className="w-full rounded-lg border bg-black"
                        src={toBackendUrl(refOverlay)}
                      />
                    ) : (
                      <p className="text-sm text-gray-500 text-center">No reference overlay generated.</p>
                    )}
                  </div>

                  <div className="border rounded-xl p-3 bg-gray-50">
                    <p className="font-semibold text-gray-700 text-center mb-2">User Overlay</p>
                    {usrOverlay ? (
                      <video
                        controls
                        className="w-full rounded-lg border bg-black"
                        src={toBackendUrl(usrOverlay)}
                      />
                    ) : (
                      <p className="text-sm text-gray-500 text-center">No user overlay generated.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Preview frames */}
              {(refPreviews.length > 0 || usrPreviews.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-xl p-3 bg-gray-50">
                    <p className="font-semibold text-gray-700 text-center mb-2">Reference Preview Frames</p>
                    {refPreviews.length > 0 ? (
                      <div className="flex flex-wrap gap-3 justify-center">
                        {refPreviews.map((url, idx) => (
                          <img
                            key={idx}
                            src={toBackendUrl(url)}
                            alt={`ref preview ${idx + 1}`}
                            className="w-44 rounded-lg border bg-white"
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 text-center">No reference frames generated.</p>
                    )}
                  </div>

                  <div className="border rounded-xl p-3 bg-gray-50">
                    <p className="font-semibold text-gray-700 text-center mb-2">User Preview Frames</p>
                    {usrPreviews.length > 0 ? (
                      <div className="flex flex-wrap gap-3 justify-center">
                        {usrPreviews.map((url, idx) => (
                          <img
                            key={idx}
                            src={toBackendUrl(url)}
                            alt={`user preview ${idx + 1}`}
                            className="w-44 rounded-lg border bg-white"
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 text-center">No user frames generated.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 text-gray-600 text-sm">
              No visual outputs were returned by the backend.
              {visualsDebugKeys.length > 0 && (
                <div className="mt-1 text-xs text-gray-500">
                  (Debug: visuals keys detected: {visualsDebugKeys.join(', ')})
                </div>
              )}
            </div>
          )}
        </div>

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

          <div>
            <h2 className="font-semibold text-lg">Detailed Timeline Coaching</h2>

            {timeline.length > 0 ? (
              <div className="mt-2 space-y-3">
                {timeline.map((t, idx) => (
                  <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                    <p className="font-semibold text-gray-800">
                      {t.start} – {t.end} • {t.body_part} • {String(t.severity || '').toUpperCase()}
                    </p>
                    <p className="text-gray-700 mt-1">{t.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-gray-600">No detailed timestamped issues detected.</p>
            )}
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
// Suspense wrapper
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