"use client";
// @ts-nocheck
import { useEffect, useState, useRef } from "react";

type Campana = { id: string; nombre: string; año_inicio: number; activa: boolean; };
type Lote    = { id: string; nombre: string; hectareas: number; cultivo: string; cultivo_completo: string; };
type Item    = {
  id: string; empresa_id: string; campana_id: string;
  lote_ids: string[]; grupo: string; subgrupo: string;
  concepto: string; articulo: string; descripcion: string;
  fecha: string; mes: number | null;
  moneda: string; monto_original: number; tc_usado: number; monto_usd: number;
  unidad: string; origen: string;
};

const GRUPOS = [
  { id:"labranzas",       label:"LABRANZAS\nY LABORES",       icon:"🚜", col:0, row:0,
    items:["SIEMBRA","PULVERIZACIÓN TERRESTRE","PULVERIZACIÓN AÉREA","PULVERIZACIÓN DRON","OTROS"] },
  { id:"insumos",         label:"INSUMOS",                    icon:"🧪", col:1, row:0,
    items:["SEMILLA","CURASEMILLA","FERTILIZANTES","HERBICIDA","INSECTICIDA","FUNGICIDA","COADYUVANTES","OTROS"] },
  { id:"cosecha",         label:"COSECHA",                    icon:"🌾", col:2, row:0,
    items:["COSECHA","ACARREO INTERNO","OTROS"] },
  { id:"logistica",       label:"LOGÍSTICA\nY FLETE",         icon:"🚛", col:0, row:1,
    items:["FLETE CORTO","FLETE LARGO","OTROS"] },
  { id:"comercializacion",label:"COMERCIALIZACIÓN",           icon:"🏢", col:1, row:1,
    items:["COMISIÓN","SECADO / LIMPIEZA","ALMACENAJE","ANÁLISIS","OTROS"] },
  { id:"combustibles",    label:"COMBUSTIBLES",                icon:"⛽", col:2, row:1,
    items:["GASOIL","LUBRICANTES","OTROS"] },
  { id:"alquiler",        label:"ALQUILER",                   icon:"🤝", col:0, row:2, esMensual:true,
    items:["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE","OTROS"] },
  { id:"impuestos",       label:"IMPUESTOS\nY TASAS",         icon:"📋", col:1, row:2,
    items:["INGRESOS BRUTOS","IMP. INMOBILIARIO RURAL","TASA VIAL","OTROS"] },
  { id:"seguros",         label:"SEGUROS Y\nCOBERTURAS",      icon:"🛡️", col:2, row:2,
    items:["SEGURO AGRÍCOLA","SEGURO AUTOMOTOR","OTROS"] },
  { id:"personal",        label:"COSTOS\nPERSONAL",           icon:"👤", col:0, row:3,
    items:["EMPLEADOS","INGENIERO","CONTADOR","OTROS"] },
  { id:"financieros",     label:"COSTOS\nFINANCIEROS",        icon:"🏦", col:1, row:3,
    items:["INTERESES BANCARIOS","DESCUENTO DE CHEQUES","COSTO VENTA ANTICIPADA","DIFERENCIA T.C.","OTROS"] },
  { id:"otros_directos",  label:"OTROS COSTOS\nDIRECTOS",     icon:"🔧", col:2, row:3,
    items:["REPARACIÓN Y MANTENIMIENTO","MANO DE OBRA EVENTUAL","ANÁLISIS DE SUELO","OTROS"] },
];

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
function fmt(n:number){ return Math.round(n).toLocaleString("es-AR"); }

