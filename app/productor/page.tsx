"use client";
import { useEffect, useState } from "react";

type Campana = {
  id: string;
  nombre: string;
  año_inicio: number;
  año_fin: number;
  activa: boolean;
};

type Empresa = {
  id: string;
  nombre: string;
};

export default function ProductorHome() {
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [nombre, setNombre] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [añoInicio, setAñoInicio] = useState(2025);
  const [añoFin, setAñoFin] = useState(2026);

  useEffect(() => {
    const init = async () => {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      const { data: u } = await sb.from("usuarios").select("nombre").eq("auth_id", user.id).single();
      if (u) setNombre(u.nombre);
      const { data: emp } = await sb.from("empresas").select("*").eq("propietario_id", user.id).single();
      if (emp) {
        setEmpresa(emp);
        const { data: cs } = await sb.from("campanas").select("*").eq("empresa_id", emp.id).order("año_inicio", { ascending: false });
        setCampanas(cs ?? []);
      }
      setLoading(false);
    };
    init();
  }, []);

  const crearCampana = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    let empId = empresa?.id;
    if (!empId) {
      const { data: u } = await sb.from("usuarios").select("id, nombre").eq("auth_id", user.id).single();
      const { data: newEmp } = await sb.from("empresas").insert({ nombre: u?.nombre ?? "Mi Empresa", propietario_id: u?.id }).select().single();
      if (newEmp) { setEmpresa(newEmp); empId = newEmp.id; }
    }
    await sb.from("campanas").update({ activa: false }).eq("empresa_id", empId);
    await sb.from("campanas").insert({ empresa_id: empId, nombre: `${añoInicio}/${añoFin}`, año_inicio: añoInicio, año_fin: añoFin, activa: true });
    const { data: cs } = await sb.from("campanas").select("*").eq("empresa_id", empId).order("año_inicio", { ascending: false });
    setCampanas(cs ?? []);
    setShowForm(false);
  };

  const seleccionarCampana = (id: string) => {
    localStorage.setItem("campana_id", id);
    window.location.href = "/productor/dashboard";
  };

  if (loading) return <div className="min-h-screen bg-[#0F1115] flex items-center justify-center text-[#C9A227]">Cargando...</div>;

  return (
    <div className="min-h-screen bg-[#0F1115] text-[#E5E7EB] flex flex-col items-center justify-center p-8"
      style={{ backgroundImage: "radial-gradient(ellipse at top, #1a1f0a 0%, #0F1115 60%)" }}>

      {/* Header */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border border-[#C9A227]/50 bg-[#0F1115] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <path d="M16 28V10" stroke="#C9A227" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M16 10 C16 10 10 8 9 4 C12 4 16 7 16 10Z" fill="#C9A227"/>
              <path d="M16 10 C16 10 22 8 23 4 C20 4 16 7 16 10Z" fill="#C9A227"/>
              <path d="M16 15 C16 15 10 13 9 9 C12 9 16 12 16 15Z" fill="#C9A227" opacity="0.7"/>
              <path d="M16 15 C16 15 22 13 23 9 C20 9 16 12 16 15Z" fill="#C9A227" opacity="0.7"/>
            </svg>
          </div>
          <span className="font-bold text-[#E5E7EB]">AgroGestión <span className="text-[#C9A227]">PRO</span></span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#9CA3AF]">{nombre} · <span className="text-[#4ADE80]">PRODUCTOR</span></span>
          <button onClick={() => window.location.href = "/login"} className="text-xs text-[#4B5563] hover:text-[#9CA3AF] transition-colors">Salir</button>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-[#E5E7EB] mb-3">Seleccionar Ciclo Productivo</h1>
        <p className="text-[#9CA3AF]">Seleccione la campaña para gestionar lotes y labores</p>
      </div>

      {/* Campañas */}
      <div className="w-full max-w-4xl">
        <div className="flex justify-end mb-6">
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-[#4ADE80] text-[#0F1115] font-bold px-6 py-3 rounded-lg text-sm hover:bg-[#22c55e] transition-colors"
          >
            + NUEVA CAMPAÑA
          </button>
        </div>

        {showForm && (
          <div className="bg-[#14171C] border border-[#C9A227]/30 rounded-xl p-6 mb-6">
            <h3 className="text-[#E5E7EB] font-bold mb-4">Nueva campaña agrícola</h3>
            <div className="flex gap-4 items-end">
              <div>
                <label className="block text-xs text-[#9CA3AF] uppercase tracking-widest mb-2">Año inicio</label>
                <input type="number" value={añoInicio} onChange={e => setAñoInicio(Number(e.target.value))}
                  className="bg-[#0F1115] border border-[#2D3139] rounded-lg px-4 py-3 text-[#E5E7EB] text-sm w-32 focus:outline-none focus:border-[#C9A227]" />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] uppercase tracking-widest mb-2">Año fin</label>
                <input type="number" value={añoFin} onChange={e => setAñoFin(Number(e.target.value))}
                  className="bg-[#0F1115] border border-[#2D3139] rounded-lg px-4 py-3 text-[#E5E7EB] text-sm w-32 focus:outline-none focus:border-[#C9A227]" />
              </div>
              <button onClick={crearCampana} className="bg-[#C9A227] text-[#0F1115] font-bold px-6 py-3 rounded-lg text-sm hover:bg-[#D4AE35] transition-colors">
                Crear
              </button>
            </div>
          </div>
        )}

        {campanas.length === 0 ? (
          <div className="text-center py-16 text-[#4B5563]">
            <p className="text-lg mb-2">No tenés campañas creadas</p>
            <p className="text-sm">Clickeá en Nueva Campaña para empezar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campanas.map(c => (
              <div
                key={c.id}
                onClick={() => seleccionarCampana(c.id)}
                className="cursor-pointer rounded-xl p-6 border transition-all duration-200 hover:scale-105"
                style={{
                  background: c.activa ? "linear-gradient(135deg, #1a2010 0%, #14171C 100%)" : "#14171C",
                  borderColor: c.activa ? "#C9A227" : "#1C2128",
                  boxShadow: c.activa ? "0 0 20px rgba(201,162,39,0.15)" : "none"
                }}
              >
                {c.activa && (
                  <div className="bg-[#C9A227] text-[#0F1115] text-xs font-bold px-3 py-1 rounded-full inline-block mb-4">
                    CAMPAÑA ACTUAL
                  </div>
                )}
                <div className="text-4xl font-bold text-[#E5E7EB] mb-1">{c.año_inicio}/{c.año_fin}</div>
                <div className="text-[#9CA3AF] text-sm uppercase tracking-widest mb-4">CICLO AGRÍCOLA</div>
                <div className="flex items-center gap-2 text-sm" style={{ color: c.activa ? "#4ADE80" : "#4B5563" }}>
                  <span>🌱</span>
                  <span>Lotes Propios: 0</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-12 text-[#2D3139] text-xs tracking-widest">© AgroGestión PRO</p>
    </div>
  );
}
