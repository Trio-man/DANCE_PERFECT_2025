'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient, User } from '@supabase/supabase-js';
import Image from 'next/image';
import { FiArrowLeft, FiLogOut, FiUploadCloud, FiX, FiChevronDown, FiFileText, FiInfo, FiHelpCircle } from 'react-icons/fi';
import { MdAdminPanelSettings } from 'react-icons/md';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// --- Types ---
type AppSettingsRow = { id: number; system_name: string; logo_url: string | null; primary_color: string; };
type ContentPageRow = { id: number; slug: string; title: string; body: string; is_active: boolean; };
type FaqRow = { id: number; question: string; answer: string; is_active: boolean; };

// --- Components ---
function FaqItem({ faq }: { faq: FaqRow }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border border-slate-200/60 rounded-xl bg-white/50 overflow-hidden">
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-4 text-left font-semibold text-slate-800 text-sm gap-2">
        <span>{faq.question}</span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }}><FiChevronDown size={16} /></motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <p className="p-4 pt-0 text-slate-600 text-xs border-t border-slate-100/50">{faq.answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VideoUpload({ label, file, preview, setFile, loading }: { label: string; file: File | null; preview: string | null; setFile: (f: File | null) => void; loading: boolean; }) {
  if (preview) {
    return (
      <div className="flex-1 border border-slate-200 rounded-2xl p-4 bg-white/90 relative">
        <button onClick={() => setFile(null)} disabled={loading} className="absolute top-3 right-3 z-10 bg-slate-900 text-white rounded-full p-1"><FiX size={14} /></button>
        <h2 className="text-xs font-bold uppercase text-slate-400 mb-2 text-center">{label}</h2>
        <div className="w-full h-40 rounded-xl overflow-hidden bg-black"><video src={preview} controls className="w-full h-full object-contain" /></div>
      </div>
    );
  }
  return (
    <label className="flex-1 flex flex-col items-center justify-center h-40 border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer hover:border-violet-400 bg-white/50">
      <FiUploadCloud size={24} className="text-slate-400" />
      <span className="mt-2 text-sm font-semibold text-slate-700">Upload {label}</span>
      <input type="file" accept="video/*" className="hidden" disabled={loading} onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} />
    </label>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string>('user');
  const [dancerVideo, setDancerVideo] = useState<File | null>(null);
  const [choreoVideo, setChoreoVideo] = useState<File | null>(null);
  const [previewDancer, setPreviewDancer] = useState<string | null>(null);
  const [previewChoreo, setPreviewChoreo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettingsRow | null>(null);
  const [aboutPage, setAboutPage] = useState<ContentPageRow | null>(null);
  const [guidelinesPage, setGuidelinesPage] = useState<ContentPageRow | null>(null);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login');
      else {
        setUser(data.user);
        supabase.from('profiles').select('role').eq('id', data.user.id).single().then(({ data: p }) => setUserRole((p?.role || 'user').toLowerCase()));
      }
    });
    
    supabase.from('app_settings').select('*').single().then(({ data }) => setAppSettings(data));
    supabase.from('content_pages').select('*').in('slug', ['about', 'guidelines']).then(({ data }) => {
      setAboutPage(data?.find(x => x.slug === 'about') || null);
      setGuidelinesPage(data?.find(x => x.slug === 'guidelines') || null);
    });
    supabase.from('faqs').select('*').eq('is_active', true).then(({ data }) => setFaqs(data || []));
  }, [router]);

  useEffect(() => {
    if (dancerVideo) { const u = URL.createObjectURL(dancerVideo); setPreviewDancer(u); return () => URL.revokeObjectURL(u); }
    else setPreviewDancer(null);
  }, [dancerVideo]);

  useEffect(() => {
    if (choreoVideo) { const u = URL.createObjectURL(choreoVideo); setPreviewChoreo(u); return () => URL.revokeObjectURL(u); }
    else setPreviewChoreo(null);
  }, [choreoVideo]);

  const handleAnalyze = async () => {
    if (!dancerVideo || !choreoVideo) return;
    setLoading(true);
    const toDataUrl = (file: File): Promise<string> => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file); });
    sessionStorage.setItem('dp_dancer', await toDataUrl(dancerVideo));
    sessionStorage.setItem('dp_choreo', await toDataUrl(choreoVideo));
    router.push('/results');
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => router.back()} className="p-2 bg-slate-100 rounded-xl"><FiArrowLeft /></button>
            <h1 className="text-xl font-bold" style={{ color: appSettings?.primary_color }}>{appSettings?.system_name || 'DancePerfect'}</h1>
            <button onClick={() => supabase.auth.signOut()} className="p-2 text-red-500"><FiLogOut /></button>
          </div>

          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <VideoUpload label="Dancer" file={dancerVideo} preview={previewDancer} setFile={setDancerVideo} loading={loading} />
            <VideoUpload label="Choreo" file={choreoVideo} preview={previewChoreo} setFile={setChoreoVideo} loading={loading} />
          </div>

          <button disabled={loading || !dancerVideo || !choreoVideo} onClick={handleAnalyze} className="w-full py-3 rounded-xl text-white font-bold disabled:opacity-50" style={{ backgroundColor: appSettings?.primary_color || '#7C3AED' }}>
            {loading ? 'Processing...' : 'Analyze Performance'}
          </button>
        </div>

        {/* Resources Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            {guidelinesPage && <div className="bg-white p-6 rounded-2xl border border-slate-100"><h2 className="font-bold mb-2">{guidelinesPage.title}</h2><p className="text-sm text-slate-600">{guidelinesPage.body}</p></div>}
            {aboutPage && <div className="bg-white p-6 rounded-2xl border border-slate-100"><h2 className="font-bold mb-2">{aboutPage.title}</h2><p className="text-sm text-slate-600">{aboutPage.body}</p></div>}
          </div>
          <div className="space-y-4">
            <h2 className="font-bold">FAQ</h2>
            {faqs.map(f => <FaqItem key={f.id} faq={f} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
