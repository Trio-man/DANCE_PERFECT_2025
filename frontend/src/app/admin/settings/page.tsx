'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image';

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
    }

    setSaving(false);
  };

  if (!row) {
    return <div style={{ padding: 40 }}>Loading settings...</div>;
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>System Settings</h1>

      <p>Role: {role}</p>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div style={{ marginTop: 20 }}>
        <label>System Name</label>
        <br />

        <input
          value={row.system_name}
          onChange={(e) =>
            setRow({
              ...row,
              system_name: e.target.value,
            })
          }
          style={{ width: 360 }}
        />
      </div>

      <div style={{ marginTop: 20 }}>
        <label>Upload Logo</label>
        <br />

        {row.logo_url && (
          <div style={{ marginBottom: 10, position: 'relative', width: 120, height: 120 }}>
            <Image
              src={row.logo_url}
              alt="Logo"
              width={120}
              height={120}
              style={{
                objectFit: 'contain',
                border: '1px solid #ccc',
                padding: 10,
                borderRadius: 10,
              }}
              unoptimized // Keeps it direct from your Supabase storage CDN bucket seamlessly
            />
          </div>
        )}

        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];

            if (!file) return;

            try {
              setSaving(true);
              setError(null);

              const fileExt = file.name.split('.').pop();
              const fileName = `logo-${Date.now()}.${fileExt}`;

              const { error: uploadError } = await supabase.storage
                .from('logos')
                .upload(fileName, file, {
                  upsert: true,
                });

              if (uploadError) {
                setError(uploadError.message);
                setSaving(false);
                return;
              }

              const { data } = supabase.storage
                .from('logos')
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

      <div style={{ marginTop: 20 }}>
        <label>Primary Color (hex)</label>
        <br />

        <input
          value={row.primary_color}
          onChange={(e) =>
            setRow({
              ...row,
              primary_color: e.target.value,
            })
          }
          style={{ width: 140 }}
          placeholder="#7C3AED"
        />
      </div>

      <button
        onClick={save}
        disabled={saving}
        style={{ marginTop: 24 }}
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>

      <div style={{ marginTop: 20 }}>
        <button onClick={() => router.push('/admin')}>
          Back
        </button>
      </div>
    </div>
  );
}
