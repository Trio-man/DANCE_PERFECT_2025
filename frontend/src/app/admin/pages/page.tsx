'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { FiFileText, FiAlertCircle, FiSave, FiCornerUpLeft, FiToggleLeft, FiCheckCircle } from 'react-icons/fi';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ContentPage = {
  id: number;
  slug: string;
  title: string;
  body: string;
  is_active: boolean;
};

export default function AdminContentPages() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [selected, setSelected] = useState<ContentPage | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) return router.push('/login');

      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      const r = (prof?.role || 'user').toLowerCase();
      setRole(r);
      if (!['super_admin', 'it_admin'].includes(r)) return router.push('/admin');

      const { data, error } = await supabase
        .from('content_pages')
        .select('id,slug,title,body,is_active')
        .order('slug', { ascending: true });

      if (error) return setError(error.message);

      const list = (data ?? []) as ContentPage[];
      setPages(list);
      setSelected(list[0] ?? null);
    };

    load();
  }, [router]);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    const { error } = await supabase
      .from('content_pages')
      .update({
        title: selected.title,
        body: selected.body,
        is_active: selected.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selected.id);

    if (error) {
      setError(error.message);
    } else {
      setSaveSuccess(true);
      // Auto-hide success badge after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    }
    setSaving(false);

    // refresh list UI
    setPages((prev) => prev.map((p) => (p.id === selected.id ? selected : p)));
  };

  if (pages.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 font-medium text-sm">
        <div className="animate-spin h-5 w-5 border-2 border-slate-300 border-t-slate-600 rounded-full mr-3" />
        Loading static content indices...
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      
      {/* Upper Context Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Content Pages Manager</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Modify structural information copy blocks and visibility across localized system routes.
          </p>
        </div>
        <button
          onClick={() => router.push('/admin')}
          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all"
        >
          <FiCornerUpLeft size={14} />
          Back to Dashboard
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-100 text-rose-800 rounded-xl p-3.5 text-sm font-medium flex items-center gap-2">
          <FiAlertCircle className="text-rose-500 shrink-0" size={16} />
          {error}
        </div>
      )}

      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-3.5 text-sm font-medium flex items-center gap-2 transition-all">
          <FiCheckCircle className="text-emerald-500 shrink-0" size={16} />
          Content page structure committed successfully.
        </div>
      )}

      {/* Main Structural Workspace Mapping */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        
        {/* Left Side Content Directories Stack */}
        <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-3 space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
            Page Directories
          </h3>
          <div className="space-y-1">
            {pages.map((p) => {
              const isCurrent = selected?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelected(p);
                    setSaveSuccess(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all border flex items-center justify-between gap-2 ${
                    isCurrent
                      ? 'bg-white border-slate-200 text-violet-700 shadow-sm'
                      : 'bg-transparent border-transparent text-slate-600 hover:bg-white/50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FiFileText size={14} className={isCurrent ? 'text-violet-500' : 'text-slate-400'} />
                    <span className="truncate">{p.slug}</span>
                  </div>
                  {!p.is_active && (
                    <span className="text-[10px] uppercase font-extrabold bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded text-rose-600 tracking-wide shrink-0">
                      Disabled
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Active Panel Management Node */}
        {selected ? (
          <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-5 md:p-6 shadow-sm space-y-4">
            
            {/* Header Readout */}
            <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Route Mapping</span>
                <h2 className="text-sm font-bold text-slate-800 mt-0.5">/{selected.slug}</h2>
              </div>
            </div>

            {/* Title Entry */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Page Headline Title</label>
              <input
                type="text"
                value={selected.title}
                onChange={(e) => setSelected({ ...selected, title: e.target.value })}
                className="w-full px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:ring-0 transition-all"
                placeholder="Specify administrative interface page title..."
              />
            </div>

            {/* Content Body Editor */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Body Content Payload</label>
              <textarea
                value={selected.body}
                onChange={(e) => setSelected({ ...selected, body: e.target.value })}
                className="w-full px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:ring-0 transition-all font-mono leading-relaxed resize-none"
                style={{ height: '280px' }}
                placeholder="Provide internal framework body context elements..."
              />
            </div>

            {/* Activation Logic */}
            <div className="pt-2">
              <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selected.is_active}
                  onChange={(e) => setSelected({ ...selected, is_active: e.target.checked })}
                  className="rounded border-slate-300 text-violet-600 focus:ring-0 focus:ring-offset-0 h-4 w-4 cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-800">Publish Production Path</span>
                  <span className="text-[11px] text-slate-400 font-normal">Allow users to access this route link container publicly.</span>
                </div>
              </label>
            </div>

            {/* Commit Request Trigger */}
            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:bg-slate-300 text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all"
              >
                {saving ? (
                  <>
                    <div className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full" />
                    Committing Matrix Changes...
                  </>
                ) : (
                  <>
                    <FiSave size={14} />
                    Save Changes
                  </>
                )}
              </button>
            </div>

          </div>
        ) : (
          <div className="md:col-span-2 border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs font-medium">
            Select a target index entry form from the tracking catalog layout.
          </div>
        )}

      </div>
    </div>
  );
}
