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
  const [dancerVideo, setDancerVideo] = useState<File | null>(null);
  const [choreoVideo, setChoreoVideo] = useState<File | null>(null);
  const [previewDancer, setPreviewDancer] = useState<string | null>(null);
  const [previewChoreo, setPreviewChoreo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [fileList, setFileList] = useState<string[]>([]);

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) router.push('/login');
      else setUser(data.user);
    };
    checkUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session: Session | null) => {
        if (!session?.user) router.push('/login');
        else setUser(session.user);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (dancerVideo) {
      const url = URL.createObjectURL(dancerVideo);
      setPreviewDancer(url);
      return () => URL.revokeObjectURL(url);
    } else setPreviewDancer(null);
  }, [dancerVideo]);

  useEffect(() => {
    if (choreoVideo) {
      const url = URL.createObjectURL(choreoVideo);
      setPreviewChoreo(url);
      return () => URL.revokeObjectURL(url);
    } else setPreviewChoreo(null);
  }, [choreoVideo]);

  const handleUpload = async () => {
    if (!dancerVideo || !choreoVideo || !user) {
      setStatus('Please select both videos and make sure you are logged in.');
      return;
    }

    setLoading(true);
    setStatus('Uploading videos...');

    try {
      const dancerPath = `${user.id}/dancer_${encodeURIComponent(dancerVideo.name)}`;
      const { error: dancerError } = await supabase.storage
        .from('videos')
        .upload(dancerPath, dancerVideo, { cacheControl: '3600', upsert: true });
      if (dancerError) throw dancerError;

      const choreoPath = `${user.id}/choreo_${encodeURIComponent(choreoVideo.name)}`;
      const { error: choreoError } = await supabase.storage
        .from('videos')
        .upload(choreoPath, choreoVideo, { cacheControl: '3600', upsert: true });
      if (choreoError) throw choreoError;

      setStatus('✅ Both videos uploaded successfully! Click "List Files" to verify.');
    } catch (err) {
      console.error(err);
      setStatus('❌ Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
      setFileList(files);
      setStatus(files.length > 0 ? 'Files retrieved.' : 'No files found.');
    } catch (err) {
      console.error(err);
      setStatus('Failed to list files.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-6xl bg-white border border-slate-200 shadow-md rounded-2xl p-8 relative">
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

        <h1 className="text-3xl font-bold text-blue-600 text-center mb-2">
          Upload Videos 🎥
        </h1>
        <p className="text-slate-500 text-center mb-8">
          Welcome {user?.email || 'User'}
        </p>

        {/* Two-column layout */}
        <div className="flex flex-col md:flex-row gap-8">
          {/* LEFT: Dancer Upload */}
          <div className="flex-1 border rounded-xl p-6 bg-gray-50">
            <h2 className="text-lg font-semibold mb-3 text-center">Dancer Video</h2>
            <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-gray-400 mb-4">
              <FiUploadCloud size={48} className="text-gray-400" />
              <span className="mt-2 text-gray-600">
                {dancerVideo ? dancerVideo.name : "Upload Dancer's Video"}
              </span>
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) =>
                  setDancerVideo(e.target.files ? e.target.files[0] : null)
                }
              />
            </label>
            {previewDancer && (
              <video
                src={previewDancer}
                controls
                className="w-full rounded-lg border border-slate-300"
              />
            )}
          </div>

          {/* RIGHT: Choreographer Upload + File List */}
          <div className="flex-1 border rounded-xl p-6 bg-gray-50">
            <h2 className="text-lg font-semibold mb-3 text-center">Choreographer Video</h2>
            <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-gray-400 mb-4">
              <FiUploadCloud size={48} className="text-gray-400" />
              <span className="mt-2 text-gray-600">
                {choreoVideo ? choreoVideo.name : "Upload Choreographer's Video"}
              </span>
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) =>
                  setChoreoVideo(e.target.files ? e.target.files[0] : null)
                }
              />
            </label>
            {previewChoreo && (
              <video
                src={previewChoreo}
                controls
                className="w-full rounded-lg border border-slate-300 mb-4"
              />
            )}

            {status && <p className="text-center text-gray-600 mt-3">{status}</p>}

            {fileList.length > 0 && (
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-gray-700 mb-2 text-center">
                  Uploaded Files
                </h3>
                <ul className="text-left text-gray-600 max-h-48 overflow-y-auto border-t pt-2">
                  {fileList.map((fileName, index) => (
                    <li key={index} className="mt-1">{fileName}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Centered Buttons Below Both Boxes */}
        <div className="flex flex-col md:flex-row gap-4 justify-center mt-6">
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={loading || !user}
            onClick={handleUpload}
            className="bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            {loading ? 'Uploading...' : 'Upload Both Videos'}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={!user}
            onClick={handleListFiles}
            className="bg-gray-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-gray-700 transition"
          >
            <FiList className="inline mr-2" /> List Files
          </motion.button>
        </div>
      </div>
    </div>
  );
}
