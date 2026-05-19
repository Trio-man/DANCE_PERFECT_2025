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
// CMS TYPES
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

  // Auth
  const [user, setUser] = useState<User | null>(null);

  // Videos
  const [dancerVideo, setDancerVideo] = useState<File | null>(null);
  const [choreoVideo, setChoreoVideo] = useState<File | null>(null);
  const [previewDancer, setPreviewDancer] = useState<string | null>(null);
  const [previewChoreo, setPreviewChoreo] = useState<string | null>(null);

  // UI
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // CMS
  const [appSettings, setAppSettings] = useState<AppSettingsRow | null>(null);
  const [aboutPage, setAboutPage] = useState<ContentPageRow | null>(null);
  const [guidelinesPage, setGuidelinesPage] = useState<ContentPageRow | null>(null);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [cmsError, setCmsError] = useState<string | null>(null);

  // Auth Hook check
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
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace('/login');
      else setUser(session.user);
    });
    return () => listener.subscription.unsubscribe();
  }, [router]);

  // CMS Hook loader
  useEffect(() => {
    const loadCms = async () => {
      setCmsError(null);
      const { data: settingsRow, error: sErr } = await supabase.from('app_settings').select('id,system_name,logo_url,primary_color').single();
      if (sErr) setCmsError(sErr.message);
      else setAppSettings(settingsRow as AppSettingsRow);

      const { data: pages, error: pErr } = await supabase.from('content_pages').select('id,slug,title,body,is_active').in('slug', ['about', 'guidelines']).limit(2);
      if (pErr) setCmsError((prev) => prev || pErr.message);
      else {
        const list = (pages ?? []) as ContentPageRow[];
        setAboutPage(list.find((x) => x.slug === 'about' && x.is_active) ?? null);
        setGuidelinesPage(list.find((x) => x.slug === 'guidelines' && x.is_active) ?? null);
      }

      const { data: faqRows, error: fErr } = await supabase.from('faqs').select('id,question,answer,is_active').eq('is_active', true).order('id', { ascending: false }).limit(20);
      if (fErr) setCmsError((prev) => prev || fErr.message);
      else setFaqs((faqRows ?? []) as FaqRow[]);
    };
    loadCms();
  }, []);

  // Previews Hooks
  useEffect(() => {
    if (!dancerVideo) { setPreviewDancer(null); return; }
    const url = URL.createObjectURL(dancerVideo);
    setPreviewDancer(url);
    return () => URL.revokeObjectURL(url);
  }, [dancerVideo]);

  useEffect(() => {
    if (!choreoVideo) { setPreviewChoreo(null); return; }
    const url = URL.createObjectURL(choreoVideo);
    setPreviewChoreo(url);
    return () => URL.revokeObjectURL(url);
  }, [choreoVideo]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-')) localStorage.removeItem(key);
    });
    router.replace('/login');
  };

  const handleListFiles = async () => {
    if (!user) { setStatus('Please log in to view files.'); return; }
    try {
      const { data, error } = await supabase.storage.from('videos').list(user.id, { limit: 100 });
      if (error) throw error;
      setStatus(data.map(f => f.name).length > 0 ? 'Files retrieved.' : 'No files found.');
    } catch (err) {
      console.error(err);
      setStatus('Failed to list files.');
    }
  };

  const handleAnalyze = async () => {
    if (!dancerVideo || !choreoVideo) {
      setStatus('Please upload both videos first.');
      return;
    }

    setLoading(true);
    setStatus('Compressing and syncing on server...');

    try {
      const formData = new FormData();
      
      formData.append('user_video', dancerVideo);
      formData.append('ref_video', choreoVideo);
      
      formData.append('ref_fps', '30');
      formData.append('user_fps', '30');
      formData.append('user_motion_fps', '30');
      formData.append('user_id', user?.id ?? '');

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        localStorage.setItem('analysis_results', JSON.stringify(result));

        const toDataUrl = (file: File): Promise<string> =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

        const dancerDataUrl = await toDataUrl(dancerVideo);
        const choreoDataUrl = await toDataUrl(choreoVideo);

        sessionStorage.setItem('dp_dancer', dancerDataUrl);
        sessionStorage.setItem('dp_choreo', choreoDataUrl);

        const { data: authData } = await supabase.auth.getSession();
        if (authData.session?.access_token) {
          sessionStorage.setItem('dp_token', authData.session.access_token);
        }

        router.push('/results');
      } else {
        setStatus(`❌ Error: ${result.message || result.details || 'Backend processing error.'}`);
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setStatus('❌ Failed to establish link to analysis engine.');
      setLoading(false);
    }
  };

  const systemName = appSettings?.system_name ?? 'DancePerfect';
  const primaryColor = appSettings?.primary_color ?? '#7C3AED';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white">
      <div className="w-full max-w-6xl flex flex-col gap-6 py-10">
        {cmsError && <p className="text-center text-sm text-red-600">CMS load warning: {cmsError}</p>}

        {/* 1. Guidelines (Top Element) */}
        {guidelinesPage && (
          <motion.div className="bg-white/60 border border-white/70 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-2" style={{ color: primaryColor }}>{guidelinesPage.title}</h2>
            <p className="text-slate-700 whitespace-pre-line text-sm leading-relaxed">{guidelinesPage.body}</p>
          </motion.div>
        )}

        {/* 2. Main Upload Processing Hub */}
        <motion.div className="bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg rounded-2xl p-8 relative">
          <AnimatePresence>
            {loading && (
              <motion.div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center rounded-2xl z-50">
                <div className="text-center">
                  <div className="animate-spin h-10 w-10 rounded-full border-4 border-gray-300 border-t-gray-700 mx-auto mb-3" />
                  <p className="text-gray-700 font-semibold">Processing & Compressing...</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button onClick={() => router.back()} className="absolute top-4 left-4 text-gray-600 hover:text-gray-800">
            <FiArrowLeft size={24} />
          </button>
          <button onClick={handleLogout} className="absolute top-4 right-4 text-red-600 hover:text-red-800">
            <FiLogOut size={24} />
          </button>

          <div className="flex items-center justify-center gap-3 mb-2">
            {appSettings?.logo_url && (
              <img src={appSettings.logo_url} alt="System Logo" className="h-10 w-10 rounded-lg object-contain border border-white/60 bg-white/60" />
            )}
            <h1 className="text-3xl font-bold text-center" style={{ color: primaryColor }}>{systemName}</h1>
          </div>

          <p className="text-slate-600 text-center mb-4">Welcome {user?.email?.split('@')[0]}</p>

          <div className="flex flex-col md:flex-row gap-8">
            <VideoUpload label="Dancer Video" preview={previewDancer} setFile={setDancerVideo} loading={loading} />
            <VideoUpload label="Choreographer Video" preview={previewChoreo} setFile={setChoreoVideo} loading={loading} />
          </div>

          {status && <p className="text-center text-gray-600 mt-3">{status}</p>}

          <div className="flex flex-col md:flex-row gap-4 justify-center mt-6">
            <motion.button whileTap={{ scale: 0.97 }} disabled={!user || loading} onClick={handleListFiles} className="text-white py-3 px-6 rounded-lg font-semibold transition" style={{ backgroundColor: primaryColor }}>
              <FiList className="inline mr-2" /> List Files
            </motion.button>
            <motion.button whileTap={{ scale: 0.97 }} disabled={loading || !user} onClick={handleAnalyze} className="text-white py-3 px-6 rounded-lg font-semibold transition" style={{ backgroundColor: primaryColor }}>
              Analyze 🎯
            </motion.button>
          </div>
        </motion.div>

        {/* 3. FAQs Section */}
        {faqs.length > 0 && (
          <motion.div className="bg-white/60 border border-white/70 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-3" style={{ color: primaryColor }}>FAQs</h2>
            <div className="space-y-3">
              {faqs.map((f) => (
                <div key={f.id} className="border border-white/70 rounded-lg p-3 bg-white/50">
                  <p className="font-semibold text-slate-800">{f.question}</p>
                  <p className="text-slate-700 whitespace-pre-line mt-1">{f.answer}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* 4. 🌟 FIXED: About Page Section (Positioned cleanly below FAQs at the very bottom) */}
        {aboutPage && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/60 border border-white/70 rounded-xl p-6"
          >
            <h2 className="text-lg font-semibold mb-2" style={{ color: primaryColor }}>{aboutPage.title}</h2>
            <p className="text-slate-700 whitespace-pre-line text-sm leading-relaxed">{aboutPage.body}</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
