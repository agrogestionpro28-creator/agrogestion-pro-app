"use client";
// @ts-nocheck
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { createClient } from "@supabase/supabase-js";

// ── Cliente singleton — se crea una sola vez, no en cada llamada ──
let _sb: any = null;
const getSB = () => {
  if (!_sb) {
    _sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _sb;
};
};

type Seccion = "general"|"productores"|"cobranza"|"vehiculo"|"ia_campo";
type ProductorIng = { id:string; nombre:string; telefono:string; email:string; localidad:string; provincia:string; hectareas_total:number; observaciones:string; empresa_id:string|null; tiene_cuenta:boolean; honorario_tipo:string; honorario_monto:number; };
type Campana = { id:string; nombre:string; activa:boolean; año_inicio?:number; año_fin?:number; };
type Cobranza = { id:string; productor_id:string; concepto:string; monto:number; fecha:string; estado:string; metodo_pago:string; };
type Vehiculo = { id:string; nombre:string; marca:string; modelo:string; anio:number; patente:string; seguro_vencimiento:string; vtv_vencimiento:string; km_actuales:number; proximo_service_km:number; seguro_compania:string; };
type ServiceVeh = { id:string; tipo:string; descripcion:string; costo:number; km:number; fecha:string; taller:string; };
type MsgIA = { rol:"user"|"assistant"; texto:string };
type LoteResumen = { nombre:string; hectareas:number; cultivo:string; cultivo_completo:string; estado:string; productor_nombre:string; empresa_id?:string; };

const CULTIVOS = [
  { key:"soja_1",   label:"Soja 1º",    color:"#22c55e", grupo:"Verano" },
  { key:"soja_2",   label:"Soja 2º",    color:"#86efac", grupo:"Verano" },
  { key:"maiz_1",   label:"Maíz 1º",    color:"#eab308", grupo:"Verano" },
  { key:"maiz_2",   label:"Maíz 2º",    color:"#fde047", grupo:"Verano" },
  { key:"girasol",  label:"Girasol",    color:"#f97316", grupo:"Verano" },
  { key:"sorgo_1",  label:"Sorgo 1º",   color:"#ef4444", grupo:"Verano" },
  { key:"sorgo_2",  label:"Sorgo 2º",   color:"#fca5a5", grupo:"Verano" },
  { key:"trigo",    label:"Trigo",      color:"#f59e0b", grupo:"Invierno" },
  { key:"cebada",   label:"Cebada",     color:"#8b5cf6", grupo:"Invierno" },
  { key:"arveja",   label:"Arveja",     color:"#06b6d4", grupo:"Invierno" },
  { key:"carinata", label:"Carinata",   color:"#0ea5e9", grupo:"Invierno" },
  { key:"camelina", label:"Camelina",   color:"#38bdf8", grupo:"Invierno" },
  { key:"pastura",  label:"Pastura",    color:"#10b981", grupo:"Especial", libre:true },
  { key:"otros",    label:"Otros",      color:"#6b7280", grupo:"Especial", libre:true },
];

function getCultivoInfo(raw: string): { label:string; color:string } {
  if (!raw) return { label:"Sin cultivo", color:"#6b7280" };
  const r = raw.toLowerCase().trim();
  const c = CULTIVOS.find(x => x.key === r || x.label.toLowerCase() === r || r.includes(x.key.replace("_"," ")));
  if (c) return { label: c.label, color: c.color };
  // Intentar por nombre parcial
  if (r.includes("soja")) return { label: r.includes("2")?"Soja 2º":"Soja 1º", color: r.includes("2")?"#86efac":"#22c55e" };
  if (r.includes("maiz")||r.includes("maíz")) return { label: r.includes("2")?"Maíz 2º":"Maíz 1º", color: r.includes("2")?"#fde047":"#eab308" };
  if (r.includes("trigo")) return { label:"Trigo", color:"#f59e0b" };
  if (r.includes("girasol")) return { label:"Girasol", color:"#f97316" };
  if (r.includes("sorgo")) return { label: r.includes("2")?"Sorgo 2º":"Sorgo 1º", color: r.includes("2")?"#fca5a5":"#ef4444" };
  if (r.includes("cebada")) return { label:"Cebada", color:"#8b5cf6" };
  if (r.includes("arveja")) return { label:"Arveja", color:"#06b6d4" };
  if (r.includes("carinata")) return { label:"Carinata", color:"#0ea5e9" };
  if (r.includes("camelina")) return { label:"Camelina", color:"#38bdf8" };
  if (r.includes("pastura")||r.includes("alfalfa")||r.includes("festuca")) return { label: raw.charAt(0).toUpperCase()+raw.slice(1), color:"#10b981" };
  return { label: raw.charAt(0).toUpperCase()+raw.slice(1), color:"#6b7280" };
}

type VozEstado = "idle"|"escuchando"|"procesando"|"respondiendo"|"error";
const VOZ_COLOR: Record<VozEstado,string> = {idle:"#22c55e",escuchando:"#ef4444",procesando:"#eab308",respondiendo:"#60a5fa",error:"#ef4444"};
const VOZ_ICON: Record<VozEstado,string> = {idle:"🎤",escuchando:"🔴",procesando:"⚙️",respondiendo:"🔊",error:"❌"};

const NAV = [
  { k:"general",    icon:"📊", label:"General" },
  { k:"productores",icon:"👨‍🌾", label:"Productores" },
  { k:"cobranza",   icon:"💰", label:"Cobranza" },
  { k:"vehiculo",   icon:"🚗", label:"Vehículo" },
];

