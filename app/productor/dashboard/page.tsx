"use client";
import { useEffect, useState } from "react";

const modulos = [
  { href: "/productor/lotes", label: "Lotes y Cultivos", sub: "Propio / Alquilado", color: "#4ADE80", icon: "◱" },
  { href: "/productor/stock", label: "Stock", sub: "Granos y cereales", color: "#C9A227", icon: "▣" },
  { href: "/productor/finanzas", label: "Finanzas", sub: "Tesorería", color: "#60A5FA", icon: "◈" },
  { href: "/productor/maquinaria", label: "Maquinarias", sub: "Equipos", color: "#FB923C", icon: "⬡" },
  { href: "/productor/hacienda", label: "Hacienda", sub: "Ganadería", color: "#A78BFA", icon: "◉" },
  { href: "/productor/alertas", label: "Alertas", sub: "Notificaciones", color: "#F87171", icon: "◬" },
  { href: "/productor/documentos", label: "Documentos", sub: "Archivos", color: "#34D399", icon: "◧" },
  { href: "/productor/insumos", label: "Insumos", sub: "Cotización", color: "#FBBF24", icon: "◫" },
];

export default function ProductorDashboard() {
  const [nombre, setNombre] = useState("");
  const [campana, setCampana] = useState("");
  const [stats, setStats] = useState({ hectareas: 0, stock: 0, hacienda: 0, alertas: 0, saldo: 0 });

  useEffect(() => {
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
    <div className="min-h-screen bg-[#0F1115] text-[#E5E7EB]"
      style={{ backgroundImage: "radial-gradient(ellipse at top, #1a1f0a 0%, #0F1115 60%)" }}>

      {/* Header */}
      <div className="border-b border-[#C9A227]/20 px-8 py-4 flex items-center justify-between bg-[#14171C]/80">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full border border-[#C9A227]/50 bg-[#0F1115] flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
              <path d="M16 28V10" stroke="#C9A227" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M16 10 C16 10 10 8 9 4 C12 4 16 7 16 10Z" fill="#C9A227"/>
              <path d="M16 10 C16 10 22 8 23 4 C20 4 16 7 16 10Z" fill="#C9A227"/>
            </svg>
          </div>
          <span className="font-bold">AgroGestión <span className="text-[#C9A227]">PRO</span></span>
        </div>
        <div className="text-sm text-[#9CA3AF]">
          {nombre} | Campaña {campana} <span className="text-[#4ADE80]">✓</span>
          <span className="ml-2 text-[#4ADE80]">Estado: Activo ✓</span>
        </div>
        <button onClick={() => window.location.href = "/productor"} className="text-xs text-[#4B5563] hover:text-[#9CA3AF] transition-colors">
          ← Cambiar campaña
        </button>
      </div>

      <div className="p-8 max-w-6xl mx-auto">

        {/* Módulos */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {modulos.map(m => (
            <div
              key={m.href}
              onClick={() => window.location.href = m.href}
              className="cursor-pointer bg-[#14171C] border border-[#1C2128] hover:border-[#C9A227]/40 rounded-xl p-5 transition-all duration-200 hover:bg-[#1C2128] group"
            >
              <div className="text-3xl mb-3" style={{ color: m.color }}>{m.icon}</div>
              <div className="font-bold text-[#E5E7EB] text-sm group-hover:text-white">{m.label}</div>
              <div className="text-[#4B5563] text-xs mt-1">{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Stats bar */}
        <div className="bg-[#14171C] border border-[#1C2128] rounded-xl px-6 py-4 flex flex-wrap gap-8">
          <div className="flex items-center gap-3">
            <span className="text-[#4ADE80]">🌱</span>
            <div>
              <div className="text-xs text-[#4B5563] uppercase tracking-wider">Hectáreas Totales</div>
              <div className="text-xl font-bold text-[#E5E7EB]">{stats.hectareas} Ha</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[#C9A227]">◈</span>
            <div>
              <div className="text-xs text-[#4B5563] uppercase tracking-wider">Stock de Granos</div>
              <div className="text-xl font-bold text-[#E5E7EB]">{stats.stock} Tn</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[#60A5FA]">$</span>
            <div>
              <div className="text-xs text-[#4B5563] uppercase tracking-wider">Saldo a Pagar</div>
              <div className="text-xl font-bold text-[#E5E7EB]">$ {stats.saldo.toLocaleString("es-AR")}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[#A78BFA]">◉</span>
            <div>
              <div className="text-xs text-[#4B5563] uppercase tracking-wider">Hacienda</div>
              <div className="text-xl font-bold text-[#E5E7EB]">{stats.hacienda} Cabezas</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[#F87171]">◬</span>
            <div>
              <div className="text-xs text-[#4B5563] uppercase tracking-wider">Alertas</div>
              <div className="text-xl font-bold text-[#E5E7EB]">{stats.alertas}</div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-[#2D3139] text-xs pb-6 tracking-widest">© AgroGestión PRO</p>
    </div>
  );
}
