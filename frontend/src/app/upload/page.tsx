'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient, Session, User } from '@supabase/supabase-js';
import { FiArrowLeft, FiLogOut, FiUploadCloud, FiList } from 'react-icons/fi';
import Image from 'next/image';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  score?: number;
  feedback?: { summary?: string };
  visuals?: Visuals;
};

export default function UploadPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dancerVideo, setDancerVideo] = useState<File | null>(null);
  const [choreoVideo, setChoreoVideo] = useState<File | null>(null);
  const [previewDancer, setPreviewDancer] = useState<string | null>(null);
  const [previewChoreo, setPreviewChoreo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<ResultType | null>(null);

  const BACKEND_URL = 'http://localhost:5000';

  // -------------------------
  // AUTH CHECK
  // -------------------------
  useEffect(() => {
    const checkUser = async () => {
      setAuthLoading(true);
      const { data } = await supabase.auth.getUser();
      if (!data.user) router.replace('/login');
      else setUser(data.user);
      setAuthLoading(false);
    };
    checkUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session: Session | null) => {
        if (!session?.user) router.replace('/login');
        else setUser(session.user);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, [router]);

  // -------------------------
  // VIDEO PREVIEWS
  // -------------------------
  useEffect(() => {
    let url: string | null = null;

    if (dancerVideo) {
      url = URL.createObjectURL(dancerVideo);
      setPreviewDancer(url);
    } else {
      setPreviewDancer(null);
    }

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [dancerVideo]);

  useEffect(() => {
    let url: string | null = null;

    if (choreoVideo) {
      url = URL.createObjectURL(choreoVideo);
      setPreviewChoreo(url);
    } else {
      setPreviewChoreo(null);
    }

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [choreoVideo]);

  // -------------------------
  // LIST FILES
  // -------------------------
  const handleListFiles = async () => {
    if (!user) {
      setStatus('Please log in to view files.');
      return;
    }
    try {
      const { data, error } = await supabase.storage
        .from('videos')
        .list(user.id, { limit: 100 });
      if (error) throw error;
      const files = data.map((file) => file.name);
      setStatus(files.length > 0 ? 'Files retrieved.' : 'No files found.');
    } catch (err) {
      console.error(err);
      setStatus('Failed to list files.');
    }
  };

  // -------------------------
  // ANALYZE FLOW
  // -------------------------
  const handleAnalyze = async () => {
    if (!dancerVideo || !choreoVideo) {
      setStatus('Please upload both videos first.');
      return;
    }

    setLoading(true);
    setStatus('Preparing videos...');

    const toDataUrl = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

    try {
      const dancerDataUrl = await toDataUrl(dancerVideo);
      const choreoDataUrl = await toDataUrl(choreoVideo);

      sessionStorage.setItem('dp_dancer', dancerDataUrl);
      sessionStorage.setItem('dp_choreo', choreoDataUrl);

      router.push('/loading');
    } catch (err) {
      console.error(err);
      setStatus('❌ Failed to prepare videos.');
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Checking authentication...</p>
      </div>
    );
  }
  if (!user) return null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white animate-gradient"
    >
      <motion.div className="w-full max-w-6xl bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg rounded-2xl p-8 relative">
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center rounded-2xl z-50">
            <div className="text-center">
              <div className="animate-spin h-10 w-10 rounded-full border-4 border-gray-300 border-t-gray-700 mx-auto mb-3" />
              <p className="text-gray-700 font-semibold">Processing...</p>
              <p className="text-gray-500 text-sm mt-1">
                Please wait while we analyze the videos.
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <button
          onClick={() => router.back()}
          className="absolute top-4 left-4 text-gray-600 hover:text-gray-800"
        >
          <FiArrowLeft size={24} />
        </button>

        <button
          onClick={handleLogout}
          className="absolute top-4 right-4 text-red-600 hover:text-red-800"
        >
          <FiLogOut size={24} />
        </button>

        <h1 className="text-3xl font-bold text-purple-700 text-center mb-2">
          Upload Videos 🎥
        </h1>
        <p className="text-slate-600 text-center mb-8">
          Welcome {user.email}
        </p>

        {/* Video Uploads */}
        <div className="flex flex-col md:flex-row gap-8">
          <VideoUpload
            label="Dancer Video"
            preview={previewDancer}
            setFile={setDancerVideo}
            loading={loading}
          />
          <VideoUpload
            label="Choreographer Video"
            preview={previewChoreo}
            setFile={setChoreoVideo}
            loading={loading}
          />
        </div>

        {status && (
          <p className="text-center text-gray-600 mt-3">{status}</p>
        )}

        {/* Buttons */}
        <div className="flex flex-col md:flex-row gap-4 justify-center mt-6">
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={!user || loading}
            onClick={handleListFiles}
            className="bg-purple-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-purple-700 transition"
          >
            <FiList className="inline mr-2" /> List Files
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={loading || !user}
            onClick={handleAnalyze}
            className="bg-purple-700 text-white py-3 px-6 rounded-lg font-semibold hover:bg-purple-800 transition"
          >
            Analyze 🎯
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// -------------------------
// VideoUpload Component
// -------------------------
interface VideoUploadProps {
  label: string;
  preview: string | null;
  setFile: (file: File | null) => void;
  loading: boolean;
}

function VideoUpload({ label, preview, setFile, loading }: VideoUploadProps) {
  return preview ? (
    <div className="flex-1 border rounded-xl p-6 bg-gray-50">
      <h2 className="text-lg font-semibold mb-3 text-center">{label}</h2>
      <div className="w-full h-36 md:h-80 rounded-lg overflow-hidden border border-slate-300 bg-black">
        <video src={preview} controls className="w-full h-full object-contain" />
      </div>
    </div>
  ) : (
    <label className="flex-1 flex flex-col items-center justify-center w-full h-36 md:h-80 border border-slate-300 rounded-lg cursor-pointer hover:border-gray-400">
      <FiUploadCloud size={48} className="text-gray-400" />
      <span className="mt-2 text-gray-600">Upload {label}</span>
      <input
        type="file"
        accept="video/*"
        className="hidden"
        disabled={loading}
        onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
      />
    </label>
  );
}