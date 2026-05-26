'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { FiCornerUpLeft, FiActivity, FiAlertTriangle, FiCpu, FiFileText, FiLayers } from 'react-icons/fi';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type DeviationSegment = {
  body_part: string;
  user_start_frame: number;
  gif_path?: string;
};

type RunRow = {
  id: string;
  user_id: string;
  created_at: string;
  status: string | null;
  score: number | null;
  summary_feedback: string | null;
  run_folder: string | null;
  result_json: {
    dtw_distance?: number;
    detected_deviations?: DeviationSegment[];
  } | null;
};

type UserProfile = {
  email: string;
  role: string;
};

export default function AdminRunDetailPage() {
  const router = useRouter();
  const params = useParams();
  const runId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<RunRow | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRunDetails = async () => {
      try {
        setError(null);
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) return router.push('/login');

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authData.user.id)
          .single();

        const role = (profile?.role || 'user').toLowerCase();
        const isAdmin = ['admin', 'super_admin', 'it_admin'].includes(role);

        if (!isAdmin) {
          return router.push('/upload');
        }

        const { data: runData, error: runError } = await supabase
          .from('analysis_runs')
          .select('*')
          .eq('id', runId)
          .single();

        if (runError) throw runError;
        const finalizedRun = runData as RunRow;
        setRun(finalizedRun);

        if (finalizedRun?.user_id) {
          const { data: userData } = await supabase
            .from('profiles')
            .select('email, role')
            .eq('id', finalizedRun.user_id)
            .single();
          if (userData) setUserProfile(userData as UserProfile);
        }

      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Error processing database query pipelines.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (runId) loadRunDetails();
  }, [runId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 font-medium text-sm w-full">
        <div className="animate-spin h-5 w-5 border-2 border-slate-300 border-t-slate-600 rounded-full mr-3" />
        Loading motion tracking vectors...
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="space-y-4 max-w-xl mx-auto py-8 p-4">
        <div className="bg-rose-50 border border-rose-100 text-rose-800 rounded-xl p-4 text-xs font-medium flex items-center gap-2">
          <FiAlertTriangle className="text-rose-500 shrink-0" size={16} />
          {error || 'The requested analysis session run profile was not located.'}
        </div>
        <button 
          onClick={() => router.push('/admin')} 
          className="w-full py-2 bg-slate-900 text-white rounded-lg text-xs font-bold transition-all shadow-sm hover:bg-slate-800"
        >
          Return to Dashboard Control
        </button>
      </div>
    );
  }

  const parsedJson = typeof run.result_json === 'string' ? JSON.parse(run.result_json) : run.result_json;
  const deviations: DeviationSegment[] = parsedJson?.detected_deviations || [];

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto text-slate-900 p-4 md:p-6">
      
      {/* Top Navigation Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <span className="text-[10px] uppercase font-bold text-indigo-600 tracking-widest block font-mono">Inspection Terminal</span>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Run Detailed Analytics</h1>
        </div>
        <button
          onClick={() => router.push('/admin')}
          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all w-full sm:w-auto justify-center"
        >
          <FiCornerUpLeft size={14} />
          Back to Admin Control
        </button>
      </div>

      {/* Main Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left Specification Deck */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Metadata Frame Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-50 pb-2.5">
              <FiActivity size={14} className="text-slate-500" />
              Session Specifications
            </h3>
            
            <div className="space-y-3 text-xs font-medium">
              <div className="flex justify-between items-center gap-4 py-1 border-b border-slate-50/50">
                <span className="text-slate-400">Target User:</span>
                <span className="text-slate-800 font-bold max-w-[180px] truncate">{userProfile?.email || run.user_id}</span>
              </div>
              <div className="flex justify-between items-center gap-4 py-1 border-b border-slate-50/50">
                <span className="text-slate-400">Status Flags:</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                  run.status === 'success' || run.status === 'done'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    : 'bg-rose-50 text-rose-700 border border-rose-100'
                }`}>
                  {run.status || 'PENDING'}
                </span>
              </div>
              <div className="flex justify-between items-center gap-4 py-1 border-b border-slate-50/50">
                <span className="text-slate-400">Captured Time:</span>
                <span className="text-slate-600 font-mono text-[11px]">{new Date(run.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center gap-4 py-1">
                <span className="text-slate-400">DTW Vector Error:</span>
                <span className="text-slate-800 font-mono font-bold">
                  {parsedJson?.dtw_distance ? Number(parsedJson.dtw_distance).toFixed(2) : '—'}
                </span>
              </div>
              
              {/* Performance Score Badge */}
              <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-100 text-center space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Performance Index</div>
                <div className={`text-3xl font-black tracking-tighter ${
                  (run.score ?? 0) >= 80 ? 'text-emerald-600' : 
                  (run.score ?? 0) >= 50 ? 'text-amber-500' : 'text-rose-500'
                }`}>
                  {run.score !== null ? `${run.score}%` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* AI Narrative Summary Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <FiFileText size={14} className="text-slate-500" />
              Automated AI Summary
            </h3>
            <div className="text-xs font-medium leading-relaxed text-slate-600 bg-slate-50/70 border border-slate-100 p-3.5 rounded-lg italic">
              &ldquo;{run.summary_feedback || 'No automated evaluation text was written for this execution block.'}&rdquo;
            </div>
          </div>

        </div>

        {/* Right Execution Deviations Array Box */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-2 mb-1">
            <FiLayers className="text-slate-400" />
            Visual Breakdown Moments
          </h2>
          
          {deviations.length === 0 ? (
            <div className="bg-white border border-slate-200 p-12 rounded-xl text-center text-xs text-slate-400 font-medium">
              No critical skeletal posture standard deviations recorded for this run.
            </div>
          ) : (
            deviations.map((dev, index) => {
              const absoluteGifUrl = dev.gif_path ? `/deviation_gifs/${dev.gif_path}` : null;

              return (
                <div key={index} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs flex flex-col sm:flex-row group transition-all hover:border-slate-300">
                  
                  {/* Left Aspect Media Viewer Container */}
                  <div className="sm:w-[42%] bg-slate-950 flex items-center justify-center min-h-[180px] sm:min-h-[200px] relative border-b sm:border-b-0 sm:border-r border-slate-100">
                    {absoluteGifUrl ? (
                      <img 
                        src={absoluteGifUrl} 
                        alt={dev.body_part} 
                        className="w-full h-full object-contain absolute inset-0 p-1"
                        loading="lazy"
                      />
                    ) : (
                      <div className="text-slate-500 font-mono text-[10px] font-bold uppercase tracking-wide flex items-center gap-1.5">
                        <FiCpu className="animate-pulse" size={12} />
                        Rendering Preview Vector
                      </div>
                    )}
                  </div>

                  {/* Right Core Text Parameters Description */}
                  <div className="flex-1 p-5 flex flex-col justify-between space-y-4 bg-white">
                    <div className="space-y-2">
                      <span className="text-[9px] font-extrabold text-indigo-600 uppercase tracking-widest block font-mono">
                        Moment Rank #{index + 1}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 tracking-tight leading-snug">
                        Incorrect <span className="text-indigo-600 underline decoration-indigo-200 decoration-2 underline-offset-2">{dev.body_part}</span> position sequence.
                      </h4>
                      
                      <div className="p-2.5 bg-purple-50/50 border border-purple-100/60 rounded-lg text-xs text-purple-900/90 font-medium italic">
                        &ldquo;Adjust your {dev.body_part} tracking to match the reference guide.&rdquo;
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-50 flex items-center justify-between text-[10px] font-bold">
                      <span className="font-mono text-slate-400 tracking-wider">
                        FRAME REFERENCE: <span className="text-slate-600">[#{dev.user_start_frame}]</span>
                      </span>
                      <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md uppercase text-[9px] border border-purple-100/40 tracking-wider">
                        AI Processed
                      </span>
                    </div>
                  </div>

                </div>
              );
            })
          )}

          {/* Raw System JSON Matrix Inspector */}
          <details className="group border border-slate-200 bg-white rounded-xl overflow-hidden transition-all shadow-2xs">
            <summary className="p-3.5 font-bold text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50/80 cursor-pointer select-none flex items-center justify-between transition-colors">
              <span>Open Raw Matrix System Inspector (`result_json`)</span>
              <span className="text-slate-400 text-[10px] font-mono group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="border-t border-slate-100 p-4 bg-slate-950">
              <pre className="text-[11px] font-mono font-medium text-sky-400 overflow-x-auto max-h-72 leading-relaxed selection:bg-slate-800">
                {JSON.stringify(parsedJson, null, 2)}
              </pre>
            </div>
          </details>

        </div>
      </div>
    </div>
  );
}
