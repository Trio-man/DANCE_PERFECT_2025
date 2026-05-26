'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { FiHelpCircle, FiAlertCircle, FiCheckCircle, FiPlus, FiSave, FiEyeOff, FiCheck, FiCornerUpLeft } from 'react-icons/fi';

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

  // New FAQ inputs
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');
  const [isAddingOpen, setIsAddingOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
        router.push('/admin');
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

  const triggerNotification = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const addFaq = async () => {
    if (!newQ.trim() || !newA.trim()) {
      setError('Please provide both question and answer before publishing.');
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
    setIsAddingOpen(false);
    triggerNotification('New FAQ item published successfully.');
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
    triggerNotification('FAQ update changes successfully saved.');
  };

  const disableFaq = async (id: number) => {
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
    triggerNotification('FAQ item hidden from public users.');
  };

  const activateFaq = async (id: number) => {
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
    triggerNotification('FAQ item activated publicly.');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 font-medium text-sm">
        <div className="animate-spin h-5 w-5 border-2 border-slate-300 border-t-slate-600 rounded-full mr-3" />
        Loading context question maps...
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      
      {/* Upper Section Title Readout */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Help Center FAQs</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure, deploy, and refine the knowledge base structures displayed to public accounts.
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

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-3.5 text-sm font-medium flex items-center gap-2 transition-all">
          <FiCheckCircle className="text-emerald-500 shrink-0" size={16} />
          {successMessage}
        </div>
      )}

      {/* EXPANDABLE CREATION FORM COMPONENT */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <button
          onClick={() => setIsAddingOpen(!isAddingOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/50 hover:bg-slate-50 text-left transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="p-1 bg-violet-50 text-violet-600 rounded-md border border-violet-100">
              <FiPlus size={14} />
            </div>
            <span className="text-xs font-bold text-slate-800">Deploy New Knowledge Base Entry</span>
          </div>
          <span className="text-xs text-slate-400 font-bold">{isAddingOpen ? 'Collapse —' : 'Expand +'}</span>
        </button>

        {isAddingOpen && (
          <div className="p-4 border-t border-slate-100 space-y-4 bg-white">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Question Title Text</label>
              <input
                value={newQ}
                onChange={(e) => setNewQ(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 transition-all"
                placeholder="What query statement are users selecting?"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Exploratory Solution Answer</label>
              <textarea
                value={newA}
                onChange={(e) => setNewA(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 transition-all font-sans leading-relaxed resize-none h-24"
                placeholder="Provide direct, detailed answers here..."
              />
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={addFaq}
                disabled={saving}
                className="px-3 py-1.5 bg-slate-900 text-white font-bold text-xs rounded-lg hover:bg-slate-800 disabled:bg-slate-300 transition-colors shadow-xs"
              >
                {saving ? 'Processing Entry...' : 'Publish Knowledge Block'}
              </button>
