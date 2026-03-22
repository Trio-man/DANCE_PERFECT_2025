'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiHome } from 'react-icons/fi';

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

type ResultType = {
  message?: string;
  score?: number;
  feedback?: {
    summary?: string;
    timing?: string;
    body_part_comments?: string[];
    top_errors?: string[];
  };
  comparison?: {
    feedback?: {
      summary?: string;
      timing?: string;
      body_part_comments?: string[];
      top_errors?: string[];
    };
    overall_feedback?: string;
    timeline_feedback?: Array<{
      timestamp?: string;
      comment?: string;
    }>;
  };
  visuals?: Visuals;
  outputs?: {
    visuals?: Visuals;
    reference_video?: string;
    user_video?: string;
    reference_csv?: string;
    user_csv?: string;
    run_id?: string;
  };
  deviation_comparison_images?: string[];
  pose_match_comparison_images?: string[];
};

function getArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

export default function ResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<ResultType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored =
        sessionStorage.getItem('dp_result') || sessionStorage.getItem('dp_last_result');

      if (!stored) {
        setLoading(false);
        return;
      }

      setResult(JSON.parse(stored));
    } catch (e) {
      console.error('Failed to load result from sessionStorage:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const visuals = useMemo(
    () => result?.visuals || result?.outputs?.visuals || {},
    [result]
  );

  const summary =
    result?.feedback?.summary ||
    result?.comparison?.feedback?.summary ||
    result?.comparison?.overall_feedback ||
    'No summary available.';

  const bodyPartComments =
    result?.comparison?.feedback?.body_part_comments ||
    result?.feedback?.body_part_comments ||
    [];

  const topErrors =
    result?.comparison?.feedback?.top_errors ||
    result?.feedback?.top_errors ||
    [];

  const timelineFeedback = result?.comparison?.timeline_feedback || [];

  const referenceImages = getArray(visuals?.reference?.preview_images);
  const userImages = getArray(visuals?.user?.preview_images);
  const deviationImages = getArray(result?.deviation_comparison_images);
  const poseMatchImages = getArray(result?.pose_match_comparison_images);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white">
        <p className="text-slate-700 font-semibold">Loading results...</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white px-4">
        <p className="text-slate-700 font-semibold mb-4">No result found.</p>
        <button
          onClick={() => router.push('/upload')}
          className="px-5 py-3 rounded-lg bg-slate-900 text-white font-semibold"
        >
          Back to Upload
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white px-4 py-8"
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap gap-3 justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-slate-800">Analysis Results</h1>

          <div className="flex gap-3">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/80 border border-white/80 text-slate-700 font-semibold"
            >
              <FiArrowLeft /> Back
            </button>

            <button
              onClick={() => router.push('/upload')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold"
            >
              <FiHome /> Upload Again
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/70 p-5">
            <p className="text-sm text-slate-500 mb-1">Status</p>
            <p className="text-lg font-semibold text-slate-800">
              {result.message || 'Analysis complete'}
            </p>
          </div>

          <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/70 p-5">
            <p className="text-sm text-slate-500 mb-1">Score</p>
            <p className="text-3xl font-bold text-slate-900">
              {typeof result.score === 'number' ? result.score.toFixed(2) : 'N/A'}
            </p>
          </div>

          <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/70 p-5">
            <p className="text-sm text-slate-500 mb-1">Timing</p>
            <p className="text-lg font-semibold text-slate-800">
              {result?.comparison?.feedback?.timing || result?.feedback?.timing || 'No timing feedback'}
            </p>
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/70 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-3">Summary</h2>
          <p className="text-slate-700 whitespace-pre-line">{summary}</p>
        </div>

        {(bodyPartComments.length > 0 || topErrors.length > 0) && (
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/70 p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-3">Body Part Comments</h2>
              {bodyPartComments.length > 0 ? (
                <ul className="space-y-2 text-slate-700">
                  {bodyPartComments.map((item, index) => (
                    <li key={index}>• {item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">No body-part comments available.</p>
              )}
            </div>

            <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/70 p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-3">Top Errors</h2>
              {topErrors.length > 0 ? (
                <ul className="space-y-2 text-slate-700">
                  {topErrors.map((item, index) => (
                    <li key={index}>• {item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">No top errors available.</p>
              )}
            </div>
          </div>
        )}

        {timelineFeedback.length > 0 && (
          <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/70 p-6 mb-6">
            <h2 className="text-xl font-bold text-slate-800 mb-3">Timeline Feedback</h2>
            <div className="space-y-3">
              {timelineFeedback.map((item, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-white/70 p-4">
                  <p className="font-semibold text-slate-800">
                    {item.timestamp || `Moment ${index + 1}`}
                  </p>
                  <p className="text-slate-700 mt-1">{item.comment || 'No comment provided.'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {(result?.outputs?.reference_video || result?.outputs?.user_video) && (
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {result?.outputs?.reference_video && (
              <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/70 p-6">
                <h2 className="text-xl font-bold text-slate-800 mb-3">Reference Video</h2>
                <video
                  src={result.outputs.reference_video}
                  controls
                  className="w-full rounded-xl border border-slate-200 bg-black"
                />
              </div>
            )}

            {result?.outputs?.user_video && (
              <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/70 p-6">
                <h2 className="text-xl font-bold text-slate-800 mb-3">User Video</h2>
                <video
                  src={result.outputs.user_video}
                  controls
                  className="w-full rounded-xl border border-slate-200 bg-black"
                />
              </div>
            )}
          </div>
        )}

        {(visuals?.reference?.overlay_video || visuals?.user?.overlay_video) && (
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {visuals?.reference?.overlay_video && (
              <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/70 p-6">
                <h2 className="text-xl font-bold text-slate-800 mb-3">Reference Overlay</h2>
                <video
                  src={visuals.reference.overlay_video}
                  controls
                  className="w-full rounded-xl border border-slate-200 bg-black"
                />
              </div>
            )}

            {visuals?.user?.overlay_video && (
              <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/70 p-6">
                <h2 className="text-xl font-bold text-slate-800 mb-3">User Overlay</h2>
                <video
                  src={visuals.user.overlay_video}
                  controls
                  className="w-full rounded-xl border border-slate-200 bg-black"
                />
              </div>
            )}
          </div>
        )}

        {referenceImages.length > 0 && (
          <ImageGallery title="Reference Preview Images" images={referenceImages} />
        )}

        {userImages.length > 0 && (
          <ImageGallery title="User Preview Images" images={userImages} />
        )}

        {deviationImages.length > 0 && (
          <ImageGallery title="Deviation Comparison Images" images={deviationImages} />
        )}

        {poseMatchImages.length > 0 && (
          <ImageGallery title="Pose Match Comparison Images" images={poseMatchImages} />
        )}
      </div>
    </motion.div>
  );
}

function ImageGallery({ title, images }: { title: string; images: string[] }) {
  return (
    <div className="bg-white/70 backdrop-blur-lg rounded-2xl border border-white/70 p-6 mb-6">
      <h2 className="text-xl font-bold text-slate-800 mb-4">{title}</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {images.map((src, index) => (
          <div key={index} className="rounded-xl overflow-hidden border border-slate-200 bg-white">
            <img
              src={src}
              alt={`${title} ${index + 1}`}
              className="w-full h-64 object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
