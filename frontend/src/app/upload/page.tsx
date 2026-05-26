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

type AppSettingsRow = { id: number; system_name: string; logo_url: string | null; primary_color: string; };
type ContentPageRow = { id: number; slug: string; title: string; body: string; is_active: boolean; };
type FaqRow = { id: number; question: string; answer: string; is_active: boolean; };

function FaqItem({ faq }: { faq: FaqRow }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border border-slate-200/60 rounded-xl bg-white/50 overflow-hidden transition-all duration-200 hover:bg-white/80">
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-4 text-left font-semibold text-slate-800 text-sm md:text-base gap-2">
        <span>{faq.question}</span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <FiChevronDown className="text-slate-500" size={18} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
            <p className="p-4 pt-0 text-slate-600 whitespace-pre-line text-xs md:text-sm border-t border-slate-100/50 leading-relaxed">{faq.answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VideoUpload({ label, file, preview, setFile, loading }: { label: string, file: File | null, preview: string | null, setFile: (f: File | null) => void, loading: boolean }) {
  if (preview) {
    return (
      <motion.div className="flex-1 border border-slate-200 rounded-2xl p-4 bg-white/90 shadow-sm relative">
        <button type="button" onClick={() => setFile(null)} disabled={loading} className="absolute top-3 right-3 z-10 bg-slate-900 text-white rounded-full p-1.5 shadow-md hover:bg-red-600 transition-colors"><FiX size={14} /></button>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 text-center">{label}</h2>
        <div className="w-full h-44 md:h-72 rounded-xl overflow-hidden border bg-slate-950"><video src={preview} controls className="w-full h-full object-contain" /></div>
      </motion.div>
    );
  }
  return (
    <motion.label className="flex-1 flex flex-col items-center justify-center w-full h-44 md:h-72 border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-all bg-white/50 shadow-sm group">
      <div className="p-4 bg-white rounded-2xl shadow-sm border"><FiUploadCloud size={32} className="text-slate-400" /></div>
      <span className="mt-4 font-semibold text-slate-700 text-sm">Upload {label}</span>
      <input type="file" accept="video/*" className="hidden" disabled={loading} onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} />
    </motion.label>
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
  const [status, setStatus] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettingsRow | null>(null);
  const [aboutPage, setAboutPage] = useState<ContentPageRow | null>(null);
  const [guidelinesPage, setGuidelinesPage] = useState<ContentPageRow | null>(null);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);

  const isAdmin = ['super_admin', 'it_admin'].includes(userRole);
  const primaryColor = appSettings?.primary_color ?? '#4b0082';

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      setUser(user);
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      setUserRole((profile?.role || 'user').toLowerCase().trim());
      const { data: s } = await supabase.from('app_settings').select('*').single();
      if (s) setAppSettings(s as AppSettingsRow);
      const { data: p } = await supabase.from('content_pages').select('*').in('slug', ['about', 'guidelines']);
      if (p) { setAboutPage(p.find(x => x.slug === 'about') ?? null); setGuidelinesPage(p.find(x => x.slug === 'guidelines') ?? null); }
      const { data: f } = await supabase.from('faqs').select('*').eq('is_active', true);
      if (f) setFaqs(f as FaqRow[]);
    };
    init();
  }, [router]);

  useEffect(() => {
    if (dancerVideo) { const u = URL.createObjectURL(dancerVideo); setPreviewDancer(u); return () => URL.revokeObjectURL(u); }
  }, [dancerVideo]);

  useEffect(() => {
    if (choreoVideo) { const u = URL.createObjectURL(choreoVideo); setPreviewChoreo(u); return () => URL.revokeObjectURL(u); }
  }, [choreoVideo]);

  const handleLogout = async () => { await supabase.auth.signOut(); router.replace('/login'); };

  const handleAnalyze = async () => {
    if (!dancerVideo || !choreoVideo) { setStatus('Please upload both videos.'); return; }
    setLoading(true);
    setStatus('Processing...');
    // Add your existing analysis fetch call here...
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        <motion.div className="bg-white/80 backdrop-blur-xl border border-white shadow-xl rounded-3xl p-8">
          <div className="flex justify-between items-center mb-8">
            <button onClick={() => router.back()} className="p-2 bg-slate-100 rounded-xl"><FiArrowLeft size={20} /></button>
            <div className="flex gap-2">
              {isAdmin && <button onClick={() => router.push('/admin')} className="px-4 py-2 bg-white border rounded-xl text-sm font-bold flex items-center gap-2"><MdAdminPanelSettings className="text-violet-500" />Admin</button>}
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-600"><FiLogOut size={20} /></button>
            </div>
          </div>
          <div className="text-center mb-8">
            {appSettings?.logo_url && <div className="relative h-14 w-14 mx-auto mb-4"><Image src={appSettings.logo_url} alt="Logo" fill className="rounded-2xl object-contain bg-white" /></div>}
            <h1 className="text-4xl font-black" style={{ color: primaryColor }}>{appSettings?.system_name ?? 'DancePerfect'}</h1>
            <p className="text-slate-500 font-medium">Your personal dance buddy. 🕺✨</p>
          </div>
          <div className="flex flex-col md:flex-row gap-6">
            <VideoUpload label="Dancer Video" file={dancerVideo} preview={previewDancer} setFile={setDancerVideo} loading={loading} />
            <VideoUpload label="Choreographer Video" file={choreoVideo} preview={previewChoreo} setFile={setChoreoVideo} loading={loading} />
          </div>
          <button onClick={handleAnalyze} disabled={loading} className="w-full mt-8 py-4 rounded-xl font-bold text-white shadow-lg" style={{ backgroundColor: primaryColor }}>Analyze Performance</button>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="md:col-span-3 flex flex-col gap-6">
            {guidelinesPage && <div className="bg-white/70 border p-6 rounded-2xl"><div className="flex items-center gap-2 mb-3 font-bold"><FiFileText className="text-violet-500" />{guidelinesPage.title}</div><p className="text-sm text-slate-600">{guidelinesPage.body}</p></div>}
            {aboutPage && <div className="bg-white/70 border p-6 rounded-2xl"><div className="flex items-center gap-2 mb-3 font-bold"><FiInfo className="text-violet-500" />{aboutPage.title}</div><p className="text-sm text-slate-600">{aboutPage.body}</p></div>}
          </div>
          {faqs.length > 0 && <div className="md:col-span-2 bg-white/70 border p-6 rounded-2xl"><div className="flex items-center gap-2 mb-4 font-bold"><FiHelpCircle className="text-violet-500" />FAQ</div><div className="space-y-2">{faqs.map(f => <FaqItem key={f.id} faq={f} />)}</div></div>}
        </div>
      </div>
    </div>
  );
}
