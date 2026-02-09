'use client';

import { useState } from 'react';

export default function ResultsTestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const testAnalyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('http://localhost:5000/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          test: true
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Analysis failed');
      }

      setResult(data);
    } catch (err: unknown) {
       // ✅ Type guard for unknown errors
  if (err instanceof Error) {
    setError(err.message);
  } else {
    setError('Failed to connect to backend');
  }
} finally {
  setLoading(false);
}
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-xl bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-bold text-center mb-4">
          Backend Integration Test 🧪
        </h1>

        <button
          onClick={testAnalyze}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
        >
          {loading ? 'Testing...' : 'Run Analysis Test'}
        </button>

        {error && (
          <p className="mt-4 text-red-600 text-center">
            ❌ {error}
          </p>
        )}

    {result && (
  <div className="mt-4 bg-gray-50 border rounded-lg p-4">
    <h2 className="font-semibold mb-2">Backend Response:</h2>
    <pre className="text-sm overflow-x-auto">
      {typeof result === 'string'
        ? result
        : JSON.stringify(result, null, 2)}
    </pre>
  </div>
)}
      </div>
    </div>
  );
}
