'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, Session } from '@supabase/supabase-js';
import './signup.css'; // plain CSS import

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) router.push('/upload');
    };
    checkUser();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      if (session?.user) router.push('/upload');
    });

    return () => listener.subscription.unsubscribe();
  }, [router]);

  const handleSignup = async () => {
    setMessage('');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setMessage(error.message);
    else setMessage('Signup successful! Check your email to confirm.');
  };

  return (
    <div className="authCard">
      <h2>Sign Up</h2>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="authInput"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        className="authInput"
      />
      <button onClick={handleSignup} className="authButton">Sign Up</button>
      {message && <p className="message">{message}</p>}
      <p>Already have an account? <a href="/login">Login here</a></p>
    </div>
  );
}