export default function CentroGestion() {
  const [empresaId, setEmpresaId]         = useState<string|null>(null);
  const [campanas, setCampanas]           = useState<Campana[]>([]);
  const [campanaActiva, setCampanaActiva] = useState<string>("");
  const [lotes, setLotes]                 = useState<Lote[]>([]);
  const [loteActivo, setLoteActivo]       = useState<string>("todos");
  const [items, setItems]                 = useState<Item[]>([]);
  const [loading, setLoading]             = useState(true);
  const [tcVenta, setTcVenta]             = useState<number>(1400);
  const [grupoActivo, setGrupoActivo]     = useState<string|null>(null);
  const [msgExito, setMsgExito]           = useState("");
  const [panelSubgrupo, setPanelSubgrupo] = useState<{sub:string;mes?:number}|null>(null);
  const [form, setForm]                   = useState<Record<string,string>>({});
  const [lotesSelec, setLotesSelec]       = useState<string[]>([]);
  const [guardando, setGuardando]         = useState(false);
  const [empleados, setEmpleados]         = useState<{id:string;nombre:string;categoria:string;sueldo_basico:number}[]>([]);
  const importRef                         = useRef<HTMLInputElement>(null);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };
  const msg = (t:string) => { setMsgExito(t); setTimeout(()=>setMsgExito(""),4000); };

  const getTCFecha = async (fecha:string):Promise<number> => {
    if (!empresaId) return tcVenta;
    const sb = await getSB();
    const { data } = await sb.from("finanzas_cotizaciones")
      .select("usd_usado").eq("empresa_id",empresaId)
      .lte("fecha",fecha).order("fecha",{ascending:false}).limit(1);
    return data?.[0]?.usd_usado || tcVenta || 1;
  };

  useEffect(()=>{ init(); },[]);

  const init = async () => {
    const sb = await getSB();
    const { data:{ user } } = await sb.auth.getUser();
    if (!user){ window.location.href="/login"; return; }
    const { data:u } = await sb.from("usuarios").select("id").eq("auth_id",user.id).single();
    if (!u) return;
    const { data:emp } = await sb.from("empresas").select("id").eq("propietario_id",u.id).single();
    if (!emp){ setLoading(false); return; }
    setEmpresaId(emp.id);
    try { const r=await fetch("/api/cotizacion"); const d=await r.json(); if(d.venta) setTcVenta(d.venta); } catch {}
    const { data:camps } = await sb.from("campanas").select("*").eq("empresa_id",emp.id).order("año_inicio",{ascending:false});
    setCampanas(camps??[]);
    const cid=(camps??[]).find((c:any)=>c.activa)?.id??(camps??[])[0]?.id??"";
    setCampanaActiva(cid);
    if (cid) {
      const { data:ls } = await sb.from("lotes")
        .select("id,nombre,hectareas,cultivo,cultivo_completo")
        .eq("empresa_id",emp.id)
        .eq("campana_id",cid)
        .eq("es_segundo_cultivo",false)
        .order("nombre");
      const lotesArr = ls??[];
      setLotes(lotesArr);
      console.log("Lotes cargados:", lotesArr.length, "campaña:", cid);
    }
    await fetchItems(emp.id,cid);
    setLoading(false);
  };

  const fetchItems = async (eid:string,cid:string) => {
    const sb = await getSB();
    const [itemsData, empsData] = await Promise.all([
      sb.from("mb_carga_items").select("*").eq("empresa_id",eid).eq("campana_id",cid).order("fecha",{ascending:false}),
      sb.from("empleados").select("id,nombre,categoria,sueldo_basico").eq("empresa_id",eid).eq("activo",true).order("nombre"),
    ]);
    setItems(itemsData.data??[]);
    setEmpleados(empsData.data??[]);
  };

  const cambiarCampana = async (cid:string) => {
    if (!cid) return;
    setCampanaActiva(cid);
    if (!empresaId) return;
    const sb = await getSB();
    const { data:ls } = await sb.from("lotes")
      .select("id,nombre,hectareas,cultivo,cultivo_completo")
      .eq("empresa_id",empresaId)
      .eq("campana_id",cid)
      .eq("es_segundo_cultivo",false)
      .order("nombre");
    setLotes(ls??[]);
    await fetchItems(empresaId,cid);
    setGrupoActivo(null); setPanelSubgrupo(null);
  };

  const guardarItem = async () => {
    if (!empresaId||!form.fecha||!form.monto||lotesSelec.length===0){
      msg("❌ Completá fecha, monto y seleccioná al menos un lote"); return;
    }
    setGuardando(true);
    const tc = form.moneda==="ARS" ? await getTCFecha(form.fecha) : 1;
    const montoUsd = form.moneda==="ARS" ? Number(form.monto)/tc : Number(form.monto);
    const sb = await getSB();
    await sb.from("mb_carga_items").insert({
      empresa_id:empresaId, campana_id:campanaActiva,
      lote_ids:lotesSelec, grupo:grupoActivo,
      subgrupo:panelSubgrupo!.sub, mes:panelSubgrupo!.mes??null,
      concepto:panelSubgrupo!.sub, articulo:form.articulo||"",
      descripcion:(form.cultivo?`[${form.cultivo}] `:"")+( form.descripcion||""), fecha:form.fecha,
      moneda:form.moneda||"ARS", monto_original:Number(form.monto),
      tc_usado:tc, monto_usd:montoUsd, unidad:form.unidad||"ha", origen:"manual",
    });
    msg(`✅ U$S ${montoUsd.toFixed(2)} guardado (TC $${fmt(tc)})`);
    await fetchItems(empresaId,campanaActiva);
    setGuardando(false); setPanelSubgrupo(null); setForm({}); setLotesSelec([]);
  };

  const eliminarItem = async (id:string) => {
    if (!confirm("¿Eliminar?")||!empresaId) return;
    const sb=await getSB();
    await sb.from("mb_carga_items").delete().eq("id",id);
    await fetchItems(empresaId,campanaActiva);
  };

  const exportarExcel = async (grupoId?:string) => {
    const XLSX = await import("xlsx");
    const data = itemsFiltrados
      .filter(i=>!grupoId||i.grupo===grupoId)
      .map(i=>({
        GRUPO:i.grupo, SUBGRUPO:i.subgrupo,
        LOTES:i.lote_ids.map((lid:string)=>lotes.find(l=>l.id===lid)?.nombre||lid).join(", "),
        FECHA:i.fecha, MES:i.mes?MESES[i.mes-1]:"",
        ARTICULO:i.articulo, DESCRIPCION:i.descripcion,
        MONEDA:i.moneda, MONTO_ORIGINAL:i.monto_original,
        TC:i.tc_usado, MONTO_USD:i.monto_usd, UNIDAD:i.unidad,
      }));
    const ws=XLSX.utils.json_to_sheet(data);
    ws["!cols"]=[{wch:16},{wch:24},{wch:20},{wch:12},{wch:12},{wch:20},{wch:24},{wch:8},{wch:14},{wch:10},{wch:12},{wch:8}];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,grupoId||"CentroGestion");
    XLSX.writeFile(wb,`cg_${grupoId||"todo"}_${campanas.find(c=>c.id===campanaActiva)?.nombre||""}.xlsx`);
  };

  const importarExcel = async (file:File) => {
    if (!empresaId) return;
    msg("⏳ Importando...");
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(),{type:"array"});
    const rows:any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
    const sb = await getSB();
    let ok=0;
    for (const r of rows) {
      if (!r.FECHA||!r.MONTO_USD) continue;
      const loteIds = r.LOTES ? r.LOTES.split(",").map((n:string)=>lotes.find(l=>l.nombre.trim()===n.trim())?.id).filter(Boolean) : [];
      if (loteIds.length===0) continue;
      await sb.from("mb_carga_items").insert({
        empresa_id:empresaId, campana_id:campanaActiva,
        lote_ids:loteIds, grupo:r.GRUPO||grupoActivo,
        subgrupo:r.SUBGRUPO||"", mes:r.MES?MESES.indexOf(r.MES)+1:null,
        concepto:r.SUBGRUPO||"", articulo:r.ARTICULO||"", descripcion:r.DESCRIPCION||"",
        fecha:r.FECHA, moneda:r.MONEDA||"USD",
        monto_original:Number(r.MONTO_ORIGINAL||r.MONTO_USD),
        tc_usado:Number(r.TC||1), monto_usd:Number(r.MONTO_USD),
        unidad:r.UNIDAD||"ha", origen:"excel",
      });
      ok++;
    }
    msg(`✅ ${ok} registros importados`);
    await fetchItems(empresaId,campanaActiva);
  };

  const itemsFiltrados = items.filter(i=>loteActivo==="todos"||i.lote_ids.includes(loteActivo));
  const totalGrupo = (gid:string) => itemsFiltrados.filter(i=>i.grupo===gid).reduce((a,i)=>a+i.monto_usd,0);
  const totalSub = (gid:string,sub:string,mes?:number) =>
    itemsFiltrados.filter(i=>i.grupo===gid&&(mes?i.mes===mes:i.subgrupo===sub)).reduce((a,i)=>a+i.monto_usd,0);
  const totalCostos = itemsFiltrados.reduce((a,i)=>a+i.monto_usd,0);
  const haActivas = loteActivo==="todos" ? lotes.reduce((a,l)=>a+l.hectareas,0) : lotes.find(l=>l.id===loteActivo)?.hectareas||0;
  const grupoData = GRUPOS.find(g=>g.id===grupoActivo);
  const itemsGrupo = grupoActivo ? itemsFiltrados.filter(i=>i.grupo===grupoActivo) : [];
  const totalGrupoActivo = grupoActivo ? totalGrupo(grupoActivo) : 0;

  const iCls:any = {
    background:"rgba(255,255,255,0.06)",border:"1px solid rgba(201,162,39,0.35)",
    borderRadius:9,color:"#fff",padding:"9px 13px",fontSize:13,
    fontFamily:"'DM Sans',sans-serif",width:"100%",outline:"none",transition:"border-color 0.18s",
  };
  const lCls:any = {
    display:"block",fontSize:9,fontWeight:700,textTransform:"uppercase",
    letterSpacing:1.2,color:"rgba(201,162,39,0.65)",marginBottom:5,
  };

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#080808",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:28,height:28,border:"3px solid #c9a227",borderTopColor:"transparent",borderRadius:"50%",animation:"spin2 0.8s linear infinite"}}/>
        <span style={{color:"#c9a227",fontWeight:700,fontSize:14,letterSpacing:1}}>CENTRO DE GESTIÓN</span>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"radial-gradient(ellipse at top,#1a1200 0%,#080808 60%)",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#fff"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&display=swap');
        @keyframes spin2{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glowPulse{
          0%,100%{box-shadow:0 0 0 1.5px #7a5c00,0 0 0 2.5px #c9a227,0 0 0 3.5px #f0d060,0 0 0 4px #c9a227,0 0 0 5px #7a5c00,0 8px 24px rgba(0,0,0,0.70),0 2px 6px rgba(201,162,39,0.20),inset 0 1px 0 rgba(255,230,100,0.20)}
          50%{box-shadow:0 0 0 1.5px #7a5c00,0 0 0 2.5px #c9a227,0 0 0 3.5px #f0d060,0 0 0 4px #c9a227,0 0 0 5px #7a5c00,0 8px 24px rgba(0,0,0,0.70),0 4px 20px rgba(201,162,39,0.45),inset 0 1px 0 rgba(255,230,100,0.35)}
        }
        @keyframes slideR{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:translateX(0)}}
        *{box-sizing:border-box;}
        .lingote{
          position:relative;background:linear-gradient(160deg,#2a1e00 0%,#1a1200 40%,#0d0900 100%);
          border-radius:10px;cursor:pointer;overflow:hidden;transition:transform 0.20s,filter 0.20s;
          box-shadow:0 0 0 1.5px #7a5c00,0 0 0 2.5px #c9a227,0 0 0 3.5px #f0d060,0 0 0 4px #c9a227,0 0 0 5px #7a5c00,0 8px 24px rgba(0,0,0,0.70),inset 0 1px 0 rgba(255,230,100,0.22),inset 0 -1px 0 rgba(0,0,0,0.50);
          animation:glowPulse 3s ease-in-out infinite;
        }
        .lingote::before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,230,100,0.10) 0%,transparent 45%,rgba(255,200,50,0.05) 100%);pointer-events:none;}
        .lingote::after{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,rgba(255,230,100,0.75),rgba(255,255,180,1),rgba(255,230,100,0.75),transparent);border-radius:10px 10px 0 0;}
        .lingote:hover{transform:translateY(-5px) scale(1.025);filter:brightness(1.18);animation:none;
          box-shadow:0 0 0 1.5px #7a5c00,0 0 0 2.5px #c9a227,0 0 0 3.5px #f0d060,0 0 0 4px #c9a227,0 0 0 5px #7a5c00,0 18px 44px rgba(0,0,0,0.75),0 4px 20px rgba(201,162,39,0.50),inset 0 1px 0 rgba(255,230,100,0.40);}
        .lingote:active{transform:translateY(-1px) scale(0.99);}
        .lingote-sm{
          position:relative;background:linear-gradient(160deg,#1a1200 0%,#0d0900 100%);
          border-radius:9px;cursor:pointer;overflow:hidden;transition:all 0.18s;
          box-shadow:0 0 0 1px #7a5c00,0 0 0 2px rgba(201,162,39,0.60),0 0 0 3px #5a4400,0 4px 12px rgba(0,0,0,0.60),inset 0 1px 0 rgba(255,230,100,0.15);
        }
        .lingote-sm::after{content:"";position:absolute;top:0;left:0;right:0;height:1.5px;background:linear-gradient(90deg,transparent,rgba(255,230,100,0.60),rgba(255,255,180,0.90),rgba(255,230,100,0.60),transparent);border-radius:9px 9px 0 0;}
        .lingote-sm:hover{transform:translateX(4px);box-shadow:0 0 0 1px #7a5c00,0 0 0 2px #c9a227,0 0 0 3px #5a4400,0 6px 18px rgba(0,0,0,0.60),0 2px 12px rgba(201,162,39,0.30),inset 0 1px 0 rgba(255,230,100,0.25);}
        .lingote-sm.activo{background:linear-gradient(160deg,#3a2800 0%,#2a1e00 100%);box-shadow:0 0 0 1px #c9a227,0 0 0 2px #f0d060,0 0 0 3px #c9a227,0 4px 16px rgba(0,0,0,0.60),0 2px 12px rgba(201,162,39,0.40);}
        .text-gold{background:linear-gradient(180deg,#ffe87a 0%,#c9a227 50%,#f0d060 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
        .topbar-cg{background:linear-gradient(180deg,#1a1200 0%,#0d0900 100%);border-bottom:1px solid rgba(201,162,39,0.22);box-shadow:0 2px 20px rgba(0,0,0,0.70);}
        .inp-d{background:rgba(255,255,255,0.05);border:1px solid rgba(201,162,39,0.30);border-radius:9px;color:#fff;padding:9px 13px;font-size:13px;font-family:'DM Sans',sans-serif;width:100%;outline:none;transition:border-color 0.18s;}
        .inp-d:focus{border-color:#c9a227;background:rgba(201,162,39,0.07);}
        .inp-d::placeholder{color:rgba(255,255,255,0.20);}
        .inp-d option{background:#1a1200;color:#fff;}
        .btn-g{background:linear-gradient(135deg,#8a6500 0%,#c9a227 30%,#ffe87a 50%,#c9a227 70%,#8a6500 100%);border:none;border-radius:9px;color:#0d0900;font-weight:900;font-size:12px;cursor:pointer;padding:9px 18px;transition:all 0.18s;font-family:'DM Sans',sans-serif;letter-spacing:0.5px;box-shadow:0 2px 12px rgba(201,162,39,0.30);}
        .btn-g:hover{filter:brightness(1.12);transform:translateY(-1px);}
        .btn-g:disabled{opacity:0.6;cursor:not-allowed;transform:none;}
        .btn-ol{background:transparent;border:1px solid rgba(201,162,39,0.35);border-radius:9px;color:#c9a227;font-weight:700;font-size:11px;cursor:pointer;padding:6px 14px;transition:all 0.18s;font-family:'DM Sans',sans-serif;}
        .btn-ol:hover{background:rgba(201,162,39,0.12);border-color:#c9a227;}
        .row-g:hover{background:rgba(201,162,39,0.06)!important;}
        .fade-up{animation:fadeUp 0.25s ease both;}
        .slide-r{animation:slideR 0.22s ease both;}
        .sep{height:1px;background:linear-gradient(90deg,transparent,rgba(201,162,39,0.35),transparent);}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:rgba(201,162,39,0.22);border-radius:4px}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar-cg" style={{position:"sticky",top:0,zIndex:30}}>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 20px",flexWrap:"wrap"}}>
          <button onClick={()=>grupoActivo?setGrupoActivo(null):window.location.href="/productor/dashboard"}
            style={{background:"none",border:"none",cursor:"pointer",color:"rgba(201,162,39,0.55)",fontSize:13,fontWeight:700,fontFamily:"inherit"}}>
            ← {grupoActivo?"Volver":"Dashboard"}
          </button>
          <div style={{width:1,height:18,background:"rgba(201,162,39,0.20)"}}/>
          <div className="text-gold" style={{fontSize:15,fontWeight:900,letterSpacing:1.5,textTransform:"uppercase"}}>⚙ Centro de Gestión</div>
          <div style={{flex:1}}/>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:8,border:"1px solid rgba(201,162,39,0.22)",background:"rgba(201,162,39,0.06)"}}>
            <span style={{fontSize:9,color:"rgba(201,162,39,0.45)",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>TC</span>
            <span className="text-gold" style={{fontSize:13,fontWeight:800}}>${fmt(tcVenta)}</span>
          </div>

        </div>
      </div>

      <div style={{maxWidth:1360,margin:"0 auto",padding:"20px 20px 100px"}}>

        {/* Toast */}
        {msgExito&&(
          <div className="fade-up" style={{marginBottom:14,padding:"10px 16px",borderRadius:10,fontSize:13,fontWeight:700,
            color:msgExito.startsWith("✅")?"#86efac":"#fca5a5",
            background:msgExito.startsWith("✅")?"rgba(22,163,74,0.12)":"rgba(220,38,38,0.12)",
            border:`1px solid ${msgExito.startsWith("✅")?"rgba(22,163,74,0.30)":"rgba(220,38,38,0.30)"}`,
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            {msgExito}
            <button onClick={()=>setMsgExito("")} style={{background:"none",border:"none",cursor:"pointer",color:"inherit",fontSize:16,opacity:0.5}}>✕</button>
          </div>
        )}

        {/* ══ GRID LINGOTES ══ */}
        {!grupoActivo&&(
          <div className="fade-up">
            {/* Campaña selector en vista grid */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",borderRadius:9,border:"1px solid rgba(201,162,39,0.30)",background:"rgba(201,162,39,0.07)"}}>
                <span style={{fontSize:10,color:"rgba(201,162,39,0.55)",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>📅 Campaña</span>
                <select value={campanaActiva} onChange={e=>cambiarCampana(e.target.value)}
                  style={{background:"transparent",border:"none",color:"#c9a227",fontWeight:800,fontSize:13,cursor:"pointer",outline:"none",fontFamily:"inherit"}}>
                  {campanas.map(c=><option key={c.id} value={c.id} style={{background:"#1a1200",color:"#f0e6c8"}}>{c.nombre}{c.activa?" ★":""}</option>)}
                </select>
              </div>
            </div>
        {/* KPIs */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:24}}>
              {[
                {l:"TOTAL COSTOS",    v:`U$S ${fmt(totalCostos)}`,              c:"#fca5a5"},
                {l:"COSTO / HA",      v:`U$S ${fmt(haActivas>0?totalCostos/haActivas:0)}/ha`, c:"#fed7aa"},
                {l:"HA ACTIVAS",      v:`${haActivas} ha`,                      c:"#c9a227"},
                {l:"REGISTROS",       v:String(itemsFiltrados.length),           c:"#86efac"},
              ].map(s=>(
                <div key={s.l} style={{padding:"12px 16px",borderRadius:10,background:"rgba(201,162,39,0.06)",border:"1px solid rgba(201,162,39,0.18)",textAlign:"center"}}>
                  <div style={{fontSize:8,fontWeight:800,textTransform:"uppercase",letterSpacing:1.2,color:"rgba(201,162,39,0.45)",marginBottom:5}}>{s.l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Separador */}
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:22}}>
              <div className="sep" style={{flex:1}}/>
              <div className="text-gold" style={{fontSize:11,fontWeight:900,letterSpacing:3,textTransform:"uppercase"}}>2 — COSTOS DE PRODUCCIÓN</div>
              <div className="sep" style={{flex:1}}/>
            </div>

            {/* Lingotes 3 columnas */}
            {[0,1,2,3].map(row=>(
              <div key={row} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:18,marginBottom:18}}>
                {GRUPOS.filter(g=>g.row===row).map((grupo,idx)=>{
                  const tot = totalGrupo(grupo.id);
                  const pct = totalCostos>0?(tot/totalCostos*100):0;
                  return(
                    <div key={grupo.id} className="lingote fade-up"
                      style={{animationDelay:`${(row*3+idx)*0.07}s`,padding:"26px 20px",textAlign:"center",minHeight:150}}
                      onClick={()=>{ setGrupoActivo(grupo.id); setPanelSubgrupo(null); }}>
                      <div style={{fontSize:30,marginBottom:10,filter:"drop-shadow(0 0 8px rgba(201,162,39,0.55))"}}>{grupo.icon}</div>
                      <div className="text-gold" style={{fontSize:14,fontWeight:900,letterSpacing:0.8,textTransform:"uppercase",lineHeight:1.3,whiteSpace:"pre-line",marginBottom:12}}>
                        {grupo.label}
                      </div>
                      <div style={{height:1,background:"linear-gradient(90deg,transparent,rgba(201,162,39,0.45),transparent)",margin:"0 16px 12px"}}/>
                      {tot>0?(
                        <div>
                          <div style={{fontSize:18,fontWeight:900,color:"#fff",letterSpacing:0.3}}>U$S {fmt(tot)}</div>
                          <div style={{fontSize:12,fontWeight:700,color:"rgba(201,162,39,0.60)",marginTop:3}}>{pct.toFixed(1)}% del total</div>
                        </div>
                      ):(
                        <div style={{fontSize:12,color:"rgba(255,255,255,0.18)",fontStyle:"italic"}}>Sin datos — clic para cargar</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* ══ DETALLE GRUPO ══ */}
        {grupoActivo&&grupoData&&(
          <div className="fade-up">
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <div className="lingote" style={{padding:"10px 14px",pointerEvents:"none",display:"inline-flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:24}}>{grupoData.icon}</span>
                  <div>
                    <div className="text-gold" style={{fontSize:16,fontWeight:900,letterSpacing:0.8,textTransform:"uppercase",whiteSpace:"pre-line",lineHeight:1.2}}>{grupoData.label}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.30)",marginTop:2}}>
                      {itemsGrupo.length} reg · U$S {fmt(totalGrupoActivo)}
                      {haActivas>0&&` · U$S ${(totalGrupoActivo/haActivas).toFixed(0)}/ha`}
                      {totalCostos>0&&` · ${(totalGrupoActivo/totalCostos*100).toFixed(1)}%`}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                {/* Selector campaña aquí */}
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:8,border:"1px solid rgba(201,162,39,0.25)",background:"rgba(201,162,39,0.06)"}}>
                  <span style={{fontSize:9,color:"rgba(201,162,39,0.50)",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Campaña</span>
                  <select value={campanaActiva} onChange={e=>cambiarCampana(e.target.value)}
                    style={{background:"transparent",border:"none",color:"#c9a227",fontWeight:800,fontSize:12,cursor:"pointer",outline:"none",fontFamily:"inherit",padding:"0"}}>
                    {campanas.map(c=><option key={c.id} value={c.id} style={{background:"#1a1200",color:"#f0e6c8"}}>{c.nombre}{c.activa?" ★":""}</option>)}
                  </select>
                </div>
                <input ref={importRef} type="file" accept=".xlsx,.xls" style={{display:"none"}}
                  onChange={e=>{const f=e.target.files?.[0];if(f)importarExcel(f);}}/>
                <button onClick={()=>importRef.current?.click()} className="btn-ol">📥 Importar</button>
                <button onClick={()=>exportarExcel(grupoActivo)} className="btn-ol">📤 Exportar</button>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:16,alignItems:"start"}}>

              {/* Col izq: items del grupo como lingotes pequeños */}
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {/* PERSONAL: lista real de empleados */}
                {grupoActivo==="personal"&&(
                  <>
                    {empleados.length===0&&(
                      <div style={{padding:"12px",fontSize:11,color:"rgba(201,162,39,0.40)",textAlign:"center",fontStyle:"italic"}}>
                        Sin empleados<br/>
                        <button onClick={()=>window.location.href="/productor/documentos"}
                          style={{marginTop:6,padding:"4px 10px",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer",border:"1px solid rgba(201,162,39,0.30)",background:"transparent",color:"#c9a227",fontFamily:"inherit"}}>
                          Cargar en Documentos →
                        </button>
                      </div>
                    )}
                    {empleados.map((emp,idx)=>{
                      const tot=itemsGrupo.filter(i=>i.subgrupo===emp.id).reduce((a,i)=>a+i.monto_usd,0);
                      const pct=totalGrupoActivo>0?(tot/totalGrupoActivo*100):0;
                      const cnt=itemsGrupo.filter(i=>i.subgrupo===emp.id).length;
                      const isActivo=panelSubgrupo?.sub===emp.id;
                      return(
                        <div key={emp.id} className={`lingote-sm${isActivo?" activo":""}`} style={{padding:"11px 14px"}}
                          onClick={()=>{
                            setPanelSubgrupo({sub:emp.id});
                            setForm({fecha:new Date().toISOString().split("T")[0],moneda:"ARS",unidad:"total",articulo:emp.nombre,tipo_pago:"sueldo",monto:String(emp.sueldo_basico||"")});
                            setLotesSelec(lotes.map(l=>l.id));
                          }}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:11,fontWeight:800,color:isActivo?"#ffe87a":"#e0d0a0"}}>{emp.nombre}</div>
                              <div style={{fontSize:9,color:"rgba(201,162,39,0.45)",marginTop:1,textTransform:"uppercase"}}>{emp.categoria?.replace("_"," ")||"—"}{cnt>0?` · ${cnt} reg.`:""}</div>
                            </div>
                            <div style={{textAlign:"right",flexShrink:0}}>
                              {tot>0?<><div style={{fontSize:12,fontWeight:800,color:"#c9a227"}}>U$S {fmt(tot)}</div><div style={{fontSize:9,color:"rgba(201,162,39,0.45)"}}>{pct.toFixed(0)}%</div></>:<span style={{fontSize:18,color:"rgba(201,162,39,0.20)",fontWeight:200}}>+</span>}
                            </div>
                          </div>
                          {tot>0&&<div style={{marginTop:7,height:3,background:"rgba(201,162,39,0.10)",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",background:"linear-gradient(90deg,#8a6500,#c9a227,#f0d060)",borderRadius:3,width:`${Math.min(100,pct)}%`,transition:"width 0.6s ease"}}/></div>}
                        </div>
                      );
                    })}
                    <div className={`lingote-sm${panelSubgrupo?.sub==="otros_personal"?" activo":""}`} style={{padding:"11px 14px"}}
                      onClick={()=>{setPanelSubgrupo({sub:"otros_personal"});setForm({fecha:new Date().toISOString().split("T")[0],moneda:"ARS",unidad:"total",tipo_pago:"honorarios"});setLotesSelec(lotes.map(l=>l.id));}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <span style={{fontSize:11,fontWeight:800,color:panelSubgrupo?.sub==="otros_personal"?"#ffe87a":"#e0d0a0"}}>OTROS / HONORARIOS</span>
                        {itemsGrupo.filter(i=>i.subgrupo==="otros_personal").reduce((a,i)=>a+i.monto_usd,0)>0
                          ?<span style={{fontSize:12,fontWeight:800,color:"#c9a227"}}>U$S {fmt(itemsGrupo.filter(i=>i.subgrupo==="otros_personal").reduce((a,i)=>a+i.monto_usd,0))}</span>
                          :<span style={{fontSize:18,color:"rgba(201,162,39,0.20)",fontWeight:200}}>+</span>}
                      </div>
                    </div>
                  </>
                )}
                {grupoActivo!=="personal"&&grupoData.items.map((sub,idx)=>{
                  const mes = grupoData.esMensual&&idx<12 ? idx+1 : undefined;
                  const tot = totalSub(grupoActivo,sub,mes);
                  const pct = totalGrupoActivo>0?(tot/totalGrupoActivo*100):0;
                  const cnt = itemsGrupo.filter(i=>mes?i.mes===mes:i.subgrupo===sub).length;
                  const isActivo = panelSubgrupo?.sub===sub&&(mes?(panelSubgrupo?.mes===mes):true);
                  return(
                    <div key={sub} className={`lingote-sm${isActivo?" activo":""}`}
                      style={{padding:"11px 14px",animationDelay:`${idx*0.04}s`}}
                      onClick={()=>{
                        setPanelSubgrupo({sub,mes});
                        setForm({fecha:new Date().toISOString().split("T")[0],moneda:"ARS",unidad:"ha"});
                        // Alquiler: no preseleccionar. Grupos todos/empresa: preseleccionar todos
                        const esGrupoEmpresa = ["impuestos","seguros","personal","financieros","otros_directos"].includes(grupoActivo||"");
                        if(loteActivo!=="todos") setLotesSelec([loteActivo]);
                        else if(esGrupoEmpresa) setLotesSelec(lotes.map(l=>l.id));
                        else setLotesSelec([]);
                      }}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:11,fontWeight:800,color:isActivo?"#ffe87a":"#e0d0a0",textTransform:"uppercase",letterSpacing:0.3}}>{sub}</div>
                          {cnt>0&&<div style={{fontSize:9,color:"rgba(201,162,39,0.45)",marginTop:1}}>{cnt} reg.</div>}
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          {tot>0?(
                            <>
                              <div style={{fontSize:12,fontWeight:800,color:"#c9a227"}}>U$S {fmt(tot)}</div>
                              <div style={{fontSize:9,color:"rgba(201,162,39,0.45)"}}>{pct.toFixed(0)}%</div>
                            </>
                          ):(
                            <span style={{fontSize:18,color:"rgba(201,162,39,0.20)",fontWeight:200}}>+</span>
                          )}
                        </div>
                      </div>
                      {tot>0&&(
                        <div style={{marginTop:7,height:3,background:"rgba(201,162,39,0.10)",borderRadius:3,overflow:"hidden"}}>
                          <div style={{height:"100%",background:"linear-gradient(90deg,#8a6500,#c9a227,#f0d060)",borderRadius:3,width:`${Math.min(100,pct)}%`,transition:"width 0.6s ease"}}/>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Col der: form + historial */}
              <div>
                {panelSubgrupo?(
                  <div className="slide-r">
                    {/* Form carga */}
                    <div style={{background:"linear-gradient(160deg,#1a1200 0%,#0d0900 100%)",borderRadius:12,padding:"18px 20px",marginBottom:12,
                      boxShadow:"0 0 0 1px #7a5c00,0 0 0 2px rgba(201,162,39,0.45),0 0 0 3px #5a4400,0 8px 28px rgba(0,0,0,0.70),inset 0 1px 0 rgba(255,230,100,0.15)"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                        <div>
                          <div className="text-gold" style={{fontSize:14,fontWeight:900,textTransform:"uppercase",letterSpacing:0.8}}>
                            + {panelSubgrupo.mes?MESES[panelSubgrupo.mes-1]:panelSubgrupo.sub}
                          </div>
                          <div style={{fontSize:10,color:"rgba(255,255,255,0.25)",marginTop:1}}>{grupoData.label.replace("\n"," ")}</div>
                        </div>
                        <button onClick={()=>{setPanelSubgrupo(null);setForm({});setLotesSelec([]);}}
                          style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.25)",fontSize:20,lineHeight:1}}>✕</button>
                      </div>

                      {/* ── SELECTOR LOTES UNIVERSAL ── */}
                      <div style={{marginBottom:14}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                          <div style={lCls}>{grupoActivo==="alquiler"?"Lote *":"Lote(s) *"}</div>
                          {grupoActivo!=="alquiler"&&(
                            <div style={{display:"flex",gap:4}}>
                              <button onClick={()=>setLotesSelec(lotes.map(l=>l.id))}
                                style={{padding:"2px 8px",borderRadius:5,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                                  border:"1px solid rgba(201,162,39,0.30)",
                                  background:lotesSelec.length===lotes.length?"rgba(201,162,39,0.30)":"transparent",
                                  color:lotesSelec.length===lotes.length?"#ffe87a":"#c9a227"}}>TODOS</button>
                              <button onClick={()=>setLotesSelec([])}
                                style={{padding:"2px 8px",borderRadius:5,fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                                  border:"1px solid rgba(201,162,39,0.20)",background:"transparent",color:"rgba(201,162,39,0.45)"}}>NINGUNO</button>
                            </div>
                          )}
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                          {lotes.length===0&&(
                            <div style={{fontSize:11,color:"rgba(201,162,39,0.40)",fontStyle:"italic",padding:"4px 0"}}>
                              Sin lotes — seleccioná una campaña con lotes cargados
                            </div>
                          )}
                          {lotes.map(l=>{
                            const sel = lotesSelec.includes(l.id);
                            return(
                              <button key={l.id}
                                onClick={()=>{
                                  if(grupoActivo==="alquiler") setLotesSelec([l.id]);
                                  else setLotesSelec(p=>p.includes(l.id)?p.filter(x=>x!==l.id):[...p,l.id]);
                                }}
                                style={{padding:"5px 14px",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                                  border:`1.5px solid ${sel?"#c9a227":"rgba(201,162,39,0.25)"}`,
                                  background:sel?"rgba(201,162,39,0.18)":"rgba(255,255,255,0.03)",
                                  color:sel?"#ffe87a":"rgba(255,255,255,0.50)",
                                  transition:"all 0.15s",
                                  boxShadow:sel?"0 0 8px rgba(201,162,39,0.20)":"none"}}>
                                {l.nombre}
                                {grupoActivo==="alquiler"&&<span style={{fontSize:9,marginLeft:4,color:"rgba(201,162,39,0.50)"}}>{l.hectareas}ha</span>}
                                {sel&&grupoActivo!=="alquiler"&&<span style={{marginLeft:5,color:"#c9a227",fontSize:12}}>✓</span>}
                              </button>
                            );
                          })}
                        </div>
                        {lotesSelec.length>0&&grupoActivo!=="alquiler"&&(
                          <div style={{marginTop:5,fontSize:9,color:"rgba(201,162,39,0.40)"}}>
                            {lotesSelec.length===lotes.length?"Todos los lotes seleccionados":`${lotesSelec.length} lote${lotesSelec.length>1?"s":""} seleccionado${lotesSelec.length>1?"s":""}`}
                          </div>
                        )}
                      </div>

                      {/* ── CAMPOS SEGÚN GRUPO ── */}
                      {grupoActivo==="alquiler"&&(
                        <>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                            <div><div style={lCls}>Fecha del pago *</div><input type="date" value={form.fecha||""} onChange={e=>setForm({...form,fecha:e.target.value})} className="inp-d" style={iCls}/></div>
                            <div>
                              <div style={lCls}>Moneda</div>
                              <select value={form.moneda||"ARS"} onChange={e=>setForm({...form,moneda:e.target.value})} className="inp-d" style={iCls}>
                                <option value="ARS">$ ARS</option><option value="USD">U$S</option>
                              </select>
                            </div>
                            <div><div style={lCls}>Monto *</div><input type="number" value={form.monto||""} onChange={e=>setForm({...form,monto:e.target.value})} className="inp-d" style={iCls} placeholder="0"/></div>
                            <div><div style={lCls}>Descripción</div><input type="text" value={form.descripcion||""} onChange={e=>setForm({...form,descripcion:e.target.value})} className="inp-d" style={iCls} placeholder="Contrato, condición..."/></div>
                          </div>
                          {/* Preview + total ha si hay lote seleccionado */}
                          {form.monto&&Number(form.monto)>0&&lotesSelec.length===1&&(()=>{
                            const lote = lotes.find(l=>l.id===lotesSelec[0]);
                            const tc = form.moneda==="ARS"?tcVenta:1;
                            const usd = Number(form.monto)/tc;
                            return(
                              <div style={{marginBottom:12,padding:"10px 14px",borderRadius:8,background:"rgba(201,162,39,0.07)",border:"1px solid rgba(201,162,39,0.22)"}}>
                                {form.moneda==="ARS"&&<div style={{fontSize:11,color:"rgba(255,255,255,0.35)",marginBottom:2}}>${Number(form.monto).toLocaleString("es-AR")} ARS ÷ TC ${fmt(tcVenta)}</div>}
                                <span className="text-gold" style={{fontSize:16,fontWeight:900}}>U$S {usd.toFixed(2)}</span>
                                {lote&&<span style={{fontSize:11,color:"rgba(201,162,39,0.50)",marginLeft:10}}>· {lote.nombre}: {lote.hectareas} ha · U$S {(usd/lote.hectareas).toFixed(2)}/ha</span>}
                              </div>
                            );
                          })()}
                        </>
                      )}

                      {(grupoActivo==="impuestos"||grupoActivo==="financieros"||grupoActivo==="otros_directos")&&(
                        <>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                            <div><div style={lCls}>Fecha del pago *</div><input type="date" value={form.fecha||""} onChange={e=>setForm({...form,fecha:e.target.value})} className="inp-d" style={iCls}/></div>
                            <div>
                              <div style={lCls}>Moneda</div>
                              <select value={form.moneda||"ARS"} onChange={e=>setForm({...form,moneda:e.target.value})} className="inp-d" style={iCls}>
                                <option value="ARS">$ ARS</option><option value="USD">U$S</option>
                              </select>
                            </div>
                            <div><div style={lCls}>Monto *</div><input type="number" value={form.monto||""} onChange={e=>setForm({...form,monto:e.target.value})} className="inp-d" style={iCls} placeholder="0"/></div>
                            <div><div style={lCls}>Descripción</div><input type="text" value={form.descripcion||""} onChange={e=>setForm({...form,descripcion:e.target.value})} className="inp-d" style={iCls} placeholder="Detalle..."/></div>
                          </div>
                        </>
                      )}

                      {grupoActivo==="seguros"&&(
                        <>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                            <div><div style={lCls}>Fecha del pago *</div><input type="date" value={form.fecha||""} onChange={e=>setForm({...form,fecha:e.target.value})} className="inp-d" style={iCls}/></div>
                            <div>
                              <div style={lCls}>Cultivo</div>
                              <select value={form.cultivo||""} onChange={e=>setForm({...form,cultivo:e.target.value})} className="inp-d" style={iCls}>
                                <option value="">Todos los cultivos</option>
                                {[...new Set(lotes.map(l=>l.cultivo).filter(Boolean))].map(c=>(
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <div style={lCls}>Moneda</div>
                              <select value={form.moneda||"ARS"} onChange={e=>setForm({...form,moneda:e.target.value})} className="inp-d" style={iCls}>
                                <option value="ARS">$ ARS</option><option value="USD">U$S</option>
                              </select>
                            </div>
                            <div><div style={lCls}>Monto *</div><input type="number" value={form.monto||""} onChange={e=>setForm({...form,monto:e.target.value})} className="inp-d" style={iCls} placeholder="0"/></div>
                            <div style={{gridColumn:"span 2"}}><div style={lCls}>Descripción</div><input type="text" value={form.descripcion||""} onChange={e=>setForm({...form,descripcion:e.target.value})} className="inp-d" style={iCls} placeholder="Compañía, póliza, cobertura..."/></div>
                          </div>
                        </>
                      )}

                      {grupoActivo==="personal"&&(
                        <>
                          {/* Nombre del empleado — auto cuando viene de la lista */}
                          {form.articulo&&(
                            <div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,background:"rgba(201,162,39,0.08)",border:"1px solid rgba(201,162,39,0.20)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                              <span style={{fontSize:12,fontWeight:800,color:"#f0d060"}}>👤 {form.articulo}</span>
                              <button onClick={()=>setForm({...form,articulo:""})} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.30)",fontSize:14}}>✕</button>
                            </div>
                          )}
                          {!form.articulo&&(
                            <div style={{marginBottom:12}}>
                              <div style={lCls}>Nombre / Empresa</div>
                              <input type="text" value={form.articulo||""} onChange={e=>setForm({...form,articulo:e.target.value})} className="inp-d" style={iCls} placeholder="Nombre del empleado o profesional..."/>
                            </div>
                          )}
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                            <div><div style={lCls}>Fecha del pago *</div><input type="date" value={form.fecha||""} onChange={e=>setForm({...form,fecha:e.target.value})} className="inp-d" style={iCls}/></div>
                            <div>
                              <div style={lCls}>Tipo de pago</div>
                              <select value={form.tipo_pago||"sueldo"} onChange={e=>setForm({...form,tipo_pago:e.target.value})} className="inp-d" style={iCls}>
                                <option value="sueldo">Sueldo mensual</option>
                                <option value="aguinaldo">Aguinaldo (SAC)</option>
                                <option value="bonificacion">Bonificación</option>
                                <option value="vacaciones">Vacaciones</option>
                                <option value="liquidacion">Liquidación final</option>
                                <option value="honorarios">Honorarios</option>
                                <option value="otro">Otro</option>
                              </select>
                            </div>
                            <div>
                              <div style={lCls}>Moneda</div>
                              <select value={form.moneda||"ARS"} onChange={e=>setForm({...form,moneda:e.target.value})} className="inp-d" style={iCls}>
                                <option value="ARS">$ ARS</option><option value="USD">U$S</option>
                              </select>
                            </div>
                            <div><div style={lCls}>Monto *</div><input type="number" value={form.monto||""} onChange={e=>setForm({...form,monto:e.target.value})} className="inp-d" style={iCls} placeholder="0"/></div>
                            <div style={{gridColumn:"span 2"}}><div style={lCls}>Descripción</div><input type="text" value={form.descripcion||""} onChange={e=>setForm({...form,descripcion:e.target.value})} className="inp-d" style={iCls} placeholder={`${form.tipo_pago==="aguinaldo"?"1° cuota SAC":form.tipo_pago==="bonificacion"?"Detalle de la bonificación":"Detalle del pago"}...`}/></div>
                          </div>
                        </>
                      )}

                      {/* Grupos que aún usan form genérico (labranzas, insumos, cosecha, logística, comercialización, combustibles) */}
                      {!["alquiler","impuestos","seguros","personal","financieros","otros_directos"].includes(grupoActivo||"")&&(
                        <>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                            <div><div style={lCls}>Fecha del pago *</div><input type="date" value={form.fecha||""} onChange={e=>setForm({...form,fecha:e.target.value})} className="inp-d" style={iCls}/></div>
                            <div>
                              <div style={lCls}>Unidad</div>
                              <select value={form.unidad||"ha"} onChange={e=>setForm({...form,unidad:e.target.value})} className="inp-d" style={iCls}>
                                <option value="ha">U$S por ha</option>
                                <option value="tn">U$S por tn</option>
                                <option value="total">Total campo</option>
                                <option value="pct">% sobre ingreso</option>
                              </select>
                            </div>
                            <div>
                              <div style={lCls}>Moneda</div>
                              <select value={form.moneda||"ARS"} onChange={e=>setForm({...form,moneda:e.target.value})} className="inp-d" style={iCls}>
                                <option value="ARS">$ ARS</option><option value="USD">U$S</option>
                              </select>
                            </div>
                            <div><div style={lCls}>Monto *</div><input type="number" value={form.monto||""} onChange={e=>setForm({...form,monto:e.target.value})} className="inp-d" style={iCls} placeholder="0"/></div>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                            <div><div style={lCls}>Artículo / Producto</div><input type="text" value={form.articulo||""} onChange={e=>setForm({...form,articulo:e.target.value})} className="inp-d" style={iCls} placeholder="Ej: Glifosato 48%..."/></div>
                            <div><div style={lCls}>Descripción</div><input type="text" value={form.descripcion||""} onChange={e=>setForm({...form,descripcion:e.target.value})} className="inp-d" style={iCls} placeholder="Detalle..."/></div>
                          </div>
                        </>
                      )}

                      {/* Preview conversión — todos los grupos */}
                      {form.monto&&Number(form.monto)>0&&grupoActivo!=="alquiler"&&(
                        <div style={{marginBottom:12,padding:"10px 14px",borderRadius:8,background:"rgba(201,162,39,0.07)",border:"1px solid rgba(201,162,39,0.22)"}}>
                          {form.moneda==="ARS"?(
                            <div style={{fontSize:12}}>
                              <span style={{color:"rgba(255,255,255,0.35)"}}>${Number(form.monto).toLocaleString("es-AR")} ARS ÷ TC ${fmt(tcVenta)} = </span>
                              <span className="text-gold" style={{fontSize:16,fontWeight:900}}> U$S {(Number(form.monto)/tcVenta).toFixed(2)}</span>
                            </div>
                          ):(
                            <span className="text-gold" style={{fontSize:16,fontWeight:900}}>U$S {Number(form.monto).toFixed(2)}</span>
                          )}
                          <div style={{fontSize:9,color:"rgba(201,162,39,0.30)",marginTop:3}}>TC actual ${fmt(tcVenta)} · Se usa el TC exacto de la fecha ingresada</div>
                        </div>
                      )}

                      <button onClick={guardarItem} className="btn-g" style={{width:"100%",padding:"12px",fontSize:13,letterSpacing:0.5}} disabled={guardando}>
                        {guardando?"GUARDANDO...":"✓ GUARDAR REGISTRO"}
                      </button>
                    </div>

                    {/* Historial subgrupo */}
                    {(()=>{
                      const ex = itemsGrupo.filter(i=>panelSubgrupo.mes?i.mes===panelSubgrupo.mes:i.subgrupo===panelSubgrupo.sub);
                      if (!ex.length) return <div style={{textAlign:"center",padding:"24px",color:"rgba(255,255,255,0.18)",fontSize:12}}>Sin registros aún</div>;
                      return(
                        <div style={{background:"rgba(201,162,39,0.04)",border:"1px solid rgba(201,162,39,0.15)",borderRadius:10,overflow:"hidden"}}>
                          <div style={{padding:"9px 14px",borderBottom:"1px solid rgba(201,162,39,0.12)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontSize:9,fontWeight:800,color:"rgba(201,162,39,0.50)",textTransform:"uppercase",letterSpacing:1}}>Registros ({ex.length})</span>
                            <span className="text-gold" style={{fontSize:12,fontWeight:800}}>U$S {ex.reduce((a,i)=>a+i.monto_usd,0).toFixed(2)}</span>
                          </div>
                          <div style={{overflowX:"auto"}}>
                            <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:480}}>
                              <thead><tr style={{borderBottom:"1px solid rgba(201,162,39,0.10)"}}>
                                {["Fecha","Lotes","Artículo/Nombre","Descripción","Moneda","Monto orig.","TC","U$S",""].map(h=>(
                                  <th key={h} style={{padding:"6px 10px",textAlign:"left",fontSize:8,fontWeight:800,textTransform:"uppercase",letterSpacing:0.8,color:"rgba(201,162,39,0.35)",whiteSpace:"nowrap"}}>{h}</th>
                                ))}
                              </tr></thead>
                              <tbody>{ex.map(i=>{
                                const ln=i.lote_ids.map((lid:string)=>lotes.find(l=>l.id===lid)?.nombre||"?").join(", ");
                                return(
                                  <tr key={i.id} className="row-g" style={{borderBottom:"1px solid rgba(201,162,39,0.06)",transition:"background 0.15s"}}>
                                    <td style={{padding:"6px 10px",color:"rgba(255,255,255,0.55)",whiteSpace:"nowrap",fontWeight:600}}>{i.fecha}</td>
                                    <td style={{padding:"6px 10px",color:"rgba(201,162,39,0.60)",fontSize:10,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ln}</td>
                                    <td style={{padding:"6px 10px",color:"rgba(255,255,255,0.70)",fontWeight:600}}>{i.articulo||"—"}</td>
                                    <td style={{padding:"6px 10px",color:"rgba(255,255,255,0.45)",fontSize:10,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{i.descripcion||"—"}</td>
                                    <td style={{padding:"6px 10px",color:"rgba(201,162,39,0.50)",fontSize:10}}>{i.moneda}</td>
                                    <td style={{padding:"6px 10px",fontWeight:700,color:"#c9a227",whiteSpace:"nowrap"}}>{i.moneda==="ARS"?"$":""}{fmt(i.monto_original)}</td>
                                    <td style={{padding:"6px 10px",color:"rgba(255,255,255,0.20)",fontSize:9,whiteSpace:"nowrap"}}>${fmt(i.tc_usado)}</td>
                                    <td style={{padding:"6px 10px",fontWeight:800,color:"#f0d060",whiteSpace:"nowrap"}}>U$S {i.monto_usd.toFixed(2)}</td>
                                    <td style={{padding:"6px 10px"}}>
                                      <button onClick={()=>eliminarItem(i.id)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(220,38,38,0.40)",fontSize:13,transition:"color 0.15s"}}
                                        onMouseEnter={e=>(e.currentTarget as any).style.color="rgba(220,38,38,0.85)"}
                                        onMouseLeave={e=>(e.currentTarget as any).style.color="rgba(220,38,38,0.40)"}>✕</button>
                                    </td>
                                  </tr>
                                );
                              })}</tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ):(
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:200,color:"rgba(201,162,39,0.20)",fontSize:13,textAlign:"center"}}>
                    <div>
                      <div style={{fontSize:36,marginBottom:8,opacity:0.3}}>{grupoData.icon}</div>
                      Seleccioná un ítem de la izquierda
                    </div>
                  </div>
                )}

                {/* Historial completo si no hay panel abierto */}
                {itemsGrupo.length>0&&!panelSubgrupo&&(
                  <div style={{background:"rgba(201,162,39,0.04)",border:"1px solid rgba(201,162,39,0.15)",borderRadius:10,overflow:"hidden"}}>
                    <div style={{padding:"9px 14px",borderBottom:"1px solid rgba(201,162,39,0.12)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:9,fontWeight:800,color:"rgba(201,162,39,0.50)",textTransform:"uppercase",letterSpacing:1}}>Todos los registros ({itemsGrupo.length})</span>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <span className="text-gold" style={{fontSize:12,fontWeight:800}}>U$S {fmt(totalGrupoActivo)}</span>
                        <button onClick={()=>exportarExcel(grupoActivo)} className="btn-ol" style={{fontSize:9,padding:"3px 8px"}}>📤</button>
                      </div>
                    </div>
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:560}}>
                        <thead><tr style={{borderBottom:"1px solid rgba(201,162,39,0.10)"}}>
                          {["Fecha","Subgrupo","Lotes","Artículo/Nombre","Descripción","Moneda","Monto orig.","TC","U$S",""].map(h=>(
                            <th key={h} style={{padding:"6px 10px",textAlign:"left",fontSize:8,fontWeight:800,textTransform:"uppercase",letterSpacing:0.8,color:"rgba(201,162,39,0.35)",whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>{itemsGrupo.map(i=>{
                          const ln=i.lote_ids.map((lid:string)=>lotes.find(l=>l.id===lid)?.nombre||"?").join(", ");
                          return(
                            <tr key={i.id} className="row-g" style={{borderBottom:"1px solid rgba(201,162,39,0.06)",transition:"background 0.15s",cursor:"pointer"}}
                              onClick={()=>{
                                const mes=grupoData.esMensual?i.mes??undefined:undefined;
                                setPanelSubgrupo({sub:i.subgrupo,mes});
                                setForm({fecha:new Date().toISOString().split("T")[0],moneda:"ARS",unidad:"ha"});
                                const esEmpresa=["impuestos","seguros","personal","financieros","otros_directos"].includes(grupoActivo||"");
                                setLotesSelec(loteActivo!=="todos"?[loteActivo]:esEmpresa?lotes.map(l=>l.id):[]);
                              }}>
                              <td style={{padding:"6px 10px",color:"rgba(255,255,255,0.55)",whiteSpace:"nowrap",fontWeight:600}}>{i.fecha}</td>
                              <td style={{padding:"6px 10px",color:"#c9a227",fontWeight:700,fontSize:10,whiteSpace:"nowrap"}}>{i.subgrupo}</td>
                              <td style={{padding:"6px 10px",color:"rgba(201,162,39,0.55)",fontSize:10,maxWidth:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ln}</td>
                              <td style={{padding:"6px 10px",color:"rgba(255,255,255,0.70)",fontWeight:600}}>{i.articulo||"—"}</td>
                              <td style={{padding:"6px 10px",color:"rgba(255,255,255,0.45)",fontSize:10,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{i.descripcion||"—"}</td>
                              <td style={{padding:"6px 10px",color:"rgba(201,162,39,0.45)",fontSize:10}}>{i.moneda}</td>
                              <td style={{padding:"6px 10px",fontWeight:700,color:"#c9a227",whiteSpace:"nowrap"}}>{i.moneda==="ARS"?"$":""}{fmt(i.monto_original)}</td>
                              <td style={{padding:"6px 10px",color:"rgba(255,255,255,0.20)",fontSize:9,whiteSpace:"nowrap"}}>${fmt(i.tc_usado)}</td>
                              <td style={{padding:"6px 10px",fontWeight:800,color:"#f0d060",whiteSpace:"nowrap"}}>U$S {i.monto_usd.toFixed(2)}</td>
                              <td style={{padding:"6px 10px"}}>
                                <button onClick={e=>{e.stopPropagation();eliminarItem(i.id);}}
                                  style={{background:"none",border:"none",cursor:"pointer",color:"rgba(220,38,38,0.40)",fontSize:13,transition:"color 0.15s"}}
                                  onMouseEnter={e=>(e.currentTarget as any).style.color="rgba(220,38,38,0.85)"}
                                  onMouseLeave={e=>(e.currentTarget as any).style.color="rgba(220,38,38,0.40)"}>✕</button>
                              </td>
                            </tr>
                          );
                        })}</tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
