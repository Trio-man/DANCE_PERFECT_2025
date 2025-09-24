"use client";

import React, { useState, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const Home: React.FC = () => {
  const [userVideo, setUserVideo] = useState<File | null>(null);
  const [referenceVideo, setReferenceVideo] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [progressHistory, setProgressHistory] = useState<any[]>([
    { id: '1', score: 85, feedback: 'Good alignment on the bounce, adjust left elbow at 00:02 for sharper movement.', timestamp: new Date('2025-06-18') },
    { id: '2', score: 90, feedback: 'Excellent timing on the Dougie, refine knee bend for stability.', timestamp: new Date('2025-06-17') },
  ]);
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);
  const userVideoDropRef = useRef<HTMLDivElement>(null);
  const referenceVideoDropRef = useRef<HTMLDivElement>(null);
  const [dragActiveUser, setDragActiveUser] = useState(false);
  const [dragActiveReference, setDragActiveReference] = useState(false);

  const handleDrag = (e: React.DragEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (type === 'user') setDragActiveUser(e.type === 'dragenter' || e.type === 'dragover');
    else setDragActiveReference(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && file.size <= 500 * 1024 * 1024) {
      if (type === 'user') setUserVideo(file);
      else setReferenceVideo(file);
    } else {
      alert('Video must be under 500 MB.');
    }
    if (type === 'user') setDragActiveUser(false);
    else setDragActiveReference(false);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (file && file.size <= 500 * 1024 * 1024) {
      if (type === 'user') setUserVideo(file);
      else setReferenceVideo(file);
    } else {
      alert('Video must be under 500 MB.');
    }
  };

  const mockAnalyzeVideos = () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          score: Math.floor(Math.random() * 15 + 85),
          feedback: 'Well done! Adjust your right knee angle by 5° at 00:03 and maintain hip-hop bounce rhythm.',
          jointAngles: Array(20).fill(0).map((_, i) => ({
            userKnee: 45 + Math.sin(i / 2) * 5 + Math.random(),
            referenceKnee: 47 + Math.sin(i / 2) * 3,
          })),
        });
      }, 3000);
    });
  };

  const handleSubmit = async () => {
    if (!userVideo || !referenceVideo) {
      alert('Please upload both videos.');
      return;
    }
    setLoading(true);
    try {
      const response = await mockAnalyzeVideos();
      setResults(response);
      setProgressHistory((prev) => [
        {
          id: `${prev.length + 1}`,
          score: (response as any).score,
          feedback: (response as any).feedback,
          timestamp: new Date(),
        },
        ...prev,
      ]);
    } catch (error) {
      console.error('Error analyzing videos:', error);
      alert('Analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  const chartData = results
    ? {
        labels: results.jointAngles.map((_: any, i: number) => `Frame ${i + 1}`),
        datasets: [
          {
            label: 'Your Knee Angle',
            data: results.jointAngles.map((angle: any) => angle.userKnee),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4,
            pointRadius: 2,
          },
          {
            label: 'Reference Knee Angle',
            data: results.jointAngles.map((angle: any) => angle.referenceKnee),
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            tension: 0.4,
            pointRadius: 2,
          },
        ],
      }
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col items-center p-6 relative">
      {loading && (
        <div className="absolute inset-0 bg-white bg-opacity-80 flex flex-col justify-center items-center z-50">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-700 font-semibold">Analyzing your performance...</p>
        </div>
      )}

      <h1 className="text-4xl font-extrabold mb-10 text-center text-gray-900">
        Dance<span className="text-blue-600">Perfect</span>
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl">
        {['user', 'reference'].map((type) => (
          <div
            key={type}
            ref={type === 'user' ? userVideoDropRef : referenceVideoDropRef}
            onDragEnter={(e) => handleDrag(e, type)}
            onDragLeave={(e) => handleDrag(e, type)}
            onDragOver={(e) => handleDrag(e, type)}
            onDrop={(e) => handleDrop(e, type)}
            className={`p-6 bg-white rounded-xl border-2 ${
              (type === 'user' ? dragActiveUser : dragActiveReference)
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200'
            } transition`}
          >
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              {type === 'user' ? 'Your Dance Video' : 'Reference Choreography'}
            </h2>
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
              <input
                type="file"
                accept="video/mp4,video/webm"
                onChange={(e) => handleVideoUpload(e, type)}
                className="hidden"
                id={`${type}-video`}
              />
              <label
                htmlFor={`${type}-video`}
                className="block cursor-pointer text-black font-medium text-sm"
              >
                {type === 'user' && userVideo
                  ? userVideo.name
                  : type === 'reference' && referenceVideo
                  ? referenceVideo.name
                  : 'Click or drag to upload'}
              </label>
              <p className="mt-2 text-xs text-gray-500">Supported: MP4, WebM • Max 500MB</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!userVideo || !referenceVideo || loading}
        className="mt-8 px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50"
      >
        Analyze Performance
      </button>

      {results && (
        <div className="w-full max-w-5xl mt-12 bg-white p-6 rounded-xl shadow">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Results</h2>
          <p className="text-lg mb-2">
            <strong className="text-blue-600">{results.score}%</strong> match
          </p>
          <p className="text-gray-600 mb-6">{results.feedback}</p>
          <div className="h-64">
            <Line
              data={chartData!}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  title: {
                    display: true,
                    text: 'Knee Angle Comparison',
                    font: { size: 16 },
                  },
                },
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
