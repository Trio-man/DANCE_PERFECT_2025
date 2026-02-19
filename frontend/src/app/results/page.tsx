'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Image from 'next/image';

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

  const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;

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

    return () => {
      cancelled = true;
    };
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

  // -----------------------------
  // Loading state
  // -----------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#cde7ff] to-[#d6c1ff] animate-gradient px-4">
        <div className="text-center bg-white/70 backdrop-blur-md shadow-lg rounded-2xl p-10 w-full max-w-md">
          <div className="animate-spin h-10 w-10 rounded-full border-4 border-gray-300 border-t-[#4b0082] mx-auto mb-4" />
          <p className="text-gray-800 font-semibold">Loading results...</p>
          <p className="text-gray-600 text-sm mt-1">Please wait a moment.</p>
        </div>
      </div>
    );
  }

  const storedErr =
    typeof window !== 'undefined'
      ? sessionStorage.getItem('dp_result_error')
      : null;

  // -----------------------------
  // Error state
  // -----------------------------
  if (errorParam || (storedErr && !result)) {
    const msg = errorParam
      ? decodeURIComponent(errorParam)
      : storedErr ?? 'Unknown error';

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-white via-[#cde7ff] to-[#d6c1ff] animate-gradient px-4">
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="bg-white/70 backdrop-blur-md shadow-lg rounded-2xl p-10 text-center w-full max-w-md"
        >
          <h1 className="text-2xl font-bold text-red-700">Analysis Failed</h1>
          <p className="mt-4 text-gray-700">{msg}</p>

          <button
            onClick={() => router.push('/upload')}
            className="mt-8 w-full bg-[#4b0082] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#37006b] transition"
          >
            Back to Upload
          </button>
        </motion.div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#cde7ff] to-[#d6c1ff] animate-gradient px-4">
        <div className="text-center bg-white/70 backdrop-blur-md shadow-lg rounded-2xl p-10 w-full max-w-md">
          <p className="text-gray-800 font-semibold">
            No results found. Returning to upload…
          </p>
        </div>
      </div>
    );
  }

  const score = result.score ?? result.comparison?.similarity_score ?? 0;

  // -----------------------------
  // Main UI
  // -----------------------------
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-white via-[#cde7ff] to-[#d6c1ff] animate-gradient px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55 }}
        className="w-full max-w-4xl bg-white/70 backdrop-blur-md shadow-xl rounded-2xl p-8 md:p-10"
      >
        <h1 className="text-3xl font-bold text-[#4b0082] text-center">
          Your Score
        </h1>

        <p className="mt-4 text-6xl font-extrabold text-gray-900 text-center">
          {Number(score).toFixed(2)}
        </p>

        {/* Visual Outputs */}
        {(refOverlay ||
          usrOverlay ||
          refPreviews.length > 0 ||
          usrPreviews.length > 0) && (
          <div className="mt-10">
            <h2 className="font-bold text-lg text-gray-900">
              Visual Outputs
            </h2>

            {/* Overlay Videos */}
            {(refOverlay || usrOverlay) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {/* Reference Overlay */}
                <div className="rounded-2xl bg-white/70 border border-white/60 p-4 shadow-sm">
                  <p className="font-semibold text-gray-900 text-center mb-2">
                    Reference Overlay
                  </p>

                  {refOverlay ? (
                    <video
                      controls
                      className="w-full rounded-xl border border-white/70 bg-black"
                      src={toBackendUrl(refOverlay)}
                    />
                  ) : (
                    <p className="text-sm text-gray-600 text-center">
                      No reference overlay generated.
                    </p>
                  )}
                </div>

                {/* User Overlay */}
                <div className="rounded-2xl bg-white/70 border border-white/60 p-4 shadow-sm">
                  <p className="font-semibold text-gray-900 text-center mb-2">
                    User Overlay
                  </p>

                  {usrOverlay ? (
                    <video
                      controls
                      className="w-full rounded-xl border border-white/70 bg-black"
                      src={toBackendUrl(usrOverlay)}
                    />
                  ) : (
                    <p className="text-sm text-gray-600 text-center">
                      No user overlay generated.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Preview Frames */}
            {(refPreviews.length > 0 || usrPreviews.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                {/* Reference Previews */}
                <div className="rounded-2xl bg-white/70 border border-white/60 p-4 shadow-sm">
                  <p className="font-semibold text-gray-900 text-center mb-3">
                    Reference Preview Frames
                  </p>

                  {refPreviews.length > 0 ? (
                    <div className="flex flex-wrap gap-3 justify-center">
                      {refPreviews.map((url, idx) => (
                        <div
                          key={idx}
                          className="relative w-44 h-28 rounded-xl overflow-hidden border border-white/70 bg-white shadow-sm"
                        >
                          <Image
                            src={toBackendUrl(url)}
                            alt={`ref preview ${idx + 1}`}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600 text-center">
                      No reference frames generated.
                    </p>
                  )}
                </div>

                {/* User Previews */}
                <div className="rounded-2xl bg-white/70 border border-white/60 p-4 shadow-sm">
                  <p className="font-semibold text-gray-900 text-center mb-3">
                    User Preview Frames
                  </p>

                  {usrPreviews.length > 0 ? (
                    <div className="flex flex-wrap gap-3 justify-center">
                      {usrPreviews.map((url, idx) => (
                        <div
                          key={idx}
                          className="relative w-44 h-28 rounded-xl overflow-hidden border border-white/70 bg-white shadow-sm"
                        >
                          <Image
                            src={toBackendUrl(url)}
                            alt={`user preview ${idx + 1}`}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600 text-center">
                      No user frames generated.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Feedback Summary */}
        {feedback.summary && (
          <div className="mt-10 rounded-2xl bg-white/70 border border-white/60 p-5 shadow-sm">
            <p className="font-bold text-gray-900 mb-1">Feedback Summary</p>
            <p className="text-gray-700">{feedback.summary}</p>
          </div>
        )}

        {/* Timing Analysis */}
        {feedback.timing && (
          <div className="mt-4 rounded-2xl bg-white/70 border border-white/60 p-5 shadow-sm">
            <p className="font-bold text-gray-900 mb-1">Timing Analysis</p>
            <p className="text-gray-700">{feedback.timing}</p>
          </div>
        )}

        {/* Body Part Feedback */}
        {bodyPartComments.length > 0 && (
          <div className="mt-4 rounded-2xl bg-white/70 border border-white/60 p-5 shadow-sm">
            <p className="font-bold text-gray-900 mb-2">Body Part Feedback</p>
            <ul className="list-disc pl-5 space-y-1 text-gray-800">
              {bodyPartComments.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Top Errors */}
        {topErrors.length > 0 && (
          <div className="mt-4 rounded-2xl bg-white/70 border border-white/60 p-5 shadow-sm">
            <p className="font-bold text-gray-900 mb-2">Top Errors</p>
            <ul className="list-disc pl-5 space-y-1 text-gray-800">
              {topErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Detailed Timeline */}
        {timeline.length > 0 && (
          <div className="mt-4 rounded-2xl bg-white/70 border border-white/60 p-5 shadow-sm">
            <p className="font-bold text-gray-900 mb-2">
              Detailed Timeline Coaching
            </p>

            <div className="space-y-3">
              {timeline.map((t, idx) => (
                <div
                  key={idx}
                  className="rounded-xl bg-white/70 border border-white/60 p-4"
                >
                  <p className="font-semibold text-gray-900">
                    {t.start} – {t.end} • {t.body_part} •{' '}
                    {String(t.severity).toUpperCase()}
                  </p>
                  <p className="text-gray-700 mt-1">{t.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => router.push('/upload')}
          className="mt-8 w-full bg-[#4b0082] text-white py-3 rounded-lg font-semibold hover:bg-[#37006b] transition"
        >
          Compare Again
        </button>
      </motion.div>
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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-[#cde7ff] to-[#d6c1ff] animate-gradient px-4">
          <div className="text-center bg-white/70 backdrop-blur-md shadow-lg rounded-2xl p-10 w-full max-w-md">
            <div className="animate-spin h-10 w-10 rounded-full border-4 border-gray-300 border-t-[#4b0082] mx-auto mb-4" />
            <p className="text-gray-800 font-semibold">Loading results...</p>
          </div>
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
