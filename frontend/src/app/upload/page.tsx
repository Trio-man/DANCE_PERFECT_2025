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
  const [result, setResult] = useState<any>(null);

  const BACKEND_URL = "http://localhost:5000";
  const toBackendUrl = (p: string) => {
    if (!p) return p;
    if (p.startsWith("http://") || p.startsWith("https://")) return p;
    if (p.startsWith("/")) return `${BACKEND_URL}${p}`;
    return `${BACKEND_URL}/${p}`;
  };

  // ============================
  // AUTH CHECK
  // ============================
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

  // ============================
  // VIDEO PREVIEWS
  // ============================
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

  // ============================
  // LIST FILES
  // ============================
  const handleListFiles = async () => {
    if (!user) {
      setStatus('Please log in to view files.');
      return;
    }
    try {
      const { data, error } = await supabase.storage.from('videos').list(user.id, { limit: 100 });
      if (error) throw error;
      const files = data.map((file) => file.name);
      setStatus(files.length > 0 ? 'Files retrieved.' : 'No files found.');
    } catch (err) {
      console.error(err);
      setStatus('Failed to list files.');
    }
  };

  // ============================
  // ANALYZE FLOW (GO TO LOADING)
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

      router.push("/loading"); // ✅ go to loading page
    } catch (err) {
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

  const refPreviews: string[] = result?.visuals?.reference?.preview_images || [];
  const usrPreviews: string[] = result?.visuals?.user?.preview_images || [];
  const refOverlay: string | null = result?.visuals?.reference?.overlay_video || null;
  const usrOverlay: string | null = result?.visuals?.user?.overlay_video || null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-6xl bg-white border border-slate-200 shadow-md rounded-2xl p-8 relative">

        {loading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center rounded-2xl z-50">
            <div className="text-center">
              <div className="animate-spin h-10 w-10 rounded-full border-4 border-gray-300 border-t-gray-700 mx-auto mb-3" />
              <p className="text-gray-700 font-semibold">Processing...</p>
              <p className="text-gray-500 text-sm mt-1">Please wait while we analyze the videos.</p>
            </div>
          </div>
        )}

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
                <video src={previewDancer} controls className="w-full h-full object-contain" />
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-36 md:h-80 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-gray-400">
                <FiUploadCloud size={48} className="text-gray-400" />
                <span className="mt-2 text-gray-600">Upload Dancer's Video</span>
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
                <video src={previewChoreo} controls className="w-full h-full object-contain" />
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-36 md:h-80 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-gray-400">
                <FiUploadCloud size={48} className="text-gray-400" />
                <span className="mt-2 text-gray-600">Upload Choreographer's Video</span>
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

        {result && (
          <div className="mt-8 border-t pt-6">
            <h3 className="text-xl font-bold text-slate-700 text-center mb-3">Analysis Output</h3>

            <p className="text-center text-slate-600 mb-4">
              Score: <span className="font-semibold">{result?.score ?? 0}</span>
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border rounded-xl p-4 bg-gray-50">
                <p className="font-semibold text-slate-700 mb-2 text-center">Reference (Choreographer)</p>

                {refOverlay && (
                  <div className="mb-3">
                    <p className="text-sm text-slate-600 mb-1 text-center">Overlay Video</p>
                    <video controls className="w-full rounded-lg border bg-black" src={toBackendUrl(refOverlay)} />
                  </div>
                )}

                {refPreviews.length > 0 && (
                  <div>
                    <p className="text-sm text-slate-600 mb-2 text-center">Pose Preview Frames</p>
                    <div className="flex gap-3 flex-wrap justify-center">
                      {refPreviews.map((url, idx) => (
                        <img
                          key={idx}
                          src={toBackendUrl(url)}
                          alt={`ref preview ${idx + 1}`}
                          className="w-44 rounded-lg border bg-white"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border rounded-xl p-4 bg-gray-50">
                <p className="font-semibold text-slate-700 mb-2 text-center">User (Dancer)</p>

                {usrOverlay && (
                  <div className="mb-3">
                    <p className="text-sm text-slate-600 mb-1 text-center">Overlay Video</p>
                    <video controls className="w-full rounded-lg border bg-black" src={toBackendUrl(usrOverlay)} />
                  </div>
                )}

                {usrPreviews.length > 0 && (
                  <div>
                    <p className="text-sm text-slate-600 mb-2 text-center">Pose Preview Frames</p>
                    <div className="flex gap-3 flex-wrap justify-center">
                      {usrPreviews.map((url, idx) => (
                        <img
                          key={idx}
                          src={toBackendUrl(url)}
                          alt={`user preview ${idx + 1}`}
                          className="w-44 rounded-lg border bg-white"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {result?.feedback?.summary && (
              <div className="mt-6 bg-white border rounded-xl p-4">
                <p className="font-semibold text-slate-700 mb-1">Feedback Summary</p>
                <p className="text-slate-600">{result.feedback.summary}</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}