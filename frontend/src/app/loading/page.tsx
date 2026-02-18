'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;

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
          const errorMsg =
            typeof json?.['detail'] === 'string'
              ? (json['detail'] as string)
              : typeof json?.['error'] === 'string'
              ? (json['error'] as string)
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-100 via-white to-pink-100 px-4"
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="text-center bg-white/60 backdrop-blur-md border border-white/70 shadow-lg rounded-2xl p-10 w-full max-w-md"
      >
        <div className="animate-spin h-10 w-10 rounded-full border-4 border-gray-300 border-t-gray-700 mx-auto mb-4" />

        <p className="text-gray-800 font-semibold">{msg}</p>
        <p className="text-gray-600 text-sm mt-1">Please wait a moment.</p>
      </motion.div>
    </motion.div>
  );
}