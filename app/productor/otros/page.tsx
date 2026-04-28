"use client";
// @ts-nocheck
import { useEffect, useState, useCallback } from "react";

// ── TIPOS ──────────────────────────────────────────────────────────────────
type Campana = { id: string; nombre: string; año_inicio: number; activa: boolean; };
type Lote = { id: string; nombre: string; hectareas: number; cultivo: string; cultivo_completo: string; };
type Item = {
  id: string; empresa_id: string; campana_id: string;
  lote_ids: string[]; grupo: string; subgrupo: string;
  concepto: string; articulo: string; descripcion: string;
  fecha: string; mes: number | null;
  moneda: string; monto_original: number; tc_usado: number; monto_usd: number;
  unidad: string; origen: string;
};

// ── ESTRUCTURA COMPLETA DE GRUPOS ─────────────────────────────────────────
const GRUPOS = [
  {
    id: "labranzas", label: "LABRANZAS Y LABORES", col: 0, row: 0,
    items: ["SIEMBRA","PULVERIZACIÓN TERRESTRE","PULVERIZACIÓN AÉREA","PULVERIZACIÓN DRON","OTROS"],
  },
  {
    id: "insumos", label: "INSUMOS", col: 1, row: 0,
    items: ["SEMILLA","CURASEMILLA","FERTILIZANTES","HERBICIDA","INSECTICIDA","FUNGICIDA","COADYUVANTES","OTROS"],
  },
  {
    id: "cosecha", label: "COSECHA", col: 2, row: 0,
    items: ["COSECHA","ACARREO INTERNO","OTROS"],
  },
  {
    id: "logistica", label: "LOGÍSTICA Y FLETE", col: 0, row: 1,
    items: ["FLETE CORTO","FLETE LARGO","OTROS"],
  },
  {
    id: "comercializacion", label: "COMERCIALIZACIÓN", col: 1, row: 1,
    items: ["COMISIÓN","SECADO / LIMPIEZA","ALMACENAJE","ANÁLISIS","OTROS"],
  },
  {
    id: "combustibles", label: "COMBUSTIBLES", col: 2, row: 1,
    items: ["GASOIL","LUBRICANTES","OTROS"],
  },
  {
    id: "alquiler", label: "ALQUILER", col: 0, row: 2,
    items: ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE","OTROS"],
    esMensual: true,
  },
  {
    id: "impuestos", label: "IMPUESTOS Y TASAS", col: 1, row: 2,
    items: ["INGRESOS BRUTOS","IMP. INMOBILIARIO RURAL","TASA VIAL","OTROS"],
  },
  {
    id: "seguros", label: "SEGUROS Y COBERTURAS", col: 2, row: 2,
    items: ["SEGURO AGRÍCOLA","SEGURO AUTOMOTOR","OTROS"],
  },
  {
    id: "personal", label: "COSTOS PERSONAL", col: 0, row: 3,
    items: ["EMPLEADOS","INGENIERO","CONTADOR","OTROS"],
  },
  {
    id: "financieros", label: "COSTOS FINANCIEROS", col: 1, row: 3,
    items: ["INTERESES BANCARIOS","DESCUENTO DE CHEQUES","COSTO VENTA ANTICIPADA","DIFERENCIA T.C.","OTROS"],
  },
  {
    id: "otros_directos", label: "OTROS COSTOS DIRECTOS", col: 2, row: 3,
    items: ["REPARACIÓN Y MANTENIMIENTO","COMBUSTIBLES VARIOS","MANO DE OBRA EVENTUAL","ANÁLISIS DE SUELO","OTROS"],
  },
];

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// ── COMPONENTE PRINCIPAL ───────────────────────────────────────────────────
export default function CentroGestion() {
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [campanaActiva, setCampanaActiva] = useState<string>("");
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loteActivo, setLoteActivo] = useState<string>("todos");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [tcVenta, setTcVenta] = useState<number>(1400);
  const [msgExito, setMsgExito] = useState("");
  // Panel de carga
  const [panelAbierto, setPanelAbierto] = useState<{grupo:string;subgrupo:string;mes?:number}|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [lotesSeleccionados, setLotesSeleccionados] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  const msg = (t: string) => { setMsgExito(t); setTimeout(() => setMsgExito(""), 4000); };

  const getTCFecha = async (fecha: string): Promise<number> => {
    if (!empresaId) return tcVenta;
    const sb = await getSB();
    const { data } = await sb.from("finanzas_cotizaciones")
      .select("usd_usado").eq("empresa_id", empresaId)
      .lte("fecha", fecha).order("fecha", { ascending: false }).limit(1);
    return data?.[0]?.usd_usado || tcVenta || 1;
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
    // TC
    try {
      const res = await fetch("/api/cotizacion");
      const d = await res.json();
      if (d.venta) setTcVenta(d.venta);
    } catch {}
    // Campañas
    const { data: camps } = await sb.from("campanas").select("*").eq("empresa_id", emp.id).order("año_inicio", { ascending: false });
    setCampanas(camps ?? []);
    const cid = (camps ?? []).find((c: any) => c.activa)?.id ?? (camps ?? [])[0]?.id ?? "";
    setCampanaActiva(cid);
    // Lotes
    const { data: ls } = await sb.from("lotes").select("id,nombre,hectareas,cultivo,cultivo_completo").eq("empresa_id", emp.id).eq("campana_id", cid).eq("es_segundo_cultivo", false).order("nombre");
    setLotes(ls ?? []);
    // Items
    await fetchItems(emp.id, cid);
    setLoading(false);
  };

  const fetchItems = async (eid: string, cid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("mb_carga_items").select("*").eq("empresa_id", eid).eq("campana_id", cid).order("fecha", { ascending: false });
    setItems(data ?? []);
  };

  const cambiarCampana = async (cid: string) => {
    setCampanaActiva(cid);
    if (!empresaId) return;
    const sb = await getSB();
    const { data: ls } = await sb.from("lotes").select("id,nombre,hectareas,cultivo,cultivo_completo").eq("empresa_id", empresaId).eq("campana_id", cid).eq("es_segundo_cultivo", false).order("nombre");
    setLotes(ls ?? []);
    await fetchItems(empresaId, cid);
    setLoteActivo("todos");
  };

  // ── ABRIR PANEL ──
  const abrirPanel = (grupoId: string, subgrupo: string, mes?: number) => {
    setPanelAbierto({ grupo: grupoId, subgrupo, mes });
    setForm({
      fecha: new Date().toISOString().split("T")[0],
      moneda: "ARS",
      unidad: "ha",
      monto: "",
      articulo: "",
      descripcion: "",
    });
    setLotesSeleccionados(loteActivo !== "todos" ? [loteActivo] : []);
  };

  // ── GUARDAR ITEM ──
  const guardarItem = async () => {
    if (!empresaId || !form.fecha || !form.monto || lotesSeleccionados.length === 0) {
      msg("❌ Completá fecha, monto y seleccioná al menos un lote");
      return;
    }
    setGuardando(true);
    const tc = form.moneda === "ARS" ? await getTCFecha(form.fecha) : 1;
    const montoOriginal = Number(form.monto);
    const montoUsd = form.moneda === "ARS" ? montoOriginal / tc : montoOriginal;
    const sb = await getSB();
    await sb.from("mb_carga_items").insert({
      empresa_id: empresaId,
      campana_id: campanaActiva,
      lote_ids: lotesSeleccionados,
      grupo: panelAbierto!.grupo,
      subgrupo: panelAbierto!.subgrupo,
      mes: panelAbierto!.mes ?? null,
      concepto: panelAbierto!.subgrupo,
      articulo: form.articulo || "",
      descripcion: form.descripcion || "",
      fecha: form.fecha,
      moneda: form.moneda,
      monto_original: montoOriginal,
      tc_usado: tc,
      monto_usd: montoUsd,
      unidad: form.unidad || "ha",
      origen: "manual",
    });
    msg(`✅ Guardado — U$S ${montoUsd.toFixed(2)} (TC $${Math.round(tc).toLocaleString("es-AR")})`);
    await fetchItems(empresaId, campanaActiva);
    setGuardando(false);
    setPanelAbierto(null);
    setForm({});
    setLotesSeleccionados([]);
  };

  const eliminarItem = async (id: string) => {
    if (!confirm("¿Eliminar?") || !empresaId) return;
    const sb = await getSB();
    await sb.from("mb_carga_items").delete().eq("id", id);
    await fetchItems(empresaId, campanaActiva);
  };

  // ── EXPORTAR EXCEL ──
  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const data = itemsFiltrados.map(i => {
      const loteNombres = i.lote_ids.map((lid: string) => lotes.find(l => l.id === lid)?.nombre || lid).join(", ");
      return {
        GRUPO: i.grupo, SUBGRUPO: i.subgrupo, LOTES: loteNombres,
        FECHA: i.fecha, MES: i.mes ? MESES[i.mes - 1] : "",
        ARTICULO: i.articulo, DESCRIPCION: i.descripcion,
        MONEDA: i.moneda, MONTO_ORIGINAL: i.monto_original,
        TC: i.tc_usado, MONTO_USD: i.monto_usd, UNIDAD: i.unidad,
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CentroGestion");
    XLSX.writeFile(wb, `centro_gestion_${campanas.find(c=>c.id===campanaActiva)?.nombre||""}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── CALCULAR TOTALES ──
  const itemsFiltrados = items.filter(i =>
    loteActivo === "todos" || i.lote_ids.includes(loteActivo)
  );

  const totalPorGrupoSubgrupo = (grupoId: string, subgrupo: string) => {
    return itemsFiltrados
      .filter(i => i.grupo === grupoId && i.subgrupo === subgrupo)
      .reduce((a, i) => a + i.monto_usd, 0);
  };

  const totalPorGrupo = (grupoId: string) => {
    return itemsFiltrados.filter(i => i.grupo === grupoId).reduce((a, i) => a + i.monto_usd, 0);
  };

  const totalCostos = itemsFiltrados.reduce((a, i) => a + i.monto_usd, 0);

  const hectareasActivas = loteActivo === "todos"
    ? lotes.reduce((a, l) => a + l.hectareas, 0)
    : lotes.find(l => l.id === loteActivo)?.hectareas || 0;

  const costoHa = hectareasActivas > 0 ? totalCostos / hectareasActivas : 0;

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:32,height:32,border:"3px solid #c9a227",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#c9a227",fontWeight:600,fontFamily:"monospace"}}>Cargando Centro de Gestión...</span>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#0d0d0d",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#f0e6c8"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glow{0%,100%{box-shadow:0 0 8px rgba(201,162,39,0.30)}50%{box-shadow:0 0 20px rgba(201,162,39,0.60)}}

        * { box-sizing: border-box; }

        .gold { color: #c9a227; }
        .gold-bg { background: linear-gradient(135deg, #c9a227, #f0d060, #c9a227); }
        .gold-border { border: 1px solid rgba(201,162,39,0.40); }

        /* TOPBAR */
        .topbar-cg {
          background: linear-gradient(180deg, #1a1400 0%, #0d0d0d 100%);
          border-bottom: 1px solid rgba(201,162,39,0.30);
          box-shadow: 0 2px 20px rgba(201,162,39,0.10);
        }

        /* GRUPO CARD */
        .grupo-card {
          background: linear-gradient(180deg, #1a1600 0%, #111000 100%);
          border: 1px solid rgba(201,162,39,0.35);
          border-radius: 8px;
          overflow: hidden;
          transition: border-color 0.18s;
        }
        .grupo-card:hover { border-color: rgba(201,162,39,0.65); }

        .grupo-header {
          background: linear-gradient(90deg, #c9a227 0%, #e8c040 50%, #c9a227 100%);
          padding: 7px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        /* FILA ITEM */
        .item-row {
          display: grid;
          grid-template-columns: 1fr 80px 60px 24px;
          align-items: center;
          padding: 5px 10px;
          border-bottom: 1px solid rgba(201,162,39,0.10);
          cursor: pointer;
          transition: background 0.15s;
          gap: 6px;
        }
        .item-row:hover { background: rgba(201,162,39,0.08); }
        .item-row:last-child { border-bottom: none; }

        /* BTN DORADO */
        .btn-gold {
          background: linear-gradient(135deg, #c9a227, #f0d060, #c9a227);
          border: none;
          border-radius: 8px;
          color: #0d0d0d;
          font-weight: 800;
          font-size: 12px;
          cursor: pointer;
          padding: 8px 16px;
          transition: all 0.18s;
          font-family: 'DM Sans', sans-serif;
        }
        .btn-gold:hover { filter: brightness(1.15); transform: translateY(-1px); }

        .btn-dark {
          background: rgba(201,162,39,0.12);
          border: 1px solid rgba(201,162,39,0.35);
          border-radius: 8px;
          color: #c9a227;
          font-weight:700;
          font-size: 12px;
          cursor: pointer;
          padding: 7px 14px;
          transition: all 0.18s;
          font-family: 'DM Sans', sans-serif;
        }
        .btn-dark:hover { background: rgba(201,162,39,0.20); }

        /* INPUTS */
        .inp-dark {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(201,162,39,0.30);
          border-radius: 8px;
          color: #f0e6c8;
          padding: 8px 12px;
          font-size: 13px;
          font-family: 'DM Sans', sans-serif;
          width: 100%;
          transition: border-color 0.18s;
        }
        .inp-dark:focus { border-color: #c9a227; outline: none; background: rgba(201,162,39,0.06); }
        .inp-dark::placeholder { color: rgba(201,162,39,0.30); }
        .inp-dark option { background: #1a1600; color: #f0e6c8; }

        .label-gold {
          display: block;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: rgba(201,162,39,0.70);
          margin-bottom: 4px;
        }

        /* PANEL LATERAL */
        .panel-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.75);
          z-index: 50;
          display: flex;
          justify-content: flex-end;
        }
        .panel-lateral {
          width: 420px;
          height: 100vh;
          background: linear-gradient(180deg, #1a1600 0%, #0d0d0d 100%);
          border-left: 1px solid rgba(201,162,39,0.40);
          overflow-y: auto;
          animation: slideIn 0.25s ease;
        }
        @keyframes slideIn { from{transform:translateX(100%)} to{transform:translateX(0)} }

        /* RESULTADO BAR */
        .resultado-bar {
          background: linear-gradient(90deg, #1a1600, #2a2000);
          border-top: 2px solid #c9a227;
          border-bottom: 2px solid #c9a227;
        }

        /* KPI BOX */
        .kpi-box {
          background: linear-gradient(135deg, #1a1600, #111000);
          border: 1px solid rgba(201,162,39,0.35);
          border-radius: 10px;
          padding: 12px 16px;
          text-align: center;
        }

        .tag-auto {
          font-size: 8px;
          padding: 1px 5px;
          border-radius: 4px;
          background: rgba(59,130,246,0.20);
          color: #93c5fd;
          font-weight: 700;
          border: 1px solid rgba(59,130,246,0.25);
        }

        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(201,162,39,0.30); border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }

        .fade-in { animation: fadeIn 0.20s ease; }
        .glow { animation: glow 2s ease-in-out infinite; }
      `}</style>

      {/* ── TOPBAR ── */}
      <div className="topbar-cg" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 20px",flexWrap:"wrap"}}>
          <button onClick={()=>window.location.href="/productor/dashboard"}
            style={{background:"none",border:"none",cursor:"pointer",color:"rgba(201,162,39,0.70)",fontSize:13,fontWeight:700,fontFamily:"inherit"}}>
            ← Dashboard
          </button>
          <div style={{width:1,height:20,background:"rgba(201,162,39,0.20)"}}/>
          {/* Logo texto */}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:18}}>⚙️</span>
            <div>
              <div style={{fontSize:14,fontWeight:900,color:"#c9a227",letterSpacing:1,textTransform:"uppercase"}}>Centro de Gestión</div>
              <div style={{fontSize:10,color:"rgba(201,162,39,0.50)",letterSpacing:0.5}}>Margen Bruto · Carga de Datos</div>
            </div>
          </div>
          <div style={{flex:1}}/>
          {/* TC */}
          <div style={{padding:"6px 12px",borderRadius:8,border:"1px solid rgba(201,162,39,0.30)",background:"rgba(201,162,39,0.07)",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,color:"rgba(201,162,39,0.60)",fontWeight:700}}>TC BNA</span>
            <span style={{fontSize:14,fontWeight:800,color:"#c9a227"}}>${Math.round(tcVenta).toLocaleString("es-AR")}</span>
          </div>
          {/* Campaña */}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,color:"rgba(201,162,39,0.60)",fontWeight:700,textTransform:"uppercase"}}>Campaña</span>
            <select value={campanaActiva} onChange={e=>cambiarCampana(e.target.value)} className="inp-dark" style={{minWidth:110,padding:"6px 10px",fontSize:12,fontWeight:700,color:"#c9a227"}}>
              {campanas.map(c=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
            </select>
          </div>
          {/* Lote */}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,color:"rgba(201,162,39,0.60)",fontWeight:700,textTransform:"uppercase"}}>Lote</span>
            <select value={loteActivo} onChange={e=>setLoteActivo(e.target.value)} className="inp-dark" style={{minWidth:120,padding:"6px 10px",fontSize:12,fontWeight:700,color:"#f0e6c8"}}>
              <option value="todos">Todos los lotes</option>
              {lotes.map(l=><option key={l.id} value={l.id}>{l.nombre} ({l.hectareas}ha)</option>)}
            </select>
          </div>
          {/* Acciones */}
          <button onClick={exportarExcel} className="btn-dark" style={{fontSize:11}}>📤 Exportar</button>
        </div>
      </div>

      <div style={{maxWidth:1400,margin:"0 auto",padding:"16px 16px 100px"}}>

        {/* Toast */}
        {msgExito&&(
          <div className="fade-in" style={{marginBottom:14,padding:"10px 16px",borderRadius:10,fontSize:13,fontWeight:700,
            color:msgExito.startsWith("✅")?"#86efac":"#fca5a5",
            background:msgExito.startsWith("✅")?"rgba(22,163,74,0.15)":"rgba(220,38,38,0.15)",
            border:`1px solid ${msgExito.startsWith("✅")?"rgba(22,163,74,0.35)":"rgba(220,38,38,0.35)"}`,
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            {msgExito}
            <button onClick={()=>setMsgExito("")} style={{background:"none",border:"none",cursor:"pointer",color:"inherit",fontSize:16,opacity:0.6}}>✕</button>
          </div>
        )}

        {/* ── KPIs SUPERIORES ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:20}}>
          {[
            {l:"Total Costos",v:`U$S ${Math.round(totalCostos).toLocaleString("es-AR")}`,c:"#fca5a5"},
            {l:"Costo / Ha",v:`U$S ${Math.round(costoHa).toLocaleString("es-AR")}`,c:"#fed7aa"},
            {l:"Ha Activas",v:`${hectareasActivas} ha`,c:"#c9a227"},
            {l:"Items cargados",v:String(itemsFiltrados.length),c:"#86efac"},
            {l:"Lotes",v:String(lotes.length),c:"#93c5fd"},
          ].map(s=>(
            <div key={s.l} className="kpi-box">
              <div style={{fontSize:9,color:"rgba(201,162,39,0.60)",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>{s.l}</div>
              <div style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* ── SECCIÓN TÍTULO ── */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <div style={{height:2,flex:1,background:"linear-gradient(90deg,transparent,#c9a227,transparent)"}}/>
          <div style={{fontSize:11,fontWeight:800,color:"#c9a227",textTransform:"uppercase",letterSpacing:2}}>2 — COSTOS</div>
          <div style={{height:2,flex:1,background:"linear-gradient(90deg,transparent,#c9a227,transparent)"}}/>
        </div>

        {/* ── GRID DE GRUPOS (3 columnas) ── */}
        {[0,1,2,3].map(row=>(
          <div key={row} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
            {GRUPOS.filter(g=>g.row===row).map(grupo=>{
              const totalGrupo = totalPorGrupo(grupo.id);
              const pct = totalCostos > 0 ? (totalGrupo/totalCostos*100) : 0;
              return(
                <div key={grupo.id} className="grupo-card">
                  {/* Header dorado */}
                  <div className="grupo-header">
                    <span style={{fontSize:11,fontWeight:900,color:"#0d0d0d",textTransform:"uppercase",letterSpacing:0.5}}>{grupo.label}</span>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      {totalGrupo>0&&(
                        <>
                          <span style={{fontSize:11,fontWeight:800,color:"#0d0d0d"}}>U$S {Math.round(totalGrupo).toLocaleString("es-AR")}</span>
                          <span style={{fontSize:10,fontWeight:700,color:"rgba(0,0,0,0.55)",background:"rgba(0,0,0,0.15)",borderRadius:4,padding:"1px 5px"}}>{pct.toFixed(0)}%</span>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Items */}
                  <div>
                    {grupo.items.map((subgrupo,idx)=>{
                      const mes = grupo.esMensual && idx < 12 ? idx + 1 : undefined;
                      const totalSub = grupo.esMensual && mes
                        ? itemsFiltrados.filter(i=>i.grupo===grupo.id&&i.mes===mes).reduce((a,i)=>a+i.monto_usd,0)
                        : totalPorGrupoSubgrupo(grupo.id, subgrupo);
                      const pctSub = totalCostos > 0 ? (totalSub/totalCostos*100) : 0;
                      const itemsCount = grupo.esMensual && mes
                        ? itemsFiltrados.filter(i=>i.grupo===grupo.id&&i.mes===mes).length
                        : itemsFiltrados.filter(i=>i.grupo===grupo.id&&i.subgrupo===subgrupo).length;
                      return(
                        <div key={subgrupo} className="item-row"
                          onClick={()=>abrirPanel(grupo.id, subgrupo, mes)}
                          title={`Clic para agregar ${subgrupo}`}>
                          {/* Nombre */}
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:11,color:totalSub>0?"#f0e6c8":"rgba(240,230,200,0.45)",fontWeight:totalSub>0?600:400}}>{subgrupo}</span>
                            {itemsCount>0&&<span style={{fontSize:9,color:"rgba(201,162,39,0.50)",fontWeight:600}}>{itemsCount}x</span>}
                          </div>
                          {/* Monto */}
                          <div style={{textAlign:"right"}}>
                            {totalSub>0
                              ?<span style={{fontSize:11,fontWeight:800,color:"#c9a227"}}>U$S {Math.round(totalSub).toLocaleString("es-AR")}</span>
                              :<span style={{fontSize:10,color:"rgba(201,162,39,0.25)"}}>—</span>
                            }
                          </div>
                          {/* % */}
                          <div style={{textAlign:"right"}}>
                            {totalSub>0
                              ?<span style={{fontSize:10,color:"rgba(201,162,39,0.60)",fontWeight:600}}>{pctSub.toFixed(1)}%</span>
                              :<span style={{fontSize:10,color:"rgba(201,162,39,0.15)"}}>—</span>
                            }
                          </div>
                          {/* + */}
                          <div style={{textAlign:"center"}}>
                            <span style={{fontSize:14,color:"rgba(201,162,39,0.40)",fontWeight:300,lineHeight:1}}>+</span>
                          </div>
                        </div>
                      );
                    })}
                    {/* Total grupo */}
                    {totalGrupo>0&&(
                      <div style={{padding:"5px 10px",background:"rgba(201,162,39,0.08)",borderTop:"1px solid rgba(201,162,39,0.20)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:10,color:"rgba(201,162,39,0.60)",fontWeight:700,textTransform:"uppercase"}}>Total</span>
                        <span style={{fontSize:11,fontWeight:800,color:"#c9a227"}}>U$S {Math.round(totalGrupo).toLocaleString("es-AR")}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* ── RESULTADO FINAL ── */}
        <div className="resultado-bar" style={{borderRadius:12,padding:"16px 24px",marginTop:8}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:13,fontWeight:900,color:"#c9a227",textTransform:"uppercase",letterSpacing:1}}>3 — Margen Bruto</span>
              <span style={{fontSize:11,color:"rgba(201,162,39,0.50)"}}>Ingreso − Costos</span>
            </div>
            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              {[
                {l:"Costo Total",v:`U$S ${Math.round(totalCostos).toLocaleString("es-AR")}`,c:"#fca5a5"},
                {l:"Costo/Ha",v:`U$S ${Math.round(costoHa).toLocaleString("es-AR")}/ha`,c:"#fed7aa"},
                {l:"Items",v:String(itemsFiltrados.length),c:"#93c5fd"},
              ].map(s=>(
                <div key={s.l} style={{textAlign:"center"}}>
                  <div style={{fontSize:9,color:"rgba(201,162,39,0.50)",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:2}}>{s.l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{marginTop:10,padding:"8px 0",borderTop:"1px solid rgba(201,162,39,0.20)",fontSize:11,color:"rgba(201,162,39,0.40)",textAlign:"center"}}>
            Completá los ingresos en el módulo de Margen Bruto para ver el resultado final
          </div>
        </div>

        {/* ── HISTORIAL RECIENTE ── */}
        {itemsFiltrados.length>0&&(
          <div style={{marginTop:16}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
              <div style={{height:1,flex:1,background:"rgba(201,162,39,0.20)"}}/>
              <span style={{fontSize:10,color:"rgba(201,162,39,0.50)",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Últimos movimientos</span>
              <div style={{height:1,flex:1,background:"rgba(201,162,39,0.20)"}}/>
            </div>
            <div style={{borderRadius:10,overflow:"hidden",border:"1px solid rgba(201,162,39,0.20)"}}>
              <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{background:"rgba(201,162,39,0.10)"}}>
                    {["Fecha","Grupo","Concepto","Lotes","Artículo","Descripción","Moneda","Monto","TC","U$S","Unidad",""].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"7px 10px",fontSize:9,color:"rgba(201,162,39,0.60)",fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itemsFiltrados.slice(0,20).map(i=>{
                    const loteNombres = i.lote_ids.map((lid: string)=>lotes.find(l=>l.id===lid)?.nombre||"?").join(", ");
                    return(
                      <tr key={i.id} style={{borderBottom:"1px solid rgba(201,162,39,0.08)",transition:"background 0.15s",cursor:"default"}}
                        onMouseEnter={e=>(e.currentTarget as any).style.background="rgba(201,162,39,0.05)"}
                        onMouseLeave={e=>(e.currentTarget as any).style.background="transparent"}>
                        <td style={{padding:"6px 10px",color:"rgba(201,162,39,0.60)",whiteSpace:"nowrap"}}>{i.fecha}</td>
                        <td style={{padding:"6px 10px",color:"#c9a227",fontWeight:600,whiteSpace:"nowrap"}}>{GRUPOS.find(g=>g.id===i.grupo)?.label||i.grupo}</td>
                        <td style={{padding:"6px 10px",color:"#f0e6c8",fontWeight:600}}>{i.subgrupo}</td>
                        <td style={{padding:"6px 10px",color:"rgba(240,230,200,0.60)",fontSize:10}}>{loteNombres}</td>
                        <td style={{padding:"6px 10px",color:"rgba(240,230,200,0.70)"}}>{i.articulo||"—"}</td>
                        <td style={{padding:"6px 10px",color:"rgba(240,230,200,0.50)",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{i.descripcion||"—"}</td>
                        <td style={{padding:"6px 10px",color:"rgba(201,162,39,0.60)"}}>{i.moneda}</td>
                        <td style={{padding:"6px 10px",fontWeight:700,color:"#c9a227"}}>
                          {i.moneda==="ARS"?"$":""}{Math.round(i.monto_original).toLocaleString("es-AR")}
                        </td>
                        <td style={{padding:"6px 10px",color:"rgba(201,162,39,0.40)",fontSize:10}}>${Math.round(i.tc_usado).toLocaleString("es-AR")}</td>
                        <td style={{padding:"6px 10px",fontWeight:800,color:"#f0d060"}}>U$S {i.monto_usd.toFixed(2)}</td>
                        <td style={{padding:"6px 10px",color:"rgba(201,162,39,0.50)",fontSize:10}}>{i.unidad}</td>
                        <td style={{padding:"6px 10px"}}>
                          <button onClick={()=>eliminarItem(i.id)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(220,38,38,0.50)",fontSize:13,padding:"0 4px"}}
                            onMouseEnter={e=>(e.currentTarget as any).style.color="rgba(220,38,38,0.90)"}
                            onMouseLeave={e=>(e.currentTarget as any).style.color="rgba(220,38,38,0.50)"}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ══ PANEL LATERAL DE CARGA ══ */}
      {panelAbierto&&(
        <div className="panel-overlay" onClick={e=>{if(e.target===e.currentTarget){setPanelAbierto(null);setForm({});setLotesSeleccionados([]);}}}>
          <div className="panel-lateral">
            {/* Header panel */}
            <div style={{padding:"18px 20px",borderBottom:"1px solid rgba(201,162,39,0.25)",background:"rgba(201,162,39,0.07)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                <div style={{fontSize:13,fontWeight:900,color:"#c9a227",textTransform:"uppercase",letterSpacing:0.5}}>
                  {GRUPOS.find(g=>g.id===panelAbierto.grupo)?.label}
                </div>
                <button onClick={()=>{setPanelAbierto(null);setForm({});setLotesSeleccionados([]);}}
                  style={{background:"none",border:"none",cursor:"pointer",color:"rgba(201,162,39,0.60)",fontSize:20,lineHeight:1,padding:"0 4px"}}>✕</button>
              </div>
              <div style={{fontSize:15,fontWeight:800,color:"#f0d060"}}>
                {panelAbierto.mes ? MESES[panelAbierto.mes-1] : panelAbierto.subgrupo}
              </div>
            </div>

            {/* Body panel */}
            <div style={{padding:"20px",display:"flex",flexDirection:"column",gap:16}}>

              {/* LOTES */}
              <div>
                <label className="label-gold">Lote(s) *</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:4}}>
                  <button onClick={()=>setLotesSeleccionados(lotes.map(l=>l.id))}
                    style={{padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",border:"1px solid rgba(201,162,39,0.30)",
                      background:lotesSeleccionados.length===lotes.length?"rgba(201,162,39,0.25)":"transparent",color:"#c9a227"}}>
                    Todos
                  </button>
                  {lotes.map(l=>(
                    <button key={l.id} onClick={()=>{
                      setLotesSeleccionados(p=>p.includes(l.id)?p.filter(x=>x!==l.id):[...p,l.id]);
                    }} style={{padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",border:"1px solid rgba(201,162,39,0.30)",
                      background:lotesSeleccionados.includes(l.id)?"rgba(201,162,39,0.25)":"transparent",
                      color:lotesSeleccionados.includes(l.id)?"#f0d060":"rgba(201,162,39,0.60)"}}>
                      {l.nombre}
                    </button>
                  ))}
                </div>
              </div>

              {/* FECHA */}
              <div>
                <label className="label-gold">Fecha del pago *</label>
                <input type="date" value={form.fecha||""} onChange={e=>setForm({...form,fecha:e.target.value})} className="inp-dark"/>
              </div>

              {/* MONEDA + MONTO */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:10}}>
                <div>
                  <label className="label-gold">Moneda</label>
                  <select value={form.moneda||"ARS"} onChange={e=>setForm({...form,moneda:e.target.value})} className="inp-dark">
                    <option value="ARS">$ ARS</option>
                    <option value="USD">U$S</option>
                  </select>
                </div>
                <div>
                  <label className="label-gold">Monto *</label>
                  <input type="number" value={form.monto||""} onChange={e=>setForm({...form,monto:e.target.value})} className="inp-dark" placeholder="0"/>
                </div>
              </div>

              {/* CONVERSIÓN PREVIEW */}
              {form.monto&&Number(form.monto)>0&&(
                <div style={{padding:"10px 14px",borderRadius:8,background:"rgba(201,162,39,0.07)",border:"1px solid rgba(201,162,39,0.20)"}}>
                  {form.moneda==="ARS"?(
                    <div style={{fontSize:12,color:"#f0e6c8"}}>
                      <span style={{color:"rgba(201,162,39,0.70)"}}>
                        ${Number(form.monto).toLocaleString("es-AR")} ARS ÷ TC ${Math.round(tcVenta).toLocaleString("es-AR")} =
                      </span>
                      <span style={{fontWeight:800,color:"#f0d060",fontSize:14,marginLeft:8}}>
                        U$S {(Number(form.monto)/tcVenta).toFixed(2)}
                      </span>
                    </div>
                  ):(
                    <div style={{fontSize:13,fontWeight:800,color:"#f0d060"}}>
                      U$S {Number(form.monto).toFixed(2)}
                    </div>
                  )}
                  <div style={{fontSize:10,color:"rgba(201,162,39,0.40)",marginTop:2}}>
                    TC del día: ${Math.round(tcVenta).toLocaleString("es-AR")} · Se actualiza con la fecha ingresada
                  </div>
                </div>
              )}

              {/* UNIDAD */}
              <div>
                <label className="label-gold">Unidad de medida</label>
                <select value={form.unidad||"ha"} onChange={e=>setForm({...form,unidad:e.target.value})} className="inp-dark">
                  <option value="ha">Por ha (U$S/ha)</option>
                  <option value="tn">Por tn (U$S/tn)</option>
                  <option value="total">Total del campo</option>
                  <option value="pct">% sobre ingreso</option>
                </select>
              </div>

              {/* ARTÍCULO */}
              <div>
                <label className="label-gold">Artículo / Producto</label>
                <input type="text" value={form.articulo||""} onChange={e=>setForm({...form,articulo:e.target.value})} className="inp-dark" placeholder="Ej: Glifosato 48%, DK7220..."/>
              </div>

              {/* DESCRIPCIÓN */}
              <div>
                <label className="label-gold">Descripción</label>
                <input type="text" value={form.descripcion||""} onChange={e=>setForm({...form,descripcion:e.target.value})} className="inp-dark" placeholder="Detalle adicional..."/>
              </div>

              {/* BOTONES */}
              <div style={{display:"flex",gap:10,marginTop:4}}>
                <button onClick={guardarItem} className="btn-gold" style={{flex:1,padding:"11px"}} disabled={guardando}>
                  {guardando?"Guardando...":"✓ Guardar"}
                </button>
                <button onClick={()=>{setPanelAbierto(null);setForm({});setLotesSeleccionados([]);}} className="btn-dark" style={{padding:"11px 16px"}}>
                  Cancelar
                </button>
              </div>

              {/* ITEMS CARGADOS EN ESTE SUBGRUPO */}
              {(()=>{
                const existentes = itemsFiltrados.filter(i=>
                  i.grupo===panelAbierto.grupo &&
                  (panelAbierto.mes ? i.mes===panelAbierto.mes : i.subgrupo===panelAbierto.subgrupo)
                );
                if(existentes.length===0) return null;
                return(
                  <div style={{marginTop:8,borderTop:"1px solid rgba(201,162,39,0.15)",paddingTop:16}}>
                    <div style={{fontSize:10,color:"rgba(201,162,39,0.50)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>
                      Ya cargados ({existentes.length})
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {existentes.map(i=>{
                        const loteNombres = i.lote_ids.map((lid: string)=>lotes.find(l=>l.id===lid)?.nombre||"?").join(", ");
                        return(
                          <div key={i.id} style={{padding:"8px 10px",borderRadius:8,background:"rgba(201,162,39,0.06)",border:"1px solid rgba(201,162,39,0.15)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:11,fontWeight:700,color:"#f0d060"}}>U$S {i.monto_usd.toFixed(2)}</div>
                              <div style={{fontSize:10,color:"rgba(201,162,39,0.50)"}}>{i.fecha} · {loteNombres}</div>
                              {i.articulo&&<div style={{fontSize:10,color:"rgba(201,162,39,0.40)"}}>{i.articulo}</div>}
                            </div>
                            <button onClick={()=>eliminarItem(i.id)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(220,38,38,0.50)",fontSize:14,flexShrink:0}}>✕</button>
                          </div>
                        );
                      })}
                      <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:11,fontWeight:800,color:"#c9a227"}}>
                        <span>Total</span>
                        <span>U$S {existentes.reduce((a,i)=>a+i.monto_usd,0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
