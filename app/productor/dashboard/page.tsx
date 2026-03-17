"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

const modulos = [
  { href: "/productor/lotes", label: "Lotes y Cultivos", sub: "Propio / Alquilado", img: "/mod-lotes.png" },
  { href: "/productor/stock", label: "Stock", sub: "Granos y cereales", img: "/mod-stock.png" },
  { href: "/productor/finanzas", label: "Finanzas", sub: "Tesorería PRO", img: "/mod-finanzas.png" },
  { href: "/productor/maquinaria", label: "Maquinarias", sub: "Equipos", img: "/mod-maquinaria.png" },
  { href: "/productor/hacienda", label: "Hacienda", sub: "Ganadería", img: "/mod-hacienda.png" },
  { href: "/productor/documentos", label: "Documentos", sub: "Archivos", img: "/mod-documentos.png" },
  { href: "/productor/marketplace", label: "Marketplace", sub: "Compra · Venta · Servicios", img: "/mod-marketplace.png" },
  { href: "/productor/otros", label: "Otros", sub: "Más opciones", img: "/mod-otros.png" },
];

type Stats = {
  hectareas: number;
  stock: number;
  hacienda: number;
  alertas: number;
  saldo: number;
};

export default function ProductorDashboard() {
  const [nombre, setNombre] = useState("");
  const [campana, setCampana] = useState("");
  const [stats, setStats] = useState<Stats>({ hectareas: 0, stock: 0, hacienda: 0, alertas: 0, saldo: 0 });
  const [showAlertas, setShowAlertas] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const init = async () => {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      const { data: u } = await sb.from("usuarios").select("nombre").eq("auth_id", user.id).single();
      if (u) setNombre(u.nombre);
      const campanaId = localStorage.getItem("campana_id");
      if (campanaId) {
        const { data: c } = await sb.from("campanas").select("nombre").eq("id", campanaId).single();
        if (c) setCampana(c.nombre);
        const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", user.id).single();
        if (emp) {
          const [lotes, hacienda, alertas] = await Promise.all([
            sb.from("lotes").select("hectareas").eq("empresa_id", emp.id).eq("campana_id", campanaId),
            sb.from("hacienda").select("cantidad").eq("empresa_id", emp.id),
            sb.from("alertas").select("id", { count: "exact", head: true }).eq("empresa_id", emp.id).eq("resuelta", false),
          ]);
          const totalHa = lotes.data?.reduce((a, l) => a + (l.hectareas ?? 0), 0) ?? 0;
          const totalHacienda = hacienda.data?.reduce((a, h) => a + (h.cantidad ?? 0), 0) ?? 0;
          setStats({ hectareas: totalHa, stock: 0, hacienda: totalHacienda, alertas: alertas.count ?? 0, saldo: 0 });
        }
      }
    };
    init();
  }, []);

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB] overflow-hidden">

      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0) scale(1);opacity:.6} 50%{transform:translateY(-15px) scale(1.5);opacity:1} }
        @keyframes glow-pulse { 0%,100%{box-shadow:0 0 10px rgba(0,255,128,.2)} 50%{box-shadow:0 0 25px rgba(0,255,128,.5)} }
        @keyframes border-flow { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes slide-in { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        .mod-card:hover .mod-img { transform: scale(1.08); }
        .mod-card:hover { border-color: rgba(0,255,128,0.5) !important; box-shadow: 0 0 20px rgba(0,255,128,0.15); }
        .mod-card { transition: all 0.2s ease; }
      `}</style>

      {/* Fondo */}
      <div className="absolute inset-0 z-0">
        <Image src="/dashboard-bg.png" alt="bg" fill style={{ objectFit: "cover" }} priority />
        <div className="absolute inset-0 bg-[#020810]/80" />
      </div>

      {/* Grid overlay */}
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.04]"
        style={{ backgroundImage: `linear-gradient(rgba(0,255,128,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,128,1) 1px, transparent 1px)`, backgroundSize: "50px 50px" }} />

      {/* Partículas */}
      {mounted && [...Array(8)].map((_, i) => (
        <div key={i} className="absolute w-1 h-1 rounded-full bg-[#00FF80] pointer-events-none"
          style={{ left: `${(i * 19 + 7) % 100}%`, top: `${(i * 31 + 5) % 100}%`, animation: `float ${3 + i % 3}s ease-in-out infinite`, animationDelay: `${i * 0.4}s`, boxShadow: "0 0 6px #00FF80", opacity: 0.4 }} />
      ))}

      {/* Header */}
      <div className="relative z-10 border-b border-[#00FF80]/20 bg-[#020810]/80 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Logo" width={120} height={40} className="object-contain" />
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-[#9CA3AF]">{nombre}</span>
          <span className="text-[#00FF80]">|</span>
          <span className="text-[#00FF80]">Campaña {campana} ✓</span>
          <span className="text-[#00FF80] ml-4">Estado: Activo ✓</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Campana alertas */}
          <button onClick={() => setShowAlertas(!showAlertas)} className="relative p-2 hover:bg-[#00FF80]/10 rounded-lg transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00FF80" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {stats.alertas > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {stats.alertas}
              </span>
            )}
          </button>

          <button onClick={() => window.location.href = "/productor"} className="text-xs text-[#4B5563] hover:text-[#00FF80] transition-colors font-mono">
            ← Campaña
          </button>
          <button onClick={async () => {
            const { createClient } = await import("@supabase/supabase-js");
            const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
            await sb.auth.signOut();
            window.location.href = "/login";
          }} className="text-xs text-[#4B5563] hover:text-red-400 transition-colors font-mono">
            Salir
          </button>
        </div>
      </div>

      {/* Panel alertas */}
      {showAlertas && (
        <div className="fixed right-0 top-0 h-full w-80 bg-[#020810]/95 backdrop-blur-xl border-l border-[#00FF80]/20 z-50 p-6"
          style={{ animation: "slide-in 0.3s ease" }}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[#00FF80] font-mono font-bold tracking-widest text-sm">◆ ALERTAS IA</h3>
            <button onClick={() => setShowAlertas(false)} className="text-[#4B5563] hover:text-white text-xl">✕</button>
          </div>
          <div className="flex flex-col gap-3">
            {stats.alertas === 0 ? (
              <div className="text-center py-10">
                <div className="text-[#00FF80] text-3xl mb-3 opacity-30">◆</div>
                <p className="text-[#4B5563] text-sm font-mono">Sin alertas activas</p>
              </div>
            ) : (
              <p className="text-[#9CA3AF] text-sm font-mono">{stats.alertas} alerta(s) pendiente(s)</p>
            )}
          </div>
          <div className="mt-6 p-3 bg-[#00FF80]/5 border border-[#00FF80]/20 rounded-lg">
            <p className="text-[#00FF80] text-xs font-mono">◆ IA MONITOR ACTIVO</p>
            <p className="text-[#4B5563] text-xs mt-1">Analizando datos del campo en tiempo real</p>
          </div>
        </div>
      )}

      {/* Módulos */}
      <div className="relative z-10 p-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {modulos.map(m => (
            <div
              key={m.href}
              onClick={() => window.location.href = m.href}
              className="mod-card cursor-pointer bg-[#0a1628]/80 backdrop-blur-sm border border-[#00FF80]/15 rounded-xl overflow-hidden"
            >
              <div className="relative h-32 overflow-hidden">
                <Image src={m.img} alt={m.label} fill className="mod-img object-cover transition-transform duration-300" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628] via-transparent to-transparent" />
              </div>
              <div className="p-3">
                <div className="font-bold text-[#E5E7EB] text-sm">{m.label}</div>
                <div className="text-[#4B6B5B] text-xs mt-0.5 font-mono">{m.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Stats bar */}
        <div className="relative bg-[#0a1628]/80 backdrop-blur-sm border border-[#00FF80]/15 rounded-xl px-6 py-4">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00FF80]/50 to-transparent" />
          <div className="flex flex-wrap gap-8 items-center">
            {[
              { label: "Hectáreas Totales", value: `${stats.hectareas} Ha`, color: "#4ADE80", icon: "🌱" },
              { label: "Stock de Granos", value: `${stats.stock} Tn`, color: "#C9A227", icon: "◈" },
              { label: "Saldo a Pagar", value: `$ ${stats.saldo.toLocaleString("es-AR")}`, color: "#60A5FA", icon: "$" },
              { label: "Hacienda", value: `${stats.hacienda} Cabezas`, color: "#A78BFA", icon: "◉" },
              { label: "Alertas", value: String(stats.alertas), color: "#F87171", icon: "🔔" },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3">
                <span style={{ color: s.color }}>{s.icon}</span>
                <div>
                  <div className="text-[10px] text-[#4B5563] uppercase tracking-wider font-mono">{s.label}</div>
                  <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 tracking-[0.3em] font-mono">
        © AGROGESTION PRO · IA SYSTEM
      </p>
    </div>
  );
}

