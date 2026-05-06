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

// ---------------- TYPES ----------------
type StorageFile = { name: string; created_at?: string };

type AppSettingsRow = {
  id: number;
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

export default function UploadPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [dancerVideo, setDancerVideo] = useState<File | null>(null);
  const [choreoVideo, setChoreoVideo] = useState<File | null>(null);

  const [previewDancer, setPreviewDancer] = useState<string | null>(null);
  const [previewChoreo, setPreviewChoreo] = useState<string | null>(null);

  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [appSettings, setAppSettings] = useState<AppSettingsRow | null>(null);
  const [aboutPage, setAboutPage] = useState<ContentPageRow | null>(null);
  const [guidelinesPage, setGuidelinesPage] = useState<ContentPageRow | null>(null);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);

  const primaryColor = appSettings?.primary_color || '#7C3AED';
  const systemName = appSettings?.system_name || 'DancePerfect';

  // ---------------- AUTH ----------------
  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) router.replace('/login');
      else setUser(data.user);
    };
    run();
  }, [router]);

  // ---------------- CMS ----------------
  useEffect(() => {
    const load = async () => {
      const { data: settings } = await supabase
        .from('app_settings')
        .select('*')
        .single();

      setAppSettings(settings);

      const { data: pages } = await supabase
        .from('content_pages')
        .select('*')
        .in('slug', ['about', 'guidelines']);

      const list = pages ?? [];
      setAboutPage(list.find((p) => p.slug === 'about') || null);
      setGuidelinesPage(list.find((p) => p.slug === 'guidelines') || null);

      const { data: faq } = await supabase
        .from('faqs')
        .select('*')
        .eq('is_active', true);

      setFaqs(faq ?? []);
    };

    load();
  }, []);

  // ---------------- PREVIEWS ----------------
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

  // ---------------- LIST FILES ----------------
  const handleListFiles = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.storage
        .from('videos')
        .list(user.id, { limit: 100 });

      if (error) throw error;

      setFiles(data ?? []);
      setStatus(data?.length ? null : 'No files found');
    } catch (err: unknown) {
      console.error(err);
      setStatus('Failed to list files');
    }
  };

  // ---------------- DELETE ----------------
  const handleDelete = async (fileName: string) => {
    if (!user) return;

    try {
      const { error } = await supabase.storage
        .from('videos')
        .remove([`${user.id}/${fileName}`]);

      if (error) throw error;

      setFiles((prev) => prev.filter((f) => f.name !== fileName));
    } catch (err: unknown) {
      console.error(err);
    }
  };

  // ---------------- ANALYZE (VERSION A FLOW FIX) ----------------
  const handleAnalyze = async () => {
    if (!dancerVideo || !choreoVideo) return;

    setLoading(true);

    const toBase64 = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

    try {
      const dancer = await toBase64(dancerVideo);
      const choreo = await toBase64(choreoVideo);

      sessionStorage.setItem('dp_dancer', dancer);
      sessionStorage.setItem('dp_choreo', choreo);

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      sessionStorage.setItem('dp_token', token || '');

      // IMPORTANT: results flow
      sessionStorage.removeItem('dp_result');

      router.push('/loading');
    } catch (err: unknown) {
      console.error(err);
      setStatus('Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white p-4"
    >
      <div className="max-w-6xl mx-auto space-y-6">

        {/* HEADER */}
        <div className="bg-white/70 p-6 rounded-2xl">
          <div className="flex justify-between">
            <FiArrowLeft onClick={() => router.back()} />
            <FiLogOut onClick={handleLogout} />
          </div>

          <h1 className="text-center text-2xl font-bold" style={{ color: primaryColor }}>
            {systemName}
          </h1>

          <p className="text-center">
            Welcome {user?.email?.split('@')[0]}
          </p>
        </div>

        {/* GUIDELINES */}
        {guidelinesPage && (
          <div className="bg-white/60 p-4 rounded-xl">
            <h2>{guidelinesPage.title}</h2>
            <p>{guidelinesPage.body}</p>
          </div>
        )}

        {/* UPLOAD */}
        <div className="bg-white/70 p-6 rounded-xl">
          <div className="flex gap-4">
            <VideoUpload label="Dancer" preview={previewDancer} setFile={setDancerVideo} loading={loading} />
            <VideoUpload label="Choreo" preview={previewChoreo} setFile={setChoreoVideo} loading={loading} />
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={handleListFiles}>List Files</button>
            <button onClick={handleAnalyze}>Analyze</button>
          </div>

          {status && <p>{status}</p>}
        </div>

        {/* FILES */}
        {files.length > 0 && (
          <div className="bg-white/60 p-4 rounded-xl">
            {files.map((f) => (
              <div key={f.name} className="flex justify-between">
                <span>{f.name}</span>
                <button onClick={() => handleDelete(f.name)}>Delete</button>
              </div>
            ))}
          </div>
        )}

        {/* FAQ */}
        {faqs.map((f) => (
          <div key={f.id}>
            <b>{f.question}</b>
            <p>{f.answer}</p>
          </div>
        ))}

        {/* ABOUT */}
        {aboutPage && (
          <div>
            <h2>{aboutPage.title}</h2>
            <p>{aboutPage.body}</p>
          </div>
        )}

      </div>
    </motion.div>
  );
}

// Upload component
function VideoUpload({
  label,
  preview,
  setFile,
  loading
}: {
  label: string;
  preview: string | null;
  setFile: (f: File | null) => void;
  loading: boolean;
}) {
  return (
    <label className="flex-1 border p-4 rounded">
      {preview ? (
        <video src={preview} controls />
      ) : (
        <>
          <FiUploadCloud />
          <span>{label}</span>
        </>
      )}
      <input
        type="file"
        hidden
        disabled={loading}
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
    </label>
  );
}
