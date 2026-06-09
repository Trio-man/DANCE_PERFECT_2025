'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import {
FiCornerUpLeft,
FiAlertCircle,
FiCheckCircle,
FiSave,
FiEdit2,
FiTrash2
} from 'react-icons/fi';

const supabase = createClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type FAQ = {
id: number;
question: string;
answer: string;
is_active: boolean;
};

export default function AdminFAQsPage() {
const router = useRouter();

const [role, setRole] = useState<string | null>(null);
const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [error, setError] = useState<string | null>(null);
const [success, setSuccess] = useState(false);

const [question, setQuestion] = useState('');
const [answer, setAnswer] = useState('');

const [faqs, setFaqs] = useState<FAQ[]>([]);
const [editingId, setEditingId] = useState<number | null>(null);

const loadFaqs = async () => {
const { data, error } = await supabase
.from('faqs')
.select('*')
.order('id', { ascending: false });

```
if (!error) {
  setFaqs((data ?? []) as FAQ[]);
}
```

};

useEffect(() => {
const checkAccess = async () => {
setError(null);

```
  try {
    const { data: authData } = await supabase.auth.getUser();

    if (!authData?.user) {
      router.push('/login');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    const userRole = (profile?.role || 'user').toLowerCase();

    setRole(userRole);

    if (!['super_admin', 'it_admin', 'admin'].includes(userRole)) {
      router.push('/admin');
      return;
    }

    await loadFaqs();
  } catch {
    setError('Could not verify admin access permissions.');
  } finally {
    setLoading(false);
  }
};

checkAccess();
```

}, [router]);

const handlePublish = async (e: React.FormEvent) => {
e.preventDefault();

```
if (!question.trim() || !answer.trim()) {
  setError('Please fill out both the question and the answer fields.');
  return;
}

setSaving(true);
setError(null);
setSuccess(false);

try {
  if (editingId) {
    const { error } = await supabase
      .from('faqs')
      .update({
        question: question.trim(),
        answer: answer.trim(),
      })
      .eq('id', editingId);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('faqs')
      .insert([
        {
          question: question.trim(),
          answer: answer.trim(),
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ]);

    if (error) throw error;
  }

  await loadFaqs();

  setQuestion('');
  setAnswer('');
  setEditingId(null);

  setSuccess(true);

  setTimeout(() => {
    setSuccess(false);
  }, 3000);
} catch (err: unknown) {
  const msg =
    err instanceof Error
      ? err.message
      : 'Failed to save the FAQ entry.';

  setError(msg);
} finally {
  setSaving(false);
}
```

};

const handleEdit = (faq: FAQ) => {
setQuestion(faq.question);
setAnswer(faq.answer);
setEditingId(faq.id);

```
window.scrollTo({
  top: 0,
  behavior: 'smooth',
});
```

};

const handleDelete = async (id: number) => {
const confirmed = window.confirm(
'Are you sure you want to delete this FAQ?'
);

```
if (!confirmed) return;

const { error } = await supabase
  .from('faqs')
  .delete()
  .eq('id', id);

if (!error) {
  await loadFaqs();
}
```

};

if (loading) {
return ( <div className="flex items-center justify-center py-12 text-slate-500 font-medium text-sm w-full"> <div className="animate-spin h-5 w-5 border-2 border-slate-300 border-t-slate-600 rounded-full mr-3" />
Checking permissions... </div>
);
}

return ( <div className="space-y-6 w-full max-w-3xl mx-auto p-4 md:p-6 text-slate-900">

```
  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
    <div>
      <h1 className="text-xl font-bold text-slate-900 tracking-tight">
        Manage FAQs
      </h1>
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
      {editingId ? 'FAQ updated successfully.' : 'FAQ published successfully.'}
    </div>
  )}

  <div className="bg-white border border-slate-200 rounded-xl p-5 md:p-6 shadow-sm">
    <form onSubmit={handlePublish} className="space-y-5">

      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 block">
          Question
        </label>

        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g., How long does video processing take?"
          className="w-full px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 transition-all"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 block">
          Answer
        </label>

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
              Saving...
            </>
          ) : (
            <>
              <FiSave size={14} />
              {editingId ? 'Update FAQ' : 'Publish FAQ'}
            </>
          )}
        </button>
      </div>
    </form>
  </div>

  <div className="bg-white border border-slate-200 rounded-xl p-5 md:p-6 shadow-sm">
    <h2 className="text-lg font-bold text-slate-900 mb-4">
      Existing FAQs
    </h2>

    {faqs.length === 0 ? (
      <p className="text-sm text-slate-500">
        No FAQs have been created yet.
      </p>
    ) : (
      <div className="space-y-3">
        {faqs.map((faq) => (
          <div
            key={faq.id}
            className="border border-slate-200 rounded-lg p-4"
          >
            <h3 className="font-semibold text-slate-800">
              {faq.question}
            </h3>

            <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">
              {faq.answer}
            </p>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => handleEdit(faq)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold flex items-center gap-1"
              >
                <FiEdit2 size={12} />
                Edit
              </button>

              <button
                onClick={() => handleDelete(faq.id)}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold flex items-center gap-1"
              >
                <FiTrash2 size={12} />
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>

</div>