// ── Selector cultivo standalone (fuera del componente) ──
const _iClsSel = "w-full bg-white/60 border border-white/30 rounded-xl px-3 py-2.5 text-gray-800 text-sm focus:outline-none focus:border-blue-400 transition-all";
function SelectorCultivo({value, onChange}:{value:string,onChange:(v:string)=>void}) {
  const isLibre = value?.startsWith("__libre__:");
  const libreVal = isLibre ? value.replace("__libre__:","") : "";
  const [showLibre, setShowLibre] = useState(isLibre);
  const [libreTexto, setLibreTexto] = useState(libreVal);
  const grupos = ["Verano","Invierno","Especial"];
  return (
    <div className="space-y-2">
      <select value={showLibre?"__libre__":value??""} onChange={e=>{
        if(e.target.value==="__libre__"){setShowLibre(true);onChange("__libre__:");}
        else{setShowLibre(false);onChange(e.target.value);}
      }} className={_iClsSel}>
        <option value="">Sin cultivo</option>
        {grupos.map(g=>(
          <optgroup key={g} label={g}>
            {CULTIVOS.filter(c=>c.grupo===g).map(c=>(
              <option key={c.key} value={c.libre?"__libre__":c.key}>{c.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {showLibre&&<input type="text" value={libreTexto} onChange={e=>{setLibreTexto(e.target.value);onChange("__libre__:"+e.target.value);}} className={_iClsSel} placeholder="Escribí el cultivo (ej: Alfalfa, Rye grass...)"/>}
    </div>
  );
}

// ── ÍCONOS SVG MODERNOS POR CULTIVO ──
function CultivoIcon({cultivo, size=32}:{cultivo:string, size?:number}) {
  const l = cultivo.toLowerCase();
  const s = size;
  
  if(l.includes("girasol")) return (
    <svg width={s} height={s} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(24,20)">
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(0) translate(0,-13)"/>
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(45) translate(0,-13)"/>
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(90) translate(0,-13)"/>
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(135) translate(0,-13)"/>
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(180) translate(0,-13)"/>
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(225) translate(0,-13)"/>
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(270) translate(0,-13)"/>
        <ellipse rx="3.2" ry="7" fill="#FBC02D" transform="rotate(315) translate(0,-13)"/>
      </g>
      <circle cx="24" cy="20" r="7.5" fill="#4E342E"/>
      <circle cx="24" cy="20" r="5" fill="#3E2723"/>
      <circle cx="22" cy="18" r="1.1" fill="#795548"/><circle cx="25.5" cy="18" r="1.1" fill="#795548"/>
      <circle cx="22" cy="21" r="1.1" fill="#795548"/><circle cx="25.5" cy="21" r="1.1" fill="#795548"/>
      <line x1="24" y1="27" x2="24" y2="46" stroke="#388E3C" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M24 38 Q17 34 15 28" fill="none" stroke="#4CAF50" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
  
  if(l.includes("trigo")||l.includes("cebada")||l.includes("arveja")||l.includes("carin")||l.includes("camel")) {
    const col = l.includes("cebada")?"#9C27B0":l.includes("arveja")?"#00796B":l.includes("carin")||l.includes("camel")?"#37474F":"#C8860A";
    const col2 = l.includes("cebada")?"#AB47BC":l.includes("arveja")?"#4DB6AC":l.includes("carin")||l.includes("camel")?"#607D8B":"#E4A829";
    return (
      <svg width={s} height={s} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <line x1="24" y1="46" x2="24" y2="8" stroke={col} strokeWidth="2.5" strokeLinecap="round"/>
        <ellipse cx="24" cy="9" rx="3.5" ry="5.5" fill={col2}/>
        <line x1="24" y1="4" x2="24" y2="8" stroke={col2} strokeWidth="1.5" strokeLinecap="round"/>
        <ellipse cx="18" cy="14" rx="3" ry="5" fill={col2} transform="rotate(-22 18 14)"/>
        <ellipse cx="30" cy="14" rx="3" ry="5" fill={col2} transform="rotate(22 30 14)"/>
        <line x1="18" y1="10" x2="15" y2="5" stroke={col} strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="30" y1="10" x2="33" y2="5" stroke={col} strokeWidth="1.2" strokeLinecap="round"/>
        <ellipse cx="17" cy="20" rx="3" ry="5" fill={col} transform="rotate(-18 17 20)"/>
        <ellipse cx="31" cy="20" rx="3" ry="5" fill={col} transform="rotate(18 31 20)"/>
        <ellipse cx="18" cy="26" rx="2.8" ry="4.5" fill={col2} transform="rotate(-12 18 26)"/>
        <ellipse cx="30" cy="26" rx="2.8" ry="4.5" fill={col2} transform="rotate(12 30 26)"/>
      </svg>
    );
  }
  
  if(l.includes("sorgo")) {
    const col = l.includes("2")?"#A1887F":"#6D4C41";
    const col2 = l.includes("2")?"#D7CCC8":"#8D6E63";
    return (
      <svg width={s} height={s} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <line x1="24" y1="46" x2="24" y2="20" stroke={col} strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M24 36 Q15 32 13 24" fill="none" stroke="#66BB6A" strokeWidth="2.2" strokeLinecap="round"/>
        <path d="M24 36 Q33 32 35 24" fill="none" stroke="#81C784" strokeWidth="2.2" strokeLinecap="round"/>
        <ellipse cx="24" cy="13" rx="7" ry="9" fill={col2}/>
        <circle cx="20" cy="9" r="2.5" fill="#ECEFF1"/><circle cx="28" cy="9" r="2.5" fill="#ECEFF1"/>
        <circle cx="17" cy="13.5" r="2.5" fill={col2}/><circle cx="31" cy="13.5" r="2.5" fill={col2}/>
        <circle cx="20" cy="18" r="2.5" fill={col}/><circle cx="28" cy="18" r="2.5" fill={col}/>
        <circle cx="24" cy="7" r="2.8" fill="#ECEFF1"/>
      </svg>
    );
  }
  
  if(l.includes("maíz")||l.includes("maiz")) {
    const col = l.includes("2")?"#FFB300":"#FBC02D";
    const col2 = l.includes("2")?"#FF8F00":"#F57F17";
    return (
      <svg width={s} height={s} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 12 Q31 8 35 14 Q29 16 24 27" fill="#66BB6A"/>
        <path d="M24 12 Q17 7 13 13 Q19 16 24 27" fill="#81C784"/>
        <ellipse cx="24" cy="28" rx="9" ry="13" fill={col}/>
        <circle cx="21" cy="21" r="2" fill={col2}/><circle cx="27" cy="21" r="2" fill={col2}/>
        <circle cx="21" cy="26" r="2" fill={col2}/><circle cx="27" cy="26" r="2" fill={col2}/>
        <circle cx="21" cy="31" r="2" fill={col2}/><circle cx="27" cy="31" r="2" fill={col2}/>
        <circle cx="24" cy="18.5" r="2" fill={col}/><circle cx="24" cy="23.5" r="2" fill={col}/>
        <circle cx="24" cy="28.5" r="2" fill={col}/><circle cx="24" cy="33.5" r="2" fill={col}/>
        <line x1="24" y1="41" x2="24" y2="47" stroke="#E65100" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    );
  }
  
  // Soja (1ra verde, 2da celeste, default verde)
  const esSoja2 = l.includes("2");
  const colSoja = esSoja2?"#0288d1":"#4CAF50";
  const colSoja2 = esSoja2?"#29b6f6":"#66BB6A";
  const colSoja3 = esSoja2?"#0277bd":"#43A047";
  const colSojaH = esSoja2?"#01579b":"#2E7D32";
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="29" r="11" fill={colSoja} opacity="0.92"/>
      <circle cx="16" cy="21" r="9" fill={colSoja2}/>
      <circle cx="32" cy="21" r="9" fill={colSoja3}/>
      <circle cx="24" cy="17" r="6" fill={colSoja2} opacity="0.8"/>
      <line x1="24" y1="40" x2="24" y2="46" stroke={colSojaH} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="24" y1="44" x2="19" y2="47" stroke={colSojaH} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export default function IngenieroPanel() {
  const [seccion, setSeccion] = useState<Seccion>("general");
  const [ingId, setIngId] = useState("");
  const [ingNombre, setIngNombre] = useState("");
  const [ingData, setIngData] = useState<any>({});
  const [productores, setProductores] = useState<ProductorIng[]>([]);
  const [cobranzas, setCobranzas] = useState<Cobranza[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [servicios, setServicios] = useState<ServiceVeh[]>([]);
  const [vehiculoSel, setVehiculoSel] = useState<Vehiculo|null>(null);
  const [lotes, setLotes] = useState<LoteResumen[]>([]);
  const [campanasPorProd, setCampanasPorProd] = useState<Record<string,any[]>>({});
  const [campSelProd, setCampSelProd] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showVincular, setShowVincular] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editProd, setEditProd] = useState<string|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [msj, setMsj] = useState("");
  const [alertas, setAlertas] = useState<{msg:string;urgencia:string}[]>([]);
  const [importPrev, setImportPrev] = useState<any[]>([]);
  const [importMsg, setImportMsg] = useState("");
  const [fCultivo, setFCultivo] = useState("todos");
  const [fProductor, setFProductor] = useState("todos");
  const [fEstado, setFEstado] = useState("todos");
  const [aiChat, setAiChat] = useState<MsgIA[]>([]);
  const [aiPanel, setAiPanel] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiLoad, setAiLoad] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [nuevaCampProd, setNuevaCampProd] = useState<string|null>(null);
  const [nuevaCampNombre, setNuevaCampNombre] = useState("");
  const recRef = useRef<any>(null);
  const [vozEstado, setVozEstado] = useState<VozEstado>("idle");
  const [vozPanel, setVozPanel] = useState(false);
  const [vozInput, setVozInput] = useState("");

  useEffect(() => {
    init();
    // Leer sección desde URL ?s=productores
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const s = params.get("s");
      if (s) setSeccion(s as Seccion);
    }
  }, []);

  const init = async () => {
    try {
      const sb = getSB();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      const { data: u } = await sb.from("usuarios").select("*").eq("auth_id", user.id).single();
      if (!u || u.rol !== "ingeniero") { window.location.href = "/login"; return; }
      setIngId(u.id); setIngNombre(u.nombre); setIngData(u);
      await fetchProds(u.id);
      await fetchCobs(u.id);
      await fetchVehs(u.id);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchProds = async (iid: string) => {
    const sb = getSB();

    // Query 1: productores (1 query)
    const { data: prods } = await sb
      .from("ing_productores")
      .select("*")
      .eq("ingeniero_id", iid)
      .eq("activo", true)
      .order("nombre");
    if (!prods?.length) { setProductores([]); setLotes([]); return; }
    setProductores(prods);

    const eids = prods.map((p:any) => p.empresa_id).filter(Boolean);
    if (!eids.length) return;

    // Queries 2 y 3 en PARALELO — campañas y lotes al mismo tiempo
    const [{ data: todasCamps }, { data: todosLotes }] = await Promise.all([
      sb.from("campanas")
        .select("id,nombre,activa,año_inicio,año_fin,empresa_id")
        .in("empresa_id", eids)
        .order("año_inicio", { ascending: false }),
      sb.from("lotes")
        .select("id,nombre,hectareas,cultivo,cultivo_completo,estado,campana_id,empresa_id")
        .in("empresa_id", eids)
        .eq("es_segundo_cultivo", false)
    ]);

    // Procesar en memoria (sin más queries)
    const cpMap: Record<string,any[]> = {};
    const csMap: Record<string,string> = {};
    const lotesAll: LoteResumen[] = [];

    // Agrupar campañas por empresa
    for (const c of (todasCamps ?? [])) {
      if (!cpMap[c.empresa_id]) cpMap[c.empresa_id] = [];
      cpMap[c.empresa_id].push(c);
    }

    // Agrupar lotes por empresa y campana
    const lotesPorEmpresa: Record<string, any[]> = {};
    for (const l of (todosLotes ?? [])) {
      if (!lotesPorEmpresa[l.empresa_id]) lotesPorEmpresa[l.empresa_id] = [];
      lotesPorEmpresa[l.empresa_id].push(l);
    }

    for (const p of prods) {
      const eid = p.empresa_id;
      if (!eid) continue;

      const campList = cpMap[eid] ?? [];
      const campSel = campList.find((c:any) => c.activa) ?? campList[0] ?? null;
      const lotesEmpresa = lotesPorEmpresa[eid] ?? [];

      if (campSel) {
        csMap[eid] = campSel.id;
        // Filtrar lotes de la campaña activa en memoria
        lotesEmpresa
          .filter((l:any) => l.campana_id === campSel.id)
          .forEach((l:any) => lotesAll.push({...l, productor_nombre: p.nombre}));
      } else {
        // Sin campañas — tomar lotes de la campana_id más reciente
        const campIds = [...new Set(lotesEmpresa.map((l:any) => l.campana_id))];
        const campIdMasReciente = campIds[0] ?? null;
        lotesEmpresa
          .filter((l:any) => !campIdMasReciente || l.campana_id === campIdMasReciente)
          .forEach((l:any) => lotesAll.push({...l, productor_nombre: p.nombre}));
      }
    }

    setCampanasPorProd(cpMap);
    setCampSelProd(csMap);
    setLotes(lotesAll);
  };

  const cambiarCampana = async (eid: string, campana_id: string, prod_nombre: string) => {
    setCampSelProd(prev => ({...prev, [eid]: campana_id}));
    const sb = getSB();
    const { data: ls } = await sb.from("lotes")
      .select("id,nombre,hectareas,cultivo,cultivo_completo,estado")
      .eq("empresa_id", eid)
      .eq("campana_id", campana_id)
      .eq("es_segundo_cultivo", false);
    setLotes(prev => [
      // Eliminar lotes anteriores de esta empresa
      ...prev.filter(l => (l as any).empresa_id !== eid),
      // Agregar los nuevos
      ...(ls ?? []).map((l:any) => ({...l, productor_nombre: prod_nombre, empresa_id: eid}))
    ]);
  };

  const crearCampana = async (eid: string, nombre: string) => {
    const sb = getSB();
    const parts = nombre.split("/");
    const anioInicio = Number(parts[0]) || new Date().getFullYear();
    const anioFin = Number(parts[1]) || anioInicio + 1;
    await sb.from("campanas").update({ activa: false }).eq("empresa_id", eid);
    const { data: nueva } = await sb.from("campanas").insert({ empresa_id: eid, nombre, año_inicio: anioInicio, año_fin: anioFin, activa: true }).select().single();
    if (nueva) { setCampanasPorProd(prev => ({ ...prev, [eid]: [nueva, ...(prev[eid] ?? [])] })); setCampSelProd(prev => ({ ...prev, [eid]: nueva.id })); m("✅ Campaña creada"); }
  };

  const fetchCobs = async (iid: string) => { try { const sb=getSB(); const{data}=await sb.from("ing_cobranzas").select("*").eq("ingeniero_id",iid).order("fecha",{ascending:false}); setCobranzas(data??[]); } catch {} };

  const fetchVehs = async (iid: string) => {
    try {
      const sb=getSB(); const{data}=await sb.from("ing_vehiculos").select("*").eq("ingeniero_id",iid); setVehiculos(data??[]);
      const als:{msg:string;urgencia:string}[]=[]; const hoy=new Date();
      (data??[]).forEach((v:any)=>{
        if(v.seguro_vencimiento){const d=(new Date(v.seguro_vencimiento).getTime()-hoy.getTime())/86400000;if(d<0)als.push({msg:v.nombre+": Seguro VENCIDO",urgencia:"alta"});else if(d<=30)als.push({msg:v.nombre+": Seguro vence en "+Math.round(d)+" días",urgencia:d<=7?"alta":"media"});}
        if(v.vtv_vencimiento){const d=(new Date(v.vtv_vencimiento).getTime()-hoy.getTime())/86400000;if(d<0)als.push({msg:v.nombre+": VTV VENCIDA",urgencia:"alta"});else if(d<=30)als.push({msg:v.nombre+": VTV vence en "+Math.round(d)+" días",urgencia:d<=7?"alta":"media"});}
      });
      setAlertas(als);
    } catch {}
  };

  const m = (t:string) => { setMsj(t); setTimeout(()=>setMsj(""),4000); };

  // ── Crear empresa virtual garantizada para un productor ──
  const crearEmpresaVirtual = async (sb: any, nombre: string): Promise<string|null> => {
    const { data: emp } = await sb.from("empresas")
      .insert({ nombre: nombre + " (Ing)", propietario_id: ingId })
      .select("id").single();
    return emp?.id ?? null;
  };

  // ── Reparar productores sin empresa_id (se llama al cargar) ──
  const repararEmpresasSinId = async () => {
    const sb = getSB();
    const { data: sinEmpresa } = await sb.from("ing_productores")
      .select("id,nombre")
      .eq("ingeniero_id", ingId)
      .eq("activo", true)
      .is("empresa_id", null);
    if (!sinEmpresa?.length) return;
    for (const p of sinEmpresa) {
      const eid = await crearEmpresaVirtual(sb, p.nombre);
      if (eid) {
        await sb.from("ing_productores").update({ empresa_id: eid }).eq("id", p.id);
      }
    }
  };

  const guardarProductor = async () => {
    if (!ingId || !form.nombre?.trim()) { m("❌ Ingresá el nombre"); return; }
    const sb = getSB();
    let empresa_id: string|null = null;
    let tiene_cuenta = false;

    // Si tiene email, buscar si ya tiene cuenta en la app
    if (form.email?.trim()) {
      const { data: ue } = await sb.from("usuarios").select("id").eq("email", form.email.trim()).single();
      if (ue) {
        const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", ue.id).single();
        if (emp) { empresa_id = emp.id; tiene_cuenta = true; }
      }
    }

    const pay = {
      ingeniero_id: ingId, nombre: form.nombre.trim(),
      telefono: form.telefono ?? "", email: form.email ?? "",
      localidad: form.localidad ?? "", provincia: form.provincia ?? "Santa Fe",
      hectareas_total: Number(form.hectareas_total ?? 0),
      observaciones: form.obs ?? "",
      honorario_tipo: form.honorario_tipo ?? "mensual",
      honorario_monto: Number(form.honorario_monto ?? 0),
      honorario_kg_ha: form.honorario_kg_ha ? Number(form.honorario_kg_ha) : null,
      honorario_porcentaje: form.honorario_porcentaje ? Number(form.honorario_porcentaje) : null,
      honorario_notas: form.honorario_notas ?? "",
      empresa_id, tiene_cuenta, activo: true
    };

    if (editProd) {
      // Al editar: si no tiene empresa_id, crearla ahora
      if (!empresa_id) {
        const { data: prodActual } = await sb.from("ing_productores").select("empresa_id").eq("id", editProd).single();
        if (!prodActual?.empresa_id) {
          empresa_id = await crearEmpresaVirtual(sb, form.nombre.trim());
          pay.empresa_id = empresa_id;
        } else {
          pay.empresa_id = prodActual.empresa_id; // Mantener la existente
        }
      }
      await sb.from("ing_productores").update(pay).eq("id", editProd);
      setEditProd(null);
    } else {
      // Nuevo productor: siempre crear empresa virtual si no tiene cuenta
      if (!empresa_id) {
        empresa_id = await crearEmpresaVirtual(sb, form.nombre.trim());
        pay.empresa_id = empresa_id;
      }
      await sb.from("ing_productores").insert(pay);
    }

    m(tiene_cuenta ? "✅ Guardado — con cuenta APP" : "✅ Guardado");
    await fetchProds(ingId);
    setShowForm(false); setForm({});
  };

  const vincularCodigo = async () => {
    if(!ingId||!form.codigo?.trim()){m("❌ Ingresá el código");return;}
    const sb=getSB();
    const{data:u}=await sb.from("usuarios").select("id,nombre").eq("codigo",form.codigo.trim()).single();
    if(!u){m("❌ Código no encontrado");return;}
    let{data:emp}=await sb.from("empresas").select("id").eq("propietario_id",u.id).single();
    if(!emp){const{data:ne}=await sb.from("empresas").insert({nombre:"Empresa de "+u.nombre,propietario_id:u.id}).select().single();emp=ne;}
    if(!emp){m("❌ Error empresa");return;}
    const{data:ex}=await sb.from("ing_productores").select("id").eq("ingeniero_id",ingId).eq("empresa_id",emp.id).single();
    if(!ex)await sb.from("ing_productores").insert({ingeniero_id:ingId,nombre:u.nombre,empresa_id:emp.id,tiene_cuenta:true,honorario_tipo:form.honorario_tipo??"mensual",honorario_monto:Number(form.honorario_monto??0),activo:true});
    else await sb.from("ing_productores").update({empresa_id:emp.id,tiene_cuenta:true}).eq("id",ex.id);
    const{data:vex}=await sb.from("vinculaciones").select("id").eq("profesional_id",ingId).eq("empresa_id",emp.id).single();
    if(!vex)await sb.from("vinculaciones").insert({profesional_id:ingId,empresa_id:emp.id,activa:true,rol_profesional:"ingeniero"});
    m("✅ "+u.nombre+" vinculado"); await fetchProds(ingId); setShowVincular(false); setForm({});
  };

  const eliminarProd = async (id:string) => { if(!confirm("¿Eliminar?"))return; const sb=getSB(); await sb.from("ing_productores").update({activo:false}).eq("id",id); await fetchProds(ingId); };

  const entrar = (p:ProductorIng) => {
    const eid = p.empresa_id ?? p.id;
    const campId = campSelProd[eid] ?? null;
    localStorage.setItem("ing_empresa_id", eid);
    localStorage.setItem("ing_empresa_nombre", p.nombre);
    localStorage.setItem("ing_modo_compartido", p.empresa_id ? "true" : "false");
    if (campId) localStorage.setItem("ing_campana_id", campId);
    window.location.href = "/ingeniero/lotes";
  };

  const guardarCob = async () => {
    if(!ingId)return;
    const sb=getSB();
    const payload: Record<string,any> = {
      ingeniero_id: ingId,
      productor_id: form.prod_c||null,
      empresa_id: productores.find((p:any)=>p.id===form.prod_c)?.empresa_id||null,
      concepto: form.concepto??"",
      monto: Number(form.monto??0),
      monto_usd: Number(form.monto_usd||form.monto??0),
      fecha: form.fecha_c??new Date().toISOString().split("T")[0],
      estado: form.estado??"pendiente",
      metodo_pago: form.metodo??"",
      modalidad: form.modalidad??"otro",
      periodo: form.periodo??"",
      confirmado: true,
    };
    if(form.modalidad==="kg_cultivo_ha"||form.modalidad==="kg_soja_ha") {
      payload.kg_cantidad = Number(form.kg_cantidad??0);
      payload.kg_precio_usd = Number(form.kg_precio_usd??0);
      payload.hectareas = Number(form.hectareas_cob??0);
      payload.monto_usd = Number(form.kg_cantidad??0)*Number(form.kg_precio_usd??0);
      payload.monto = payload.monto_usd;
    }
    if(form.modalidad==="porcentaje_rto") {
      payload.porcentaje = Number(form.porcentaje??0);
      payload.rendimiento_tn = Number(form.rendimiento_tn??0);
      payload.hectareas = Number(form.hectareas_cob??0);
    }
    await sb.from("ing_cobranzas").insert(payload);
    await fetchCobs(ingId); setShowForm(false); setForm({}); m("✅ Cobro registrado");
  };

  // ── Calcular honorario automático por productor ──
  const calcularHonorario = async (p: any) => {
    const sb = getSB();
    const eid = p.empresa_id ?? p.id;
    const campId = campSelProd[eid];
    if(!campId) { m("❌ Sin campaña activa para "+p.nombre); return; }
    const hoy = new Date().toISOString().split("T")[0];
    const periodo = campanas.find((c:any)=>c.id===campId)?.nombre ?? new Date().getFullYear()+"/"+(new Date().getFullYear()+1);
    const { data: ls } = await sb.from("lotes")
      .select("id,nombre,hectareas,cultivo,cultivo_completo,rendimiento_real,rendimiento_esperado")
      .eq("empresa_id", eid).eq("campana_id", campId).eq("es_segundo_cultivo", false);
    const lotesP = ls ?? [];
    const totalHaP = lotesP.reduce((a:number,l:any)=>a+(l.hectareas||0),0);
    const tipo = p.honorario_tipo;
    let concepto="", monto=0, extra:Record<string,any>={};

    if(tipo==="mensual") {
      concepto=`Honorario mensual — ${p.nombre}`;
      monto=p.honorario_monto||0;
      extra={modalidad:"usd_mensual",periodo:new Date().toLocaleString("es-AR",{month:"long",year:"numeric"})};
    } else if(tipo==="anual"||tipo==="por_campana") {
      concepto=`Honorario anual campaña ${periodo} — ${p.nombre}`;
      monto=p.honorario_monto||0;
      extra={modalidad:"usd_anual",periodo};
    } else if(tipo==="kg_soja_ha"||tipo==="por_ha") {
      const kgHa=p.honorario_kg_ha||p.honorario_monto||0;
      concepto=`${kgHa} kg soja/ha × ${totalHaP} ha — ${p.nombre}`;
      extra={modalidad:"kg_soja_ha",kg_cantidad:kgHa*totalHaP,hectareas:totalHaP,periodo};
    } else if(tipo==="kg_cultivo_ha") {
      const kgHa=p.honorario_kg_ha||p.honorario_monto||0;
      concepto=`${kgHa} kg/ha cultivo × ${totalHaP} ha — ${p.nombre}`;
      extra={modalidad:"kg_cultivo_ha",kg_cantidad:kgHa*totalHaP,hectareas:totalHaP,periodo};
    } else if(tipo==="porcentaje_rto"||tipo==="por_servicio") {
      const pct=p.honorario_porcentaje||p.honorario_monto||1;
      const {data:mgs}=await sb.from("margen_bruto_detalle")
        .select("ingreso_bruto,rendimiento_real,rendimiento_esperado,hectareas")
        .eq("empresa_id",eid);
      const ingTotal=(mgs??[]).reduce((a:number,m:any)=>a+(m.ingreso_bruto||0),0);
      const rtoTotal=(mgs??[]).reduce((a:number,m:any)=>a+((m.rendimiento_real||m.rendimiento_esperado||0)*(m.hectareas||0)),0);
      monto=ingTotal*pct/100;
      concepto=`${pct}% ingreso bruto — ${p.nombre}`;
      extra={modalidad:"porcentaje_rto",porcentaje:pct,rendimiento_tn:rtoTotal,hectareas:totalHaP,periodo};
    } else {
      concepto=`Honorario — ${p.nombre}`;
      monto=p.honorario_monto||0;
      extra={modalidad:"otro",periodo};
    }
    setForm({prod_c:p.id,concepto,monto:String(Math.round(monto)),monto_usd:String(Math.round(monto)),fecha_c:hoy,estado:"pendiente",
      modalidad:extra.modalidad||"otro",periodo:extra.periodo||"",
      kg_cantidad:String(extra.kg_cantidad||""),kg_precio_usd:"",
      hectareas_cob:String(extra.hectareas||""),porcentaje:String(extra.porcentaje||""),
      rendimiento_tn:String(extra.rendimiento_tn||"")});
    setShowForm(true);
    m("✅ Calculado para "+p.nombre+" — revisá y confirmá");
  };
  const marcarCobrado = async (id:string) => { const sb=getSB(); await sb.from("ing_cobranzas").update({estado:"cobrado"}).eq("id",id); await fetchCobs(ingId); };

  const guardarVeh = async () => {
    if(!ingId||!form.nombre?.trim())return; const sb=getSB();
    await sb.from("ing_vehiculos").insert({ingeniero_id:ingId,nombre:form.nombre,marca:form.marca??"",modelo:form.modelo??"",anio:Number(form.anio??0),patente:form.patente??"",seguro_vencimiento:form.seg_venc||null,seguro_compania:form.seg_comp??"",vtv_vencimiento:form.vtv_venc||null,km_actuales:Number(form.km??0),proximo_service_km:Number(form.prox_km??0)});
    await fetchVehs(ingId); setShowForm(false); setForm({}); m("✅ Vehículo guardado");
  };

  const guardarService = async () => {
    if(!vehiculoSel||!ingId)return; const sb=getSB();
    await sb.from("ing_vehiculo_service").insert({vehiculo_id:vehiculoSel.id,ingeniero_id:ingId,tipo:form.tipo_s??"service",descripcion:form.desc_s??"",costo:Number(form.costo_s??0),km:Number(form.km_s??0),fecha:form.fecha_s??new Date().toISOString().split("T")[0],taller:form.taller??""});
    const sb2=getSB();const{data}=await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id",vehiculoSel.id).order("fecha",{ascending:false});
    setServicios(data??[]); setShowForm(false); setForm({}); m("✅ Service guardado");
  };

  const exportXLS = async (tipo:"productores"|"lotes") => {
    const XLSX=await import("xlsx"); let data:any[]=[];
    if(tipo==="productores")data=productores.map(p=>({NOMBRE:p.nombre,TEL:p.telefono,HA:lotes.filter(l=>l.productor_nombre===p.nombre).reduce((a,l)=>a+(l.hectareas||0),0),HONORARIO:p.honorario_monto,APP:p.tiene_cuenta?"SI":"NO"}));
    else{let lf=lotes;if(fCultivo!=="todos")lf=lf.filter(l=>(l.cultivo_completo||l.cultivo)===fCultivo);if(fProductor!=="todos")lf=lf.filter(l=>l.productor_nombre===fProductor);if(fEstado!=="todos")lf=lf.filter(l=>l.estado===fEstado);data=lf.map(l=>({PRODUCTOR:l.productor_nombre,LOTE:l.nombre,HA:l.hectareas,CULTIVO:l.cultivo_completo||l.cultivo,ESTADO:l.estado}));}
    const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,tipo);XLSX.writeFile(wb,tipo+"_"+new Date().toISOString().slice(0,10)+".xlsx");
  };

  // ── EXPORTAR TODOS LOS LOTES DE TODOS LOS PRODUCTORES (hoja de recorrida) ──
  const exportarRecorrida = async () => {
    const XLSX = await import("xlsx");
    // Traer todos los lotes de todos los productores con sus datos completos
    const sb = getSB();
    const todosLotes: any[] = [];
    for (const p of productores) {
      const eid = p.empresa_id ?? p.id;
      const campId = campSelProd[eid];
      if (!campId) continue;
      const { data: ls } = await sb.from("lotes")
        .select("nombre,hectareas,cultivo_completo,cultivo,variedad,hibrido,fecha_siembra,estado,observaciones,partido")
        .eq("empresa_id", eid)
        .eq("campana_id", campId)
        .eq("es_segundo_cultivo", false)
        .order("nombre");
      (ls ?? []).forEach((l: any) => {
        todosLotes.push({
          PRODUCTOR:       p.nombre,
          LOTE:            l.nombre,
          PARTIDO:         l.partido || "",
          HECTAREAS:       l.hectareas || 0,
          CULTIVO:         l.cultivo_completo || l.cultivo || "",
          HIBRIDO_VARIEDAD:l.variedad || l.hibrido || "",
          FECHA_SIEMBRA:   l.fecha_siembra || "",
          ESTADO:          l.estado || "",
          OBSERVACIONES:   l.observaciones || "",
          RECORRIDA:       "",   // columna en blanco para anotación manual
          NOVEDADES:       "",   // ídem
        });
      });
    }
    if (!todosLotes.length) { m("Sin lotes para exportar"); return; }
    // Crear hoja con formato para imprimir
    const ws = XLSX.utils.json_to_sheet(todosLotes);
    // Anchos de columna
    ws["!cols"] = [
      {wch:22},{wch:20},{wch:14},{wch:8},{wch:14},{wch:18},{wch:14},{wch:12},{wch:28},{wch:25},{wch:25}
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Recorrida");
    XLSX.writeFile(wb, "recorrida_"+ingNombre+"_"+new Date().toISOString().slice(0,10)+".xlsx");
    m("✅ Hoja de recorrida exportada — "+todosLotes.length+" lotes");
  };

  const leerExcel = async (file:File) => {
    setImportMsg("Leyendo...");
    try {
      const XLSX=await import("xlsx");const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});
      const rows:any[]=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
      if(rows.length<2){setImportMsg("Sin datos");return;}
      const h=rows[0].map((x:any)=>String(x).toLowerCase().trim());
      const cn=h.findIndex((x:string)=>x.includes("nombre")||x.includes("productor"));
      const ct=h.findIndex((x:string)=>x.includes("tel")||x.includes("cel"));
      const cl=h.findIndex((x:string)=>x.includes("local"));
      const cha=h.findIndex((x:string)=>x.includes("ha")||x.includes("hect"));
      const prev=rows.slice(1).filter((r:any)=>r[cn>=0?cn:0]).map((r:any)=>({nombre:String(r[cn>=0?cn:0]).trim(),telefono:ct>=0?String(r[ct]).trim():"",localidad:cl>=0?String(r[cl]).trim():"",hectareas_total:cha>=0?Number(r[cha])||0:0,existe:productores.some(p=>p.nombre.toLowerCase()===String(r[cn>=0?cn:0]).toLowerCase().trim())}));
      setImportPrev(prev);setImportMsg("✅ "+prev.length+" detectados");
    } catch(e:any){setImportMsg("❌ "+e.message);}
  };

  const confirmarImport = async () => {
    const sb=getSB();let c=0;
    for(const p of importPrev.filter(x=>!x.existe)){
      const{data:nuevo}=await sb.from("ing_productores").insert({ingeniero_id:ingId,nombre:p.nombre,telefono:p.telefono,localidad:p.localidad,hectareas_total:p.hectareas_total,honorario_tipo:"mensual",honorario_monto:0,activo:true}).select().single();
      if(nuevo){const{data:emp}=await sb.from("empresas").insert({nombre:p.nombre+" (Ing)",propietario_id:ingId}).select().single();if(emp)await sb.from("ing_productores").update({empresa_id:emp.id}).eq("id",nuevo.id);}
      c++;
    }
    m("✅ "+c+" importados");await fetchProds(ingId);setImportPrev([]);setImportMsg("");setShowImport(false);
  };

  const askAI = async (texto?: string) => {
    const userMsg=(texto??aiInput).trim();
    if(!userMsg)return;
    setAiInput(""); setAiLoad(true);
    setAiChat(prev=>[...prev,{rol:"user",texto:userMsg}]);
    if(texto) setSeccion("ia_campo");
    try {
      const hist=aiChat.slice(-6).map(x=>({role:x.rol==="user"?"user":"assistant",content:x.texto}));
      const res=await fetch("/api/scanner",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,system:`Asistente agronómico experto Argentina. Ingeniero: ${ingNombre}. Productores: ${productores.length}. Ha totales: ${totalHa}.`,messages:[...hist,{role:"user",content:userMsg}]})});
      const d=await res.json();setAiChat(prev=>[...prev,{rol:"assistant",texto:d.content?.[0]?.text??"Sin respuesta"}]);
    } catch{setAiChat(prev=>[...prev,{rol:"assistant",texto:"Error de conexión"}]);}
    setAiLoad(false);
  };

  const escucharVoz = () => {
    if(!("webkitSpeechRecognition" in window)&&!("SpeechRecognition" in window)){alert("Usá Chrome");return;}
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    const rec=new SR();rec.lang="es-AR";rec.continuous=false;
    recRef.current=rec;setVozEstado("escuchando");setVozPanel(true);
    rec.onresult=(e:any)=>{const t=e.results[0][0].transcript;setVozEstado("procesando");askAI(t);setVozEstado("idle");};
    rec.onerror=()=>{setVozEstado("error");setTimeout(()=>setVozEstado("idle"),2000);};
    rec.start();
  };

  // KPIs
  const totalHa = lotes.reduce((a,l)=>a+(Number(l.hectareas)||0),0);
  const totPend = cobranzas.filter(c=>c.estado==="pendiente").reduce((a,c)=>a+c.monto,0);
  const totCob = cobranzas.filter(c=>c.estado==="cobrado").reduce((a,c)=>a+c.monto,0);
  const cultivosU = [...new Set(lotes.map(l=>l.cultivo_completo||l.cultivo).filter(Boolean))];

  // Gráfico — agrupar por cultivo
  const haPorCultivo = (() => {
    const mapa: Record<string,{ha:number;color:string}> = {};
    lotes.forEach(l => {
      const raw = l.cultivo_completo || l.cultivo || "";
      const info = getCultivoInfo(raw);
      if(!mapa[info.label]) mapa[info.label]={ha:0,color:info.color};
      mapa[info.label].ha += l.hectareas||0;
    });
    return Object.entries(mapa).map(([name,v])=>({name,ha:Math.round(v.ha),color:v.color})).sort((a,b)=>b.ha-a.ha);
  })();

  // Inputs
  const iCls = "inp w-full px-3 py-2.5 text-[#1a2a4a] text-sm";
  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1.5";
  const cardCls = "card";






  const cultivoIcono = (label:string) => {
    const l = label.toLowerCase();
    if(l.includes("soja")) return "🌱";
    if(l.includes("maíz")||l.includes("maiz")) return "🌽";
    if(l.includes("trigo")) return "🌾";
    if(l.includes("girasol")) return "🌻";
    if(l.includes("sorgo")) return "🌿";
    if(l.includes("cebada")) return "🍃";
    if(l.includes("arveja")) return "🫛";
    return "🌱";
  };

  const cultivoColor = (label:string) => {
    const l = label.toLowerCase();
    // Soja 1° — verde intenso
    if((l.includes("soja")||l.includes("soja 1")||l.includes("soja1"))&&!l.includes("2"))
      return {bar:"linear-gradient(90deg,#2e7d32,#4CAF50)",chip:"rgba(46,125,50,0.14)",border:"rgba(46,125,50,0.35)",text:"#1b5e20",chipBg:"rgba(200,240,200,0.55)"};
    // Soja 2° — celeste
    if(l.includes("soja")&&l.includes("2"))
      return {bar:"linear-gradient(90deg,#0288d1,#4fc3f7)",chip:"rgba(2,136,209,0.12)",border:"rgba(2,136,209,0.32)",text:"#01579b",chipBg:"rgba(190,230,255,0.55)"};
    // Maíz 1° — amarillo maíz intenso
    if((l.includes("maíz")||l.includes("maiz"))&&!l.includes("2"))
      return {bar:"linear-gradient(90deg,#f9a825,#fdd835)",chip:"rgba(249,168,37,0.14)",border:"rgba(249,168,37,0.38)",text:"#e65100",chipBg:"rgba(255,240,180,0.60)"};
    // Maíz 2° — amarillo más suave
    if((l.includes("maíz")||l.includes("maiz"))&&l.includes("2"))
      return {bar:"linear-gradient(90deg,#ffb300,#ffe082)",chip:"rgba(255,179,0,0.12)",border:"rgba(255,179,0,0.30)",text:"#ff6f00",chipBg:"rgba(255,248,210,0.60)"};
    // Trigo — dorado trigo real
    if(l.includes("trigo"))
      return {bar:"linear-gradient(90deg,#c8860a,#e4a829)",chip:"rgba(200,134,10,0.13)",border:"rgba(200,134,10,0.35)",text:"#7d4e00",chipBg:"rgba(245,220,160,0.58)"};
    // Girasol — naranja-rojo llamativo
    if(l.includes("girasol"))
      return {bar:"linear-gradient(90deg,#e53935,#ff7043)",chip:"rgba(229,57,53,0.12)",border:"rgba(229,57,53,0.32)",text:"#b71c1c",chipBg:"rgba(255,200,190,0.58)"};
    // Sorgo 1° — marrón
    if(l.includes("sorgo")&&!l.includes("2"))
      return {bar:"linear-gradient(90deg,#6d4c41,#a1887f)",chip:"rgba(109,76,65,0.13)",border:"rgba(109,76,65,0.32)",text:"#4e342e",chipBg:"rgba(220,195,185,0.58)"};
    // Sorgo 2° — marrón más suave
    if(l.includes("sorgo")&&l.includes("2"))
      return {bar:"linear-gradient(90deg,#a1887f,#d7ccc8)",chip:"rgba(161,136,127,0.12)",border:"rgba(161,136,127,0.28)",text:"#6d4c41",chipBg:"rgba(235,220,215,0.58)"};
    // Cebada — violeta
    if(l.includes("cebada"))
      return {bar:"linear-gradient(90deg,#6a1b9a,#ab47bc)",chip:"rgba(106,27,154,0.11)",border:"rgba(106,27,154,0.28)",text:"#4a148c",chipBg:"rgba(220,190,240,0.55)"};
    // Arveja — verde agua
    if(l.includes("arveja"))
      return {bar:"linear-gradient(90deg,#00796b,#4db6ac)",chip:"rgba(0,121,107,0.11)",border:"rgba(0,121,107,0.28)",text:"#004d40",chipBg:"rgba(180,235,230,0.55)"};
    // Carinata/Camelina — azul pizarra
    if(l.includes("carin")||l.includes("camel"))
      return {bar:"linear-gradient(90deg,#37474f,#78909c)",chip:"rgba(55,71,79,0.11)",border:"rgba(55,71,79,0.25)",text:"#263238",chipBg:"rgba(200,215,220,0.55)"};
    // Pastura — verde pasto
    if(l.includes("pastura")||l.includes("alfalfa")||l.includes("festuca"))
      return {bar:"linear-gradient(90deg,#33691e,#8bc34a)",chip:"rgba(51,105,30,0.12)",border:"rgba(51,105,30,0.28)",text:"#1b5e20",chipBg:"rgba(200,235,170,0.55)"};
    // Otros — azul grisáceo
    return {bar:"linear-gradient(90deg,#455a64,#90a4ae)",chip:"rgba(69,90,100,0.10)",border:"rgba(69,90,100,0.24)",text:"#263238",chipBg:"rgba(200,215,225,0.55)"};
  };

  if(loading) return (
    <div style={{minHeight:"100vh",background:"url('/FON.png') center/cover fixed",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
        <div style={{width:36,height:36,border:"3px solid #1976d2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#1565c0",fontWeight:600,fontSize:14}}>Cargando...</span>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",position:"relative",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"scroll"}}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes shine{0%{left:-50%}100%{left:120%}}
        @keyframes twinkle{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1.1)}}

        /* ── CARD CON FON.png DE FONDO ── */
        .card{
          background-image: url('/FON.png');
          background-size: cover;
          background-position: center;
          border:1.5px solid rgba(255,255,255,0.90);
          border-top:2px solid rgba(255,255,255,1);
          border-radius:20px;
          box-shadow:
            0 8px 32px rgba(20,80,160,0.18),
            0 2px 8px rgba(0,0,0,0.07),
            inset 0 2px 0 rgba(255,255,255,0.95);
          position:relative;overflow:hidden;
        }
        /* Capa blanca encima para legibilidad */
        .card::before{
          content:"";position:absolute;inset:0;
          background:rgba(255,255,255,0.64);
          border-radius:20px;
          pointer-events:none;z-index:0;
        }
        /* Reflejo superior */
        .card::after{
          content:"";position:absolute;top:0;left:0;right:0;height:42%;
          background:linear-gradient(180deg,rgba(255,255,255,0.55) 0%,transparent 100%);
          border-radius:20px 20px 0 0;pointer-events:none;z-index:1;
        }
        .card>*{position:relative;z-index:2;}

        .card-sm{
          background-image: url('/FON.png');
          background-size: cover;
          background-position: center;
          border:1.5px solid rgba(255,255,255,0.88);
          border-top:2px solid rgba(255,255,255,1);
          border-radius:16px;
          box-shadow:0 4px 18px rgba(20,80,160,0.13),inset 0 2px 0 rgba(255,255,255,0.90);
          position:relative;overflow:hidden;
        }
        .card-sm::before{
          content:"";position:absolute;inset:0;
          background:rgba(255,255,255,0.60);
          border-radius:16px;pointer-events:none;z-index:0;
        }
        .card-sm::after{
          content:"";position:absolute;top:0;left:0;right:0;height:42%;
          background:linear-gradient(180deg,rgba(255,255,255,0.45) 0%,transparent 100%);
          border-radius:16px 16px 0 0;pointer-events:none;z-index:1;
        }
        .card-sm>*{position:relative;z-index:2;}

        /* ── TOPBAR ── */
        .topbar{
          background-image: url('/FON.png');
          background-size: cover;
          background-position: top center;
          border-bottom:1px solid rgba(255,255,255,0.40);
          box-shadow:0 2px 16px rgba(20,80,160,0.12);
          position:relative;
        }
        .topbar::before{
          content:"";position:absolute;inset:0;
          background:rgba(255,255,255,0.30);
          pointer-events:none;z-index:0;
        }
        .topbar>*{position:relative;z-index:1;}

        /* ── NAV TAB ── */
        .nav-tab{
          padding:9px 18px;border-radius:12px;font-size:13px;font-weight:700;
          cursor:pointer;transition:all 0.18s ease;white-space:nowrap;
          background-image:url('/FON.png');
          background-size:cover;background-position:center;
          border:1.5px solid rgba(255,255,255,0.92);
          color:#1e3a5f;
          box-shadow:0 3px 12px rgba(20,80,160,0.12);
        }
        .nav-tab::before{
          content:"";position:absolute;inset:0;
          background:rgba(255,255,255,0.42);
          border-radius:12px;pointer-events:none;z-index:0;
          transition:background 0.18s;
        }
        .nav-tab>*,.nav-tab span{position:relative;z-index:1;}
        .nav-tab:hover::before{background:rgba(255,255,255,0.88);}
        .nav-tab:hover{color:#0d47a1;transform:translateY(-1px);}
        .nav-tab.active{
          background-image:none;
          background:linear-gradient(145deg,#1976d2,#0d47a1);
          border:1.5px solid rgba(100,160,255,0.40);
          color:white !important;
          box-shadow:0 5px 18px rgba(13,71,161,0.45),inset 0 1px 0 rgba(255,255,255,0.25);
        }
        .nav-tab.active::before{display:none;}

        /* ── ACTION BTN ── */
        .abtn{
          background-image:url('/FON.png');
          background-size:cover;background-position:center;
          border:1.5px solid rgba(255,255,255,0.92);
          border-top:2px solid rgba(255,255,255,1);
          border-radius:16px;
          color:#1e3a5f;font-weight:700;font-size:13px;
          cursor:pointer;
          box-shadow:0 4px 16px rgba(20,80,160,0.13);
          transition:all 0.18s cubic-bezier(0.34,1.56,0.64,1);
          display:flex;align-items:center;justify-content:center;gap:7px;padding:12px 16px;
          position:relative;overflow:hidden;
        }
        .abtn::before{
          content:"";position:absolute;inset:0;
          background:rgba(255,255,255,0.62);
          border-radius:16px;pointer-events:none;z-index:0;
        }
        .abtn::after{
          content:"";position:absolute;top:0;left:0;right:0;height:42%;
          background:linear-gradient(180deg,rgba(255,255,255,0.50) 0%,transparent 100%);
          border-radius:16px 16px 0 0;pointer-events:none;z-index:1;
          transition:none;transform:none;
        }
        .abtn>*{position:relative;z-index:2;}
        .abtn:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(20,80,160,0.18);}
        .abtn:active{transform:scale(0.97);}

        /* ── BTN AZUL con AZUL.png ── */
        .bbtn{
          background-image:url('/AZUL.png');
          background-size:cover;
          background-position:center;
          border:1.5px solid rgba(100,180,255,0.50);
          border-top:2px solid rgba(180,220,255,0.70);
          border-radius:14px;color:white;
          font-weight:800;font-size:13px;cursor:pointer;
          box-shadow:0 4px 18px rgba(25,118,210,0.45),inset 0 1px 0 rgba(255,255,255,0.30);
          transition:all 0.18s ease;padding:10px 18px;
          position:relative;overflow:hidden;
          text-shadow:0 1px 3px rgba(0,40,120,0.35);
        }
        .bbtn::before{
          content:"";position:absolute;top:0;left:0;right:0;height:45%;
          background:linear-gradient(180deg,rgba(255,255,255,0.22) 0%,transparent 100%);
          border-radius:14px 14px 0 0;pointer-events:none;
        }
        .bbtn>*{position:relative;z-index:1;}
        .bbtn:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(25,118,210,0.60);filter:brightness(1.08);}
        .bbtn:active{transform:scale(0.97);}

        /* ── INPUT ── */
        .inp{
          background:rgba(255,255,255,0.75);
          border:1px solid rgba(180,210,240,0.55);
          border-radius:11px;
          box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);
          transition:all 0.18s;
          color:#1a2a4a;
        }
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .inp option{background:white;color:#1a2a4a;}

        /* ── SEL ── */
        .sel{
          background:rgba(255,255,255,0.75);
          border:1px solid rgba(180,210,240,0.55);
          border-radius:11px;color:#1a2a4a;
          padding:8px 12px;font-size:13px;font-weight:500;
          -webkit-appearance:none;cursor:pointer;
          box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);
        }
        .sel option{background:white;color:#1a2a4a;}

        /* ── KPI CARD con FON.png ── */
        .kpi{
          background-image: url('/FON.png');
          background-size: cover;
          background-position: center;
          border:1.5px solid rgba(255,255,255,0.92);
          border-top:2px solid rgba(255,255,255,1);
          border-radius:16px;
          box-shadow:0 4px 18px rgba(20,80,160,0.13);
          padding:16px;text-align:center;
          position:relative;overflow:hidden;
        }
        .kpi::before{
          content:"";position:absolute;inset:0;
          background:rgba(255,255,255,0.66);
          border-radius:16px;pointer-events:none;z-index:0;
        }
        .kpi::after{
          content:"";position:absolute;top:0;left:0;right:0;height:42%;
          background:linear-gradient(180deg,rgba(255,255,255,0.50) 0%,transparent 100%);
          border-radius:16px 16px 0 0;pointer-events:none;z-index:1;
        }
        .kpi>*{position:relative;z-index:2;}

        /* ── BARRA CULTIVO ── */
        .bar-track{
          flex:1;height:9px;border-radius:10px;
          background:rgba(0,60,140,0.07);overflow:hidden;
          box-shadow:inset 0 1px 2px rgba(0,60,140,0.08);
        }
        .bar-fill{
          height:100%;border-radius:10px;
          position:relative;overflow:hidden;transition:width 0.7s ease;
        }
        .bar-fill::after{
          content:"";position:absolute;
          width:40%;height:100%;left:-50%;top:0;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent);
          animation:shine 2.5s ease-in-out infinite;
        }

        /* ── CHIP CULTIVO (imagen grande) ── */
        .cult-chip{
          display:flex;align-items:center;gap:12px;
          border-radius:16px;padding:14px 16px;
          border:1.5px solid;cursor:default;
          position:relative;overflow:hidden;
          transition:all 0.18s ease;
          box-shadow:0 3px 12px rgba(0,0,0,0.07),inset 0 1px 0 rgba(255,255,255,0.7);
        }
        .cult-chip::before{
          content:"";position:absolute;top:0;left:0;right:0;height:50%;
          background:linear-gradient(180deg,rgba(255,255,255,0.40) 0%,transparent 100%);
          border-radius:14px 14px 0 0;pointer-events:none;
        }
        .cult-chip:hover{transform:translateY(-2px);}
        .cult-chip>*{position:relative;}

        /* ── PARTÍCULAS ── */
        .star{
          position:fixed;border-radius:50%;
          background:white;pointer-events:none;
          animation:twinkle var(--d,3s) ease-in-out infinite;
          animation-delay:var(--delay,0s);
        }

        /* ── MISC ── */
        .fade-in{animation:fadeIn 0.22s ease;}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
        input[type=date]::-webkit-calendar-picker-indicator{opacity:0.4}

        /* ── NUM PRO ── */
        .num-big{font-size:36px;font-weight:800;color:#0D47A1;line-height:1;}
        .num-med{font-size:24px;font-weight:700;color:#0D47A1;line-height:1;}
      `}</style>

      {/* ESTRELLAS/PARTÍCULAS de fondo */}
      {[[8,12,4,2.5,0],[22,45,3,3.5,0.5],[65,8,5,4,0.8],[80,30,3,2.8,1.2],
        [15,70,4,3.2,0.3],[50,55,3,4.5,1.5],[90,65,5,3,0.7],[35,85,3,2.5,2],
        [72,20,4,3.8,1],[5,40,3,4.2,0.4],[45,15,5,3.5,1.8],[88,80,3,2.8,0.6]
      ].map(([x,y,r,d,delay],i)=>(
        <div key={i} className="star" style={{
          left:x+"%",top:y+"%",width:r+"px",height:r+"px",
          opacity:0.4,["--d" as any]:d+"s",["--delay" as any]:delay+"s"
        }}/>
      ))}

      {/* ══ TOPBAR ══ */}
      <div className="topbar" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Image src="/logo.png" alt="Logo" width={34} height={34} style={{borderRadius:10,objectFit:"contain"}}/>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:18,fontWeight:800,color:"#0a1a3a"}}>AgroGestión</span>
                <span style={{fontSize:10,fontWeight:800,backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",backgroundPosition:"center",borderRadius:5,padding:"2px 8px",color:"white",letterSpacing:0.8,border:"1px solid rgba(100,180,255,0.45)",textShadow:"0 1px 2px rgba(0,40,120,0.40)"}}>PRO</span>
              </div>
              <div style={{fontSize:11,color:"#3a5a7a",marginTop:1,fontWeight:600}}>Gestión inteligente. Decisiones que rinden.</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {alertas.length>0&&(
              <div style={{width:24,height:24,borderRadius:"50%",background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#dc2626"}}>
                {alertas.length}
              </div>
            )}
            <div style={{width:36,height:36,borderRadius:"50%",backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",backgroundPosition:"center",border:"2px solid rgba(255,255,255,0.90)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"white",boxShadow:"0 3px 12px rgba(25,118,210,0.45)",textShadow:"0 1px 3px rgba(0,40,120,0.40)"}}>
              {ingNombre.charAt(0)||"M"}
            </div>
            <button onClick={async()=>{const sb=getSB();await sb.auth.signOut();window.location.href="/login";}}
              style={{display:"flex",alignItems:"center",gap:5,color:"#4a6a8a",fontSize:13,fontWeight:600,background:"none",border:"none",cursor:"pointer"}}>
              Salir <span>⎋</span>
            </button>
          </div>
        </div>
        {/* NAV */}
        <div style={{display:"flex",gap:6,padding:"0 12px 10px",overflowX:"auto",scrollbarWidth:"none",justifyContent:"center"}}>
          {NAV.map(item=>(
            <button key={item.k}
              onClick={()=>{setSeccion(item.k as Seccion);setShowForm(false);setForm({});setVehiculoSel(null);}}
              className={`nav-tab${seccion===item.k?" active":""}`}
              style={seccion===item.k?{
                backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",backgroundPosition:"center",
                border:"1.5px solid rgba(100,180,255,0.45)",borderTop:"2px solid rgba(180,220,255,0.65)",
                color:"white",fontWeight:800,
                boxShadow:"0 5px 18px rgba(25,118,210,0.45)",
                textShadow:"0 1px 3px rgba(0,40,120,0.35)"
              }:{}}>
              <span>{item.icon}</span> <span>{item.label}</span>
              {seccion===item.k&&<span style={{width:5,height:5,borderRadius:"50%",background:"rgba(255,255,255,0.8)",display:"inline-block",marginLeft:2}}/>}
            </button>
          ))}
        </div>
      </div>

      {/* ══ CONTENIDO ══ */}
      <div style={{maxWidth:540,margin:"0 auto",padding:"14px 14px 100px",position:"relative",zIndex:1}}>

        {/* Toast */}
        {msj&&<div className="fade-in card-sm" style={{marginBottom:12,padding:"10px 14px",fontSize:13,fontWeight:600,
          color:msj.startsWith("✅")?"#16a34a":"#dc2626",
          background:msj.startsWith("✅")?"rgba(220,252,231,0.90)":"rgba(254,226,226,0.90)",
          border:`1px solid ${msj.startsWith("✅")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}`,
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          {msj}<button onClick={()=>setMsj("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:0.5}}>✕</button>
        </div>}

        {/* ══ GENERAL ══ */}
        {seccion==="general"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
            {/* KPIs 2x2 */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[
                {l:"Productores",v:productores.length,icon:"👨‍🌾",color:"#1976d2"},
                {l:"Hectáreas",v:totalHa.toLocaleString("es-AR")+" ha",icon:"🌿",color:"#2e7d32"},
                {l:"Lotes",v:lotes.length,icon:"🗺️",color:"#0288d1"},
                {l:"Con App",v:productores.filter(p=>p.tiene_cuenta).length,icon:"📱",color:"#7b1fa2"},
              ].map(s=>(
                <div key={s.l} className="kpi">
                  <div style={{fontSize:22,marginBottom:4,display:"flex",justifyContent:"center"}}>{s.icon}</div>
                  <div className="num-big" style={{color:s.color,fontSize:28}}>{s.v}</div>
                  <div style={{fontSize:11,color:"#6b8aaa",marginTop:3,fontWeight:600}}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Botón Hoja de Recorrida */}
            <button onClick={exportarRecorrida}
              style={{width:"100%",padding:"13px 18px",
                backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",backgroundPosition:"center",
                border:"1.5px solid rgba(100,180,255,0.45)",borderTop:"2px solid rgba(180,220,255,0.65)",
                borderRadius:16,color:"white",fontSize:14,fontWeight:800,
                display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                cursor:"pointer",boxShadow:"0 4px 16px rgba(25,118,210,0.38)",
                textShadow:"0 1px 3px rgba(0,40,120,0.35)",transition:"all 0.2s ease",
                position:"relative",overflow:"hidden"}}>
              <span style={{fontSize:20}}>📋</span>
              <span>Exportar Hoja de Recorrida</span>
              <span style={{fontSize:12,opacity:0.75}}>· todos los lotes</span>
            </button>

            {/* Distribución cultivos */}
            {haPorCultivo.length>0&&(
              <div className="card" style={{padding:16}}>
                <div style={{fontSize:11,fontWeight:800,color:"#1e3a5f",textTransform:"uppercase",letterSpacing:1.2,marginBottom:14}}>Distribución de Cultivos</div>
                <div style={{display:"flex",flexDirection:"column",gap:11}}>
                  {haPorCultivo.map((d,i)=>{
                    const cc=cultivoColor(d.name);
                    return(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                        <CultivoIcon cultivo={d.name} size={22}/>
                        <div style={{width:82,fontSize:12,fontWeight:800,color:"#000000",textTransform:"uppercase",letterSpacing:0.2,flexShrink:0}}>{d.name}</div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{background:cc.bar,width:totalHa>0?(d.ha/totalHa*100)+"%":"0%"}}/>
                        </div>
                        <div style={{width:32,textAlign:"right",fontSize:12,fontWeight:700,color:cc.text,flexShrink:0}}>
                          {totalHa>0?Math.round(d.ha/totalHa*100):0}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Chips cultivos 2x2 */}
            {haPorCultivo.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {haPorCultivo.slice(0,4).map((d,i)=>{
                  const cc=cultivoColor(d.name);
                  return(
                    <div key={i} className="cult-chip" style={{background:cc.chip,borderColor:cc.border}}>
                      <span style={{fontSize:26}}>{cultivoIcono(d.name)}</span>
                      <div>
                        <div style={{fontSize:14,fontWeight:700,color:"#1a2a4a"}}>{d.name}</div>
                        <div style={{fontSize:11,color:"#6b8aaa",fontWeight:500,marginTop:1}}>{d.ha} ha</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Cobranza */}
            <div className="card" style={{padding:14}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:1.2,color:"#6b8aaa",textTransform:"uppercase",marginBottom:10}}>💰 Cobranza</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div className="kpi" style={{background:"rgba(254,226,226,0.60)",border:"1px solid rgba(220,38,38,0.12)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#dc2626",marginBottom:4}}>Pendiente</div>
                  <div style={{fontSize:20,fontWeight:800,color:"#dc2626"}}>${totPend.toLocaleString("es-AR")}</div>
                </div>
                <div className="kpi" style={{background:"rgba(220,252,231,0.60)",border:"1px solid rgba(22,163,74,0.12)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#16a34a",marginBottom:4}}>Cobrado</div>
                  <div style={{fontSize:20,fontWeight:800,color:"#16a34a"}}>${totCob.toLocaleString("es-AR")}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ PRODUCTORES ══ */}
        {seccion==="productores"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:10}}>

            {/* Acciones */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[
                {icon:"➕",l:"Nuevo",fn:()=>{setShowForm(!showForm);setEditProd(null);setForm({provincia:"Santa Fe",honorario_tipo:"mensual"});}},
                {icon:"📥",l:"Importar",fn:()=>setShowImport(!showImport)},
                {icon:"📤",l:"Exportar",fn:()=>exportXLS("productores")},
              ].map(b=>(
                <button key={b.l} className="abtn" onClick={b.fn}>
                  <span style={{fontSize:18}}>{b.icon}</span>
                  <span>{b.l}</span>
                </button>
              ))}
            </div>

            {/* Vincular */}
            <button onClick={()=>{setShowVincular(!showVincular);setForm({});}}
              style={{background:"none",border:"none",cursor:"pointer",color:"#1565c0",fontSize:14,fontWeight:700,textAlign:"left",display:"flex",alignItems:"center",gap:6,padding:"2px 0"}}>
              🔗 Vincular productor por código
            </button>

            {showVincular&&(
              <div className="card fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:"#0d2137"}}>🔗 Vincular por código</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Código *</label><input type="text" value={form.codigo??""} onChange={e=>setForm({...form,codigo:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="10001"/></div>
                  <div><label className={lCls}>Honorario</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className="sel" style={{width:"100%"}}><option value="mensual">💵 U$S Mensual</option><option value="anual">💵 U$S Anual</option><option value="kg_soja_ha">🫘 Kg Soja/Ha</option><option value="kg_cultivo_ha">🌾 Kg Cultivo/Ha</option><option value="porcentaje_rto">📊 % Rto</option><option value="otro">✏️ Otro</option></select></div>
                  <div><label className={lCls}>Monto $</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={vincularCodigo} className="bbtn">Vincular</button>
                  <button onClick={()=>{setShowVincular(false);setForm({});}} className="abtn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button>
                </div>
              </div>
            )}

            {showImport&&(
              <div className="card fade-in" style={{padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <span style={{fontSize:13,fontWeight:700,color:"#0d2137"}}>📥 Importar productores</span>
                  <button onClick={()=>{setShowImport(false);setImportPrev([]);setImportMsg("");}} style={{background:"none",border:"none",color:"#6b8aaa",cursor:"pointer",fontSize:18}}>✕</button>
                </div>
                <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)leerExcel(f);}}/>
                {importPrev.length===0
                  ?<button onClick={()=>importRef.current?.click()} className="abtn" style={{width:"100%",padding:"12px",justifyContent:"center",border:"2px dashed rgba(25,118,210,0.25)"}}>📁 Seleccionar archivo Excel</button>
                  :<div>
                    <div style={{maxHeight:140,overflowY:"auto",marginBottom:10,borderRadius:10,border:"1px solid rgba(0,0,0,0.06)"}}>
                      <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
                        <thead><tr style={{borderBottom:"1px solid rgba(0,0,0,0.07)",background:"rgba(240,248,255,0.80)"}}>{["Nombre","Tel","Ha",""].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",color:"#6b8aaa",fontWeight:600}}>{h}</th>)}</tr></thead>
                        <tbody>{importPrev.map((r,i)=><tr key={i} style={{borderBottom:"1px solid rgba(0,0,0,0.04)"}}><td style={{padding:"6px 10px",color:"#0d2137",fontWeight:600}}>{r.nombre}</td><td style={{padding:"6px 10px",color:"#6b8aaa"}}>{r.telefono||"—"}</td><td style={{padding:"6px 10px",color:"#4a6a8a"}}>{r.hectareas_total||"—"}</td><td style={{padding:"6px 10px"}}><span style={{fontSize:10,padding:"2px 7px",borderRadius:5,fontWeight:700,background:r.existe?"rgba(25,118,210,0.10)":"rgba(22,163,74,0.10)",color:r.existe?"#1565c0":"#16a34a"}}>{r.existe?"Existe":"Nuevo"}</span></td></tr>)}</tbody>
                      </table>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={confirmarImport} className="bbtn">Importar {importPrev.filter(p=>!p.existe).length} nuevos</button>
                      <button onClick={()=>setImportPrev([])} className="abtn" style={{padding:"9px 14px",fontSize:12}}>Cancelar</button>
                    </div>
                  </div>
                }
                {importMsg&&<p style={{marginTop:8,fontSize:12,fontWeight:600,color:importMsg.startsWith("✅")?"#16a34a":"#dc2626"}}>{importMsg}</p>}
              </div>
            )}

            {showForm&&(
              <div className="card fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:"#0d2137"}}>{editProd?"✏️ Editar":"➕"} Productor</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  {[["nombre","Nombre *","text",""],["telefono","Teléfono","text",""],["email","Email (app)","email",""],["localidad","Localidad","text",""],["honorario_monto","Honorario $","number",""],["obs","Obs.","text",""]].map(([k,l,t,ph])=>(
                    <div key={k as string} style={{gridColumn:k==="obs"?"1/-1":"auto"}}>
                      <label className={lCls}>{l as string}</label>
                      <input type={t as string} value={form[k as string]??""} onChange={e=>setForm({...form,[k as string]:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder={ph as string}/>
                    </div>
                  ))}
                  <div>
                    <label className={lCls}>Modalidad honorario</label>
                    <select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className="sel" style={{width:"100%"}}>
                      <option value="mensual">💵 U$S Mensual</option>
                      <option value="anual">💵 U$S Anual</option>
                      <option value="kg_soja_ha">🫘 Kg Soja/Ha</option>
                      <option value="kg_cultivo_ha">🌾 Kg Cultivo/Ha</option>
                      <option value="porcentaje_rto">📊 % del Rendimiento</option>
                      <option value="otro">✏️ Otro</option>
                    </select>
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarProductor} className="bbtn">Guardar</button>
                  <button onClick={()=>{setShowForm(false);setEditProd(null);setForm({});}} className="abtn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Filtros exportar */}
            {lotes.length>0&&(
              <div className="card" style={{padding:"10px 12px"}}>
                <div style={{display:"flex",flexWrap:"wrap",gap:7,alignItems:"center"}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#1e3a5f"}}>Exportar lotes:</span>
                  {[["Cultivo",fCultivo,setFCultivo,["todos",...cultivosU]],["Productor",fProductor,setFProductor,["todos",...productores.map(p=>p.nombre)]],["Estado",fEstado,setFEstado,["todos","planificado","sembrado","en_desarrollo","cosechado"]]].map(([l,v,fn,opts])=>(
                    <select key={l as string} value={v as string} onChange={e=>(fn as any)(e.target.value)} className="sel" style={{fontSize:12,padding:"6px 10px"}}>
                      {(opts as string[]).map(o=><option key={o} value={o}>{o==="todos"?"Todos":o}</option>)}
                    </select>
                  ))}
                  <button onClick={()=>exportXLS("lotes")} className="bbtn" style={{padding:"7px 12px",fontSize:12}}>📤 Exportar</button>
                </div>
              </div>
            )}

            {/* Lista productores */}
            {productores.length===0
              ?<div className="card" style={{padding:"48px 20px",textAlign:"center"}}><div style={{fontSize:48,opacity:0.15,marginBottom:12}}>👨‍🌾</div><p style={{color:"#6b8aaa",fontSize:14}}>Sin productores — agregá el primero</p></div>
              :<div style={{display:"flex",flexDirection:"column",gap:10}}>
                {productores.map(p=>{
                  const eid=p.empresa_id??p.id;
                  const camps=campanasPorProd[eid]??[];
                  const campActiva=campSelProd[eid]??null;
                  const lotesP=lotes.filter(l=>(l as any).empresa_id===eid);
                  const haReales=lotesP.reduce((a,l)=>a+(Number(l.hectareas)||0),0);
                  const cultivosProd=[...new Set(lotesP.map(l=>l.cultivo_completo||l.cultivo).filter(Boolean))];
                  return(
                    <div key={p.id} className="card" style={{padding:0}}>
                      {/* Header */}
                      <div style={{padding:"14px 14px 12px",borderBottom:"1px solid rgba(0,60,140,0.07)",display:"flex",alignItems:"flex-start",gap:12}}>
                        <div style={{width:44,height:44,borderRadius:"50%",backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",backgroundPosition:"center",border:"2px solid rgba(180,220,255,0.80)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:"white",flexShrink:0,boxShadow:"0 3px 12px rgba(25,118,210,0.40)",textShadow:"0 1px 3px rgba(0,40,120,0.40)"}}>
                          {p.nombre.charAt(0)}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:16,fontWeight:800,color:"#0d2137",letterSpacing:-0.3,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            {p.nombre}
                            <span style={{fontSize:14,opacity:0.4,cursor:"pointer"}} onClick={()=>{setEditProd(p.id);setForm({nombre:p.nombre,telefono:p.telefono||"",email:p.email||"",localidad:p.localidad||"",provincia:p.provincia||"",honorario_tipo:p.honorario_tipo||"mensual",honorario_monto:String(p.honorario_monto||0),obs:p.observaciones||""});setShowForm(true);}}>✏️</span>
                          </div>
                          <div style={{fontSize:12,color:"#4a6a8a",marginTop:2,fontWeight:600,display:"flex",alignItems:"center",gap:3}}>
                            <span>📍</span>{p.localidad}{p.provincia&&p.provincia!==p.localidad?", "+p.provincia:""}
                          </div>
                          {p.tiene_cuenta&&<span style={{fontSize:11,color:"#16a34a",fontWeight:700,marginTop:4,background:"rgba(22,163,74,0.10)",padding:"2px 8px",borderRadius:6,display:"inline-block"}}>✓ Usa la app</span>}
                        </div>
                        <div style={{display:"flex",gap:4,flexShrink:0}}>
                          <button onClick={()=>{setEditProd(p.id);setForm({nombre:p.nombre,telefono:p.telefono||"",email:p.email||"",localidad:p.localidad||"",provincia:p.provincia||"",honorario_tipo:p.honorario_tipo||"mensual",honorario_monto:String(p.honorario_monto||0),obs:p.observaciones||""});setShowForm(true);}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:12,fontWeight:600,padding:"4px 8px",borderRadius:8}}>✏️ Editar</button>
                          <button onClick={()=>eliminarProd(p.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:18,padding:"0 4px"}}>✕</button>
                        </div>
                      </div>

                      <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:12}}>
                        {/* Campaña */}
                        <div>
                          <div style={{fontSize:10,fontWeight:800,color:"#4a6a8a",textTransform:"uppercase",letterSpacing:1.2,marginBottom:6}}>Campaña</div>
                          <div style={{display:"flex",gap:8}}>
                            {camps.length>0
                              ?<select value={campActiva??""} onChange={e=>cambiarCampana(eid,e.target.value,p.nombre)} className="sel" style={{flex:1,fontSize:13,fontWeight:600}}>
                                {camps.map((c:any)=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
                              </select>
                              :<div style={{flex:1,background:"rgba(0,60,140,0.04)",border:"1px solid rgba(0,60,140,0.08)",borderRadius:11,padding:"8px 12px",fontSize:12,color:"#6b8aaa"}}>Sin campañas</div>
                            }
                            <button onClick={()=>{setNuevaCampProd(p.id);setNuevaCampNombre(new Date().getFullYear()+"/"+(new Date().getFullYear()+1));}} className="abtn" style={{padding:"8px 12px",fontSize:12,flexShrink:0}}>+ Nueva</button>
                          </div>
                          {nuevaCampProd===p.id&&(
                            <div style={{display:"flex",gap:8,marginTop:8}}>
                              <input value={nuevaCampNombre} onChange={e=>setNuevaCampNombre(e.target.value)} className={iCls} style={{flex:1,padding:"7px 12px",fontSize:12}} placeholder="2025/2026"/>
                              <button onClick={async()=>{if(nuevaCampNombre.trim()){await crearCampana(eid,nuevaCampNombre.trim());setNuevaCampProd(null);setNuevaCampNombre("");}}} className="bbtn" style={{padding:"7px 12px",fontSize:12}}>✓</button>
                              <button onClick={()=>{setNuevaCampProd(null);setNuevaCampNombre("");}} className="abtn" style={{padding:"7px 10px",fontSize:12}}>✕</button>
                            </div>
                          )}
                          <div style={{fontSize:12,color:"#4a6a8a",marginTop:5,fontWeight:700}}>{lotesP.length} lotes · {haReales.toLocaleString("es-AR")} ha</div>
                        </div>

                        {/* KPIs */}
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          <div className="kpi">
                            <div style={{fontSize:12,fontWeight:700,color:"#4a6a8a",marginBottom:4,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>🌿 Hectáreas</div>
                            <div className="num-big">{haReales.toLocaleString("es-AR")}</div>
                            <div style={{fontSize:11,color:"#6b8aaa",marginTop:2,fontWeight:600}}>ha</div>
                          </div>
                          <div className="kpi">
                            <div style={{fontSize:12,fontWeight:700,color:"#4a6a8a",marginBottom:4,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>$ Honorario</div>
                            <div className="num-med">${Number(p.honorario_monto||0).toLocaleString("es-AR")}</div>
                            <div style={{fontSize:11,color:"#6b8aaa",marginTop:2,fontWeight:500}}>{{mensual:"U$S/mes",anual:"U$S/año",kg_soja_ha:"Kg soja/ha",kg_cultivo_ha:"Kg cultivo/ha",porcentaje_rto:"% rto",otro:"Otro"}[p.honorario_tipo]||p.honorario_tipo||"mensual"}</div>
                          </div>
                        </div>

                        {/* Distribución cultivos */}
                        {cultivosProd.length>0&&(
                          <div className="card-sm" style={{padding:"12px 12px"}}>
                            <div style={{fontSize:10,fontWeight:800,color:"#4a6a8a",textTransform:"uppercase",letterSpacing:1.2,marginBottom:10}}>Distribución de Cultivos</div>
                            <div style={{display:"flex",flexDirection:"column",gap:9}}>
                              {cultivosProd.slice(0,4).map(c=>{
                                const info=getCultivoInfo(c);
                                const cc=cultivoColor(c);
                                const haC=lotesP.filter(l=>(l.cultivo_completo||l.cultivo)===c).reduce((a,l)=>a+(l.hectareas||0),0);
                                const pct=haReales>0?Math.round(haC/haReales*100):0;
                                return(
                                  <div key={c} style={{display:"flex",alignItems:"center",gap:8}}>
                                    <CultivoIcon cultivo={c} size={18}/>
                                    <div style={{width:72,fontSize:11,fontWeight:800,color:"#000000",textTransform:"uppercase",letterSpacing:0.2,flexShrink:0}}>{info.label}</div>
                                    <div className="bar-track">
                                      <div className="bar-fill" style={{background:cc.bar,width:pct+"%"}}/>
                                    </div>
                                    <div style={{width:28,textAlign:"right",fontSize:11,fontWeight:700,color:cc.text,flexShrink:0}}>{pct}%</div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Chips cultivo */}
                            {cultivosProd.length>0&&(
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:12}}>
                                {cultivosProd.slice(0,4).map(c=>{
                                  const cc=cultivoColor(c);
                                  return(
                                    <div key={c} className="cult-chip" style={{background:cc.chipBg||cc.chip,borderColor:cc.border}}>
                                      <CultivoIcon cultivo={c} size={26}/>
                                      <span style={{fontSize:12,fontWeight:800,color:"#000000",textTransform:"uppercase",letterSpacing:0.3}}>{getCultivoInfo(c).label}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* CTA Mis Lotes */}
                        <button onClick={()=>entrar(p)}
                          style={{width:"100%",padding:"14px 20px",borderRadius:16,
                            backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",backgroundPosition:"center",
                            border:"1.5px solid rgba(100,180,255,0.45)",
                            borderTop:"2px solid rgba(180,220,255,0.65)",
                            color:"white",fontSize:15,fontWeight:800,
                            display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                            cursor:"pointer",position:"relative",overflow:"hidden",
                            boxShadow:"0 5px 20px rgba(25,118,210,0.45)",
                            textShadow:"0 1px 3px rgba(0,40,120,0.35)",
                            transition:"all 0.2s ease"}}>
                          <span style={{fontSize:18}}>🏛</span>
                          {p.tiene_cuenta?"Ver Lotes":"Mis Lotes"}
                          <span style={{fontSize:18,opacity:0.7}}>›</span>
                        </button>
                      </div>

                      {p.observaciones&&<div style={{padding:"8px 14px",borderTop:"1px solid rgba(0,60,140,0.06)",fontSize:11,color:"#6b8aaa"}}>{p.observaciones}</div>}
                    </div>
                  );
                })}
              </div>
            }
          </div>
        )}

        {/* ══ COBRANZA ══ */}
        {seccion==="cobranza"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>

            {/* Resumen totales */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[
                {l:"Pendiente",v:"U$S "+totPend.toLocaleString("es-AR"),c:"#dc2626",bg:"rgba(220,38,38,0.08)"},
                {l:"Cobrado",v:"U$S "+totCob.toLocaleString("es-AR"),c:"#166534",bg:"rgba(22,163,74,0.08)"},
                {l:"Total campaña",v:"U$S "+(totPend+totCob).toLocaleString("es-AR"),c:"#0D47A1",bg:"rgba(25,118,210,0.08)"},
              ].map(s=>(
                <div key={s.l} className="card" style={{padding:"12px 14px",textAlign:"center",background:s.bg}}>
                  <div style={{fontSize:10,fontWeight:700,color:s.c,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>{s.l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Calcular honorarios por productor */}
            <div className="card" style={{padding:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>⚡ Calcular Honorarios Automático</div>
                  <div style={{fontSize:11,color:"#6b8aaa",marginTop:2}}>Calcula según el acuerdo configurado por productor</div>
                </div>
                <button onClick={()=>{setShowForm(!showForm);setForm({estado:"pendiente",fecha_c:new Date().toISOString().split("T")[0],modalidad:"usd_mensual"});}}
                  className="bbtn" style={{padding:"8px 14px",fontSize:12}}>+ Cobro manual</button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {productores.map(p=>{
                  const eid=p.empresa_id??p.id;
                  const lotesP=lotes.filter((l:any)=>l.empresa_id===eid);
                  const haP=lotesP.reduce((a:number,l:any)=>a+(l.hectareas||0),0);
                  const cobsProd=cobranzas.filter((c:any)=>c.productor_id===p.id);
                  const pendProd=cobsProd.filter((c:any)=>c.estado==="pendiente").reduce((a:number,c:any)=>a+(c.monto||0),0);
                  const MODAL_LABEL:Record<string,string>={
                    mensual:"U$S/mes",anual:"U$S/año",por_campana:"U$S/campaña",
                    kg_soja_ha:"kg soja/ha",kg_cultivo_ha:"kg cultivo/ha",
                    porcentaje_rto:"% del rto",por_ha:"kg/ha",por_servicio:"% rto",otro:"Otro"
                  };
                  return(
                    <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
                      borderRadius:12,background:"rgba(255,255,255,0.60)",border:"1px solid rgba(255,255,255,0.85)",
                      boxShadow:"0 2px 8px rgba(20,80,160,0.07)"}}>
                      <div style={{width:36,height:36,borderRadius:"50%",backgroundImage:"url('/AZUL.png')",
                        backgroundSize:"cover",border:"2px solid rgba(180,220,255,0.80)",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:14,fontWeight:800,color:"white",flexShrink:0,
                        textShadow:"0 1px 3px rgba(0,40,120,0.40)"}}>
                        {p.nombre.charAt(0)}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:800,color:"#0d2137",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.nombre}</div>
                        <div style={{fontSize:11,color:"#6b8aaa",marginTop:1,display:"flex",gap:8}}>
                          <span>{haP} ha</span>
                          <span style={{color:"#1565c0",fontWeight:700}}>{MODAL_LABEL[p.honorario_tipo]||"Sin configurar"}</span>
                          {p.honorario_monto>0&&<span style={{color:"#b45309",fontWeight:600}}>{p.honorario_monto} {p.honorario_tipo?.includes("kg")?"kg":p.honorario_tipo?.includes("porc")||p.honorario_tipo==="por_servicio"?"%":"U$S"}</span>}
                        </div>
                      </div>
                      {pendProd>0&&(
                        <div style={{fontSize:12,fontWeight:700,color:"#dc2626",flexShrink:0}}>
                          U$S {Math.round(pendProd).toLocaleString("es-AR")} pend.
                        </div>
                      )}
                      <button onClick={()=>calcularHonorario(p)}
                        className="bbtn" style={{padding:"7px 12px",fontSize:11,flexShrink:0}}>
                        ⚡ Calcular
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Form nuevo cobro */}
            {showForm&&(
              <div className="card fade-in" style={{padding:16}}>
                <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:14}}>
                  {form.prod_c?`💰 Honorario — ${productores.find((p:any)=>p.id===form.prod_c)?.nombre||""}`:"+  Nuevo cobro"}
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div>
                    <label className={lCls}>Productor</label>
                    <select value={form.prod_c??""} onChange={e=>setForm({...form,prod_c:e.target.value})} className="inp" style={{padding:"8px 12px"}}>
                      <option value="">Sin productor</option>
                      {productores.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lCls}>Modalidad</label>
                    <select value={form.modalidad??"usd_mensual"} onChange={e=>setForm({...form,modalidad:e.target.value})} className="inp" style={{padding:"8px 12px"}}>
                      <option value="usd_mensual">💵 U$S Mensual</option>
                      <option value="usd_anual">💵 U$S Anual</option>
                      <option value="kg_soja_ha">🫘 Kg Soja / Ha</option>
                      <option value="kg_cultivo_ha">🌾 Kg Cultivo / Ha</option>
                      <option value="porcentaje_rto">📊 % del Rendimiento</option>
                      <option value="otro">✏️ Otro (manual)</option>
                    </select>
                  </div>

                  {/* Campos según modalidad */}
                  {(form.modalidad==="usd_mensual"||form.modalidad==="usd_anual"||form.modalidad==="otro")&&(
                    <>
                      <div>
                        <label className={lCls}>Monto U$S</label>
                        <input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value,monto_usd:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="0"/>
                      </div>
                      <div>
                        <label className={lCls}>Período</label>
                        <input type="text" value={form.periodo??""} onChange={e=>setForm({...form,periodo:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="Ej: Enero 2026 / 2025-2026"/>
                      </div>
                    </>
                  )}

                  {(form.modalidad==="kg_soja_ha"||form.modalidad==="kg_cultivo_ha")&&(
                    <>
                      <div>
                        <label className={lCls}>Kg totales</label>
                        <input type="number" value={form.kg_cantidad??""} onChange={e=>{
                          const kg=Number(e.target.value);
                          const precio=Number(form.kg_precio_usd||0);
                          setForm({...form,kg_cantidad:e.target.value,monto:String(Math.round(kg*precio)),monto_usd:String(Math.round(kg*precio))});
                        }} className="inp" style={{padding:"8px 12px"}} placeholder="0"/>
                      </div>
                      <div>
                        <label className={lCls}>Precio U$S / kg</label>
                        <input type="number" step="0.01" value={form.kg_precio_usd??""} onChange={e=>{
                          const precio=Number(e.target.value);
                          const kg=Number(form.kg_cantidad||0);
                          setForm({...form,kg_precio_usd:e.target.value,monto:String(Math.round(kg*precio)),monto_usd:String(Math.round(kg*precio))});
                        }} className="inp" style={{padding:"8px 12px"}} placeholder="0.00"/>
                      </div>
                      <div>
                        <label className={lCls}>Hectáreas base</label>
                        <input type="number" value={form.hectareas_cob??""} onChange={e=>setForm({...form,hectareas_cob:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="0"/>
                      </div>
                      <div>
                        <label className={lCls}>Período</label>
                        <input type="text" value={form.periodo??""} onChange={e=>setForm({...form,periodo:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="2025/2026"/>
                      </div>
                      {/* Preview cálculo */}
                      {form.kg_cantidad&&form.kg_precio_usd&&(
                        <div style={{gridColumn:"1/-1",padding:"10px 14px",borderRadius:12,
                          background:"rgba(25,118,210,0.08)",border:"1px solid rgba(25,118,210,0.18)"}}>
                          <span style={{fontSize:13,color:"#1565c0",fontWeight:700}}>
                            {Number(form.kg_cantidad).toLocaleString("es-AR")} kg × U$S {form.kg_precio_usd}/kg = <strong>U$S {Math.round(Number(form.kg_cantidad)*Number(form.kg_precio_usd)).toLocaleString("es-AR")}</strong>
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {form.modalidad==="porcentaje_rto"&&(
                    <>
                      <div>
                        <label className={lCls}>% del rendimiento</label>
                        <input type="number" step="0.1" value={form.porcentaje??""} onChange={e=>setForm({...form,porcentaje:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="1.5"/>
                      </div>
                      <div>
                        <label className={lCls}>Monto U$S resultante</label>
                        <input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value,monto_usd:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="Calculado auto"/>
                      </div>
                      <div>
                        <label className={lCls}>Rend. total tn</label>
                        <input type="number" value={form.rendimiento_tn??""} onChange={e=>setForm({...form,rendimiento_tn:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="0"/>
                      </div>
                      <div>
                        <label className={lCls}>Período</label>
                        <input type="text" value={form.periodo??""} onChange={e=>setForm({...form,periodo:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="2025/2026"/>
                      </div>
                    </>
                  )}

                  <div>
                    <label className={lCls}>Concepto</label>
                    <input type="text" value={form.concepto??""} onChange={e=>setForm({...form,concepto:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="Honorario campaña..."/>
                  </div>
                  <div>
                    <label className={lCls}>Fecha</label>
                    <input type="date" value={form.fecha_c??""} onChange={e=>setForm({...form,fecha_c:e.target.value})} className="inp" style={{padding:"8px 12px"}}/>
                  </div>
                  <div>
                    <label className={lCls}>Estado</label>
                    <select value={form.estado??"pendiente"} onChange={e=>setForm({...form,estado:e.target.value})} className="inp" style={{padding:"8px 12px"}}>
                      <option value="pendiente">Pendiente</option>
                      <option value="cobrado">Cobrado</option>
                    </select>
                  </div>
                  <div>
                    <label className={lCls}>Método de pago</label>
                    <select value={form.metodo??""} onChange={e=>setForm({...form,metodo:e.target.value})} className="inp" style={{padding:"8px 12px"}}>
                      <option value="">—</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="cheque">Cheque</option>
                      <option value="granos">Granos</option>
                    </select>
                  </div>
                </div>

                {/* Total a cobrar */}
                {Number(form.monto||0)>0&&(
                  <div style={{marginBottom:12,padding:"12px 16px",borderRadius:14,
                    backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",backgroundPosition:"center",
                    position:"relative",overflow:"hidden"}}>
                    <div style={{position:"absolute",inset:0,background:"rgba(255,255,255,0.12)"}}/>
                    <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontSize:13,fontWeight:700,color:"white",textShadow:"0 1px 3px rgba(0,40,120,0.40)"}}>Total a cobrar</span>
                      <span style={{fontSize:20,fontWeight:800,color:"white",textShadow:"0 1px 3px rgba(0,40,120,0.40)"}}>U$S {Number(form.monto||0).toLocaleString("es-AR")}</span>
                    </div>
                  </div>
                )}

                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarCob} className="bbtn">✓ Confirmar cobro</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="btn-cancel" style={{padding:"10px 16px",fontSize:13}}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Tabla de cobros registrados */}
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(0,60,140,0.08)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>Historial de cobros</span>
                <button onClick={async()=>{
                  const XLSX=await import("xlsx");
                  const data=cobranzas.map((c:any)=>{
                    const p=productores.find((x:any)=>x.id===c.productor_id);
                    return{PRODUCTOR:p?.nombre??"—",CONCEPTO:c.concepto,MODALIDAD:c.modalidad??"",PERIODO:c.periodo??"",MONTO_USD:c.monto||0,KG:c.kg_cantidad||"",PRECIO_KG:c.kg_precio_usd||"",FECHA:c.fecha,ESTADO:c.estado,METODO:c.metodo_pago||""};
                  });
                  const ws=XLSX.utils.json_to_sheet(data);
                  ws["!cols"]=[{wch:22},{wch:28},{wch:14},{wch:14},{wch:12},{wch:10},{wch:10},{wch:12},{wch:10},{wch:12}];
                  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Cobranza");
                  XLSX.writeFile(wb,"cobranza_"+new Date().toISOString().slice(0,10)+".xlsx");
                }} className="btn-g" style={{padding:"6px 12px",fontSize:12}}>📤 Exportar</button>
              </div>
              {cobranzas.length===0?(
                <div style={{textAlign:"center",padding:"48px 20px",color:"#6b8aaa",fontSize:14}}>Sin cobros registrados</div>
              ):(
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",fontSize:12,minWidth:600,borderCollapse:"collapse"}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)",background:"rgba(240,248,255,0.50)"}}>
                      {["Productor","Concepto","Modalidad","Período","Monto U$S","Estado",""].map(h=>(
                        <th key={h} style={{textAlign:"left",padding:"10px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {cobranzas.map((c:any)=>{
                        const p=productores.find((x:any)=>x.id===c.productor_id);
                        const MODAL_ICON:Record<string,string>={usd_mensual:"💵",usd_anual:"💵",kg_soja_ha:"🫘",kg_cultivo_ha:"🌾",porcentaje_rto:"📊",otro:"✏️"};
                        const MODAL_LABEL:Record<string,string>={usd_mensual:"U$S/mes",usd_anual:"U$S/año",kg_soja_ha:"Kg soja/ha",kg_cultivo_ha:"Kg cultivo/ha",porcentaje_rto:"% Rto",otro:"Otro"};
                        return(
                          <tr key={c.id} style={{borderBottom:"1px solid rgba(0,60,140,0.05)"}}
                            onMouseOver={e=>(e.currentTarget.style.background="rgba(240,248,255,0.50)")}
                            onMouseOut={e=>(e.currentTarget.style.background="transparent")}>
                            <td style={{padding:"10px 12px",fontWeight:700,color:"#0d2137"}}>{p?.nombre??"—"}</td>
                            <td style={{padding:"10px 12px",color:"#4a6a8a",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.concepto}</td>
                            <td style={{padding:"10px 12px"}}>
                              <span style={{fontSize:11,padding:"3px 8px",borderRadius:7,fontWeight:700,
                                background:"rgba(25,118,210,0.10)",color:"#1565c0"}}>
                                {MODAL_ICON[c.modalidad]||"✏️"} {MODAL_LABEL[c.modalidad]||"Manual"}
                              </span>
                            </td>
                            <td style={{padding:"10px 12px",color:"#6b8aaa",fontSize:11}}>{c.periodo||"—"}</td>
                            <td style={{padding:"10px 12px",fontWeight:800,color:"#0D47A1",fontSize:13}}>
                              U$S {Number(c.monto||0).toLocaleString("es-AR")}
                              {c.kg_cantidad>0&&<div style={{fontSize:10,color:"#6b8aaa",fontWeight:500}}>{c.kg_cantidad} kg × U$S {c.kg_precio_usd}/kg</div>}
                            </td>
                            <td style={{padding:"10px 12px"}}>
                              <span style={{fontSize:11,padding:"3px 8px",borderRadius:7,fontWeight:700,
                                background:c.estado==="cobrado"?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.08)",
                                color:c.estado==="cobrado"?"#166534":"#dc2626"}}>
                                {c.estado==="cobrado"?"✓ Cobrado":"⏳ Pendiente"}
                              </span>
                            </td>
                            <td style={{padding:"10px 12px",display:"flex",gap:8,alignItems:"center"}}>
                              {c.estado==="pendiente"&&(
                                <button onClick={()=>marcarCobrado(c.id)}
                                  style={{fontSize:11,padding:"4px 10px",borderRadius:7,fontWeight:700,cursor:"pointer",
                                    background:"rgba(22,163,74,0.10)",border:"1px solid rgba(22,163,74,0.25)",color:"#166534"}}>
                                  ✓ Cobrar
                                </button>
                              )}
                              <button onClick={async()=>{const sb=getSB();await sb.from("ing_cobranzas").delete().eq("id",c.id);await fetchCobs(ingId);}}
                                style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:15}}>✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ VEHICULO ══ */}
        {seccion==="vehiculo"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
              <h2 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>Mi Vehículo</h2>
              {!vehiculoSel?<button onClick={()=>{setShowForm(true);setForm({});}} className="bbtn">+ Agregar</button>
                :<div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{setShowForm(true);setForm({});}} className="abtn" style={{padding:"8px 14px",fontSize:12}}>+ Service</button>
                  <button onClick={()=>{setVehiculoSel(null);setServicios([]);setShowForm(false);}} className="abtn" style={{padding:"8px 14px",fontSize:12}}>← Volver</button>
                </div>
              }
            </div>
            {showForm&&!vehiculoSel&&(
              <div className="card fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:"#0d2137"}}>+ Nuevo vehículo</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  {[["nombre","Nombre","Toyota Hilux","text"],["marca","Marca","","text"],["modelo","Modelo","","text"],["anio","Año","","number"],["patente","Patente","","text"],["seg_comp","Compañía seguro","","text"],["seg_venc","Venc. seguro","","date"],["vtv_venc","Venc. VTV","","date"],["km","Km actuales","","number"],["prox_km","Próx. service km","","number"]].map(([k,l,ph,t])=>(
                    <div key={k as string}><label className={lCls}>{l as string}</label><input type={t as string} value={form[k as string]??""} onChange={e=>setForm({...form,[k as string]:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder={ph as string}/></div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8}}><button onClick={guardarVeh} className="bbtn">Guardar</button><button onClick={()=>{setShowForm(false);setForm({});}} className="abtn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button></div>
              </div>
            )}
            {!vehiculoSel?(
              vehiculos.length===0?<div className="card" style={{padding:"48px 20px",textAlign:"center"}}><div style={{fontSize:48,opacity:0.12,marginBottom:12}}>🚗</div><p style={{color:"#6b8aaa",fontSize:14}}>Sin vehículos</p></div>:(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {vehiculos.map((v:any)=>{const sV=v.seguro_vencimiento&&new Date(v.seguro_vencimiento)<new Date();const vV=v.vtv_vencimiento&&new Date(v.vtv_vencimiento)<new Date();return(
                    <div key={v.id} className="card" style={{padding:14,cursor:"pointer"}} onClick={async()=>{setVehiculoSel(v);const sb=getSB();const{data}=await sb.from("ing_vehiculo_service").select("*").eq("vehiculo_id",v.id).order("fecha",{ascending:false});setServicios(data??[]);}}>
                      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                        <div style={{width:46,height:46,borderRadius:14,background:"rgba(25,118,210,0.08)",border:"1px solid rgba(25,118,210,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🚗</div>
                        <div style={{flex:1}}><div style={{fontWeight:700,color:"#0d2137",fontSize:15}}>{v.nombre}</div><div style={{fontSize:11,color:"#6b8aaa",marginTop:2}}>{v.marca} {v.modelo} · {v.anio} · {v.patente}</div></div>
                        <button onClick={e=>{e.stopPropagation();(async()=>{const sb=getSB();await sb.from("ing_vehiculos").delete().eq("id",v.id);await fetchVehs(ingId);})();}} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:18}}>✕</button>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                        <div className="kpi" style={{padding:"10px 12px"}}><div style={{fontSize:10,color:"#6b8aaa",marginBottom:3}}>Km actuales</div><div style={{fontSize:18,fontWeight:700,color:"#0D47A1"}}>{(v.km_actuales||0).toLocaleString()}</div></div>
                        <div className="kpi" style={{padding:"10px 12px",background:"rgba(251,191,36,0.08)"}}><div style={{fontSize:10,color:"#6b8aaa",marginBottom:3}}>Próx. service</div><div style={{fontSize:16,fontWeight:700,color:"#f57f17"}}>{v.proximo_service_km?(v.proximo_service_km.toLocaleString()+" km"):"—"}</div></div>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <span style={{flex:1,fontSize:11,padding:"7px 10px",borderRadius:10,fontWeight:700,textAlign:"center",background:sV?"rgba(220,38,38,0.08)":"rgba(22,163,74,0.08)",color:sV?"#dc2626":"#16a34a",border:`1px solid ${sV?"rgba(220,38,38,0.18)":"rgba(22,163,74,0.18)"}`}}>🛡 {sV?"VENCIDO":v.seguro_vencimiento||"—"}</span>
                        <span style={{flex:1,fontSize:11,padding:"7px 10px",borderRadius:10,fontWeight:700,textAlign:"center",background:vV?"rgba(220,38,38,0.08)":"rgba(22,163,74,0.08)",color:vV?"#dc2626":"#16a34a",border:`1px solid ${vV?"rgba(220,38,38,0.18)":"rgba(22,163,74,0.18)"}`}}>📋 {vV?"VTV VENCIDA":v.vtv_vencimiento||"—"}</span>
                      </div>
                    </div>
                  );})}
                </div>
              )
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div className="card" style={{padding:14,display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:46,height:46,borderRadius:14,background:"rgba(25,118,210,0.08)",border:"1px solid rgba(25,118,210,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🚗</div>
                  <div><div style={{fontWeight:700,color:"#0d2137"}}>{vehiculoSel.nombre}</div><div style={{fontSize:11,color:"#6b8aaa"}}>{vehiculoSel.marca} {vehiculoSel.modelo} · {(vehiculoSel as any).anio} · {vehiculoSel.patente}</div></div>
                </div>
                {showForm&&vehiculoSel&&(
                  <div className="card fade-in" style={{padding:14}}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:"#0d2137"}}>+ Service</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                      <div><label className={lCls}>Tipo</label><select value={form.tipo_s??"service"} onChange={e=>setForm({...form,tipo_s:e.target.value})} className="sel" style={{width:"100%"}}><option value="service">Service</option><option value="reparacion">Reparación</option><option value="vtv">VTV</option><option value="otro">Otro</option></select></div>
                      <div><label className={lCls}>Descripción</label><input type="text" value={form.desc_s??""} onChange={e=>setForm({...form,desc_s:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Taller</label><input type="text" value={form.taller??""} onChange={e=>setForm({...form,taller:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Km</label><input type="number" value={form.km_s??""} onChange={e=>setForm({...form,km_s:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Costo</label><input type="number" value={form.costo_s??""} onChange={e=>setForm({...form,costo_s:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_s??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_s:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                    </div>
                    <div style={{display:"flex",gap:8}}><button onClick={guardarService} className="bbtn">Guardar</button><button onClick={()=>{setShowForm(false);setForm({});}} className="abtn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button></div>
                  </div>
                )}
                <div className="card" style={{overflow:"hidden",padding:0}}>
                  <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,60,140,0.07)",fontSize:13,fontWeight:700,color:"#0d2137"}}>🔧 Historial</div>
                  {servicios.length===0?<div style={{textAlign:"center",padding:"32px 20px",color:"#6b8aaa",fontSize:13}}>Sin historial</div>:(
                    <div style={{overflowX:"auto"}}><table style={{width:"100%",fontSize:12,minWidth:440,borderCollapse:"collapse"}}>
                      <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.07)"}}>{["Fecha","Tipo","Descripción","Km","Costo",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:600,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                      <tbody>{servicios.map(s=><tr key={s.id} style={{borderBottom:"1px solid rgba(0,60,140,0.05)"}}><td style={{padding:"9px 12px",color:"#6b8aaa",fontSize:11}}>{s.fecha}</td><td style={{padding:"9px 12px"}}><span style={{fontSize:10,padding:"3px 7px",borderRadius:6,fontWeight:700,background:"rgba(251,191,36,0.12)",color:"#f57f17"}}>{s.tipo}</span></td><td style={{padding:"9px 12px",color:"#4a6a8a",fontSize:11}}>{s.descripcion}</td><td style={{padding:"9px 12px",color:"#6b8aaa",fontSize:11}}>{s.km?(s.km.toLocaleString()+" km"):"—"}</td><td style={{padding:"9px 12px",fontWeight:700,color:"#dc2626",fontSize:12}}>${Number(s.costo).toLocaleString("es-AR")}</td><td style={{padding:"9px 12px"}}><button onClick={async()=>{const sb=getSB();await sb.from("ing_vehiculo_service").delete().eq("id",s.id);const sb2=getSB();const{data}=await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id",vehiculoSel!.id).order("fecha",{ascending:false});setServicios(data??[]);}} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:15}}>✕</button></td></tr>)}</tbody>
                    </table></div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{height:90}}/>
      </div>

      {/* ══ PANEL IA FLOTANTE ══ */}
      {aiPanel&&(
        <div style={{position:"fixed",bottom:92,right:80,zIndex:50,width:310,maxHeight:"72vh",
          borderRadius:20,overflow:"hidden",display:"flex",flexDirection:"column",
          background:"rgba(255,255,255,0.92)",backdropFilter:"blur(16px)",
          border:"1px solid rgba(255,255,255,0.95)",
          boxShadow:"0 16px 48px rgba(20,80,160,0.20)"}}>
          <div style={{padding:"11px 14px",borderBottom:"1px solid rgba(0,60,140,0.08)",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:"#22c55e",boxShadow:"0 0 6px rgba(34,197,94,0.6)"}}/>
              <span style={{fontWeight:700,color:"#0d2137",fontSize:13}}>🌾 IA Agronómica</span>
            </div>
            <button onClick={()=>setAiPanel(false)} style={{background:"none",border:"none",color:"#6b8aaa",cursor:"pointer",fontSize:18}}>✕</button>
          </div>
          {aiChat.length===0&&(
            <div style={{padding:"8px 10px",borderBottom:"1px solid rgba(0,60,140,0.06)",display:"flex",flexWrap:"wrap",gap:5,flexShrink:0}}>
              {["Dosis glifosato","Roya soja","Fungicida maíz","Precio soja"].map(q=>(
                <button key={q} onClick={()=>askAI(q)}
                  style={{fontSize:11,padding:"5px 10px",borderRadius:20,cursor:"pointer",fontWeight:600,
                    background:"rgba(25,118,210,0.08)",border:"1px solid rgba(25,118,210,0.18)",color:"#1565c0"}}>
                  💬 {q}
                </button>
              ))}
            </div>
          )}
          <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:8,minHeight:0}}>
            {aiChat.length===0&&<div style={{textAlign:"center",padding:"24px 16px",color:"#6b8aaa"}}><div style={{fontSize:36,marginBottom:8}}>🌾</div><p style={{fontSize:12,lineHeight:1.5}}>Preguntá sobre dosis, plagas,<br/>cultivos y mercados</p></div>}
            {aiChat.map((msg,i)=>(
              <div key={i} style={{display:"flex",justifyContent:msg.rol==="user"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"85%",padding:"9px 13px",borderRadius:14,fontSize:12,lineHeight:1.5,
                  ...(msg.rol==="user"
                    ?{background:"linear-gradient(145deg,#2196f3,#1565c0)",color:"white",boxShadow:"0 3px 10px rgba(33,150,243,0.28)"}
                    :{background:"rgba(240,248,255,0.90)",border:"1px solid rgba(25,118,210,0.12)",color:"#1a2a4a"})}}>
                  {msg.rol==="assistant"&&<div style={{fontSize:9,fontWeight:700,color:"#1565c0",marginBottom:4,letterSpacing:1}}>◆ IA AGRONÓMICA</div>}
                  <p style={{margin:0,whiteSpace:"pre-wrap"}}>{msg.texto}</p>
                </div>
              </div>
            ))}
            {aiLoad&&<div style={{display:"flex"}}><div style={{background:"rgba(240,248,255,0.90)",border:"1px solid rgba(25,118,210,0.12)",padding:"9px 13px",borderRadius:14,display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:"50%",background:"#90caf9",animation:"float 1s ease-in-out infinite",animationDelay:i*0.18+"s"}}/>)}</div></div>}
          </div>
          <div style={{padding:"9px 10px",borderTop:"1px solid rgba(0,60,140,0.07)",display:"flex",gap:7,flexShrink:0,background:"rgba(240,248,255,0.50)"}}>
            <input type="text" value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&askAI()} placeholder="Consultá..." className={iCls} style={{flex:1,padding:"8px 12px",fontSize:12}}/>
            <button onClick={()=>askAI()} disabled={aiLoad||!aiInput.trim()} className="bbtn" style={{padding:"8px 14px",fontSize:15,opacity:aiLoad||!aiInput.trim()?0.4:1}}>→</button>
          </div>
          {aiChat.length>0&&<div style={{padding:"3px 10px 8px",textAlign:"center"}}><button onClick={()=>setAiChat([])} style={{fontSize:10,color:"#6b8aaa",background:"none",border:"none",cursor:"pointer"}}>Limpiar</button></div>}
        </div>
      )}

      {/* ══ PANEL VOZ ══ */}
      {vozPanel&&(
        <div style={{position:"fixed",bottom:92,right:16,zIndex:50,width:272,borderRadius:18,overflow:"hidden",
          background:"rgba(255,255,255,0.90)",backdropFilter:"blur(16px)",
          border:"1px solid rgba(255,255,255,0.95)",
          boxShadow:"0 12px 36px rgba(20,80,160,0.16)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 13px",borderBottom:"1px solid rgba(0,60,140,0.07)"}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}><div style={{width:7,height:7,borderRadius:"50%",background:VOZ_COLOR[vozEstado]}}/><span style={{color:"#0d2137",fontSize:12,fontWeight:700}}>🎤 ASISTENTE</span></div>
            <button onClick={()=>{setVozPanel(false);recRef.current?.stop();setVozEstado("idle");}} style={{background:"none",border:"none",color:"#6b8aaa",cursor:"pointer",fontSize:18}}>✕</button>
          </div>
          <div style={{padding:12,minHeight:52}}>
            {vozEstado==="escuchando"&&<p style={{color:"#dc2626",fontSize:13,fontWeight:600,margin:0}}>🔴 Escuchando...</p>}
            {vozEstado==="procesando"&&<p style={{color:"#f57f17",fontSize:13,fontWeight:600,margin:0}}>⚙️ Procesando...</p>}
            {vozEstado==="idle"&&(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {["¿Cuántas ha totales?","Dosis glifosato soja","¿Cuántos productores?"].map(q=>(
                  <button key={q} onClick={()=>{askAI(q);setVozPanel(false);}} className="abtn" style={{padding:"7px 11px",fontSize:11,justifyContent:"flex-start"}}>💬 {q}</button>
                ))}
              </div>
            )}
          </div>
          <div style={{padding:"0 10px 10px",display:"flex",gap:7}}>
            <input value={vozInput} onChange={e=>setVozInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){askAI(vozInput);setVozInput("");setVozPanel(false);}}} placeholder="Escribí..." className={iCls} style={{flex:1,padding:"7px 11px",fontSize:12}}/>
            <button onClick={escucharVoz} style={{padding:"7px 11px",borderRadius:11,fontSize:14,background:VOZ_COLOR[vozEstado]+"20",border:`1px solid ${VOZ_COLOR[vozEstado]}40`,color:VOZ_COLOR[vozEstado],cursor:"pointer"}}>{VOZ_ICON[vozEstado]}</button>
          </div>
        </div>
      )}

      {/* Botón IA flotante (verde) */}
      <button onClick={()=>{setAiPanel(!aiPanel);if(!aiPanel)setVozPanel(false);}}
        style={{position:"fixed",bottom:80,right:16,zIndex:40,width:52,height:52,borderRadius:"50%",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,cursor:"pointer",
          background:aiPanel?"linear-gradient(145deg,#43a047,#1b5e20)":"linear-gradient(145deg,#2e7d32,#43a047)",
          color:"white",border:`2px solid ${aiPanel?"rgba(134,239,172,0.6)":"rgba(255,255,255,0.7)"}`,
          boxShadow:"0 4px 16px rgba(46,125,50,0.40)",transition:"all 0.2s ease"}}>
        🌾
      </button>

      {/* Botón VOZ flotante (azul) */}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
        style={{position:"fixed",bottom:20,right:16,zIndex:40,width:54,height:54,borderRadius:"50%",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,cursor:"pointer",
          backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",backgroundPosition:"center",
          color:"white",
          border:"2px solid rgba(180,220,255,0.70)",
          boxShadow:"0 4px 22px rgba(33,150,243,0.55),inset 0 1px 0 rgba(255,255,255,0.30)",
          animation:vozEstado==="idle"?"float 3s ease-in-out infinite":"none",
          transition:"all 0.2s ease",
          textShadow:"0 1px 3px rgba(0,40,120,0.40)"}}>
        {VOZ_ICON[vozEstado]}
      </button>
    </div>
  );
}
