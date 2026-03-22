'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) return router.push('/login');

      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      const r = (prof?.role || 'user').toLowerCase();
      setRole(r);
      if (r !== 'super_admin') return router.push('/admin');

      const { data } = await supabase.from('app_settings').select('*').single();
      setRow(data as AppSettingsRow);
    };

    load();
  }, [router]);

  // ✅ NEW: upload logo to Supabase Storage
  const handleLogoUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);

    const fileName = `logo_${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from('logos').getPublicUrl(fileName);

    setRow((prev) =>
      prev ? { ...prev, logo_url: data.publicUrl } : prev
    );

    setUploading(false);
  };

  const save = async () => {
    if (!row) return;
    setSaving(true);

    await supabase
      .from('app_settings')
      .update({
        system_name: row.system_name,
        logo_url: row.logo_url,
        primary_color: row.primary_color,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    setSaving(false);
  };

  if (!row) return <div style={{ padding: 40 }}>Loading...</div>;

  return (
    <div style={{ padding: 40 }}>
      <h1>System Settings</h1>

      <div style={{ marginTop: 20 }}>
        <label>System Name</label><br />
        <input
          value={row.system_name}
          onChange={(e) => setRow({ ...row, system_name: e.target.value })}
        />
      </div>

      {/* ✅ REPLACED: Upload instead of URL */}
      <div style={{ marginTop: 20 }}>
        <label>Upload Logo (Transparent PNG)</label><br />
        <input
          type="file"
          accept="image/png"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleLogoUpload(file);
          }}
        />

        {uploading && <p>Uploading...</p>}

        {row.logo_url && (
          <div style={{ marginTop: 10 }}>
            <img src={row.logo_url} width={80} />
          </div>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <label>Primary Color</label><br />
        <input
          value={row.primary_color}
          onChange={(e) => setRow({ ...row, primary_color: e.target.value })}
        />
      </div>

      <button onClick={save} disabled={saving}>
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}
