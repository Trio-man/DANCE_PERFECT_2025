'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type FaqRow = {
  id: number;
  question: string;
  answer: string;
  is_active: boolean;
  updated_at?: string;
};

export default function AdminFaqsPage() {
  const router = useRouter();

  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FaqRow[]>([]);
  const [selected, setSelected] = useState<FaqRow | null>(null);

  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');

  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) {
        router.push('/login');
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      if (profErr) {
        setError(profErr.message);
        setLoading(false);
        return;
      }

      const r = (prof?.role || 'user').toLowerCase();
      setRole(r);
      if (!['super_admin', 'it_admin'].includes(r)) {
        return;
      }

      const { data, error } = await supabase
        .from('faqs')
        .select('id,question,answer,is_active,updated_at')
        .order('id', { ascending: false })
        .limit(300);

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const list = (data ?? []) as FaqRow[];
      setRows(list);
      setSelected(list[0] ?? null);
      setLoading(false);
    };

    load();
  }, [router]);

  const addFaq = async () => {
    if (!newQ.trim() || !newA.trim()) {
      setError('Please provide both question and answer.');
      return;
    }

    setError(null);
    setSaving(true);

    const { data, error } = await supabase
      .from('faqs')
      .insert([
        {
          question: newQ.trim(),
          answer: newA.trim(),
          is_active: true,
          updated_at: new Date().toISOString(),
        },
      ])
      .select('id,question,answer,is_active,updated_at')
      .single();

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    const inserted = data as FaqRow;
    setRows((prev) => [inserted, ...prev]);
    setSelected(inserted);
    setNewQ('');
    setNewA('');
    setSaving(false);
  };

  const saveSelected = async () => {
    if (!selected) return;

    setError(null);
    setWorkingId(selected.id);
    setSaving(true);

    const { error } = await supabase
      .from('faqs')
      .update({
        question: selected.question,
        answer: selected.answer,
        is_active: selected.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selected.id);

    if (error) {
      setError(error.message);
      setSaving(false);
      setWorkingId(null);
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === selected.id ? selected : r)));
    setSaving(false);
    setWorkingId(null);
  };

  const disableFaq = async (id: number) => {
    const ok = window.confirm(
      'Disable this FAQ?\n\nIt will be hidden from users (no deletion).'
    );
    if (!ok) return;

    setError(null);
    setWorkingId(id);

    const { error } = await supabase
      .from('faqs')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      setError(error.message);
      setWorkingId(null);
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: false } : r)));
    setSelected((prev) => (prev?.id === id ? { ...prev, is_active: false } : prev));
    setWorkingId(null);
  };

  const activateFaq = async (id: number) => {
    const ok = window.confirm('Activate this FAQ?');
    if (!ok) return;

    setError(null);
    setWorkingId(id);

    const { error } = await supabase
      .from('faqs')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      setError(error.message);
      setWorkingId(null);
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: true } : r)));
    setSelected((prev) => (prev?.id === id ? { ...prev, is_active: true } : prev));
    setWorkingId(null);
  };

  if (loading) return <div style={{ padding: 40 }}>Loading FAQs...</div>;

  return (
    <div style={{ padding: 40 }}>
      <h1>FAQs Management</h1>
      <p>Role: {role}</p>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div style={{ marginTop: 20, border: '1px solid #ccc', padding: 16 }}>
        <h3>Add New FAQ</h3>
        <div style={{ marginTop: 10 }}>
          <label>Question</label>
          <br />
          <input
            value={newQ}
            onChange={(e) => setNewQ(e.target.value)}
            style={{ width: '100%' }}
            placeholder="Type question..."
          />
        </div>
        <div style={{ marginTop: 10 }}>
          <label>Answer</label>
          <br />
          <textarea
            value={newA}
            onChange={(e) => setNewA(e.target.value)}
            style={{ width: '100%', height: 90 }}
            placeholder="Type answer..."
          />
        </div>

        <button onClick={addFaq} disabled={saving} style={{ marginTop: 12 }}>
          {saving ? 'Adding...' : 'Add FAQ'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 24, marginTop: 24 }}>
        <div style={{ width: 360 }}>
          <h3>FAQ List</h3>
          {rows.length === 0 ? (
            <p>No FAQs yet.</p>
          ) : (
            rows.map((r) => (
              <div key={r.id} style={{ marginBottom: 8 }}>
                <button onClick={() => setSelected(r)} style={{ width: '100%', textAlign: 'left' }}>
                  #{r.id} {r.is_active ? '' : '(disabled)'}
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {r.question.length > 50 ? r.question.slice(0, 50) + '…' : r.question}
                  </div>
                </button>
              </div>
            ))
          )}
        </div>

        <div style={{ flex: 1 }}>
          <h3>Edit Selected</h3>
          {!selected ? (
            <p>Select an FAQ to edit.</p>
          ) : (
            <>
              <p>
                <b>ID:</b> {selected.id}
              </p>
              <p>
                <b>Status:</b> {selected.is_active ? 'Active' : 'Disabled'}
              </p>

              <div style={{ marginTop: 10 }}>
                <label>Question</label>
                <br />
                <input
                  value={selected.question}
                  onChange={(e) => setSelected({ ...selected, question: e.target.value })}
                  style={{ width: '100%' }}
                  disabled={saving}
                />
              </div>

              <div style={{ marginTop: 10 }}>
                <label>Answer</label>
                <br />
                <textarea
                  value={selected.answer}
                  onChange={(e) => setSelected({ ...selected, answer: e.target.value })}
                  style={{ width: '100%', height: 140 }}
                  disabled={saving}
                />
              </div>

              <div style={{ marginTop: 10 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.is_active}
                    onChange={(e) => setSelected({ ...selected, is_active: e.target.checked })}
                    disabled={saving}
                  />{' '}
                  Active
                </label>
              </div>

              <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                <button onClick={saveSelected} disabled={saving || workingId === selected.id}>
                  {saving || workingId === selected.id ? 'Saving...' : 'Save'}
                </button>

                {selected.is_active ? (
                  <button
                    onClick={() => disableFaq(selected.id)}
                    disabled={workingId === selected.id}
                  >
                    {workingId === selected.id ? 'Working...' : 'Disable'}
                  </button>
                ) : (
                  <button
                    onClick={() => activateFaq(selected.id)}
                    disabled={workingId === selected.id}
                  >
                    {workingId === selected.id ? 'Working...' : 'Activate'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <button onClick={() => router.push('/admin')}>Back</button>
      </div>
    </div>
  );
}
