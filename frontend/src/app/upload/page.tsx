'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient, User } from '@supabase/supabase-js';
import { FiArrowLeft, FiLogOut, FiUploadCloud, FiX, FiChevronDown, FiFileText, FiInfo, FiHelpCircle } from 'react-icons/fi';
import { MdAdminPanelSettings } from 'react-icons/md';

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
// INTERACTIVE FAQ ACCORDION COMPONENT
// ─────────────────────────────────────────────
function FaqItem({ faq }: { faq: FaqRow }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-slate-200/60 rounded-xl bg-white/50 overflow-hidden transition-all duration-200 hover:bg-white/80">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left font-semibold text-slate-800 text-sm md:text-base gap-2"
      >
        <span>{faq.question}</span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <FiChevronDown className="text-slate-500" size={18} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <p className="p-4 pt-0 text-slate-600 whitespace-pre-line text-xs md:text-sm border-t border-slate-100/50 leading-relaxed">
              {faq.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────
// PREMIUM VIDEO UPLOAD COMPONENT
// ─────────────────────────────────────────────
interface VideoUploadProps {
  label: string;
  file: File | null;
  preview: string | null;
  setFile: (file: File | null) => void;
  loading: boolean;
}

function VideoUpload({ label, file, preview, setFile, loading }: VideoUploadProps) {
  if (preview) {
    return (
      <motion.div
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex-1 border border-slate-200 rounded-2xl p-4 bg-white/90 shadow-sm relative"
      >
        <button
          type="button"
          onClick={() => setFile(null)}
          disabled={loading}
          className="absolute top-3 right-3 z-10 bg-slate-900 text-white rounded-full p-1.5 shadow-md hover:bg-red-600 transition-colors duration-200"
          title="Remove video"
        >
          <FiX size={14} />
        </button>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 text-center">{label}</h2>
        <div className="w-full h-44 md:h-72 rounded-xl overflow-hidden border border-slate-200 bg-slate-950 shadow-inner">
          <video src={preview} controls className="w-full h-full object-contain" />
        </div>
        {file && (
          <div className="mt-3 flex items-center justify-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-xs text-slate-600 font-medium">
            <span className="truncate max-w-full text-center">Selected: {file.name}</span>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.label
      whileHover={{ scale: 1.01, y: -2 }}
      whileTap={{ scale: 0.99 }}
      className="flex-1 flex flex-col items-center justify-center w-full h-44 md:h-72 border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-all duration-200 bg-white/50 shadow-sm group"
    >
      <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 group-hover:scale-105 transition-transform duration-200">
        <FiUploadCloud size={32} className="text-slate-400 group-hover:text-violet-500 transition-colors" />
      </div>
      <span className="mt-4 font-semibold text-slate-700 text-sm md:text-base">Upload {label}</span>
      <span className="mt-1 text-xs text-slate-400 px-4 text-center">Drag and drop or click to browse files</span>
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
// MAIN UPLOAD PAGE HUB
// ─────────────────────────────────────────────
export default function UploadPage() {
  const router = useRouter();

  // Auth States
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string>('user');

  // Video Buffers & File Hooks
  const [dancerVideo, setDancerVideo] = useState<File | null>(null);
  const [choreoVideo, setChoreoVideo] = useState<File | null>(null);
  const [previewDancer, setPreviewDancer] = useState<string | null>(null);
  const [previewChoreo, setPreviewChoreo] = useState<string | null>(null);

  // Layout Controls
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // CMS Repositories
  const [appSettings, setAppSettings] = useState<AppSettingsRow | null>(null);
  const [aboutPage, setAboutPage] = useState<ContentPageRow | null>(null);
  const [guidelinesPage, setGuidelinesPage] = useState<ContentPageRow | null>(null);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [cmsError, setCmsError] = useState<string | null>(null);

  const isAdmin = ['super_admin', 'it_admin'].includes(userRole);

  // Authentication Context Mount Hooks
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace('/login');
      } else {
        setUser(data.user);

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single();
        setUserRole((profile?.role || 'user').toLowerCase().trim());
      }
    };
    checkUser();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace('/login');
      else setUser(session.user);
    });
    return () => listener.subscription.unsubscribe();
  }, [router]);

  // CMS Settings Integration Fetch Hooks
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

  // Object Blob Cleaners
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
    <div className="min-h-screen flex flex-col items-center justify-start px-4 md:px-8 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white antialiased selection:bg-violet-200">
      <div className="w-full max-w-5xl flex flex-col gap-8 py-8 md:py-12">
        
        {cmsError && <p className="text-center text-xs bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-100">{cmsError}</p>}

        {/* ─── 1. CORE COMPRESSION ANALYSIS HUB CARD ─── */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 backdrop-blur-xl border border-white shadow-xl shadow-slate-200/50 rounded-3xl p-5 md:p-8 relative"
        >
          <AnimatePresence>
            {loading && (
              <motion.div className="absolute inset-0 bg-white/80 backdrop-blur-md flex items-center justify-center rounded-3xl z-50">
                <div className="text-center">
                  <div className="animate-spin h-10 w-10 rounded-full border-4 border-slate-200 border-t-slate-800 mx-auto mb-4" />
                  <p className="text-slate-800 font-bold text-base tracking-wide">Processing & Compressing...</p>
                  <p className="text-slate-400 text-xs mt-1">Please keep this browser tab open</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* APPLICATION NAVIGATION SUBBAR */}
          <div className="flex items-center justify-between mb-8 w-full">
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.back()} 
              className="text-slate-500 hover:text-slate-800 transition-colors p-2 rounded-xl bg-slate-100/60 hover:bg-slate-100"
              aria-label="Go back"
            >
              <FiArrowLeft size={20} />
            </motion.button>

            <div className="flex items-center gap-3">
              {isAdmin && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => router.push('/admin')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs md:text-sm font-semibold shadow-sm transition-all"
                >
                  <MdAdminPanelSettings size={18} className="text-violet-500" />
                  Admin Dashboard
                </motion.button>
              )}
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleLogout} 
                className="text-slate-400 hover:text-red-600 transition-colors p-2 rounded-xl bg-slate-100/60 hover:bg-red-50"
                title="Logout"
              >
                <FiLogOut size={20} />
              </motion.button>
            </div>
          </div>

          {/* BRAND IDENTITY IDENTIFIER CONTAINER */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="flex items-center justify-center gap-3 mb-2">
              {appSettings?.logo_url && (
                <img 
                  src={appSettings.logo_url} 
                  alt="System Logo" 
                  className="h-12 w-12 rounded-xl object-contain shadow-sm border border-slate-100" 
                />
              )}
              <h1 className="text-3xl md:text-4xl font-black tracking-tight" style={{ color: primaryColor }}>
                {systemName}
              </h1>
            </div>
            <p className="text-sm md:text-base text-slate-500 font-medium max-w-sm">
              Your personal dance buddy. 🕺✨
            </p>
          </div>

          {/* SECURE IDENTITY ACCOUNT NOTIFICATION BADGE */}
          <div className="text-center mb-8">
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-4 py-1.5 rounded-full border border-slate-200/40 shadow-inner">
              Welcome back, <span className="text-violet-600 font-bold">{user?.email?.split('@')[0]}</span>
            </span>
          </div>

          {/* FILE PROCESSING INPUT LAYOUT MODULES */}
          <div className="flex flex-col md:flex-row gap-6">
            <VideoUpload label="Dancer Video" file={dancerVideo} preview={previewDancer} setFile={setDancerVideo} loading={loading} />
            <VideoUpload label="Choreographer Video" file={choreoVideo} preview={previewChoreo} setFile={setChoreoVideo} loading={loading} />
          </div>

          {status && (
            <p className="text-center text-slate-600 mt-6 font-medium text-xs md:text-sm bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-4 w-fit mx-auto">
              {status}
            </p>
          )}

          {/* CENTRAL COMMAND SUBMIT INTERRUPTER */}
          <div className="flex justify-center mt-8">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={loading || !user}
              onClick={handleAnalyze}
              className="text-white py-3.5 px-12 rounded-xl font-bold transition shadow-lg shadow-violet-200 w-full sm:w-auto text-base tracking-wide active:shadow-none"
              style={{ backgroundColor: primaryColor }}
            >
              Analyze Performance
            </motion.button>
          </div>
        </motion.div>

        {/* ─── 2. DESKTOP 2-COLUMN SIDEBAR GRID (RESOURCES) ─── */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-start">
          
          {/* LEFT COLUMN: GUIDELINES & ABOUT DOCUMENT BLOCKS (3/5 width) */}
          <div className="md:col-span-3 flex flex-col gap-6">
            {guidelinesPage && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white/70 border border-white shadow-sm rounded-2xl p-6"
              >
                <div className="flex items-center gap-2 mb-3">
                  <FiFileText className="text-violet-500" size={20} />
                  <h2 className="text-base md:text-lg font-bold text-slate-800">{guidelinesPage.title}</h2>
                </div>
                <p className="text-slate-600 whitespace-pre-line text-xs md:text-sm leading-relaxed">{guidelinesPage.body}</p>
              </motion.div>
            )}

            {aboutPage && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white/70 border border-white shadow-sm rounded-2xl p-6"
              >
                <div className="flex items-center gap-2 mb-3">
                  <FiInfo className="text-violet-500" size={20} />
                  <h2 className="text-base md:text-lg font-bold text-slate-800">{aboutPage.title}</h2>
                </div>
                <p className="text-slate-600 whitespace-pre-line text-xs md:text-sm leading-relaxed">{aboutPage.body}</p>
              </motion.div>
            )}
          </div>

          {/* RIGHT COLUMN: ACCORDION LIST EXPANDER INTERFACE (2/5 width) */}
          {faqs.length > 0 && (
            <div className="md:col-span-2 bg-white/70 border border-white shadow-sm rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-1">
                <FiHelpCircle className="text-violet-500" size={20} />
                <h2 className="text-base md:text-lg font-bold text-slate-800">Frequently Asked Questions</h2>
              </div>
              <div className="space-y-2.5">
                {faqs.map((f) => (
                  <FaqItem key={f.id} faq={f} />
                ))}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
