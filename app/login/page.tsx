"use client";
import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debug, setDebug] = useState("");

  const login = async () => {
    setLoading(true);
    setError("");
    setDebug("");
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      setDebug(`URL: ${url?.substring(0, 30)}... KEY: ${key?.substring(0, 20)}...`);
      const supabase = createClient(url!, key!);
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(`Error: ${authError.message}`);
        setLoading(false);
        return;
      }
      window.location.href = "/admin";
    } catch (e: unknown) {
      setError(`Exception: ${e instanceof Error ? e.message : String(e)}`);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1115] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#14171C] border border-[#C9A227]/20 rounded-xl p-10">
        <h1 className="text-2xl font-bold text-[#E5E7EB] mb-8 text-center">AgroGestión Pro 2.8</h1>
        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#0F1115] border border-[#2D3139] focus:border-[#C9A227] focus:outline-none rounded-lg px-4 py-3 text-[#E5E7EB] text-sm"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[#0F1115] border border-[#2D3139] focus:border-[#C9A227] focus:outline-none rounded-lg px-4 py-3 text-[#E5E7EB] text-sm"
          />
          <button
            onClick={login}
            disabled={loading}
            className="w-full bg-[#C9A227] text-[#0F1115] font-bold py-3 rounded-lg"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
          {debug && <p className="text-yellow-400 text-xs break-all">{debug}</p>}
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      </div>
    </div>
  );
}
