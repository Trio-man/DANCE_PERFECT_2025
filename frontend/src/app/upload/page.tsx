'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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

type AnalysisRun = {
  id: string;
  dancer_file: string;
  choreo_file: string;
  score?: number;
  created_at: string;
};

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
  const [runs, setRuns] = useState<AnalysisRun[]>([]);

  const [appSettings, setAppSettings] = useState<AppSettingsRow | null>(null);
  const [aboutPage, setAboutPage] = useState<ContentPageRow | null>(null);
  const [guidelinesPage, setGuidelinesPage] = useState<ContentPageRow | null>(null);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [cmsError, setCmsError] = useState<string | null>(null);

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
  // CMS LOAD
  // -------------------------
  useEffect(() => {
    const loadCms = async () => {
      setCmsError(null);

      const { data: settings } = await supabase
        .from('app_settings')
        .select('id,system_name,logo_url,primary_color')
        .single();

      setAppSettings(settings as AppSettingsRow);

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

  // -------------------------
  // LIST FILES
  // -------------------------
  const handleListFiles = async () => {
    if (!user) return;

    const { data } = await supabase.storage
      .from('videos')
      .list(user.id, { limit: 100 });

    setFiles(data || []);
  };

  // -------------------------
  // ANALYZE (STUB FOR NOW)
  // -------------------------
  const handleAnalyze = async () => {
    if (!dancerVideo || !choreoVideo) {
      setStatus('Upload both videos first.');
      return;
    }

    setLoading(true);

    setTimeout(() => {
      setStatus('Analysis complete (demo)');
      setLoading(false);

      // MOCK ANALYSIS HISTORY ENTRY
      setRuns((prev) => [
        {
          id: Date.now().toString(),
          dancer_file: dancerVideo.name,
          choreo_file: choreoVideo.name,
          score: Math.floor(Math.random() * 40 + 60),
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    }, 1500);
  };

  // -------------------------
  // LOGOUT
  // -------------------------
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen px-4 py-10 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white flex justify-center">
      <div className="w-full max-w-6xl space-y-6">

        {/* HEADER */}
        <div className="bg-white/70 p-6 rounded-xl text-center relative">
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
        </div>

        {/* GUIDELINES */}
        {guidelinesPage && (
          <div className="bg-white/60 p-5 rounded-xl">
            <h2 className="font-semibold mb-2">{guidelinesPage.title}</h2>
            <p className="whitespace-pre-line text-sm">{guidelinesPage.body}</p>
          </div>
        )}

        {/* UPLOAD */}
        <div className="bg-white/70 p-6 rounded-xl space-y-4">
          <div className="flex gap-4">
            <VideoUpload label="Dancer" preview={previewDancer} setFile={setDancerVideo} loading={loading} />
            <VideoUpload label="Choreo" preview={previewChoreo} setFile={setChoreoVideo} loading={loading} />
          </div>

          <button onClick={handleAnalyze} className="bg-purple-500 text-white px-4 py-2 rounded">
            Analyze
          </button>

          <button onClick={handleListFiles} className="ml-2 bg-gray-500 text-white px-4 py-2 rounded">
            <FiList className="inline mr-1" /> Files
          </button>

          {status && <p className="text-sm text-gray-600">{status}</p>}
        </div>

        {/* FILES */}
        {files.length > 0 && (
          <div className="bg-white/60 p-5 rounded-xl">
            <h3 className="font-semibold mb-3">Files</h3>

            <div className="grid md:grid-cols-2 gap-4">
              {files.map((f) => (
                <div key={f.name} className="bg-white p-3 rounded border">
                  <p className="truncate">{f.name}</p>
                  <video src={getPublicUrl(f.name)} controls className="w-full mt-2" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ANALYSIS HISTORY DASHBOARD */}
        {runs.length > 0 && (
          <div className="bg-white/60 p-5 rounded-xl">
            <h3 className="font-semibold mb-3">Analysis History 🧠</h3>

            <div className="space-y-2">
              {runs.map((r) => (
                <div key={r.id} className="bg-white p-3 rounded border flex justify-between">
                  <div>
                    <p className="text-sm">{r.dancer_file} vs {r.choreo_file}</p>
                    <p className="text-xs text-gray-500">{r.created_at}</p>
                  </div>

                  <div className="font-bold text-purple-600">
                    {r.score}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ABOUT */}
        {aboutPage && (
          <div className="bg-white/60 p-5 rounded-xl">
            <h2 className="font-semibold">{aboutPage.title}</h2>
            <p className="text-sm whitespace-pre-line">{aboutPage.body}</p>
          </div>
        )}

        {/* FAQ */}
        {faqs.length > 0 && (
          <div className="bg-white/60 p-5 rounded-xl">
            <h2 className="font-semibold mb-2">FAQs</h2>
            {faqs.map((f) => (
              <div key={f.id} className="mb-2">
                <p className="font-medium">{f.question}</p>
                <p className="text-sm text-gray-600">{f.answer}</p>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

// -------------------------
// UPLOAD COMPONENT
// -------------------------
function VideoUpload({ label, preview, setFile, loading }: VideoUploadProps) {
  return preview ? (
    <video src={preview} controls className="w-full h-40 object-contain" />
  ) : (
    <label className="flex-1 border h-40 flex flex-col items-center justify-center cursor-pointer">
      <FiUploadCloud />
      <span>{label}</span>
      <input type="file" hidden accept="video/*" disabled={loading}
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
    </label>
  );
}
