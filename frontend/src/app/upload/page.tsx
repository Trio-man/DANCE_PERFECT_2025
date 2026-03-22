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

type Visuals = {
  reference?: {
    preview_images?: string[];
    overlay_video?: string;
  };
  user?: {
    preview_images?: string[];
    overlay_video?: string;
  };
};

type ResultType = {
  score?: number;
  feedback?: { summary?: string };
  visuals?: Visuals;
  message?: string;
  comparison?: any;
  deviation_comparison_images?: string[];
  pose_match_comparison_images?: string[];
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

export default function UploadPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [dancerVideo, setDancerVideo] = useState<File | null>(null);
  const [choreoVideo, setChoreoVideo] = useState<File | null>(null);

  const [previewDancer, setPreviewDancer] = useState<string | null>(null);
  const [previewChoreo, setPreviewChoreo] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<ResultType | null>(null);

  const [displayName, setDisplayName] = useState<string>('User');
  const [userRole, setUserRole] = useState<string>('user');
  const isAdmin = userRole === 'it_admin' || userRole === 'super_admin';

  const [appSettings, setAppSettings] = useState<AppSettingsRow | null>(null);
  const [aboutPage, setAboutPage] = useState<ContentPageRow | null>(null);
  const [guidelinesPage, setGuidelinesPage] = useState<ContentPageRow | null>(null);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [cmsError, setCmsError] = useState<string | null>(null);

  const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  useEffect(() => {
    const checkUser = async () => {
      setAuthLoading(true);
      const { data } = await supabase.auth.getUser();

      if (!data.user) router.replace('/login');
      else setUser(data.user);

      setAuthLoading(false);
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

  useEffect(() => {
    const loadDisplayName = async () => {
      if (!user?.id) return;

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('display_name,email,role')
          .eq('id', user.id)
          .single();

        if (error) throw error;

        const name =
          (profile?.display_name || '').trim() ||
          (profile?.email || user.email || '').trim() ||
          'User';

        setDisplayName(name);

        const role = ((profile as any)?.role || 'user').toLowerCase().trim();
        setUserRole(role);
      } catch (e) {
        console.warn('profiles fetch failed, continuing:', e);
        setDisplayName((user.email || 'User').trim());
        setUserRole('user');
      }
    };

    loadDisplayName();
  }, [user]);

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
        .in('slug', ['about', 'guidelines'])
        .limit(2);

      if (pErr) {
        setCmsError((prev) => prev || pErr.message);
      } else {
        const list = (pages ?? []) as ContentPageRow[];
        setAboutPage(list.find((x) => x.slug === 'about' && x.is_active) || null);
        setGuidelinesPage(
          list.find((x) => x.slug === 'guidelines' && x.is_active) || null
        );
      }

      const { data: faqRows, error: fErr } = await supabase
        .from('faqs')
        .select('id,question,answer,is_active')
        .eq('is_active', true)
        .order('id', { ascending: false })
        .limit(20);

      if (fErr) setCmsError((prev) => prev || fErr.message);
      else setFaqs((faqRows ?? []) as FaqRow[]);
    };

    loadCms();
  }, []);

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

      const files = (data ?? []).map((file) => file.name);
      setStatus(files.length > 0 ? 'Files retrieved.' : 'No files found.');
    } catch (err) {
      console.error(err);
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

  const removeDancerVideo = () => {
    setDancerVideo(null);
    setPreviewDancer(null);
  };

  const removeChoreoVideo = () => {
    setChoreoVideo(null);
    setPreviewChoreo(null);
  };

  const handleAnalyze = async () => {
    if (!dancerVideo || !choreoVideo) {
      setStatus('Please upload both videos first.');
      return;
    }

    setLoading(true);
    setStatus('Uploading videos for analysis...');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('dancer_video', dancerVideo);
      formData.append('choreo_video', choreoVideo);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch(`${BACKEND_URL}/analyze`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setStatus(json?.error || 'Analysis failed.');
        setLoading(false);
        return;
      }

      try {
        sessionStorage.setItem('dp_dancer_name', dancerVideo.name);
        sessionStorage.setItem('dp_choreo_name', choreoVideo.name);
        if (token) sessionStorage.setItem('dp_token', token);
        sessionStorage.setItem('dp_result', JSON.stringify(json));
      } catch {}

      setResult(json);
      setStatus('Analysis complete!');
      router.push('/results');
    } catch (err: any) {
      console.error(err);
      setStatus(err?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const systemName = appSettings?.system_name || 'DancePerfect';
  const primaryColor = appSettings?.primary_color || '#7C3AED';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-[#d6c1ff] via-[#cde7ff] to-white animate-gradient"
    >
      <div className="w-full max-w-6xl mb-6">
        <div className="mb-8">
          {cmsError && (
            <p className="text-center text-sm text-red-600 mb-3">
              CMS load warning: {cmsError}
            </p>
          )}

          {aboutPage && (
            <div className="bg-white/60 border border-white/70 rounded-xl p-4 mb-4">
              <h2 className="text-lg font-semibold mb-2" style={{ color: primaryColor }}>
                {aboutPage.title}
              </h2>
              <p className="text-slate-700 whitespace-pre-line">{aboutPage.body}</p>
            </div>
          )}

          {guidelinesPage && (
            <div className="bg-white/60 border border-white/70 rounded-xl p-4 mb-4">
              <h2 className="text-lg font-semibold mb-2" style={{ color: primaryColor }}>
                {guidelinesPage.title}
              </h2>
              <p className="text-slate-700 whitespace-pre-line">{guidelinesPage.body}</p>
            </div>
          )}

          {faqs.length > 0 && (
            <div className="bg-white/60 border border-white/70 rounded-xl p-4">
              <h2 className="text-lg font-semibold mb-2" style={{ color: primaryColor }}>
                FAQs
              </h2>

              <div className="space-y-3">
                {faqs.map((f) => (
                  <div key={f.id} className="border border-white/70 rounded-lg p-3 bg-white/50">
                    <p className="font-semibold text-slate-800">{f.question}</p>
                    <p className="text-slate-700 whitespace-pre-line mt-1">{f.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <motion.div className="w-full max-w-6xl bg-white/70 backdrop-blur-lg border border-white/60 shadow-lg rounded-2xl p-8 relative">
        {loading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center rounded-2xl z-50">
            <div className="text-center">
              <div className="animate-spin h-10 w-10 rounded-full border-4 border-gray-300 border-t-gray-700 mx-auto mb-3" />
              <p className="text-gray-700 font-semibold">Processing...</p>
              <p className="text-gray-500 text-sm mt-1">
                Please wait while we analyze the videos.
              </p>
            </div>
          </div>
        )}

        <button
          onClick={() => router.back()}
          className="absolute top-4 left-4 text-gray-600 hover:text-gray-800"
          disabled={loading}
        >
          <FiArrowLeft size={24} />
        </button>

        {isAdmin && (
          <button
            onClick={() => router.push('/admin')}
            className="absolute top-4 right-14 text-gray-700 hover:text-gray-900 font-semibold"
            disabled={loading}
            title="Back to Admin Panel"
          >
            Admin
          </button>
        )}

        <button
          onClick={handleLogout}
          className="absolute top-4 right-4 text-red-600 hover:text-red-800"
          disabled={loading}
        >
          <FiLogOut size={24} />
        </button>

        <div className="flex items-center justify-center gap-3 mb-2">
          {appSettings?.logo_url ? (
            <img
              src={appSettings.logo_url}
              alt="System Logo"
              className="h-10 w-10 rounded-lg object-contain border border-white/60 bg-white/60"
            />
          ) : null}

          <h1 className="text-3xl font-bold text-center mb-0" style={{ color: primaryColor }}>
            {systemName}
          </h1>
        </div>

        <p className="text-slate-600 text-center mb-4">Welcome {displayName}</p>

        <div className="flex flex-col md:flex-row gap-8">
          <VideoUpload
            label="Dancer Video"
            preview={previewDancer}
            setFile={setDancerVideo}
            loading={loading}
            onRemove={removeDancerVideo}
          />
          <VideoUpload
            label="Choreographer Video"
            preview={previewChoreo}
            setFile={setChoreoVideo}
            loading={loading}
            onRemove={removeChoreoVideo}
          />
        </div>

        {status && <p className="text-center text-gray-600 mt-3">{status}</p>}

        <div className="flex flex-col md:flex-row gap-4 justify-center mt-6">
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={!user || loading}
            onClick={handleListFiles}
            className="text-white py-3 px-6 rounded-lg font-semibold transition"
            style={{ backgroundColor: primaryColor }}
          >
            <FiList className="inline mr-2" /> List Files
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={loading || !user}
            onClick={handleAnalyze}
            className="text-white py-3 px-6 rounded-lg font-semibold transition"
            style={{ backgroundColor: primaryColor }}
          >
            Analyze 🎯
          </motion.button>
        </div>

        {result?.message && (
          <div className="mt-6 bg-white/60 border border-white/70 rounded-xl p-4">
            <p className="font-semibold text-slate-800">{result.message}</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

interface VideoUploadProps {
  label: string;
  preview: string | null;
  setFile: (file: File | null) => void;
  loading: boolean;
  onRemove: () => void;
}

function VideoUpload({ label, preview, setFile, loading, onRemove }: VideoUploadProps) {
  return preview ? (
    <div className="flex-1 border rounded-xl p-6 bg-gray-50">
      <h2 className="text-lg font-semibold mb-3 text-center">{label}</h2>
      <div className="w-full h-36 md:h-80 rounded-lg overflow-hidden border border-slate-300 bg-black">
        <video src={preview} controls className="w-full h-full object-contain" />
      </div>

      <div className="flex gap-2 justify-center mt-3">
        <button
          type="button"
          onClick={onRemove}
          disabled={loading}
          className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold"
        >
          Remove
        </button>

        <label className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer">
          Change
          <input
            type="file"
            accept="video/*"
            className="hidden"
            disabled={loading}
            onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
          />
        </label>
      </div>
    </div>
  ) : (
    <label className="flex-1 flex flex-col items-center justify-center w-full h-36 md:h-80 border border-slate-300 rounded-lg cursor-pointer hover:border-gray-400">
      <FiUploadCloud size={48} className="text-gray-400" />
      <span className="mt-2 text-gray-600">Upload {label}</span>
      <input
        type="file"
        accept="video/*"
        className="hidden"
        disabled={loading}
        onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
      />
    </label>
  );
}
