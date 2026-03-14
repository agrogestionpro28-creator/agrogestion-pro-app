"use client";
import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const login = async () => {
    setMsg("Conectando...");
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setMsg(error.message); return; }
      if (data.user) {
        const { data: u } = await supabase.from("usuarios").select("rol").eq("auth_id", data.user.id).single();
        window.location.href = "/" + (u?.rol ?? "productor");
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Error desconocido");
    }
  };

  return (
    <main className="min-h-screen bg-[#0F1115] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#14171C] rounded-xl p-10 border border-yellow-600/20">
        <h1 className="text-2xl font-bold text-white text-center mb-2">AgroGestión Pro</h1>
        <p className="text-yellow-500 text-xs text-center mb-8 tracking-widest">VERSIÓN 2.8</p>
        <div className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="bg-[#0F1115] border border-gray-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-yellow-500"
          />
          <input
            type="password"
            placeholder="Con
