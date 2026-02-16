'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function ResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const errorParam = searchParams.get('error'); // ✅ handle error route
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ✅ If we arrived with an error query param, don't require dp_result
    if (errorParam) {
      setLoading(false);
      return;
    }

    try {
      const stored = sessionStorage.getItem('dp_result');
      if (!stored) {
        router.replace('/upload');
        return;
      }
      setResult(JSON.parse(stored));
    } catch (e) {
      console.error(e);
      router.replace('/upload');
    } finally {
      setLoading(false);
    }
  }, [router, errorParam]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading results...</p>
      </div>
    );
  }

  // ✅ Show error screen if /results?error=...
  if (errorParam) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
        <div className="bg-white shadow-lg rounded-2xl p-10 text-center w-full max-w-md">
          <h1 className="text-2xl font-bold text-red-600">Analysis Failed</h1>
          <p className="mt-4 text-gray-600">{decodeURIComponent(errorParam)}</p>

          <button
            onClick={() => router.push('/upload')}
            className="mt-8 w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition"
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
        <p className="text-gray-500">No results found.</p>
      </div>
    );
  }

  const feedback = result.comparison?.feedback || {};

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="bg-white shadow-lg rounded-2xl p-10 w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-green-600 text-center">Your Score</h1>
        <p className="mt-4 text-5xl font-bold text-gray-800 text-center">{result.score}</p>

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
              {feedback.body_part_comments?.length ? (
                feedback.body_part_comments.map((comment: string, index: number) => (
                  <li key={index}>{comment}</li>
                ))
              ) : (
                <li>No body part issues detected.</li>
              )}
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-lg">Top Errors</h2>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              {feedback.top_errors?.length ? (
                feedback.top_errors.map((err: string, index: number) => (
                  <li key={index}>{err}</li>
                ))
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