'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient, Session, User } from '@supabase/supabase-js';
import { FiArrowLeft, FiLogOut, FiUploadCloud, FiList } from 'react-icons/fi';

// ─────────────────────────────────────────────
// SUPABASE CLIENT
// ─────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// VIDEO UPLOAD COMPONENT
// ─────────────────────────────────────────────
interface VideoUploadProps {
  label: string;
  preview: string | null;
  setFile: (file: File | null) => void;
  loading: boolean;
}

function VideoUpload({ label, preview, setFile, loading }: VideoUploadProps) {
  if (preview) {
    return (
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex-1 border rounded-xl p-6 bg-gray-50"
      >
        <h2 className="text-lg font-semibold mb-3 text-center">{label}</h2>
        <div className="w-full h-36 md:h-80 rounded-lg overflow-hidden border border-slate-300 bg-black">
          <video src={preview} controls className="w-full h-full object-contain" />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.label
      initial={{ scale: 0.95, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex-1 flex flex-col items-center justify-center w-full h-36 md:h-80 border border-slate-300 rounded-lg cursor-pointer hover:border-gray-400"
    >
      <FiUploadCloud size={48} className="text-gray-400" />
      <span className="mt-2 text-gray-600">Upload {label}</span>
      <input
        type="file"
        accept="video/*"
        className="hidden"
        disabled={loading}
        onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
      />
    </motion.label>
  );
}

// ─────────────────────────────────────────────
// UPLOAD PAGE
// ─────────────────────────────────────────────
export default function UploadPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);

  const [dancerVideo, setDancerVideo] = useState<File | null>(null);
  const [choreoVideo, setChoreoVideo] = useState<File | null>(null);
  const [previewDancer, setPreviewDancer] = useState<string | null>(null);
  const [previewChoreo, setPreviewChoreo] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [appSettings, setAppSettings] = useState<AppSettingsRow | null>(null);
  const [aboutPage, setAboutPage] = useState<ContentPageRow | null>(null);
  const [guidelinesPage, setGuidelinesPage] = useState<ContentPageRow | null>(null);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [cmsError, setCmsError] = useState<string | null>(null);

  // ─────────────────────────────────────────────
  // AUTH CHECK
  // ─────────────────────────────────────────────
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace('/login');
      } else {
        setUser(data.user);
      }
    };

    checkUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session: Session | null) => {
        if (!session?.user) {
          router.replace('/login');
        } else {
          setUser(session.user);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, [router]);

  // ─────────────────────────────────────────────
  // CMS LOAD (UNCHANGED)
  // ─────────────────────────────────────────────
  useEffect(() => {
    const loadCms = async () => {
      setCmsError(null);

      const { data: settingsRow, error: sErr } = await supabase
        .from('app_settings')
        .select('id,system_name,logo_url,primary_color')
        .single();

      if (sErr) setCmsError(sErr.message);
      else setAppSettings(settingsRow as AppSettingsRow);

      const { data: pages, error: pErr } = await supabase
        .from('content_pages')
        .select('id,slug,title,body,is_active')
        .in('slug', ['about', 'guidelines']);

      if (pErr) setCmsError((prev) => prev || pErr.message);
      else {
        const list = (pages ?? []) as ContentPageRow[];
        setAboutPage(list.find((x) => x.slug === 'about') ?? null);
        setGuidelinesPage(list.find((x) => x.slug === 'guidelines') ?? null);
      }

      const { data: faqRows } = await supabase
        .from('faqs')
        .select('id,question,answer,is_active')
        .eq('is_active', true);

      setFaqs((faqRows ?? []) as FaqRow[]);
    };

    loadCms();
  }, []);

  // ─────────────────────────────────────────────
  // PREVIEWS (UNCHANGED)
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // 🔥 ONLY CHANGE: ANALYZE FUNCTION (OPTION B)
  // ─────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!dancerVideo || !choreoVideo) {
      setStatus('Please upload both videos first.');
      return;
    }

    setLoading(true);
    setStatus('Analyzing...');

    try {
      const toDataUrl = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

      const dancerDataUrl = await toDataUrl(dancerVideo);
      const choreoDataUrl = await toDataUrl(choreoVideo);

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dancer_video: dancerDataUrl,
          choreo_video: choreoDataUrl,
        }),
      });

      const result = await res.json();

      // keep temporary bridge for results page
      sessionStorage.setItem('dp_result', JSON.stringify(result));

      router.push('/results');
    } catch (err) {
      console.error(err);
      setStatus('❌ Failed to analyze videos.');
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────
  // RENDER (UNCHANGED)
  // ─────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white"
    >
      <div className="w-full max-w-6xl flex flex-col gap-6 py-10">

        {cmsError && <p className="text-red-600 text-center">{cmsError}</p>}

        <motion.div className="bg-white/70 p-8 rounded-2xl">
          <div className="flex flex-col md:flex-row gap-8">
            <VideoUpload
              label="Dancer Video"
              preview={previewDancer}
              setFile={setDancerVideo}
              loading={loading}
            />
            <VideoUpload
              label="Choreographer Video"
              preview={previewChoreo}
              setFile={setChoreoVideo}
              loading={loading}
            />
          </div>

          {status && <p className="text-center mt-4">{status}</p>}

          <div className="flex gap-4 justify-center mt-6">
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="bg-purple-700 text-white px-6 py-3 rounded-xl"
            >
              Analyze 🎯
            </button>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}
