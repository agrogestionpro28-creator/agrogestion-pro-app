"use client";
// @ts-nocheck
import { useEffect, useState, useCallback } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

type Campana = { id: string; nombre: string; año_inicio: number; activa: boolean; };
type Lote = { id: string; nombre: string; hectareas: number; cultivo: string; cultivo_orden: string; cultivo_completo: string; };
type MbCabecera = {
  id: string; lote_id: string; campana_id: string; cultivo: string; hectareas: number;
  rinde_esp: number; rinde_real: number; precio_promedio_usd: number; ajuste_calidad_pct: number;
  estado: string; cerrado: boolean;
};
type MbMovimiento = {
  id: string; cabecera_id: string; lote_id: string; fecha: string; grupo: number;
  concepto: string; descripcion: string; moneda: string;
  monto_original: number; tc_usado: number; monto_usd: number; unidad: string; origen?: string;
};
type MbVenta = {
  id: string; cabecera_id: string; lote_id: string; fecha: string;
  tn_vendidas: number; precio_usd: number; destino: string; estado: string;
};
type CargaItem = {
  id: string; lote_ids: string[]; grupo: string; subgrupo: string;
  monto_usd: number; unidad: string; fecha: string; descripcion: string; articulo: string;
};

// Mismos 12 grupos que Centro de Gestión — en orden y con mismo nombre
const GRUPOS_MB_LIST = [
  { id:"labranzas",       num:1,  label:"LABRANZAS Y LABORES",       icon:"🚜", color:"#16a34a",
    items:["SIEMBRA","PULVERIZACIÓN TERRESTRE","PULVERIZACIÓN AÉREA","PULVERIZACIÓN DRON","OTROS"] },
  { id:"insumos",         num:2,  label:"INSUMOS",                    icon:"🧪", color:"#d97706",
    items:["SEMILLA","CURASEMILLA","FERTILIZANTES","HERBICIDA","INSECTICIDA","FUNGICIDA","COADYUVANTES","OTROS"] },
  { id:"cosecha",         num:4,  label:"COSECHA",                    icon:"🌾", color:"#f59e0b",
    items:["COSECHA","ACARREO INTERNO","OTROS"] },
  { id:"logistica",       num:5,  label:"LOGÍSTICA Y FLETE",         icon:"🚛", color:"#6366f1",
    items:["FLETE CORTO","FLETE LARGO","OTROS"] },
  { id:"comercializacion",num:6,  label:"COMERCIALIZACIÓN",           icon:"🏢", color:"#0891b2",
    items:["COMISIÓN","SECADO / LIMPIEZA","ALMACENAJE","ANÁLISIS","OTROS"] },
  { id:"combustibles",    num:1,  label:"COMBUSTIBLES",                icon:"⛽", color:"#f97316",
    items:["GASOIL","LUBRICANTES","OTROS"] },
  { id:"alquiler",        num:10, label:"ALQUILER",                   icon:"🤝", color:"#ea580c",
    items:["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE","OTROS"] },
  { id:"impuestos",       num:7,  label:"IMPUESTOS Y TASAS",         icon:"📋", color:"#dc2626",
    items:["INGRESOS BRUTOS","IMP. INMOBILIARIO RURAL","TASA VIAL","OTROS"] },
  { id:"seguros",         num:9,  label:"SEGUROS Y COBERTURAS",      icon:"🛡️", color:"#059669",
    items:["SEGURO AGRÍCOLA","SEGURO AUTOMOTOR","OTROS"] },
  { id:"personal",        num:11, label:"COSTOS PERSONAL",           icon:"👤", color:"#6b7280",
    items:["EMPLEADOS","INGENIERO","CONTADOR","OTROS"] },
  { id:"financieros",     num:8,  label:"COSTOS FINANCIEROS",        icon:"🏦", color:"#7c3aed",
    items:["INTERESES BANCARIOS","DESCUENTO DE CHEQUES","COSTO VENTA ANTICIPADA","DIFERENCIA T.C.","OTROS"] },
  { id:"otros_directos",  num:12, label:"OTROS COSTOS DIRECTOS",     icon:"🔧", color:"#9ca3af",
    items:["REPARACIÓN Y MANTENIMIENTO","MANO DE OBRA EVENTUAL","ANÁLISIS DE SUELO","OTROS"] },
];

const GRUPOS_MB: Record<number, { label: string; icon: string; color: string }> = {
  1: { label:"Labranzas",       icon:"🚜", color:"#16a34a" },
  2: { label:"Insumos",         icon:"🧪", color:"#d97706" },
  4: { label:"Cosecha",         icon:"🌾", color:"#f59e0b" },
  5: { label:"Flete",           icon:"🚛", color:"#6366f1" },
  6: { label:"Comercializ.",    icon:"🏢", color:"#0891b2" },
  7: { label:"Impuestos",       icon:"📋", color:"#dc2626" },
  8: { label:"Financieros",     icon:"🏦", color:"#7c3aed" },
  9: { label:"Seguros",         icon:"🛡️", color:"#059669" },
  10:{ label:"Alquiler",        icon:"🤝", color:"#ea580c" },
  11:{ label:"Personal",        icon:"👤", color:"#6b7280" },
  12:{ label:"Otros Directos",  icon:"🔧", color:"#9ca3af" },
};

// Mapeo de grupos del Centro de Gestión a grupos numéricos del MB
const GRUPO_MAP: Record<string, number> = {
  labranzas: 1, insumos: 2, cosecha: 4, logistica: 5,
  comercializacion: 6, combustibles: 1, alquiler: 10,
  impuestos: 7, seguros: 9, personal: 11, financieros: 8, otros_directos: 12,
};

const CULTIVO_COLORS: Record<string,string> = {
  soja:"#22c55e",maiz:"#d97706",trigo:"#f59e0b",girasol:"#fbbf24",
  sorgo:"#ef4444",cebada:"#a78bfa",otro:"#60a5fa",
};
const CULTIVO_ICONS: Record<string,string> = {
  soja:"🌱",maiz:"🌽",trigo:"🌾",girasol:"🌻",sorgo:"🌿",cebada:"🍃",otro:"🌐",
};

function fmtUsd(n:number){ return "U$S "+Math.round(n).toLocaleString("es-AR"); }
function fmt(n: number, dec = 0) {
  if (!n || isNaN(n)) return dec > 0 ? "0.00" : "0";
  return dec > 0 ? n.toFixed(dec) : Math.round(n).toLocaleString("es-AR");
}

