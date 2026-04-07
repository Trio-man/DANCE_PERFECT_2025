'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient, Session, User } from '@supabase/supabase-js';
import { FiArrowLeft, FiLogOut, FiUploadCloud, FiList } from 'react-icons/fi';
import axios from 'axios';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!; // Hetzner URL
const CLOUDINARY_URL = process.env.NEXT_PUBLIC_CLOUDINARY_URL!; // Cloudinary unsigned upload preset

export default function UploadPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [dancerVideo, setDancerVideo] = useState<File | null>(null);
  const [choreoVideo, setChoreoVideo] = useState<File | null>(null);
  const [previewDancer, setPreviewDancer] = useState<string | null>(null);
  const [previewChoreo, setPreviewChoreo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) router.replace('/login');
      else setUser(data.user);
    };
    checkUser();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      if (!session?.user) router.replace('/login');
      else setUser(session.user);
    });

    return () => listener.subscription.unsubscribe();
  }, [router]);

  // -------------------------
  // Video Previews
  // -------------------------
  useEffect(() => {
    let url: string | null = null;
    if (dancerVideo) {
      url = URL.createObjectURL(dancerVideo);
      setPreviewDancer(url);
    } else setPreviewDancer(null);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [dancerVideo]);

  useEffect(() => {
    let url: string | null = null;
    if (choreoVideo) {
      url = URL.createObjectURL(choreoVideo);
      setPreviewChoreo(url);
    } else setPreviewChoreo(null);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [choreoVideo]);

  // -------------------------
  // Upload & Analyze
  // -------------------------
  const handleAnalyze = async () => {
    if (!dancerVideo || !choreoVideo) {
      setStatus('Please upload both videos first.');
      return;
    }

    setLoading(true);
    setStatus('Uploading videos...');

    try {
      // 1️⃣ Upload to Cloudinary
      const uploadVideo = async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_URL);
        const res = await axios.post('https://api.cloudinary.com/v1_1/demo/video/upload', formData); // replace 'demo' with your cloud name
        return res.data.secure_url;
      };

      const [dancerUrl, choreoUrl] = await Promise.all([
        uploadVideo(dancerVideo),
        uploadVideo(choreoVideo),
      ]);

      setStatus('Videos uploaded, sending to analysis...');

      // 2️⃣ Send to Hetzner backend
      const analyzeRes = await axios.post(`${BACKEND_URL}/analyze`, {
        dancer_url: dancerUrl,
        choreo_url: choreoUrl,
      });

      const jobId = analyzeRes.data.job_id;
      setStatus('Analysis started...');
      setProgress(0);

      // 3️⃣ Poll progress
      const interval = setInterval(async () => {
        const statusRes = await axios.get(`${BACKEND_URL}/status/${jobId}`);
        const data = statusRes.data;

        if (data.status === 'done') {
          clearInterval(interval);
          setStatus('Analysis complete!');
          setResult(data.result);
          setProgress(100);
          setLoading(false);
        } else if (data.status === 'processing') {
          setProgress(data.info?.progress ?? 0);
          setStatus(data.info?.status ?? 'Processing...');
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setStatus('Analysis failed. Please try again.');
          setLoading(false);
        }
      }, 3000);
    } catch (err) {
      console.error(err);
      setStatus('❌ Failed to analyze videos.');
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-')) localStorage.removeItem(key);
    });
    router.replace('/login');
  };

  return (
    <motion.div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white">
      <div className="w-full max-w-4xl p-8 bg-white/70 rounded-2xl shadow-lg relative">
        {loading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-2xl z-50">
            <div className="text-center">
              <div className="h-10 w-10 border-4 border-gray-300 border-t-gray-700 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-700 font-semibold">{status}</p>
              {progress > 0 && <p className="text-gray-500 mt-1">{progress}%</p>}
            </div>
          </div>
        )}

        <button onClick={() => router.back()} className="absolute top-4 left-4 text-gray-600 hover:text-gray-800"><FiArrowLeft size={24} /></button>
        <button onClick={handleLogout} className="absolute top-4 right-4 text-red-600 hover:text-red-800"><FiLogOut size={24} /></button>

        <h1 className="text-3xl font-bold text-center mb-6">DancePerfect</h1>

        <div className="flex flex-col md:flex-row gap-6">
          <VideoUpload label="Dancer Video" preview={previewDancer} setFile={setDancerVideo} loading={loading} />
          <VideoUpload label="Choreographer Video" preview={previewChoreo} setFile={setChoreoVideo} loading={loading} />
        </div>

        <div className="flex justify-center mt-6">
          <motion.button whileTap={{ scale: 0.97 }} disabled={loading} onClick={handleAnalyze} className="bg-purple-600 text-white py-3 px-6 rounded-lg font-semibold">Analyze 🎯</motion.button>
        </div>

        {result && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h2 className="font-semibold text-lg">Analysis Result</h2>
            <pre className="text-sm">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface VideoUploadProps { label: string; preview: string | null; setFile: (file: File | null) => void; loading: boolean; }
function VideoUpload({ label, preview, setFile, loading }: VideoUploadProps) {
  return preview ? (
    <div className="flex-1 border rounded-xl p-4 bg-gray-50">
      <h2 className="text-lg font-semibold mb-2 text-center">{label}</h2>
      <video src={preview} controls className="w-full h-40 md:h-60 rounded-lg object-contain" />
    </div>
  ) : (
    <label className="flex-1 flex flex-col items-center justify-center h-40 md:h-60 border border-gray-300 rounded-lg cursor-pointer hover:border-gray-400">
      <FiUploadCloud size={48} className="text-gray-400" />
      <span className="mt-2 text-gray-600">Upload {label}</span>
      <input type="file" accept="video/*" className="hidden" disabled={loading} onChange={e => setFile(e.target.files ? e.target.files[0] : null)} />
    </label>
  );
}
