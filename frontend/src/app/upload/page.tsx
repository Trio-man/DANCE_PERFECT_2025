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
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      if (!session?.user) router.push('/login');
      else setUser(session.user);
    });

    return () => listener.subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleUpload = async () => {
    if (!file || !user) {
      setStatus('Please select a file and log in first.');
      return;
    }
    setLoading(true);
    setStatus('Uploading...');
    try {
      const filePath = `${user.id}/${encodeURIComponent(file.name)}`;
      const { error } = await supabase.storage
        .from('videos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });
      if (error) throw error;
      setStatus('Upload successful! Click "List Files" to verify.');
    } catch (err) {
      console.error(err);
      setStatus('Upload failed.');
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
      const { data, error } = await supabase.storage
        .from('videos')
        .list(user.id, { limit: 100 });
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

        <h1 className="text-3xl font-bold text-blue-600 mb-2">Upload Video 🎥</h1>
        <p className="text-slate-500 mb-6">Welcome {user?.email || 'User'}</p>

        {/* File input */}
        <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-gray-400">
          <FiUploadCloud size={48} className="text-gray-400" />
          <span className="mt-2 text-gray-600">
            {file ? file.name : 'Click or drag file to upload'}
          </span>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
          />
        </label>

        {/* Video preview */}
        {previewUrl && (
          <video
            src={previewUrl}
            controls
            className="w-full rounded-lg border border-slate-300 mt-4"
          />
        )}

        {/* Status message */}
        {status && <p className="text-center text-gray-600 mt-4">{status}</p>}

        {/* Upload button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          disabled={loading || !user}
          onClick={handleUpload}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition mt-4"
        >
          {loading ? 'Uploading...' : 'Upload'}
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
                <li key={index} className="mt-1">{fileName}</li>
              ))}
            </ul>
          </div>
        )}
      </motion.div>
    </div>
  );
}