export default function MargenBrutoDashboard() {
  const [empresaId, setEmpresaId]         = useState<string|null>(null);
  const [campanas, setCampanas]           = useState<Campana[]>([]);
  const [campanaActiva, setCampanaActiva] = useState<string>("");
  const [lotes, setLotes]                 = useState<Lote[]>([]);
  const [cabeceras, setCabeceras]         = useState<MbCabecera[]>([]);
  const [movimientos, setMovimientos]     = useState<MbMovimiento[]>([]);
  const [ventas, setVentas]               = useState<MbVenta[]>([]);
  const [cargaItems, setCargaItems]       = useState<CargaItem[]>([]);
  const [loading, setLoading]             = useState(true);
  const [loteActivo, setLoteActivo]       = useState<string|null>(null);
  const [grupoAbierto, setGrupoAbierto]   = useState<number|null>(null);
  const [tcVenta, setTcVenta]             = useState<number>(1400);
  const [tcFecha, setTcFecha]             = useState<string>("");
  const [msgExito, setMsgExito]           = useState("");
  const [showFormVenta, setShowFormVenta] = useState(false);
  const [showFormRinde, setShowFormRinde] = useState(false);
  const [form, setForm]                   = useState<Record<string,string>>({});

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };
  const msg = (t:string) => { setMsgExito(t); setTimeout(()=>setMsgExito(""),4000); };

  const fetchTC = useCallback(async (eid:string) => {
    try {
      const res = await fetch("/api/cotizacion");
      const d = await res.json();
      if (d.venta) {
        setTcVenta(d.venta); setTcFecha(d.fecha);
        const sb = await getSB();
        const hoy = new Date().toISOString().split("T")[0];
        const { data:ex } = await sb.from("finanzas_cotizaciones").select("id").eq("empresa_id",eid).eq("fecha",hoy).single();
        if (!ex) await sb.from("finanzas_cotizaciones").insert({ empresa_id:eid, fecha:hoy, usd_oficial:d.venta, usd_mep:0, usd_blue:0, usd_usado:d.venta });
        else await sb.from("finanzas_cotizaciones").update({ usd_oficial:d.venta, usd_usado:d.venta }).eq("id",ex.id);
      }
    } catch {}
  }, []);

  useEffect(()=>{ init(); },[]);

  const init = async () => {
    const sb = await getSB();
    const { data:{user} } = await sb.auth.getUser();
    if (!user){ window.location.href="/login"; return; }
    const { data:u } = await sb.from("usuarios").select("id").eq("auth_id",user.id).single();
    if (!u) return;
    const { data:emp } = await sb.from("empresas").select("id").eq("propietario_id",u.id).single();
    if (!emp){ setLoading(false); return; }
    setEmpresaId(emp.id);
    const { data:camps } = await sb.from("campanas").select("*").eq("empresa_id",emp.id).order("año_inicio",{ascending:false});
    setCampanas(camps??[]);
    const cid = (camps??[]).find((c:any)=>c.activa)?.id??(camps??[])[0]?.id??"";
    setCampanaActiva(cid);
    await Promise.all([fetchTC(emp.id), fetchAll(emp.id,cid)]);
    setLoading(false);
  };

  const fetchAll = async (eid:string,cid:string) => {
    const sb = await getSB();
    const { data:ls } = await sb.from("lotes").select("id,nombre,hectareas,cultivo,cultivo_orden,cultivo_completo")
      .eq("empresa_id",eid).eq("campana_id",cid).eq("es_segundo_cultivo",false).order("nombre");
    setLotes(ls??[]);
    const loteIds = (ls??[]).map((l:any)=>l.id);
    if (!loteIds.length){ setCabeceras([]); setMovimientos([]); setVentas([]); setCargaItems([]); return; }
    const [cab,mov,ven,ci] = await Promise.all([
      sb.from("mb_cabecera").select("*").eq("empresa_id",eid).eq("campana_id",cid),
      sb.from("mb_movimientos").select("*").eq("empresa_id",eid).eq("campana_id",cid),
      sb.from("mb_ventas").select("*").eq("empresa_id",eid).eq("campana_id",cid),
      sb.from("mb_carga_items").select("*").eq("empresa_id",eid).eq("campana_id",cid),
    ]);
    setCabeceras(cab.data??[]);
    setMovimientos(mov.data??[]);
    setVentas(ven.data??[]);
    setCargaItems(ci.data??[]);
  };

  const asegurarCabecera = async (loteId:string):Promise<string> => {
    const ex = cabeceras.find(c=>c.lote_id===loteId);
    if (ex) return ex.id;
    const sb = await getSB();
    const lote = lotes.find(l=>l.id===loteId);
    if (!lote||!empresaId) return "";
    const { data } = await sb.from("mb_cabecera").insert({
      empresa_id:empresaId, lote_id:loteId, campana_id:campanaActiva,
      cultivo:lote.cultivo, cultivo_orden:lote.cultivo_orden, hectareas:lote.hectareas,
      rinde_esp:0, rinde_real:0, precio_promedio_usd:0,
    }).select().single();
    if (data){ setCabeceras(p=>[...p,data]); return data.id; }
    return "";
  };

  // ── CALCULAR MB POR LOTE ──
  const calcularLote = (loteId:string) => {
    const lote = lotes.find(l=>l.id===loteId);
    const cab = cabeceras.find(c=>c.lote_id===loteId);
    if (!lote) return null;
    const ha = lote.hectareas || 1;

    // Ventas → precio promedio ponderado
    const vents = ventas.filter(v=>v.lote_id===loteId);
    const totalTn = vents.reduce((a,v)=>a+v.tn_vendidas,0);
    const precioPromedio = totalTn>0
      ? vents.reduce((a,v)=>a+v.tn_vendidas*v.precio_usd,0)/totalTn
      : cab?.precio_promedio_usd||0;
    const rindeUsado = cab ? (cab.rinde_real>0?cab.rinde_real:cab.rinde_esp) : 0;
    const ajuste = 1 + ((cab?.ajuste_calidad_pct||0)/100);
    const ingresoBrutoHa = rindeUsado * precioPromedio * ajuste;

    // Costos de mb_movimientos
    const movs = movimientos.filter(m=>m.lote_id===loteId);
    const costosPorGrupo: Record<number,number> = {};
    for (let g=1;g<=12;g++) costosPorGrupo[g]=0;
    for (const m of movs) {
      let usdHa = 0;
      if (m.unidad==="ha") usdHa = m.monto_usd;
      else if (m.unidad==="tn") usdHa = m.monto_usd * rindeUsado;
      else if (m.unidad==="pct") usdHa = ingresoBrutoHa * m.monto_usd/100;
      else if (m.unidad==="total") usdHa = m.monto_usd/ha;
      costosPorGrupo[m.grupo] = (costosPorGrupo[m.grupo]||0) + usdHa;
    }

    // Costos de mb_carga_items — prorratear por ha
    const itemsLote = cargaItems.filter(i=>i.lote_ids.includes(loteId));
    for (const item of itemsLote) {
      const g = GRUPO_MAP[item.grupo] || 12;
      // Ha totales de los lotes incluidos en este item
      const haTotalesItem = item.lote_ids.reduce((a,lid)=>{
        const l = lotes.find(x=>x.id===lid);
        return a + (l?.hectareas||0);
      },0);
      const proporcion = haTotalesItem>0 ? ha/haTotalesItem : 1;
      let usdHa = 0;
      if (item.unidad==="ha") usdHa = item.monto_usd;
      else if (item.unidad==="total") usdHa = (item.monto_usd * proporcion)/ha;
      else if (item.unidad==="tn") usdHa = item.monto_usd * rindeUsado;
      else if (item.unidad==="pct") usdHa = ingresoBrutoHa * item.monto_usd/100;
      costosPorGrupo[g] = (costosPorGrupo[g]||0) + usdHa;
    }

    const costoTotalHa = Object.values(costosPorGrupo).reduce((a,v)=>a+v,0);
    const mbHa = ingresoBrutoHa - costoTotalHa;
    const rindeEq = precioPromedio>0 ? costoTotalHa/precioPromedio : 0;
    const cobertura = ingresoBrutoHa>0 ? costoTotalHa/ingresoBrutoHa*100 : 0;
    return {
      rindeUsado, precioPromedio, ingresoBrutoHa, ingresoBrutoTotal:ingresoBrutoHa*ha,
      costosPorGrupo, costoTotalHa, costoTotalTotal:costoTotalHa*ha,
      mbHa, mbTotal:mbHa*ha, rindeEq, cobertura,
      estado: cab?.rinde_real>0?"real":"estimado",
      tieneDatos: rindeUsado>0||costoTotalHa>0,
    };
  };

  const guardarRinde = async () => {
    if (!loteActivo||!empresaId) return;
    const cabId = await asegurarCabecera(loteActivo);
    if (!cabId) return;
    const sb = await getSB();
    await sb.from("mb_cabecera").update({
      rinde_esp:Number(form.rinde_esp||0),
      rinde_real:Number(form.rinde_real||0),
      ajuste_calidad_pct:Number(form.ajuste_calidad_pct||0),
    }).eq("id",cabId);
    msg("✅ Rinde guardado");
    await fetchAll(empresaId,campanaActiva);
    setShowFormRinde(false); setForm({});
  };

  const guardarVenta = async () => {
    if (!loteActivo||!empresaId||!form.v_fecha||!form.v_tn||!form.v_precio) return;
    const cabId = await asegurarCabecera(loteActivo);
    if (!cabId) return;
    const sb = await getSB();
    await sb.from("mb_ventas").insert({
      empresa_id:empresaId, lote_id:loteActivo, campana_id:campanaActiva,
      cabecera_id:cabId, fecha:form.v_fecha,
      tn_vendidas:Number(form.v_tn), precio_usd:Number(form.v_precio),
      destino:form.v_destino||"", estado:form.v_estado||"pactada",
    });
    msg("✅ Venta guardada");
    await fetchAll(empresaId,campanaActiva);
    setShowFormVenta(false); setForm({});
  };

  const loteData   = loteActivo ? lotes.find(l=>l.id===loteActivo) : null;
  const cabActiva  = loteActivo ? cabeceras.find(c=>c.lote_id===loteActivo) : null;
  const calcActivo = loteActivo ? calcularLote(loteActivo) : null;
  const ventasActivas = loteActivo ? ventas.filter(v=>v.lote_id===loteActivo) : [];

  // Totales generales campaña
  const totalHaCamp = lotes.reduce((a,l)=>a+l.hectareas,0);
  const resumenCamp = lotes.map(l=>({ lote:l, calc:calcularLote(l.id) }));
  const totalMBCamp = resumenCamp.reduce((a,r)=>a+(r.calc?r.calc.mbTotal:0),0);
  const totalIngCamp = resumenCamp.reduce((a,r)=>a+(r.calc?r.calc.ingresoBrutoTotal:0),0);
  const totalCostCamp = resumenCamp.reduce((a,r)=>a+(r.calc?r.calc.costoTotalTotal:0),0);

  const iCls:any = { background:"rgba(255,255,255,0.06)",border:"1px solid rgba(201,162,39,0.35)",borderRadius:9,color:"#fff",padding:"9px 13px",fontSize:13,fontFamily:"'DM Sans',sans-serif",width:"100%",outline:"none" };
  const lCls:any = { display:"block",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1.2,color:"rgba(201,162,39,0.65)",marginBottom:5 };

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#080808",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:28,height:28,border:"3px solid #c9a227",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#c9a227",fontWeight:700,fontSize:14,letterSpacing:1}}>MARGEN BRUTO</span>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"radial-gradient(ellipse at 30% 0%,#1a1200 0%,#080808 55%)",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#fff"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glowIn{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}
        @keyframes shimmer{0%,100%{opacity:0.6}50%{opacity:1}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}

        *{box-sizing:border-box;}

        /* ── LINGOTE PRINCIPAL (lotes en grid) ── */
        .lingote-lote {
          position:relative;
          cursor:pointer;
          border-radius:12px;
          overflow:hidden;
          transition:transform 0.25s ease, filter 0.25s ease;
          /* Efecto 3D del lingote: cara superior brillante + cara frontal oscura + glow */
          background: linear-gradient(
            145deg,
            #ffe87a 0%,      /* esquina superior izq brillante */
            #f0d060 15%,     /* cara superior */
            #c9a227 35%,     /* cara superior media */
            #b8860b 55%,     /* transición cara frontal */
            #8a6500 75%,     /* cara frontal oscura */
            #6a4d00 90%,     /* profundidad */
            #4a3500 100%     /* base */
          );
          box-shadow:
            /* aristas superiores brillantes */
            inset 0 2px 0 rgba(255,255,180,0.90),
            inset 2px 0 0 rgba(255,240,120,0.40),
            /* sombra profunda inferior */
            0 20px 60px rgba(0,0,0,0.90),
            0 8px 24px rgba(0,0,0,0.70),
            /* glow naranja-dorado alrededor */
            0 0 30px rgba(201,162,39,0.25),
            0 0 60px rgba(180,120,0,0.15);
        }
        .lingote-lote::before {
          content:"";
          position:absolute;
          top:0; left:0; right:0;
          height:45%;
          background: linear-gradient(
            180deg,
            rgba(255,255,200,0.35) 0%,
            rgba(255,240,120,0.15) 50%,
            transparent 100%
          );
          pointer-events:none;
          z-index:1;
        }
        .lingote-lote::after {
          content:"";
          position:absolute;
          top:0; left:0; right:0;
          height:3px;
          background: linear-gradient(90deg,
            transparent 0%,
            rgba(255,255,200,0.60) 20%,
            rgba(255,255,255,0.95) 45%,
            rgba(255,255,200,0.90) 55%,
            rgba(255,240,120,0.60) 80%,
            transparent 100%
          );
          z-index:2;
        }
        .lingote-lote:hover {
          transform: translateY(-8px) scale(1.02);
          filter: brightness(1.12);
          box-shadow:
            inset 0 2px 0 rgba(255,255,180,0.90),
            inset 2px 0 0 rgba(255,240,120,0.40),
            0 30px 80px rgba(0,0,0,0.90),
            0 12px 36px rgba(0,0,0,0.70),
            0 0 50px rgba(201,162,39,0.45),
            0 0 100px rgba(180,120,0,0.25);
        }
        .lingote-lote:active { transform:translateY(-2px) scale(0.99); }

        /* ── LINGOTE PEQUEÑO (grupos de costo) ── */
        .lingote-grupo {
          position:relative;
          cursor:pointer;
          border-radius:10px;
          overflow:hidden;
          transition:all 0.20s ease;
          background: linear-gradient(145deg,#f0d060 0%,#c9a227 30%,#a07800 60%,#7a5c00 100%);
          box-shadow:
            inset 0 1.5px 0 rgba(255,255,180,0.85),
            0 8px 24px rgba(0,0,0,0.80),
            0 0 20px rgba(201,162,39,0.18);
        }
        .lingote-grupo::after {
          content:"";
          position:absolute;
          top:0;left:0;right:0;height:2px;
          background:linear-gradient(90deg,transparent,rgba(255,255,200,0.80),rgba(255,255,255,0.90),rgba(255,255,200,0.80),transparent);
        }
        .lingote-grupo:hover {
          transform:translateY(-3px);
          box-shadow:
            inset 0 1.5px 0 rgba(255,255,180,0.85),
            0 14px 36px rgba(0,0,0,0.80),
            0 0 36px rgba(201,162,39,0.35);
        }
        .lingote-grupo.abierto {
          background:linear-gradient(145deg,#ffe87a 0%,#f0d060 30%,#c9a227 60%,#8a6500 100%);
          box-shadow:
            inset 0 1.5px 0 rgba(255,255,180,0.90),
            0 14px 40px rgba(0,0,0,0.80),
            0 0 40px rgba(255,220,50,0.40);
        }

        /* ── TOPBAR ── */
        .topbar-mb {
          background:linear-gradient(180deg,#1a1200 0%,#0d0900 100%);
          border-bottom:1px solid rgba(201,162,39,0.20);
          box-shadow:0 2px 20px rgba(0,0,0,0.70);
        }

        /* ── INPUTS ── */
        .inp-g{background:rgba(255,255,255,0.05);border:1px solid rgba(201,162,39,0.30);border-radius:9px;color:#fff;padding:9px 13px;font-size:13px;font-family:'DM Sans',sans-serif;width:100%;outline:none;transition:border-color 0.18s;}
        .inp-g:focus{border-color:#c9a227;background:rgba(201,162,39,0.07);}
        .inp-g::placeholder{color:rgba(255,255,255,0.20);}
        .inp-g option{background:#1a1200;color:#fff;}

        /* ── BOTONES ── */
        .btn-gold{background:linear-gradient(135deg,#8a6500 0%,#c9a227 30%,#ffe87a 50%,#c9a227 70%,#8a6500 100%);border:none;border-radius:9px;color:#0d0900;font-weight:900;font-size:12px;cursor:pointer;padding:9px 18px;transition:all 0.18s;font-family:'DM Sans',sans-serif;letter-spacing:0.5px;}
        .btn-gold:hover{filter:brightness(1.12);transform:translateY(-1px);}
        .btn-outline{background:transparent;border:1px solid rgba(201,162,39,0.35);border-radius:9px;color:#c9a227;font-weight:700;font-size:11px;cursor:pointer;padding:6px 14px;transition:all 0.18s;font-family:'DM Sans',sans-serif;}
        .btn-outline:hover{background:rgba(201,162,39,0.12);}

        /* ── TEXTO DORADO ── */
        .text-gold{background:linear-gradient(180deg,#ffe87a 0%,#c9a227 50%,#f0d060 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
        .text-gold-sm{color:#c9a227;}

        /* ── TABLA ── */
        .row-g:hover{background:rgba(201,162,39,0.06)!important;}

        /* ── SEPARADOR ── */
        .sep{height:1px;background:linear-gradient(90deg,transparent,rgba(201,162,39,0.30),transparent);}

        /* ── ANIMACIONES ── */
        .fade-up{animation:fadeUp 0.28s ease both;}
        .glow-in{animation:glowIn 0.35s ease both;}

        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:rgba(201,162,39,0.22);border-radius:4px}
      `}</style>

      {/* ── TOPBAR ── */}
      <div className="topbar-mb" style={{position:"sticky",top:0,zIndex:30}}>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 20px",flexWrap:"wrap"}}>
          <button onClick={()=>loteActivo?setLoteActivo(null):window.location.href="/productor/dashboard"}
            style={{background:"none",border:"none",cursor:"pointer",color:"rgba(201,162,39,0.55)",fontSize:13,fontWeight:700,fontFamily:"inherit"}}>
            ← {loteActivo?"Volver":"Dashboard"}
          </button>
          <div style={{width:1,height:18,background:"rgba(201,162,39,0.20)"}}/>
          <div className="text-gold" style={{fontSize:15,fontWeight:900,letterSpacing:1.5,textTransform:"uppercase"}}>📊 Margen Bruto</div>
          <div style={{flex:1}}/>
          {/* TC */}
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:8,border:"1px solid rgba(201,162,39,0.22)",background:"rgba(201,162,39,0.06)"}}>
            <span style={{fontSize:9,color:"rgba(201,162,39,0.45)",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>TC BNA</span>
            <span className="text-gold" style={{fontSize:13,fontWeight:800}}>${fmt(tcVenta)}</span>
            {tcFecha&&<span style={{fontSize:9,color:"rgba(201,162,39,0.30)"}}>{tcFecha}</span>}
            <button onClick={()=>empresaId&&fetchTC(empresaId)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(201,162,39,0.50)",fontSize:12}}>↺</button>
          </div>
          {/* Campaña */}
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 12px",borderRadius:8,border:"1px solid rgba(201,162,39,0.22)",background:"rgba(201,162,39,0.06)"}}>
            <span style={{fontSize:9,color:"rgba(201,162,39,0.45)",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Campaña</span>
            <select value={campanaActiva} onChange={async e=>{setCampanaActiva(e.target.value);setLoteActivo(null);if(empresaId)await fetchAll(empresaId,e.target.value);}}
              style={{background:"transparent",border:"none",color:"#c9a227",fontWeight:800,fontSize:12,cursor:"pointer",outline:"none",fontFamily:"inherit"}}>
              {campanas.map(c=><option key={c.id} value={c.id} style={{background:"#1a1200",color:"#f0e6c8"}}>{c.nombre}{c.activa?" ★":""}</option>)}
            </select>
          </div>
          {/* Link centro de gestión */}
          <button onClick={()=>window.location.href="/productor/otros"} className="btn-outline" style={{fontSize:11}}>⚙ Cargar Datos</button>
        </div>
      </div>

      <div style={{maxWidth:1360,margin:"0 auto",padding:"20px 20px 100px"}}>

        {/* Toast */}
        {msgExito&&<div className="fade-up" style={{marginBottom:14,padding:"10px 16px",borderRadius:10,fontSize:13,fontWeight:700,
          color:msgExito.startsWith("✅")?"#86efac":"#fca5a5",
          background:msgExito.startsWith("✅")?"rgba(22,163,74,0.12)":"rgba(220,38,38,0.12)",
          border:`1px solid ${msgExito.startsWith("✅")?"rgba(22,163,74,0.30)":"rgba(220,38,38,0.30)"}`,
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          {msgExito}<button onClick={()=>setMsgExito("")} style={{background:"none",border:"none",cursor:"pointer",color:"inherit",fontSize:16,opacity:0.5}}>✕</button>
        </div>}

        {/* ══════════════════════════════
            VISTA PRINCIPAL — GRID LOTES
        ══════════════════════════════ */}
        {!loteActivo&&(
          <div className="fade-up">
            {/* KPIs campaña */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10,marginBottom:24}}>
              {[
                {l:"Ha Totales",    v:`${fmt(totalHaCamp)} ha`,                    c:"#c9a227"},
                {l:"Ingreso Total", v:`U$S ${fmt(totalIngCamp)}`,                  c:"#86efac"},
                {l:"Costo Total",   v:`U$S ${fmt(totalCostCamp)}`,                 c:"#fca5a5"},
                {l:"Margen Bruto",  v:`U$S ${fmt(totalMBCamp)}`,                   c:totalMBCamp>=0?"#93c5fd":"#fca5a5"},
                {l:"MB / Ha",       v:`U$S ${fmt(totalHaCamp>0?totalMBCamp/totalHaCamp:0)}/ha`, c:"#f0d060"},
              ].map(s=>(
                <div key={s.l} style={{padding:"12px 16px",borderRadius:10,background:"rgba(201,162,39,0.06)",border:"1px solid rgba(201,162,39,0.18)",textAlign:"center"}}>
                  <div style={{fontSize:8,fontWeight:800,textTransform:"uppercase",letterSpacing:1.2,color:"rgba(201,162,39,0.45)",marginBottom:4}}>{s.l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Separador */}
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:22}}>
              <div className="sep" style={{flex:1}}/>
              <div className="text-gold" style={{fontSize:11,fontWeight:900,letterSpacing:3,textTransform:"uppercase"}}>Lotes — Campaña {campanas.find(c=>c.id===campanaActiva)?.nombre}</div>
              <div className="sep" style={{flex:1}}/>
            </div>

            {/* Grid de lingotes por lote */}
            {lotes.length===0?(
              <div style={{textAlign:"center",padding:"60px 20px",color:"rgba(201,162,39,0.30)",fontSize:13}}>
                <div style={{fontSize:48,marginBottom:12,opacity:0.3}}>📊</div>
                Sin lotes en esta campaña
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:20}}>
                {resumenCamp.map(({lote,calc},idx)=>{
                  const color = CULTIVO_COLORS[lote.cultivo]??"#22c55e";
                  const icon  = CULTIVO_ICONS[lote.cultivo]??"🌾";
                  const cab   = cabeceras.find(c=>c.lote_id===lote.id);
                  return(
                    <div key={lote.id} className="lingote-lote glow-in"
                      style={{animationDelay:`${idx*0.08}s`,padding:"20px 18px 18px",minHeight:200}}
                      onClick={()=>setLoteActivo(lote.id)}>
                      {/* Contenido sobre el lingote */}
                      <div style={{position:"relative",zIndex:3}}>
                        {/* Icono + nombre */}
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                          <span style={{fontSize:28,filter:"drop-shadow(0 2px 4px rgba(0,0,0,0.40))"}}>{icon}</span>
                          <div>
                            <div style={{fontSize:16,fontWeight:900,color:"#0d0900",textTransform:"uppercase",letterSpacing:0.5,textShadow:"0 1px 0 rgba(255,255,180,0.40)"}}>{lote.nombre}</div>
                            <div style={{fontSize:10,fontWeight:700,color:"rgba(0,0,0,0.50)"}}>{lote.cultivo_completo||lote.cultivo||"—"} · {lote.hectareas} ha</div>
                          </div>
                          <div style={{marginLeft:"auto"}}>
                            {cab&&<span style={{fontSize:8,padding:"2px 7px",borderRadius:20,fontWeight:800,background:cab.cerrado?"rgba(0,80,0,0.30)":"rgba(0,0,0,0.20)",color:cab.cerrado?"#86efac":"rgba(0,0,0,0.60)",border:`1px solid ${cab.cerrado?"rgba(0,200,0,0.30)":"rgba(0,0,0,0.15)"}`}}>{cab.cerrado?"✅ REAL":"📋 EST."}</span>}
                          </div>
                        </div>

                        {/* Separador dorado */}
                        <div style={{height:1,background:"linear-gradient(90deg,transparent,rgba(0,0,0,0.20),transparent)",marginBottom:12}}/>

                        {/* Números */}
                        {calc?.tieneDatos?(
                          <>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
                              {[
                                {l:"INGRESO/HA",v:`U$S ${fmt(calc.ingresoBrutoHa,0)}`,c:"rgba(0,80,0,0.80)"},
                                {l:"COSTO/HA",  v:`U$S ${fmt(calc.costoTotalHa,0)}`,  c:"rgba(120,0,0,0.70)"},
                                {l:"MB/HA",     v:`U$S ${fmt(calc.mbHa,0)}`,           c:calc.mbHa>=0?"rgba(0,0,100,0.80)":"rgba(150,0,0,0.80)"},
                              ].map(s=>(
                                <div key={s.l} style={{textAlign:"center",padding:"6px 4px",borderRadius:7,background:"rgba(0,0,0,0.18)",backdropFilter:"blur(4px)"}}>
                                  <div style={{fontSize:7,fontWeight:800,textTransform:"uppercase",color:"rgba(0,0,0,0.45)",marginBottom:2,letterSpacing:0.5}}>{s.l}</div>
                                  <div style={{fontSize:11,fontWeight:900,color:s.c}}>{s.v}</div>
                                </div>
                              ))}
                            </div>
                            {/* Barra MB */}
                            <div style={{height:5,background:"rgba(0,0,0,0.20)",borderRadius:4,overflow:"hidden",marginBottom:4}}>
                              <div style={{height:"100%",background:calc.mbHa>=0?"rgba(0,100,0,0.60)":"rgba(180,0,0,0.60)",borderRadius:4,
                                width:`${Math.min(100,Math.max(0,calc.ingresoBrutoHa>0?calc.mbHa/calc.ingresoBrutoHa*100:0))}%`,
                                transition:"width 0.8s ease"}}/>
                            </div>
                            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"rgba(0,0,0,0.45)",fontWeight:700}}>
                              <span>MB: {calc.ingresoBrutoHa>0?(calc.mbHa/calc.ingresoBrutoHa*100).toFixed(0):0}%</span>
                              <span>Eq: {calc.rindeEq.toFixed(2)} tn/ha</span>
                            </div>
                          </>
                        ):(
                          <div style={{textAlign:"center",padding:"16px 0",color:"rgba(0,0,0,0.40)",fontSize:11,fontWeight:600}}>
                            Clic para cargar datos
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════
            DETALLE LOTE
        ══════════════════════════════ */}
        {loteActivo&&loteData&&calcActivo&&(
          <div className="fade-up">
            {/* Hero header */}
            <div style={{borderRadius:16,overflow:"hidden",marginBottom:16,
              background:"linear-gradient(145deg,#1a1200 0%,#0d0900 100%)",
              border:"1px solid rgba(201,162,39,0.30)",
              boxShadow:"0 8px 32px rgba(0,0,0,0.80),0 0 40px rgba(201,162,39,0.12)"}}>
              <div style={{padding:"20px 24px"}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:36,filter:"drop-shadow(0 0 8px rgba(201,162,39,0.50))"}}>{CULTIVO_ICONS[loteData.cultivo]??"🌾"}</span>
                    <div>
                      <div className="text-gold" style={{fontSize:24,fontWeight:900,letterSpacing:1,textTransform:"uppercase"}}>{loteData.nombre}</div>
                      <div style={{fontSize:11,color:"rgba(201,162,39,0.55)",marginTop:2}}>
                        {loteData.cultivo_completo||loteData.cultivo} · {loteData.hectareas} ha · {campanas.find(c=>c.id===campanaActiva)?.nombre}
                        {cabActiva&&<span style={{marginLeft:8,fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:cabActiva.cerrado?"rgba(22,163,74,0.20)":"rgba(217,119,6,0.15)",color:cabActiva.cerrado?"#86efac":"#fde68a"}}>{cabActiva.cerrado?"✅ REAL":"📋 ESTIMADO"}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <button onClick={()=>{setShowFormRinde(!showFormRinde);setForm({rinde_esp:String(cabActiva?.rinde_esp||""),rinde_real:String(cabActiva?.rinde_real||""),ajuste_calidad_pct:String(cabActiva?.ajuste_calidad_pct||"")});}} className="btn-outline" style={{fontSize:11}}>🌾 Rinde/Precio</button>
                    <button onClick={()=>{setShowFormVenta(true);setForm({v_fecha:new Date().toISOString().split("T")[0],v_estado:"pactada"});}} style={{padding:"7px 13px",borderRadius:9,background:"rgba(22,163,74,0.20)",border:"1px solid rgba(22,163,74,0.40)",color:"#86efac",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>💰 + Venta</button>
                    <button onClick={()=>window.location.href="/productor/otros"} className="btn-outline" style={{fontSize:11}}>⚙ Cargar Costos</button>
                  </div>
                </div>

                {/* Banda 3 números grandes */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginTop:16}}>
                  {[
                    {l:"INGRESO / HA",    v:`U$S ${fmt(calcActivo.ingresoBrutoHa,0)}`,  sub:`Total: U$S ${fmt(calcActivo.ingresoBrutoTotal,0)}`,  bc:"rgba(22,163,74,0.15)",  c:"#86efac"},
                    {l:"COSTO / HA",      v:`U$S ${fmt(calcActivo.costoTotalHa,0)}`,    sub:`Total: U$S ${fmt(calcActivo.costoTotalTotal,0)}`,     bc:"rgba(220,38,38,0.15)",  c:"#fca5a5"},
                    {l:"MARGEN BRUTO/HA", v:`U$S ${fmt(calcActivo.mbHa,0)}`,            sub:`Total: U$S ${fmt(calcActivo.mbTotal,0)}`,             bc:calcActivo.mbHa>=0?"rgba(25,118,210,0.15)":"rgba(220,38,38,0.15)", c:calcActivo.mbHa>=0?"#93c5fd":"#fca5a5"},
                  ].map(s=>(
                    <div key={s.l} style={{padding:"14px 18px",borderRadius:12,background:s.bc,border:`1px solid ${s.c}25`}}>
                      <div style={{fontSize:9,color:"rgba(255,255,255,0.45)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{s.l}</div>
                      <div style={{fontSize:26,fontWeight:900,color:s.c,lineHeight:1,marginBottom:3}}>{s.v}</div>
                      <div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{s.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Forms */}
            {showFormRinde&&(
              <div style={{background:"rgba(201,162,39,0.06)",border:"1px solid rgba(201,162,39,0.25)",borderRadius:12,padding:"16px 20px",marginBottom:12}} className="fade-up">
                <div className="text-gold" style={{fontSize:13,fontWeight:900,marginBottom:12}}>🌾 Producción y Precio</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:12}}>
                  <div><div style={lCls}>Rinde esperado</div><input type="number" step="0.1" value={form.rinde_esp||""} onChange={e=>setForm({...form,rinde_esp:e.target.value})} className="inp-g" placeholder="tn/ha"/></div>
                  <div><div style={lCls}>Rinde real</div><input type="number" step="0.1" value={form.rinde_real||""} onChange={e=>setForm({...form,rinde_real:e.target.value})} className="inp-g" placeholder="tn/ha"/></div>
                  <div><div style={lCls}>Ajuste calidad %</div><input type="number" step="0.1" value={form.ajuste_calidad_pct||""} onChange={e=>setForm({...form,ajuste_calidad_pct:e.target.value})} className="inp-g" placeholder="0"/></div>
                </div>
                <p style={{fontSize:10,color:"rgba(201,162,39,0.40)",marginBottom:10}}>💡 El precio se calcula automáticamente del promedio ponderado de las ventas registradas.</p>
                <div style={{display:"flex",gap:8}}><button onClick={guardarRinde} className="btn-gold">✓ Guardar</button><button onClick={()=>{setShowFormRinde(false);setForm({});}} className="btn-outline">Cancelar</button></div>
              </div>
            )}

            {showFormVenta&&(
              <div style={{background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.25)",borderRadius:12,padding:"16px 20px",marginBottom:12}} className="fade-up">
                <div style={{fontSize:13,fontWeight:900,color:"#86efac",marginBottom:12}}>💰 Registrar Venta</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:10}}>
                  <div><div style={lCls}>Fecha</div><input type="date" value={form.v_fecha||""} onChange={e=>setForm({...form,v_fecha:e.target.value})} className="inp-g"/></div>
                  <div><div style={lCls}>Toneladas</div><input type="number" step="0.1" value={form.v_tn||""} onChange={e=>setForm({...form,v_tn:e.target.value})} className="inp-g" placeholder="0"/></div>
                  <div><div style={lCls}>Precio U$S/tn</div><input type="number" step="0.5" value={form.v_precio||""} onChange={e=>setForm({...form,v_precio:e.target.value})} className="inp-g" placeholder="0"/></div>
                  <div><div style={lCls}>Destino</div><input type="text" value={form.v_destino||""} onChange={e=>setForm({...form,v_destino:e.target.value})} className="inp-g" placeholder="Acopio..."/></div>
                  <div><div style={lCls}>Estado</div>
                    <select value={form.v_estado||"pactada"} onChange={e=>setForm({...form,v_estado:e.target.value})} className="inp-g">
                      <option value="pactada">Pactada</option><option value="entregada">Entregada</option><option value="cobrada">Cobrada</option>
                    </select>
                  </div>
                </div>
                {form.v_tn&&form.v_precio&&<div style={{fontSize:11,color:"#86efac",fontWeight:700,marginBottom:8}}>Total: U$S {(Number(form.v_tn)*Number(form.v_precio)).toFixed(2)}</div>}
                <div style={{display:"flex",gap:8}}><button onClick={guardarVenta} className="btn-gold">✓ Guardar</button><button onClick={()=>{setShowFormVenta(false);setForm({});}} className="btn-outline">Cancelar</button></div>
              </div>
            )}

            {/* Ventas */}
            {ventasActivas.length>0&&(
              <div style={{background:"rgba(201,162,39,0.04)",border:"1px solid rgba(201,162,39,0.15)",borderRadius:10,overflow:"hidden",marginBottom:12}}>
                <div style={{padding:"9px 14px",borderBottom:"1px solid rgba(201,162,39,0.12)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:10,fontWeight:800,color:"rgba(201,162,39,0.55)",textTransform:"uppercase",letterSpacing:1}}>💰 Ventas ({ventasActivas.length})</span>
                  <span className="text-gold-sm" style={{fontSize:12,fontWeight:800}}>
                    {ventasActivas.reduce((a,v)=>a+v.tn_vendidas,0).toFixed(1)} tn · prom U$S {ventasActivas.length>0?(ventasActivas.reduce((a,v)=>a+v.tn_vendidas*v.precio_usd,0)/ventasActivas.reduce((a,v)=>a+v.tn_vendidas,0)).toFixed(0):0}/tn
                  </span>
                </div>
                <div style={{display:"flex",flexDirection:"column"}}>
                  {ventasActivas.map(v=>(
                    <div key={v.id} style={{padding:"8px 14px",borderBottom:"1px solid rgba(201,162,39,0.06)",display:"flex",alignItems:"center",gap:12}}>
                      <span style={{fontSize:10,color:"rgba(255,255,255,0.40)",whiteSpace:"nowrap"}}>{v.fecha}</span>
                      <span style={{fontWeight:800,color:"#f0e6c8"}}>{v.tn_vendidas} tn</span>
                      <span style={{color:"#c9a227",fontWeight:700}}>U$S {v.precio_usd.toFixed(0)}/tn</span>
                      <span style={{fontWeight:800,color:"#86efac"}}>= U$S {(v.tn_vendidas*v.precio_usd).toFixed(0)}</span>
                      {v.destino&&<span style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{v.destino}</span>}
                      <span style={{marginLeft:"auto",fontSize:9,padding:"2px 7px",borderRadius:20,fontWeight:700,
                        background:v.estado==="cobrada"?"rgba(22,163,74,0.20)":v.estado==="entregada"?"rgba(25,118,210,0.20)":"rgba(217,119,6,0.15)",
                        color:v.estado==="cobrada"?"#86efac":v.estado==="entregada"?"#93c5fd":"#fde68a"}}>{v.estado}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── DESGLOSE COSTOS — 12 GRUPOS IGUAL A CENTRO DE GESTIÓN ── */}
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
              <div className="sep" style={{flex:1}}/>
              <div className="text-gold" style={{fontSize:10,fontWeight:900,letterSpacing:2,textTransform:"uppercase"}}>Desglose de Costos</div>
              <div className="sep" style={{flex:1}}/>
            </div>

            {/* Grid 3 columnas igual al grid de lotes */}
            {[0,1,2,3].map(row=>(
              <div key={row} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:16}}>
                {GRUPOS_MB_LIST.filter((_,i)=>Math.floor(i/3)===row).map((grupo,idx)=>{
                  const costoHa = calcActivo.costosPorGrupo[grupo.num]||0;
                  // Sumar combustibles al grupo 1 si aplica
                  const costoHaReal = grupo.id==="labranzas"
                    ? (calcActivo.costosPorGrupo[1]||0)
                    : costoHa;
                  const pct = calcActivo.costoTotalHa>0?(costoHaReal/calcActivo.costoTotalHa*100):0;
                  const isOpen = grupoAbierto===grupo.num&&(grupoAbierto!==1||grupo.id==="labranzas"||grupoAbierto===grupo.num);
                  const isOpenKey = `${grupo.id}-${grupo.num}`;

                  // Items de mb_carga_items para este grupo
                  const cargaGrupo = cargaItems.filter(i=>i.lote_ids.includes(loteActivo!)&&i.grupo===grupo.id);
                  // Items de mb_movimientos para este grupo
                  const movsGrupo = movimientos.filter(m=>m.lote_id===loteActivo&&m.grupo===grupo.num);
                  const totalItems = cargaGrupo.length + movsGrupo.length;

                  // Agrupar por subconcepto
                  const subitems: Record<string,{usd:number;fecha:string;desc:string;origen:string}[]> = {};
                  // Primero los items definidos del grupo (para mantener orden)
                  grupo.items.forEach(sub=>{
                    const itemsCG = cargaGrupo.filter(i=>i.subgrupo===sub||i.subgrupo===sub.toLowerCase());
                    const mesNum = grupo.id==="alquiler"?["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"].indexOf(sub)+1:null;
                    const itemsMes = mesNum&&mesNum>0 ? cargaGrupo.filter(i=>i.mes===mesNum) : [];
                    const registros = [
                      ...(mesNum&&mesNum>0?itemsMes:itemsCG).map(i=>({usd:i.monto_usd,fecha:i.fecha,desc:i.descripcion||i.articulo||"",origen:"CG"})),
                    ];
                    if(registros.length>0) subitems[sub]=registros;
                  });
                  // Después los de mb_movimientos
                  movsGrupo.forEach(m=>{
                    if(!subitems[m.concepto]) subitems[m.concepto]=[];
                    subitems[m.concepto].push({usd:m.monto_usd,fecha:m.fecha,desc:m.descripcion||"",origen:"MB"});
                  });

                  const isGrupoOpen = grupoAbierto===idx+(row*3);

                  return(
                    <div key={grupo.id} style={{
                      position:"relative",borderRadius:12,overflow:"hidden",
                      background:"linear-gradient(160deg,#2a1e00 0%,#1a1200 40%,#0d0900 100%)",
                      boxShadow:isGrupoOpen
                        ?"0 0 0 1.5px #7a5c00,0 0 0 2.5px #c9a227,0 0 0 3.5px #f0d060,0 0 0 4px #c9a227,0 0 0 5px #7a5c00,0 12px 36px rgba(0,0,0,0.85),0 0 40px rgba(255,200,50,0.25)"
                        :"0 0 0 1.5px #7a5c00,0 0 0 2.5px #c9a227,0 0 0 3.5px #f0d060,0 0 0 4px #c9a227,0 0 0 5px #7a5c00,0 8px 24px rgba(0,0,0,0.70),inset 0 1px 0 rgba(255,230,100,0.22)",
                      cursor:"pointer",
                      transition:"box-shadow 0.20s,transform 0.20s",
                      minHeight:160,
                    }}
                      onClick={()=>setGrupoAbierto(isGrupoOpen?null:idx+(row*3))}>
                      {/* Brillo superior */}
                      <div style={{position:"absolute",top:0,left:0,right:0,height:"2px",background:"linear-gradient(90deg,transparent,rgba(255,230,100,0.75),rgba(255,255,180,1),rgba(255,230,100,0.75),transparent)",zIndex:2}}/>
                      {/* Brillo reflejo cara superior */}
                      <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(255,230,100,0.10) 0%,transparent 45%,rgba(255,200,50,0.05) 100%)",pointerEvents:"none",zIndex:1}}/>

                      {/* Contenido */}
                      <div style={{position:"relative",zIndex:3,padding:"18px 16px 14px",display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",minHeight:160}}>
                        <div style={{fontSize:28,marginBottom:8,filter:"drop-shadow(0 0 8px rgba(201,162,39,0.55))"}}>{grupo.icon}</div>
                        <div className="text-gold" style={{fontSize:12,fontWeight:900,letterSpacing:0.8,textTransform:"uppercase",lineHeight:1.3,marginBottom:8}}>{grupo.label}</div>
                        <div style={{height:1,background:"linear-gradient(90deg,transparent,rgba(201,162,39,0.45),transparent)",width:"100%",marginBottom:8}}/>
                        {costoHaReal>0?(
                          <>
                            <div style={{fontSize:16,fontWeight:900,color:"#fff",textShadow:"0 1px 3px rgba(0,0,0,0.60)"}}>{fmtUsd(costoHaReal)}/ha</div>
                            <div style={{fontSize:10,fontWeight:700,color:"rgba(201,162,39,0.65)",marginTop:2}}>{pct.toFixed(1)}% del total</div>
                            {/* Barra */}
                            <div style={{width:"80%",height:4,background:"rgba(0,0,0,0.30)",borderRadius:3,overflow:"hidden",marginTop:8}}>
                              <div style={{height:"100%",background:"linear-gradient(90deg,rgba(255,255,255,0.40),rgba(255,255,255,0.70))",borderRadius:3,width:`${Math.min(100,pct)}%`}}/>
                            </div>
                            <div style={{fontSize:9,color:"rgba(255,255,255,0.40)",marginTop:4}}>{totalItems} registro{totalItems!==1?"s":""}</div>
                          </>
                        ):(
                          <div style={{fontSize:10,color:"rgba(255,255,255,0.20)",fontStyle:"italic",marginTop:4}}>Sin datos</div>
                        )}
                        <div style={{position:"absolute",bottom:8,right:10,fontSize:10,color:"rgba(201,162,39,0.35)"}}>{isGrupoOpen?"▲":"▼"}</div>
                      </div>

                      {/* Panel expandido */}
                      {isGrupoOpen&&(
                        <div style={{borderTop:"1px solid rgba(201,162,39,0.20)",background:"rgba(0,0,0,0.40)"}} className="fade-up">
                          {Object.keys(subitems).length===0?(
                            <div style={{padding:"14px 16px",textAlign:"center",color:"rgba(201,162,39,0.30)",fontSize:11}}>
                              Sin datos —{" "}
                              <button onClick={e=>{e.stopPropagation();window.location.href="/productor/otros";}}
                                style={{background:"none",border:"none",cursor:"pointer",color:"#c9a227",fontWeight:700,fontFamily:"inherit",fontSize:11}}>
                                Cargar →
                              </button>
                            </div>
                          ):(
                            <div>
                              {Object.entries(subitems).map(([sub,regs])=>{
                                const totSub = regs.reduce((a,r)=>a+r.usd,0);
                                const pctSub = costoHaReal>0?(totSub/costoHaReal*100):0;
                                const pctTotal2 = calcActivo.costoTotalHa>0?(totSub/calcActivo.costoTotalHa*100):0;
                                return(
                                  <div key={sub} style={{borderBottom:"1px solid rgba(201,162,39,0.08)",padding:"8px 14px"}}>
                                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:regs.length>1?5:0}}>
                                      <div style={{width:3,height:"100%",minHeight:14,borderRadius:2,background:grupo.color,flexShrink:0}}/>
                                      <div style={{flex:1,textAlign:"left"}}>
                                        <div style={{fontSize:10,fontWeight:800,color:"#f0e6c8",textTransform:"uppercase"}}>{sub.replace(/_/g," ")}</div>
                                      </div>
                                      <div style={{textAlign:"right"}}>
                                        <div style={{fontSize:12,fontWeight:800,color:"#f0d060"}}>U$S {totSub.toFixed(2)}</div>
                                        <div style={{fontSize:8,color:"rgba(201,162,39,0.45)"}}>{pctSub.toFixed(0)}% grp · {pctTotal2.toFixed(1)}% tot</div>
                                      </div>
                                    </div>
                                    {regs.map((r,ri)=>(
                                      <div key={ri} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0 3px 11px",borderTop:ri>0?"1px solid rgba(201,162,39,0.05)":"none"}}>
                                        <span style={{fontSize:9,color:"rgba(255,255,255,0.25)",whiteSpace:"nowrap"}}>{r.fecha}</span>
                                        {r.desc&&<span style={{fontSize:9,color:"rgba(255,255,255,0.40)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textAlign:"left"}}>{r.desc}</span>}
                                        <span style={{fontSize:10,fontWeight:700,color:"#c9a227",whiteSpace:"nowrap",marginLeft:"auto"}}>U$S {r.usd.toFixed(2)}</span>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })}
                              <div style={{padding:"7px 14px",background:"rgba(201,162,39,0.08)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                <span style={{fontSize:9,fontWeight:800,color:"rgba(201,162,39,0.55)",textTransform:"uppercase",letterSpacing:0.8}}>Total</span>
                                <span className="text-gold" style={{fontSize:13,fontWeight:900}}>{fmtUsd(costoHaReal)}/ha · U$S {fmt(costoHaReal*loteData!.hectareas)} campo</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Gráfico torta + indicadores */}
            {calcActivo.costoTotalHa>0&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                {/* Torta */}
                <div style={{background:"rgba(201,162,39,0.04)",border:"1px solid rgba(201,162,39,0.15)",borderRadius:10,padding:"14px"}}>
                  <div style={{fontSize:11,fontWeight:800,color:"rgba(201,162,39,0.70)",marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>Distribución de Costos</div>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:120,height:120,flexShrink:0}}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={Object.entries(calcActivo.costosPorGrupo).filter(([,v])=>v>0).map(([g,v])=>({
                            name:GRUPOS_MB[Number(g)]?.label||g,
                            value:Math.round(v*10)/10,
                            color:GRUPOS_MB[Number(g)]?.color||"#6b7280"
                          }))} cx="50%" cy="50%" outerRadius={55} innerRadius={24} dataKey="value" paddingAngle={2}
                            labelLine={false}
                            label={({cx,cy,midAngle,innerRadius,outerRadius,percent})=>{
                              if(percent<0.07)return null;
                              const R=Math.PI/180;const r=innerRadius+(outerRadius-innerRadius)*0.6;
                              const x=cx+r*Math.cos(-midAngle*R);const y=cy+r*Math.sin(-midAngle*R);
                              return<text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight="bold">{Math.round(percent*100)}%</text>;
                            }}>
                            {Object.entries(calcActivo.costosPorGrupo).filter(([,v])=>v>0).map(([g],i)=>(
                              <Cell key={i} fill={GRUPOS_MB[Number(g)]?.color||"#6b7280"} stroke="rgba(0,0,0,0.30)" strokeWidth={2}/>
                            ))}
                          </Pie>
                          <Tooltip formatter={(v:any,n:string)=>["U$S "+Number(v).toFixed(0)+"/ha",n]} contentStyle={{background:"#1a1200",border:"1px solid rgba(201,162,39,0.30)",borderRadius:"8px",fontSize:"10px",color:"#f0e6c8"}}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
                      {Object.entries(calcActivo.costosPorGrupo).filter(([,v])=>v>0).sort(([,a],[,b])=>b-a).slice(0,6).map(([g,v])=>(
                        <div key={g} style={{display:"flex",alignItems:"center",gap:5}}>
                          <div style={{width:7,height:7,borderRadius:2,background:GRUPOS_MB[Number(g)]?.color||"#6b7280",flexShrink:0}}/>
                          <span style={{fontSize:9,color:"rgba(255,255,255,0.50)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{GRUPOS_MB[Number(g)]?.label}</span>
                          <span style={{fontSize:9,fontWeight:700,color:"#c9a227",whiteSpace:"nowrap"}}>U$S {v.toFixed(0)}</span>
                          <span style={{fontSize:8,color:"rgba(255,255,255,0.25)",minWidth:28,textAlign:"right"}}>{calcActivo.costoTotalHa>0?(v/calcActivo.costoTotalHa*100).toFixed(0):0}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Indicadores clave */}
                <div style={{background:"rgba(201,162,39,0.04)",border:"1px solid rgba(201,162,39,0.15)",borderRadius:10,padding:"14px"}}>
                  <div style={{fontSize:11,fontWeight:800,color:"rgba(201,162,39,0.70)",marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>Indicadores Clave</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {[
                      {l:"Rinde",          v:calcActivo.rindeUsado>0?`${calcActivo.rindeUsado} tn/ha`:"—",    c:"#c9a227"},
                      {l:"Precio prom.",   v:calcActivo.precioPromedio>0?`U$S ${calcActivo.precioPromedio.toFixed(0)}/tn`:"—", c:"#f0e6c8"},
                      {l:"Rinde equil.",   v:calcActivo.rindeEq>0?`${calcActivo.rindeEq.toFixed(2)} tn/ha`:"—", c:"rgba(255,255,255,0.50)"},
                      {l:"Costo/tn",       v:calcActivo.rindeUsado>0?`U$S ${(calcActivo.costoTotalHa/calcActivo.rindeUsado).toFixed(0)}`:"—", c:"#fca5a5"},
                      {l:"Cobertura",      v:`${calcActivo.cobertura.toFixed(0)}%`,          c:calcActivo.cobertura<100?"#86efac":"#fca5a5"},
                      {l:"Rentabilidad",   v:calcActivo.costoTotalHa>0?`${(calcActivo.mbHa/calcActivo.costoTotalHa*100).toFixed(0)}%`:"—", c:calcActivo.mbHa>=0?"#93c5fd":"#fca5a5"},
                    ].map(s=>(
                      <div key={s.l} style={{padding:"8px 10px",borderRadius:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(201,162,39,0.10)"}}>
                        <div style={{fontSize:8,color:"rgba(201,162,39,0.40)",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>{s.l}</div>
                        <div style={{fontSize:13,fontWeight:800,color:s.c}}>{s.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Sensibilidad */}
            {calcActivo.precioPromedio>0&&calcActivo.rindeUsado>0&&(
              <div style={{background:"rgba(201,162,39,0.04)",border:"1px solid rgba(201,162,39,0.15)",borderRadius:10,overflow:"hidden"}}>
                <div style={{padding:"9px 14px",borderBottom:"1px solid rgba(201,162,39,0.12)"}}>
                  <span style={{fontSize:10,fontWeight:800,color:"rgba(201,162,39,0.55)",textTransform:"uppercase",letterSpacing:1}}>🔬 Análisis de Sensibilidad</span>
                </div>
                <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(201,162,39,0.10)"}}>
                    {["Escenario","Rinde","Precio","MB/ha","MB Total","Equilibrio"].map(h=>(
                      <th key={h} style={{padding:"6px 12px",textAlign:"left",fontSize:8,fontWeight:800,textTransform:"uppercase",letterSpacing:0.8,color:"rgba(201,162,39,0.35)"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {[
                      {e:"Base ◀",r:calcActivo.rindeUsado,p:calcActivo.precioPromedio,base:true},
                      {e:"−10% Rinde",r:calcActivo.rindeUsado*0.9,p:calcActivo.precioPromedio,base:false},
                      {e:"+10% Rinde",r:calcActivo.rindeUsado*1.1,p:calcActivo.precioPromedio,base:false},
                      {e:"−10% Precio",r:calcActivo.rindeUsado,p:calcActivo.precioPromedio*0.9,base:false},
                      {e:"+10% Precio",r:calcActivo.rindeUsado,p:calcActivo.precioPromedio*1.1,base:false},
                    ].map((s,i)=>{
                      const ing=s.r*s.p*(1+(cabActiva?.ajuste_calidad_pct||0)/100);
                      const mb=ing-calcActivo.costoTotalHa;
                      const eq=s.p>0?calcActivo.costoTotalHa/s.p:0;
                      return(
                        <tr key={i} className="row-g" style={{borderBottom:"1px solid rgba(201,162,39,0.04)",background:s.base?"rgba(25,118,210,0.06)":"transparent",transition:"background 0.15s"}}>
                          <td style={{padding:"7px 12px",fontWeight:s.base?800:600,color:"#f0e6c8"}}>{s.e}</td>
                          <td style={{padding:"7px 12px",color:"#c9a227",fontWeight:700}}>{s.r.toFixed(2)} tn/ha</td>
                          <td style={{padding:"7px 12px",color:"#f0e6c8",fontWeight:600}}>U$S {s.p.toFixed(0)}</td>
                          <td style={{padding:"7px 12px",fontWeight:800,color:mb>=0?"#86efac":"#fca5a5"}}>U$S {mb.toFixed(0)}</td>
                          <td style={{padding:"7px 12px",fontWeight:700,color:mb>=0?"#86efac":"#fca5a5"}}>U$S {fmt(mb*loteData.hectareas,0)}</td>
                          <td style={{padding:"7px 12px",color:"rgba(255,255,255,0.35)"}}>{eq.toFixed(2)} tn/ha</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
