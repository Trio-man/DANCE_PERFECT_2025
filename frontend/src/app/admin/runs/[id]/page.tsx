'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
    detected_deviations?: Array<{
      body_part: string;
      user_start_frame: number;
      gif_path?: string;
    }>;
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

        // Check explicit elevated authorization clearance bounds
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

        // Fetch Targeted Analytics Matrix from analysis_runs
        const { data: runData, error: runError } = await supabase
          .from('analysis_runs')
          .select('*')
          .eq('id', runId)
          .single();

        if (runError) throw runError;
        const finalizedRun = runData as RunRow;
        setRun(finalizedRun);

        // Fetch information about the user who owns this run
        if (finalizedRun?.user_id) {
          const { data: userData } = await supabase
            .from('profiles')
            .select('email, role')
            .eq('id', finalizedRun.user_id)
            .single();
          if (userData) setUserProfile(userData as UserProfile);
        }

      } catch (err: any) {
        setError(err.message || 'Error processing database query pipelines.');
      } finally {
        setLoading(false);
      }
    };

    if (runId) loadRunDetails();
  }, [runId, router]);

  if (loading) return <div style={{ padding: 40, fontFamily: 'sans-serif', color: '#6b7280' }}>Loading motion tracking vectors...</div>;
  if (error || !run) {
    return (
      <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
        <div style={{ padding: 16, backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 6 }}>
          {error || 'The requested analysis session run profile was not located.'}
        </div>
        <button onClick={() => router.push('/admin')} style={{ marginTop: 16 }}>Back to Safety</button>
      </div>
    );
  }

  // Parse out deviation matrices from JSON
  const parsedJson = typeof run.result_json === 'string' ? JSON.parse(run.result_json) : run.result_json;
  const deviations = parsedJson?.detected_deviations || [];

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif', backgroundColor: '#f9fafb', minHeight: '100vh', color: '#111827' }}>
      
      {/* Top Controls Hub */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, borderBottom: '1px solid #e5e7eb', paddingBottom: 20 }}>
        <div>
          <span style={{ fontSize: '13px', textTransform: 'uppercase', fontWeight: 600, color: '#4f46e5', letterSpacing: '0.05em' }}>Inspection Terminal</span>
          <h1 style={{ margin: '4px 0 0 0', fontSize: '28px', fontWeight: 700 }}>Run Detailed Analytics</h1>
        </div>
        <button 
          onClick={() => router.push('/admin')}
          style={{ padding: '10px 18px', borderRadius: 6, border: '1px solid #d1d5db', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 500, fontSize: '14px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
        >
          ← Back to Admin Control
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 32 }}>
        
        {/* Left Side Column: Session Run Metadata Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ backgroundColor: '#fff', padding: 24, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', borderBottom: '1px solid #f3f4f6', paddingBottom: 10, color: '#374151' }}>Session Specifications</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '14px' }}>
              <p style={{ margin: 0 }}><b style={{ color: '#6b7280' }}>Target User:</b> <span style={{ fontWeight: 500 }}>{userProfile?.email || run.user_id}</span></p>
              <p style={{ margin: 0 }}><b style={{ color: '#6b7280' }}>Status Flags:</b> 
                <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 12, fontSize: '11px', fontWeight: 600, backgroundColor: run.status === 'success' ? '#dcfce7' : '#fee2e2', color: run.status === 'success' ? '#15803d' : '#991b1b' }}>
                  {run.status || 'PENDING'}
                </span>
              </p>
              <p style={{ margin: 0 }}><b style={{ color: '#6b7280' }}>Captured Time:</b> <span>{new Date(run.created_at).toLocaleString()}</span></p>
              <p style={{ margin: 0 }}><b style={{ color: '#6b7280' }}>DTW Vector Error:</b> <span style={{ fontFamily: 'monospace' }}>{parsedJson?.dtw_distance ? Number(parsedJson.dtw_distance).toFixed(2) : '—'}</span></p>
              
              <div style={{ marginTop: 12, padding: 16, backgroundColor: '#f8fafc', borderRadius: 6, border: '1px solid #f1f5f9', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Performance Index</div>
                <div style={{ fontSize: '36px', fontWeight: 800, color: (run.score ?? 0) >= 80 ? '#16a34a' : (run.score ?? 0) >= 50 ? '#d97706' : '#dc2626' }}>
                  {run.score !== null ? `${run.score}%` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Text Summary Insight Module */}
          <div style={{ backgroundColor: '#fff', padding: 24, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#374151' }}>Automated AI Summary</h3>
            <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#4b5563', backgroundColor: '#f9fafb', padding: 14, borderRadius: 6, border: '1px solid #f3f4f6', fontStyle: 'italic' }}>
              "{run.summary_feedback || 'No automated evaluation text was written for this execution block.'}"
            </div>
          </div>
        </div>

        {/* Right Side Column: User Visual Breakdown Feed (Matches your UI Layout perfectly) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h2 style={{ fontSize: '20px', margin: '0 0 4px 0', fontWeight: 600 }}>Visual Breakdown Moments</h2>
          
          {deviations.length === 0 ? (
            <div style={{ backgroundColor: '#fff', padding: 40, borderRadius: 8, border: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280' }}>
              No critical skeletal posture standard deviations recorded for this run.
            </div>
          ) : (
            deviations.map((dev: any, index: number) => {
              // Points safely over to your global public static folder destination path
              const absoluteGifUrl = dev.gif_path ? `/deviation_gifs/${dev.gif_path}` : null;

              return (
                <div key={index} style={{ display: 'flex', backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  
                  {/* Left Frame Window Container */}
                  <div style={{ width: '45%', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '220px', position: 'relative' }}>
                    {absoluteGifUrl ? (
                      <img 
                        src={absoluteGifUrl} 
                        alt={dev.body_part} 
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onError={(e) => {
                          // Failover rendering logic if paths misalign
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div style={{ color: '#4b5563', fontSize: '13px' }}>Rendering Frame Preview Vector</div>
                    )}
                  </div>

                  {/* Right Description Content Panel */}
                  <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: '#fff' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Moment Rank #{index + 1}
                    </span>
                    <h4 style={{ margin: '6px 0 10px 0', fontSize: '17px', fontWeight: 700, lineHeight: '1.3', color: '#111827' }}>
                      Incorrect {dev.body_part} position sequence.
                    </h4>
                    
                    <div style={{ padding: '12px 14px', backgroundColor: '#faf5ff', border: '1px solid #f3e8ff', borderRadius: 6, color: '#6b21a8', fontSize: '13px', fontStyle: 'italic', marginBottom: 14 }}>
                      "Adjust your {dev.body_part} tracking to match the reference guide."
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                      <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#9ca3af' }}>
                        FRAME REFERENCE: [#{dev.user_start_frame}]
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 600, color: '#9333ea', backgroundColor: '#f3e8ff', padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase' }}>
                        AI Processed
                      </span>
                    </div>
                  </div>

                </div>
              );
            })
          )}

          {/* Technical Native JSON Inspector */}
          <details style={{ marginTop: 20, backgroundColor: '#f1f5f9', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <summary style={{ padding: '12px 16px', fontWeight: 600, fontSize: '14px', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>
              Open Raw Matrix System Inspector (`result_json`)
            </summary>
            <pre style={{ margin: 0, padding: 16, backgroundColor: '#0f172a', color: '#38bdf8', fontSize: '12px', overflowX: 'auto', fontFamily: 'monospace', maxHeight: '300px' }}>
              {JSON.stringify(parsedJson, null, 2)}
            </pre>
          </details>

        </div>
      </div>
    </div>
  );
}
