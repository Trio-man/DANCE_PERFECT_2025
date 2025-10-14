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

  // Preview dancer video
  useEffect(() => {
    if (!dancerVideo) {
      setPreviewDancer(null);
      return;
    }
    const url = URL.createObjectURL(dancerVideo);
    setPreviewDancer(url);
    return () => URL.revokeObjectURL(url);
  }, [dancerVideo]);

  // Preview choreographer video
  useEffect(() => {
    if (!choreoVideo) {
      setPreviewChoreo(null);
      return;
    }
    const url = URL.createObjectURL(choreoVideo);
    setPreviewChoreo(url);
    return () => URL.revokeObjectURL(url);
  }, [choreoVideo]);

  // Upload both videos
  const handleUpload = async () => {
    if (!dancerVideo || !choreoVideo || !user) {
      setStatus('Please select both videos and make sure you are logged in.');
      return;
    }

    setLoading(true);
    setStatus('Uploading videos...');

    try {
      // Upload Dancer video
      const dancerPath = `${user.id}/dancer_${encodeURIComponent(dancerVideo.name)}`;
      const { error: dancerError } = await supabase.storage
        .from('videos')
        .upload(dancerPath, dancerVideo, { cacheControl: '3600', upsert: true });
      if (dancerError) throw dancerError;

      // Upload Choreographer video
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="bg-white border border-slate-200 shadow-md rounded-2xl p-10 w-full max-w-md relative text-center"
      >
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

        <h1 className="text-3xl font-bold text-blue-600 mb-2">Upload Videos 🎥</h1>
        <p className="text-slate-500 mb-6">Welcome {user?.email || 'User'}</p>

        {/* Dancer video input */}
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

        {/* Dancer video preview */}
        {previewDancer && (
          <video
            src={previewDancer}
            controls
            className="w-full rounded-lg border border-slate-300 mb-4"
          />
        )}

        {/* Choreographer video input */}
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

        {/* Choreographer video preview */}
        {previewChoreo && (
          <video
            src={previewChoreo}
            controls
            className="w-full rounded-lg border border-slate-300 mb-4"
          />
        )}

        {/* Status message */}
        {status && <p className="text-center text-gray-600 mt-2">{status}</p>}

        {/* Upload button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          disabled={loading || !user}
          onClick={handleUpload}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition mt-4"
        >
          {loading ? 'Uploading...' : 'Upload Both Videos'}
        </motion.button>

        {/* List files button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          disabled={!user}
          onClick={handleListFiles}
          className="w-full bg-gray-600 text-white py-3 rounded-lg font-semibold hover:bg-gray-700 transition mt-4"
        >
          <FiList className="inline mr-2" /> List Files
        </motion.button>

        {/* File list */}
        {fileList.length > 0 && (
          <div className="mt-4">
            <h3 className="text-lg font-semibold text-gray-700">Uploaded Files:</h3>
            <ul className="text-left text-gray-600">
              {fileList.map((fileName, index) => (
                <li key={index} className="mt-1">
                  {fileName}
                </li>
              ))}
            </ul>
          </div>
        )}
      </motion.div>
    </div>
  );
}
