"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

type MargenDetalle = {
  id: string; lote_id: string; cultivo: string; cultivo_orden: string;
  hectareas: number; rendimiento_esperado: number; rendimiento_real: number;
  precio_tn: number; ingreso_bruto: number;
  costo_semilla: number; costo_fertilizante: number; costo_agroquimicos: number;
  costo_labores: number; costo_alquiler: number; costo_flete: number;
  costo_comercializacion: number; otros_costos: number;
  costo_directo_total: number; margen_bruto: number; margen_bruto_ha: number;
  margen_bruto_usd: number; cotizacion_usd: number; estado: string;
};
type Lote = { id: string; nombre: string; hectareas: number; cultivo: string; cultivo_orden: string; cultivo_completo: string; };
type Campana = { id: string; nombre: string; año_inicio: number; año_fin: number; activa: boolean; };
type HaciendaCategoria = { id: string; nombre: string; cantidad: number; peso_promedio: number; precio_kg: number; };

const CULTIVO_COLORS: Record<string, string> = {
  soja:"#4ADE80", maiz:"#C9A227", trigo:"#F59E0B", girasol:"#FBBF24",
  sorgo:"#F87171", cebada:"#A78BFA", arveja:"#34D399", otro:"#60A5FA",
};
const CULTIVO_ICONS: Record<string, string> = {
  soja:"🌱", maiz:"🌽", trigo:"🌾", girasol:"🌻",
  sorgo:"🌿", cebada:"🍃", arveja:"🫛", otro:"🌐",
};

function fmt(n: number) { return Math.round(n).toLocaleString("es-AR"); }

