"use client";
import { useState } from "react";
import { supabase } from "@/app/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = async () => {
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError("Email o contraseña incorrectos");
      setLoading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: usuario } = await supabase
      .from("usuarios")
      .select("rol")
      .eq("auth_id", user.id)
      .single();
    const rol = usuario?.rol ?? "productor";
    window.location.href = `/${rol}`;
  };

  return (
    <div className="min-h-screen bg-[#0F1115] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#C9A227] to-transparent" />
        <div className="bg-[#14171C] border border-[#C9A227]/20 rounded-b-xl p-10 shadow-2xl">
          <div className="text-center mb-10">
            <h1 className="text-2xl font-bold text-[#E5E7EB] tracking-wide">AgroGestión Pro</h1>
            <p className="text-[#C9A227] text-xs tracking-[0.25em] uppercase mt-1">versión 2.8</p>
          </div>
          <div className="space-y-5">
            <div>
              <label className="block text-xs text-[#9CA3AF] uppercase tracking-widest mb-2">Correo electrónico</label>
              <input
                type="email"
                placeholder="usuario@campo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0F1115] border border-[#2D3139] focus:border-[#C9A227] focus:outline-none rounded-lg px-4 py-3 text-[#E5E7EB] placeholder-[#4B5563] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] uppercase tracking-widest mb-2">Contraseña</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0F1115] border border-[#2D3139] focus:border-[#C9A227] focus:outline-none rounded-lg px-4 py-3 text-[#E5E7EB] placeholder-[#4B5563] text-sm"
              />
            </div>
            {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}
            <button
              onClick={login}
              disabled={loading}
              className="w-full bg-[#C9A227] hover:bg-[#D4AE35] disabled:opacity-50 text-[#0F1115] font-bold py-3 rounded-lg text-sm tracking-widest uppercase"
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
          </div>
        </div>
        <p className="text-center text-[#374151] text-xs mt-5 tracking-wider">PLATAFORMA DE GESTIÓN AGROPECUARIA · ARG</p>
      </div>
    </div>
  );
}
