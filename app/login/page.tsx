"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";

export default function Login() {
  const router = useRouter();
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

    // Obtener rol del usuario
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: usuario } = await supabase
      .from("usuarios")
      .select("rol")
      .eq("auth_id", user.id)
      .single();

    // Redirigir según rol
    switch (usuario?.rol) {
      case "admin":       router.push("/admin"); break;
      case "productor":   router.push("/productor"); break;
      case "ingeniero":   router.push("/ingeniero"); break;
      case "veterinario": router.push("/veterinario"); break;
      case "empleado":    router.push("/empleado"); break;
      case "aplicador":   router.push("/aplicador"); break;
      default:            router.push("/productor");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") login();
  };

  return (
    <div className="min-h-screen bg-[#0F1115] flex items-center justify-center p-4 relative overflow-hidden">

      {/* Ambient glow */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#C9A227] opacity-[0.06] blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-[#C9A227] opacity-[0.04] blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-md">

        {/* Top golden line */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#C9A227] to-transparent" />

        <div className="bg-[#14171C] border border-[#C9A227]/20 rounded-b-xl p-10 shadow-2xl shadow-black/60">

          {/* Logo */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border-2 border-[#C9A227]/40 bg-[#0F1115] mb-5 shadow-lg shadow-[#C9A227]/10">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 28V10" stroke="#C9A227" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M16 10 C16 10 10 8 9 4 C12 4 16 7 16 10Z" fill="#C9A227" opacity="0.9"/>
                <path d="M16 10 C16 10 22 8 23 4 C20 4 16 7 16 10Z" fill="#C9A227" opacity="0.9"/>
                <path d="M16 15 C16 15 10 13 9 9 C12 9 16 12 16 15Z" fill="#C9A227" opacity="0.7"/>
                <path d="M16 15 C16 15 22 13 23 9 C20 9 16 12 16 15Z" fill="#C9A227" opacity="0.7"/>
                <path d="M16 20 C16 20 11 18 10 14 C13 14 16 17 16 20Z" fill="#C9A227" opacity="0.5"/>
                <path d="M16 20 C16 20 21 18 22 14 C19 14 16 17 16 20Z" fill="#C9A227" opacity="0.5"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[#E5E7EB] tracking-wide" style={{ fontFamily: "'Georgia', serif" }}>
              AgroGestión Pro
            </h1>
            <p className="text-[#C9A227] text-xs tracking-[0.25em] uppercase mt-1 font-medium">
              versión 2.8
            </p>
          </div>

          {/* Form */}
          <div className="space-y-5">
            <div>
              <label className="block text-xs text-[#9CA3AF] uppercase tracking-widest mb-2 font-medium">
                Correo electrónico
              </label>
              <input
                type="email"
                placeholder="usuario@campo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full bg-[#0F1115] border border-[#2D3139] hover:border-[#C9A227]/40 focus:border-[#C9A227] focus:outline-none rounded-lg px-4 py-3 text-[#E5E7EB] placeholder-[#4B5563] transition-all duration-200 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-[#9CA3AF] uppercase tracking-widest mb-2 font-medium">
                Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full bg-[#0F1115] border border-[#2D3139] hover:border-[#C9A227]/40 focus:border-[#C9A227] focus:outline-none rounded-lg px-4 py-3 text-[#E5E7EB] placeholder-[#4B5563] transition-all duration-200 text-sm"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={login}
              disabled={loading}
              className="w-full mt-2 bg-[#C9A227] hover:bg-[#D4AE35] active:bg-[#B8921F] disabled:opacity-50 disabled:cursor-not-allowed text-[#0F1115] font-bold py-3 rounded-lg transition-all duration-200 text-sm tracking-widest uppercase shadow-lg shadow-[#C9A227]/20"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Ingresando...
                </span>
              ) : "Ingresar"}
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-[#1C2128] text-center">
            <p className="text-[#4B5563] text-xs">
              ¿Problemas para acceder?{" "}
              <span className="text-[#C9A227]/70 hover:text-[#C9A227] cursor-pointer transition-colors">
                Contactar soporte
              </span>
            </p>
          </div>
        </div>

        <p className="text-center text-[#374151] text-xs mt-5 tracking-wider">
          PLATAFORMA DE GESTIÓN AGROPECUARIA · ARG
        </p>
      </div>
    </div>
  );
}
