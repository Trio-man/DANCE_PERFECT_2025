"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Page() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [user, setUser] = useState<any>(null);
  const [message, setMessage] = useState("");

  const handleSignup = async () => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) setMessage(error.message);
    else {
      setUser(data.user);
      setMessage("Signed up successfully!");
    }
  };

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    else {
      setUser(data.user);
      setMessage("Logged in successfully!");
    }
  };

  const handleUpload = async () => {
    if (!file || !user) {
      setMessage("Please login and select a file first.");
      return;
    }

    const filePath = `${user.id}/${file.name}`;
    const { error } = await supabase.storage.from("videos").upload(filePath, file);

    if (error) setMessage(error.message);
    else setMessage("File uploaded successfully!");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-blue-500 to-blue-700 p-6">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-blue-600 mb-6">
          DancePerfect Portal
        </h1>

        {!user ? (
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 mb-4 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 mb-6 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
            />
            <div className="flex justify-between">
              <button
                onClick={handleLogin}
                className="w-[48%] bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Login
              </button>
              <button
                onClick={handleSignup}
                className="w-[48%] bg-white border border-blue-600 text-blue-600 py-2 rounded-lg hover:bg-blue-50 transition"
              >
                Sign Up
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-center text-black mb-4">
              Welcome, <span className="font-semibold">{user.email}</span>
            </p>
            
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full p-2 mb-4 border border-blue-300 rounded-lg focus:outline-none text-black"
            />
            <button
              onClick={handleUpload}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Upload Video
            </button>
          </div>
        )}

        {message && (
          <p className="text-center mt-4 text-sm text-black font-medium">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
