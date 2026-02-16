'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoadingPage() {
  const router = useRouter();

  useEffect(() => {
    const analyze = async () => {
      // ✅ prevent stale results from previous runs
      sessionStorage.removeItem("dp_result");

      const dancerDataUrl = sessionStorage.getItem("dp_dancer");
      const choreoDataUrl = sessionStorage.getItem("dp_choreo");

      if (!dancerDataUrl || !choreoDataUrl) {
        router.replace("/upload");
        return;
      }

      // Convert dataURL -> Blob
      const dataUrlToBlob = async (dataUrl: string) => {
        const res = await fetch(dataUrl);
        return await res.blob();
      };

      try {
        const dancerBlob = await dataUrlToBlob(dancerDataUrl);
        const choreoBlob = await dataUrlToBlob(choreoDataUrl);

        const formData = new FormData();
        formData.append("video1", choreoBlob, "choreo.mp4");
        formData.append("video2", dancerBlob, "dancer.mp4");

   const response = await fetch("/api/analyze", {
  method: "POST",
  body: formData,
});

const data = await response.json().catch(() => ({ error: "Analysis failed" }));

if (!response.ok) {
  throw new Error(data.error || "Analysis failed.");
}

        // cleanup storage so it doesn't reuse old videos
        sessionStorage.removeItem("dp_dancer");
        sessionStorage.removeItem("dp_choreo");

        // ✅ store full backend response (includes comparison.feedback)
        sessionStorage.setItem("dp_result", JSON.stringify(data));

        router.replace("/results");
} catch (err: unknown) {
  sessionStorage.removeItem("dp_result");

  const message =
    err instanceof Error ? err.message : "Analysis failed.";

  router.replace(`/results?error=${encodeURIComponent(message)}`);
}
    };

    analyze();
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <div className="w-16 h-16 border-4 border-gray-300 border-t-gray-700 rounded-full animate-spin"></div>
      <h2 className="mt-6 text-xl font-semibold text-gray-700">
        Analyzing your performance...
      </h2>
      <p className="mt-2 text-gray-500">
        Please wait while we process your motion data.
      </p>
    </div>
  );
}
