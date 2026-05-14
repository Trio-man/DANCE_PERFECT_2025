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

// -------------------------
// CMS TYPES
// -------------------------
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

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // CMS
  const [appSettings, setAppSettings] = useState<AppSettingsRow | null>(null);
  const [aboutPage, setAboutPage] = useState<ContentPageRow | null>(null);
  const [guidelinesPage, setGuidelinesPage] = useState<ContentPageRow | null>(null);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [cmsError, setCmsError] = useState<string | null>(null);

  // -------------------------
  // AUTH CHECK
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
  // CMS LOAD
  // -------------------------
  useEffect(() => {
    const loadCms = async () => {
      setCmsError(null);

      const { data: settingsRow, error: sErr } = await supabase
        .from('app_settings')
        .select('id,system_name,logo_url,primary_color')
        .single();

      if (!sErr) setAppSettings(settingsRow as AppSettingsRow);
      else setCmsError(sErr.message);

      const { data: pages } = await supabase
        .from('content_pages')
        .select('id,slug,title,body,is_active')
        .in('slug', ['about', 'guidelines']);

      const list = (pages ?? []) as ContentPageRow[];
      setAboutPage(list.find(p => p.slug === 'about' && p.is_active) || null);
      setGuidelinesPage(list.find(p => p.slug === 'guidelines' && p.is_active) || null);

      const { data: faqRows } = await supabase
        .from('faqs')
        .select('id,question,answer,is_active')
        .eq('is_active', true);

      setFaqs((faqRows ?? []) as FaqRow[]);
    };

    loadCms();
  }, []);

  // -------------------------
  // PREVIEWS
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
  // ANALYZE
  // -------------------------
  const handleAnalyze = async () => {
    if (!dancerVideo || !choreoVideo) {
      setStatus('Please upload both videos first.');
      return;
    }

    setLoading(true);

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

      if (!token) {
        setStatus('Session expired. Please login again.');
        setLoading(false);
        return;
      }

      sessionStorage.setItem('dp_token', token);

      router.push('/loading');
    } catch {
      setStatus('Failed to prepare videos.');
      setLoading(false);
    }
  };

  const systemName = appSettings?.system_name || 'DancePerfect';
  const primaryColor = appSettings?.primary_color || '#7C3AED';

  // -------------------------
  // UI
  // -------------------------
  return (
    <motion.div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white">
      <div className="w-full max-w-6xl flex flex-col gap-6 py-10">

        {cmsError && (
          <p className="text-center text-sm text-red-600">{cmsError}</p>
        )}

        {guidelinesPage && (
          <div className="bg-white/60 p-6 rounded-xl">
            <h2 style={{ color: primaryColor }} className="font-bold">
              {guidelinesPage.title}
            </h2>
            <p className="text-slate-700">{guidelinesPage.body}</p>
          </div>
        )}

        <div className="bg-white/70 p-8 rounded-2xl">
          <h1 className="text-3xl font-bold" style={{ color: primaryColor }}>
            {systemName}
          </h1>

          <p className="text-center mt-2 text-slate-600">
            Welcome {user?.email?.split('@')[0]}
          </p>

          <div className="flex gap-6 mt-6">
            <VideoUpload label="Dancer Video" preview={previewDancer} setFile={setDancerVideo} loading={loading} />
            <VideoUpload label="Choreographer Video" preview={previewChoreo} setFile={setChoreoVideo} loading={loading} />
          </div>

          {status && <p className="text-center mt-3">{status}</p>}

          <button
            onClick={handleAnalyze}
            disabled={loading || !user}
            className="w-full mt-6 text-white py-3 rounded-lg"
            style={{ backgroundColor: primaryColor }}
          >
            Analyze 🎯
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// -------------------------
function VideoUpload({
  label,
  preview,
  setFile,
  loading,
}: {
  label: string;
  preview: string | null;
  setFile: (file: File | null) => void;
  loading: boolean;
}) {
  return preview ? (
    <video src={preview} controls className="w-full h-64 object-contain" />
  ) : (
    <label className="border p-6 cursor-pointer">
      <FiUploadCloud />
      <span>{label}</span>
      <input
        type="file"
        accept="video/*"
        hidden
        disabled={loading}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}
