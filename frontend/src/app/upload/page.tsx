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

  // -------------------------
  // CMS STATE
  // -------------------------
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

      if (sErr) {
        setCmsError(sErr.message);
      } else {
        setAppSettings(settingsRow as AppSettingsRow);
      }

      const { data: pages, error: pErr } = await supabase
        .from('content_pages')
        .select('id,slug,title,body,is_active')
        .in('slug', ['about', 'guidelines'])
        .limit(2);

      if (pErr) {
        setCmsError((prev) => prev || pErr.message);
      } else {
        const list = (pages ?? []) as ContentPageRow[];
        setAboutPage(list.find((x) => x.slug === 'about' && x.is_active) || null);
        setGuidelinesPage(list.find((x) => x.slug === 'guidelines' && x.is_active) || null);
      }

      const { data: faqRows, error: fErr } = await supabase
        .from('faqs')
        .select('id,question,answer,is_active')
        .eq('is_active', true)
        .order('id', { ascending: false })
        .limit(20);

      if (fErr) {
        setCmsError((prev) => prev || fErr.message);
      } else {
        // ✅ FIX: removed unsafe cast that breaks build
        setFaqs((faqRows ?? []) as FaqRow[]);
      }
    };

    loadCms();
  }, []);

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
    } catch {
      setStatus('Failed to list files.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-')) localStorage.removeItem(key);
    });
    router.replace('/login');
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

      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (!accessToken) {
        setStatus('Session missing. Please log in again.');
        setLoading(false);
        return;
      }

      sessionStorage.setItem('dp_token', accessToken);
      router.push('/loading');
    } catch {
      setStatus('Failed to prepare videos.');
      setLoading(false);
    }
  };

  const systemName = appSettings?.system_name || 'DancePerfect';
  const primaryColor = appSettings?.primary_color || '#7C3AED';

  // -------------------------
  // UI (UNCHANGED)
  // -------------------------
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white"
    >
      <div className="w-full max-w-6xl flex flex-col gap-6 py-10">

        {cmsError && (
          <p className="text-center text-sm text-red-600">
            CMS load warning: {cmsError}
          </p>
        )}

        {guidelinesPage && (
          <motion.div
            className="bg-white/60 border border-white/70 rounded-xl p-6"
          >
            <h2 style={{ color: primaryColor }} className="text-lg font-semibold mb-2">
              {guidelinesPage.title}
            </h2>
            <p className="text-slate-700 whitespace-pre-line">
              {guidelinesPage.body}
            </p>
          </motion.div>
        )}

        <motion.div className="bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg rounded-2xl p-8 relative">

          <button onClick={() => router.back()} className="absolute top-4 left-4 text-gray-600">
            <FiArrowLeft size={24} />
          </button>

          <button onClick={handleLogout} className="absolute top-4 right-4 text-red-600">
            <FiLogOut size={24} />
          </button>

          <h1 className="text-3xl font-bold text-center" style={{ color: primaryColor }}>
            {systemName}
          </h1>

          <p className="text-center text-slate-600 mt-2">
            Welcome {user?.email?.split('@')[0]}
          </p>

          <div className="flex flex-col md:flex-row gap-8 mt-6">
            <VideoUpload label="Dancer Video" preview={previewDancer} setFile={setDancerVideo} loading={loading} />
            <VideoUpload label="Choreographer Video" preview={previewChoreo} setFile={setChoreoVideo} loading={loading} />
          </div>

          {status && <p className="text-center mt-3">{status}</p>}

          <button
            onClick={handleAnalyze}
            disabled={!user || loading}
            className="w-full mt-6 text-white py-3 rounded-lg"
            style={{ backgroundColor: primaryColor }}
          >
            Analyze 🎯
          </button>
        </motion.div>

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
