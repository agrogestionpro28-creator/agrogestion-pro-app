"use client";
import { useState, useEffect } from "react";
import Image from "next/image";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const login = async () => {
    setMsg("Conectando...");
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

      // Detectar si el password tiene formato CODIGO-LETRA (ej: 10001-B)
      // En ese caso el "email" es el email de la empresa y el password tiene la letra
      const letraMatch = password.match(/^(.+)-([A-H])$/i);
      let letraSocio: string | null = null;
      let passwordReal = password;

      if (letraMatch) {
        passwordReal = letraMatch[1]; // La clave sin la letra
        letraSocio = letraMatch[2].toUpperCase(); // La letra del socio
      }

      const { data, error } = await sb.auth.signInWithPassword({ email, password: passwordReal });
      if (error) { setMsg("Email o clave incorrectos"); return; }

      if (data.user) {
        const { data: u } = await sb.from("usuarios").select("id, rol, nombre").eq("auth_id", data.user.id).single();
        if (!u) { setMsg("Usuario no encontrado"); return; }

        // Si ingresó con letra de socio, verificar y guardar el nombre del socio
        if (letraSocio && u.rol === "productor") {
          const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
          if (emp) {
            const { data: socio } = await sb.from("empresa_socios")
              .select("nombre, permisos, activo")
              .eq("empresa_id", emp.id)
              .eq("letra", letraSocio)
              .eq("activo", true)
              .single();

            if (socio) {
              // Guardar nombre del socio en localStorage para el dashboard
              localStorage.setItem("socio_nombre", socio.nombre);
              localStorage.setItem("socio_letra", letraSocio);
              localStorage.setItem("socio_permisos", socio.permisos);
            } else {
              setMsg(`Socio "${letraSocio}" no encontrado o inactivo`);
              await sb.auth.signOut();
              return;
            }
          }
        } else {
          // Acceso normal — limpiar datos de socio previos
          localStorage.removeItem("socio_nombre");
          localStorage.removeItem("socio_letra");
          localStorage.removeItem("socio_permisos");
        }

        const rol = u.rol ?? "productor";
        window.location.href = rol === "productor" ? "/productor/dashboard" : "/" + rol;
      }
    } catch {
      setMsg("Error de conexión");
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#020810]">

      {/* Fondo */}
      <div className="absolute inset-0 z-0">
        <Image src="/login-bg.png" alt="Fondo" fill style={{ objectFit: "cover" }} priority />
        <div className="absolute inset-0 bg-gradient-to-b from-[#020810]/70 via-[#020810]/50 to-[#020810]/90" />
      </div>

      {/* Grid overlay futurista */}
      <div className="absolute inset-0 z-1 pointer-events-none opacity-10"
        style={{
          backgroundImage: `linear-gradient(rgba(0,255,128,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,128,0.3) 1px, transparent 1px)`,
          backgroundSize: "60px 60px"
        }}
      />

      {/* Partículas animadas */}
      {mounted && (
        <div className="absolute inset-0 z-1 pointer-events-none overflow-hidden">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="absolute w-1 h-1 rounded-full bg-[#00FF80] opacity-60"
              style={{
                left: `${(i * 17 + 5) % 100}%`,
                top: `${(i * 23 + 10) % 100}%`,
                animation: `float ${3 + (i % 4)}s ease-in-out infinite`,
                animationDelay: `${i * 0.5}s`,
                boxShadow: "0 0 6px #00FF80"
              }}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.6; }
          50% { transform: translateY(-20px) scale(1.5); opacity: 1; }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 10px rgba(0,255,128,0.3), 0 0 20px rgba(0,255,128,0.1); }
          50% { box-shadow: 0 0 20px rgba(0,255,128,0.6), 0 0 40px rgba(0,255,128,0.3); }
        }
        @keyframes border-flow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .input-neon:focus {
          border-color: #00FF80 !important;
          box-shadow: 0 0 0 1px #00FF80, 0 0 15px rgba(0,255,128,0.3);
        }
        .btn-neon { animation: glow-pulse 2s ease-in-out infinite; }
        .btn-neon:hover {
          box-shadow: 0 0 30px rgba(0,255,128,0.8), 0 0 60px rgba(0,255,128,0.4) !important;
          transform: translateY(-2px);
        }
      `}</style>

      {/* Scanline */}
      <div className="absolute inset-0 z-1 pointer-events-none overflow-hidden opacity-5">
        <div style={{ animation: "scanline 8s linear infinite", height: "2px", background: "rgba(0,255,128,0.8)", width: "100%" }} />
      </div>

      {/* Contenido */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-6">

        {/* Logo */}
        <div className="mb-8 relative">
          <div className="absolute inset-0 blur-2xl bg-[#00FF80]/10 rounded-full scale-150" />
          <Image src="/logo.png" alt="AgroGestión PRO" width={260} height={130} priority className="relative z-10 drop-shadow-2xl" />
        </div>

        {/* Tagline */}
        <div className="mb-6 text-center">
          <p className="text-[#00FF80] text-xs tracking-[0.3em] uppercase font-mono opacity-80">
            ◆ PLATAFORMA IA AGROPECUARIA ◆
          </p>
        </div>

        {/* Card */}
        <div className="w-full relative">
          <div className="absolute -inset-[1px] rounded-2xl opacity-60"
            style={{
              background: "linear-gradient(90deg, #00FF80, #0088FF, #00FF80, #0088FF)",
              backgroundSize: "300% 300%",
              animation: "border-flow 4s ease infinite"
            }}
          />
          <div className="relative bg-[#020810]/90 backdrop-blur-xl rounded-2xl px-6 py-8 border border-[#00FF80]/10">

            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-[#00FF80] animate-pulse" />
              <span className="text-[#00FF80] text-xs font-mono tracking-widest uppercase">Sistema Activo</span>
              <div className="flex-1 h-px bg-gradient-to-r from-[#00FF80]/30 to-transparent" />
            </div>

            <div className="flex flex-col gap-4">

              {/* Email */}
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#00FF80] opacity-70">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <input type="email" placeholder="Email de acceso" value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && login()}
                  className="input-neon w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl pl-11 pr-4 py-3.5 text-[#E5E7EB] placeholder-[#4B6B5B] text-sm focus:outline-none transition-all duration-200 font-mono"
                />
              </div>

              {/* Password */}
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#00FF80] opacity-70">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <input type="password" placeholder="Clave · Para socios: clave-B, clave-C..." value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && login()}
                  className="input-neon w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl pl-11 pr-4 py-3.5 text-[#E5E7EB] placeholder-[#4B6B5B] text-sm focus:outline-none transition-all duration-200 font-mono"
                />
              </div>

              {/* Hint socios */}
              <div className="bg-[#00FF80]/5 border border-[#00FF80]/10 rounded-lg px-3 py-2">
                <p className="text-[#4B6B5B] text-xs font-mono">
                  💡 <span className="text-[#00FF80]/60">Socio/familiar:</span> agregá <span className="text-[#00FF80]">-B</span>, <span className="text-[#00FF80]">-C</span>, <span className="text-[#00FF80]">-D</span>... al final de tu clave
                </p>
              </div>

              {msg && (
                <div className={`text-xs text-center font-mono py-2 px-3 rounded-lg ${msg === "Conectando..." ? "text-[#00FF80] bg-[#00FF80]/10" : "text-red-400 bg-red-500/10"}`}>
                  {msg === "Conectando..." ? "▶ " : "✕ "}{msg}
                </div>
              )}

              {/* Botón */}
              <button onClick={login}
                className="btn-neon w-full bg-gradient-to-r from-[#00AA55] to-[#007A3D] text-white font-bold py-4 rounded-xl text-base transition-all duration-200 tracking-widest uppercase font-mono mt-2">
                ▶ INGRESAR
              </button>

              <p className="text-center text-[#4B6B5B] text-xs hover:text-[#00FF80] cursor-pointer transition-colors font-mono">
                ¿Olvidaste tu clave?
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-[#1a3a2a] text-xs tracking-[0.3em] font-mono">
          © AGROGESTION PRO 2.8 · IA SYSTEM
        </p>
      </div>
    </div>
  );
}
