"use client";
// @ts-nocheck
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { createClient } from "@supabase/supabase-js";
import ChatFlotante from "@/components/ChatFlotante/ChatFlotante";

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

type Seccion = "general"|"productores"|"cobranza"|"varios"|"ia_campo";
type ProductorIng = { id:string; nombre:string; telefono:string; email:string; localidad:string; provincia:string; hectareas_total:number; observaciones:string; empresa_id:string|null; tiene_cuenta:boolean; honorario_tipo:string; honorario_monto:number; };
type Campana = { id:string; nombre:string; activa:boolean; año_inicio?:number; año_fin?:number; };
type Cobranza = { id:string; productor_id:string; concepto:string; monto:number; fecha:string; estado:string; metodo_pago:string; };
type Acuerdo = {
  id:string; ingeniero_id:string; productor_id:string; empresa_id:string;
  campana_id:string; campana_nombre:string; modalidad:string;
  monto_total_usd:number; kg_total:number; kg_precio_referencia:number;
  porcentaje:number; hectareas:number; concepto:string; notas:string; estado:string;
};
type Pago = {
  id:string; acuerdo_id:string; productor_id:string; fecha:string;
  monto_usd:number; kg_cantidad:number; tipo_cambio:number; monto_pesos:number;
  metodo_pago:string; observaciones:string;
};
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
  { k:"varios",     icon:"📁", label:"Varios" },
];

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

// ══════════════════════════════════════════════
// SECCIÓN RECETAS
// ══════════════════════════════════════════════
const PROVINCIAS_AR = ["Buenos Aires","CABA","Catamarca","Chaco","Chubut","Córdoba","Corrientes","Entre Ríos","Formosa","Jujuy","La Pampa","La Rioja","Mendoza","Misiones","Neuquén","Río Negro","Salta","San Juan","San Luis","Santa Cruz","Santa Fe","Santiago del Estero","Tierra del Fuego","Tucumán"];
const TIPOS_RECETA = ["Aplicación","Venta","Aplicación y Venta"];
const TIPOS_PRODUCTO = ["Herbicida","Fungicida","Insecticida","Fertilizante foliar","Fertilizante base","Bioestimulante","Otros"];