export default function MargenPage() {
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [campanaActiva, setCampanaActiva] = useState<string>("");
  const [margenes, setMargenes] = useState<MargenDetalle[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [hacienda, setHacienda] = useState<HaciendaCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [seccion, setSeccion] = useState<string>("resumen");

  // ── TC BNA ──
  const [tcVenta, setTcVenta] = useState<number|null>(null);
  const [tcCompra, setTcCompra] = useState<number|null>(null);
  const [tcFecha, setTcFecha] = useState<string>("");
  const [tcLoading, setTcLoading] = useState(true);
  const [tcError, setTcError] = useState(false);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  // Traer TC del BNA y guardar en Supabase
  const fetchTC = async (eid: string) => {
    setTcLoading(true); setTcError(false);
    try {
      const res = await fetch("/api/cotizacion");
      const data = await res.json();
      if (data.venta) {
        setTcVenta(data.venta);
        setTcCompra(data.compra);
        setTcFecha(data.fecha);
        // Guardar en finanzas_cotizaciones si cambió
        const sb = await getSB();
        const hoy = new Date().toISOString().split("T")[0];
        const { data: existing } = await sb.from("finanzas_cotizaciones")
          .select("id").eq("empresa_id", eid).eq("fecha", hoy).single();
        if (!existing) {
          await sb.from("finanzas_cotizaciones").insert({
            empresa_id: eid, fecha: hoy,
            usd_oficial: data.venta, usd_mep: 0, usd_blue: 0,
            usd_usado: data.venta,
          });
        } else {
          await sb.from("finanzas_cotizaciones")
            .update({ usd_oficial: data.venta, usd_usado: data.venta })
            .eq("id", existing.id);
        }
      } else { setTcError(true); }
    } catch { setTcError(true); }
    setTcLoading(false);
  };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("id").eq("auth_id", user.id).single();
    if (!u) return;
    const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
    if (!emp) { setLoading(false); return; }
    setEmpresaId(emp.id);

    const { data: camps } = await sb.from("campanas").select("*").eq("empresa_id", emp.id).order("año_inicio", { ascending: false });
    setCampanas(camps ?? []);
    let cid = localStorage.getItem("campana_id") ?? "";
    if (!cid && camps?.length) cid = camps.find((c:any) => c.activa)?.id ?? camps[0].id;
    setCampanaActiva(cid);

    await Promise.all([
      fetchTC(emp.id),
      fetchData(emp.id, cid),
    ]);
    setLoading(false);
  };

  const fetchData = async (eid: string, cid: string) => {
    const sb = await getSB();
    const [mg, lt, hac] = await Promise.all([
      sb.from("margen_bruto_detalle").select("*").eq("empresa_id", eid),
      sb.from("lotes").select("id,nombre,hectareas,cultivo,cultivo_orden,cultivo_completo").eq("empresa_id", eid).eq("campana_id", cid).eq("es_segundo_cultivo", false),
      sb.from("hacienda_categorias").select("*").eq("empresa_id", eid),
    ]);
    setMargenes(mg.data ?? []);
    setLotes(lt.data ?? []);
    setHacienda(hac.data ?? []);
  };

  const cambiarCampana = async (cid: string) => {
    setCampanaActiva(cid);
    if (empresaId) await fetchData(empresaId, cid);
  };

  const cultivosUnicos = [...new Set(lotes.map(l => l.cultivo).filter(Boolean))];
  const tieneHacienda = hacienda.length > 0 && hacienda.reduce((a,h) => a + h.cantidad, 0) > 0;
  const tcUsado = tcVenta ?? 1;

  const margenPorCultivo = (cultivo: string) => {
    const lotesC = lotes.filter(l => l.cultivo === cultivo);
    const mgC = margenes.filter(m => m.cultivo === cultivo);
    const totalHa = lotesC.reduce((a,l) => a + l.hectareas, 0);
    const totalIngreso = mgC.reduce((a,m) => a + m.ingreso_bruto, 0);
    const totalCosto = mgC.reduce((a,m) => a + m.costo_directo_total, 0);
    const totalMB = mgC.reduce((a,m) => a + m.margen_bruto, 0);
    const mbHa = totalHa > 0 ? totalMB / totalHa : 0;
    const estimados = mgC.filter(m => m.estado === "estimado").length;
    const reales = mgC.filter(m => m.estado === "real").length;
    return { lotesC, mgC, totalHa, totalIngreso, totalCosto, totalMB, mbHa, estimados, reales };
  };

  const totalHaGeneral = lotes.reduce((a,l) => a + l.hectareas, 0);
  const totalIngresoGeneral = margenes.reduce((a,m) => a + m.ingreso_bruto, 0);
  const totalCostoGeneral = margenes.reduce((a,m) => a + m.costo_directo_total, 0);
  const totalMBGeneral = margenes.reduce((a,m) => a + m.margen_bruto, 0);
  const mbHaGeneral = totalHaGeneral > 0 ? totalMBGeneral / totalHaGeneral : 0;
  const mbHacienda = hacienda.reduce((a,h) => a + h.cantidad * (h.peso_promedio||0) * (h.precio_kg||0), 0);

  const cultivoActivo = seccion.startsWith("cultivo:") ? seccion.replace("cultivo:","") : null;

  if (loading) return <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">CARGANDO MÁRGENES...</div>;

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        @keyframes gf{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .card-m{background:rgba(10,22,40,0.85);border:1px solid rgba(201,162,39,0.2);border-radius:12px;transition:all 0.2s}
        .card-m:hover{border-color:rgba(201,162,39,0.45)}
        .cult-card{cursor:pointer;transition:all 0.2s}
        .cult-card:hover{transform:translateY(-3px)}
      `}</style>

      <div className="absolute inset-0 z-0"><Image src="/dashboard-bg.png" alt="" fill style={{objectFit:"cover"}}/><div className="absolute inset-0 bg-[#020810]/88"/></div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.025]" style={{backgroundImage:"linear-gradient(rgba(0,255,128,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,128,0.5) 1px,transparent 1px)",backgroundSize:"50px 50px"}}/>

      {/* HEADER */}
      <div className="relative z-10">
        <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{background:"linear-gradient(90deg,transparent,#C9A227,#00FF80,#C9A227,transparent)",backgroundSize:"200% 100%",animation:"gf 4s ease infinite"}}/>
        <div className="absolute inset-0 bg-[#020810]/95"/>
        <div className="relative px-6 py-3 flex items-center gap-3 flex-wrap">
          <button onClick={()=> cultivoActivo||seccion==="hacienda" ? setSeccion("resumen") : window.location.href="/productor/dashboard"}
            className="text-[#4B5563] hover:text-[#C9A227] transition-colors font-mono text-sm flex-shrink-0">
            ← {cultivoActivo||seccion==="hacienda" ? "VOLVER" : "DASHBOARD"}
          </button>
          <div className="flex-1"/>

          {/* ── TC BNA DIVISA VENTA ── */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#C9A227]/30 bg-[#C9A227]/5">
            {tcLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border border-[#C9A227] border-t-transparent rounded-full" style={{animation:"spin 0.8s linear infinite"}}/>
                <span className="text-[#4B5563] text-xs font-mono">BNA...</span>
              </div>
            ) : tcError ? (
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => empresaId && fetchTC(empresaId)}>
                <span className="text-[#F87171] text-xs font-mono">⚠ Sin cotización</span>
                <span className="text-[#F87171] text-xs font-mono">↺</span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-[10px] text-[#4B5563] font-mono uppercase leading-none">BNA DIVISA VENTA</div>
                  <div className="text-[#C9A227] font-mono font-bold text-sm leading-none mt-0.5">${fmt(tcVenta??0)}</div>
                </div>
                {tcCompra && (
                  <div>
                    <div className="text-[10px] text-[#4B5563] font-mono uppercase leading-none">COMPRA</div>
                    <div className="text-[#9CA3AF] font-mono text-xs leading-none mt-0.5">${fmt(tcCompra)}</div>
                  </div>
                )}
                <div>
                  <div className="text-[10px] text-[#4B5563] font-mono uppercase leading-none">FECHA</div>
                  <div className="text-[#4B5563] font-mono text-xs leading-none mt-0.5">{tcFecha}</div>
                </div>
                <button onClick={() => empresaId && fetchTC(empresaId)} className="text-[#4B5563] hover:text-[#C9A227] text-xs transition-colors" title="Actualizar cotización">↺</button>
              </div>
            )}
          </div>

          {/* Selector campaña */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-[#4B5563] font-mono hidden sm:block">CAMPAÑA:</span>
            <select value={campanaActiva} onChange={e => cambiarCampana(e.target.value)}
              className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-lg px-3 py-1.5 text-[#C9A227] text-xs font-mono focus:outline-none" style={{minWidth:120}}>
              {campanas.map(c=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
            </select>
          </div>

          <div className="cursor-pointer flex-shrink-0" onClick={()=>window.location.href="/productor/dashboard"}>
            <Image src="/logo.png" alt="" width={100} height={36} className="object-contain"/>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto p-5">

        {/* ===== RESUMEN ===== */}
        {seccion === "resumen" && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">📊 MARGEN BRUTO</h1>
              <p className="text-[#C9A227] text-xs tracking-widest font-mono mt-1">RENTABILIDAD POR CULTIVO Y CAMPAÑA · TC BNA DIVISA VENTA</p>
            </div>

            {/* KPIs generales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                {l:"HA TOTALES", v:fmt(totalHaGeneral)+" Ha", c:"#C9A227"},
                {l:"INGRESO BRUTO", v:"$"+fmt(totalIngresoGeneral), c:"#E5E7EB"},
                {l:"COSTO TOTAL", v:"$"+fmt(totalCostoGeneral), c:"#F87171"},
                {l:"MARGEN BRUTO", v:"$"+fmt(totalMBGeneral), c:totalMBGeneral>=0?"#4ADE80":"#F87171"},
              ].map(s=>(
                <div key={s.l} className="card-m p-4 text-center">
                  <div className="text-xs text-[#4B5563] font-mono uppercase tracking-wider mb-1">{s.l}</div>
                  <div className="text-xl font-bold font-mono" style={{color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* MB/Ha y USD */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="card-m p-4 text-center">
                <div className="text-xs text-[#4B5563] font-mono uppercase tracking-wider mb-1">MB / HECTÁREA</div>
                <div className="text-2xl font-bold font-mono" style={{color:mbHaGeneral>=0?"#4ADE80":"#F87171"}}>${fmt(mbHaGeneral)}</div>
                <div className="text-xs text-[#4B5563] font-mono mt-1">por ha</div>
              </div>
              <div className="card-m p-4 text-center">
                <div className="text-xs text-[#4B5563] font-mono uppercase tracking-wider mb-1">MB EN USD</div>
                <div className="text-2xl font-bold text-[#60A5FA] font-mono">
                  {tcVenta ? `USD ${fmt(totalMBGeneral/tcVenta)}` : "—"}
                </div>
                <div className="text-xs font-mono mt-1" style={{color:tcVenta?"#C9A227":"#4B5563"}}>
                  {tcVenta ? `TC BNA $${fmt(tcVenta)}` : "Sin TC"}
                </div>
              </div>
              <div className="card-m p-4 text-center">
                <div className="text-xs text-[#4B5563] font-mono uppercase tracking-wider mb-1">LOTES CON MB</div>
                <div className="text-2xl font-bold text-[#C9A227] font-mono">{margenes.length}</div>
                <div className="text-xs text-[#4B5563] font-mono mt-1">de {lotes.length} lotes</div>
              </div>
            </div>

            {/* Tarjetas por cultivo */}
            <h2 className="text-[#C9A227] font-mono text-sm font-bold mb-3 uppercase tracking-widest">◆ POR CULTIVO</h2>

            {cultivosUnicos.length === 0 ? (
              <div className="card-m p-12 text-center">
                <div className="text-4xl mb-4 opacity-20">📊</div>
                <p className="text-[#4B5563] font-mono">Sin datos de margen bruto para esta campaña</p>
                <p className="text-[#4B5563] font-mono text-xs mt-2">Cargá los márgenes desde el módulo de Lotes</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                {cultivosUnicos.map(cultivo => {
                  const { totalHa, totalMB, mbHa, mgC, totalIngreso, totalCosto, estimados, reales } = margenPorCultivo(cultivo);
                  const color = CULTIVO_COLORS[cultivo] ?? "#6B7280";
                  const icon = CULTIVO_ICONS[cultivo] ?? "🌾";
                  const tieneMB = mgC.length > 0;
                  return (
                    <div key={cultivo} className="cult-card card-m overflow-hidden" onClick={() => setSeccion("cultivo:"+cultivo)} style={{borderColor:color+"40"}}>
                      <div className="px-4 py-3 flex items-center gap-3" style={{background:color+"15",borderBottom:`1px solid ${color}30`}}>
                        <span className="text-2xl">{icon}</span>
                        <div className="flex-1">
                          <div className="font-bold font-mono uppercase text-white">{cultivo}</div>
                          <div className="text-xs font-mono" style={{color}}>{totalHa} HA · {mgC.length} lotes con MB</div>
                        </div>
                        <div className="text-right">
                          {reales > 0 && <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-[#4ADE80]/15 text-[#4ADE80]">✅ REAL</span>}
                          {estimados > 0 && reales === 0 && <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-[#C9A227]/15 text-[#C9A227]">📋 EST.</span>}
                        </div>
                      </div>
                      <div className="p-4">
                        {tieneMB ? (
                          <>
                            <div className="grid grid-cols-3 gap-2 text-xs font-mono mb-3">
                              <div className="text-center bg-[#020810]/40 rounded-lg p-2">
                                <div className="text-[#4B5563] mb-1">INGRESO</div>
                                <div className="font-bold text-[#E5E7EB]">${fmt(totalIngreso/1000000)}M</div>
                              </div>
                              <div className="text-center bg-[#020810]/40 rounded-lg p-2">
                                <div className="text-[#4B5563] mb-1">COSTO</div>
                                <div className="font-bold text-[#F87171]">${fmt(totalCosto/1000000)}M</div>
                              </div>
                              <div className="text-center bg-[#020810]/40 rounded-lg p-2">
                                <div className="text-[#4B5563] mb-1">MB/HA</div>
                                <div className="font-bold" style={{color:mbHa>=0?"#4ADE80":"#F87171"}}>${fmt(mbHa)}</div>
                              </div>
                            </div>
                            {/* MB en USD con TC BNA */}
                            {tcVenta && (
                              <div className="bg-[#60A5FA]/5 border border-[#60A5FA]/15 rounded-lg px-3 py-2 text-xs font-mono flex items-center justify-between">
                                <span className="text-[#4B5563]">MB en USD (BNA ${fmt(tcVenta)})</span>
                                <span className="font-bold text-[#60A5FA]">USD {fmt(totalMB/tcVenta)}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-center py-3 text-[#4B5563] font-mono text-xs">Sin margen cargado — tocá para ver</div>
                        )}
                        <div className="mt-3 pt-3 border-t border-[#C9A227]/10 flex items-center justify-between">
                          <span className="text-xs text-[#4B5563] font-mono">MB TOTAL</span>
                          <span className="font-bold font-mono text-sm" style={{color:totalMB>=0?"#4ADE80":"#F87171"}}>{tieneMB ? "$"+fmt(totalMB) : "—"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Tarjeta Hacienda */}
                {tieneHacienda && (
                  <div className="cult-card card-m overflow-hidden" onClick={() => setSeccion("hacienda")} style={{borderColor:"#A78BFA40"}}>
                    <div className="px-4 py-3 flex items-center gap-3" style={{background:"#A78BFA15",borderBottom:"1px solid #A78BFA30"}}>
                      <span className="text-2xl">🐄</span>
                      <div className="flex-1">
                        <div className="font-bold font-mono uppercase text-white">HACIENDA</div>
                        <div className="text-xs font-mono text-[#A78BFA]">{hacienda.reduce((a,h)=>a+h.cantidad,0)} cabezas · {hacienda.length} categorías</div>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
                        <div className="text-center bg-[#020810]/40 rounded-lg p-2">
                          <div className="text-[#4B5563] mb-1">CABEZAS</div>
                          <div className="font-bold text-[#A78BFA]">{hacienda.reduce((a,h)=>a+h.cantidad,0)}</div>
                        </div>
                        <div className="text-center bg-[#020810]/40 rounded-lg p-2">
                          <div className="text-[#4B5563] mb-1">VALOR EST.</div>
                          <div className="font-bold text-[#4ADE80]">${fmt(mbHacienda/1000000)}M</div>
                        </div>
                      </div>
                      {tcVenta && (
                        <div className="bg-[#60A5FA]/5 border border-[#60A5FA]/15 rounded-lg px-3 py-2 text-xs font-mono flex items-center justify-between">
                          <span className="text-[#4B5563]">En USD (BNA ${fmt(tcVenta)})</span>
                          <span className="font-bold text-[#60A5FA]">USD {fmt(mbHacienda/tcVenta)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tabla todos los lotes */}
            {margenes.length > 0 && (
              <div className="card-m overflow-hidden">
                <div className="px-5 py-3 border-b border-[#C9A227]/15 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[#C9A227] font-mono text-sm font-bold">📋 TODOS LOS LOTES</span>
                  {tcVenta && <span className="text-xs text-[#C9A227] font-mono font-bold">TC BNA DIVISA VENTA: ${fmt(tcVenta)}</span>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-[#C9A227]/10">
                      {["LOTE","CULTIVO","HA","REND.","INGRESO","COSTO","MARGEN","MB/HA","MB USD","ESTADO"].map(h=>(
                        <th key={h} className="text-left px-4 py-2.5 text-xs text-[#4B5563] font-mono whitespace-nowrap">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {margenes.map(m => {
                        const lote = lotes.find(l => l.id === m.lote_id);
                        const color = CULTIVO_COLORS[m.cultivo] ?? "#6B7280";
                        const mbUsd = tcVenta ? m.margen_bruto / tcVenta : null;
                        return (
                          <tr key={m.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5 cursor-pointer" onClick={() => setSeccion("cultivo:"+m.cultivo)}>
                            <td className="px-4 py-3 font-bold text-[#E5E7EB] font-mono text-sm">{lote?.nombre ?? "—"}</td>
                            <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold" style={{background:color+"20",color}}>{CULTIVO_ICONS[m.cultivo]??""} {m.cultivo?.toUpperCase()}</span></td>
                            <td className="px-4 py-3 text-sm text-[#9CA3AF] font-mono">{m.hectareas}</td>
                            <td className="px-4 py-3 text-sm text-[#C9A227] font-mono">{m.rendimiento_real||m.rendimiento_esperado} tn/ha</td>
                            <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">${fmt(m.ingreso_bruto)}</td>
                            <td className="px-4 py-3 text-sm text-[#F87171] font-mono">${fmt(m.costo_directo_total)}</td>
                            <td className="px-4 py-3 font-bold font-mono text-sm" style={{color:m.margen_bruto>=0?"#4ADE80":"#F87171"}}>${fmt(m.margen_bruto)}</td>
                            <td className="px-4 py-3 text-sm text-[#C9A227] font-mono">${fmt(m.margen_bruto_ha)}</td>
                            <td className="px-4 py-3 text-sm text-[#60A5FA] font-mono">{mbUsd ? "USD "+fmt(mbUsd) : "—"}</td>
                            <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold" style={{background:m.estado==="real"?"rgba(74,222,128,0.15)":"rgba(201,162,39,0.15)",color:m.estado==="real"?"#4ADE80":"#C9A227"}}>{m.estado==="real"?"✅ REAL":"📋 EST."}</span></td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-[#C9A227]/30 bg-[#C9A227]/5">
                        <td colSpan={4} className="px-4 py-3 font-bold text-[#C9A227] font-mono text-sm">TOTALES</td>
                        <td className="px-4 py-3 font-bold text-[#E5E7EB] font-mono">${fmt(totalIngresoGeneral)}</td>
                        <td className="px-4 py-3 font-bold text-[#F87171] font-mono">${fmt(totalCostoGeneral)}</td>
                        <td className="px-4 py-3 font-bold font-mono" style={{color:totalMBGeneral>=0?"#4ADE80":"#F87171"}}>${fmt(totalMBGeneral)}</td>
                        <td className="px-4 py-3 font-bold text-[#C9A227] font-mono">${fmt(mbHaGeneral)}</td>
                        <td className="px-4 py-3 font-bold text-[#60A5FA] font-mono">{tcVenta ? "USD "+fmt(totalMBGeneral/tcVenta) : "—"}</td>
                        <td/>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== DETALLE CULTIVO ===== */}
        {cultivoActivo && (() => {
          const color = CULTIVO_COLORS[cultivoActivo] ?? "#6B7280";
          const icon = CULTIVO_ICONS[cultivoActivo] ?? "🌾";
          const { lotesC, mgC, totalHa, totalIngreso, totalCosto, totalMB, mbHa } = margenPorCultivo(cultivoActivo);

          const costosAgrupados = mgC.length > 0 ? [
            { name:"Semillas", value:mgC.reduce((a,m)=>a+m.costo_semilla,0), color:"#4ADE80" },
            { name:"Fertilizantes", value:mgC.reduce((a,m)=>a+m.costo_fertilizante,0), color:"#C9A227" },
            { name:"Agroquímicos", value:mgC.reduce((a,m)=>a+m.costo_agroquimicos,0), color:"#60A5FA" },
            { name:"Labores", value:mgC.reduce((a,m)=>a+m.costo_labores,0), color:"#F87171" },
            { name:"Alquiler", value:mgC.reduce((a,m)=>a+m.costo_alquiler,0), color:"#A78BFA" },
            { name:"Flete", value:mgC.reduce((a,m)=>a+m.costo_flete,0), color:"#F59E0B" },
            { name:"Comercialización", value:mgC.reduce((a,m)=>a+m.costo_comercializacion,0), color:"#34D399" },
            { name:"Otros", value:mgC.reduce((a,m)=>a+m.otros_costos,0), color:"#9CA3AF" },
          ].filter(c => c.value > 0) : [];

          const datosBarras = mgC.map(m => ({
            name: lotesC.find(l=>l.id===m.lote_id)?.nombre ?? "—",
            ingreso: Math.round(m.ingreso_bruto),
            costo: Math.round(m.costo_directo_total),
            mb: Math.round(m.margen_bruto),
          }));

          const ref = mgC.find(m => m.precio_tn > 0);
          const rendRef = ref ? (ref.rendimiento_real || ref.rendimiento_esperado) : 0;
          const precioRef = ref?.precio_tn ?? 0;
          const mbHaRef = ref?.margen_bruto_ha ?? 0;
          const sensibilidad = ref ? [
            { escenario:"Base", rend:rendRef, precio:precioRef, mbHa:mbHaRef, mbUsd:tcVenta?mbHaRef/tcVenta:null },
            { escenario:"-10% Rend.", rend:rendRef*0.9, precio:precioRef, mbHa:mbHaRef-(rendRef*0.1*precioRef), mbUsd:tcVenta?(mbHaRef-(rendRef*0.1*precioRef))/tcVenta:null },
            { escenario:"+10% Rend.", rend:rendRef*1.1, precio:precioRef, mbHa:mbHaRef+(rendRef*0.1*precioRef), mbUsd:tcVenta?(mbHaRef+(rendRef*0.1*precioRef))/tcVenta:null },
            { escenario:"-10% Precio", rend:rendRef, precio:precioRef*0.9, mbHa:mbHaRef-(rendRef*precioRef*0.1), mbUsd:tcVenta?(mbHaRef-(rendRef*precioRef*0.1))/tcVenta:null },
            { escenario:"+10% Precio", rend:rendRef, precio:precioRef*1.1, mbHa:mbHaRef+(rendRef*precioRef*0.1), mbUsd:tcVenta?(mbHaRef+(rendRef*precioRef*0.1))/tcVenta:null },
          ] : [];

          return (
            <div>
              {/* Header */}
              <div className="rounded-2xl overflow-hidden mb-5" style={{border:`1px solid ${color}40`}}>
                <div className="px-6 py-5" style={{background:`linear-gradient(135deg, ${color}15 0%, rgba(10,22,40,0.9) 100%)`}}>
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-5xl">{icon}</span>
                    <div className="flex-1">
                      <h2 className="text-3xl font-bold text-white font-mono uppercase">{cultivoActivo}</h2>
                      <div className="flex gap-4 text-xs font-mono mt-1 flex-wrap">
                        <span style={{color}}>{totalHa} Ha · {lotesC.length} lotes</span>
                        <span className="text-[#4B5563]">Campaña: {campanas.find(c=>c.id===campanaActiva)?.nombre}</span>
                        {tcVenta && <span className="text-[#C9A227]">TC BNA: ${fmt(tcVenta)}</span>}
                      </div>
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      {[
                        {l:"INGRESO", v:"$"+fmt(totalIngreso), c:"#E5E7EB"},
                        {l:"COSTO", v:"$"+fmt(totalCosto), c:"#F87171"},
                        {l:"MB TOTAL", v:"$"+fmt(totalMB), c:totalMB>=0?"#4ADE80":"#F87171"},
                        {l:"MB/HA", v:"$"+fmt(mbHa), c:mbHa>=0?"#4ADE80":"#F87171"},
                        ...(tcVenta ? [{l:"MB USD", v:"USD "+fmt(totalMB/tcVenta), c:"#60A5FA"}] : []),
                      ].map(s=>(
                        <div key={s.l} className="text-center px-3 py-2 rounded-xl bg-[#020810]/60">
                          <div className="text-[10px] text-[#4B5563] font-mono uppercase">{s.l}</div>
                          <div className="text-base font-bold font-mono" style={{color:s.c}}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {mgC.length === 0 ? (
                <div className="card-m p-12 text-center">
                  <div className="text-4xl mb-4 opacity-20">📊</div>
                  <p className="text-[#4B5563] font-mono">Sin márgenes cargados para {cultivoActivo}</p>
                  <p className="text-[#4B5563] font-mono text-xs mt-2">Entrá a cada lote y cargá el margen desde Lotes y Cultivos</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Gráficos */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {costosAgrupados.length > 0 && (
                      <div className="card-m p-4">
                        <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">DISTRIBUCIÓN DE COSTOS</h3>
                        <div className="flex items-center gap-4">
                          <div style={{width:140,height:140,flexShrink:0}}>
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie data={costosAgrupados} cx="50%" cy="50%" outerRadius={62} innerRadius={28} dataKey="value" paddingAngle={2}>
                                  {costosAgrupados.map((e,i)=><Cell key={i} fill={e.color} stroke="rgba(2,8,16,0.5)" strokeWidth={2}/>)}
                                </Pie>
                                <Tooltip formatter={(v:any,n:string)=>["$"+fmt(Number(v)),n]} contentStyle={{background:"#0a1628",border:"1px solid rgba(201,162,39,0.3)",borderRadius:"8px",fontFamily:"monospace",fontSize:"11px"}}/>
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="flex-1 space-y-1.5">
                            {costosAgrupados.map((c,i)=>(
                              <div key={i} className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:c.color}}/>
                                <span className="text-xs font-mono flex-1 text-[#9CA3AF]">{c.name}</span>
                                <span className="text-xs font-mono font-bold" style={{color:c.color}}>${fmt(c.value/1000)}K</span>
                                <span className="text-xs text-[#4B5563] font-mono">{Math.round(c.value/totalCosto*100)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {datosBarras.length > 0 && (
                      <div className="card-m p-4">
                        <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">MB POR LOTE ($)</h3>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={datosBarras} margin={{top:0,right:0,bottom:20,left:0}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,162,39,0.1)"/>
                            <XAxis dataKey="name" tick={{fill:"#4B5563",fontSize:9,fontFamily:"monospace"}} angle={-30} textAnchor="end"/>
                            <YAxis tick={{fill:"#4B5563",fontSize:9,fontFamily:"monospace"}} tickFormatter={v=>"$"+fmt(v/1000)+"K"}/>
                            <Tooltip formatter={(v:any,n:string)=>["$"+fmt(Number(v)),n]} contentStyle={{background:"#0a1628",border:"1px solid rgba(201,162,39,0.3)",borderRadius:"8px",fontFamily:"monospace",fontSize:"11px"}}/>
                            <Bar dataKey="ingreso" fill="#4ADE8040" name="Ingreso" radius={[4,4,0,0]}/>
                            <Bar dataKey="costo" fill="#F8717140" name="Costo" radius={[4,4,0,0]}/>
                            <Bar dataKey="mb" name="Margen" radius={[4,4,0,0]}>
                              {datosBarras.map((e,i)=><Cell key={i} fill={e.mb>=0?"#4ADE80":"#F87171"}/>)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* Tabla desglose */}
                  <div className="card-m overflow-hidden">
                    <div className="px-5 py-3 border-b border-[#C9A227]/15">
                      <span className="text-[#C9A227] font-mono text-sm font-bold">DESGLOSE POR LOTE</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono">
                        <thead><tr className="border-b border-[#C9A227]/10">
                          {["LOTE","HA","REND.","PRECIO","INGRESO","SEMILLA","FERT.","AGROQUÍM.","LABORES","ALQUILER","FLETE","COMERC.","OTROS","COSTO TOTAL","MB","MB/HA","MB USD","ESTADO"].map(h=>(
                            <th key={h} className="text-left px-3 py-2.5 text-[#4B5563] whitespace-nowrap">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {mgC.map(m => {
                            const lote = lotesC.find(l => l.id === m.lote_id);
                            const mbUsd = tcVenta ? m.margen_bruto / tcVenta : null;
                            return (
                              <tr key={m.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                                <td className="px-3 py-3 font-bold text-[#E5E7EB] whitespace-nowrap">{lote?.nombre ?? "—"}</td>
                                <td className="px-3 py-3 text-[#C9A227]">{m.hectareas}</td>
                                <td className="px-3 py-3 text-[#9CA3AF]">{m.rendimiento_real||m.rendimiento_esperado}</td>
                                <td className="px-3 py-3 text-[#9CA3AF]">${fmt(m.precio_tn)}</td>
                                <td className="px-3 py-3 text-[#E5E7EB]">${fmt(m.ingreso_bruto)}</td>
                                <td className="px-3 py-3 text-[#4ADE80]">${fmt(m.costo_semilla)}</td>
                                <td className="px-3 py-3 text-[#C9A227]">${fmt(m.costo_fertilizante)}</td>
                                <td className="px-3 py-3 text-[#60A5FA]">${fmt(m.costo_agroquimicos)}</td>
                                <td className="px-3 py-3 text-[#F87171]">${fmt(m.costo_labores)}</td>
                                <td className="px-3 py-3 text-[#A78BFA]">${fmt(m.costo_alquiler)}</td>
                                <td className="px-3 py-3 text-[#F59E0B]">${fmt(m.costo_flete)}</td>
                                <td className="px-3 py-3 text-[#34D399]">${fmt(m.costo_comercializacion)}</td>
                                <td className="px-3 py-3 text-[#9CA3AF]">${fmt(m.otros_costos)}</td>
                                <td className="px-3 py-3 font-bold text-[#F87171]">${fmt(m.costo_directo_total)}</td>
                                <td className="px-3 py-3 font-bold" style={{color:m.margen_bruto>=0?"#4ADE80":"#F87171"}}>${fmt(m.margen_bruto)}</td>
                                <td className="px-3 py-3 font-bold text-[#C9A227]">${fmt(m.margen_bruto_ha)}</td>
                                <td className="px-3 py-3 font-bold text-[#60A5FA]">{mbUsd ? "USD "+fmt(mbUsd) : "—"}</td>
                                <td className="px-3 py-3"><span className="px-2 py-0.5 rounded-full font-bold" style={{background:m.estado==="real"?"rgba(74,222,128,0.15)":"rgba(201,162,39,0.15)",color:m.estado==="real"?"#4ADE80":"#C9A227"}}>{m.estado==="real"?"✅ REAL":"📋 EST."}</span></td>
                              </tr>
                            );
                          })}
                          <tr className="border-t-2 border-[#C9A227]/30 bg-[#C9A227]/5">
                            <td className="px-3 py-3 font-bold text-[#C9A227]">TOTAL</td>
                            <td className="px-3 py-3 font-bold text-[#C9A227]">{totalHa}</td>
                            <td colSpan={2}/>
                            <td className="px-3 py-3 font-bold text-[#E5E7EB]">${fmt(totalIngreso)}</td>
                            <td className="px-3 py-3 font-bold text-[#4ADE80]">${fmt(mgC.reduce((a,m)=>a+m.costo_semilla,0))}</td>
                            <td className="px-3 py-3 font-bold text-[#C9A227]">${fmt(mgC.reduce((a,m)=>a+m.costo_fertilizante,0))}</td>
                            <td className="px-3 py-3 font-bold text-[#60A5FA]">${fmt(mgC.reduce((a,m)=>a+m.costo_agroquimicos,0))}</td>
                            <td className="px-3 py-3 font-bold text-[#F87171]">${fmt(mgC.reduce((a,m)=>a+m.costo_labores,0))}</td>
                            <td className="px-3 py-3 font-bold text-[#A78BFA]">${fmt(mgC.reduce((a,m)=>a+m.costo_alquiler,0))}</td>
                            <td className="px-3 py-3 font-bold text-[#F59E0B]">${fmt(mgC.reduce((a,m)=>a+m.costo_flete,0))}</td>
                            <td className="px-3 py-3 font-bold text-[#34D399]">${fmt(mgC.reduce((a,m)=>a+m.costo_comercializacion,0))}</td>
                            <td className="px-3 py-3 font-bold text-[#9CA3AF]">${fmt(mgC.reduce((a,m)=>a+m.otros_costos,0))}</td>
                            <td className="px-3 py-3 font-bold text-[#F87171]">${fmt(totalCosto)}</td>
                            <td className="px-3 py-3 font-bold" style={{color:totalMB>=0?"#4ADE80":"#F87171"}}>${fmt(totalMB)}</td>
                            <td className="px-3 py-3 font-bold text-[#C9A227]">${fmt(mbHa)}</td>
                            <td className="px-3 py-3 font-bold text-[#60A5FA]">{tcVenta ? "USD "+fmt(totalMB/tcVenta) : "—"}</td>
                            <td/>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Análisis sensibilidad */}
                  {sensibilidad.length > 0 && (
                    <div className="card-m overflow-hidden">
                      <div className="px-5 py-3 border-b border-[#C9A227]/15">
                        <span className="text-[#60A5FA] font-mono text-sm font-bold">🔬 ANÁLISIS DE SENSIBILIDAD</span>
                        <span className="text-xs text-[#4B5563] font-mono ml-3">Impacto de cambios en precio y rendimiento</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono">
                          <thead><tr className="border-b border-[#60A5FA]/10">
                            {["ESCENARIO","REND. (tn/ha)","PRECIO ($/tn)","MB/HA","MB/HA USD"].map(h=>(
                              <th key={h} className="text-left px-4 py-2.5 text-[#4B5563]">{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {sensibilidad.map((s,i)=>(
                              <tr key={i} className={`border-b border-[#60A5FA]/5 ${i===0?"bg-[#60A5FA]/5 font-bold":""}`}>
                                <td className="px-4 py-3 text-[#E5E7EB]">{s.escenario}{i===0&&" ◀ BASE"}</td>
                                <td className="px-4 py-3 text-[#C9A227]">{s.rend.toFixed(1)}</td>
                                <td className="px-4 py-3 text-[#E5E7EB]">${fmt(s.precio)}</td>
                                <td className="px-4 py-3 font-bold" style={{color:s.mbHa>=0?"#4ADE80":"#F87171"}}>${fmt(s.mbHa)}</td>
                                <td className="px-4 py-3 font-bold text-[#60A5FA]">{s.mbUsd ? "USD "+fmt(s.mbUsd) : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ===== HACIENDA ===== */}
        {seccion === "hacienda" && (
          <div>
            <div className="rounded-2xl overflow-hidden mb-5" style={{border:"1px solid #A78BFA40"}}>
              <div className="px-6 py-5" style={{background:"linear-gradient(135deg, #A78BFA15 0%, rgba(10,22,40,0.9) 100%)"}}>
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-5xl">🐄</span>
                  <div className="flex-1">
                    <h2 className="text-3xl font-bold text-white font-mono uppercase">HACIENDA</h2>
                    <div className="text-xs font-mono text-[#A78BFA] mt-1">{hacienda.reduce((a,h)=>a+h.cantidad,0)} cabezas · {hacienda.length} categorías</div>
                  </div>
                  <div className="flex gap-3">
                    {[
                      {l:"VALOR TOTAL", v:"$"+fmt(mbHacienda), c:"#4ADE80"},
                      ...(tcVenta ? [{l:"EN USD", v:"USD "+fmt(mbHacienda/tcVenta), c:"#60A5FA"}] : []),
                    ].map(s=>(
                      <div key={s.l} className="text-center px-3 py-2 rounded-xl bg-[#020810]/60">
                        <div className="text-[10px] text-[#4B5563] font-mono uppercase">{s.l}</div>
                        <div className="text-lg font-bold font-mono" style={{color:s.c}}>{s.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hacienda.map(h => {
                const valorTotal = h.cantidad * (h.peso_promedio||0) * (h.precio_kg||0);
                const valorUsd = tcVenta ? valorTotal / tcVenta : null;
                return (
                  <div key={h.id} className="card-m p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="font-bold text-[#E5E7EB] font-mono text-lg">{h.nombre}</div>
                        <div className="text-xs text-[#A78BFA] font-mono">{h.cantidad} cabezas</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-[#4ADE80] font-mono">${fmt(valorTotal)}</div>
                        {valorUsd && <div className="text-xs text-[#60A5FA] font-mono">USD {fmt(valorUsd)}</div>}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                      <div className="bg-[#020810]/40 rounded-lg p-2 text-center">
                        <div className="text-[#4B5563] mb-1">CABEZAS</div>
                        <div className="font-bold text-[#A78BFA]">{h.cantidad}</div>
                      </div>
                      <div className="bg-[#020810]/40 rounded-lg p-2 text-center">
                        <div className="text-[#4B5563] mb-1">PESO PROM.</div>
                        <div className="font-bold text-[#C9A227]">{h.peso_promedio||"—"} kg</div>
                      </div>
                      <div className="bg-[#020810]/40 rounded-lg p-2 text-center">
                        <div className="text-[#4B5563] mb-1">PRECIO/KG</div>
                        <div className="font-bold text-[#4ADE80]">${fmt(h.precio_kg||0)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 tracking-widest font-mono mt-6">© AGROGESTION PRO · MARGEN BRUTO</p>
    </div>
  );
}
