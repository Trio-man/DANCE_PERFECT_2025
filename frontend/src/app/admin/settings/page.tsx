'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image';
import { FiAlertCircle, FiCheckCircle, FiUploadCloud, FiSave, FiCornerUpLeft, FiLayers } from 'react-icons/fi';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AppSettingsRow = {
  id: number;
  system_name: string;
  logo_url: string | null;
  primary_color: string;
};

export default function AdminSettingsPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [row, setRow] = useState<AppSettingsRow | null>(null);
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

      if (!['super_admin', 'it_admin'].includes(r)) {
        return router.push('/admin');
      }

      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .single();

      if (error) {
        setError(error.message);
        return;
      }

      setRow(data as AppSettingsRow);
    };

    load();
  }, [router]);

  const save = async () => {
    if (!row) return;

    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    const { error } = await supabase
      .from('app_settings')
      .update({
        system_name: row.system_name,
        logo_url: row.logo_url,
        primary_color: row.primary_color,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (error) {
      setError(error.message);
    } else {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }

    setSaving(false);
  };

  if (!row) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 font-medium text-sm w-full">
        <div className="animate-spin h-5 w-5 border-2 border-slate-300 border-t-slate-600 rounded-full mr-3" />
        Loading system control configuration environment...
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto p-4 md:p-6 text-slate-900">
      
      {/* Upper Context Header Linkage */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">System Settings</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Modify structural platform identities, logo asset allocations, and global primary layout branding.
          </p>
        </div>
        <button
          onClick={() => router.push('/admin')}
          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all w-full sm:w-auto justify-center"
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
          Application environment configurations committed successfully.
        </div>
      )}

      {/* Main Framework Form Card Wrapper */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 md:p-6 shadow-sm space-y-6">
        
        {/* Core Profile Parameters Division */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-100">
          
          {/* System Name Inputs Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">System Environment Name</label>
            <input
              type="text"
              value={row.system_name}
              onChange={(e) => setRow({ ...row, system_name: e.target.value })}
              className="w-full px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 transition-all"
              placeholder="Application branding title..."
            />
            <span className="text-[10px] text-slate-400 block font-normal leading-normal">
              Changes the structural title values rendered across browser tabs and ecosystem modules.
            </span>
          </div>

          {/* Core Primary Color Mapping Layout */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Branding Primary Color Hex</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={row.primary_color}
                  onChange={(e) => setRow({ ...row, primary_color: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 transition-all"
                  placeholder="#7C3AED"
                />
                <div 
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded border border-black/10 shadow-xs pointer-events-none"
                  style={{ backgroundColor: row.primary_color || '#7C3AED' }}
                />
              </div>
              <input 
                type="color" 
                value={row.primary_color?.startsWith('#') && row.primary_color.length === 7 ? row.primary_color : '#7C3AED'} 
                onChange={(e) => setRow({ ...row, primary_color: e.target.value })}
                className="w-8 h-8 rounded-lg border border-slate-200 p-0 cursor-pointer bg-transparent overflow-hidden shrink-0"
              />
            </div>
            <span className="text-[10px] text-slate-400 block font-normal leading-normal">
              Main structural color token parameter utilized by interactive UI layouts.
            </span>
          </div>

        </div>

        {/* Global Logo Content File Assets Box */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block">Identity Brand Mark Logo</label>
            <span className="text-[10px] text-slate-400 block font-normal mt-0.5">
              Manage internal platform graphic files deployed from isolated storage buckets.
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-5 items-start bg-slate-50/50 border border-slate-200/60 p-4 rounded-xl">
            
            {/* Left Conditional Image Container View */}
            {row.logo_url && (
              <div className="bg-white border border-slate-200 p-3 rounded-lg flex items-center justify-center shadow-xs shrink-0 mx-auto sm:mx-0 w-32 h-32 relative">
                <div className="relative w-full h-full">
                  <Image
                    src={row.logo_url}
                    alt="Application Framework Logo"
                    fill
                    sizes="128px"
                    className="object-contain"
                    unoptimized 
                  />
                </div>
              </div>
            )}

            {/* Right Standard Action Interactive File Node Wrapper */}
            <div className="flex-1 space-y-2 w-full">
              <div className="border border-dashed border-slate-200 hover:border-slate-300 bg-white rounded-lg p-5 transition-colors relative flex flex-col items-center justify-center text-center group cursor-pointer">
                <FiUploadCloud size={24} className="text-slate-400 group-hover:text-slate-600 transition-colors mb-1.5" />
                <span className="text-xs font-bold text-slate-700">Upload replacement graphic asset</span>
                <span className="text-[10px] text-slate-400 font-medium mt-0.5">Accepts PNG, JPG, or SVG image file structures</span>
                
                <input
                  type="file"
                  accept="image/*"
                  disabled={saving}
                  className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    try {
                      setSaving(true);
                      setError(null);

                      // 1. AUTOMATIC AUTO-CLEAN: Prune legacy records if existing URL maps matching bucket values
                      if (row.logo_url) {
                        try {
                          const urlParts = row.logo_url.split('/');
                          const oldFileName = urlParts[urlParts.length - 1];
                          
                          if (oldFileName) {
                            await supabase.storage
                              .from('Logos')
                              .remove([oldFileName]);
                          }
                        } catch (deleteErr) {
                          console.error("Failed to prune old file from storage bucket:", deleteErr);
                        }
                      }

                      // 2. PROCEED WITH FRESH LOGO IMAGE UPLOAD
                      const fileExt = file.name.split('.').pop();
                      const fileName = `logo-${Date.now()}.${fileExt}`;

                      const { error: uploadError } = await supabase.storage
                        .from('Logos')
                        .upload(fileName, file, {
                          upsert: true,
                        });

                      if (uploadError) {
                        setError(uploadError.message);
                        setSaving(false);
                        return;
                      }

                      const { data } = supabase.storage
                        .from('Logos')
                        .getPublicUrl(fileName);

                      setRow({
                        ...row,
                        logo_url: data.publicUrl,
                      });

                      setSaving(false);
                    } catch (err) {
                      const errorMessage = err instanceof Error ? err.message : 'An unknown image storage fault occurred';
                      setError(errorMessage);
                      setSaving(false);
                    }
                  }}
                />
              </div>
              
              {row.logo_url && (
                <div className="text-[10px] text-slate-400 font-mono break-all line-clamp-1">
                  <span className="font-bold text-slate-500">CDN URL Location:</span> {row.logo_url}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Action Triggers Global Commit Bar */}
        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="w-full sm:w-auto px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:bg-slate-300 text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all"
          >
            {saving ? (
              <>
                <div className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full" />
                Processing Assets Layout...
              </>
            ) : (
              <>
                <FiSave size={14} />
                Save Settings
              </>
            )}
          </button>
        </div>

      </div>

    </div>
  );
}
