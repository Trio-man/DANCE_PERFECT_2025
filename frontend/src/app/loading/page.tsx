'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

function dataURLtoBlob(dataUrl: string) {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

export default function LoadingPage() {
  const router = useRouter();
  const [msg, setMsg] = useState('Starting analysis...');

  useEffect(() => {
    const run = async () => {
      const dancer = sessionStorage.getItem('dp_dancer');
      const choreo = sessionStorage.getItem('dp_choreo');
      const token = sessionStorage.getItem('dp_token');

      // ✅ FIX: do NOT trap user in loading page
      if (!dancer || !choreo || !token) {
        setMsg('Missing data. Redirecting to upload...');

        setTimeout(() => {
          router.replace('/upload');
        }, 1200);

        return;
      }

      try {
        const dancerBlob = dataURLtoBlob(dancer);
        const choreoBlob = dataURLtoBlob(choreo);

        const formData = new FormData();
        formData.append('dancer_video', dancerBlob, 'dancer.mp4');
        formData.append('choreo_video', choreoBlob, 'choreo.mp4');

        setMsg('Uploading & analyzing...');

        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        let json;
        try {
          json = await res.json();
        } catch {
          setMsg('Server returned invalid response');
          return;
        }

        if (!res.ok || !json) {
          setMsg(json?.error || 'Analysis failed');
          return;
        }

        // ✅ SINGLE SOURCE OF TRUTH
        sessionStorage.setItem('dp_result', JSON.stringify(json));

        setMsg('Done! Redirecting...');

        setTimeout(() => {
          router.replace('/results');
        }, 500);
      } catch (err) {
        console.error(err);
        setMsg('Unexpected error occurred');
      }
    };

    run();
  }, [router]);

  return (
    <motion.div className="min-h-screen flex items-center justify-center">
      <div className="text-center bg-white/60 p-10 rounded-xl">
        <div className="animate-spin h-10 w-10 border-4 border-t-purple-700 border-gray-300 mx-auto mb-3 rounded-full" />
        <p className="font-semibold">{msg}</p>
      </div>
    </motion.div>
  );
}
