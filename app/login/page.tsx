"use client";
import { useState } from "react";
import Image from "next/image";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const login = async () => {
    setMsg("Conectando...");
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { setMsg(error.message); return; }
      if (data.user) {
        const { data: u } = await sb.from("usuarios").select("rol").eq("auth_id", data.user.id).single();
        window.location.href = "/" + (u?.rol ?? "productor");
      }
    } catch (e) {
      setMsg("Error de conexion");
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">

      {/* Fondo */}
      <div className="absolute inset-0 z-0">
        <Image src="/login-bg.png" alt="Campo" fill style={{ objectFit: "cover" }} priority />
        <div className="absolute inset-0 bg-black/30" />
      </div>

      {/* Contenido */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-6">

        {/* Logo */}
        <div className="mb-8">
          <Image src="/logo.png" alt="AgroGestión PRO" width={280} height={140} priority />
        </div>

        {/* Form */}
        <div className="w-full bg-white/90 backdrop-blur-sm rounded-2xl px-6 py-6 shadow-2xl">
          <div className="flex flex-col gap-4">

            <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-200">
              <span className="text-gray-400">👤</span>
              <input
                type="email"
                placeholder="Usuario"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="flex-1 bg-transparent text-gray-700 placeholder-gray-400 text-sm focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-200">
              <span className="text-gray-400">🔑</span>
              <input
                type="password"
                placeholder="Clave"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && login()}
                className="flex-1 bg-transparent text-gray-700 placeholder-gray-400 text-sm focus:outline-none"
              />
            </div>

            {msg && (
              <p className="text-xs text-center" style={{ color: msg === "Conectando..." ? "#6B7280" : "#EF4444" }}>
                {msg}
              </p>
            )}

            <button
              onClick={login}
              className="w-full bg-[#2D7A2D] hover:bg-[#236B23] text-white font-bold py-4 rounded-xl text-lg transition-colors shadow-lg"
            >
              Ingresar
            </button>

            <p className="text-center text-sm text-gray-500 hover:text-gray-700 cursor-pointer transition-colors">
              ¿Olvidaste tu clave?
            </p>
          </div>
        </div>

        <p className="mt-6 text-white/40 text-xs tracking-widest">© AgroGestión PRO</p>
      </div>
    </div>
  );
}
