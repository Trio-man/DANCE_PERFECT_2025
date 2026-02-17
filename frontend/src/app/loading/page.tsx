'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const BACKEND_URL = 'http://localhost:5000';

export default function LoadingPage() {
  const router = useRouter();
  const [msg, setMsg] = useState('Starting analysis...');

  useEffect(() => {
    const run = async () => {
      const dancer = sessionStorage.getItem('dp_dancer');
      const choreo = sessionStorage.getItem('dp_choreo');

      if (!dancer || !choreo) {
        router.replace('/upload');
        return;
      }

      const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
        const res = await fetch(dataUrl);
        return await res.blob();
      };

      try {
        setMsg('Preparing files...');
        const dancerBlob = await dataUrlToBlob(dancer);
        const choreoBlob = await dataUrlToBlob(choreo);

        const dancerFile = new File([dancerBlob], 'dancer.mp4', {
          type: dancerBlob.type || 'video/mp4',
        });
        const choreoFile = new File([choreoBlob], 'choreo.mp4', {
          type: choreoBlob.type || 'video/mp4',
        });

        const formData = new FormData();
        formData.append('dancer_video', dancerFile);
        formData.append('choreo_video', choreoFile);
        formData.append('generate_preview', 'true');
        formData.append('generate_overlay', 'false');
        formData.append('preview_max_frames', '1');

        setMsg('Analyzing Videos...');
        const resp = await fetch(`${BACKEND_URL}/analyze`, {
          method: 'POST',
          body: formData,
        });

        const json: Record<string, unknown> = await resp.json().catch(() => ({}));

        if (!resp.ok) {
          const errorMsg = typeof json?.['detail'] === 'string'
            ? json.detail
            : typeof json?.['error'] === 'string'
            ? json.error
            : 'Analysis failed';
          throw new Error(errorMsg);
        }

        sessionStorage.setItem('dp_result', JSON.stringify(json));
        sessionStorage.removeItem('dp_result_error');

        router.replace('/results');
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        console.error(error);
        sessionStorage.removeItem('dp_result');
        sessionStorage.setItem('dp_result_error', error.message);
        router.replace('/results');
      }
    };

    run();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin h-10 w-10 rounded-full border-4 border-gray-300 border-t-gray-700 mx-auto mb-3" />
        <p className="text-gray-700 font-semibold">{msg}</p>
        <p className="text-gray-500 text-sm mt-1">Please wait a moment.</p>
      </div>
    </div>
  );
}