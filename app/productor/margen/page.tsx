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
  soja:"#22c55e", maiz:"#d97706", trigo:"#f59e0b", girasol:"#fbbf24",
  sorgo:"#ef4444", cebada:"#a78bfa", arveja:"#34d399", otro:"#60a5fa",
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
  const [tcVenta, setTcVenta] = useState<number|null>(null);
  const [tcCompra, setTcCompra] = useState<number|null>(null);
  const [tcFecha, setTcFecha] = useState<string>("");
  const [tcLoading, setTcLoading] = useState(true);
  const [tcError, setTcError] = useState(false);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  const fetchTC = async (eid: string) => {
    setTcLoading(true); setTcError(false);
    try {
      const res = await fetch("/api/cotizacion");
      const data = await res.json();
      if (data.venta) {
        setTcVenta(data.venta); setTcCompra(data.compra); setTcFecha(data.fecha);
        const sb = await getSB();
        const hoy = new Date().toISOString().split("T")[0];
        const { data: existing } = await sb.from("finanzas_cotizaciones").select("id").eq("empresa_id", eid).eq("fecha", hoy).single();
        if (!existing) { await sb.from("finanzas_cotizaciones").insert({ empresa_id: eid, fecha: hoy, usd_oficial: data.venta, usd_mep: 0, usd_blue: 0, usd_usado: data.venta }); }
        else { await sb.from("finanzas_cotizaciones").update({ usd_oficial: data.venta, usd_usado: data.venta }).eq("id", existing.id); }
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
    await Promise.all([fetchTC(emp.id), fetchData(emp.id, cid)]);
    setLoading(false);
  };

  const fetchData = async (eid: string, cid: string) => {
    const sb = await getSB();
    // Primero traer lotes de la campaña seleccionada
    const { data: lotesData } = await sb.from("lotes")
      .select("id,nombre,hectareas,cultivo,cultivo_orden,cultivo_completo")
      .eq("empresa_id", eid).eq("campana_id", cid).eq("es_segundo_cultivo", false);
    const loteIds = (lotesData ?? []).map((l: any) => l.id);
    // Traer márgenes SOLO de los lotes de esa campaña
    const [mg, hac] = await Promise.all([
      loteIds.length > 0
        ? sb.from("margen_bruto_detalle").select("*").eq("empresa_id", eid).in("lote_id", loteIds)
        : Promise.resolve({ data: [] }),
      sb.from("hacienda_categorias").select("*").eq("empresa_id", eid),
    ]);
    setMargenes(mg.data ?? []);
    setLotes(lotesData ?? []);
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

  if (loading) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:32,height:32,border:"3px solid #1976d2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#1565c0",fontWeight:600}}>Cargando Márgenes...</span>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"scroll"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}

        .inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:7px 12px;font-size:12px;font-family:'DM Sans',system-ui;}
        .inp option{background:white;color:#1a2a4a;}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;}

        .topbar-mg{background-image:url('/FON.png');background-size:cover;background-position:top center;border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar-mg::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar-mg>*{position:relative;z-index:1;}

        .card-g{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid rgba(255,255,255,1);border-radius:18px;box-shadow:0 6px 24px rgba(20,80,160,0.14),inset 0 2px 0 rgba(255,255,255,0.90);position:relative;overflow:hidden;}
        .card-g::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);pointer-events:none;z-index:0;}
        .card-g>*{position:relative;z-index:1;}

        .sec-w{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.92);border-radius:16px;box-shadow:0 4px 18px rgba(20,80,160,0.10);overflow:hidden;}

        .kpi-mg{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.90);border-radius:14px;padding:14px;text-align:center;transition:all 0.18s;}

        .cult-card{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.88);border-radius:16px;box-shadow:0 4px 16px rgba(20,80,160,0.12);cursor:pointer;transition:all 0.20s;position:relative;overflow:hidden;}
        .cult-card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.60);pointer-events:none;}
        .cult-card>*{position:relative;}
        .cult-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(20,80,160,0.18);}

        .row-mg:hover{background:rgba(255,255,255,0.95)!important;}
        .fade-in{animation:fadeIn 0.20s ease;}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar-mg" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",flexWrap:"wrap"}}>
          <button onClick={()=>cultivoActivo||seccion==="hacienda"?setSeccion("resumen"):window.location.href="/productor/dashboard"}
            style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700,flexShrink:0}}>
            ← {cultivoActivo||seccion==="hacienda"?"Volver":"Dashboard"}
          </button>
          <div style={{flex:1}}/>

          {/* TC BNA */}
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",borderRadius:10,border:"1.5px solid rgba(217,119,6,0.30)",background:"rgba(217,119,6,0.07)"}}>
            {tcLoading?(
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:12,height:12,border:"2px solid #d97706",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
                <span style={{fontSize:11,color:"#6b8aaa",fontWeight:600}}>BNA...</span>
              </div>
            ):tcError?(
              <div style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}} onClick={()=>empresaId&&fetchTC(empresaId)}>
                <span style={{fontSize:11,color:"#dc2626",fontWeight:700}}>⚠ Sin cotización ↺</span>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div>
                  <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>BNA DIVISA VENTA</div>
                  <div style={{fontSize:14,fontWeight:800,color:"#d97706",lineHeight:1.1}}>${fmt(tcVenta??0)}</div>
                </div>
                {tcCompra&&<div>
                  <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>COMPRA</div>
                  <div style={{fontSize:12,color:"#6b8aaa",lineHeight:1.1}}>${fmt(tcCompra)}</div>
                </div>}
                <div>
                  <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>FECHA</div>
                  <div style={{fontSize:11,color:"#6b8aaa",lineHeight:1.1}}>{tcFecha}</div>
                </div>
                <button onClick={()=>empresaId&&fetchTC(empresaId)} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:14}}>↺</button>
              </div>
            )}
          </div>

          {/* Selector campaña */}
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <span style={{fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>Campaña:</span>
            <select value={campanaActiva} onChange={e=>cambiarCampana(e.target.value)} className="inp" style={{minWidth:110,color:"#d97706",fontWeight:700}}>
              {campanas.map(c=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
            </select>
          </div>

          <button onClick={()=>window.location.href="/productor/dashboard"} style={{background:"none",border:"none",cursor:"pointer"}}>
            <Image src="/logo.png" alt="" width={90} height={32} style={{objectFit:"contain"}}/>
          </button>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"14px 14px 80px"}}>

        {/* ══════════════════════════════
            RESUMEN
        ══════════════════════════════ */}
        {seccion==="resumen"&&(
          <div className="fade-in">
            <div style={{marginBottom:14}}>
              <h1 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>📊 Margen Bruto</h1>
              <p style={{fontSize:11,color:"#6b8aaa",margin:"2px 0 0",fontWeight:600}}>Rentabilidad por cultivo y campaña · TC BNA Divisa Venta</p>
            </div>

            {/* KPIs generales */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10,marginBottom:12}}>
              {[
                {l:"Ha Totales",v:fmt(totalHaGeneral)+" Ha",c:"#d97706"},
                {l:"Ingreso Bruto",v:"$"+fmt(totalIngresoGeneral),c:"#0d2137"},
                {l:"Costo Total",v:"$"+fmt(totalCostoGeneral),c:"#dc2626"},
                {l:"Margen Bruto",v:"$"+fmt(totalMBGeneral),c:totalMBGeneral>=0?"#16a34a":"#dc2626"},
              ].map(s=>(
                <div key={s.l} className="kpi-mg">
                  <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>{s.l}</div>
                  <div style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* MB/Ha + USD */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
              <div className="kpi-mg">
                <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>MB / Hectárea</div>
                <div style={{fontSize:22,fontWeight:800,color:mbHaGeneral>=0?"#16a34a":"#dc2626"}}>${fmt(mbHaGeneral)}</div>
                <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600,marginTop:2}}>por ha</div>
              </div>
              <div className="kpi-mg">
                <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>MB en USD</div>
                <div style={{fontSize:22,fontWeight:800,color:"#1565c0"}}>{tcVenta?`USD ${fmt(totalMBGeneral/tcVenta)}`:"—"}</div>
                <div style={{fontSize:10,fontWeight:700,marginTop:2,color:tcVenta?"#d97706":"#6b8aaa"}}>{tcVenta?`TC BNA $${fmt(tcVenta)}`:"Sin TC"}</div>
              </div>
              <div className="kpi-mg">
                <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Lotes con MB</div>
                <div style={{fontSize:22,fontWeight:800,color:"#d97706"}}>{margenes.length}</div>
                <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600,marginTop:2}}>de {lotes.length} lotes</div>
              </div>
            </div>

            {/* Tarjetas por cultivo */}
            <div style={{fontSize:11,fontWeight:800,color:"#0d2137",textTransform:"uppercase",letterSpacing:0.8,marginBottom:10}}>◆ Por Cultivo</div>

            {cultivosUnicos.length===0?(
              <div className="kpi-mg" style={{padding:"48px 20px",textAlign:"center"}}>
                <div style={{fontSize:40,opacity:0.12,marginBottom:10}}>📊</div>
                <p style={{color:"#6b8aaa",fontSize:14}}>Sin datos de margen bruto para esta campaña</p>
                <p style={{color:"#6b8aaa",fontSize:11,marginTop:4}}>Cargá los márgenes desde el módulo de Lotes</p>
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12,marginBottom:16}}>
                {cultivosUnicos.map(cultivo=>{
                  const {totalHa,totalMB,mbHa,mgC,totalIngreso,totalCosto,estimados,reales}=margenPorCultivo(cultivo);
                  const color=CULTIVO_COLORS[cultivo]??"#6b7280";
                  const icon=CULTIVO_ICONS[cultivo]??"🌾";
                  const tieneMB=mgC.length>0;
                  return(
                    <div key={cultivo} className="cult-card" onClick={()=>setSeccion("cultivo:"+cultivo)}>
                      {/* Cabecera */}
                      <div style={{padding:"12px 14px",background:`${color}18`,borderBottom:`1px solid ${color}30`,display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:22}}>{icon}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:14,fontWeight:800,color:"#0d2137",textTransform:"uppercase"}}>{cultivo}</div>
                          <div style={{fontSize:11,fontWeight:600,color}}>{totalHa} Ha · {mgC.length} lotes con MB</div>
                        </div>
                        <div>
                          {reales>0&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:"rgba(22,163,74,0.12)",color:"#16a34a"}}>✅ REAL</span>}
                          {estimados>0&&reales===0&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:"rgba(217,119,6,0.12)",color:"#d97706"}}>📋 EST.</span>}
                        </div>
                      </div>
                      <div style={{padding:"12px 14px 14px"}}>
                        {tieneMB?(
                          <>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                              {[{l:"INGRESO",v:"$"+fmt(totalIngreso/1000000)+"M",c:"#0d2137"},{l:"COSTO",v:"$"+fmt(totalCosto/1000000)+"M",c:"#dc2626"},{l:"MB/HA",v:"$"+fmt(mbHa),c:mbHa>=0?"#16a34a":"#dc2626"}].map(s=>(
                                <div key={s.l} style={{textAlign:"center",padding:"6px 4px",borderRadius:8,background:"rgba(255,255,255,0.60)"}}>
                                  <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{s.l}</div>
                                  <div style={{fontSize:12,fontWeight:800,color:s.c}}>{s.v}</div>
                                </div>
                              ))}
                            </div>
                            {tcVenta&&(
                              <div style={{padding:"6px 10px",borderRadius:8,background:"rgba(25,118,210,0.07)",border:"1px solid rgba(25,118,210,0.18)",display:"flex",justifyContent:"space-between",fontSize:11}}>
                                <span style={{color:"#6b8aaa",fontWeight:600}}>MB en USD (BNA ${fmt(tcVenta)})</span>
                                <span style={{fontWeight:800,color:"#1565c0"}}>USD {fmt(totalMB/tcVenta)}</span>
                              </div>
                            )}
                          </>
                        ):(
                          <div style={{textAlign:"center",padding:"12px 0",color:"#6b8aaa",fontSize:11}}>Sin margen cargado — tocá para ver</div>
                        )}
                        <div style={{marginTop:10,paddingTop:8,borderTop:"1px solid rgba(0,60,140,0.08)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{fontSize:11,color:"#6b8aaa",fontWeight:600}}>MB TOTAL</span>
                          <span style={{fontWeight:800,fontSize:14,color:totalMB>=0?"#16a34a":"#dc2626"}}>{tieneMB?"$"+fmt(totalMB):"—"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Tarjeta Hacienda */}
                {tieneHacienda&&(
                  <div className="cult-card" onClick={()=>setSeccion("hacienda")}>
                    <div style={{padding:"12px 14px",background:"rgba(124,58,237,0.12)",borderBottom:"1px solid rgba(124,58,237,0.22)",display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:22}}>🐄</span>
                      <div>
                        <div style={{fontSize:14,fontWeight:800,color:"#0d2137",textTransform:"uppercase"}}>Hacienda</div>
                        <div style={{fontSize:11,fontWeight:600,color:"#7c3aed"}}>{hacienda.reduce((a,h)=>a+h.cantidad,0)} cabezas · {hacienda.length} categorías</div>
                      </div>
                    </div>
                    <div style={{padding:"12px 14px 14px"}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                        {[{l:"CABEZAS",v:String(hacienda.reduce((a,h)=>a+h.cantidad,0)),c:"#7c3aed"},{l:"VALOR EST.",v:"$"+fmt(mbHacienda/1000000)+"M",c:"#16a34a"}].map(s=>(
                          <div key={s.l} style={{textAlign:"center",padding:"6px 4px",borderRadius:8,background:"rgba(255,255,255,0.60)"}}>
                            <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{s.l}</div>
                            <div style={{fontSize:12,fontWeight:800,color:s.c}}>{s.v}</div>
                          </div>
                        ))}
                      </div>
                      {tcVenta&&<div style={{padding:"6px 10px",borderRadius:8,background:"rgba(25,118,210,0.07)",border:"1px solid rgba(25,118,210,0.18)",display:"flex",justifyContent:"space-between",fontSize:11}}><span style={{color:"#6b8aaa",fontWeight:600}}>En USD (BNA ${fmt(tcVenta)})</span><span style={{fontWeight:800,color:"#1565c0"}}>USD {fmt(mbHacienda/tcVenta)}</span></div>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tabla todos los lotes */}
            {margenes.length>0&&(
              <div className="sec-w">
                <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(0,60,140,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                  <span style={{fontSize:12,fontWeight:800,color:"#0d2137"}}>📋 Todos los Lotes</span>
                  {tcVenta&&<span style={{fontSize:11,color:"#d97706",fontWeight:700}}>TC BNA Divisa Venta: ${fmt(tcVenta)}</span>}
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse",minWidth:900}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["LOTE","CULTIVO","HA","REND.","INGRESO","COSTO","MARGEN","MB/HA","MB USD","ESTADO"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                    <tbody>
                      {margenes.map(m=>{
                        const lote=lotes.find(l=>l.id===m.lote_id);
                        const color=CULTIVO_COLORS[m.cultivo]??"#6b7280";
                        const mbUsd=tcVenta?m.margen_bruto/tcVenta:null;
                        return(
                          <tr key={m.id} className="row-mg" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",cursor:"pointer",transition:"background 0.15s"}} onClick={()=>setSeccion("cultivo:"+m.cultivo)}>
                            <td style={{padding:"8px 12px",fontWeight:800,color:"#0d2137"}}>{lote?.nombre??"—"}</td>
                            <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:`${color}20`,color}}>{CULTIVO_ICONS[m.cultivo]??""} {m.cultivo?.toUpperCase()}</span></td>
                            <td style={{padding:"8px 12px",color:"#6b8aaa"}}>{m.hectareas}</td>
                            <td style={{padding:"8px 12px",color:"#d97706",fontWeight:600}}>{m.rendimiento_real||m.rendimiento_esperado} tn/ha</td>
                            <td style={{padding:"8px 12px",fontWeight:600,color:"#0d2137"}}>${fmt(m.ingreso_bruto)}</td>
                            <td style={{padding:"8px 12px",color:"#dc2626",fontWeight:600}}>${fmt(m.costo_directo_total)}</td>
                            <td style={{padding:"8px 12px",fontWeight:800,color:m.margen_bruto>=0?"#16a34a":"#dc2626"}}>${fmt(m.margen_bruto)}</td>
                            <td style={{padding:"8px 12px",color:"#d97706",fontWeight:700}}>${fmt(m.margen_bruto_ha)}</td>
                            <td style={{padding:"8px 12px",color:"#1565c0",fontWeight:700}}>{mbUsd?"USD "+fmt(mbUsd):"—"}</td>
                            <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:m.estado==="real"?"rgba(22,163,74,0.12)":"rgba(217,119,6,0.12)",color:m.estado==="real"?"#16a34a":"#d97706"}}>{m.estado==="real"?"✅ REAL":"📋 EST."}</span></td>
                          </tr>
                        );
                      })}
                      <tr style={{borderTop:"2px solid rgba(0,60,140,0.12)",background:"rgba(217,119,6,0.05)"}}>
                        <td colSpan={4} style={{padding:"8px 12px",fontWeight:800,color:"#d97706",fontSize:12}}>TOTALES</td>
                        <td style={{padding:"8px 12px",fontWeight:800,color:"#0d2137"}}>${fmt(totalIngresoGeneral)}</td>
                        <td style={{padding:"8px 12px",fontWeight:800,color:"#dc2626"}}>${fmt(totalCostoGeneral)}</td>
                        <td style={{padding:"8px 12px",fontWeight:800,color:totalMBGeneral>=0?"#16a34a":"#dc2626"}}>${fmt(totalMBGeneral)}</td>
                        <td style={{padding:"8px 12px",fontWeight:800,color:"#d97706"}}>${fmt(mbHaGeneral)}</td>
                        <td style={{padding:"8px 12px",fontWeight:800,color:"#1565c0"}}>{tcVenta?"USD "+fmt(totalMBGeneral/tcVenta):"—"}</td>
                        <td/>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════
            DETALLE CULTIVO
        ══════════════════════════════ */}
        {cultivoActivo&&(()=>{
          const color=CULTIVO_COLORS[cultivoActivo]??"#6b7280";
          const icon=CULTIVO_ICONS[cultivoActivo]??"🌾";
          const {lotesC,mgC,totalHa,totalIngreso,totalCosto,totalMB,mbHa}=margenPorCultivo(cultivoActivo);

          const costosAgrupados=mgC.length>0?[
            {name:"Semillas",value:mgC.reduce((a,m)=>a+m.costo_semilla,0),color:"#22c55e"},
            {name:"Fertilizantes",value:mgC.reduce((a,m)=>a+m.costo_fertilizante,0),color:"#d97706"},
            {name:"Agroquímicos",value:mgC.reduce((a,m)=>a+m.costo_agroquimicos,0),color:"#1565c0"},
            {name:"Labores",value:mgC.reduce((a,m)=>a+m.costo_labores,0),color:"#ef4444"},
            {name:"Alquiler",value:mgC.reduce((a,m)=>a+m.costo_alquiler,0),color:"#7c3aed"},
            {name:"Flete",value:mgC.reduce((a,m)=>a+m.costo_flete,0),color:"#f59e0b"},
            {name:"Comercialización",value:mgC.reduce((a,m)=>a+m.costo_comercializacion,0),color:"#34d399"},
            {name:"Otros",value:mgC.reduce((a,m)=>a+m.otros_costos,0),color:"#9ca3af"},
          ].filter(c=>c.value>0):[];

          const datosBarras=mgC.map(m=>({
            name:lotesC.find(l=>l.id===m.lote_id)?.nombre??"—",
            ingreso:Math.round(m.ingreso_bruto),
            costo:Math.round(m.costo_directo_total),
            mb:Math.round(m.margen_bruto),
          }));

          const ref=mgC.find(m=>m.precio_tn>0);
          const rendRef=ref?(ref.rendimiento_real||ref.rendimiento_esperado):0;
          const precioRef=ref?.precio_tn??0;
          const mbHaRef=ref?.margen_bruto_ha??0;
          const sensibilidad=ref?[
            {escenario:"Base",rend:rendRef,precio:precioRef,mbHa:mbHaRef,mbUsd:tcVenta?mbHaRef/tcVenta:null},
            {escenario:"-10% Rend.",rend:rendRef*0.9,precio:precioRef,mbHa:mbHaRef-(rendRef*0.1*precioRef),mbUsd:tcVenta?(mbHaRef-(rendRef*0.1*precioRef))/tcVenta:null},
            {escenario:"+10% Rend.",rend:rendRef*1.1,precio:precioRef,mbHa:mbHaRef+(rendRef*0.1*precioRef),mbUsd:tcVenta?(mbHaRef+(rendRef*0.1*precioRef))/tcVenta:null},
            {escenario:"-10% Precio",rend:rendRef,precio:precioRef*0.9,mbHa:mbHaRef-(rendRef*precioRef*0.1),mbUsd:tcVenta?(mbHaRef-(rendRef*precioRef*0.1))/tcVenta:null},
            {escenario:"+10% Precio",rend:rendRef,precio:precioRef*1.1,mbHa:mbHaRef+(rendRef*precioRef*0.1),mbUsd:tcVenta?(mbHaRef+(rendRef*precioRef*0.1))/tcVenta:null},
          ]:[];

          return(
            <div className="fade-in">
              {/* Header cultivo */}
              <div className="card-g" style={{padding:0,overflow:"hidden",marginBottom:14}}>
                <div style={{padding:"16px 18px",background:`linear-gradient(135deg,${color}20 0%,rgba(255,255,255,0.20) 100%)`}}>
                  <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
                    <span style={{fontSize:40}}>{icon}</span>
                    <div style={{flex:1}}>
                      <h2 style={{fontSize:22,fontWeight:800,color:"#0d2137",margin:0,textTransform:"uppercase"}}>{cultivoActivo}</h2>
                      <div style={{display:"flex",gap:12,fontSize:11,marginTop:3,flexWrap:"wrap"}}>
                        <span style={{color,fontWeight:600}}>{totalHa} Ha · {lotesC.length} lotes</span>
                        <span style={{color:"#6b8aaa"}}>Campaña: {campanas.find(c=>c.id===campanaActiva)?.nombre}</span>
                        {tcVenta&&<span style={{color:"#d97706",fontWeight:700}}>TC BNA: ${fmt(tcVenta)}</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {[
                        {l:"INGRESO",v:"$"+fmt(totalIngreso),c:"#0d2137"},
                        {l:"COSTO",v:"$"+fmt(totalCosto),c:"#dc2626"},
                        {l:"MB TOTAL",v:"$"+fmt(totalMB),c:totalMB>=0?"#16a34a":"#dc2626"},
                        {l:"MB/HA",v:"$"+fmt(mbHa),c:mbHa>=0?"#16a34a":"#dc2626"},
                        ...(tcVenta?[{l:"MB USD",v:"USD "+fmt(totalMB/tcVenta),c:"#1565c0"}]:[]),
                      ].map(s=>(
                        <div key={s.l} style={{textAlign:"center",padding:"7px 12px",borderRadius:10,background:"rgba(255,255,255,0.60)"}}>
                          <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{s.l}</div>
                          <div style={{fontSize:13,fontWeight:800,color:s.c}}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {mgC.length===0?(
                <div className="kpi-mg" style={{padding:"48px 20px",textAlign:"center"}}>
                  <div style={{fontSize:40,opacity:0.12,marginBottom:10}}>📊</div>
                  <p style={{color:"#6b8aaa",fontSize:14}}>Sin márgenes cargados para {cultivoActivo}</p>
                  <p style={{color:"#6b8aaa",fontSize:11,marginTop:4}}>Entrá a cada lote y cargá el margen desde Lotes y Cultivos</p>
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  {/* Gráficos */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                    {costosAgrupados.length>0&&(
                      <div className="sec-w" style={{padding:14}}>
                        <div style={{fontSize:12,fontWeight:800,color:"#0d2137",marginBottom:12}}>Distribución de Costos</div>
                        <div style={{display:"flex",alignItems:"center",gap:12}}>
                          <div style={{width:130,height:130,flexShrink:0}}>
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie data={costosAgrupados} cx="50%" cy="50%" outerRadius={58} innerRadius={26} dataKey="value" paddingAngle={2}>
                                  {costosAgrupados.map((e,i)=><Cell key={i} fill={e.color} stroke="rgba(255,255,255,0.5)" strokeWidth={2}/>)}
                                </Pie>
                                <Tooltip formatter={(v:any,n:string)=>["$"+fmt(Number(v)),n]} contentStyle={{background:"rgba(255,255,255,0.97)",border:"1px solid rgba(180,210,240,0.55)",borderRadius:"10px",fontSize:"11px"}}/>
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div style={{flex:1,display:"flex",flexDirection:"column",gap:5}}>
                            {costosAgrupados.map((c,i)=>(
                              <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
                                <div style={{width:8,height:8,borderRadius:"50%",background:c.color,flexShrink:0}}/>
                                <span style={{fontSize:11,color:"#6b8aaa",flex:1}}>{c.name}</span>
                                <span style={{fontSize:11,fontWeight:700,color:c.color}}>${fmt(c.value/1000)}K</span>
                                <span style={{fontSize:10,color:"#6b8aaa"}}>{Math.round(c.value/totalCosto*100)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {datosBarras.length>0&&(
                      <div className="sec-w" style={{padding:14}}>
                        <div style={{fontSize:12,fontWeight:800,color:"#0d2137",marginBottom:12}}>MB por Lote ($)</div>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={datosBarras} margin={{top:0,right:0,bottom:20,left:0}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,60,140,0.07)"/>
                            <XAxis dataKey="name" tick={{fill:"#6b8aaa",fontSize:9}} angle={-30} textAnchor="end"/>
                            <YAxis tick={{fill:"#6b8aaa",fontSize:9}} tickFormatter={v=>"$"+fmt(v/1000)+"K"}/>
                            <Tooltip formatter={(v:any,n:string)=>["$"+fmt(Number(v)),n]} contentStyle={{background:"rgba(255,255,255,0.97)",border:"1px solid rgba(180,210,240,0.55)",borderRadius:"10px",fontSize:"11px"}}/>
                            <Bar dataKey="ingreso" fill="rgba(22,163,74,0.30)" name="Ingreso" radius={[4,4,0,0]}/>
                            <Bar dataKey="costo" fill="rgba(220,38,38,0.30)" name="Costo" radius={[4,4,0,0]}/>
                            <Bar dataKey="mb" name="Margen" radius={[4,4,0,0]}>
                              {datosBarras.map((e,i)=><Cell key={i} fill={e.mb>=0?"#16a34a":"#dc2626"}/>)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* Tabla desglose */}
                  <div className="sec-w">
                    <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(0,60,140,0.06)"}}><span style={{fontSize:12,fontWeight:800,color:"#0d2137"}}>Desglose por Lote</span></div>
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:1200}}>
                        <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["LOTE","HA","REND.","PRECIO","INGRESO","SEMILLA","FERT.","AGROQUÍM.","LABORES","ALQUILER","FLETE","COMERC.","OTROS","COSTO TOTAL","MB","MB/HA","MB USD","ESTADO"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 10px",fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                        <tbody>
                          {mgC.map(m=>{
                            const lote=lotesC.find(l=>l.id===m.lote_id);
                            const mbUsd=tcVenta?m.margen_bruto/tcVenta:null;
                            return(
                              <tr key={m.id} className="row-mg" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",transition:"background 0.15s"}}>
                                <td style={{padding:"7px 10px",fontWeight:800,color:"#0d2137",whiteSpace:"nowrap"}}>{lote?.nombre??"—"}</td>
                                <td style={{padding:"7px 10px",color:"#d97706",fontWeight:700}}>{m.hectareas}</td>
                                <td style={{padding:"7px 10px",color:"#6b8aaa"}}>{m.rendimiento_real||m.rendimiento_esperado}</td>
                                <td style={{padding:"7px 10px",color:"#6b8aaa"}}>${fmt(m.precio_tn)}</td>
                                <td style={{padding:"7px 10px",color:"#0d2137",fontWeight:600}}>${fmt(m.ingreso_bruto)}</td>
                                <td style={{padding:"7px 10px",color:"#22c55e",fontWeight:600}}>${fmt(m.costo_semilla)}</td>
                                <td style={{padding:"7px 10px",color:"#d97706",fontWeight:600}}>${fmt(m.costo_fertilizante)}</td>
                                <td style={{padding:"7px 10px",color:"#1565c0",fontWeight:600}}>${fmt(m.costo_agroquimicos)}</td>
                                <td style={{padding:"7px 10px",color:"#dc2626",fontWeight:600}}>${fmt(m.costo_labores)}</td>
                                <td style={{padding:"7px 10px",color:"#7c3aed",fontWeight:600}}>${fmt(m.costo_alquiler)}</td>
                                <td style={{padding:"7px 10px",color:"#d97706"}}>${fmt(m.costo_flete)}</td>
                                <td style={{padding:"7px 10px",color:"#16a34a"}}>${fmt(m.costo_comercializacion)}</td>
                                <td style={{padding:"7px 10px",color:"#6b8aaa"}}>${fmt(m.otros_costos)}</td>
                                <td style={{padding:"7px 10px",fontWeight:800,color:"#dc2626"}}>${fmt(m.costo_directo_total)}</td>
                                <td style={{padding:"7px 10px",fontWeight:800,color:m.margen_bruto>=0?"#16a34a":"#dc2626"}}>${fmt(m.margen_bruto)}</td>
                                <td style={{padding:"7px 10px",fontWeight:800,color:"#d97706"}}>${fmt(m.margen_bruto_ha)}</td>
                                <td style={{padding:"7px 10px",fontWeight:800,color:"#1565c0"}}>{mbUsd?"USD "+fmt(mbUsd):"—"}</td>
                                <td style={{padding:"7px 10px"}}><span style={{fontSize:9,padding:"2px 7px",borderRadius:20,fontWeight:700,background:m.estado==="real"?"rgba(22,163,74,0.12)":"rgba(217,119,6,0.12)",color:m.estado==="real"?"#16a34a":"#d97706"}}>{m.estado==="real"?"✅ REAL":"📋 EST."}</span></td>
                              </tr>
                            );
                          })}
                          {/* Fila totales */}
                          <tr style={{borderTop:"2px solid rgba(0,60,140,0.10)",background:"rgba(217,119,6,0.05)"}}>
                            <td style={{padding:"8px 10px",fontWeight:800,color:"#d97706",fontSize:12}}>TOTAL</td>
                            <td style={{padding:"8px 10px",fontWeight:800,color:"#d97706"}}>{totalHa}</td>
                            <td colSpan={2}/>
                            <td style={{padding:"8px 10px",fontWeight:800,color:"#0d2137"}}>${fmt(totalIngreso)}</td>
                            <td style={{padding:"8px 10px",fontWeight:800,color:"#22c55e"}}>${fmt(mgC.reduce((a,m)=>a+m.costo_semilla,0))}</td>
                            <td style={{padding:"8px 10px",fontWeight:800,color:"#d97706"}}>${fmt(mgC.reduce((a,m)=>a+m.costo_fertilizante,0))}</td>
                            <td style={{padding:"8px 10px",fontWeight:800,color:"#1565c0"}}>${fmt(mgC.reduce((a,m)=>a+m.costo_agroquimicos,0))}</td>
                            <td style={{padding:"8px 10px",fontWeight:800,color:"#dc2626"}}>${fmt(mgC.reduce((a,m)=>a+m.costo_labores,0))}</td>
                            <td style={{padding:"8px 10px",fontWeight:800,color:"#7c3aed"}}>${fmt(mgC.reduce((a,m)=>a+m.costo_alquiler,0))}</td>
                            <td style={{padding:"8px 10px",fontWeight:800,color:"#d97706"}}>${fmt(mgC.reduce((a,m)=>a+m.costo_flete,0))}</td>
                            <td style={{padding:"8px 10px",fontWeight:800,color:"#16a34a"}}>${fmt(mgC.reduce((a,m)=>a+m.costo_comercializacion,0))}</td>
                            <td style={{padding:"8px 10px",fontWeight:800,color:"#6b8aaa"}}>${fmt(mgC.reduce((a,m)=>a+m.otros_costos,0))}</td>
                            <td style={{padding:"8px 10px",fontWeight:800,color:"#dc2626"}}>${fmt(totalCosto)}</td>
                            <td style={{padding:"8px 10px",fontWeight:800,color:totalMB>=0?"#16a34a":"#dc2626"}}>${fmt(totalMB)}</td>
                            <td style={{padding:"8px 10px",fontWeight:800,color:"#d97706"}}>${fmt(mbHa)}</td>
                            <td style={{padding:"8px 10px",fontWeight:800,color:"#1565c0"}}>{tcVenta?"USD "+fmt(totalMB/tcVenta):"—"}</td>
                            <td/>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Sensibilidad */}
                  {sensibilidad.length>0&&(
                    <div className="sec-w">
                      <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(0,60,140,0.06)"}}>
                        <span style={{fontSize:12,fontWeight:800,color:"#1565c0"}}>🔬 Análisis de Sensibilidad</span>
                        <span style={{fontSize:11,color:"#6b8aaa",marginLeft:10}}>Impacto de cambios en precio y rendimiento</span>
                      </div>
                      <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                        <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.06)"}}>{["ESCENARIO","REND. (tn/ha)","PRECIO ($/tn)","MB/HA","MB/HA USD"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                        <tbody>{sensibilidad.map((s,i)=>(
                          <tr key={i} className="row-mg" style={{borderBottom:"1px solid rgba(0,60,140,0.04)",background:i===0?"rgba(25,118,210,0.06)":"transparent",transition:"background 0.15s"}}>
                            <td style={{padding:"8px 12px",fontWeight:i===0?800:600,color:"#0d2137"}}>{s.escenario}{i===0&&" ◀ BASE"}</td>
                            <td style={{padding:"8px 12px",color:"#d97706",fontWeight:700}}>{s.rend.toFixed(1)}</td>
                            <td style={{padding:"8px 12px",fontWeight:600,color:"#0d2137"}}>${fmt(s.precio)}</td>
                            <td style={{padding:"8px 12px",fontWeight:800,color:s.mbHa>=0?"#16a34a":"#dc2626"}}>${fmt(s.mbHa)}</td>
                            <td style={{padding:"8px 12px",fontWeight:800,color:"#1565c0"}}>{s.mbUsd?"USD "+fmt(s.mbUsd):"—"}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ══════════════════════════════
            HACIENDA
        ══════════════════════════════ */}
        {seccion==="hacienda"&&(
          <div className="fade-in">
            <div className="card-g" style={{padding:0,overflow:"hidden",marginBottom:14}}>
              <div style={{padding:"16px 18px",background:"rgba(124,58,237,0.12)"}}>
                <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
                  <span style={{fontSize:40}}>🐄</span>
                  <div style={{flex:1}}>
                    <h2 style={{fontSize:22,fontWeight:800,color:"#0d2137",margin:0,textTransform:"uppercase"}}>Hacienda</h2>
                    <div style={{fontSize:11,color:"#7c3aed",fontWeight:600,marginTop:3}}>{hacienda.reduce((a,h)=>a+h.cantidad,0)} cabezas · {hacienda.length} categorías</div>
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    {[{l:"VALOR TOTAL",v:"$"+fmt(mbHacienda),c:"#16a34a"},...(tcVenta?[{l:"EN USD",v:"USD "+fmt(mbHacienda/tcVenta),c:"#1565c0"}]:[])].map(s=>(
                      <div key={s.l} style={{textAlign:"center",padding:"8px 14px",borderRadius:10,background:"rgba(255,255,255,0.60)"}}>
                        <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{s.l}</div>
                        <div style={{fontSize:16,fontWeight:800,color:s.c}}>{s.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
              {hacienda.map(h=>{
                const valorTotal=h.cantidad*(h.peso_promedio||0)*(h.precio_kg||0);
                const valorUsd=tcVenta?valorTotal/tcVenta:null;
                return(
                  <div key={h.id} className="kpi-mg" style={{textAlign:"left"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                      <div>
                        <div style={{fontSize:15,fontWeight:800,color:"#0d2137"}}>{h.nombre}</div>
                        <div style={{fontSize:11,color:"#7c3aed",fontWeight:600}}>{h.cantidad} cabezas</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:20,fontWeight:800,color:"#16a34a"}}>${fmt(valorTotal)}</div>
                        {valorUsd&&<div style={{fontSize:11,color:"#1565c0",fontWeight:700}}>USD {fmt(valorUsd)}</div>}
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                      {[{l:"CABEZAS",v:String(h.cantidad),c:"#7c3aed"},{l:"PESO PROM.",v:(h.peso_promedio||"—")+" kg",c:"#d97706"},{l:"PRECIO/KG",v:"$"+fmt(h.precio_kg||0),c:"#16a34a"}].map(s=>(
                        <div key={s.l} style={{textAlign:"center",padding:"6px 4px",borderRadius:8,background:"rgba(255,255,255,0.60)"}}>
                          <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{s.l}</div>
                          <div style={{fontSize:12,fontWeight:800,color:s.c}}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
      <p style={{textAlign:"center",fontSize:11,color:"rgba(30,58,90,0.45)",fontWeight:600,letterSpacing:"0.20em",paddingBottom:16,paddingTop:4}}>© AgroGestión PRO · Margen Bruto</p>
    </div>
  );
}
