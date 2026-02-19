'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

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
      if (r !== 'super_admin') return router.push('/admin');

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

    const { error } = await supabase
      .from('content_pages')
      .update({
        title: selected.title,
        body: selected.body,
        is_active: selected.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selected.id);

    if (error) setError(error.message);
    setSaving(false);

    // refresh list UI
    setPages((prev) => prev.map((p) => (p.id === selected.id ? selected : p)));
  };

  if (pages.length === 0) return <div style={{ padding: 40 }}>Loading pages...</div>;

  return (
    <div style={{ padding: 40 }}>
      <h1>Content Pages</h1>
      <p>Role: {role}</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 24, marginTop: 20 }}>
        <div>
          <h3>Pages</h3>
          {pages.map((p) => (
            <div key={p.id} style={{ marginBottom: 8 }}>
              <button onClick={() => setSelected(p)}>
                {p.slug} {p.is_active ? '' : '(disabled)'}
              </button>
            </div>
          ))}
        </div>

        {selected && (
          <div style={{ flex: 1 }}>
            <p>
              <b>Slug:</b> {selected.slug}
            </p>

            <div style={{ marginTop: 10 }}>
              <label>Title</label>
              <br />
              <input
                value={selected.title}
                onChange={(e) => setSelected({ ...selected, title: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginTop: 10 }}>
              <label>Body</label>
              <br />
              <textarea
                value={selected.body}
                onChange={(e) => setSelected({ ...selected, body: e.target.value })}
                style={{ width: '100%', height: 260 }}
              />
            </div>

            <div style={{ marginTop: 10 }}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.is_active}
                  onChange={(e) => setSelected({ ...selected, is_active: e.target.checked })}
                />{' '}
                Active
              </label>
            </div>

            <button onClick={save} disabled={saving} style={{ marginTop: 14 }}>
              {saving ? 'Saving...' : 'Save Page'}
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <button onClick={() => router.push('/admin')}>Back</button>
      </div>
    </div>
  );
}