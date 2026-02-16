'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Feedback = {
  summary?: string;
  timing?: string;
  body_part_comments?: string[];
  top_errors?: string[];
};

type AnalysisResult = {
  score: number;
  comparison?: {
    feedback?: Feedback;
  };
};

// -----------------------------
// This is the main logic component
// -----------------------------
function ResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const errorParam = searchParams.get('error');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      const parsed: AnalysisResult = JSON.parse(stored);
      setResult(parsed);
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
      {/* ... your existing results rendering ... */}
    </div>
  );
}

// -----------------------------
// Export a Suspense wrapper at top level
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
