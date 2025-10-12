'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, Session, User } from '@supabase/supabase-js';
import './upload.css'; // plain CSS import

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function UploadPage() {
  const [user, setUser] = useState<User | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) router.push('/login');
      else setUser(data.user);
    };
    checkUser();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      if (!session?.user) router.push('/login');
      else setUser(session.user);
    });

    return () => listener.subscription.unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
  };

  const handleUpload = async () => {
    if (!file || !user) {
      setMessage('Please select a file and log in first.');
      return;
    }
    const filePath = `${user.id}/${encodeURIComponent(file.name)}`;
    const { error } = await supabase.storage.from('videos').upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
    });
    if (error) setMessage(error.message);
    else setMessage('File uploaded successfully!');
  };

  return (
    <div className="uploadCard">
      <h2>Welcome {user?.email}</h2>
      <input
        type="file"
        accept="video/*"
        onChange={handleFileChange}
        className="fileInput"
      />
      <button onClick={handleUpload} className="uploadButton">Upload Video</button>
      <button onClick={handleLogout} className="logoutButton">Logout</button>
      {message && <p className="message">{message}</p>}
    </div>
  );
}
