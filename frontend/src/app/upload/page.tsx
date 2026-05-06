'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient, Session, User } from '@supabase/supabase-js';
import { FiArrowLeft, FiLogOut, FiUploadCloud, FiList } from 'react-icons/fi';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// -------------------------
// TYPES
// -------------------------
type StorageFile = {
  name: string;
  created_at?: string;
};

export default function UploadPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  const [dancerVideo, setDancerVideo] = useState<File | null>(null);
  const [choreoVideo, setChoreoVideo] = useState<File | null>(null);

  const [previewDancer, setPreviewDancer] = useState<string | null>(null);
  const [previewChoreo, setPreviewChoreo] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [files, setFiles] = useState<StorageFile[]>([]);

  // -------------------------
  // AUTH
  // -------------------------
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) router.replace('/login');
      else setUser(data.user);
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
  // VIDEO PREVIEW
  // -------------------------
  useEffect(() => {
    if (!dancerVideo) return setPreviewDancer(null);
    const url = URL.createObjectURL(dancerVideo);
    setPreviewDancer(url);
    return () => URL.revokeObjectURL(url);
  }, [dancerVideo]);

  useEffect(() => {
    if (!choreoVideo) return setPreviewChoreo(null);
    const url = URL.createObjectURL(choreoVideo);
    setPreviewChoreo(url);
    return () => URL.revokeObjectURL(url);
  }, [choreoVideo]);

  // -------------------------
  // STORAGE HELPERS
  // -------------------------
  const getPublicUrl = (fileName: string) => {
    return supabase.storage
      .from('videos')
      .getPublicUrl(`${user?.id}/${fileName}`).data.publicUrl;
  };

  const handleDownload = (url: string) => {
    window.open(url, '_blank');
  };

  const handleDeleteFile = async (fileName: string) => {
    if (!user) return;

    const confirmDelete = confirm(`Delete ${fileName}?`);
    if (!confirmDelete) return;

    try {
      const { error } = await supabase.storage
        .from('videos')
        .remove([`${user.id}/${fileName}`]);

      if (error) throw error;

      setFiles((prev) => prev.filter((f) => f.name !== fileName));
      setStatus(`Deleted: ${fileName}`);
    } catch (err) {
      console.error(err);
      setStatus('Failed to delete file.');
    }
  };

  // -------------------------
  // LIST FILES
  // -------------------------
  const handleListFiles = async () => {
    if (!user) {
      setStatus('Please log in.');
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from('videos')
        .list(user.id, { limit: 100 });

      if (error) throw error;

      setFiles(data || []);
      setStatus(data && data.length > 0 ? null : 'No files found.');
    } catch (err) {
      console.error(err);
      setStatus('Failed to list files.');
    }
  };

  // -------------------------
  // ANALYZE
  // -------------------------
  const handleAnalyze = async () => {
    if (!dancerVideo || !choreoVideo) {
      setStatus('Upload both videos first.');
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

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) throw new Error();

      sessionStorage.setItem('dp_token', token);
      router.push('/loading');
    } catch {
      setStatus('Failed to prepare videos.');
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white">
      <div className="w-full max-w-6xl flex flex-col gap-6 py-10">

        {/* UPLOAD CARD */}
        <div className="bg-white/70 rounded-2xl p-8 relative">

          <button onClick={() => router.back()} className="absolute left-4 top-4">
            <FiArrowLeft size={22} />
          </button>

          <button onClick={handleLogout} className="absolute right-4 top-4">
            <FiLogOut size={22} />
          </button>

          <h1 className="text-2xl font-bold text-center mb-4">
            DancePerfect
          </h1>

          <div className="flex flex-col md:flex-row gap-6">
            <VideoUpload label="Dancer Video" preview={previewDancer} setFile={setDancerVideo} loading={loading} />
            <VideoUpload label="Choreo Video" preview={previewChoreo} setFile={setChoreoVideo} loading={loading} />
          </div>

          {status && <p className="text-center mt-3 text-gray-600">{status}</p>}

          <div className="flex gap-4 justify-center mt-6">
            <button onClick={handleListFiles} className="bg-purple-500 text-white px-5 py-2 rounded">
              <FiList className="inline mr-1" /> List Files
            </button>

            <button onClick={handleAnalyze} className="bg-purple-500 text-white px-5 py-2 rounded">
              Analyze
            </button>
          </div>
        </div>

        {/* FILE MANAGER */}
        {files.length > 0 && (
          <div className="bg-white/60 rounded-xl p-5">
            <h3 className="text-center font-semibold mb-4">Your Videos 🎥</h3>

            <div className="grid md:grid-cols-2 gap-5">
              {files.map((file) => {
                const url = getPublicUrl(file.name);

                return (
                  <div key={file.name} className="bg-white p-4 rounded-xl border flex flex-col gap-3">
                    <div className="h-48 bg-black rounded overflow-hidden">
                      <video src={url} controls className="w-full h-full object-contain" />
                    </div>

                    <p className="text-sm truncate">{file.name}</p>

                    <div className="flex gap-2 justify-between">
                      <button onClick={() => handleDownload(url)} className="bg-blue-500 text-white px-2 py-1 text-xs rounded">
                        Download
                      </button>

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(url);
                          setStatus('Link copied!');
                        }}
                        className="bg-gray-200 px-2 py-1 text-xs rounded"
                      >
                        Copy
                      </button>

                      <button
                        onClick={() => handleDeleteFile(file.name)}
                        className="bg-red-500 text-white px-2 py-1 text-xs rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// -------------------------
// Upload Component
// -------------------------
function VideoUpload({ label, preview, setFile, loading }: any) {
  return preview ? (
    <div className="flex-1 p-4 bg-gray-50 rounded">
      <p className="text-center mb-2">{label}</p>
      <video src={preview} controls className="w-full h-48 object-contain" />
    </div>
  ) : (
    <label className="flex-1 flex flex-col items-center justify-center border h-48 rounded cursor-pointer">
      <FiUploadCloud size={40} />
      <span>Upload {label}</span>
      <input type="file" hidden accept="video/*" disabled={loading}
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
    </label>
  );
}
