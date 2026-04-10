"use client";
// @ts-nocheck
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const getSB = async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
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
      const sb = await getSB();
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
    const sb = await getSB();
    const { data: prods } = await sb.from("ing_productores").select("*").eq("ingeniero_id", iid).eq("activo", true).order("nombre");
    setProductores(prods ?? []);
    const cpMap: Record<string,any[]> = {};
    const csMap: Record<string,string> = {};
    const lotesAll: LoteResumen[] = [];

    for (const p of (prods ?? [])) {
      if (!p.empresa_id) continue;
      const eid = p.empresa_id;

      // 1. Traer campañas ordenadas por año DESC
      const { data: camps } = await sb.from("campanas")
        .select("id,nombre,activa,año_inicio,año_fin")
        .eq("empresa_id", eid)
        .order("año_inicio", { ascending: false });
      const campList: any[] = (camps ?? []) as any[];
      cpMap[eid] = campList;

      // 2. Elegir campaña: marcada activa > más reciente
      const campSel = campList.find((c:any) => c.activa) ?? campList[0] ?? null;

      if (campSel) {
        // Tiene campaña — traer SOLO lotes de esa campaña
        csMap[eid] = campSel.id;
        const { data: ls } = await sb.from("lotes")
          .select("id,nombre,hectareas,cultivo,cultivo_completo,estado")
          .eq("empresa_id", eid)
          .eq("campana_id", campSel.id)
          .eq("es_segundo_cultivo", false);
        (ls ?? []).forEach((l:any) => lotesAll.push({...l, productor_nombre: p.nombre, empresa_id: eid}));
      } else {
        // Sin campañas — traer lotes más recientes (una sola query, sin duplicar)
        const { data: ls } = await sb.from("lotes")
          .select("id,nombre,hectareas,cultivo,cultivo_completo,estado,campana_id")
          .eq("empresa_id", eid)
          .eq("es_segundo_cultivo", false)
          .order("created_at", { ascending: false })
          .limit(200);
        // Agrupar por campana_id y tomar solo la más reciente
        const campIdMasReciente = (ls ?? [])[0]?.campana_id ?? null;
        const lotesFiltrados = campIdMasReciente
          ? (ls ?? []).filter((l:any) => l.campana_id === campIdMasReciente)
          : (ls ?? []);
        lotesFiltrados.forEach((l:any) => lotesAll.push({...l, productor_nombre: p.nombre, empresa_id: eid}));
      }
    }
    setCampanasPorProd(cpMap);
    setCampSelProd(csMap);
    setLotes(lotesAll);
  };

  const cambiarCampana = async (eid: string, campana_id: string, prod_nombre: string) => {
    setCampSelProd(prev => ({...prev, [eid]: campana_id}));
    const sb = await getSB();
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
    const sb = await getSB();
    const parts = nombre.split("/");
    const anioInicio = Number(parts[0]) || new Date().getFullYear();
    const anioFin = Number(parts[1]) || anioInicio + 1;
    await sb.from("campanas").update({ activa: false }).eq("empresa_id", eid);
    const { data: nueva } = await sb.from("campanas").insert({ empresa_id: eid, nombre, año_inicio: anioInicio, año_fin: anioFin, activa: true }).select().single();
    if (nueva) { setCampanasPorProd(prev => ({ ...prev, [eid]: [nueva, ...(prev[eid] ?? [])] })); setCampSelProd(prev => ({ ...prev, [eid]: nueva.id })); m("✅ Campaña creada"); }
  };

  const fetchCobs = async (iid: string) => { try { const sb=await getSB(); const{data}=await sb.from("ing_cobranzas").select("*").eq("ingeniero_id",iid).order("fecha",{ascending:false}); setCobranzas(data??[]); } catch {} };

  const fetchVehs = async (iid: string) => {
    try {
      const sb=await getSB(); const{data}=await sb.from("ing_vehiculos").select("*").eq("ingeniero_id",iid); setVehiculos(data??[]);
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
    const sb = await getSB();
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
    const sb = await getSB();
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
    const sb=await getSB();
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

  const eliminarProd = async (id:string) => { if(!confirm("¿Eliminar?"))return; const sb=await getSB(); await sb.from("ing_productores").update({activo:false}).eq("id",id); await fetchProds(ingId); };

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
    if(!ingId)return; const sb=await getSB();
    await sb.from("ing_cobranzas").insert({ingeniero_id:ingId,productor_id:form.prod_c||null,concepto:form.concepto??"",monto:Number(form.monto??0),fecha:form.fecha_c??new Date().toISOString().split("T")[0],estado:form.estado??"pendiente",metodo_pago:form.metodo??""});
    await fetchCobs(ingId); setShowForm(false); setForm({}); m("✅ Cobro registrado");
  };
  const marcarCobrado = async (id:string) => { const sb=await getSB(); await sb.from("ing_cobranzas").update({estado:"cobrado"}).eq("id",id); await fetchCobs(ingId); };

  const guardarVeh = async () => {
    if(!ingId||!form.nombre?.trim())return; const sb=await getSB();
    await sb.from("ing_vehiculos").insert({ingeniero_id:ingId,nombre:form.nombre,marca:form.marca??"",modelo:form.modelo??"",anio:Number(form.anio??0),patente:form.patente??"",seguro_vencimiento:form.seg_venc||null,seguro_compania:form.seg_comp??"",vtv_vencimiento:form.vtv_venc||null,km_actuales:Number(form.km??0),proximo_service_km:Number(form.prox_km??0)});
    await fetchVehs(ingId); setShowForm(false); setForm({}); m("✅ Vehículo guardado");
  };

  const guardarService = async () => {
    if(!vehiculoSel||!ingId)return; const sb=await getSB();
    await sb.from("ing_vehiculo_service").insert({vehiculo_id:vehiculoSel.id,ingeniero_id:ingId,tipo:form.tipo_s??"service",descripcion:form.desc_s??"",costo:Number(form.costo_s??0),km:Number(form.km_s??0),fecha:form.fecha_s??new Date().toISOString().split("T")[0],taller:form.taller??""});
    const sb2=await getSB();const{data}=await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id",vehiculoSel.id).order("fecha",{ascending:false});
    setServicios(data??[]); setShowForm(false); setForm({}); m("✅ Service guardado");
  };

  const exportXLS = async (tipo:"productores"|"lotes") => {
    const XLSX=await import("xlsx"); let data:any[]=[];
    if(tipo==="productores")data=productores.map(p=>({NOMBRE:p.nombre,TEL:p.telefono,HA:lotes.filter(l=>l.productor_nombre===p.nombre).reduce((a,l)=>a+(l.hectareas||0),0),HONORARIO:p.honorario_monto,APP:p.tiene_cuenta?"SI":"NO"}));
    else{let lf=lotes;if(fCultivo!=="todos")lf=lf.filter(l=>(l.cultivo_completo||l.cultivo)===fCultivo);if(fProductor!=="todos")lf=lf.filter(l=>l.productor_nombre===fProductor);if(fEstado!=="todos")lf=lf.filter(l=>l.estado===fEstado);data=lf.map(l=>({PRODUCTOR:l.productor_nombre,LOTE:l.nombre,HA:l.hectareas,CULTIVO:l.cultivo_completo||l.cultivo,ESTADO:l.estado}));}
    const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,tipo);XLSX.writeFile(wb,tipo+"_"+new Date().toISOString().slice(0,10)+".xlsx");
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
    const sb=await getSB();let c=0;
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
  const iCls = "gi w-full px-3 py-2.5 text-gray-800 text-sm";
  const lCls = "gi-label";
  const cardCls = "gc";

  // Selector cultivo con libre
  const SelectorCultivo = ({value, onChange}:{value:string,onChange:(v:string)=>void}) => {
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
        }} className={iCls}>
          <option value="">Sin cultivo</option>
          {grupos.map(g=>(
            <optgroup key={g} label={g}>
              {CULTIVOS.filter(c=>c.grupo===g).map(c=>(
                <option key={c.key} value={c.libre?"__libre__":c.key}>{c.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {showLibre&&<input type="text" value={libreTexto} onChange={e=>{setLibreTexto(e.target.value);onChange("__libre__:"+e.target.value);}} className={iCls} placeholder="Escribí el cultivo (ej: Alfalfa, Rye grass...)"/>}
      </div>
    );
  };



  if(loading) return (
    <div style={{minHeight:"100vh",background:"radial-gradient(ellipse at 30% 20%,#1a6fcf 0%,#0d47a1 40%,#063080 100%)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
        <div style={{width:40,height:40,border:"3px solid rgba(255,255,255,0.8)",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"rgba(255,255,255,0.8)",fontWeight:600,fontSize:14}}>Cargando AgroGestión PRO...</span>
      </div>
    </div>
  );

  // Ícono por cultivo para la sección distribución
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

  const cultivoBarClass = (label:string) => {
    const l = label.toLowerCase();
    if(l.includes("soja")) return "bar-fill bar-soja";
    if(l.includes("maíz")||l.includes("maiz")) return "bar-fill bar-maiz";
    if(l.includes("trigo")) return "bar-fill bar-trigo";
    if(l.includes("girasol")) return "bar-fill bar-girasol";
    if(l.includes("sorgo")) return "bar-fill bar-sorgo";
    if(l.includes("cebada")) return "bar-fill bar-cebada";
    if(l.includes("arveja")) return "bar-fill bar-arveja";
    return "bar-fill bar-default";
  };

  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",position:"relative",overflow:"hidden",
      background:"#c8e8f8"}}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes sweep{0%{left:-60%}100%{left:150%}}

        /* ── CRISTAL CLARO (fondo blanco translúcido) ── */
        .gc{
          position:relative;overflow:hidden;
          background:linear-gradient(160deg,rgba(255,255,255,0.72) 0%,rgba(255,255,255,0.50) 55%,rgba(220,240,255,0.55) 100%);
          backdrop-filter:blur(20px) saturate(140%);
          -webkit-backdrop-filter:blur(20px) saturate(140%);
          border:1px solid rgba(255,255,255,0.80);
          border-top:1.5px solid rgba(255,255,255,0.95);
          box-shadow:
            0 8px 32px rgba(30,100,180,0.12),
            0 2px 8px rgba(0,0,0,0.06),
            inset 0 2px 0 rgba(255,255,255,0.95),
            inset 0 -1px 0 rgba(255,255,255,0.40);
          border-radius:18px;
          color:#1a2a4a;
        }
        .gc::before{
          content:"";position:absolute;top:0;left:0;right:0;height:50%;
          background:linear-gradient(180deg,rgba(255,255,255,0.45) 0%,transparent 100%);
          border-radius:18px 18px 0 0;pointer-events:none;z-index:0;
        }
        .gc::after{
          content:"";position:absolute;top:-40%;left:-60%;width:30%;height:180%;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent);
          transform:skewX(-15deg);animation:sweep 9s ease-in-out infinite;
          pointer-events:none;z-index:0;
        }
        .gc>*{position:relative;z-index:1;}

        /* Cristal interior — aún más blanco */
        .gc-inner{
          position:relative;overflow:hidden;
          background:linear-gradient(155deg,rgba(255,255,255,0.65) 0%,rgba(230,245,255,0.50) 100%);
          backdrop-filter:blur(14px);
          -webkit-backdrop-filter:blur(14px);
          border:1px solid rgba(255,255,255,0.75);
          border-top:1.5px solid rgba(255,255,255,0.95);
          box-shadow:0 4px 16px rgba(30,100,180,0.10),inset 0 2px 0 rgba(255,255,255,0.90);
          border-radius:14px;
          color:#1a2a4a;
        }
        .gc-inner::before{
          content:"";position:absolute;top:0;left:0;right:0;height:50%;
          background:linear-gradient(180deg,rgba(255,255,255,0.40) 0%,transparent 100%);
          border-radius:14px 14px 0 0;pointer-events:none;
        }
        .gc-inner>*{position:relative;}

        /* ── MARCO PRINCIPAL ── */
        .main-frame{
          background:linear-gradient(155deg,rgba(255,255,255,0.60) 0%,rgba(210,235,255,0.42) 100%);
          backdrop-filter:blur(24px) saturate(150%);
          -webkit-backdrop-filter:blur(24px) saturate(150%);
          border:1.5px solid rgba(255,255,255,0.75);
          border-top:2px solid rgba(255,255,255,0.95);
          border-radius:26px;
          box-shadow:
            0 20px 60px rgba(20,80,160,0.18),
            0 1px 0 rgba(255,255,255,0.95) inset,
            inset 0 0 40px rgba(200,230,255,0.15);
          overflow:hidden;position:relative;
        }
        .main-frame::before{
          content:"";position:absolute;top:0;left:0;right:0;height:35%;
          background:linear-gradient(180deg,rgba(255,255,255,0.30) 0%,transparent 100%);
          pointer-events:none;z-index:0;
        }
        .main-frame>*{position:relative;z-index:1;}

        /* ── TOPBAR ── */
        .topbar-frame{
          background:linear-gradient(180deg,rgba(255,255,255,0.65) 0%,rgba(255,255,255,0.45) 100%);
          border-bottom:1px solid rgba(255,255,255,0.55);
          padding:14px 18px;
          display:flex;align-items:center;justify-content:space-between;
        }

        /* ── NAV TABS ── */
        .nav-tab{
          position:relative;overflow:hidden;
          padding:9px 16px;border-radius:12px;
          font-size:13px;font-weight:600;
          cursor:pointer;transition:all 0.2s ease;
          border:1px solid rgba(255,255,255,0.65);
          background:rgba(255,255,255,0.50);
          color:#1e3a5f;
          white-space:nowrap;
          box-shadow:0 2px 8px rgba(0,60,140,0.08),inset 0 1px 0 rgba(255,255,255,0.9);
        }
        .nav-tab:hover{background:rgba(255,255,255,0.72);color:#0d47a1;}
        .nav-tab.active{
          background:linear-gradient(145deg,#1565c0,#0d47a1);
          border:1px solid rgba(100,160,255,0.45);
          border-top:1px solid rgba(150,200,255,0.55);
          color:white !important;
          box-shadow:0 4px 16px rgba(13,71,161,0.40),inset 0 1px 0 rgba(255,255,255,0.22);
        }

        /* ── BOTONES ACCION ── */
        .action-btn{
          position:relative;overflow:hidden;
          background:linear-gradient(155deg,rgba(255,255,255,0.72) 0%,rgba(225,242,255,0.55) 100%);
          border:1px solid rgba(255,255,255,0.80);
          border-top:1.5px solid rgba(255,255,255,0.98);
          border-radius:14px;
          padding:12px 16px;
          color:#1e3a5f;font-weight:700;font-size:13px;
          cursor:pointer;
          box-shadow:0 4px 14px rgba(20,80,160,0.10),inset 0 2px 0 rgba(255,255,255,0.95);
          transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);
          display:flex;align-items:center;justify-content:center;gap:7px;
        }
        .action-btn::after{
          content:"";position:absolute;top:-30%;left:-70%;width:40%;height:160%;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent);
          transform:skewX(-20deg);transition:left 0.5s ease;
        }
        .action-btn:hover{transform:translateY(-2px);background:rgba(255,255,255,0.90);box-shadow:0 8px 24px rgba(20,80,160,0.16);}
        .action-btn:hover::after{left:150%;}
        .action-btn:active{transform:scale(0.97);}

        /* ── BOTÓN AZUL SÓLIDO ── */
        .btn-solid{
          background:linear-gradient(145deg,#2196f3,#1565c0);
          border:1px solid rgba(100,160,255,0.4);
          border-top:1px solid rgba(160,210,255,0.6);
          border-radius:14px;
          color:white;font-weight:700;font-size:13px;
          padding:10px 18px;cursor:pointer;
          box-shadow:0 4px 16px rgba(21,101,192,0.40),inset 0 1px 0 rgba(255,255,255,0.25);
          transition:all 0.2s ease;
        }
        .btn-solid:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(21,101,192,0.55);}
        .btn-solid:active{transform:scale(0.97);}

        /* ── INPUT ── */
        .gi{
          background:rgba(255,255,255,0.65);
          border:1px solid rgba(180,210,240,0.60);
          border-top:1px solid rgba(255,255,255,0.90);
          border-radius:12px;color:#1e3a5f;
          box-shadow:inset 0 2px 4px rgba(0,60,140,0.05),inset 0 1px 0 rgba(255,255,255,0.8);
          transition:all 0.2s ease;
        }
        .gi::placeholder{color:rgba(80,120,160,0.55);}
        .gi:focus{background:rgba(255,255,255,0.90);border-color:rgba(25,118,210,0.45);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.12);}
        .gi option{background:white;color:#1e3a5f;}

        /* ── KPI CARD ── */
        .kpi-card{
          position:relative;overflow:hidden;
          background:linear-gradient(155deg,rgba(255,255,255,0.75) 0%,rgba(220,240,255,0.55) 100%);
          border:1px solid rgba(255,255,255,0.80);
          border-top:1.5px solid rgba(255,255,255,0.98);
          border-radius:14px;
          box-shadow:0 4px 16px rgba(20,80,160,0.10),inset 0 2px 0 rgba(255,255,255,0.95);
          padding:16px;text-align:center;color:#1a2a4a;
        }
        .kpi-card::before{
          content:"";position:absolute;top:0;left:0;right:0;height:50%;
          background:linear-gradient(180deg,rgba(255,255,255,0.50) 0%,transparent 100%);
          border-radius:14px 14px 0 0;pointer-events:none;
        }
        .kpi-card>*{position:relative;}

        /* ── CHIP CULTIVO ── */
        .cult-chip{
          display:flex;align-items:center;justify-content:center;gap:6px;
          border-radius:14px;padding:10px 14px;font-size:13px;font-weight:700;
          border:1px solid rgba(255,255,255,0.65);
          box-shadow:inset 0 1px 0 rgba(255,255,255,0.80),0 2px 8px rgba(0,0,0,0.06);
          position:relative;overflow:hidden;color:#1a2a4a;
        }
        .cult-chip::before{
          content:"";position:absolute;top:0;left:0;right:0;height:50%;
          background:linear-gradient(180deg,rgba(255,255,255,0.45) 0%,transparent 100%);
          border-radius:14px 14px 0 0;
        }

        /* ── BTN MIS LOTES ── */
        .btn-mislotes{
          width:100%;padding:14px 20px;
          background:linear-gradient(155deg,rgba(255,255,255,0.68) 0%,rgba(210,235,255,0.50) 100%);
          border:1px solid rgba(255,255,255,0.80);
          border-top:1.5px solid rgba(255,255,255,0.98);
          border-radius:16px;color:#0d47a1;
          font-size:15px;font-weight:700;
          display:flex;align-items:center;justify-content:center;gap:10px;
          cursor:pointer;
          box-shadow:0 4px 16px rgba(20,80,160,0.12),inset 0 2px 0 rgba(255,255,255,0.95);
          transition:all 0.22s cubic-bezier(0.34,1.56,0.64,1);
          position:relative;overflow:hidden;
        }
        .btn-mislotes::before{
          content:"";position:absolute;top:0;left:0;right:0;height:50%;
          background:linear-gradient(180deg,rgba(255,255,255,0.40) 0%,transparent 100%);
          border-radius:16px 16px 0 0;
        }
        .btn-mislotes:hover{transform:translateY(-2px);background:rgba(255,255,255,0.88);box-shadow:0 8px 24px rgba(20,80,160,0.18);}
        .btn-mislotes>*{position:relative;}

        /* ── PROD CARD ── */
        .prod-card{transition:all 0.22s cubic-bezier(0.34,1.56,0.64,1);}
        .prod-card:hover{transform:translateY(-3px);box-shadow:0 16px 40px rgba(20,80,160,0.16) !important;}

        /* ── MISC ── */
        .fade-in{animation:fadeIn 0.25s ease;}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.25);border-radius:3px}
        input[type=date]::-webkit-calendar-picker-indicator{opacity:0.5}
        select option{background:white;color:#1e3a5f;}

        /* ── COLORES CULTIVOS PRO ── */
        .bar-soja{background:linear-gradient(90deg,#4CAF50,#81C784);}
        .bar-maiz{background:linear-gradient(90deg,#FB8C00,#FFB74D);}
        .bar-trigo{background:linear-gradient(90deg,#D4A373,#E6C79C);}
        .bar-girasol{background:linear-gradient(90deg,#FBC02D,#FFE082);}
        .bar-sorgo{background:linear-gradient(90deg,#E53935,#EF9A9A);}
        .bar-cebada{background:linear-gradient(90deg,#7B1FA2,#CE93D8);}
        .bar-arveja{background:linear-gradient(90deg,#00897B,#80CBC4);}
        .bar-default{background:linear-gradient(90deg,#1976D2,#64B5F6);}

        /* ── BRILLO CORRIENDO EN BARRAS ── */
        @keyframes shine{0%{left:-40%}100%{left:120%}}
        .bar-fill{
          height:100%;border-radius:10px;
          position:relative;overflow:hidden;
        }
        .bar-fill::after{
          content:"";position:absolute;
          width:40%;height:100%;left:-40%;top:0;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,0.52),transparent);
          animation:shine 2.5s ease-in-out infinite;
        }

        /* ── NÚMERO GRANDE ESTILO PRO ── */
        .num-pro{
          font-size:32px;font-weight:700;color:#0D47A1;line-height:1;
        }
        .num-med{
          font-size:22px;font-weight:700;color:#0D47A1;line-height:1;
        }
`}</style>

      {/* FONDO CELESTE CON DESTELLOS CRISTAL */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
        {/* Gradiente base celeste */}
        <div style={{position:"absolute",inset:0,background:"linear-gradient(160deg,#e0f4ff 0%,#b8e0f7 25%,#7ec8e3 55%,#4aa8d4 80%,#2980b9 100%)"}}/>
        {/* Imagen de fondo si existe */}
        <div style={{position:"absolute",inset:0,backgroundImage:"url('/bg-ingeniero.jpg')",backgroundSize:"cover",backgroundPosition:"center",opacity:0.4}}/>
        {/* Destello central brillante */}
        <div style={{position:"absolute",top:"15%",left:"50%",transform:"translateX(-50%)",width:"70%",height:"55%",background:"radial-gradient(ellipse,rgba(255,255,255,0.55) 0%,rgba(200,235,255,0.25) 40%,transparent 70%)",filter:"blur(18px)"}}/>
        {/* Destello superior izquierdo */}
        <div style={{position:"absolute",top:"-5%",left:"-5%",width:"50%",height:"45%",background:"radial-gradient(ellipse,rgba(255,255,255,0.40) 0%,rgba(174,214,241,0.20) 50%,transparent 75%)",filter:"blur(24px)"}}/>
        {/* Destello inferior derecho */}
        <div style={{position:"absolute",bottom:"5%",right:"-5%",width:"45%",height:"45%",background:"radial-gradient(ellipse,rgba(255,255,255,0.30) 0%,rgba(133,193,233,0.20) 50%,transparent 75%)",filter:"blur(28px)"}}/>
        {/* Rayos de luz diagonales */}
        <div style={{position:"absolute",inset:0,background:"linear-gradient(120deg,transparent 30%,rgba(255,255,255,0.18) 45%,rgba(255,255,255,0.08) 50%,transparent 65%)"}}/>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(240deg,transparent 35%,rgba(255,255,255,0.12) 48%,transparent 60%)"}}/>
        {/* Partículas de luz (destellos) */}
        {[[12,18,8],[80,35,5],[45,65,7],[70,20,4],[25,45,6],[90,70,5],[55,85,7],[15,75,4],[85,50,6]].map(([x,y,r],i)=>(
          <div key={i} style={{position:"absolute",left:x+"%",top:y+"%",width:r*2+"px",height:r*2+"px",borderRadius:"50%",background:"radial-gradient(circle,rgba(255,255,255,0.9) 0%,rgba(255,255,255,0) 70%)",filter:"blur(1px)"}}/>
        ))}
      </div>

      <div style={{position:"relative",zIndex:1,maxWidth:520,margin:"0 auto",padding:"16px 14px 80px"}}>

        {/* ══ MARCO PRINCIPAL ══ */}
        <div className="main-frame">

          {/* TOPBAR */}
          <div className="topbar-frame">
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <Image src="/logo.png" alt="AgroGestión PRO" width={36} height={36} className="object-contain" style={{borderRadius:10}}/>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:18,fontWeight:800,color:"#1a2a4a"}}>AgroGestión</span>
                  <span style={{fontSize:10,fontWeight:700,background:"linear-gradient(135deg,#42a5f5,#1565c0)",borderRadius:5,padding:"2px 7px",color:"white",letterSpacing:1}}>PRO</span>
                </div>
                <div style={{fontSize:11,color:"#4a6a8a",marginTop:1,fontWeight:500}}>Gestión inteligente. Decisiones que rinden.</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#1976d2,#0d47a1)",border:"2px solid rgba(255,255,255,0.9)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"white",boxShadow:"0 2px 10px rgba(21,101,192,0.4)"}}>
                {ingNombre.charAt(0)||"M"}
              </div>
              <button onClick={async()=>{const sb=await getSB();await sb.auth.signOut();window.location.href="/login";}}
                style={{display:"flex",alignItems:"center",gap:5,color:"#1e3a5f",fontSize:13,fontWeight:600,background:"none",border:"none",cursor:"pointer"}}>
                Salir <span style={{fontSize:16}}>⎋</span>
              </button>
            </div>
          </div>

          {/* NAV TABS */}
          <div style={{display:"flex",gap:6,padding:"10px 14px",overflowX:"auto",scrollbarWidth:"none"}}>
            {NAV.map(item=>(
              <button key={item.k}
                onClick={()=>{setSeccion(item.k as Seccion);setShowForm(false);setForm({});setVehiculoSel(null);}}
                className={`nav-tab${seccion===item.k?" active":""}`}
                style={{display:"flex",alignItems:"center",gap:5}}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
                {seccion===item.k&&<span style={{width:5,height:5,borderRadius:"50%",background:"white",opacity:0.8,marginLeft:2}}/>}
              </button>
            ))}
          </div>

          {/* CONTENIDO */}
          <div style={{padding:"0 14px 14px"}}>

            {/* Toast */}
            {msj&&<div className="fade-in gc-inner" style={{marginBottom:12,padding:"10px 14px",fontSize:13,fontWeight:600,color:msj.startsWith("✅")?"#a5f3a5":"#fca5a5",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              {msj}<button onClick={()=>setMsj("")} style={{background:"none",border:"none",color:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:16}}>✕</button>
            </div>}

            {/* ══ GENERAL ══ */}
            {seccion==="general"&&(
              <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:10}}>
                {/* KPIs 2x2 */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[
                    {l:"Productores",v:productores.length,icon:"👨‍🌾"},
                    {l:"Hectáreas",v:totalHa.toLocaleString("es-AR")+" ha",icon:"🌿"},
                    {l:"Lotes",v:lotes.length,icon:"🗺️"},
                    {l:"Con App",v:productores.filter(p=>p.tiene_cuenta).length,icon:"📱"},
                  ].map(s=>(
                    <div key={s.l} className="kpi-card">
                      <div style={{fontSize:20,marginBottom:4}}>{s.icon}</div>
                      <div className="num-pro">{s.v}</div>
                      <div style={{fontSize:11,color:"#4a6a8a",marginTop:3,fontWeight:600}}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Distribución de cultivos */}
                {haPorCultivo.length>0&&(
                  <div className="gc" style={{padding:16}}>
                    <div style={{fontSize:11,fontWeight:700,letterSpacing:1.2,color:"#4a6a8a",textTransform:"uppercase",marginBottom:12}}>Distribución de Cultivos</div>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {haPorCultivo.map((d,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                          <span style={{fontSize:16,width:22,textAlign:"center",flexShrink:0}}>{cultivoIcono(d.name)}</span>
                          <div style={{width:80,fontSize:12,fontWeight:600,color:"#1e3a5f",flexShrink:0}}>{d.name}</div>
                          <div style={{flex:1,height:9,borderRadius:10,background:"rgba(0,60,140,0.08)",overflow:"hidden",boxShadow:"inset 0 1px 3px rgba(0,60,140,0.08)"}}>
                            <div className={cultivoBarClass(d.name)} style={{width:totalHa>0?(d.ha/totalHa*100)+"%":"0%",transition:"width 0.7s ease"}}/>
                          </div>
                          <div style={{width:32,textAlign:"right",fontSize:12,fontWeight:700,color:d.color,filter:"brightness(0.75)",flexShrink:0}}>
                            {totalHa>0?Math.round(d.ha/totalHa*100):0}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chips cultivos */}
                {haPorCultivo.length>0&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {haPorCultivo.slice(0,4).map((d,i)=>(
                      <div key={i} className="cult-chip" style={{background:`linear-gradient(145deg,${d.color}20,${d.color}08)`,border:`1px solid ${d.color}35`,color:"#1a2a4a"}}>
                        <span style={{fontSize:18}}>{cultivoIcono(d.name)}</span>
                        <span style={{fontSize:13,fontWeight:700,color:"#1a2a4a"}}>{d.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cobranza */}
                <div className="gc" style={{padding:16}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:1.2,color:"#4a6a8a",textTransform:"uppercase",marginBottom:12}}>💰 Cobranza</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div className="kpi-card" style={{background:"linear-gradient(145deg,rgba(255,100,100,0.25),rgba(255,100,100,0.08))"}}>
                      <div style={{fontSize:11,fontWeight:700,opacity:0.7,marginBottom:4}}>Pendiente</div>
                      <div style={{fontSize:20,fontWeight:800,color:"#ff8a8a"}}>${totPend.toLocaleString("es-AR")}</div>
                    </div>
                    <div className="kpi-card" style={{background:"linear-gradient(145deg,rgba(100,255,130,0.22),rgba(100,255,130,0.08))"}}>
                      <div style={{fontSize:11,fontWeight:700,opacity:0.7,marginBottom:4}}>Cobrado</div>
                      <div style={{fontSize:20,fontWeight:800,color:"#86efac"}}>${totCob.toLocaleString("es-AR")}</div>
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
                    <button key={b.l} className="action-btn" onClick={b.fn}>
                      <span style={{fontSize:18}}>{b.icon}</span>
                      <span>{b.l}</span>
                    </button>
                  ))}
                </div>

                {/* Vincular */}
                <button onClick={()=>{setShowVincular(!showVincular);setForm({});}}
                  style={{background:"none",border:"none",cursor:"pointer",color:"#1565c0",fontSize:14,fontWeight:700,textAlign:"left",display:"flex",alignItems:"center",gap:6,padding:"4px 0"}}>
                  🔗 Vincular productor por código
                </button>

                {showVincular&&(
                  <div className="gc-inner fade-in" style={{padding:14}}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:"white"}}>🔗 Vincular por código</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                      <div><label className={lCls} style={{color:"rgba(255,255,255,0.55)"}}>Código *</label><input type="text" value={form.codigo??""} onChange={e=>setForm({...form,codigo:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}} placeholder="10001"/></div>
                      <div><label className={lCls} style={{color:"rgba(255,255,255,0.55)"}}>Honorario</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className="gi sel-crystal" style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}}><option value="mensual">Mensual</option><option value="por_ha">Por HA</option><option value="por_campana">Por campaña</option></select></div>
                      <div><label className={lCls} style={{color:"rgba(255,255,255,0.55)"}}>Monto $</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}}/></div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={vincularCodigo} className="btn-solid">Vincular</button>
                      <button onClick={()=>{setShowVincular(false);setForm({});}} className="action-btn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button>
                    </div>
                  </div>
                )}

                {showImport&&(
                  <div className="gc-inner fade-in" style={{padding:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <span style={{fontSize:13,fontWeight:700,color:"#0d2137"}}>📥 Importar productores</span>
                      <button onClick={()=>{setShowImport(false);setImportPrev([]);setImportMsg("");}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:18}}>✕</button>
                    </div>
                    <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)leerExcel(f);}}/>
                    {importPrev.length===0
                      ?<button onClick={()=>importRef.current?.click()} className="action-btn" style={{width:"100%",padding:"12px",justifyContent:"center",border:"1.5px dashed rgba(255,255,255,0.3)"}}>📁 Seleccionar archivo Excel</button>
                      :<div>
                        <div style={{maxHeight:140,overflowY:"auto",marginBottom:10,borderRadius:10,border:"1px solid rgba(255,255,255,0.15)"}}>
                          <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
                            <thead><tr style={{borderBottom:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)"}}>{["Nombre","Tel","Localidad","Ha",""].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",color:"rgba(255,255,255,0.5)",fontWeight:600}}>{h}</th>)}</tr></thead>
                            <tbody>{importPrev.map((r,i)=><tr key={i} style={{borderBottom:"1px solid rgba(255,255,255,0.05)"}}><td style={{padding:"6px 10px",color:"white",fontWeight:600}}>{r.nombre}</td><td style={{padding:"6px 10px",color:"rgba(255,255,255,0.5)"}}>{r.telefono||"—"}</td><td style={{padding:"6px 10px",color:"rgba(255,255,255,0.5)"}}>{r.localidad||"—"}</td><td style={{padding:"6px 10px",color:"rgba(255,255,255,0.6)"}}>{r.hectareas_total||"—"}</td><td style={{padding:"6px 10px"}}><span style={{fontSize:10,padding:"2px 7px",borderRadius:5,fontWeight:700,background:r.existe?"rgba(100,150,255,0.2)":"rgba(100,255,150,0.15)",color:r.existe?"#90caf9":"#86efac"}}>{r.existe?"Existe":"Nuevo"}</span></td></tr>)}</tbody>
                          </table>
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={confirmarImport} className="btn-solid">Importar {importPrev.filter(p=>!p.existe).length} nuevos</button>
                          <button onClick={()=>setImportPrev([])} className="action-btn" style={{padding:"9px 14px",fontSize:12}}>Cancelar</button>
                        </div>
                      </div>
                    }
                    {importMsg&&<p style={{marginTop:8,fontSize:12,fontWeight:600,color:importMsg.startsWith("✅")?"#86efac":"#fca5a5"}}>{importMsg}</p>}
                  </div>
                )}

                {showForm&&(
                  <div className="gc-inner fade-in" style={{padding:14}}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:"white"}}>{editProd?"✏️ Editar":"➕"} Productor</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                      {[["nombre","Nombre *","text",""],["telefono","Teléfono","text",""],["email","Email (app)","email",""],["localidad","Localidad","text",""],["honorario_monto","Honorario $","number",""],["obs","Observaciones","text",""]].map(([k,l,t,ph])=>(
                        <div key={k as string} style={{gridColumn:k==="obs"?"1/-1":"auto"}}>
                          <label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>{l as string}</label>
                          <input type={t as string} value={form[k as string]??""} onChange={e=>setForm({...form,[k as string]:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}} placeholder={ph as string}/>
                        </div>
                      ))}
                      <div>
                        <label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>Tipo honorario</label>
                        <select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className="gi sel-crystal" style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}}>
                          <option value="mensual">Mensual</option><option value="por_ha">Por HA</option><option value="por_campana">Por campaña</option><option value="por_servicio">Por servicio</option>
                        </select>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={guardarProductor} className="btn-solid">Guardar</button>
                      <button onClick={()=>{setShowForm(false);setEditProd(null);setForm({});}} className="action-btn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button>
                    </div>
                  </div>
                )}

                {/* Filtros exportar lotes */}
                {lotes.length>0&&(
                  <div className="gc" style={{padding:12}}>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
                      <span style={{fontSize:12,fontWeight:700,color:"#1e3a5f"}}>Exportar lotes:</span>
                      {[["Cultivo",fCultivo,setFCultivo,["todos",...cultivosU]],["Productor",fProductor,setFProductor,["todos",...productores.map(p=>p.nombre)]],["Estado",fEstado,setFEstado,["todos","planificado","sembrado","en_desarrollo","cosechado"]]].map(([l,v,fn,opts])=>(
                        <select key={l as string} value={v as string} onChange={e=>(fn as any)(e.target.value)} className="gi sel-crystal" style={{fontSize:12,padding:"6px 10px"}}>
                          {(opts as string[]).map(o=><option key={o} value={o}>{o==="todos"?"Todos":o}</option>)}
                        </select>
                      ))}
                      <button onClick={()=>exportXLS("lotes")} className="btn-solid" style={{padding:"7px 14px",fontSize:12}}>📤 Exportar</button>
                    </div>
                  </div>
                )}

                {/* Lista productores */}
                {productores.length===0
                  ?<div className="gc" style={{padding:48,textAlign:"center"}}><div style={{fontSize:48,opacity:0.2,marginBottom:12}}>👨‍🌾</div><p style={{color:"#4a6a8a",fontSize:14}}>Sin productores</p></div>
                  :<div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {productores.map(p=>{
                      const eid=p.empresa_id??p.id;
                      const camps=campanasPorProd[eid]??[];
                      const campActiva=campSelProd[eid]??null;
                      const lotesP=lotes.filter(l=>(l as any).empresa_id===eid);
                      const haReales=lotesP.reduce((a,l)=>a+(Number(l.hectareas)||0),0);
                      const cultivosProd=[...new Set(lotesP.map(l=>l.cultivo_completo||l.cultivo).filter(Boolean))];
                      return(
                        <div key={p.id} className="prod-card gc" style={{padding:0}}>
                          {/* Header */}
                          <div style={{padding:"14px 14px 12px",borderBottom:"1px solid rgba(255,255,255,0.12)",display:"flex",alignItems:"flex-start",gap:12}}>
                            <div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(145deg,#1976d2,#0d47a1)",border:"2px solid rgba(255,255,255,0.8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:"white",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.4)",flexShrink:0}}>
                              {p.nombre.charAt(0)}
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                <span style={{fontSize:16,fontWeight:800,color:"#0d2137"}}>{p.nombre}</span>
                                <span style={{fontSize:14,opacity:0.5,cursor:"pointer"}} onClick={()=>{setEditProd(p.id);setForm({nombre:p.nombre,telefono:p.telefono||"",email:p.email||"",localidad:p.localidad||"",provincia:p.provincia||"",honorario_tipo:p.honorario_tipo||"mensual",honorario_monto:String(p.honorario_monto||0),obs:p.observaciones||""});setShowForm(true);}}>✏️</span>
                              </div>
                              <div style={{fontSize:12,color:"#4a6a8a",marginTop:2,display:"flex",alignItems:"center",gap:4}}>
                                <span>📍</span>{p.localidad}{p.provincia&&p.provincia!==p.localidad?", "+p.provincia:""}
                              </div>
                              {p.tiene_cuenta&&<div style={{fontSize:11,color:"#16a34a",fontWeight:700,marginTop:3,background:"rgba(22,163,74,0.1)",padding:"2px 7px",borderRadius:6,display:"inline-block"}}>✓ Usa la app</div>}
                            </div>
                            <div style={{display:"flex",gap:6,flexShrink:0}}>
                              <button onClick={()=>{setEditProd(p.id);setForm({nombre:p.nombre,telefono:p.telefono||"",email:p.email||"",localidad:p.localidad||"",provincia:p.provincia||"",honorario_tipo:p.honorario_tipo||"mensual",honorario_monto:String(p.honorario_monto||0),obs:p.observaciones||""});setShowForm(true);}} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.5)",fontSize:13,fontWeight:500,padding:"4px 8px",borderRadius:8,transition:"color 0.15s"}}>✏️ Editar</button>
                              <button onClick={()=>eliminarProd(p.id)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.3)",fontSize:18,padding:"0 4px"}}>✕</button>
                            </div>
                          </div>

                          <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:12}}>
                            {/* Campaña */}
                            <div>
                              <div style={{fontSize:10,fontWeight:700,color:"#4a6a8a",textTransform:"uppercase",letterSpacing:1,marginBottom:7}}>Campaña</div>
                              <div style={{display:"flex",gap:8}}>
                                {camps.length>0
                                  ?<select value={campActiva??""} onChange={e=>cambiarCampana(eid,e.target.value,p.nombre)} className="gi sel-crystal" style={{flex:1,padding:"8px 12px",fontSize:13,fontWeight:600}}>
                                    {camps.map((c:any)=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
                                  </select>
                                  :<div style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,padding:"8px 12px",fontSize:12,color:"rgba(255,255,255,0.3)"}}>Sin campañas</div>
                                }
                                <button onClick={()=>{setNuevaCampProd(p.id);setNuevaCampNombre(new Date().getFullYear()+"/"+(new Date().getFullYear()+1));}} className="action-btn" style={{padding:"8px 12px",fontSize:12,flexShrink:0}}>+ Nueva</button>
                              </div>
                              {nuevaCampProd===p.id&&(
                                <div style={{display:"flex",gap:8,marginTop:8}}>
                                  <input value={nuevaCampNombre} onChange={e=>setNuevaCampNombre(e.target.value)} className={iCls} style={{flex:1,padding:"7px 12px",fontSize:12}} placeholder="2025/2026"/>
                                  <button onClick={async()=>{if(nuevaCampNombre.trim()){await crearCampana(eid,nuevaCampNombre.trim());setNuevaCampProd(null);setNuevaCampNombre("");}}} className="btn-solid" style={{padding:"7px 12px",fontSize:12}}>✓</button>
                                  <button onClick={()=>{setNuevaCampProd(null);setNuevaCampNombre("");}} className="action-btn" style={{padding:"7px 10px",fontSize:12}}>✕</button>
                                </div>
                              )}
                              <div style={{fontSize:12,color:"#4a6a8a",marginTop:6,fontWeight:600}}>{lotesP.length} lotes · {haReales.toLocaleString("es-AR")} ha</div>
                            </div>

                            {/* KPIs Hectáreas + Honorario */}
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                              <div className="kpi-card">
                                <div style={{fontSize:12,fontWeight:700,color:"#4a6a8a",marginBottom:4,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>🌿 Hectáreas</div>
                                <div style={{fontSize:28,fontWeight:800,lineHeight:1}}>{haReales.toLocaleString("es-AR")}</div>
                                <div style={{fontSize:11,opacity:0.5,marginTop:2}}>ha</div>
                              </div>
                              <div className="kpi-card">
                                <div style={{fontSize:12,fontWeight:700,color:"#4a6a8a",marginBottom:4,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>$ Honorario</div>
                                <div className="num-med">${Number(p.honorario_monto||0).toLocaleString("es-AR")}</div>
                                <div style={{fontSize:11,opacity:0.5,marginTop:2}}>{p.honorario_tipo||"mensual"}</div>
                              </div>
                            </div>

                            {/* Distribución cultivos del productor */}
                            {cultivosProd.length>0&&(
                              <div className="gc-inner" style={{padding:"10px 12px"}}>
                                <div style={{fontSize:10,fontWeight:700,color:"#4a6a8a",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Distribución de Cultivos</div>
                                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                                  {cultivosProd.slice(0,4).map(c=>{
                                    const info=getCultivoInfo(c);
                                    const haC=lotesP.filter(l=>(l.cultivo_completo||l.cultivo)===c).reduce((a,l)=>a+(l.hectareas||0),0);
                                    const pct=haReales>0?Math.round(haC/haReales*100):0;
                                    return(
                                      <div key={c} style={{display:"flex",alignItems:"center",gap:8}}>
                                        <span style={{fontSize:14,flexShrink:0}}>{cultivoIcono(c)}</span>
                                        <div style={{width:72,fontSize:11,fontWeight:600,color:"#1e3a5f",flexShrink:0}}>{info.label}</div>
                                        <div style={{flex:1,height:8,borderRadius:10,background:"rgba(0,60,140,0.07)",overflow:"hidden",boxShadow:"inset 0 1px 2px rgba(0,60,140,0.06)"}}>
                                          <div className={cultivoBarClass(c)} style={{width:pct+"%",transition:"width 0.7s ease"}}/>
                                        </div>
                                        <div style={{width:28,textAlign:"right",fontSize:11,fontWeight:700,color:info.color,filter:"brightness(0.75)",flexShrink:0}}>{pct}%</div>
                                      </div>
                                    );
                                  })}
                                </div>
                                {/* Chips 2x2 */}
                                {cultivosProd.length>1&&(
                                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:10}}>
                                    {cultivosProd.slice(0,4).map(c=>{
                                      const info=getCultivoInfo(c);
                                      return(
                                        <div key={c} className="cult-chip" style={{background:`linear-gradient(145deg,${info.color}22,${info.color}0a)`,borderColor:`${info.color}30`}}>
                                          <span style={{fontSize:15}}>{cultivoIcono(c)}</span>
                                          <span style={{fontSize:12,fontWeight:700,color:"#1a2a4a"}}>{info.label}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* CTA Mis Lotes */}
                            <button onClick={()=>entrar(p)} className="btn-mislotes">
                              <span style={{fontSize:18}}>🏛</span>
                              <span>{p.tiene_cuenta?"Ver Lotes":"Mis Lotes"}</span>
                              <span style={{fontSize:18,opacity:0.7}}>›</span>
                            </button>
                          </div>

                          {p.observaciones&&<div style={{padding:"8px 14px",borderTop:"1px solid rgba(255,255,255,0.08)",fontSize:11,color:"rgba(255,255,255,0.35)"}}>{p.observaciones}</div>}
                        </div>
                      );
                    })}
                  </div>
                }
              </div>
            )}

            {/* ══ COBRANZA ══ */}
            {seccion==="cobranza"&&(
              <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                  <div>
                    <h2 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>Cobranza</h2>
                    <div style={{display:"flex",gap:12,marginTop:4}}>
                      <span style={{fontSize:12,fontWeight:600,color:"#dc2626"}}>Pend: <strong>${totPend.toLocaleString("es-AR")}</strong></span>
                      <span style={{fontSize:12,fontWeight:600,color:"#16a34a"}}>Cobr: <strong>${totCob.toLocaleString("es-AR")}</strong></span>
                    </div>
                  </div>
                  <button onClick={()=>{setShowForm(!showForm);setForm({estado:"pendiente",fecha_c:new Date().toISOString().split("T")[0]});}} className="btn-solid">+ Cobro</button>
                </div>
                {showForm&&(
                  <div className="gc-inner fade-in" style={{padding:14}}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:"white"}}>+ Nuevo cobro</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                      <div><label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>Productor</label><select value={form.prod_c??""} onChange={e=>setForm({...form,prod_c:e.target.value})} className="gi sel-crystal" style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}}><option value="">Sin productor</option>{productores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                      <div><label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>Concepto</label><input type="text" value={form.concepto??""} onChange={e=>setForm({...form,concepto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}} placeholder="Honorario enero"/></div>
                      <div><label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>Monto</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}}/></div>
                      <div><label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>Fecha</label><input type="date" value={form.fecha_c??""} onChange={e=>setForm({...form,fecha_c:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}}/></div>
                      <div><label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>Estado</label><select value={form.estado??"pendiente"} onChange={e=>setForm({...form,estado:e.target.value})} className="gi sel-crystal" style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}}><option value="pendiente">Pendiente</option><option value="cobrado">Cobrado</option></select></div>
                      <div><label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>Método</label><select value={form.metodo??""} onChange={e=>setForm({...form,metodo:e.target.value})} className="gi sel-crystal" style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}}><option value="">—</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option></select></div>
                    </div>
                    <div style={{display:"flex",gap:8}}><button onClick={guardarCob} className="btn-solid">Guardar</button><button onClick={()=>{setShowForm(false);setForm({});}} className="action-btn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button></div>
                  </div>
                )}
                <div className="gc" style={{overflow:"hidden",padding:0}}>
                  {cobranzas.length===0?<div style={{textAlign:"center",padding:"48px 20px",color:"#4a6a8a",fontSize:14}}>Sin cobros registrados</div>:(
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",fontSize:12,minWidth:520,borderCollapse:"collapse"}}>
                        <thead><tr style={{borderBottom:"1px solid rgba(255,255,255,0.1)"}}>{["Fecha","Productor","Concepto","Monto","Estado",""].map(h=><th key={h} style={{textAlign:"left",padding:"10px 12px",fontSize:10,color:"#8aabbf",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>{h}</th>)}</tr></thead>
                        <tbody>{cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return(
                          <tr key={c.id} style={{borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                            <td style={{padding:"10px 12px",color:"#8aabbf",fontSize:11}}>{c.fecha}</td>
                            <td style={{padding:"10px 12px",fontWeight:600,color:"#0d2137",fontSize:12}}>{p?.nombre??"—"}</td>
                            <td style={{padding:"10px 12px",color:"#4a6a8a",fontSize:11}}>{c.concepto}</td>
                            <td style={{padding:"10px 12px",fontWeight:700,color:"#fbbf24",fontSize:13}}>${Number(c.monto).toLocaleString("es-AR")}</td>
                            <td style={{padding:"10px 12px"}}><span style={{fontSize:11,padding:"3px 8px",borderRadius:7,fontWeight:700,background:c.estado==="cobrado"?"rgba(134,239,172,0.15)":"rgba(252,165,165,0.15)",color:c.estado==="cobrado"?"#86efac":"#fca5a5"}}>{c.estado}</span></td>
                            <td style={{padding:"10px 12px",display:"flex",gap:8}}>
                              {c.estado==="pendiente"&&<button onClick={()=>marcarCobrado(c.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#86efac",fontSize:12,fontWeight:700}}>✓</button>}
                              <button onClick={async()=>{const sb=await getSB();await sb.from("ing_cobranzas").delete().eq("id",c.id);await fetchCobs(ingId);}} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.3)",fontSize:15}}>✕</button>
                            </td>
                          </tr>
                        );})}
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
                  {!vehiculoSel?<button onClick={()=>{setShowForm(true);setForm({});}} className="btn-solid">+ Agregar</button>
                    :<div style={{display:"flex",gap:8}}>
                      <button onClick={()=>{setShowForm(true);setForm({});}} className="action-btn" style={{padding:"8px 14px",fontSize:12}}>+ Service</button>
                      <button onClick={()=>{setVehiculoSel(null);setServicios([]);setShowForm(false);}} className="action-btn" style={{padding:"8px 14px",fontSize:12}}>← Volver</button>
                    </div>
                  }
                </div>
                {showForm&&!vehiculoSel&&(
                  <div className="gc-inner fade-in" style={{padding:14}}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:"white"}}>+ Nuevo vehículo</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                      {[["nombre","Nombre","Toyota Hilux","text"],["marca","Marca","","text"],["modelo","Modelo","","text"],["anio","Año","","number"],["patente","Patente","","text"],["seg_comp","Compañía seguro","","text"],["seg_venc","Venc. seguro","","date"],["vtv_venc","Venc. VTV","","date"],["km","Km actuales","","number"],["prox_km","Próx. service km","","number"]].map(([k,l,ph,t])=>(
                        <div key={k as string}><label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>{l as string}</label><input type={t as string} value={form[k as string]??""} onChange={e=>setForm({...form,[k as string]:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}} placeholder={ph as string}/></div>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:8}}><button onClick={guardarVeh} className="btn-solid">Guardar</button><button onClick={()=>{setShowForm(false);setForm({});}} className="action-btn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button></div>
                  </div>
                )}
                {!vehiculoSel?(
                  vehiculos.length===0?<div className="gc" style={{padding:"48px 20px",textAlign:"center"}}><div style={{fontSize:48,opacity:0.2,marginBottom:12}}>🚗</div><p style={{color:"#4a6a8a",fontSize:14}}>Sin vehículos</p></div>:(
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {vehiculos.map((v:any)=>{const sV=v.seguro_vencimiento&&new Date(v.seguro_vencimiento)<new Date();const vV=v.vtv_vencimiento&&new Date(v.vtv_vencimiento)<new Date();return(
                        <div key={v.id} className="prod-card gc" style={{padding:14,cursor:"pointer"}} onClick={async()=>{setVehiculoSel(v);const sb=await getSB();const{data}=await sb.from("ing_vehiculo_service").select("*").eq("vehiculo_id",v.id).order("fecha",{ascending:false});setServicios(data??[]);}}>
                          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                            <div style={{width:46,height:46,borderRadius:14,background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🚗</div>
                            <div style={{flex:1}}><div style={{fontWeight:700,color:"#0d2137",fontSize:15}}>{v.nombre}</div><div style={{fontSize:11,color:"rgba(255,255,255,0.45)",marginTop:2}}>{v.marca} {v.modelo} · {v.anio} · {v.patente}</div></div>
                            <button onClick={e=>{e.stopPropagation();(async()=>{const sb=await getSB();await sb.from("ing_vehiculos").delete().eq("id",v.id);await fetchVehs(ingId);})();}} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.3)",fontSize:18}}>✕</button>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                            <div className="kpi-card" style={{padding:"10px 12px"}}><div style={{fontSize:10,opacity:0.55,marginBottom:3}}>Km actuales</div><div style={{fontSize:18,fontWeight:700}}>{(v.km_actuales||0).toLocaleString()}</div></div>
                            <div className="kpi-card" style={{padding:"10px 12px",background:"linear-gradient(145deg,rgba(251,191,36,0.20),rgba(251,191,36,0.06))"}}><div style={{fontSize:10,opacity:0.55,marginBottom:3}}>Próx. service</div><div style={{fontSize:16,fontWeight:700,color:"#fbbf24"}}>{v.proximo_service_km?(v.proximo_service_km.toLocaleString()+" km"):"—"}</div></div>
                          </div>
                          <div style={{display:"flex",gap:8}}>
                            <span style={{flex:1,fontSize:11,padding:"7px 10px",borderRadius:10,fontWeight:700,textAlign:"center",background:sV?"rgba(252,165,165,0.15)":"rgba(134,239,172,0.12)",color:sV?"#fca5a5":"#86efac",border:`1px solid ${sV?"rgba(252,165,165,0.2)":"rgba(134,239,172,0.15)"}`}}>🛡 {sV?"VENCIDO":v.seguro_vencimiento||"—"}</span>
                            <span style={{flex:1,fontSize:11,padding:"7px 10px",borderRadius:10,fontWeight:700,textAlign:"center",background:vV?"rgba(252,165,165,0.15)":"rgba(134,239,172,0.12)",color:vV?"#fca5a5":"#86efac",border:`1px solid ${vV?"rgba(252,165,165,0.2)":"rgba(134,239,172,0.15)"}`}}>📋 {vV?"VTV VENCIDA":v.vtv_vencimiento||"—"}</span>
                          </div>
                        </div>
                      );})}
                    </div>
                  )
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div className="gc" style={{padding:14,display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:46,height:46,borderRadius:14,background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🚗</div>
                      <div><div style={{fontWeight:700,color:"#0d2137"}}>{vehiculoSel.nombre}</div><div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>{vehiculoSel.marca} {vehiculoSel.modelo} · {(vehiculoSel as any).anio} · {vehiculoSel.patente}</div></div>
                    </div>
                    {showForm&&vehiculoSel&&(
                      <div className="gc-inner fade-in" style={{padding:14}}>
                        <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:"white"}}>+ Service</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                          <div><label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>Tipo</label><select value={form.tipo_s??"service"} onChange={e=>setForm({...form,tipo_s:e.target.value})} className="gi sel-crystal" style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}}><option value="service">Service</option><option value="reparacion">Reparación</option><option value="vtv">VTV</option><option value="otro">Otro</option></select></div>
                          <div><label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>Descripción</label><input type="text" value={form.desc_s??""} onChange={e=>setForm({...form,desc_s:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}}/></div>
                          <div><label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>Taller</label><input type="text" value={form.taller??""} onChange={e=>setForm({...form,taller:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}}/></div>
                          <div><label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>Km</label><input type="number" value={form.km_s??""} onChange={e=>setForm({...form,km_s:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}}/></div>
                          <div><label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>Costo</label><input type="number" value={form.costo_s??""} onChange={e=>setForm({...form,costo_s:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}}/></div>
                          <div><label style={{display:"block",fontSize:10,color:"#4a6a8a",fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.8}}>Fecha</label><input type="date" value={form.fecha_s??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_s:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px",color:"#1e3a5f"}}/></div>
                        </div>
                        <div style={{display:"flex",gap:8}}><button onClick={guardarService} className="btn-solid">Guardar</button><button onClick={()=>{setShowForm(false);setForm({});}} className="action-btn" style={{padding:"9px 16px",fontSize:13}}>Cancelar</button></div>
                      </div>
                    )}
                    <div className="gc" style={{overflow:"hidden",padding:0}}>
                      <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.1)",fontSize:13,fontWeight:700,color:"#0d2137"}}>🔧 Historial</div>
                      {servicios.length===0?<div style={{textAlign:"center",padding:"32px 20px",color:"rgba(255,255,255,0.3)",fontSize:13}}>Sin historial</div>:(
                        <div style={{overflowX:"auto"}}><table style={{width:"100%",fontSize:12,minWidth:440,borderCollapse:"collapse"}}>
                          <thead><tr style={{borderBottom:"1px solid rgba(255,255,255,0.08)"}}>{["Fecha","Tipo","Descripción","Km","Costo",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"rgba(255,255,255,0.4)",fontWeight:600,textTransform:"uppercase",letterSpacing:0.8}}>{h}</th>)}</tr></thead>
                          <tbody>{servicios.map(s=><tr key={s.id} style={{borderBottom:"1px solid rgba(255,255,255,0.05)"}}><td style={{padding:"9px 12px",color:"rgba(255,255,255,0.4)",fontSize:11}}>{s.fecha}</td><td style={{padding:"9px 12px"}}><span style={{fontSize:10,padding:"3px 7px",borderRadius:6,fontWeight:700,background:"rgba(251,191,36,0.15)",color:"#fbbf24"}}>{s.tipo}</span></td><td style={{padding:"9px 12px",color:"#1e3a5f",fontSize:11}}>{s.descripcion}</td><td style={{padding:"9px 12px",color:"rgba(255,255,255,0.4)",fontSize:11}}>{s.km?(s.km.toLocaleString()+" km"):"—"}</td><td style={{padding:"9px 12px",fontWeight:700,color:"#fca5a5",fontSize:12}}>${Number(s.costo).toLocaleString("es-AR")}</td><td style={{padding:"9px 12px"}}><button onClick={async()=>{const sb=await getSB();await sb.from("ing_vehiculo_service").delete().eq("id",s.id);const sb2=await getSB();const{data}=await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id",vehiculoSel!.id).order("fecha",{ascending:false});setServicios(data??[]);}} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.25)",fontSize:15}}>✕</button></td></tr>)}</tbody>
                        </table></div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{height:80}}/>
          </div>
        </div>{/* fin main-frame */}
      </div>

      {/* ══ PANEL VOZ ══ */}
      {vozPanel&&(
        <div style={{position:"fixed",bottom:88,right:16,zIndex:50,width:280,borderRadius:20,overflow:"hidden",
          background:"rgba(255,255,255,0.88)",
          backdropFilter:"blur(24px)",border:"1px solid rgba(255,255,255,0.85)",
          boxShadow:"0 16px 48px rgba(0,20,100,0.35),inset 0 1px 0 rgba(255,255,255,0.4)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.12)"}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}><div style={{width:7,height:7,borderRadius:"50%",background:VOZ_COLOR[vozEstado],boxShadow:`0 0 6px ${VOZ_COLOR[vozEstado]}80`}}/><span style={{color:"#0d2137",fontSize:12,fontWeight:700}}>🎤 ASISTENTE</span></div>
            <button onClick={()=>{setVozPanel(false);recRef.current?.stop();setVozEstado("idle");}} style={{background:"none",border:"none",color:"#4a6a8a",cursor:"pointer",fontSize:18}}>✕</button>
          </div>
          <div style={{padding:14,minHeight:56}}>
            {vozEstado==="escuchando"&&<p style={{color:"#fca5a5",fontSize:13,fontWeight:600}}>🔴 Escuchando...</p>}
            {vozEstado==="procesando"&&<p style={{color:"#fbbf24",fontSize:13,fontWeight:600}}>⚙️ Procesando...</p>}
            {vozEstado==="idle"&&(
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {["¿Cuántas ha totales?","Dosis glifosato soja","¿Cuántos productores?"].map(q=>(
                  <button key={q} onClick={()=>{askAI(q);setVozPanel(false);}} className="action-btn" style={{padding:"8px 12px",fontSize:11,justifyContent:"flex-start"}}>💬 {q}</button>
                ))}
              </div>
            )}
          </div>
          <div style={{padding:"0 12px 12px",display:"flex",gap:8}}>
            <input value={vozInput} onChange={e=>setVozInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){askAI(vozInput);setVozInput("");setVozPanel(false);}}} placeholder="Escribí..." className={iCls} style={{flex:1,padding:"8px 12px",fontSize:12}}/>
            <button onClick={escucharVoz} style={{padding:"8px 12px",borderRadius:12,fontSize:14,background:VOZ_COLOR[vozEstado]+"25",border:`1px solid ${VOZ_COLOR[vozEstado]}50`,color:VOZ_COLOR[vozEstado],cursor:"pointer"}}>{VOZ_ICON[vozEstado]}</button>
          </div>
        </div>
      )}

      {/* ══ PANEL IA CAMPO FLOTANTE ══ */}
      {aiPanel&&(
        <div style={{position:"fixed",bottom:88,right:80,zIndex:50,width:320,maxHeight:"75vh",borderRadius:22,overflow:"hidden",display:"flex",flexDirection:"column",
          background:"linear-gradient(145deg,rgba(255,255,255,0.92),rgba(230,245,255,0.90))",
          backdropFilter:"blur(24px)",border:"1px solid rgba(255,255,255,0.85)",
          boxShadow:"0 20px 60px rgba(20,80,160,0.22),inset 0 1px 0 rgba(255,255,255,0.95)"}}>
          {/* Header */}
          <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(25,118,210,0.12)",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:"#86efac",boxShadow:"0 0 8px #86efac"}}/>
              <span style={{color:"#0d2137",fontSize:13,fontWeight:700}}>🌾 IA Agronómica</span>
            </div>
            <button onClick={()=>setAiPanel(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:20,lineHeight:1}}>✕</button>
          </div>
          {/* Sugerencias rápidas si no hay chat */}
          {aiChat.length===0&&(
            <div style={{padding:"10px 12px",borderBottom:"1px solid rgba(255,255,255,0.08)",display:"flex",flexWrap:"wrap",gap:6,flexShrink:0}}>
              {["Dosis glifosato","Roya soja","Fungicida maíz","Precio soja"].map(q=>(
                <button key={q} onClick={()=>askAI(q)}
                  style={{fontSize:11,padding:"5px 10px",borderRadius:20,cursor:"pointer",fontWeight:600,
                    background:"rgba(25,118,210,0.08)",border:"1px solid rgba(25,118,210,0.20)",
                    color:"#1565c0",whiteSpace:"nowrap",transition:"all 0.15s"
                  }}>💬 {q}</button>
              ))}
            </div>
          )}
          {/* Chat */}
          <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:8,minHeight:0}}>
            {aiChat.length===0&&(
              <div style={{textAlign:"center",padding:"24px 16px",color:"#4a6a8a"}}>
                <div style={{fontSize:36,marginBottom:8}}>🌾</div>
                <p style={{fontSize:12,lineHeight:1.5}}>Preguntá sobre dosis, plagas,<br/>cultivos y mercados</p>
              </div>
            )}
            {aiChat.map((msg,i)=>(
              <div key={i} style={{display:"flex",justifyContent:msg.rol==="user"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"85%",padding:"9px 13px",borderRadius:14,fontSize:12,lineHeight:1.5,
                  ...(msg.rol==="user"
                    ?{background:"linear-gradient(145deg,#42a5f5,#1565c0)",color:"white",boxShadow:"0 3px 10px rgba(33,150,243,0.35)"}
                    :{background:"rgba(240,248,255,0.90)",border:"1px solid rgba(25,118,210,0.18)",color:"#1e3a5f"})}}>
                  {msg.rol==="assistant"&&<div style={{fontSize:9,fontWeight:700,color:"#1565c0",marginBottom:4,letterSpacing:1}}>◆ IA AGRONÓMICA</div>}
                  <p style={{margin:0,whiteSpace:"pre-wrap"}}>{msg.texto}</p>
                </div>
              </div>
            ))}
            {aiLoad&&(
              <div style={{display:"flex"}}>
                <div style={{background:"rgba(255,255,255,0.10)",border:"1px solid rgba(255,255,255,0.14)",padding:"9px 13px",borderRadius:14,display:"flex",gap:4,alignItems:"center"}}>
                  {[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:"50%",background:"#90caf9",animation:"float 1s ease-in-out infinite",animationDelay:i*0.18+"s"}}/>)}
                </div>
              </div>
            )}
          </div>
          {/* Input */}
          <div style={{padding:"10px 12px",borderTop:"1px solid rgba(255,255,255,0.10)",display:"flex",gap:8,flexShrink:0,background:"rgba(230,243,255,0.60)"}}>
            <input type="text" value={aiInput} onChange={e=>setAiInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&askAI()}
              placeholder="Consultá sobre dosis, plagas..."
              className={iCls}
              style={{flex:1,padding:"9px 12px",fontSize:12}}/>
            <button onClick={()=>askAI()} disabled={aiLoad||!aiInput.trim()}
              style={{padding:"9px 14px",borderRadius:12,fontSize:16,cursor:"pointer",flexShrink:0,
                background:"linear-gradient(145deg,#42a5f5,#1565c0)",border:"none",color:"white",
                boxShadow:"0 3px 10px rgba(33,150,243,0.4)",opacity:aiLoad||!aiInput.trim()?0.4:1,
                transition:"all 0.15s"}}>→</button>
          </div>
          {aiChat.length>0&&(
            <div style={{padding:"4px 12px 8px",textAlign:"center"}}>
              <button onClick={()=>setAiChat([])} style={{fontSize:10,color:"#4a6a8a",background:"none",border:"none",cursor:"pointer"}}>Limpiar chat</button>
            </div>
          )}
        </div>
      )}

      {/* Botón flotante voz */}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
        style={{position:"fixed",bottom:20,right:16,zIndex:40,width:54,height:54,borderRadius:"50%",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,cursor:"pointer",
          background:"linear-gradient(145deg,#2196f3,#1565c0)",color:"white",
          border:"1.5px solid rgba(100,180,255,0.4)",
          boxShadow:"0 4px 20px rgba(33,150,243,0.50),inset 0 1px 0 rgba(255,255,255,0.25)",
          animation:vozEstado==="idle"?"float 3s ease-in-out infinite":"none",
          transition:"all 0.2s ease"}}>
        {VOZ_ICON[vozEstado]}
      </button>

      {/* Botón flotante IA Campo */}
      <button onClick={()=>{setAiPanel(!aiPanel);if(!aiPanel)setVozPanel(false);}}
        style={{position:"fixed",bottom:82,right:16,zIndex:40,width:54,height:54,borderRadius:"50%",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,cursor:"pointer",
          background:aiPanel?"linear-gradient(145deg,#43a047,#1b5e20)":"linear-gradient(145deg,#1b5e20,#2e7d32)",
          color:"white",
          border:`1.5px solid ${aiPanel?"rgba(134,239,172,0.6)":"rgba(100,200,120,0.4)"}`,
          boxShadow:aiPanel?"0 4px 20px rgba(67,160,71,0.60),inset 0 1px 0 rgba(255,255,255,0.25)":"0 4px 16px rgba(67,160,71,0.35),inset 0 1px 0 rgba(255,255,255,0.20)",
          transition:"all 0.2s ease"}}>
        🌾
      </button>
    </div>
  );
}
