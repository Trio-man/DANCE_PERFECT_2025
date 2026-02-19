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

// Use same-origin proxy to avoid CORS; proxy forwards to backend
const ANALYZE_URL = '/api/analyze';

export default function LoadingPage() {
  const router = useRouter();
  const [msg, setMsg] = useState('Starting analysis...');

  useEffect(() => {
  const run = async () => {
    const dancer = sessionStorage.getItem('dp_dancer');
    const choreo = sessionStorage.getItem('dp_choreo');
    const token = sessionStorage.getItem('dp_token');

    if (!dancer || !choreo) {
      console.error('Missing videos');
      setMsg('❌ Missing videos. Please go back and upload again.');
      return;
    }

    if (!token) {
      console.error('Missing token');
      setMsg('❌ Missing session. Please log in again.');
      router.replace('/login');
      return;
    }

    const dancerBlob = dataURLtoBlob(dancer);
    const choreoBlob = dataURLtoBlob(choreo);

    const formData = new FormData();
    formData.append('dancer_video', dancerBlob, 'dancer.mp4');
    formData.append('choreo_video', choreoBlob, 'choreo.mp4');

    setMsg('Uploading videos to server...');

    let res: Response;
    try {
      res = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
    } catch (err) {
      setMsg('❌ Network error. Check your connection and try again.');
      return;
    }

    const json = await res.json().catch(() => ({}));
    console.log(json);

    if (!res.ok) {
      setMsg(`❌ ${json?.error || 'Analyze failed'}`);
      return;
    }

    // Save result for the next page (optional)
    sessionStorage.setItem('dp_result', JSON.stringify(json));

    setMsg('✅ Analysis complete! Redirecting...');
    router.replace('/results'); // change to your actual results page route
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
