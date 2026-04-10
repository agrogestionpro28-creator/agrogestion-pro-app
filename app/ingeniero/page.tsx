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
  { k:"ia_campo",   icon:"🤖", label:"IA Campo" },
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
  const iCls = "glass-input w-full px-3 py-2.5 text-gray-800 text-sm placeholder:text-gray-400";
  const lCls = "block text-xs text-gray-500 font-semibold mb-1.5 uppercase tracking-wide";
  const cardCls = "glass-card";

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
    <div className="min-h-screen flex items-center justify-center" style={{background:"linear-gradient(135deg,#dbeafe 0%,#EAF2F8 50%,#f0f7ff 100%)"}}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" style={{borderWidth:3}}/>
        <span className="text-gray-500 font-medium text-sm">Cargando AgroGestión PRO...</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{background:"linear-gradient(135deg,#dbeafe 0%,#EAF2F8 35%,#f0f7ff 65%,#e8f4fd 100%)",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",position:"relative"}}>
      {/* Orbs de luz de fondo — efecto iPhone */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
        <div style={{position:"absolute",top:"-10%",left:"-5%",width:"50%",height:"50%",borderRadius:"50%",background:"radial-gradient(ellipse,rgba(25,118,210,0.12) 0%,transparent 70%)",filter:"blur(40px)"}}/>
        <div style={{position:"absolute",top:"30%",right:"-10%",width:"45%",height:"45%",borderRadius:"50%",background:"radial-gradient(ellipse,rgba(0,175,255,0.10) 0%,transparent 70%)",filter:"blur(50px)"}}/>
        <div style={{position:"absolute",bottom:"10%",left:"20%",width:"40%",height:"40%",borderRadius:"50%",background:"radial-gradient(ellipse,rgba(99,179,237,0.08) 0%,transparent 70%)",filter:"blur(45px)"}}/>
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');

        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes crystal-glow{
          0%,100%{box-shadow:0 8px 32px rgba(25,118,210,0.15),0 0 0 1px rgba(255,255,255,0.5),inset 0 1px 0 rgba(255,255,255,0.9),inset 0 -1px 0 rgba(0,0,0,0.05);}
          50%{box-shadow:0 12px 40px rgba(25,118,210,0.25),0 0 0 1px rgba(255,255,255,0.7),inset 0 1px 0 rgba(255,255,255,1),inset 0 -1px 0 rgba(0,0,0,0.03);}
        }
        @keyframes light-sweep{
          0%{transform:translateX(-200%) rotate(35deg);}
          100%{transform:translateX(400%) rotate(35deg);}
        }

        /* ══ CRYSTAL GLASS BASE ══ */
        .glass-card {
          position: relative;
          overflow: hidden;
          background: linear-gradient(
            160deg,
            rgba(255,255,255,0.82) 0%,
            rgba(255,255,255,0.58) 40%,
            rgba(240,248,255,0.65) 100%
          );
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border-radius: 20px;
          /* Borde cristal multicapa */
          border: 1px solid rgba(255,255,255,0.75);
          outline: 1px solid rgba(25,118,210,0.06);
          /* Sombra profunda + rebote de luz */
          box-shadow:
            0 8px 32px rgba(25,118,210,0.10),
            0 2px 8px rgba(0,0,0,0.06),
            inset 0 2px 0 rgba(255,255,255,0.95),
            inset 0 -1px 0 rgba(255,255,255,0.3),
            inset 1px 0 0 rgba(255,255,255,0.5),
            inset -1px 0 0 rgba(255,255,255,0.5);
        }
        /* Reflejo diagonal interno (borde superior brillante) */
        .glass-card::before {
          content:"";
          position:absolute;
          top:0;left:0;right:0;
          height:50%;
          background:linear-gradient(180deg,rgba(255,255,255,0.55) 0%,rgba(255,255,255,0) 100%);
          border-radius:20px 20px 0 0;
          pointer-events:none;
          z-index:1;
        }
        /* Sweep de luz — sweep lento y sutil siempre activo */
        .glass-card::after {
          content:"";
          position:absolute;
          top:-50%;left:-60%;
          width:35%;height:200%;
          background:linear-gradient(100deg,
            transparent 0%,
            rgba(255,255,255,0.08) 40%,
            rgba(255,255,255,0.18) 50%,
            rgba(255,255,255,0.08) 60%,
            transparent 100%
          );
          transform:rotate(20deg);
          animation:light-sweep 6s ease-in-out infinite;
          pointer-events:none;
          z-index:2;
        }
        .glass-card > * { position:relative; z-index:3; }

        /* ══ CRYSTAL BUTTON ══ */
        .glass-btn {
          position:relative;
          overflow:hidden;
          background:linear-gradient(160deg,
            rgba(255,255,255,0.88) 0%,
            rgba(255,255,255,0.60) 100%
          );
          backdrop-filter:blur(16px) saturate(160%);
          -webkit-backdrop-filter:blur(16px) saturate(160%);
          border-radius:14px;
          border:1px solid rgba(255,255,255,0.8);
          box-shadow:
            0 4px 16px rgba(0,0,0,0.07),
            inset 0 2px 0 rgba(255,255,255,1),
            inset 0 -1px 0 rgba(0,0,150,0.04);
          cursor:pointer;
          transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        .glass-btn::before {
          content:"";position:absolute;
          top:0;left:0;right:0;height:50%;
          background:linear-gradient(180deg,rgba(255,255,255,0.7) 0%,transparent 100%);
          border-radius:14px 14px 0 0;pointer-events:none;z-index:1;
        }
        .glass-btn::after {
          content:"";position:absolute;
          top:-20%;left:-80%;width:40%;height:140%;
          background:linear-gradient(90deg,transparent,rgba(0,150,255,0.22),transparent);
          transform:skewX(-20deg);
          transition:left 0.5s ease;pointer-events:none;z-index:2;
        }
        .glass-btn:hover::after{left:160%;}
        .glass-btn:hover{
          transform:translateY(-2px) scale(1.02);
          box-shadow:0 8px 24px rgba(25,118,210,0.18),inset 0 2px 0 rgba(255,255,255,1);
        }
        .glass-btn:active{transform:scale(0.98);}
        .glass-btn > * {position:relative;z-index:3;}

        /* ══ NAV TAB ══ */
        .nav-btn{
          position:relative;overflow:hidden;
          transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);
          border-radius:12px;
          white-space:nowrap;
        }
        .nav-btn:hover{transform:translateY(-1px);}
        .nav-active{
          background:linear-gradient(160deg,
            rgba(13,71,161,0.18) 0%,
            rgba(25,118,210,0.12) 100%
          ) !important;
          border:1px solid rgba(25,118,210,0.35) !important;
          box-shadow:
            0 0 0 1px rgba(25,118,210,0.15),
            0 4px 14px rgba(13,71,161,0.2),
            inset 0 1px 0 rgba(255,255,255,0.7),
            inset 0 -1px 0 rgba(25,118,210,0.1);
          color:#0D47A1 !important;
        }

        /* ══ PROD CARD ══ */
        .prod-card{
          transition:all 0.25s cubic-bezier(0.34,1.56,0.64,1);
          cursor:default;
        }
        .prod-card:hover{
          transform:translateY(-4px);
          box-shadow:
            0 20px 48px rgba(25,118,210,0.15),
            0 4px 12px rgba(0,0,0,0.06),
            inset 0 2px 0 rgba(255,255,255,0.98),
            inset 0 -1px 0 rgba(255,255,255,0.4) !important;
          border-color:rgba(25,118,210,0.2) !important;
        }

        /* ══ BLUE BUTTON ══ */
        .btn-blue{
          background:linear-gradient(160deg,#2196F3 0%,#1565C0 100%);
          border:none;color:white;border-radius:14px;
          box-shadow:
            0 4px 14px rgba(25,118,210,0.40),
            inset 0 1px 0 rgba(255,255,255,0.25),
            inset 0 -1px 0 rgba(0,0,0,0.15);
          transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);
          cursor:pointer;
        }
        .btn-blue:hover{
          transform:translateY(-2px);
          box-shadow:0 8px 22px rgba(25,118,210,0.55),inset 0 1px 0 rgba(255,255,255,0.3);
        }
        .btn-blue:active{transform:scale(0.97);}

        /* ══ GHOST BUTTON ══ */
        .btn-ghost{
          background:linear-gradient(160deg,rgba(255,255,255,0.75),rgba(255,255,255,0.5));
          border:1px solid rgba(255,255,255,0.7);
          border-radius:14px;
          box-shadow:0 2px 8px rgba(0,0,0,0.06),inset 0 1px 0 rgba(255,255,255,0.9);
          transition:all 0.2s ease;
          cursor:pointer;
        }
        .btn-ghost:hover{background:rgba(255,255,255,0.92);transform:translateY(-1px);}

        /* ══ INPUT ══ */
        .glass-input{
          background:rgba(255,255,255,0.65);
          border:1px solid rgba(255,255,255,0.7);
          border-radius:12px;
          box-shadow:inset 0 2px 4px rgba(0,0,0,0.04),inset 0 1px 0 rgba(255,255,255,0.8);
          transition:all 0.2s ease;
        }
        .glass-input:focus{
          background:rgba(255,255,255,0.92);
          border-color:rgba(25,118,210,0.4);
          box-shadow:0 0 0 3px rgba(25,118,210,0.1),inset 0 2px 4px rgba(0,0,0,0.02);
          outline:none;
        }

        /* ══ TOPBAR ══ */
        .topbar{
          background:linear-gradient(180deg,
            rgba(255,255,255,0.88) 0%,
            rgba(255,255,255,0.78) 100%
          );
          backdrop-filter:blur(24px) saturate(180%);
          -webkit-backdrop-filter:blur(24px) saturate(180%);
          border-bottom:1px solid rgba(255,255,255,0.6);
          box-shadow:
            0 1px 0 rgba(255,255,255,0.9),
            0 2px 20px rgba(0,0,0,0.06);
        }

        /* ══ MISC ══ */
        .fade-in{animation:fadeIn 0.25s ease;}
        .badge-app{
          background:linear-gradient(135deg,rgba(22,163,74,0.12),rgba(22,163,74,0.06));
          border:1px solid rgba(22,163,74,0.22);
          color:#16a34a;border-radius:8px;
          box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);
        }
        .cultivo-chip{
          border-radius:10px;font-size:12px;font-weight:600;
          padding:4px 10px;
          box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);
        }
        .bar-track{background:rgba(0,0,0,0.06);border-radius:99px;height:7px;overflow:hidden;}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.2);border-radius:4px}
        input[type=date]::-webkit-calendar-picker-indicator{opacity:0.4}
        select option{background:white;color:#1a1a1a;}
`}</style>

      {/* ══ TOPBAR ══ */}
      <div className="topbar sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/30">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="AgroGestión PRO" width={120} height={38} className="object-contain"/>
          </div>
          <div className="flex items-center gap-2.5">
            {alertas.length>0&&(
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.25)",color:"#dc2626"}}>
                {alertas.length}
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-md" style={{background:"linear-gradient(135deg,#1976D2,#0D47A1)"}}>
                {ingNombre.charAt(0)}
              </div>
              <div className="hidden sm:block">
                <div className="text-sm font-semibold text-gray-800 leading-none">{ingNombre}</div>
                <div className="text-xs text-gray-400 mt-0.5">Cód. {ingData.codigo}</div>
              </div>
              <button onClick={async()=>{const sb=await getSB();await sb.auth.signOut();window.location.href="/login";}}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50 ml-1">
                Salir <span className="text-base">⎋</span>
              </button>
            </div>
          </div>
        </div>
        {/* Nav tabs */}
        <div className="flex overflow-x-auto px-3 py-2.5 gap-1.5" style={{scrollbarWidth:"none"}}>
          {NAV.map(item=>(
            <button key={item.k}
              onClick={()=>{setSeccion(item.k as Seccion);setShowForm(false);setForm({});setVehiculoSel(null);}}
              className={`nav-btn flex items-center gap-1.5 px-4 py-2 text-sm font-semibold flex-shrink-0 border ${seccion===item.k?"nav-active":"glass-btn text-gray-600 hover:text-blue-700"}`}>
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
              {seccion===item.k&&<div className="w-1.5 h-1.5 rounded-full bg-blue-600 ml-0.5"/>}
            </button>
          ))}
        </div>
      </div>

      {/* ══ CONTENT ══ */}
      <div className="max-w-2xl mx-auto px-4 py-5 pb-28" style={{position:"relative",zIndex:1}}>

        {/* Toast */}
        {msj&&<div className="mb-4 px-4 py-3 rounded-2xl text-sm font-medium flex items-center justify-between fade-in"
          style={{background:msj.startsWith("✅")?"rgba(22,163,74,0.1)":"rgba(239,68,68,0.1)",border:msj.startsWith("✅")?"1px solid rgba(22,163,74,0.25)":"1px solid rgba(239,68,68,0.25)",color:msj.startsWith("✅")?"#16a34a":"#dc2626"}}>
          {msj}<button onClick={()=>setMsj("")} className="ml-3 opacity-60 hover:opacity-100">✕</button>
        </div>}

        {/* ══ GENERAL ══ */}
        {seccion==="general"&&(
          <div className="fade-in space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3">
              {[
                {l:"Productores",v:productores.length,icon:"👨‍🌾",accent:"#1976D2",bg:"rgba(25,118,210,0.08)",border:"rgba(25,118,210,0.18)"},
                {l:"Hectáreas",v:totalHa.toLocaleString("es-AR")+" ha",icon:"🌿",accent:"#16a34a",bg:"rgba(22,163,74,0.08)",border:"rgba(22,163,74,0.18)"},
                {l:"Lotes activos",v:lotes.length,icon:"🗺️",accent:"#0891b2",bg:"rgba(8,145,178,0.08)",border:"rgba(8,145,178,0.18)"},
                {l:"Con App",v:productores.filter(p=>p.tiene_cuenta).length,icon:"📱",accent:"#7c3aed",bg:"rgba(124,58,237,0.08)",border:"rgba(124,58,237,0.18)"},
              ].map(s=>(
                <div key={s.l} className="glass-card p-4" style={{background:`linear-gradient(160deg,rgba(255,255,255,0.85),rgba(255,255,255,0.6))`,border:`1px solid ${s.border}`,transition:"all 0.25s ease"}}>
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{color:s.accent}}>{s.l}</span>
                    <span className="text-xl">{s.icon}</span>
                  </div>
                  <div className="text-3xl font-bold text-gray-800">{s.v}</div>
                </div>
              ))}
            </div>

            {/* Distribución de cultivos */}
            {haPorCultivo.length>0&&(
              <div className="glass-card p-5">
                <h3 className="font-bold text-gray-800 mb-1">Distribución de Cultivos</h3>
                <p className="text-xs text-gray-400 mb-4">Campaña activa · {totalHa.toLocaleString("es-AR")} ha totales</p>
                <div className="space-y-3">
                  {haPorCultivo.map((d,i)=>(
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex items-center gap-2 w-28 flex-shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:d.color}}/>
                        <span className="text-xs font-medium text-gray-600 truncate">{d.name}</span>
                      </div>
                      <div className="flex-1 bar-track">
                        <div className="h-full rounded-full transition-all duration-500" style={{width:totalHa>0?(d.ha/totalHa*100)+"%":"0%",background:d.color}}/>
                      </div>
                      <span className="text-xs font-bold w-8 text-right" style={{color:d.color}}>
                        {totalHa>0?Math.round(d.ha/totalHa*100):0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cultivos chips */}
            {haPorCultivo.length>0&&(
              <div className="glass-card p-4">
                <div className="flex flex-wrap gap-2">
                  {haPorCultivo.map((d,i)=>(
                    <div key={i} className="cultivo-chip flex items-center gap-1.5"
                      style={{background:d.color+"15",border:`1px solid ${d.color}30`,color:d.color}}>
                      <span>{d.name}</span>
                      <span className="font-normal opacity-70">·</span>
                      <span>{d.ha} ha</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cobranza resumen */}
            <div className="glass-card p-4">
              <h3 className="font-bold text-gray-800 mb-3">💰 Cobranza</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl p-3 text-center" style={{background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.15)"}}>
                  <div className="text-xs text-red-500 font-semibold uppercase tracking-wide mb-1">Pendiente</div>
                  <div className="text-xl font-bold text-red-600">${totPend.toLocaleString("es-AR")}</div>
                </div>
                <div className="rounded-2xl p-3 text-center" style={{background:"rgba(22,163,74,0.06)",border:"1px solid rgba(22,163,74,0.15)"}}>
                  <div className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-1">Cobrado</div>
                  <div className="text-xl font-bold text-green-600">${totCob.toLocaleString("es-AR")}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ PRODUCTORES ══ */}
        {seccion==="productores"&&(
          <div className="fade-in">
            {/* Acciones */}
            <div className="glass-card rounded-2xl overflow-hidden mb-4">
              <div className="grid grid-cols-3 divide-x" style={{borderColor:"rgba(0,0,0,0.06)"}}>
                {[
                  {icon:"➕",l:"Nuevo",fn:()=>{setShowForm(!showForm);setEditProd(null);setForm({provincia:"Santa Fe",honorario_tipo:"mensual"});}},
                  {icon:"📥",l:"Importar",fn:()=>setShowImport(!showImport)},
                  {icon:"📤",l:"Exportar",fn:()=>exportXLS("productores")},
                ].map(b=>(
                  <button key={b.l} onClick={b.fn}
                    className="glass-btn flex flex-col items-center gap-1 py-4 rounded-none border-none"
                    style={{borderRadius:0,border:"none",background:"transparent",boxShadow:"none"}}>
                    <span className="text-2xl">{b.icon}</span>
                    <span className="text-xs font-semibold text-gray-600">{b.l}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Vincular */}
            <button onClick={()=>{setShowVincular(!showVincular);setForm({});}}
              className="mb-3 flex items-center gap-2 text-sm font-semibold hover:text-blue-700 transition-colors" style={{color:"#1976D2"}}>
              🔗 Vincular productor por código
            </button>

            {showVincular&&(
              <div className="glass-card p-4 mb-4 fade-in">
                <h3 className="font-bold text-gray-800 mb-3 text-sm">🔗 Vincular por código</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div><label className={lCls}>Código *</label><input type="text" value={form.codigo??""} onChange={e=>setForm({...form,codigo:e.target.value})} className={iCls} placeholder="10001"/></div>
                  <div><label className={lCls}>Honorario</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className={iCls}><option value="mensual">Mensual</option><option value="por_ha">Por HA</option><option value="por_campana">Por campaña</option></select></div>
                  <div><label className={lCls}>Monto $</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={vincularCodigo} className="btn-blue px-5 py-2.5 text-sm font-semibold">Vincular</button>
                  <button onClick={()=>{setShowVincular(false);setForm({});}} className="btn-ghost px-4 py-2.5 text-sm text-gray-600">Cancelar</button>
                </div>
              </div>
            )}

            {showImport&&(
              <div className="glass-card p-4 mb-4 fade-in">
                <div className="flex justify-between mb-3"><h3 className="font-bold text-gray-800 text-sm">📥 Importar productores</h3><button onClick={()=>{setShowImport(false);setImportPrev([]);setImportMsg("");}} className="text-gray-400 hover:text-gray-600 text-lg">✕</button></div>
                <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)leerExcel(f);}}/>
                {importPrev.length===0
                  ?<button onClick={()=>importRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl text-sm w-full justify-center transition-colors" style={{borderColor:"rgba(25,118,210,0.3)",color:"#1976D2"}}>📁 Seleccionar archivo Excel</button>
                  :<div>
                    <div className="max-h-36 overflow-y-auto mb-3 rounded-xl border" style={{borderColor:"rgba(0,0,0,0.08)"}}>
                      <table className="w-full text-xs"><thead style={{background:"rgba(25,118,210,0.06)"}}><tr>{["Nombre","Tel","Localidad","Ha",""].map(h=><th key={h} className="text-left px-3 py-2 text-gray-500 font-semibold">{h}</th>)}</tr></thead>
                        <tbody>{importPrev.map((r,i)=><tr key={i} className="border-t" style={{borderColor:"rgba(0,0,0,0.06)"}}><td className="px-3 py-2 font-semibold text-gray-800">{r.nombre}</td><td className="px-3 py-2 text-gray-400">{r.telefono||"—"}</td><td className="px-3 py-2 text-gray-400">{r.localidad||"—"}</td><td className="px-3 py-2 text-gray-500">{r.hectareas_total||"—"}</td><td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.existe?"text-blue-600":"text-green-600"}`} style={{background:r.existe?"rgba(25,118,210,0.1)":"rgba(22,163,74,0.1)"}}>{r.existe?"Existente":"Nuevo"}</span></td></tr>)}</tbody>
                      </table>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={confirmarImport} className="btn-blue px-4 py-2 text-sm font-semibold">Importar {importPrev.filter(p=>!p.existe).length} nuevos</button>
                      <button onClick={()=>setImportPrev([])} className="btn-ghost px-4 py-2 text-sm text-gray-600">Cancelar</button>
                    </div>
                  </div>
                }
                {importMsg&&<p className={`mt-2 text-xs font-semibold ${importMsg.startsWith("✅")?"text-green-600":"text-red-500"}`}>{importMsg}</p>}
              </div>
            )}

            {showForm&&(
              <div className="glass-card p-4 mb-4 fade-in">
                <h3 className="font-bold text-gray-800 mb-4 text-sm">{editProd?"✏️ Editar":"➕"} Productor</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className={lCls}>Nombre *</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} placeholder="Nombre y apellido"/></div>
                  <div><label className={lCls}>Teléfono</label><input type="text" value={form.telefono??""} onChange={e=>setForm({...form,telefono:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Email (si tiene app)</label><input type="email" value={form.email??""} onChange={e=>setForm({...form,email:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Localidad</label><input type="text" value={form.localidad??""} onChange={e=>setForm({...form,localidad:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Honorario tipo</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className={iCls}><option value="mensual">Mensual</option><option value="por_ha">Por HA</option><option value="por_campana">Por campaña</option><option value="por_servicio">Por servicio</option></select></div>
                  <div><label className={lCls}>Honorario $</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls}/></div>
                  <div className="sm:col-span-2"><label className={lCls}>Observaciones</label><input type="text" value={form.obs??""} onChange={e=>setForm({...form,obs:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={guardarProductor} className="btn-blue px-5 py-2.5 text-sm font-semibold">Guardar</button>
                  <button onClick={()=>{setShowForm(false);setEditProd(null);setForm({});}} className="btn-ghost px-4 py-2.5 text-sm text-gray-600">Cancelar</button>
                </div>
              </div>
            )}

            {/* Filtros exportar lotes */}
            {lotes.length>0&&(
              <div className="glass-card p-3 mb-4">
                <div className="flex flex-wrap gap-2 items-end">
                  <span className="text-xs text-gray-500 font-semibold self-center">Exportar lotes:</span>
                  {[["Cultivo",fCultivo,setFCultivo,["todos",...cultivosU]],["Productor",fProductor,setFProductor,["todos",...productores.map(p=>p.nombre)]],["Estado",fEstado,setFEstado,["todos","planificado","sembrado","en_desarrollo","cosechado"]]].map(([l,v,fn,opts])=>(
                    <select key={l as string} value={v as string} onChange={e=>(fn as any)(e.target.value)}
                      className="text-xs text-gray-600 px-2.5 py-1.5 rounded-xl focus:outline-none" style={{background:"rgba(255,255,255,0.7)",border:"1px solid rgba(0,0,0,0.1)"}}>
                      {(opts as string[]).map(o=><option key={o} value={o}>{o==="todos"?"Todos":o}</option>)}
                    </select>
                  ))}
                  <button onClick={()=>exportXLS("lotes")} className="btn-blue px-3 py-1.5 text-xs font-semibold">📤 Exportar</button>
                </div>
              </div>
            )}

            {/* Lista productores */}
            {productores.length===0
              ?<div className="glass-card p-16 text-center"><div className="text-5xl mb-4 opacity-20">👨‍🌾</div><p className="text-gray-400">Sin productores — agregá el primero</p></div>
              :<div className="space-y-4">
                {productores.map(p=>{
                  const eid=p.empresa_id??p.id;
                  const camps=campanasPorProd[eid]??[];
                  const campActiva=campSelProd[eid]??null;
                  const lotesP = lotes.filter(l => (l as any).empresa_id === eid);
                  const haReales = lotesP.reduce((a,l) => a + (Number(l.hectareas)||0), 0);
                  const cultivosProd=[...new Set(lotesP.map(l=>l.cultivo_completo||l.cultivo).filter(Boolean))];
                  return(
                    <div key={p.id} className="prod-card glass-card" style={{boxShadow:"0 8px 24px rgba(0,0,0,0.07)"}}>
                      {/* Header productor */}
                      <div className="px-4 pt-4 pb-3" style={{borderBottom:"1px solid rgba(0,0,0,0.06)"}}>
                        <div className="flex items-start gap-3">
                          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-bold text-white shadow-md flex-shrink-0"
                            style={{background:"linear-gradient(135deg,#1976D2,#0D47A1)"}}>
                            {p.nombre.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-gray-900 truncate text-base">{p.nombre}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{p.localidad}{p.provincia&&p.provincia!==p.localidad?", "+p.provincia:""}</div>
                            {p.tiene_cuenta&&<span className="badge-app text-xs px-2 py-0.5 font-semibold inline-block mt-1">✓ Usa la app</span>}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={()=>{setEditProd(p.id);setForm({nombre:p.nombre,telefono:p.telefono||"",email:p.email||"",localidad:p.localidad||"",provincia:p.provincia||"",honorario_tipo:p.honorario_tipo||"mensual",honorario_monto:String(p.honorario_monto||0),obs:p.observaciones||""});setShowForm(true);}}
                              className="p-2 rounded-xl transition-colors text-gray-400 hover:text-blue-600 hover:bg-blue-50">✏️</button>
                            <button onClick={()=>eliminarProd(p.id)}
                              className="p-2 rounded-xl transition-colors text-gray-400 hover:text-red-500 hover:bg-red-50">✕</button>
                          </div>
                        </div>
                      </div>

                      <div className="px-4 py-3 space-y-3">
                        {/* Campaña */}
                        <div>
                          <label className="block text-xs text-gray-400 font-semibold mb-1.5 uppercase tracking-wide">Campaña</label>
                          <div className="flex gap-2">
                            {camps.length>0
                              ?<select value={campActiva??""} onChange={e=>cambiarCampana(eid,e.target.value,p.nombre)}
                                className="flex-1 text-sm font-semibold text-gray-700 px-3 py-2 rounded-xl focus:outline-none"
                                style={{background:"rgba(255,255,255,0.7)",border:"1px solid rgba(0,0,0,0.1)"}}>
                                {camps.map((c:any)=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
                              </select>
                              :<div className="flex-1 rounded-xl px-3 py-2 text-xs text-gray-400" style={{background:"rgba(0,0,0,0.04)"}}>Sin campañas</div>
                            }
                            <button onClick={()=>{setNuevaCampProd(p.id);setNuevaCampNombre(new Date().getFullYear()+"/"+(new Date().getFullYear()+1));}}
                              className="px-3 py-2 rounded-xl text-xs font-bold transition-colors flex-shrink-0"
                              style={{background:"rgba(234,179,8,0.1)",border:"1px solid rgba(234,179,8,0.25)",color:"#b45309"}}>
                              + Nueva
                            </button>
                          </div>
                          {nuevaCampProd===p.id&&(
                            <div className="flex gap-2 mt-2">
                              <input value={nuevaCampNombre} onChange={e=>setNuevaCampNombre(e.target.value)} className={`${iCls} flex-1 text-xs`} placeholder="2025/2026"/>
                              <button onClick={async()=>{if(nuevaCampNombre.trim()){await crearCampana(eid,nuevaCampNombre.trim());setNuevaCampProd(null);setNuevaCampNombre("");}}} className="btn-blue px-3 py-2 text-xs font-bold">✓</button>
                              <button onClick={()=>{setNuevaCampProd(null);setNuevaCampNombre("");}} className="btn-ghost px-2.5 py-2 text-xs text-gray-500">✕</button>
                            </div>
                          )}
                          <div className="text-xs text-gray-400 mt-1.5 font-medium">{lotesP.length} lotes · {haReales.toLocaleString("es-AR")} ha</div>
                        </div>

                        {/* KPIs */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-2xl p-3 text-center" style={{background:"rgba(234,179,8,0.07)",border:"1px solid rgba(234,179,8,0.18)"}}>
                            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{color:"#b45309"}}>🌿 Hectáreas</div>
                            <div className="text-2xl font-bold" style={{color:"#92400e"}}>{haReales.toLocaleString("es-AR")}</div>
                            <div className="text-xs mt-0.5" style={{color:"#a16207"}}>ha</div>
                          </div>
                          <div className="rounded-2xl p-3 text-center" style={{background:"rgba(25,118,210,0.07)",border:"1px solid rgba(25,118,210,0.18)"}}>
                            <div className="text-xs font-semibold uppercase tracking-wide mb-1 text-blue-600">$ Honorario</div>
                            <div className="text-2xl font-bold text-blue-700">${Number(p.honorario_monto||0).toLocaleString("es-AR")}</div>
                            <div className="text-xs mt-0.5 text-blue-400">{p.honorario_tipo||"mensual"}</div>
                          </div>
                        </div>

                        {/* Distribución cultivos */}
                        {cultivosProd.length>0&&(
                          <div className="rounded-2xl p-3" style={{background:"rgba(0,0,0,0.025)",border:"1px solid rgba(0,0,0,0.06)"}}>
                            <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Distribución de cultivos</div>
                            <div className="flex flex-wrap gap-1.5">
                              {cultivosProd.slice(0,6).map(c=>{
                                const info=getCultivoInfo(c);
                                const haC=lotesP.filter(l=>(l.cultivo_completo||l.cultivo)===c).reduce((a,l)=>a+(l.hectareas||0),0);
                                const pct=haReales>0?Math.round(haC/haReales*100):0;
                                return(
                                  <div key={c} className="cultivo-chip flex items-center gap-1"
                                    style={{background:info.color+"18",border:`1px solid ${info.color}28`,color:info.color}}>
                                    <span>{info.label}</span>
                                    <span style={{opacity:0.6}}>·</span>
                                    <span>{pct}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* CTA */}
                        <button onClick={()=>entrar(p)}
                          className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                          style={{background:"linear-gradient(135deg,#1976D2,#0D47A1)",color:"white",boxShadow:"0 4px 14px rgba(25,118,210,0.3)"}}>
                          <span style={{fontSize:18}}>🏛</span>
                          {p.tiene_cuenta?"Ver Lotes":"Mis Lotes"}
                          <span style={{fontSize:16}}>›</span>
                        </button>
                      </div>

                      {p.observaciones&&<div className="px-4 py-2.5 text-xs text-gray-400" style={{borderTop:"1px solid rgba(0,0,0,0.06)"}}>{p.observaciones}</div>}
                    </div>
                  );
                })}
              </div>
            }
          </div>
        )}

        {/* ══ COBRANZA ══ */}
        {seccion==="cobranza"&&(
          <div className="fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Cobranza</h2>
                <div className="flex gap-3 mt-1">
                  <span className="text-xs font-semibold text-red-500">Pendiente: <strong>${totPend.toLocaleString("es-AR")}</strong></span>
                  <span className="text-xs font-semibold text-green-600">Cobrado: <strong>${totCob.toLocaleString("es-AR")}</strong></span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={async()=>{const XLSX=await import("xlsx");const data=cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return{PRODUCTOR:p?.nombre??"—",CONCEPTO:c.concepto,MONTO:c.monto,FECHA:c.fecha,ESTADO:c.estado};});const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Cobranzas");XLSX.writeFile(wb,"cobranzas_"+new Date().toISOString().slice(0,10)+".xlsx");}} className="btn-ghost px-3 py-2 text-sm text-gray-600">📤</button>
                <button onClick={()=>{setShowForm(!showForm);setForm({estado:"pendiente",fecha_c:new Date().toISOString().split("T")[0]});}} className="btn-blue px-4 py-2 text-sm font-semibold">+ Cobro</button>
              </div>
            </div>

            {showForm&&(
              <div className="glass-card p-4 mb-4 fade-in">
                <h3 className="font-bold text-gray-800 mb-3 text-sm">+ Nuevo cobro</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className={lCls}>Productor</label><select value={form.prod_c??""} onChange={e=>setForm({...form,prod_c:e.target.value})} className={iCls}><option value="">Sin productor</option>{productores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                  <div><label className={lCls}>Concepto</label><input type="text" value={form.concepto??""} onChange={e=>setForm({...form,concepto:e.target.value})} className={iCls} placeholder="Honorario enero"/></div>
                  <div><label className={lCls}>Monto</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_c??""} onChange={e=>setForm({...form,fecha_c:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Estado</label><select value={form.estado??"pendiente"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}><option value="pendiente">Pendiente</option><option value="cobrado">Cobrado</option></select></div>
                  <div><label className={lCls}>Método</label><select value={form.metodo??""} onChange={e=>setForm({...form,metodo:e.target.value})} className={iCls}><option value="">—</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option></select></div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={guardarCob} className="btn-blue px-5 py-2.5 text-sm font-semibold">Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="btn-ghost px-4 py-2.5 text-sm text-gray-600">Cancelar</button>
                </div>
              </div>
            )}

            <div className="glass-card overflow-hidden">
              {cobranzas.length===0?<div className="text-center py-16 text-gray-400">Sin cobros registrados</div>:(
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead><tr style={{borderBottom:"1px solid rgba(0,0,0,0.07)"}}>{["Fecha","Productor","Concepto","Monto","Estado",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">{h}</th>)}</tr></thead>
                    <tbody>
                      {cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return(
                        <tr key={c.id} className="transition-colors" style={{borderBottom:"1px solid rgba(0,0,0,0.05)"}}>
                          <td className="px-4 py-3 text-gray-400 text-xs">{c.fecha}</td>
                          <td className="px-4 py-3 font-semibold text-gray-800 text-xs">{p?.nombre??"—"}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{c.concepto}</td>
                          <td className="px-4 py-3 font-bold text-gray-800">${Number(c.monto).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3"><span className="text-xs px-2.5 py-1 rounded-lg font-semibold" style={{background:c.estado==="cobrado"?"rgba(22,163,74,0.1)":"rgba(239,68,68,0.1)",color:c.estado==="cobrado"?"#16a34a":"#dc2626"}}>{c.estado}</span></td>
                          <td className="px-4 py-3 flex gap-2">
                            {c.estado==="pendiente"&&<button onClick={()=>marcarCobrado(c.id)} className="text-green-600 text-xs hover:underline font-semibold">✓</button>}
                            <button onClick={async()=>{const sb=await getSB();await sb.from("ing_cobranzas").delete().eq("id",c.id);await fetchCobs(ingId);}} className="text-gray-400 hover:text-red-500 text-xs transition-colors">✕</button>
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
          <div className="fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">Mi Vehículo</h2>
              {!vehiculoSel
                ?<button onClick={()=>{setShowForm(true);setForm({});}} className="btn-blue px-4 py-2 text-sm font-semibold">+ Agregar</button>
                :<div className="flex gap-2">
                  <button onClick={()=>{setShowForm(true);setForm({});}} className="btn-ghost px-3 py-2 text-sm text-gray-600">+ Service</button>
                  <button onClick={()=>{setVehiculoSel(null);setServicios([]);setShowForm(false);}} className="btn-ghost px-3 py-2 text-sm text-gray-600">← Volver</button>
                </div>
              }
            </div>
            {showForm&&!vehiculoSel&&(
              <div className="glass-card p-4 mb-4 fade-in">
                <h3 className="font-bold text-gray-800 mb-3 text-sm">+ Nuevo vehículo</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[["nombre","Nombre","Toyota Hilux","text"],["marca","Marca","","text"],["modelo","Modelo","","text"],["anio","Año","","number"],["patente","Patente","","text"],["seg_comp","Compañía seguro","","text"],["seg_venc","Venc. seguro","","date"],["vtv_venc","Venc. VTV","","date"],["km","Km actuales","","number"],["prox_km","Próx. service km","","number"]].map(([k,l,ph,t])=>(
                    <div key={k as string}><label className={lCls}>{l as string}</label><input type={t as string} value={form[k as string]??""} onChange={e=>setForm({...form,[k as string]:e.target.value})} className={iCls} placeholder={ph as string}/></div>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={guardarVeh} className="btn-blue px-5 py-2.5 text-sm font-semibold">Guardar</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="btn-ghost px-4 py-2.5 text-sm text-gray-600">Cancelar</button>
                </div>
              </div>
            )}
            {!vehiculoSel?(
              vehiculos.length===0?<div className="glass-card p-16 text-center"><div className="text-5xl mb-4 opacity-20">🚗</div><p className="text-gray-400">Sin vehículos</p></div>:(
                <div className="space-y-3">
                  {vehiculos.map((v:any)=>{const sV=v.seguro_vencimiento&&new Date(v.seguro_vencimiento)<new Date();const vV=v.vtv_vencimiento&&new Date(v.vtv_vencimiento)<new Date();return(
                    <div key={v.id} className="prod-card glass-card p-4 cursor-pointer" onClick={async()=>{setVehiculoSel(v);const sb=await getSB();const{data}=await sb.from("ing_vehiculo_service").select("*").eq("vehiculo_id",v.id).order("fecha",{ascending:false});setServicios(data??[]);}}>
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0" style={{background:"rgba(25,118,210,0.08)",border:"1px solid rgba(25,118,210,0.15)"}}>🚗</div>
                        <div className="flex-1"><div className="font-bold text-gray-800">{v.nombre}</div><div className="text-xs text-gray-400 mt-0.5">{v.marca} {v.modelo} · {v.anio} · {v.patente}</div></div>
                        <button onClick={e=>{e.stopPropagation();(async()=>{const sb=await getSB();await sb.from("ing_vehiculos").delete().eq("id",v.id);await fetchVehs(ingId);})();}} className="text-gray-400 hover:text-red-500 transition-colors p-1">✕</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="rounded-xl p-3 text-center" style={{background:"rgba(0,0,0,0.03)",border:"1px solid rgba(0,0,0,0.07)"}}><div className="text-xs text-gray-400">Km actuales</div><div className="text-lg font-bold text-gray-800 mt-0.5">{(v.km_actuales||0).toLocaleString()}</div></div>
                        <div className="rounded-xl p-3 text-center" style={{background:"rgba(234,179,8,0.07)",border:"1px solid rgba(234,179,8,0.18)"}}><div className="text-xs font-semibold" style={{color:"#b45309"}}>Próx. service</div><div className="text-lg font-bold mt-0.5" style={{color:"#92400e"}}>{v.proximo_service_km?(v.proximo_service_km.toLocaleString()+" km"):"—"}</div></div>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-xs px-3 py-1.5 rounded-xl font-semibold flex-1 text-center" style={{background:sV?"rgba(239,68,68,0.1)":"rgba(22,163,74,0.08)",color:sV?"#dc2626":"#16a34a",border:`1px solid ${sV?"rgba(239,68,68,0.2)":"rgba(22,163,74,0.15)"}`}}>🛡 {sV?"VENCIDO":v.seguro_vencimiento||"—"}</span>
                        <span className="text-xs px-3 py-1.5 rounded-xl font-semibold flex-1 text-center" style={{background:vV?"rgba(239,68,68,0.1)":"rgba(22,163,74,0.08)",color:vV?"#dc2626":"#16a34a",border:`1px solid ${vV?"rgba(239,68,68,0.2)":"rgba(22,163,74,0.15)"}`}}>📋 {vV?"VTV VENCIDA":v.vtv_vencimiento||"—"}</span>
                      </div>
                    </div>
                  );})}
                </div>
              )
            ):(
              <div className="space-y-4">
                <div className="glass-card p-4 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{background:"rgba(25,118,210,0.08)",border:"1px solid rgba(25,118,210,0.15)"}}>🚗</div>
                  <div><div className="font-bold text-gray-800">{vehiculoSel.nombre}</div><div className="text-xs text-gray-400">{vehiculoSel.marca} {vehiculoSel.modelo} · {(vehiculoSel as any).anio} · {vehiculoSel.patente}</div></div>
                </div>
                {showForm&&vehiculoSel&&(
                  <div className="glass-card p-4 fade-in">
                    <h3 className="font-bold text-gray-800 mb-3 text-sm">+ Service</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><label className={lCls}>Tipo</label><select value={form.tipo_s??"service"} onChange={e=>setForm({...form,tipo_s:e.target.value})} className={iCls}><option value="service">Service</option><option value="reparacion">Reparación</option><option value="vtv">VTV</option><option value="otro">Otro</option></select></div>
                      <div><label className={lCls}>Descripción</label><input type="text" value={form.desc_s??""} onChange={e=>setForm({...form,desc_s:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>Taller</label><input type="text" value={form.taller??""} onChange={e=>setForm({...form,taller:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>Km</label><input type="number" value={form.km_s??""} onChange={e=>setForm({...form,km_s:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>Costo</label><input type="number" value={form.costo_s??""} onChange={e=>setForm({...form,costo_s:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_s??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_s:e.target.value})} className={iCls}/></div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={guardarService} className="btn-blue px-5 py-2.5 text-sm font-semibold">Guardar</button>
                      <button onClick={()=>{setShowForm(false);setForm({});}} className="btn-ghost px-4 py-2.5 text-sm text-gray-600">Cancelar</button>
                    </div>
                  </div>
                )}
                <div className="glass-card overflow-hidden">
                  <div className="px-4 py-3" style={{borderBottom:"1px solid rgba(0,0,0,0.06)"}}><span className="font-bold text-gray-800 text-sm">🔧 Historial de services</span></div>
                  {servicios.length===0?<div className="text-center py-10 text-gray-400 text-sm">Sin historial</div>:(
                    <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]"><thead><tr style={{borderBottom:"1px solid rgba(0,0,0,0.07)"}}>{["Fecha","Tipo","Descripción","Km","Costo",""].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs text-gray-400 font-semibold uppercase tracking-wide">{h}</th>)}</tr></thead>
                      <tbody>{servicios.map(s=><tr key={s.id} style={{borderBottom:"1px solid rgba(0,0,0,0.05)"}}><td className="px-4 py-3 text-gray-400 text-xs">{s.fecha}</td><td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-lg font-semibold" style={{background:"rgba(234,179,8,0.1)",color:"#b45309"}}>{s.tipo}</span></td><td className="px-4 py-3 text-gray-600 text-xs">{s.descripcion}</td><td className="px-4 py-3 text-gray-400 text-xs">{s.km?(s.km.toLocaleString()+" km"):"—"}</td><td className="px-4 py-3 font-bold text-red-500 text-xs">${Number(s.costo).toLocaleString("es-AR")}</td><td className="px-4 py-3"><button onClick={async()=>{const sb=await getSB();await sb.from("ing_vehiculo_service").delete().eq("id",s.id);const sb2=await getSB();const{data}=await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id",vehiculoSel!.id).order("fecha",{ascending:false});setServicios(data??[]);}} className="text-gray-400 hover:text-red-500 text-xs transition-colors">✕</button></td></tr>)}</tbody>
                    </table></div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ IA CAMPO ══ */}
        {seccion==="ia_campo"&&(
          <div className="fade-in">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-800">IA Campo</h2>
              <p className="text-sm text-gray-400 mt-0.5">Dosis, plagas, enfermedades, cultivos y mercados</p>
            </div>
            {aiChat.length===0&&(
              <div className="grid grid-cols-2 gap-2 mb-4">
                {["Dosis glifosato soja","Roya asiática síntomas","Fungicida maíz","Precio soja hoy","Insecticida MIP soja","Trigo siembra pampeana"].map(q=>(
                  <button key={q} onClick={()=>askAI(q)}
                    className="glass-btn text-left text-xs text-gray-500 px-3 py-3 rounded-xl hover:text-blue-700">💬 {q}</button>
                ))}
              </div>
            )}
            <div className="glass-card overflow-hidden mb-3">
              <div className="px-4 py-3 flex items-center justify-between" style={{borderBottom:"1px solid rgba(0,0,0,0.06)"}}>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"/><span className="font-bold text-gray-800 text-sm">IA Agronómica</span></div>
                {aiChat.length>0&&<button onClick={()=>setAiChat([])} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Limpiar</button>}
              </div>
              <div className="p-4 max-h-80 overflow-y-auto flex flex-col gap-3">
                {aiChat.length===0&&<div className="text-center py-8 text-gray-400"><div className="text-3xl mb-2">🌾</div><p className="text-sm">Hacé tu consulta agronómica...</p></div>}
                {aiChat.map((msg,i)=>(
                  <div key={i} className={`flex ${msg.rol==="user"?"justify-end":"justify-start"}`}>
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.rol==="user"?"text-white":"text-gray-700 border"}`}
                      style={msg.rol==="user"?{background:"linear-gradient(135deg,#1976D2,#0D47A1)",boxShadow:"0 4px 14px rgba(25,118,210,0.25)"}:{background:"rgba(255,255,255,0.7)",borderColor:"rgba(0,0,0,0.08)"}}>
                      {msg.rol==="assistant"&&<div className="text-xs font-bold mb-1.5 text-blue-600">◆ IA Agronómica</div>}
                      <p className="whitespace-pre-wrap">{msg.texto}</p>
                    </div>
                  </div>
                ))}
                {aiLoad&&<div className="flex"><div className="px-4 py-3 rounded-2xl border" style={{background:"rgba(255,255,255,0.7)",borderColor:"rgba(0,0,0,0.08)"}}><div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{animationDelay:i*0.15+"s"}}/>)}</div></div></div>}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={escucharVoz} className="p-3 rounded-xl transition-colors flex-shrink-0" style={{background:"rgba(25,118,210,0.1)",border:"1px solid rgba(25,118,210,0.2)",color:"#1976D2"}}>🎤</button>
              <input type="text" value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&askAI()} placeholder="Consultá sobre dosis, plagas, cultivos..." className={`${iCls} flex-1`}/>
              <button onClick={()=>askAI()} disabled={aiLoad||!aiInput.trim()} className="btn-blue disabled:opacity-40 px-4 py-3 text-sm font-bold flex-shrink-0">→</button>
            </div>
          </div>
        )}

        <div className="h-24"/>
      </div>

      {/* ══ PANEL VOZ ══ */}
      {vozPanel&&(
        <div className="fixed bottom-24 right-4 z-50 w-72 rounded-2xl shadow-2xl overflow-hidden" style={{background:"rgba(255,255,255,0.9)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.5)"}}>
          <div className="flex items-center justify-between px-4 py-3" style={{borderBottom:"1px solid rgba(0,0,0,0.06)"}}>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{background:VOZ_COLOR[vozEstado]}}/><span className="text-blue-700 text-xs font-bold">🎤 ASISTENTE</span></div>
            <button onClick={()=>{setVozPanel(false);recRef.current?.stop();setVozEstado("idle");}} className="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
          </div>
          <div className="p-4 min-h-14">
            {vozEstado==="escuchando"&&<p className="text-red-500 text-sm animate-pulse font-medium">🔴 Escuchando...</p>}
            {vozEstado==="procesando"&&<p className="text-amber-600 text-sm font-medium">⚙️ Procesando...</p>}
            {vozEstado==="idle"&&(
              <div className="space-y-1.5">
                {["¿Cuántas ha totales?","Dosis glifosato soja","¿Cuántos productores?"].map(q=>(
                  <button key={q} onClick={()=>{askAI(q);setVozPanel(false);}}
                    className="w-full text-left text-xs text-gray-500 hover:text-blue-700 px-3 py-2 rounded-xl transition-all"
                    style={{background:"rgba(25,118,210,0.05)",border:"1px solid rgba(25,118,210,0.1)"}}>
                    💬 {q}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="px-3 pb-3 flex gap-2 pt-3" style={{borderTop:"1px solid rgba(0,0,0,0.06)"}}>
            <input value={vozInput} onChange={e=>setVozInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){askAI(vozInput);setVozInput("");setVozPanel(false);}}} placeholder="Escribí..." className={`${iCls} flex-1 text-xs py-2`}/>
            <button onClick={escucharVoz} className="px-3 py-2 rounded-xl text-sm transition-colors" style={{background:VOZ_COLOR[vozEstado]+"20",border:"1px solid "+VOZ_COLOR[vozEstado]+"40",color:VOZ_COLOR[vozEstado]}}>{VOZ_ICON[vozEstado]}</button>
          </div>
        </div>
      )}

      {/* Botón flotante voz */}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
        className="fixed bottom-6 right-4 z-40 w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-2xl transition-all"
        style={{background:"linear-gradient(135deg,#1976D2,#0D47A1)",color:"white",animation:vozEstado==="idle"?"float 3s ease-in-out infinite":"none",boxShadow:"0 4px 24px rgba(25,118,210,0.45)"}}>
        {VOZ_ICON[vozEstado]}
      </button>
    </div>
  );
}
