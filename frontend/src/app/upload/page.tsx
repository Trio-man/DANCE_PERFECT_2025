'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient, Session, User } from '@supabase/supabase-js';
import { FiArrowLeft, FiLogOut, FiUploadCloud, FiList } from 'react-icons/fi';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

  // ============================
  // AUTH CHECK
  // ============================
  useEffect(() => {
    const checkUser = async () => {
      setAuthLoading(true);
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace('/login');
      } else {
        setUser(data.user);
      }
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

  // ============================
  // VIDEO PREVIEWS
  // ============================
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

  // ============================
  // LIST FILES
  // ============================
  const handleListFiles = async () => {
    if (!user) {
      setStatus('Please log in to view files.');
      return;
    }
    try {
      const { data, error } = await supabase.storage.from('videos').list(user.id, {
        limit: 100,
      });
      if (error) throw error;
    const files = data.map((file) => file.name);
    setStatus(files.length > 0 ? 'Files retrieved.' : 'No files found.');
    } catch (err) {
      console.error(err);
      setStatus('Failed to list files.');
    }
  };

  // ============================
  // ANALYSIS
  // ============================
  const handleAnalyze = async () => {
    if (!dancerVideo || !choreoVideo) {
      setStatus("Please upload both videos first.");
      return;
    }

    setLoading(true);
    setStatus("Preparing videos...");

    const toDataUrl = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

    try {
      const dancerDataUrl = await toDataUrl(dancerVideo);
      const choreoDataUrl = await toDataUrl(choreoVideo);

      sessionStorage.setItem("dp_dancer", dancerDataUrl);
      sessionStorage.setItem("dp_choreo", choreoDataUrl);

      router.push("/loading");
    } catch (err: unknown) {
      console.error(err);
      setStatus("❌ Failed to prepare videos.");
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

  async function handleLogout(): Promise<void> {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-6xl bg-white border border-slate-200 shadow-md rounded-2xl p-8 relative">

        <button onClick={() => router.back()} className="absolute top-4 left-4 text-gray-600 hover:text-gray-800">
          <FiArrowLeft size={24} />
        </button>

        <button onClick={handleLogout} className="absolute top-4 right-4 text-red-600 hover:text-red-800">
          <FiLogOut size={24} />
        </button>

        <h1 className="text-3xl font-bold text-blue-600 text-center mb-2">
          Upload Videos 🎥
        </h1>
        <p className="text-slate-500 text-center mb-8">
          Welcome {user?.email || 'User'}
        </p>

        <div className="flex flex-col md:flex-row gap-8">

          {/* Dancer Video */}
          <div className="flex-1 border rounded-xl p-6 bg-gray-50">
            <h2 className="text-lg font-semibold mb-3 text-center">Dancer Video</h2>

            {previewDancer ? (
              <div className="w-full h-36 md:h-80 rounded-lg overflow-hidden border border-slate-300 bg-black">
                <video
                  src={previewDancer}
                  controls
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-36 md:h-80 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-gray-400">
                <FiUploadCloud size={48} className="text-gray-400" />
                <span className="mt-2 text-gray-600">
                  {"Upload Dancer's Video"}
                </span>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  disabled={loading}
                  onChange={(e) => setDancerVideo(e.target.files ? e.target.files[0] : null)}
                />
              </label>
            )}
          </div>

          {/* Choreographer Video */}
          <div className="flex-1 border rounded-xl p-6 bg-gray-50">
            <h2 className="text-lg font-semibold mb-3 text-center">Choreographer Video</h2>

            {previewChoreo ? (
              <div className="w-full h-36 md:h-80 rounded-lg overflow-hidden border border-slate-300 bg-black">
                <video
                  src={previewChoreo}
                  controls
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-36 md:h-80 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-gray-400">
                <FiUploadCloud size={48} className="text-gray-400" />
                <span className="mt-2 text-gray-600">
                  {"Upload Choreographer's Video"}
                </span>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  disabled={loading}
                  onChange={(e) => setChoreoVideo(e.target.files ? e.target.files[0] : null)}
                />
              </label>
            )}

            {status && <p className="text-center text-gray-600 mt-3">{status}</p>}
          </div>

        </div>

        <div className="flex flex-col md:flex-row gap-4 justify-center mt-6">
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={!user || loading}
            onClick={handleListFiles}
            className="bg-gray-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-gray-700 transition"
          >
            <FiList className="inline mr-2" /> List Files
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={loading || !user}
            onClick={handleAnalyze}
            className="bg-green-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-700 transition"
          >
            Analyze 🎯
          </motion.button>
        </div>

      </div>
    </div>
  );
}