function SeccionRecetas({ingId, productores, iCls, lCls, m}:any) {
  const [recetas, setRecetas] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string|null>(null);
  const [form, setForm] = useState<any>({provincia:"Santa Fe", tipo:"Aplicación", productos:[{nombre:"",tipo:"Herbicida",dosis:"",unidad:"l/ha",pc_nombre:"",nro_registro:""}]});
  const [filtro, setFiltro] = useState("todas");
  const [recetaSel, setRecetaSel] = useState<any|null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{if(ingId)fetchRecetas();},[ingId]);

  const fetchRecetas = async () => {
    try {
      const sb = getSB();
      const {data} = await sb.from("ing_recetas").select("*").eq("ingeniero_id",ingId).order("created_at",{ascending:false});
      setRecetas(data??[]);
    } catch{}
    setLoading(false);
  };

  const addProducto = () => setForm((f:any)=>({...f, productos:[...f.productos,{nombre:"",tipo:"Herbicida",dosis:"",unidad:"l/ha",pc_nombre:"",nro_registro:""}]}));
  const removeProducto = (i:number) => setForm((f:any)=>({...f,productos:f.productos.filter((_:any,idx:number)=>idx!==i)}));
  const updateProducto = (i:number, k:string, v:string) => setForm((f:any)=>{const p=[...f.productos];p[i]={...p[i],[k]:v};return{...f,productos:p};});

  const guardar = async () => {
    if(!ingId||!form.nombre?.trim()){m("❌ Ingresá el nombre de la receta");return;}
    const sb=getSB();
    const payload={
      ingeniero_id:ingId,
      nombre:form.nombre,
      tipo:form.tipo??"Aplicación",
      provincia:form.provincia??"Santa Fe",
      productor_id:form.productor_id||null,
      cultivo:form.cultivo??"",
      superficie_ha:Number(form.superficie_ha??0),
      fecha:form.fecha??new Date().toISOString().split("T")[0],
      establecimiento:form.establecimiento??"",
      lote:form.lote??"",
      observaciones:form.observaciones??"",
      productos:form.productos??[],
      estado:"activa",
    };
    if(editId){
      await sb.from("ing_recetas").update(payload).eq("id",editId);
      m("✅ Receta actualizada");
    } else {
      await sb.from("ing_recetas").insert(payload);
      m("✅ Receta guardada");
    }
    await fetchRecetas();
    setShowForm(false); setEditId(null);
    setForm({provincia:"Santa Fe",tipo:"Aplicación",productos:[{nombre:"",tipo:"Herbicida",dosis:"",unidad:"l/ha",pc_nombre:"",nro_registro:""}]});
  };

  const eliminar = async (id:string) => {
    if(!confirm("¿Eliminar receta?"))return;
    await getSB().from("ing_recetas").delete().eq("id",id);
    await fetchRecetas(); setRecetaSel(null);
    m("✅ Receta eliminada");
  };

  const editar = (r:any) => {
    setForm({...r, productos: r.productos?.length?r.productos:[{nombre:"",tipo:"Herbicida",dosis:"",unidad:"l/ha",pc_nombre:"",nro_registro:""}]});
    setEditId(r.id); setShowForm(true); setRecetaSel(null);
  };

  const recetasFiltradas = filtro==="todas"?recetas:recetas.filter(r=>r.tipo===filtro);

  const TIPO_COLOR:any = {
    "Aplicación":{bg:"rgba(25,118,210,0.10)",color:"#1565c0",border:"rgba(25,118,210,0.25)"},
    "Venta":{bg:"rgba(22,163,74,0.10)",color:"#15803d",border:"rgba(22,163,74,0.25)"},
    "Aplicación y Venta":{bg:"rgba(124,58,237,0.10)",color:"#6d28d9",border:"rgba(124,58,237,0.25)"},
  };

  if(recetaSel) return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <button onClick={()=>setRecetaSel(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"#6b8aaa",fontWeight:700}}>← Volver</button>
        <h2 style={{fontSize:18,fontWeight:800,color:"#0d2137",margin:0,flex:1}}>{recetaSel.nombre}</h2>
        <button onClick={()=>editar(recetaSel)} className="abtn" style={{padding:"7px 12px",fontSize:12}}>✏️ Editar</button>
        <button onClick={()=>eliminar(recetaSel.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:18}}>✕</button>
      </div>

      <div className="card" style={{padding:16}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          {[
            {l:"Tipo",v:<span style={{padding:"3px 10px",borderRadius:8,fontSize:12,fontWeight:700,...TIPO_COLOR[recetaSel.tipo]}}>{recetaSel.tipo}</span>},
            {l:"Provincia",v:recetaSel.provincia},
            {l:"Cultivo",v:recetaSel.cultivo||"—"},
            {l:"Superficie",v:recetaSel.superficie_ha?(recetaSel.superficie_ha+" ha"):"—"},
            {l:"Fecha",v:recetaSel.fecha||"—"},
            {l:"Establecimiento",v:recetaSel.establecimiento||"—"},
            {l:"Lote",v:recetaSel.lote||"—"},
            {l:"Productor",v:productores.find((p:any)=>p.id===recetaSel.productor_id)?.nombre||"—"},
          ].map(({l,v})=>(
            <div key={l}>
              <div style={{fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>{l}</div>
              <div style={{fontSize:13,fontWeight:600,color:"#0d2137"}}>{v}</div>
            </div>
          ))}
        </div>

        {recetaSel.observaciones&&(
          <div style={{padding:"10px 12px",borderRadius:12,background:"rgba(255,255,255,0.70)",border:"1px solid rgba(180,210,240,0.40)",marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",marginBottom:4}}>Observaciones</div>
            <div style={{fontSize:13,color:"#1a2a4a"}}>{recetaSel.observaciones}</div>
          </div>
        )}

        <div style={{fontSize:11,fontWeight:800,color:"#1e3a5f",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>🧪 Productos</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {(recetaSel.productos??[]).map((p:any,i:number)=>(
            <div key={i} style={{padding:"12px 14px",borderRadius:14,background:"rgba(255,255,255,0.75)",border:"1px solid rgba(180,210,240,0.45)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                <span style={{fontSize:14,fontWeight:800,color:"#0d2137"}}>{p.nombre||"—"}</span>
                <span style={{fontSize:11,padding:"2px 8px",borderRadius:6,fontWeight:700,background:"rgba(25,118,210,0.08)",color:"#1565c0"}}>{p.tipo}</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {[["Dosis",p.dosis?(p.dosis+" "+p.unidad):"—"],["P.C. / Nombre comercial",p.pc_nombre||"—"],["Nro. Registro",p.nro_registro||"—"]].map(([l,v])=>(
                  <div key={l}>
                    <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600}}>{l}</div>
                    <div style={{fontSize:12,fontWeight:600,color:"#1a2a4a"}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <h2 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>📋 Recetas</h2>
        <button onClick={()=>{setShowForm(!showForm);setEditId(null);setForm({provincia:"Santa Fe",tipo:"Aplicación",productos:[{nombre:"",tipo:"Herbicida",dosis:"",unidad:"l/ha",pc_nombre:"",nro_registro:""}]});}} className="bbtn">+ Nueva receta</button>
      </div>

      {/* Filtro tipo */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {["todas",...TIPOS_RECETA].map(t=>(
          <button key={t} onClick={()=>setFiltro(t)}
            style={{padding:"6px 14px",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer",
              background:filtro===t?"linear-gradient(145deg,#1976d2,#0d47a1)":"rgba(255,255,255,0.70)",
              color:filtro===t?"white":"#4a6a8a",border:filtro===t?"1px solid rgba(100,180,255,0.4)":"1.5px solid rgba(255,255,255,0.90)",
              boxShadow:filtro===t?"0 3px 10px rgba(25,118,210,0.30)":"none"}}>
            {t==="todas"?"Todas":t}
          </button>
        ))}
      </div>

      {/* Formulario nueva/editar receta */}
      {showForm&&(
        <div className="card" style={{padding:16}}>
          <div style={{fontSize:14,fontWeight:800,color:"#0d2137",marginBottom:14}}>{editId?"✏️ Editar":"+ Nueva"} Receta</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            <div style={{gridColumn:"1/-1"}}>
              <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Nombre de la receta *</label>
              <input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"9px 12px"}} placeholder="Ej: Herbicida soja 1° lote norte"/>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Tipo de receta</label>
              <select value={form.tipo??"Aplicación"} onChange={e=>setForm({...form,tipo:e.target.value})} className="sel" style={{width:"100%"}}>
                {TIPOS_RECETA.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Provincia</label>
              <select value={form.provincia??"Santa Fe"} onChange={e=>setForm({...form,provincia:e.target.value})} className="sel" style={{width:"100%"}}>
                {PROVINCIAS_AR.map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Productor</label>
              <select value={form.productor_id??""} onChange={e=>setForm({...form,productor_id:e.target.value})} className="sel" style={{width:"100%"}}>
                <option value="">— General —</option>
                {productores.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Cultivo</label>
              <input type="text" value={form.cultivo??""} onChange={e=>setForm({...form,cultivo:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Soja 1°, Maíz..."/>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Superficie (ha)</label>
              <input type="number" value={form.superficie_ha??""} onChange={e=>setForm({...form,superficie_ha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="0"/>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Establecimiento</label>
              <input type="text" value={form.establecimiento??""} onChange={e=>setForm({...form,establecimiento:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Nombre estancia/campo"/>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Lote</label>
              <input type="text" value={form.lote??""} onChange={e=>setForm({...form,lote:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Nombre del lote"/>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Fecha</label>
              <input type="date" value={form.fecha??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Observaciones</label>
              <textarea value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",minHeight:64,resize:"vertical"}} placeholder="Condiciones de aplicación, momento fenológico, etc."/>
            </div>
          </div>

          {/* Productos */}
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:800,color:"#1e3a5f",textTransform:"uppercase",letterSpacing:0.8}}>🧪 Productos</div>
              <button onClick={addProducto} className="abtn" style={{padding:"6px 12px",fontSize:12}}>+ Agregar</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {(form.productos??[]).map((p:any,i:number)=>(
                <div key={i} style={{padding:"12px 14px",borderRadius:14,background:"rgba(255,255,255,0.70)",border:"1px solid rgba(180,210,240,0.45)",position:"relative"}}>
                  <button onClick={()=>removeProducto(i)} style={{position:"absolute",top:8,right:8,background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:16}}>✕</button>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div style={{gridColumn:"1/-1"}}>
                      <label style={{fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",display:"block",marginBottom:3}}>Nombre del producto *</label>
                      <input type="text" value={p.nombre??""} onChange={e=>updateProducto(i,"nombre",e.target.value)} className={iCls} style={{width:"100%",padding:"7px 12px",fontSize:13}} placeholder="Ej: Roundup Max, Glifosato 48%..."/>
                    </div>
                    <div>
                      <label style={{fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",display:"block",marginBottom:3}}>Tipo</label>
                      <select value={p.tipo??"Herbicida"} onChange={e=>updateProducto(i,"tipo",e.target.value)} className="sel" style={{width:"100%",fontSize:12}}>
                        {TIPOS_PRODUCTO.map(t=><option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",display:"block",marginBottom:3}}>Nombre comercial / P.C.</label>
                      <input type="text" value={p.pc_nombre??""} onChange={e=>updateProducto(i,"pc_nombre",e.target.value)} className={iCls} style={{width:"100%",padding:"7px 12px",fontSize:12}} placeholder="Ej: Roundup Max"/>
                    </div>
                    <div>
                      <label style={{fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",display:"block",marginBottom:3}}>Dosis</label>
                      <input type="text" value={p.dosis??""} onChange={e=>updateProducto(i,"dosis",e.target.value)} className={iCls} style={{width:"100%",padding:"7px 12px",fontSize:12}} placeholder="Ej: 2"/>
                    </div>
                    <div>
                      <label style={{fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",display:"block",marginBottom:3}}>Unidad</label>
                      <select value={p.unidad??"l/ha"} onChange={e=>updateProducto(i,"unidad",e.target.value)} className="sel" style={{width:"100%",fontSize:12}}>
                        {["l/ha","kg/ha","cc/ha","g/ha","ml/ha","l/100l","kg/100kg"].map(u=><option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",display:"block",marginBottom:3}}>Nro. Registro SENASA</label>
                      <input type="text" value={p.nro_registro??""} onChange={e=>updateProducto(i,"nro_registro",e.target.value)} className={iCls} style={{width:"100%",padding:"7px 12px",fontSize:12}} placeholder="Opcional"/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{display:"flex",gap:8}}>
            <button onClick={guardar} className="bbtn">✓ {editId?"Actualizar":"Guardar"} receta</button>
            <button onClick={()=>{setShowForm(false);setEditId(null);setForm({provincia:"Santa Fe",tipo:"Aplicación",productos:[{nombre:"",tipo:"Herbicida",dosis:"",unidad:"l/ha",pc_nombre:"",nro_registro:""}]});}} className="abtn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista recetas */}
      {loading?<div style={{textAlign:"center",padding:32,color:"#6b8aaa"}}>Cargando...</div>
        :recetasFiltradas.length===0
          ?<div className="card" style={{padding:"48px 20px",textAlign:"center"}}>
            <div style={{fontSize:48,opacity:0.12,marginBottom:12}}>📋</div>
            <p style={{color:"#6b8aaa",fontSize:14}}>Sin recetas — creá la primera</p>
          </div>
          :<div style={{display:"flex",flexDirection:"column",gap:8}}>
            {recetasFiltradas.map((r:any)=>{
              const tc=TIPO_COLOR[r.tipo]??TIPO_COLOR["Aplicación"];
              const prod=productores.find((p:any)=>p.id===r.productor_id);
              return(
                <div key={r.id} className="card" style={{padding:14,cursor:"pointer"}} onClick={()=>setRecetaSel(r)}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                    <div style={{width:42,height:42,borderRadius:13,background:tc.bg,border:`1.5px solid ${tc.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>📋</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:15,fontWeight:800,color:"#0d2137",marginBottom:4}}>{r.nombre}</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
                        <span style={{fontSize:11,padding:"2px 9px",borderRadius:7,fontWeight:700,...tc}}>{r.tipo}</span>
                        <span style={{fontSize:11,color:"#6b8aaa",fontWeight:600}}>📍 {r.provincia}</span>
                        {r.cultivo&&<span style={{fontSize:11,color:"#4a6a8a",fontWeight:600}}>🌱 {r.cultivo}</span>}
                        {r.superficie_ha>0&&<span style={{fontSize:11,color:"#4a6a8a"}}>· {r.superficie_ha} ha</span>}
                        {prod&&<span style={{fontSize:11,color:"#1565c0",fontWeight:600}}>👨‍🌾 {prod.nombre}</span>}
                      </div>
                      {r.productos?.length>0&&(
                        <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>
                          {r.productos.slice(0,3).map((p:any,i:number)=>(
                            <span key={i} style={{fontSize:10,padding:"2px 7px",borderRadius:6,background:"rgba(25,118,210,0.07)",color:"#1565c0",fontWeight:600,border:"1px solid rgba(25,118,210,0.12)"}}>
                              {p.nombre||p.tipo} {p.dosis?`· ${p.dosis} ${p.unidad}`:""}
                            </span>
                          ))}
                          {r.productos.length>3&&<span style={{fontSize:10,color:"#6b8aaa"}}>+{r.productos.length-3} más</span>}
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      <button onClick={e=>{e.stopPropagation();editar(r);}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:14,padding:"4px"}}>✏️</button>
                      <button onClick={e=>{e.stopPropagation();eliminar(r.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:16,padding:"4px"}}>✕</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
      }
    </div>
  );
}

// ══════════════════════════════════════════════
// SECCIÓN NOTAS
// ══════════════════════════════════════════════
const CATEGORIAS_NOTA = [
  {k:"recordatorio", label:"Recordatorio", icon:"⏰", color:"#dc2626", bg:"rgba(220,38,38,0.09)", border:"rgba(220,38,38,0.22)"},
  {k:"campo",        label:"Campo",        icon:"🌾", color:"#15803d", bg:"rgba(22,163,74,0.09)", border:"rgba(22,163,74,0.22)"},
  {k:"financiero",   label:"Financiero",   icon:"💰", color:"#b45309", bg:"rgba(245,158,11,0.09)",border:"rgba(245,158,11,0.22)"},
  {k:"reunion",      label:"Reunión",      icon:"🤝", color:"#7c3aed", bg:"rgba(124,58,237,0.09)",border:"rgba(124,58,237,0.22)"},
  {k:"general",      label:"General",      icon:"📝", color:"#1565c0", bg:"rgba(25,118,210,0.09)",border:"rgba(25,118,210,0.22)"},
];

const PRIORIDADES = [
  {k:"alta",  label:"Alta",  color:"#dc2626", dot:"#ef4444"},
  {k:"media", label:"Media", color:"#d97706", dot:"#f59e0b"},
  {k:"baja",  label:"Baja",  color:"#16a34a", dot:"#22c55e"},
];

function SeccionNotas({ingId, productores, iCls, lCls, m}:any) {
  const [notas, setNotas] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string|null>(null);
  const [form, setForm] = useState<any>({categoria:"general",prioridad:"media",fecha_recordatorio:""});
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [filtroPrioridad, setFiltroPrioridad] = useState("todas");
  const [filtroEstado, setFiltroEstado] = useState("activas");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(()=>{if(ingId)fetchNotas();},[ingId]);

  const fetchNotas = async () => {
    try{
      const sb=getSB();
      const{data}=await sb.from("ing_notas").select("*").eq("ingeniero_id",ingId).order("created_at",{ascending:false});
      setNotas(data??[]);
    }catch{}
    setLoading(false);
  };

  const guardar = async () => {
    if(!ingId||!form.titulo?.trim()){m("❌ Ingresá el título");return;}
    const sb=getSB();
    const payload={
      ingeniero_id:ingId,
      titulo:form.titulo,
      contenido:form.contenido??"",
      categoria:form.categoria??"general",
      prioridad:form.prioridad??"media",
      productor_id:form.productor_id||null,
      fecha_recordatorio:form.fecha_recordatorio||null,
      completada:false,
    };
    if(editId){
      await sb.from("ing_notas").update(payload).eq("id",editId);
      m("✅ Nota actualizada");
    }else{
      await sb.from("ing_notas").insert(payload);
      m("✅ Nota guardada");
    }
    await fetchNotas();
    setShowForm(false); setEditId(null);
    setForm({categoria:"general",prioridad:"media",fecha_recordatorio:""});
  };

  const toggleCompletada = async (id:string, actual:boolean) => {
    await getSB().from("ing_notas").update({completada:!actual}).eq("id",id);
    setNotas(prev=>prev.map(n=>n.id===id?{...n,completada:!actual}:n));
  };

  const eliminar = async (id:string) => {
    if(!confirm("¿Eliminar nota?"))return;
    await getSB().from("ing_notas").delete().eq("id",id);
    await fetchNotas(); m("✅ Nota eliminada");
  };

  const editar = (n:any) => {
    setForm({...n,fecha_recordatorio:n.fecha_recordatorio?.split("T")[0]??""});
    setEditId(n.id); setShowForm(true);
    setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),100);
  };

  const notasFiltradas = notas.filter(n=>{
    if(filtroEstado==="activas"&&n.completada) return false;
    if(filtroEstado==="completadas"&&!n.completada) return false;
    if(filtroCategoria!=="todas"&&n.categoria!==filtroCategoria) return false;
    if(filtroPrioridad!=="todas"&&n.prioridad!==filtroPrioridad) return false;
    if(busqueda&&!n.titulo.toLowerCase().includes(busqueda.toLowerCase())&&!n.contenido?.toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  });

  const hoyStr = new Date().toISOString().split("T")[0];
  const vencenHoy = notas.filter(n=>!n.completada&&n.fecha_recordatorio?.startsWith(hoyStr));
  const vencenProximo = notas.filter(n=>{
    if(n.completada||!n.fecha_recordatorio) return false;
    const diff=(new Date(n.fecha_recordatorio).getTime()-Date.now())/(1000*60*60*24);
    return diff>0&&diff<=3;
  });

  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <h2 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>📝 Notas</h2>
        <button onClick={()=>{setShowForm(!showForm);setEditId(null);setForm({categoria:"general",prioridad:"media",fecha_recordatorio:""});}} className="bbtn">+ Nueva nota</button>
      </div>

      {/* Alertas de recordatorios */}
      {(vencenHoy.length>0||vencenProximo.length>0)&&(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {vencenHoy.map(n=>(
            <div key={n.id} style={{padding:"10px 14px",borderRadius:12,background:"rgba(220,38,38,0.08)",border:"1px solid rgba(220,38,38,0.22)",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:16}}>⏰</span>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:800,color:"#dc2626"}}>Recordatorio HOY</div>
                <div style={{fontSize:12,color:"#1a2a4a",fontWeight:600}}>{n.titulo}</div>
              </div>
              <button onClick={()=>toggleCompletada(n.id,n.completada)} style={{fontSize:11,padding:"4px 10px",borderRadius:8,background:"rgba(220,38,38,0.12)",border:"1px solid rgba(220,38,38,0.25)",color:"#dc2626",cursor:"pointer",fontWeight:700}}>Marcar hecho</button>
            </div>
          ))}
          {vencenProximo.map(n=>(
            <div key={n.id} style={{padding:"10px 14px",borderRadius:12,background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.22)",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:16}}>📅</span>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:800,color:"#d97706"}}>Próximo recordatorio</div>
                <div style={{fontSize:12,color:"#1a2a4a",fontWeight:600}}>{n.titulo} · {n.fecha_recordatorio}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Formulario */}
      {showForm&&(
        <div className="card" style={{padding:16}}>
          <div style={{fontSize:14,fontWeight:800,color:"#0d2137",marginBottom:14}}>{editId?"✏️ Editar":"+ Nueva"} Nota</div>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Título *</label>
              <input type="text" value={form.titulo??""} onChange={e=>setForm({...form,titulo:e.target.value})} className={iCls} style={{width:"100%",padding:"9px 12px"}} placeholder="¿De qué trata esta nota?"/>
            </div>
            <div>
              <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Contenido</label>
              <textarea value={form.contenido??""} onChange={e=>setForm({...form,contenido:e.target.value})} className={iCls} style={{width:"100%",padding:"9px 12px",minHeight:100,resize:"vertical",lineHeight:1.6}} placeholder="Escribí el detalle de la nota..."/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Categoría</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {CATEGORIAS_NOTA.map(c=>(
                    <button key={c.k} onClick={()=>setForm({...form,categoria:c.k})}
                      style={{padding:"5px 10px",borderRadius:9,fontSize:11,fontWeight:700,cursor:"pointer",
                        background:form.categoria===c.k?c.bg:"rgba(255,255,255,0.70)",
                        color:form.categoria===c.k?c.color:"#6b8aaa",
                        border:`1.5px solid ${form.categoria===c.k?c.border:"rgba(255,255,255,0.90)"}`}}>
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Prioridad</label>
                <div style={{display:"flex",gap:5}}>
                  {PRIORIDADES.map(p=>(
                    <button key={p.k} onClick={()=>setForm({...form,prioridad:p.k})}
                      style={{flex:1,padding:"6px 8px",borderRadius:9,fontSize:11,fontWeight:700,cursor:"pointer",
                        background:form.prioridad===p.k?`rgba(${p.k==="alta"?"220,38,38":p.k==="media"?"217,119,6":"22,163,74"},0.12)`:"rgba(255,255,255,0.70)",
                        color:form.prioridad===p.k?p.color:"#6b8aaa",
                        border:`1.5px solid ${form.prioridad===p.k?p.dot+"55":"rgba(255,255,255,0.90)"}`}}>
                      <span style={{display:"block",width:6,height:6,borderRadius:"50%",background:form.prioridad===p.k?p.dot:"#d1d5db",margin:"0 auto 3px"}}/>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Productor (opcional)</label>
                <select value={form.productor_id??""} onChange={e=>setForm({...form,productor_id:e.target.value})} className="sel" style={{width:"100%",fontSize:12}}>
                  <option value="">— General —</option>
                  {productores.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{display:"block",fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>⏰ Recordatorio (fecha)</label>
                <input type="date" value={form.fecha_recordatorio??""} onChange={e=>setForm({...form,fecha_recordatorio:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/>
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={guardar} className="bbtn">✓ {editId?"Actualizar":"Guardar"}</button>
            <button onClick={()=>{setShowForm(false);setEditId(null);setForm({categoria:"general",prioridad:"media",fecha_recordatorio:""});}} className="abtn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <input type="text" value={busqueda} onChange={e=>setBusqueda(e.target.value)} className={iCls} style={{width:"100%",padding:"9px 14px"}} placeholder="🔍 Buscar notas..."/>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {[{k:"activas",l:"Activas"},{k:"completadas",l:"Completadas"},{k:"todas",l:"Todas"}].map(e=>(
            <button key={e.k} onClick={()=>setFiltroEstado(e.k)}
              style={{padding:"5px 12px",borderRadius:9,fontSize:11,fontWeight:700,cursor:"pointer",
                background:filtroEstado===e.k?"linear-gradient(145deg,#1976d2,#0d47a1)":"rgba(255,255,255,0.70)",
                color:filtroEstado===e.k?"white":"#4a6a8a",border:filtroEstado===e.k?"none":"1.5px solid rgba(255,255,255,0.90)"}}>
              {e.l}
            </button>
          ))}
          <div style={{width:1,background:"rgba(0,60,140,0.10)",margin:"0 2px"}}/>
          {[{k:"todas",l:"📌 Todas"},...CATEGORIAS_NOTA.map(c=>({k:c.k,l:c.icon+" "+c.label}))].map(c=>(
            <button key={c.k} onClick={()=>setFiltroCategoria(c.k)}
              style={{padding:"5px 12px",borderRadius:9,fontSize:11,fontWeight:700,cursor:"pointer",
                background:filtroCategoria===c.k?"rgba(25,118,210,0.12)":"rgba(255,255,255,0.60)",
                color:filtroCategoria===c.k?"#1565c0":"#6b8aaa",
                border:filtroCategoria===c.k?"1px solid rgba(25,118,210,0.25)":"1px solid rgba(255,255,255,0.80)"}}>
              {c.l}
            </button>
          ))}
        </div>
      </div>

      {/* Resumen rápido */}
      {notas.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {[
            {l:"Total",v:notas.filter(n=>!n.completada).length,icon:"📝",color:"#1565c0"},
            {l:"Alta prioridad",v:notas.filter(n=>!n.completada&&n.prioridad==="alta").length,icon:"🔴",color:"#dc2626"},
            {l:"Completadas",v:notas.filter(n=>n.completada).length,icon:"✅",color:"#16a34a"},
          ].map(s=>(
            <div key={s.l} className="kpi" style={{padding:"10px 8px"}}>
              <div style={{fontSize:16,marginBottom:3}}>{s.icon}</div>
              <div style={{fontSize:20,fontWeight:800,color:s.color}}>{s.v}</div>
              <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600,marginTop:2}}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Lista notas */}
      {loading?<div style={{textAlign:"center",padding:32,color:"#6b8aaa"}}>Cargando...</div>
        :notasFiltradas.length===0
          ?<div className="card" style={{padding:"48px 20px",textAlign:"center"}}>
            <div style={{fontSize:48,opacity:0.12,marginBottom:12}}>📝</div>
            <p style={{color:"#6b8aaa",fontSize:14}}>Sin notas — creá la primera</p>
          </div>
          :<div style={{display:"flex",flexDirection:"column",gap:8}}>
            {notasFiltradas.map((n:any)=>{
              const cat=CATEGORIAS_NOTA.find(c=>c.k===n.categoria)??CATEGORIAS_NOTA[4];
              const prio=PRIORIDADES.find(p=>p.k===n.prioridad)??PRIORIDADES[1];
              const prod=productores.find((p:any)=>p.id===n.productor_id);
              const venceHoy=n.fecha_recordatorio?.startsWith(hoyStr);
              const vencido=n.fecha_recordatorio&&new Date(n.fecha_recordatorio)<new Date()&&!venceHoy;
              return(
                <div key={n.id} className="card" style={{padding:14,opacity:n.completada?0.65:1}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                    {/* Checkbox */}
                    <button onClick={()=>toggleCompletada(n.id,n.completada)}
                      style={{width:22,height:22,borderRadius:7,flexShrink:0,marginTop:2,cursor:"pointer",
                        background:n.completada?"linear-gradient(145deg,#22c55e,#16a34a)":"rgba(255,255,255,0.80)",
                        border:n.completada?"none":`2px solid ${prio.dot}`,
                        display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,
                        boxShadow:n.completada?"0 2px 8px rgba(22,163,74,0.30)":"none"}}>
                      {n.completada&&<span style={{color:"white",fontSize:12}}>✓</span>}
                    </button>

                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",marginBottom:5}}>
                        <span style={{fontSize:15,fontWeight:800,color:n.completada?"#9aabb8":"#0d2137",textDecoration:n.completada?"line-through":"none"}}>{n.titulo}</span>
                        {/* Categoría chip */}
                        <span style={{fontSize:10,padding:"2px 8px",borderRadius:6,fontWeight:700,background:cat.bg,color:cat.color,border:`1px solid ${cat.border}`}}>{cat.icon} {cat.label}</span>
                        {/* Prioridad dot */}
                        <span style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:prio.color,fontWeight:700}}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:prio.dot,display:"inline-block"}}/>
                          {prio.label}
                        </span>
                      </div>

                      {n.contenido&&<p style={{fontSize:12,color:"#4a6a8a",margin:"0 0 6px",lineHeight:1.55,WebkitLineClamp:2,overflow:"hidden",display:"-webkit-box",WebkitBoxOrient:"vertical"}}>{n.contenido}</p>}

                      <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",fontSize:11}}>
                        {prod&&<span style={{color:"#1565c0",fontWeight:600}}>👨‍🌾 {prod.nombre}</span>}
                        {n.fecha_recordatorio&&(
                          <span style={{fontWeight:700,color:vencido?"#dc2626":venceHoy?"#d97706":"#6b8aaa",
                            background:vencido?"rgba(220,38,38,0.08)":venceHoy?"rgba(245,158,11,0.08)":"transparent",
                            padding:vencido||venceHoy?"2px 7px":"0",borderRadius:6,
                            border:vencido?"1px solid rgba(220,38,38,0.20)":venceHoy?"1px solid rgba(245,158,11,0.20)":"none"}}>
                            ⏰ {vencido?"VENCIDO · ":venceHoy?"HOY · ":""}{n.fecha_recordatorio}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      <button onClick={()=>editar(n)} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:14,padding:"4px"}}>✏️</button>
                      <button onClick={()=>eliminar(n.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:16,padding:"4px"}}>✕</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
      }
    </div>
  );
}

export default function IngenieroPanel() {
  const [seccion, setSeccion] = useState<Seccion>("general");
  const [variosTab, setVariosTab] = useState<"vehiculos"|"recetas"|"notas">("vehiculos");
  const [ingId, setIngId] = useState("");
  const [ingNombre, setIngNombre] = useState("");
  const [ingData, setIngData] = useState<any>({});
  const [productores, setProductores] = useState<ProductorIng[]>([]);
  const [cobranzas, setCobranzas] = useState<Cobranza[]>([]);
  const [acuerdos, setAcuerdos] = useState<Acuerdo[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [acuerdoSel, setAcuerdoSel] = useState<Acuerdo|null>(null);
  const [showPago, setShowPago] = useState(false);
  const [showAcuerdo, setShowAcuerdo] = useState(false);
  const [campanaFiltro, setCampanaFiltro] = useState<string>("todas");
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [servicios, setServicios] = useState<ServiceVeh[]>([]);
  const [vehiculoSel, setVehiculoSel] = useState<Vehiculo|null>(null);
  const [lotes, setLotes] = useState<LoteResumen[]>([]);
  const [campanas, setCampanas] = useState<any[]>([]);
  const [campanasPorProd, setCampanasPorProd] = useState<Record<string,any[]>>({});
  const [campSelProd, setCampSelProd] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [ingEmpresaId, setIngEmpresaId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showVincular, setShowVincular] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editProd, setEditProd] = useState<string|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [msj, setMsj] = useState("");
  const m = (t:string) => { setMsj(t); setTimeout(()=>setMsj(""),4000); };
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
  const formCobRef = useRef<HTMLDivElement>(null);
  const [nuevaCampProd, setNuevaCampProd] = useState<string|null>(null);
  const [nuevaCampNombre, setNuevaCampNombre] = useState("");
  const recRef = useRef<any>(null);
  const [vozEstado, setVozEstado] = useState<VozEstado>("idle");
  const [vozPanel, setVozPanel] = useState(false);
  const [vozInput, setVozInput] = useState("");

  useEffect(() => {
    init();
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
      const { data: vincChat } = await sb.from("vinculaciones").select("empresa_id").eq("profesional_id", u.id).eq("activa", true).limit(1).maybeSingle();
if (vincChat) setIngEmpresaId(vincChat.empresa_id);
      await fetchProds(u.id);
      await fetchCobs(u.id);
      await fetchVehs(u.id);
      await fetchAcuerdos(u.id);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchProds = async (iid: string) => {
    const sb = getSB();
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

    const cpMap: Record<string,any[]> = {};
    const csMap: Record<string,string> = {};
    const lotesAll: LoteResumen[] = [];

    for (const c of (todasCamps ?? [])) {
      if (!cpMap[c.empresa_id]) cpMap[c.empresa_id] = [];
      cpMap[c.empresa_id].push(c);
    }

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
        lotesEmpresa
          .filter((l:any) => l.campana_id === campSel.id)
          .forEach((l:any) => lotesAll.push({...l, productor_nombre: p.nombre}));
      } else {
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
      ...prev.filter(l => (l as any).empresa_id !== eid),
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
  const fetchVehs = async (iid: string) => { try { const sb=getSB(); const{data}=await sb.from("ing_vehiculos").select("*").eq("ingeniero_id",iid).order("nombre"); setVehiculos(data??[]); } catch {} };

  const fetchAcuerdos = async (iid: string) => {
    const sb = getSB();
    const [{ data: ac }, { data: pg }] = await Promise.all([
      sb.from("ing_acuerdos").select("*").eq("ingeniero_id", iid).order("created_at", {ascending:false}),
      sb.from("ing_pagos").select("*").eq("ingeniero_id", iid).order("fecha", {ascending:false}),
    ]);
    setAcuerdos(ac ?? []);
    setPagos(pg ?? []);
  };

  const guardarAcuerdo = async () => {
    if(!ingId || !form.prod_ac) { m("❌ Seleccioná un productor"); return; }
    const sb = getSB();
    const prod = productores.find((p:any) => p.id === form.prod_ac);
    const eid = prod?.empresa_id ?? prod?.id;
    const campId = campSelProd[eid] ?? "";
    const { data: campData } = await sb.from("campanas").select("nombre").eq("id", campId).single();
    const campNombre = campData?.nombre ?? "";

    const modalidad = form.modalidad_ac ?? "usd_anual";
    let kg_total = 0, monto_total_usd = 0;
    if(modalidad === "kg_soja_ha" || modalidad === "kg_cultivo_ha") {
      kg_total = Number(form.kg_total_ac ?? 0);
      monto_total_usd = 0;
    } else if(modalidad === "usd_mensual") {
      monto_total_usd = Number(form.monto_ac ?? 0) * 12;
    } else {
      monto_total_usd = Number(form.monto_ac ?? 0);
    }

    const payload = {
      ingeniero_id: ingId,
      productor_id: form.prod_ac,
      empresa_id: eid,
      campana_id: campId,
      campana_nombre: campNombre,
      modalidad,
      monto_total_usd,
      kg_total,
      kg_precio_referencia: Number(form.kg_precio_ref_ac ?? 0),
      porcentaje: Number(form.porcentaje_ac ?? 0),
      hectareas: Number(form.hectareas_ac ?? 0),
      concepto: form.concepto_ac ?? `Honorario ${campNombre} — ${prod?.nombre}`,
      notas: form.notas_ac ?? "",
      estado: "activo",
    };

    const existente = acuerdos.find((a:any) => a.productor_id === form.prod_ac && a.campana_id === campId);
    if(existente) {
      await sb.from("ing_acuerdos").update(payload).eq("id", existente.id);
      m("✅ Acuerdo actualizado");
    } else {
      await sb.from("ing_acuerdos").insert(payload);
      m("✅ Acuerdo creado");
    }
    await fetchAcuerdos(ingId);
    setShowAcuerdo(false); setForm({});
  };

  const registrarPago = async () => {
    if(!acuerdoSel || !ingId) return;
    const sb = getSB();
    const modalidad = acuerdoSel.modalidad;
    const kgCant = Number(form.pago_kg ?? 0);
    const precio = Number(form.pago_precio_soja ?? 0);
    const tipoCambio = Number(form.pago_tc ?? 1);
    let montoUsd = 0;

    if(modalidad === "kg_soja_ha" || modalidad === "kg_cultivo_ha") {
      montoUsd = kgCant * precio;
    } else {
      montoUsd = Number(form.pago_usd ?? 0);
    }

    const montoPesos = montoUsd * tipoCambio;

    await sb.from("ing_pagos").insert({
      acuerdo_id: acuerdoSel.id,
      ingeniero_id: ingId,
      productor_id: acuerdoSel.productor_id,
      fecha: form.pago_fecha ?? new Date().toISOString().split("T")[0],
      monto_usd: montoUsd,
      kg_cantidad: kgCant,
      tipo_cambio: tipoCambio,
      monto_pesos: montoPesos,
      metodo_pago: form.pago_metodo ?? "",
      observaciones: form.pago_obs ?? "",
    });
    m(`✅ Pago registrado — U$S ${montoUsd.toLocaleString("es-AR")}${montoPesos>0?" / $"+Math.round(montoPesos).toLocaleString("es-AR"):""}`);
    await fetchAcuerdos(ingId);
    setShowPago(false); setForm({});
  };

  const calcularSaldo = (ac: Acuerdo) => {
    const pagosAc = pagos.filter((p:any) => p.acuerdo_id === ac.id);
    if(ac.modalidad === "kg_soja_ha" || ac.modalidad === "kg_cultivo_ha") {
      const kgPagado = pagosAc.reduce((a:any,p:any) => a+(p.kg_cantidad||0), 0);
      const kgRestante = (ac.kg_total||0) - kgPagado;
      return { kgPagado, kgRestante, usdPagado:0, usdRestante:0, completo: kgRestante<=0 };
    } else {
      const usdPagado = pagosAc.reduce((a:any,p:any) => a+(p.monto_usd||0), 0);
      const usdRestante = (ac.monto_total_usd||0) - usdPagado;
      return { kgPagado:0, kgRestante:0, usdPagado, usdRestante, completo: usdRestante<=0 };
    }
  };

  const copiarAcuerdoAnterior = async (prodId: string) => {
    const anterior = acuerdos.find((a:any) => a.productor_id === prodId && a.estado === "activo");
    if(!anterior) { m("Sin acuerdo anterior para copiar"); return; }
    setForm({
      prod_ac: prodId,
      modalidad_ac: anterior.modalidad,
      monto_ac: String(anterior.modalidad==="usd_mensual"?anterior.monto_total_usd/12:anterior.monto_total_usd),
      kg_total_ac: String(anterior.kg_total),
      kg_precio_ref_ac: String(anterior.kg_precio_referencia),
      porcentaje_ac: String(anterior.porcentaje),
      hectareas_ac: String(anterior.hectareas),
      concepto_ac: anterior.concepto?.replace(/202\d\/202\d/g,"")?.trim() ?? "",
      notas_ac: anterior.notas ?? "",
    });
    setShowAcuerdo(true);
    m("✅ Acuerdo anterior cargado — revisá y confirmá para la nueva campaña");
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
      monto_usd: Number(form.monto_usd||(form.monto??0)),
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

  const calcularHonorario = async (p: any) => {
    const sb = getSB();
    const eid = p.empresa_id ?? p.id;
    const campId = campSelProd[eid];
    if(!campId) { m("❌ Sin campaña activa para "+p.nombre); return; }
    const hoy = new Date().toISOString().split("T")[0];
    const { data: campData } = await sb.from("campanas").select("nombre").eq("id", campId).single();
    const periodo = campData?.nombre ?? new Date().getFullYear()+"/"+(new Date().getFullYear()+1);
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
    setTimeout(()=>formCobRef.current?.scrollIntoView({behavior:"smooth",block:"center"}),100);
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

  const exportarRecorrida = async () => {
    const XLSX = await import("xlsx");
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
          RECORRIDA:       "",
          NOVEDADES:       "",
        });
      });
    }
    if (!todosLotes.length) { m("Sin lotes para exportar"); return; }
    const ws = XLSX.utils.json_to_sheet(todosLotes);
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

  const totalHa = lotes.reduce((a,l)=>a+(Number(l.hectareas)||0),0);
  const totPend = cobranzas.filter(c=>c.estado==="pendiente").reduce((a,c)=>a+c.monto,0);
  const totCob = cobranzas.filter(c=>c.estado==="cobrado").reduce((a,c)=>a+c.monto,0);
  const cultivosU = [...new Set(lotes.map(l=>l.cultivo_completo||l.cultivo).filter(Boolean))];

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
    if((l.includes("soja")||l.includes("soja 1")||l.includes("soja1"))&&!l.includes("2"))
      return {bar:"linear-gradient(90deg,#2e7d32,#4CAF50)",chip:"rgba(46,125,50,0.14)",border:"rgba(46,125,50,0.35)",text:"#1b5e20",chipBg:"rgba(200,240,200,0.55)"};
    if(l.includes("soja")&&l.includes("2"))
      return {bar:"linear-gradient(90deg,#0288d1,#4fc3f7)",chip:"rgba(2,136,209,0.12)",border:"rgba(2,136,209,0.32)",text:"#01579b",chipBg:"rgba(190,230,255,0.55)"};
    if((l.includes("maíz")||l.includes("maiz"))&&!l.includes("2"))
      return {bar:"linear-gradient(90deg,#f9a825,#fdd835)",chip:"rgba(249,168,37,0.14)",border:"rgba(249,168,37,0.38)",text:"#e65100",chipBg:"rgba(255,240,180,0.60)"};
    if((l.includes("maíz")||l.includes("maiz"))&&l.includes("2"))
      return {bar:"linear-gradient(90deg,#ffb300,#ffe082)",chip:"rgba(255,179,0,0.12)",border:"rgba(255,179,0,0.30)",text:"#ff6f00",chipBg:"rgba(255,248,210,0.60)"};
    if(l.includes("trigo"))
      return {bar:"linear-gradient(90deg,#c8860a,#e4a829)",chip:"rgba(200,134,10,0.13)",border:"rgba(200,134,10,0.35)",text:"#7d4e00",chipBg:"rgba(245,220,160,0.58)"};
    if(l.includes("girasol"))
      return {bar:"linear-gradient(90deg,#e53935,#ff7043)",chip:"rgba(229,57,53,0.12)",border:"rgba(229,57,53,0.32)",text:"#b71c1c",chipBg:"rgba(255,200,190,0.58)"};
    if(l.includes("sorgo")&&!l.includes("2"))
      return {bar:"linear-gradient(90deg,#6d4c41,#a1887f)",chip:"rgba(109,76,65,0.13)",border:"rgba(109,76,65,0.32)",text:"#4e342e",chipBg:"rgba(220,195,185,0.58)"};
    if(l.includes("sorgo")&&l.includes("2"))
      return {bar:"linear-gradient(90deg,#a1887f,#d7ccc8)",chip:"rgba(161,136,127,0.12)",border:"rgba(161,136,127,0.28)",text:"#6d4c41",chipBg:"rgba(235,220,215,0.58)"};
    if(l.includes("cebada"))
      return {bar:"linear-gradient(90deg,#6a1b9a,#ab47bc)",chip:"rgba(106,27,154,0.11)",border:"rgba(106,27,154,0.28)",text:"#4a148c",chipBg:"rgba(220,190,240,0.55)"};
    if(l.includes("arveja"))
      return {bar:"linear-gradient(90deg,#00796b,#4db6ac)",chip:"rgba(0,121,107,0.11)",border:"rgba(0,121,107,0.28)",text:"#004d40",chipBg:"rgba(180,235,230,0.55)"};
    if(l.includes("carin")||l.includes("camel"))
      return {bar:"linear-gradient(90deg,#37474f,#78909c)",chip:"rgba(55,71,79,0.11)",border:"rgba(55,71,79,0.25)",text:"#263238",chipBg:"rgba(200,215,220,0.55)"};
    if(l.includes("pastura")||l.includes("alfalfa")||l.includes("festuca"))
      return {bar:"linear-gradient(90deg,#33691e,#8bc34a)",chip:"rgba(51,105,30,0.12)",border:"rgba(51,105,30,0.28)",text:"#1b5e20",chipBg:"rgba(200,235,170,0.55)"};
    return {bar:"linear-gradient(90deg,#455a64,#90a4ae)",chip:"rgba(69,90,100,0.10)",border:"rgba(69,90,100,0.24)",text:"#263238",chipBg:"rgba(200,215,225,0.55)"};
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

  const crearEmpresaVirtual = async (sb: any, nombre: string): Promise<string|null> => {
    const { data: emp } = await sb.from("empresas")
      .insert({ nombre: nombre + " (Ing)", propietario_id: ingId })
      .select("id").single();
    return emp?.id ?? null;
  };

  const guardarProductor = async () => {
    if (!ingId || !form.nombre?.trim()) { m("❌ Ingresá el nombre"); return; }
    const sb = getSB();
    let empresa_id: string|null = null;
    let tiene_cuenta = false;
    if (form.email?.trim()) {
      const { data: ue } = await sb.from("usuarios").select("id").eq("email", form.email.trim()).single();
      if (ue) {
        const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", ue.id).single();
        if (emp) { empresa_id = emp.id; tiene_cuenta = true; }
      }
    }
    const pay: any = {
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
      if (!empresa_id) {
        const { data: prodActual } = await sb.from("ing_productores").select("empresa_id").eq("id", editProd).single();
        if (!prodActual?.empresa_id) { empresa_id = await crearEmpresaVirtual(sb, form.nombre.trim()); pay.empresa_id = empresa_id; }
        else { pay.empresa_id = prodActual.empresa_id; }
      }
      await sb.from("ing_productores").update(pay).eq("id", editProd);
      setEditProd(null);
    } else {
      if (!empresa_id) { empresa_id = await crearEmpresaVirtual(sb, form.nombre.trim()); pay.empresa_id = empresa_id; }
      await sb.from("ing_productores").insert(pay);
    }
    m(tiene_cuenta ? "✅ Guardado — con cuenta APP" : "✅ Guardado");
    await fetchProds(ingId);
    setShowForm(false); setForm({});
  };

  const eliminarProd = async (id:string) => {
    if(!confirm("¿Eliminar?")) return;
    const sb = getSB();
    await sb.from("ing_productores").update({activo:false}).eq("id",id);
    await fetchProds(ingId);
  };

  const entrar = (p:ProductorIng) => {
    const eid = p.empresa_id ?? p.id;
    const campId = campSelProd[eid] ?? null;
    localStorage.setItem("ing_empresa_id", eid);
    localStorage.setItem("ing_empresa_nombre", p.nombre);
    localStorage.setItem("ing_modo_compartido", p.empresa_id ? "true" : "false");
    if (campId) localStorage.setItem("ing_campana_id", campId);
    window.location.href = "/ingeniero/lotes";
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

        .card{
          background-image: url('/FON.png');
          background-size: cover;
          background-position: center;
          border:1.5px solid rgba(255,255,255,0.90);
          border-top:2px solid rgba(255,255,255,1);
          border-radius:20px;
          box-shadow:0 8px 32px rgba(20,80,160,0.18),0 2px 8px rgba(0,0,0,0.07),inset 0 2px 0 rgba(255,255,255,0.95);
          position:relative;overflow:hidden;
        }
        .card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.64);border-radius:20px;pointer-events:none;z-index:0;}
        .card::after{content:"";position:absolute;top:0;left:0;right:0;height:42%;background:linear-gradient(180deg,rgba(255,255,255,0.55) 0%,transparent 100%);border-radius:20px 20px 0 0;pointer-events:none;z-index:1;}
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
        .card-sm::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.60);border-radius:16px;pointer-events:none;z-index:0;}
        .card-sm::after{content:"";position:absolute;top:0;left:0;right:0;height:42%;background:linear-gradient(180deg,rgba(255,255,255,0.45) 0%,transparent 100%);border-radius:16px 16px 0 0;pointer-events:none;z-index:1;}
        .card-sm>*{position:relative;z-index:2;}

        .topbar{
          background-image: url('/FON.png');
          background-size: cover;
          background-position: top center;
          border-bottom:1px solid rgba(255,255,255,0.40);
          box-shadow:0 2px 16px rgba(20,80,160,0.12);
          position:relative;
        }
        .topbar::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;z-index:0;}
        .topbar>*{position:relative;z-index:1;}

        .nav-tab{
          padding:9px 18px;border-radius:12px;font-size:13px;font-weight:700;
          cursor:pointer;transition:all 0.18s ease;white-space:nowrap;
          background-image:url('/FON.png');
          background-size:cover;background-position:center;
          border:1.5px solid rgba(255,255,255,0.92);
          color:#1e3a5f;
          box-shadow:0 3px 12px rgba(20,80,160,0.12);
          position:relative;
        }
        .nav-tab::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.42);border-radius:12px;pointer-events:none;z-index:0;transition:background 0.18s;}
        .nav-tab>*,.nav-tab span{position:relative;z-index:1;}
        .nav-tab:hover::before{background:rgba(255,255,255,0.88);}
        .nav-tab:hover{color:#0d47a1;transform:translateY(-1px);}
        .nav-tab.active{background-image:none;background:linear-gradient(145deg,#1976d2,#0d47a1);border:1.5px solid rgba(100,160,255,0.40);color:white !important;box-shadow:0 5px 18px rgba(13,71,161,0.45),inset 0 1px 0 rgba(255,255,255,0.25);}
        .nav-tab.active::before{display:none;}

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
        .abtn::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);border-radius:16px;pointer-events:none;z-index:0;}
        .abtn::after{content:"";position:absolute;top:0;left:0;right:0;height:42%;background:linear-gradient(180deg,rgba(255,255,255,0.50) 0%,transparent 100%);border-radius:16px 16px 0 0;pointer-events:none;z-index:1;transition:none;transform:none;}
        .abtn>*{position:relative;z-index:2;}
        .abtn:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(20,80,160,0.18);}
        .abtn:active{transform:scale(0.97);}

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
        .bbtn::before{content:"";position:absolute;top:0;left:0;right:0;height:45%;background:linear-gradient(180deg,rgba(255,255,255,0.22) 0%,transparent 100%);border-radius:14px 14px 0 0;pointer-events:none;}
        .bbtn>*{position:relative;z-index:1;}
        .bbtn:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(25,118,210,0.60);filter:brightness(1.08);}
        .bbtn:active{transform:scale(0.97);}

        .inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;}
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .inp option{background:white;color:#1a2a4a;}

        .sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:8px 12px;font-size:13px;font-weight:500;-webkit-appearance:none;cursor:pointer;box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);}
        .sel option{background:white;color:#1a2a4a;}

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
        .kpi::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.66);border-radius:16px;pointer-events:none;z-index:0;}
        .kpi::after{content:"";position:absolute;top:0;left:0;right:0;height:42%;background:linear-gradient(180deg,rgba(255,255,255,0.50) 0%,transparent 100%);border-radius:16px 16px 0 0;pointer-events:none;z-index:1;}
        .kpi>*{position:relative;z-index:2;}

        .bar-track{flex:1;height:9px;border-radius:10px;background:rgba(0,60,140,0.07);overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,60,140,0.08);}
        .bar-fill{height:100%;border-radius:10px;position:relative;overflow:hidden;transition:width 0.7s ease;}
        .bar-fill::after{content:"";position:absolute;width:40%;height:100%;left:-50%;top:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent);animation:shine 2.5s ease-in-out infinite;}

        .cult-chip{display:flex;align-items:center;gap:12px;border-radius:16px;padding:14px 16px;border:1.5px solid;cursor:default;position:relative;overflow:hidden;transition:all 0.18s ease;box-shadow:0 3px 12px rgba(0,0,0,0.07),inset 0 1px 0 rgba(255,255,255,0.7);}
        .cult-chip::before{content:"";position:absolute;top:0;left:0;right:0;height:50%;background:linear-gradient(180deg,rgba(255,255,255,0.40) 0%,transparent 100%);border-radius:14px 14px 0 0;pointer-events:none;}
        .cult-chip:hover{transform:translateY(-2px);}
        .cult-chip>*{position:relative;}

        .star{position:fixed;border-radius:50%;background:white;pointer-events:none;animation:twinkle var(--d,3s) ease-in-out infinite;animation-delay:var(--delay,0s);}

        .fade-in{animation:fadeIn 0.22s ease;}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
        input[type=date]::-webkit-calendar-picker-indicator{opacity:0.4}

        .num-big{font-size:36px;font-weight:800;color:#0D47A1;line-height:1;}
        .num-med{font-size:24px;font-weight:700;color:#0D47A1;line-height:1;}

        /* Sub-tabs dentro de Varios */
        .sub-tab{
          padding:8px 16px;border-radius:10px;font-size:12px;font-weight:700;
          cursor:pointer;transition:all 0.18s ease;white-space:nowrap;
          background:rgba(255,255,255,0.55);
          border:1.5px solid rgba(255,255,255,0.90);
          color:#1e3a5f;
          box-shadow:0 2px 8px rgba(20,80,160,0.10);
          position:relative;
        }
        .sub-tab.active{
          background-image:url('/AZUL.png');background-size:cover;background-position:center;
          border:1.5px solid rgba(100,180,255,0.45);
          color:white;font-weight:800;
          box-shadow:0 4px 14px rgba(25,118,210,0.40);
          text-shadow:0 1px 3px rgba(0,40,120,0.35);
        }
      `}</style>

      {/* ESTRELLAS */}
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
        {/* NAV PRINCIPAL */}
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

            <button onClick={()=>{setShowVincular(!showVincular);setForm({});}}
              style={{background:"none",border:"none",cursor:"pointer",color:"#1565c0",fontSize:14,fontWeight:700,textAlign:"left",display:"flex",alignItems:"center",gap:6,padding:"2px 0"}}>
              🔗 Vincular productor por código
            </button>

            {showVincular&&(
              <div className="card fade-in" style={{padding:14}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:"#0d2137"}}>🔗 Vincular por código</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Código *</label><input type="text" value={form.codigo??""} onChange={e=>setForm({...form,codigo:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="10001"/></div>
                  <div><label className={lCls}>Honorario</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className="sel" style={{width:"100%"}}><option value="mensual">U$S Mensual</option><option value="anual">U$S Anual</option><option value="kg_soja_ha">Kg Soja / Ha</option><option value="kg_cultivo_ha">Kg Cultivo / Ha</option><option value="porcentaje_rto">📊 % Rto</option><option value="otro">Otro</option></select></div>
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
                      <option value="mensual">U$S Mensual</option>
                      <option value="anual">U$S Anual</option>
                      <option value="kg_soja_ha">Kg Soja / Ha</option>
                      <option value="kg_cultivo_ha">Kg Cultivo / Ha</option>
                      <option value="porcentaje_rto">% del Rendimiento</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarProductor} className="bbtn">Guardar</button>
                  <button onClick={()=>{setShowForm(false);setEditProd(null);setForm({});}} className="abtn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button>
                </div>
              </div>
            )}

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
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div>
                <h2 style={{fontSize:18,fontWeight:800,color:"#0d2137",margin:0}}>Cobranza</h2>
                <p style={{fontSize:12,color:"#6b8aaa",margin:"2px 0 0"}}>1 acuerdo por productor por campaña · los pagos van descontando el saldo</p>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <select value={campanaFiltro} onChange={e=>setCampanaFiltro(e.target.value)}
                  className="inp" style={{padding:"7px 12px",fontSize:12,fontWeight:600,color:"#1565c0"}}>
                  <option value="todas">Todas las campañas</option>
                  {[...new Set(acuerdos.map((a:any)=>a.campana_nombre).filter(Boolean))].map((c:any)=>(
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button onClick={()=>{setShowAcuerdo(!showAcuerdo);setForm({});setAcuerdoSel(null);}} className="bbtn">
                  + Nuevo acuerdo
                </button>
              </div>
            </div>

            {showAcuerdo&&(
              <div className="card fade-in" style={{padding:16}}>
                <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:14}}>📋 Configurar acuerdo de honorario</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div>
                    <label className={lCls}>Productor</label>
                    <select value={form.prod_ac??""} onChange={e=>{
                      const prod=productores.find((p:any)=>p.id===e.target.value);
                      const eid=prod?.empresa_id??prod?.id;
                      const haP=lotes.filter((l:any)=>l.empresa_id===eid).reduce((a:number,l:any)=>a+(l.hectareas||0),0);
                      setForm({...form,prod_ac:e.target.value,hectareas_ac:String(haP)});
                    }} className="inp" style={{padding:"8px 12px"}}>
                      <option value="">Seleccioná...</option>
                      {productores.map((p:any)=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lCls}>Modalidad</label>
                    <select value={form.modalidad_ac??"usd_anual"} onChange={e=>setForm({...form,modalidad_ac:e.target.value})} className="inp" style={{padding:"8px 12px"}}>
                      <option value="usd_mensual">U$S Mensual (× 12 = total)</option>
                      <option value="usd_anual">U$S Anual / Campaña</option>
                      <option value="kg_soja_ha">Kg Soja / Ha</option>
                      <option value="kg_cultivo_ha">Kg Cultivo / Ha</option>
                      <option value="otro">Otro (manual)</option>
                    </select>
                  </div>

                  {form.modalidad_ac==="usd_mensual"&&(
                    <>
                      <div>
                        <label className={lCls}>Monto U$S / mes</label>
                        <input type="number" value={form.monto_ac??""} onChange={e=>setForm({...form,monto_ac:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="Ej: 200"/>
                      </div>
                      {form.monto_ac&&Number(form.monto_ac)>0&&(
                        <div style={{display:"flex",alignItems:"center",padding:"8px 14px",borderRadius:10,background:"rgba(25,118,210,0.07)",border:"1px solid rgba(25,118,210,0.15)"}}>
                          <span style={{fontSize:12,color:"#1565c0",fontWeight:700}}>Total anual: U$S {(Number(form.monto_ac)*12).toLocaleString("es-AR")}</span>
                        </div>
                      )}
                    </>
                  )}

                  {(form.modalidad_ac==="usd_anual"||form.modalidad_ac==="otro")&&(
                    <div>
                      <label className={lCls}>Monto U$S {form.modalidad_ac==="usd_anual"?"/ campaña":""}</label>
                      <input type="number" value={form.monto_ac??""} onChange={e=>setForm({...form,monto_ac:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="0"/>
                    </div>
                  )}

                  {form.modalidad_ac==="kg_soja_ha"&&(
                    <>
                      {form.prod_ac&&(()=>{
                        const eid=productores.find((p:any)=>p.id===form.prod_ac)?.empresa_id;
                        const haP=lotes.filter((l:any)=>l.empresa_id===eid).reduce((a:number,l:any)=>a+(l.hectareas||0),0);
                        return haP>0&&<div style={{gridColumn:"1/-1",padding:"8px 14px",borderRadius:10,background:"rgba(25,118,210,0.07)",border:"1px solid rgba(25,118,210,0.15)"}}>
                          <span style={{fontSize:12,color:"#1565c0",fontWeight:700}}>🌿 {haP} ha en campaña activa</span>
                        </div>;
                      })()}
                      <div>
                        <label className={lCls}>Kg soja / Ha</label>
                        <input type="number" step="0.5" value={form.kg_por_ha_ac??""} onChange={e=>{
                          const haP=Number(form.hectareas_ac||0);
                          setForm({...form,kg_por_ha_ac:e.target.value,kg_total_ac:String(Math.round(Number(e.target.value)*haP))});
                        }} className="inp" style={{padding:"8px 12px"}} placeholder="Ej: 50"/>
                      </div>
                      <div>
                        <label className={lCls}>Kg totales pactados</label>
                        <input type="number" value={form.kg_total_ac??""} onChange={e=>setForm({...form,kg_total_ac:e.target.value})} className="inp" style={{padding:"8px 12px",background:"rgba(240,248,255,0.80)"}}/>
                      </div>
                    </>
                  )}

                  {form.modalidad_ac==="kg_cultivo_ha"&&(
                    <>
                      {form.prod_ac&&(()=>{
                        const eid=productores.find((p:any)=>p.id===form.prod_ac)?.empresa_id;
                        const lotesP=lotes.filter((l:any)=>l.empresa_id===eid&&l.cultivo);
                        const cultivosGrp:Record<string,number>={};
                        lotesP.forEach((l:any)=>{const k=l.cultivo_completo||l.cultivo;cultivosGrp[k]=(cultivosGrp[k]||0)+(l.hectareas||0);});
                        return(
                          <div style={{gridColumn:"1/-1"}}>
                            <label className={lCls}>Kg / Ha por cultivo</label>
                            <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:4}}>
                              {Object.entries(cultivosGrp).map(([cult,ha]:any)=>(
                                <div key={cult} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",
                                  borderRadius:10,background:"rgba(255,255,255,0.65)",border:"1px solid rgba(180,210,240,0.50)"}}>
                                  <span style={{flex:1,fontSize:12,fontWeight:800,color:"#0d2137",textTransform:"uppercase"}}>{cult}</span>
                                  <span style={{fontSize:11,color:"#6b8aaa"}}>{ha} ha</span>
                                  <input type="number" step="0.5" value={form[`kg_ac_${cult}`]??""}
                                    onChange={e=>{
                                      const nf={...form,[`kg_ac_${cult}`]:e.target.value};
                                      let kgT=0;
                                      Object.entries(cultivosGrp).forEach(([c,h]:any)=>kgT+=Number(nf[`kg_ac_${c}`]||0)*h);
                                      nf.kg_total_ac=String(Math.round(kgT));
                                      setForm(nf);
                                    }}
                                    className="inp" style={{width:80,padding:"6px 10px",fontSize:12}} placeholder="kg/ha"/>
                                  <span style={{fontSize:11,color:"#4a6a8a",minWidth:65}}>= {Math.round(Number(form[`kg_ac_${cult}`]||0)*ha)} kg</span>
                                </div>
                              ))}
                              <div style={{padding:"8px 12px",borderRadius:10,background:"rgba(25,118,210,0.07)",
                                border:"1px solid rgba(25,118,210,0.15)",display:"flex",justifyContent:"space-between"}}>
                                <span style={{fontSize:12,fontWeight:700,color:"#1565c0"}}>Total kg pactados</span>
                                <span style={{fontSize:14,fontWeight:800,color:"#0D47A1"}}>{Number(form.kg_total_ac||0).toLocaleString("es-AR")} kg</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}

                  <div style={{gridColumn:"1/-1"}}>
                    <label className={lCls}>Concepto / Notas del acuerdo</label>
                    <input type="text" value={form.concepto_ac??""} onChange={e=>setForm({...form,concepto_ac:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="Ej: Honorario campaña 2025/2026 — 50 kg soja/ha..."/>
                  </div>
                </div>

                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button onClick={guardarAcuerdo} className="bbtn">✓ Guardar acuerdo</button>
                  {form.prod_ac&&<button onClick={()=>copiarAcuerdoAnterior(form.prod_ac)}
                    style={{padding:"10px 16px",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",
                      background:"rgba(255,255,255,0.75)",border:"1.5px solid rgba(255,255,255,0.95)",color:"#4a6a8a"}}>
                    📋 Copiar campaña anterior
                  </button>}
                  <button onClick={()=>{setShowAcuerdo(false);setForm({});}} style={{padding:"10px 16px",fontSize:13,borderRadius:12,fontWeight:600,cursor:"pointer",background:"rgba(255,255,255,0.70)",border:"1.5px solid rgba(255,255,255,0.95)",color:"#4a6a8a"}}>Cancelar</button>
                </div>
              </div>
            )}

            {showPago&&acuerdoSel&&(()=>{
              const saldo=calcularSaldo(acuerdoSel);
              const esKg=acuerdoSel.modalidad==="kg_soja_ha"||acuerdoSel.modalidad==="kg_cultivo_ha";
              const prod=productores.find((p:any)=>p.id===acuerdoSel.productor_id);
              return(
                <div className="card fade-in" style={{padding:16}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>💸 Registrar pago — {prod?.nombre}</div>
                      <div style={{fontSize:12,color:"#6b8aaa",marginTop:2}}>{acuerdoSel.concepto} · {acuerdoSel.campana_nombre}</div>
                    </div>
                    <div style={{padding:"8px 14px",borderRadius:12,background:saldo.completo?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.08)",
                      border:`1px solid ${saldo.completo?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}`}}>
                      <div style={{fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>Saldo restante</div>
                      <div style={{fontSize:16,fontWeight:800,color:saldo.completo?"#166534":"#dc2626"}}>
                        {esKg?`${saldo.kgRestante.toLocaleString("es-AR")} kg`:`U$S ${Math.round(saldo.usdRestante).toLocaleString("es-AR")}`}
                      </div>
                    </div>
                  </div>

                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                    <div>
                      <label className={lCls}>Fecha de pago</label>
                      <input type="date" value={form.pago_fecha??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,pago_fecha:e.target.value})} className="inp" style={{padding:"8px 12px"}}/>
                    </div>

                    {esKg?(
                      <>
                        <div>
                          <label className={lCls}>Kg a cobrar este pago</label>
                          <input type="number" value={form.pago_kg??""} onChange={e=>{
                            const kg=Number(e.target.value);
                            const precio=Number(form.pago_precio_soja||0);
                            const tc=Number(form.pago_tc||1);
                            const usd=Math.round(kg*precio);
                            setForm({...form,pago_kg:e.target.value,pago_usd:String(usd),pago_pesos:String(Math.round(usd*tc))});
                          }} className="inp" style={{padding:"8px 12px"}} placeholder={`Máx ${saldo.kgRestante} kg`}/>
                        </div>
                        <div>
                          <label className={lCls}>Precio soja hoy U$S/kg</label>
                          <input type="number" step="0.001" value={form.pago_precio_soja??""} onChange={e=>{
                            const precio=Number(e.target.value);
                            const kg=Number(form.pago_kg||0);
                            const tc=Number(form.pago_tc||1);
                            const usd=Math.round(kg*precio);
                            setForm({...form,pago_precio_soja:e.target.value,pago_usd:String(usd),pago_pesos:String(Math.round(usd*tc))});
                          }} className="inp" style={{padding:"8px 12px"}} placeholder="Ej: 0.240"/>
                        </div>
                      </>
                    ):(
                      <div>
                        <label className={lCls}>Monto U$S este pago</label>
                        <input type="number" value={form.pago_usd??""} onChange={e=>{
                          const usd=Number(e.target.value);
                          const tc=Number(form.pago_tc||1);
                          setForm({...form,pago_usd:e.target.value,pago_pesos:String(Math.round(usd*tc))});
                        }} className="inp" style={{padding:"8px 12px"}} placeholder={`Máx U$S ${Math.round(saldo.usdRestante)}`}/>
                      </div>
                    )}

                    <div>
                      <label className={lCls}>Tipo de cambio (hoy)</label>
                      <input type="number" step="1" value={form.pago_tc??""} onChange={e=>{
                        const tc=Number(e.target.value);
                        const usd=Number(form.pago_usd||0);
                        setForm({...form,pago_tc:e.target.value,pago_pesos:String(Math.round(usd*tc))});
                      }} className="inp" style={{padding:"8px 12px"}} placeholder="Ej: 1150"/>
                    </div>

                    {(form.pago_usd||form.pago_pesos)&&Number(form.pago_usd||0)>0&&(
                      <div style={{padding:"8px 14px",borderRadius:10,background:"rgba(25,118,210,0.07)",border:"1px solid rgba(25,118,210,0.15)",display:"flex",flexDirection:"column",gap:2}}>
                        <span style={{fontSize:12,fontWeight:700,color:"#1565c0"}}>
                          U$S {Number(form.pago_usd||0).toLocaleString("es-AR")}
                          {form.pago_tc&&<span style={{fontWeight:500,color:"#4a6a8a"}}> × ${Number(form.pago_tc).toLocaleString("es-AR")}</span>}
                        </span>
                        {form.pago_pesos&&Number(form.pago_pesos)>0&&(
                          <span style={{fontSize:14,fontWeight:800,color:"#0D47A1"}}>= ${Number(form.pago_pesos).toLocaleString("es-AR")}</span>
                        )}
                      </div>
                    )}

                    <div>
                      <label className={lCls}>Método de pago</label>
                      <select value={form.pago_metodo??""} onChange={e=>setForm({...form,pago_metodo:e.target.value})} className="inp" style={{padding:"8px 12px"}}>
                        <option value="">—</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="efectivo">Efectivo</option>
                        <option value="cheque">Cheque</option>
                        <option value="granos">Granos</option>
                      </select>
                    </div>
                    <div style={{gridColumn:"1/-1"}}>
                      <label className={lCls}>Observaciones</label>
                      <input type="text" value={form.pago_obs??""} onChange={e=>setForm({...form,pago_obs:e.target.value})} className="inp" style={{padding:"8px 12px"}} placeholder="Opcional..."/>
                    </div>
                  </div>

                  <div style={{display:"flex",gap:8}}>
                    <button onClick={registrarPago} className="bbtn">✓ Registrar pago</button>
                    <button onClick={()=>{setShowPago(false);setAcuerdoSel(null);setForm({});}} style={{padding:"10px 16px",fontSize:13,borderRadius:12,fontWeight:600,cursor:"pointer",background:"rgba(255,255,255,0.70)",border:"1.5px solid rgba(255,255,255,0.95)",color:"#4a6a8a"}}>Cancelar</button>
                  </div>
                </div>
              );
            })()}

            {acuerdos.filter((a:any)=>campanaFiltro==="todas"||a.campana_nombre===campanaFiltro).length===0?(
              <div className="card" style={{padding:"48px 20px",textAlign:"center"}}>
                <div style={{fontSize:40,opacity:0.12,marginBottom:12}}>📋</div>
                <p style={{color:"#6b8aaa",fontSize:14,marginBottom:12}}>Sin acuerdos configurados</p>
                <button onClick={()=>{setShowAcuerdo(true);setForm({});}} className="bbtn">+ Configurar primer acuerdo</button>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {acuerdos.filter((a:any)=>campanaFiltro==="todas"||a.campana_nombre===campanaFiltro).map((ac:any)=>{
                  const saldo=calcularSaldo(ac);
                  const esKg=ac.modalidad==="kg_soja_ha"||ac.modalidad==="kg_cultivo_ha";
                  const prod=productores.find((p:any)=>p.id===ac.productor_id);
                  const pagosAc=pagos.filter((p:any)=>p.acuerdo_id===ac.id);
                  const pct=esKg
                    ?(ac.kg_total>0?Math.min(100,Math.round((saldo.kgPagado/ac.kg_total)*100)):0)
                    :(ac.monto_total_usd>0?Math.min(100,Math.round((saldo.usdPagado/ac.monto_total_usd)*100)):0);
                  const MODAL_LABEL:Record<string,string>={usd_mensual:"U$S/mes",usd_anual:"U$S/campaña",kg_soja_ha:"Kg soja/ha",kg_cultivo_ha:"Kg cultivo/ha",otro:"Manual"};

                  return(
                    <div key={ac.id} className="card" style={{padding:0}}>
                      <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(0,60,140,0.08)",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                        <div style={{width:38,height:38,borderRadius:"50%",backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",
                          border:"2px solid rgba(180,220,255,0.80)",display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:15,fontWeight:800,color:"white",flexShrink:0,textShadow:"0 1px 3px rgba(0,40,120,0.40)"}}>
                          {prod?.nombre?.charAt(0)||"?"}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:800,color:"#0d2137"}}>{prod?.nombre||"—"}</div>
                          <div style={{fontSize:11,color:"#6b8aaa",marginTop:1,display:"flex",gap:8,flexWrap:"wrap"}}>
                            <span style={{fontWeight:700,color:"#1565c0"}}>{ac.campana_nombre}</span>
                            <span>{MODAL_LABEL[ac.modalidad]||ac.modalidad}</span>
                            {ac.concepto&&<span>· {ac.concepto}</span>}
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontSize:11,color:"#6b8aaa",fontWeight:600}}>Pactado</div>
                          <div style={{fontSize:14,fontWeight:800,color:"#0d2137"}}>
                            {esKg?`${ac.kg_total?.toLocaleString("es-AR")} kg`:`U$S ${ac.monto_total_usd?.toLocaleString("es-AR")}`}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:6,flexShrink:0}}>
                          <button onClick={()=>{setAcuerdoSel(ac);setShowPago(true);setShowAcuerdo(false);
                            setTimeout(()=>formCobRef.current?.scrollIntoView({behavior:"smooth",block:"center"}),100);}}
                            className="bbtn" style={{padding:"7px 12px",fontSize:12}}>+ Cobrar</button>
                          <button onClick={()=>{
                            setForm({prod_ac:ac.productor_id,modalidad_ac:ac.modalidad,
                              monto_ac:String(ac.modalidad==="usd_mensual"?ac.monto_total_usd/12:ac.monto_total_usd),
                              kg_total_ac:String(ac.kg_total),concepto_ac:ac.concepto,notas_ac:ac.notas});
                            setShowAcuerdo(true);setShowPago(false);}} style={{padding:"7px 12px",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",background:"rgba(255,255,255,0.70)",border:"1.5px solid rgba(255,255,255,0.95)",color:"#4a6a8a"}}>✏️</button>
                          <button onClick={async()=>{if(confirm("¿Eliminar acuerdo y sus pagos?")){const sb=getSB();await sb.from("ing_acuerdos").delete().eq("id",ac.id);await fetchAcuerdos(ingId);}}}
                            style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:16}}>✕</button>
                        </div>
                      </div>

                      <div style={{padding:"10px 14px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                          <div style={{display:"flex",gap:16}}>
                            <div style={{fontSize:11,color:"#6b8aaa"}}>
                              Cobrado: <strong style={{color:"#166534"}}>{esKg?`${saldo.kgPagado.toLocaleString("es-AR")} kg`:`U$S ${Math.round(saldo.usdPagado).toLocaleString("es-AR")}`}</strong>
                            </div>
                            <div style={{fontSize:11,color:"#6b8aaa"}}>
                              Saldo: <strong style={{color:saldo.completo?"#166534":"#dc2626"}}>{esKg?`${saldo.kgRestante.toLocaleString("es-AR")} kg`:`U$S ${Math.round(saldo.usdRestante).toLocaleString("es-AR")}`}</strong>
                            </div>
                          </div>
                          <span style={{fontSize:12,fontWeight:800,color:saldo.completo?"#166534":"#1565c0"}}>{pct}%</span>
                        </div>
                        <div style={{height:8,borderRadius:10,background:"rgba(0,60,140,0.08)",overflow:"hidden"}}>
                          <div style={{height:"100%",borderRadius:10,
                            background:saldo.completo?"linear-gradient(90deg,#22c55e,#4ade80)":"linear-gradient(90deg,#1976d2,#42a5f5)",
                            width:pct+"%",transition:"width 0.5s ease",position:"relative",overflow:"hidden"}}>
                            <div style={{position:"absolute",top:0,left:"-50%",width:"40%",height:"100%",
                              background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)",
                              animation:"shine 2.5s ease-in-out infinite"}}/>
                          </div>
                        </div>

                        {pagosAc.length>0&&(
                          <div style={{marginTop:10}}>
                            <div style={{fontSize:10,fontWeight:700,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>Pagos registrados</div>
                            <div style={{display:"flex",flexDirection:"column",gap:4}}>
                              {pagosAc.map((pg:any)=>(
                                <div key={pg.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",
                                  borderRadius:8,background:"rgba(255,255,255,0.55)",border:"1px solid rgba(255,255,255,0.85)"}}>
                                  <span style={{fontSize:11,color:"#6b8aaa",minWidth:75}}>{pg.fecha}</span>
                                  <span style={{fontSize:12,fontWeight:700,color:"#0D47A1",flex:1}}>
                                    {esKg?`${pg.kg_cantidad} kg → `:""}U$S {Number(pg.monto_usd||0).toLocaleString("es-AR")}
                                    {pg.tipo_cambio>1&&<span style={{fontWeight:500,color:"#4a6a8a"}}> · ${Math.round(pg.monto_pesos||0).toLocaleString("es-AR")}</span>}
                                  </span>
                                  {pg.metodo_pago&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:6,fontWeight:600,background:"rgba(25,118,210,0.08)",color:"#1565c0"}}>{pg.metodo_pago}</span>}
                                  <button onClick={async()=>{const sb=getSB();await sb.from("ing_pagos").delete().eq("id",pg.id);await fetchAcuerdos(ingId);}}
                                    style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:13}}>✕</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div ref={formCobRef}/>
          </div>
        )}

        {/* ══ VARIOS ══ */}
        {seccion==="varios"&&(
          <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:10}}>

            {/* Sub-tabs */}
            <div style={{display:"flex",gap:6,padding:"2px 0"}}>
              {[
                {k:"vehiculos", icon:"🚗", label:"Vehículos"},
                {k:"recetas",   icon:"📋", label:"Recetas"},
                {k:"notas",     icon:"📝", label:"Notas"},
              ].map(t=>(
                <button key={t.k}
                  onClick={()=>{setVariosTab(t.k as any);setShowForm(false);setForm({});setVehiculoSel(null);}}
                  className={`sub-tab${variosTab===t.k?" active":""}`}>
                  <span>{t.icon}</span> <span style={{marginLeft:4}}>{t.label}</span>
                </button>
              ))}
            </div>

            {/* ── Vehículos ── */}
            {variosTab==="vehiculos"&&(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                  <h2 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>Vehículos</h2>
                  {!vehiculoSel
                    ?<button onClick={()=>{setShowForm(true);setForm({});}} className="bbtn">+ Agregar</button>
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
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={guardarVeh} className="bbtn">Guardar</button>
                      <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button>
                    </div>
                  </div>
                )}

                {!vehiculoSel?(
                  vehiculos.length===0
                    ?<div className="card" style={{padding:"48px 20px",textAlign:"center"}}><div style={{fontSize:48,opacity:0.12,marginBottom:12}}>🚗</div><p style={{color:"#6b8aaa",fontSize:14}}>Sin vehículos</p></div>
                    :<div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {vehiculos.map((v:any)=>{
                        const sV=v.seguro_vencimiento&&new Date(v.seguro_vencimiento)<new Date();
                        const vV=v.vtv_vencimiento&&new Date(v.vtv_vencimiento)<new Date();
                        return(
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
                        );
                      })}
                    </div>
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
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={guardarService} className="bbtn">Guardar</button>
                          <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button>
                        </div>
                      </div>
                    )}
                    <div className="card" style={{overflow:"hidden",padding:0}}>
                      <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,60,140,0.07)",fontSize:13,fontWeight:700,color:"#0d2137"}}>🔧 Historial</div>
                      {servicios.length===0
                        ?<div style={{textAlign:"center",padding:"32px 20px",color:"#6b8aaa",fontSize:13}}>Sin historial</div>
                        :<div style={{overflowX:"auto"}}><table style={{width:"100%",fontSize:12,minWidth:440,borderCollapse:"collapse"}}>
                          <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.07)"}}>{["Fecha","Tipo","Descripción","Km","Costo",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:600,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                          <tbody>{servicios.map(s=><tr key={s.id} style={{borderBottom:"1px solid rgba(0,60,140,0.05)"}}><td style={{padding:"9px 12px",color:"#6b8aaa",fontSize:11}}>{s.fecha}</td><td style={{padding:"9px 12px"}}><span style={{fontSize:10,padding:"3px 7px",borderRadius:6,fontWeight:700,background:"rgba(251,191,36,0.12)",color:"#f57f17"}}>{s.tipo}</span></td><td style={{padding:"9px 12px",color:"#4a6a8a",fontSize:11}}>{s.descripcion}</td><td style={{padding:"9px 12px",color:"#6b8aaa",fontSize:11}}>{s.km?(s.km.toLocaleString()+" km"):"—"}</td><td style={{padding:"9px 12px",fontWeight:700,color:"#dc2626",fontSize:12}}>${Number(s.costo).toLocaleString("es-AR")}</td><td style={{padding:"9px 12px"}}><button onClick={async()=>{const sb=getSB();await sb.from("ing_vehiculo_service").delete().eq("id",s.id);const sb2=getSB();const{data}=await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id",vehiculoSel!.id).order("fecha",{ascending:false});setServicios(data??[]);}} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:15}}>✕</button></td></tr>)}</tbody>
                        </table></div>
                      }
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Recetas ── */}
            {variosTab==="recetas"&&<SeccionRecetas ingId={ingId} productores={productores} iCls={iCls} lCls={lCls} m={m}/>}

            {/* ── Notas ── */}
            {variosTab==="notas"&&<SeccionNotas ingId={ingId} productores={productores} iCls={iCls} lCls={lCls} m={m}/>}

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
{ingEmpresaId && ingId && (
  <ChatFlotante
    empresaId={ingEmpresaId}
    usuarioId={ingId}
    usuarioNombre={ingNombre}
    usuarioRol="ingeniero"
  />
)}
      {/* Botón IA flotante */}
      <button onClick={()=>{setAiPanel(!aiPanel);if(!aiPanel)setVozPanel(false);}}
        style={{position:"fixed",bottom:80,right:16,zIndex:40,width:52,height:52,borderRadius:"50%",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,cursor:"pointer",
          background:aiPanel?"linear-gradient(145deg,#43a047,#1b5e20)":"linear-gradient(145deg,#2e7d32,#43a047)",
          color:"white",border:`2px solid ${aiPanel?"rgba(134,239,172,0.6)":"rgba(255,255,255,0.7)"}`,
          boxShadow:"0 4px 16px rgba(46,125,50,0.40)",transition:"all 0.2s ease"}}>
        🌾
      </button>

      {/* Botón VOZ flotante */}
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
