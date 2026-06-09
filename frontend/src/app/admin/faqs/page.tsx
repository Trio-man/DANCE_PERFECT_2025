'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { FiCornerUpLeft, FiAlertCircle, FiCheckCircle, FiSave } from 'react-icons/fi';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminFAQsPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [category, setCategory] = useState('General');

  useEffect(() => {
    const checkAccess = async () => {
      setError(null);
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) return router.push('/login');

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authData.user.id)
          .single();

        const userRole = (profile?.role || 'user').toLowerCase();
        setRole(userRole);

        if (!['super_admin', 'it_admin', 'admin'].includes(userRole)) {
          return router.push('/admin');
        }
      } catch (err) {
        setError('Could not verify admin access permissions.');
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [router]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) {
      setError('Please fill out both the question and the answer fields.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const { error: insertError } = await supabase
        .from('faqs')
        .insert([
          {
            question: question.trim(),
            answer: answer.trim(),
            category: category,
            created_at: new Date().toISOString()
          }
        ]);

      if (insertError) throw insertError;

      setSuccess(true);
      setQuestion('');
      setAnswer('');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save the FAQ entry.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 font-medium text-sm w-full">
        <div className="animate-spin h-5 w-5 border-2 border-slate-300 border-t-slate-600 rounded-full mr-3" />
        Checking permissions...
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto p-4 md:p-6 text-slate-900">
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Manage FAQs</h1>
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

      {success && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-3.5 text-sm font-medium flex items-center gap-2">
          <FiCheckCircle className="text-emerald-500 shrink-0" size={16} />
          FAQ article published successfully.
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 md:p-6 shadow-sm">
        <form onSubmit={handlePublish} className="space-y-5">
          
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 transition-all cursor-pointer"
            >
                <option value="Uploading">Video Uploads</option>
                <option value="Recording">Recording Guidelines</option>
                <option value="Analysis">Motion Analysis</option>
                <option value="Results">Results & Feedback</option>
                <option value="Technical">Technical Issues</option>
                <option value="General">General Information</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Question</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g., How long does video processing take?"
              className="w-full px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">Answer</label>
            <textarea
              rows={5}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Write a clear, helpful response for users..."
              className="w-full px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 transition-all resize-none leading-relaxed"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:bg-slate-300 text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-all"
            >
              {saving ? (
                <>
                  <div className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full" />
                  Saving entry...
                </>
              ) : (
                <>
                  <FiSave size={14} />
                  Publish FAQ
                </>
              )}
            </button>
          </div>

        </form>
      </div>

    </div>
  );
}
