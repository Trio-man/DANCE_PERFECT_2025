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

type AppSettingsRow = {
  system_name: string;
  logo_url: string | null;
  primary_color: string;
};

type ContentPageRow = {
  id: number;
  slug: string;
  title: string;
  body: string;
  is_active: boolean;
};

type FaqRow = {
  id: number;
  question: string;
  answer: string;
  is_active: boolean;
};

type VideoUploadProps = {
  label: string;
  preview: string | null;
  setFile: (file: File | null) => void;
  loading: boolean;
};

// -------------------------
// PAGE
// -------------------------
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

  const [appSettings, setAppSettings] = useState<AppSettingsRow | null>(null);
  const [aboutPage, setAboutPage] = useState<ContentPageRow | null>(null);
  const [guidelinesPage, setGuidelinesPage] = useState<ContentPageRow | null>(null);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);

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
    if (!user) return '';
    return supabase.storage
      .from('videos')
      .getPublicUrl(`${user.id}/${fileName}`).data.publicUrl;
  };

  const handleListFiles = async () => {
    if (!user) return;

    const { data } = await supabase.storage
      .from('videos')
      .list(user.id, {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    setFiles(data || []);
  };

  const handleDeleteFile = async (fileName: string) => {
    if (!user) return;

    const confirmDelete = confirm(`Delete ${fileName}?`);
    if (!confirmDelete) return;

    const { error } = await supabase.storage
      .from('videos')
      .remove([`${user.id}/${fileName}`]);

    if (!error) {
      setFiles((prev) => prev.filter((f) => f.name !== fileName));
      setStatus('Deleted file');
    }
  };

  // -------------------------
  // ANALYZE (FIXED FLOW → RESULTS PAGE)
  // -------------------------
  const handleAnalyze = async () => {
    if (!dancerVideo || !choreoVideo) {
      setStatus('Upload both videos first.');
      return;
    }

    setLoading(true);

    const result = {
      score: Math.floor(Math.random() * 30 + 70),
      feedback: 'Good rhythm, improve arm synchronization',
      timestamp: new Date().toISOString()
    };

    sessionStorage.setItem('dp_results', JSON.stringify(result));

    setTimeout(() => {
      setLoading(false);
      router.push('/results');
    }, 1000);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen px-4 py-10 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white flex justify-center"
    >
      <div className="w-full max-w-6xl space-y-6">

        {/* HEADER */}
        <motion.div
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-white/70 p-6 rounded-xl relative text-center"
        >
          <button onClick={() => router.back()} className="absolute left-4 top-4">
            <FiArrowLeft />
          </button>

          <button onClick={handleLogout} className="absolute right-4 top-4">
            <FiLogOut />
          </button>

          {appSettings?.logo_url && (
            <img src={appSettings.logo_url} className="h-10 mx-auto mb-2" />
          )}

          <h1 className="text-2xl font-bold">
            {appSettings?.system_name || 'DancePerfect'}
          </h1>

          <p className="text-sm text-gray-600">
            Welcome {user?.email?.split('@')[0]}
          </p>
        </motion.div>

        {/* UPLOAD */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-white/70 p-6 rounded-xl space-y-4"
        >
          <div className="flex gap-4">
            <VideoUpload label="Dancer" preview={previewDancer} setFile={setDancerVideo} loading={loading} />
            <VideoUpload label="Choreo" preview={previewChoreo} setFile={setChoreoVideo} loading={loading} />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleAnalyze}
              className="bg-purple-600 text-white px-4 py-2 rounded"
            >
              Analyze
            </button>

            <button
              onClick={handleListFiles}
              className="bg-gray-600 text-white px-4 py-2 rounded"
            >
              <FiList className="inline mr-1" /> Files
            </button>
          </div>

          {status && <p className="text-sm text-gray-600">{status}</p>}
        </motion.div>

        {/* FILE LIST */}
        {files.length > 0 && (
          <div className="bg-white/60 p-5 rounded-xl space-y-3">
            <h3 className="font-semibold">Files</h3>

            <div className="grid md:grid-cols-2 gap-4">
              {files.map((f) => {
                const url = getPublicUrl(f.name);

                return (
                  <div key={f.name} className="bg-white p-3 rounded border space-y-2">
                    <video src={url} controls className="w-full" />
                    <p className="text-sm truncate">{f.name}</p>

                    <button
                      onClick={() => handleDeleteFile(f.name)}
                      className="text-xs bg-red-500 text-white px-2 py-1 rounded"
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </motion.div>
  );
}

// -------------------------
// UPLOAD COMPONENT
// -------------------------
function VideoUpload({ label, preview, setFile, loading }: VideoUploadProps) {
  return preview ? (
    <motion.video
      initial={{ scale: 0.95 }}
      animate={{ scale: 1 }}
      src={preview}
      controls
      className="w-full h-40 object-contain"
    />
  ) : (
    <label className="flex-1 border h-40 flex flex-col items-center justify-center cursor-pointer rounded">
      <FiUploadCloud />
      <span>{label}</span>
      <input
        type="file"
        hidden
        accept="video/*"
        disabled={loading}
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
    </label>
  );
}
