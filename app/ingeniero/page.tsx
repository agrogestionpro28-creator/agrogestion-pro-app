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
  const iCls = "w-full bg-[#1e2a3a] border border-[#2d3f55] rounded-xl px-3 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-green-500 transition-all placeholder:text-gray-600";
  const lCls = "block text-xs text-gray-400 font-medium mb-1.5";
  const cardCls = "bg-[#0f1923] border border-[#1e2d3d] rounded-2xl";

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
    <div className="min-h-screen bg-[#080f17] flex items-center justify-center">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin"/>
        <span className="text-gray-300 font-medium">Cargando...</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080f17] text-gray-100" style={{fontFamily:"'Inter','Segoe UI',system-ui,sans-serif"}}>
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .nav-btn{transition:all 0.15s ease;white-space:nowrap}
        .nav-btn.active{background:rgba(34,197,94,0.15);color:#22c55e;border-color:rgba(34,197,94,0.4)}
        .card-hover{transition:all 0.15s ease}
        .card-hover:hover{border-color:#2d5a3d;transform:translateY(-1px)}
        .prod-card{transition:all 0.15s ease}
        .prod-card:hover{border-color:#1e4a30}
        .fade-in{animation:fadeIn 0.2s ease}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#080f17}
        ::-webkit-scrollbar-thumb{background:#1e2d3d;border-radius:4px}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.5)}
      `}</style>

      {/* ══════════════════════════════════
          TOPBAR — logo + nav horizontal
      ══════════════════════════════════ */}
      <div className="bg-[#0c1520] border-b border-[#1e2d3d] sticky top-0 z-20">
        {/* Fila 1: Logo + usuario */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1a2535]">
          <Image src="/logo.png" alt="AgroGestión PRO" width={130} height={42} className="object-contain"/>
          <div className="flex items-center gap-2.5">
            {alertas.length>0&&(
              <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                <span className="text-red-400 text-xs font-bold">{alertas.length}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                <span className="text-green-400 text-sm font-bold">{ingNombre.charAt(0)}</span>
              </div>
              <div className="hidden sm:block">
                <div className="text-sm font-semibold text-gray-200 leading-none">{ingNombre}</div>
                <div className="text-xs text-gray-500 mt-0.5">Cód. {ingData.codigo}</div>
              </div>
              <button onClick={async()=>{const sb=await getSB();await sb.auth.signOut();window.location.href="/login";}} className="ml-1 text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10">Salir</button>
            </div>
          </div>
        </div>
        {/* Fila 2: nav horizontal scrollable */}
        <div className="flex overflow-x-auto px-3 py-2 gap-1.5 scrollbar-none" style={{scrollbarWidth:"none"}}>
          {NAV.map(item=>(
            <button key={item.k} onClick={()=>{setSeccion(item.k as Seccion);setShowForm(false);setForm({});setVehiculoSel(null);}}
              className={`nav-btn flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border flex-shrink-0 ${seccion===item.k?"active border-green-500/40 text-green-400 bg-green-500/10":"border-[#1e2d3d] text-gray-400 hover:text-gray-200 hover:bg-[#1a2535]"}`}>
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
              {seccion===item.k&&<div className="w-1.5 h-1.5 rounded-full bg-green-400 ml-0.5"/>}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENIDO */}
      <div className="max-w-5xl mx-auto px-4 py-5">

        {/* Toast */}
        {msj&&(
          <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between fade-in ${msj.startsWith("✅")?"bg-green-500/10 text-green-400 border border-green-500/20":"bg-red-500/10 text-red-400 border border-red-500/20"}`}>
            {msj}<button onClick={()=>setMsj("")} className="opacity-60 hover:opacity-100 ml-3 text-base">✕</button>
          </div>
        )}

        {/* Alertas */}
        {alertas.length>0&&(
          <div className="mb-4 bg-red-500/8 border border-red-500/20 rounded-xl p-3 fade-in">
            <div className="flex items-center gap-2 mb-2"><span className="text-red-400 font-semibold text-xs uppercase tracking-wide">⚠ {alertas.length} alerta{alertas.length>1?"s":""}</span></div>
            <div className="flex flex-wrap gap-2">{alertas.map((a,i)=><span key={i} className={`text-xs px-2.5 py-1 rounded-lg font-medium ${a.urgencia==="alta"?"bg-red-500/15 text-red-300":"bg-amber-500/15 text-amber-300"}`}>{a.msg}</span>)}</div>
          </div>
        )}

        {/* ══ GENERAL ══ */}
        {seccion==="general"&&(
          <div className="fade-in space-y-4">
            {/* KPIs — 2x2 grid en mobile */}
            <div className="grid grid-cols-2 gap-3">
              {[
                {l:"Productores",v:productores.length,sub:"activos",icon:"👨‍🌾",accent:"#22c55e",bg:"rgba(34,197,94,0.08)",border:"rgba(34,197,94,0.2)"},
                {l:"Hectáreas",v:totalHa.toLocaleString("es-AR"),sub:"ha totales",icon:"🌿",accent:"#10b981",bg:"rgba(16,185,129,0.08)",border:"rgba(16,185,129,0.2)"},
                {l:"Lotes",v:lotes.length,sub:"activos",icon:"🗺️",accent:"#0ea5e9",bg:"rgba(14,165,233,0.08)",border:"rgba(14,165,233,0.2)"},
                {l:"Con App",v:productores.filter(p=>p.tiene_cuenta).length,sub:"usuarios",icon:"📱",accent:"#a855f7",bg:"rgba(168,85,247,0.08)",border:"rgba(168,85,247,0.2)"},
              ].map(s=>(
                <div key={s.l} className="rounded-2xl p-4" style={{background:s.bg,border:`1px solid ${s.border}`}}>
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-medium uppercase tracking-wide" style={{color:s.accent}}>{s.l}</span>
                    <span className="text-xl">{s.icon}</span>
                  </div>
                  <div className="text-3xl font-bold text-white">{s.v}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Gráfico barras */}
            {haPorCultivo.length>0&&(
              <div className={`${cardCls} p-4`}>
                <div className="mb-3">
                  <h3 className="font-semibold text-gray-100">Hectáreas por Cultivo</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Campaña activa — superficie total {totalHa.toLocaleString("es-AR")} ha</p>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={haPorCultivo} margin={{top:4,right:4,bottom:20,left:-15}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" vertical={false}/>
                    <XAxis dataKey="name" tick={{fontSize:10,fill:"#6b7280",fontFamily:"Inter,sans-serif"}} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end"/>
                    <YAxis tick={{fontSize:10,fill:"#6b7280"}} axisLine={false} tickLine={false}/>
                    <Tooltip formatter={(v:any)=>[v+" ha","Hectáreas"]} contentStyle={{background:"#0f1923",border:"1px solid #1e2d3d",borderRadius:"10px",fontSize:"12px",color:"#e5e7eb"}} cursor={{fill:"rgba(34,197,94,0.05)"}}/>
                    <Bar dataKey="ha" radius={[6,6,0,0]} maxBarSize={56}>
                      {haPorCultivo.map((e,i)=><Cell key={i} fill={e.color}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Distribución + cobranza */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Torta */}
              {haPorCultivo.length>0&&(
                <div className={`${cardCls} p-4`}>
                  <h3 className="font-semibold text-gray-100 mb-3">Distribución %</h3>
                  <div className="flex items-center gap-3">
                    <div style={{width:110,height:110,flexShrink:0}}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={haPorCultivo.map(d=>({...d,value:d.ha}))} cx="50%" cy="50%" outerRadius={50} innerRadius={24} dataKey="value" paddingAngle={3}>
                            {haPorCultivo.map((e,i)=><Cell key={i} fill={e.color}/>)}
                          </Pie>
                          <Tooltip formatter={(v:any,n:string)=>[v+" ha",n]} contentStyle={{background:"#0f1923",border:"1px solid #1e2d3d",borderRadius:"10px",fontSize:"11px",color:"#e5e7eb"}}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-1.5 min-w-0">
                      {haPorCultivo.slice(0,6).map((d,i)=>(
                        <div key={i} className="flex items-center gap-2 min-w-0">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:d.color}}/>
                          <span className="text-xs text-gray-300 flex-1 truncate">{d.name}</span>
                          <span className="text-xs font-semibold flex-shrink-0" style={{color:d.color}}>{Math.round(d.ha/totalHa*100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {/* Cobranza resumen */}
              <div className={`${cardCls} p-4`}>
                <h3 className="font-semibold text-gray-100 mb-3">💰 Cobranza</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-xl" style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.15)"}}>
                    <span className="text-sm text-red-400 font-medium">Pendiente</span>
                    <span className="text-lg font-bold text-red-300">${totPend.toLocaleString("es-AR")}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl" style={{background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.15)"}}>
                    <span className="text-sm text-green-400 font-medium">Cobrado</span>
                    <span className="text-lg font-bold text-green-300">${totCob.toLocaleString("es-AR")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ PRODUCTORES ══ */}
        {seccion==="productores"&&(
          <div className="fade-in">
            {/* Acciones rápidas */}
            <div className={`${cardCls} rounded-2xl overflow-hidden mb-4`}>
              <div className="grid grid-cols-3 divide-x divide-[#1e2d3d]">
                {[
                  {icon:"➕",l:"Nuevo",c:"text-green-400",fn:()=>{setShowForm(!showForm);setEditProd(null);setForm({provincia:"Santa Fe",honorario_tipo:"mensual"});}},
                  {icon:"📥",l:"Importar",c:"text-blue-400",fn:()=>setShowImport(!showImport)},
                  {icon:"📤",l:"Exportar",c:"text-purple-400",fn:()=>exportXLS("productores")},
                ].map(b=>(
                  <button key={b.l} onClick={b.fn} className="flex flex-col items-center gap-1 py-4 hover:bg-[#1a2535] transition-colors">
                    <span className="text-xl">{b.icon}</span>
                    <span className={`text-xs font-semibold ${b.c}`}>{b.l}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Vincular */}
            <button onClick={()=>{setShowVincular(!showVincular);setForm({});}} className="mb-3 flex items-center gap-2 text-sm text-blue-400 font-medium hover:text-blue-300 transition-colors">
              🔗 Vincular productor por código
            </button>

            {showVincular&&(
              <div className={`${cardCls} p-4 mb-4 fade-in`}>
                <h3 className="font-semibold text-gray-200 mb-3 text-sm">🔗 Vincular por código</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div><label className={lCls}>Código *</label><input type="text" value={form.codigo??""} onChange={e=>setForm({...form,codigo:e.target.value})} className={iCls} placeholder="10001"/></div>
                  <div><label className={lCls}>Honorario</label><select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className={iCls}><option value="mensual">Mensual</option><option value="por_ha">Por HA</option><option value="por_campana">Por campaña</option></select></div>
                  <div><label className={lCls}>Monto $</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={vincularCodigo} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-colors">Vincular</button>
                  <button onClick={()=>{setShowVincular(false);setForm({});}} className="bg-[#1e2a3a] hover:bg-[#253447] text-gray-300 px-4 py-2 rounded-xl text-sm transition-colors">Cancelar</button>
                </div>
              </div>
            )}

            {showImport&&(
              <div className={`${cardCls} p-4 mb-4 fade-in`}>
                <div className="flex justify-between mb-3"><h3 className="font-semibold text-gray-200 text-sm">📥 Importar productores</h3><button onClick={()=>{setShowImport(false);setImportPrev([]);setImportMsg("");}} className="text-gray-500 hover:text-gray-300 text-lg">✕</button></div>
                <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)leerExcel(f);}}/>
                {importPrev.length===0
                  ?<button onClick={()=>importRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-[#1e2d3d] rounded-xl text-gray-500 text-sm w-full justify-center hover:border-green-600 hover:text-green-400 transition-colors">📁 Seleccionar archivo Excel</button>
                  :<div>
                    <div className="max-h-36 overflow-y-auto mb-3 rounded-xl border border-[#1e2d3d]">
                      <table className="w-full text-xs"><thead className="bg-[#1a2535]"><tr>{["Nombre","Tel","Localidad","Ha",""].map(h=><th key={h} className="text-left px-3 py-2 text-gray-400 font-medium">{h}</th>)}</tr></thead>
                        <tbody>{importPrev.map((r,i)=><tr key={i} className="border-t border-[#1a2535]"><td className="px-3 py-2 font-medium text-gray-200">{r.nombre}</td><td className="px-3 py-2 text-gray-500">{r.telefono||"—"}</td><td className="px-3 py-2 text-gray-500">{r.localidad||"—"}</td><td className="px-3 py-2 text-gray-400">{r.hectareas_total||"—"}</td><td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full font-medium ${r.existe?"bg-blue-500/15 text-blue-400":"bg-green-500/15 text-green-400"}`}>{r.existe?"Existente":"Nuevo"}</span></td></tr>)}</tbody>
                      </table>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={confirmarImport} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">Importar {importPrev.filter(p=>!p.existe).length} nuevos</button>
                      <button onClick={()=>setImportPrev([])} className="bg-[#1e2a3a] text-gray-400 px-4 py-2 rounded-xl text-sm transition-colors">Cancelar</button>
                    </div>
                  </div>
                }
                {importMsg&&<p className={`mt-2 text-xs font-medium ${importMsg.startsWith("✅")?"text-green-400":"text-red-400"}`}>{importMsg}</p>}
              </div>
            )}

            {showForm&&(
              <div className={`${cardCls} p-4 mb-4 fade-in`}>
                <h3 className="font-semibold text-gray-200 mb-4 text-sm">{editProd?"✏️ Editar":"➕"} Productor</h3>
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
                  <button onClick={guardarProductor} className="bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors">Guardar</button>
                  <button onClick={()=>{setShowForm(false);setEditProd(null);setForm({});}} className="bg-[#1e2a3a] hover:bg-[#253447] text-gray-400 px-4 py-2.5 rounded-xl text-sm transition-colors">Cancelar</button>
                </div>
              </div>
            )}

            {/* Filtros exportar lotes */}
            {lotes.length>0&&(
              <div className={`${cardCls} p-3 mb-4`}>
                <div className="flex flex-wrap gap-2 items-end">
                  <span className="text-xs text-gray-400 font-medium self-center">Exportar lotes:</span>
                  {[["Cultivo",fCultivo,setFCultivo,["todos",...cultivosU]],["Productor",fProductor,setFProductor,["todos",...productores.map(p=>p.nombre)]],["Estado",fEstado,setFEstado,["todos","planificado","sembrado","en_desarrollo","cosechado"]]].map(([l,v,fn,opts])=>(
                    <select key={l as string} value={v as string} onChange={e=>(fn as any)(e.target.value)} className="bg-[#1e2a3a] border border-[#2d3f55] rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-green-500">
                      {(opts as string[]).map(o=><option key={o} value={o}>{o==="todos"?"Todos":o}</option>)}
                    </select>
                  ))}
                  <button onClick={()=>exportXLS("lotes")} className="bg-green-600/20 border border-green-600/30 text-green-400 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-600/30 transition-colors">📤 Exportar</button>
                </div>
              </div>
            )}

            {/* Lista productores */}
            {productores.length===0
              ?<div className={`${cardCls} p-16 text-center`}><div className="text-5xl mb-4 opacity-20">👨‍🌾</div><p className="text-gray-500">Sin productores — agregá el primero</p></div>
              :<div className="space-y-3">
                {productores.map(p=>{
                  const eid=p.empresa_id??p.id;
                  const camps=campanasPorProd[eid]??[];
                  const campActiva=campSelProd[eid]??null;
                  // Filtrar por empresa_id es más robusto que por nombre
                  // Filtrar por empresa_id (siempre guardado en fetchProds)
                  const lotesP = lotes.filter(l => (l as any).empresa_id === eid);
                  const haReales = lotesP.reduce((a,l) => a + (Number(l.hectareas)||0), 0);
                  const cultivosProd=[...new Set(lotesP.map(l=>l.cultivo_completo||l.cultivo).filter(Boolean))];
                  return(
                    <div key={p.id} className={`prod-card ${cardCls}`}>
                      {/* Header */}
                      <div className="px-4 pt-4 pb-3 border-b border-[#1a2535]">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg font-bold" style={{background:"rgba(34,197,94,0.12)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.2)"}}>
                            {p.nombre.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-gray-100 truncate">{p.nombre}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{p.localidad}{p.provincia&&p.provincia!==p.localidad?", "+p.provincia:""}</div>
                            {p.tiene_cuenta&&<div className="text-xs text-green-400 font-medium mt-0.5">✓ Usa la app</div>}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={()=>{setEditProd(p.id);setForm({nombre:p.nombre,telefono:p.telefono||"",email:p.email||"",localidad:p.localidad||"",provincia:p.provincia||"",honorario_tipo:p.honorario_tipo||"mensual",honorario_monto:String(p.honorario_monto||0),obs:p.observaciones||""});setShowForm(true);}} className="p-1.5 rounded-lg hover:bg-[#1e2a3a] text-gray-500 hover:text-amber-400 transition-colors text-sm">✏️</button>
                            <button onClick={()=>eliminarProd(p.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-colors text-sm">✕</button>
                          </div>
                        </div>
                      </div>

                      <div className="px-4 py-3 space-y-3">
                        {/* Campaña */}
                        <div>
                          <label className="block text-xs text-gray-500 font-medium mb-1.5 uppercase tracking-wide">Campaña</label>
                          <div className="flex gap-2">
                            {camps.length>0
                              ?<select value={campActiva??""} onChange={e=>cambiarCampana(eid,e.target.value,p.nombre)} className={`${iCls} flex-1`}>
                                {camps.map((c:any)=><option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>)}
                              </select>
                              :<div className="flex-1 bg-[#1a2535] rounded-xl px-3 py-2.5 text-xs text-gray-600">Sin campañas</div>
                            }
                            <button onClick={()=>{setNuevaCampProd(p.id);setNuevaCampNombre(new Date().getFullYear()+"/"+(new Date().getFullYear()+1));}}
                              className="px-3 py-2 rounded-xl text-xs font-semibold flex-shrink-0 transition-colors" style={{background:"rgba(234,179,8,0.12)",border:"1px solid rgba(234,179,8,0.25)",color:"#eab308"}}>
                              + Nueva
                            </button>
                          </div>
                          {nuevaCampProd===p.id&&(
                            <div className="flex gap-2 mt-2">
                              <input value={nuevaCampNombre} onChange={e=>setNuevaCampNombre(e.target.value)} className={`${iCls} flex-1 text-xs`} placeholder="2025/2026"/>
                              <button onClick={async()=>{if(nuevaCampNombre.trim()){await crearCampana(eid,nuevaCampNombre.trim());setNuevaCampProd(null);setNuevaCampNombre("");}}} className="px-3 py-2 rounded-xl bg-green-600 text-white text-xs font-semibold hover:bg-green-500 transition-colors">✓</button>
                              <button onClick={()=>{setNuevaCampProd(null);setNuevaCampNombre("");}} className="px-2.5 py-2 rounded-xl border border-[#2d3f55] text-gray-500 text-xs hover:text-gray-300 transition-colors">✕</button>
                            </div>
                          )}
                          <div className="text-xs text-gray-600 mt-1.5">{lotesP.length} lotes · {haReales.toLocaleString("es-AR")} ha</div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-xl p-3 text-center" style={{background:"rgba(234,179,8,0.08)",border:"1px solid rgba(234,179,8,0.15)"}}>
                            <div className="text-xs text-amber-500 font-medium">Hectáreas</div>
                            <div className="text-2xl font-bold text-amber-300 mt-0.5">{haReales.toLocaleString("es-AR")}</div>
                          </div>
                          <div className="rounded-xl p-3 text-center" style={{background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.15)"}}>
                            <div className="text-xs text-green-500 font-medium">Honorario</div>
                            <div className="text-2xl font-bold text-green-300 mt-0.5">${(p.honorario_monto||0).toLocaleString("es-AR")}</div>
                          </div>
                        </div>

                        {/* Cultivos */}
                        {cultivosProd.length>0&&(
                          <div className="flex gap-1.5 flex-wrap">
                            {cultivosProd.map(c=>{const info=getCultivoInfo(c);return(
                              <span key={c} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{background:info.color+"18",color:info.color,border:`1px solid ${info.color}30`}}>{info.label}</span>
                            );})}
                          </div>
                        )}

                        {/* Botones */}
                        <div className="flex gap-2 pt-1">
                          {p.telefono&&<a href={"https://wa.me/54"+p.telefono.replace(/\D/g,"")} target="_blank" rel="noreferrer" className="p-2.5 rounded-xl flex-shrink-0 transition-colors" style={{background:"rgba(37,211,102,0.1)",border:"1px solid rgba(37,211,102,0.2)"}}>💬</a>}
                          <button onClick={()=>entrar(p)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5" style={{background:"rgba(34,197,94,0.15)",border:"1px solid rgba(34,197,94,0.3)",color:"#22c55e"}}>
                            {p.tiene_cuenta?"🔗 Ver Lotes":"🌾 Mis Lotes"}
                          </button>
                        </div>
                      </div>

                      {p.observaciones&&<div className="px-4 py-2.5 border-t border-[#1a2535] text-xs text-gray-600">{p.observaciones}</div>}
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
                <h2 className="text-lg font-bold text-gray-100">Cobranza</h2>
                <div className="flex gap-3 mt-1">
                  <span className="text-xs text-red-400">Pendiente: <strong>${totPend.toLocaleString("es-AR")}</strong></span>
                  <span className="text-xs text-green-400">Cobrado: <strong>${totCob.toLocaleString("es-AR")}</strong></span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={async()=>{const XLSX=await import("xlsx");const data=cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return{PRODUCTOR:p?.nombre??"—",CONCEPTO:c.concepto,MONTO:c.monto,FECHA:c.fecha,ESTADO:c.estado};});const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Cobranzas");XLSX.writeFile(wb,"cobranzas_"+new Date().toISOString().slice(0,10)+".xlsx");}} className="bg-[#1e2a3a] hover:bg-[#253447] text-gray-400 px-3 py-2 rounded-xl text-sm transition-colors">📤</button>
                <button onClick={()=>{setShowForm(!showForm);setForm({estado:"pendiente",fecha_c:new Date().toISOString().split("T")[0]});}} className="bg-amber-600/20 border border-amber-600/30 text-amber-400 hover:bg-amber-600/30 px-3 py-2 rounded-xl text-sm font-semibold transition-colors">+ Cobro</button>
              </div>
            </div>

            {showForm&&(
              <div className={`${cardCls} p-4 mb-4 fade-in`}>
                <h3 className="font-semibold text-gray-200 mb-3 text-sm">+ Nuevo cobro</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className={lCls}>Productor</label><select value={form.prod_c??""} onChange={e=>setForm({...form,prod_c:e.target.value})} className={iCls}><option value="">Sin productor</option>{productores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                  <div><label className={lCls}>Concepto</label><input type="text" value={form.concepto??""} onChange={e=>setForm({...form,concepto:e.target.value})} className={iCls} placeholder="Honorario enero"/></div>
                  <div><label className={lCls}>Monto</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_c??""} onChange={e=>setForm({...form,fecha_c:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Estado</label><select value={form.estado??"pendiente"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}><option value="pendiente">Pendiente</option><option value="cobrado">Cobrado</option></select></div>
                  <div><label className={lCls}>Método</label><select value={form.metodo??""} onChange={e=>setForm({...form,metodo:e.target.value})} className={iCls}><option value="">—</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option></select></div>
                </div>
                <div className="flex gap-2 mt-3"><button onClick={guardarCob} className="bg-green-600 hover:bg-green-500 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-colors">Guardar</button><button onClick={()=>{setShowForm(false);setForm({});}} className="bg-[#1e2a3a] text-gray-400 px-4 py-2 rounded-xl text-sm transition-colors">Cancelar</button></div>
              </div>
            )}

            <div className={`${cardCls} overflow-hidden`}>
              {cobranzas.length===0?<div className="text-center py-16 text-gray-600">Sin cobros registrados</div>:(
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead><tr className="border-b border-[#1e2d3d]">{["Fecha","Productor","Concepto","Monto","Estado",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-gray-500 font-semibold">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-[#1a2535]">
                      {cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return(
                        <tr key={c.id} className="hover:bg-[#0f1923]/50 transition-colors">
                          <td className="px-4 py-3 text-gray-500 text-xs">{c.fecha}</td>
                          <td className="px-4 py-3 font-medium text-gray-200 text-xs">{p?.nombre??"—"}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{c.concepto}</td>
                          <td className="px-4 py-3 font-bold text-amber-400">${Number(c.monto).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3"><span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${c.estado==="cobrado"?"bg-green-500/15 text-green-400":"bg-red-500/15 text-red-400"}`}>{c.estado}</span></td>
                          <td className="px-4 py-3 flex gap-2">
                            {c.estado==="pendiente"&&<button onClick={()=>marcarCobrado(c.id)} className="text-green-400 text-xs hover:underline font-medium">✓</button>}
                            <button onClick={async()=>{const sb=await getSB();await sb.from("ing_cobranzas").delete().eq("id",c.id);await fetchCobs(ingId);}} className="text-gray-600 hover:text-red-400 text-xs transition-colors">✕</button>
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
              <h2 className="text-lg font-bold text-gray-100">Mi Vehículo</h2>
              {!vehiculoSel
                ?<button onClick={()=>{setShowForm(true);setForm({});}} className="bg-green-600/20 border border-green-600/30 text-green-400 hover:bg-green-600/30 px-4 py-2 rounded-xl text-sm font-semibold transition-colors">+ Agregar</button>
                :<div className="flex gap-2">
                  <button onClick={()=>{setShowForm(true);setForm({});}} className="bg-amber-600/20 border border-amber-600/30 text-amber-400 px-3 py-2 rounded-xl text-sm transition-colors">+ Service</button>
                  <button onClick={()=>{setVehiculoSel(null);setServicios([]);setShowForm(false);}} className="bg-[#1e2a3a] text-gray-400 px-3 py-2 rounded-xl text-sm transition-colors">← Volver</button>
                </div>
              }
            </div>

            {showForm&&!vehiculoSel&&(
              <div className={`${cardCls} p-4 mb-4 fade-in`}>
                <h3 className="font-semibold text-gray-200 mb-3 text-sm">+ Nuevo vehículo</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[["nombre","Nombre","Toyota Hilux","text"],["marca","Marca","","text"],["modelo","Modelo","","text"],["anio","Año","","number"],["patente","Patente","","text"],["seg_comp","Compañía seguro","","text"],["seg_venc","Venc. seguro","","date"],["vtv_venc","Venc. VTV","","date"],["km","Km actuales","","number"],["prox_km","Próx. service km","","number"]].map(([k,l,ph,t])=>(
                    <div key={k as string}><label className={lCls}>{l as string}</label><input type={t as string} value={form[k as string]??""} onChange={e=>setForm({...form,[k as string]:e.target.value})} className={iCls} placeholder={ph as string}/></div>
                  ))}
                </div>
                <div className="flex gap-2 mt-3"><button onClick={guardarVeh} className="bg-green-600 hover:bg-green-500 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-colors">Guardar</button><button onClick={()=>{setShowForm(false);setForm({});}} className="bg-[#1e2a3a] text-gray-400 px-4 py-2 rounded-xl text-sm transition-colors">Cancelar</button></div>
              </div>
            )}

            {!vehiculoSel?(
              vehiculos.length===0?<div className={`${cardCls} p-16 text-center`}><div className="text-5xl mb-4 opacity-20">🚗</div><p className="text-gray-600">Sin vehículos</p></div>:(
                <div className="space-y-3">
                  {vehiculos.map((v:any)=>{const sV=v.seguro_vencimiento&&new Date(v.seguro_vencimiento)<new Date();const vV=v.vtv_vencimiento&&new Date(v.vtv_vencimiento)<new Date();return(
                    <div key={v.id} className={`prod-card ${cardCls} p-4 cursor-pointer`} onClick={async()=>{setVehiculoSel(v);const sb=await getSB();const{data}=await sb.from("ing_vehiculo_service").select("*").eq("vehiculo_id",v.id).order("fecha",{ascending:false});setServicios(data??[]);}}>
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-11 h-11 rounded-xl bg-[#1e2a3a] border border-[#2d3f55] flex items-center justify-center text-2xl flex-shrink-0">🚗</div>
                        <div className="flex-1"><div className="font-bold text-gray-100">{v.nombre}</div><div className="text-xs text-gray-500 mt-0.5">{v.marca} {v.modelo} · {v.anio} · {v.patente}</div></div>
                        <button onClick={e=>{e.stopPropagation();(async()=>{const sb=await getSB();await sb.from("ing_vehiculos").delete().eq("id",v.id);await fetchVehs(ingId);})();}} className="text-gray-600 hover:text-red-400 transition-colors">✕</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="bg-[#1a2535] rounded-xl p-3 text-center"><div className="text-xs text-gray-500">Km actuales</div><div className="text-lg font-bold text-gray-200 mt-0.5">{(v.km_actuales||0).toLocaleString()}</div></div>
                        <div className="rounded-xl p-3 text-center" style={{background:"rgba(234,179,8,0.08)",border:"1px solid rgba(234,179,8,0.15)"}}><div className="text-xs text-amber-500">Próx. service</div><div className="text-lg font-bold text-amber-300 mt-0.5">{v.proximo_service_km?(v.proximo_service_km.toLocaleString()+" km"):"—"}</div></div>
                      </div>
                      <div className="flex gap-2">
                        <span className={`text-xs px-3 py-1.5 rounded-lg font-medium flex-1 text-center ${sV?"bg-red-500/15 text-red-400":"bg-green-500/10 text-green-400"}`}>🛡 {sV?"VENCIDO":v.seguro_vencimiento||"—"}</span>
                        <span className={`text-xs px-3 py-1.5 rounded-lg font-medium flex-1 text-center ${vV?"bg-red-500/15 text-red-400":"bg-green-500/10 text-green-400"}`}>📋 {vV?"VTV VENCIDA":v.vtv_vencimiento||"—"}</span>
                      </div>
                    </div>
                  );})}
                </div>
              )
            ):(
              <div className="space-y-4">
                <div className={`${cardCls} p-4 flex items-center gap-3`}>
                  <div className="w-12 h-12 rounded-xl bg-[#1e2a3a] flex items-center justify-center text-2xl">🚗</div>
                  <div><div className="font-bold text-gray-100">{vehiculoSel.nombre}</div><div className="text-xs text-gray-500">{vehiculoSel.marca} {vehiculoSel.modelo} · {(vehiculoSel as any).anio} · {vehiculoSel.patente}</div></div>
                </div>
                {showForm&&vehiculoSel&&(
                  <div className={`${cardCls} p-4 fade-in`}>
                    <h3 className="font-semibold text-gray-200 mb-3 text-sm">+ Service</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><label className={lCls}>Tipo</label><select value={form.tipo_s??"service"} onChange={e=>setForm({...form,tipo_s:e.target.value})} className={iCls}><option value="service">Service</option><option value="reparacion">Reparación</option><option value="vtv">VTV</option><option value="otro">Otro</option></select></div>
                      <div><label className={lCls}>Descripción</label><input type="text" value={form.desc_s??""} onChange={e=>setForm({...form,desc_s:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>Taller</label><input type="text" value={form.taller??""} onChange={e=>setForm({...form,taller:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>Km</label><input type="number" value={form.km_s??""} onChange={e=>setForm({...form,km_s:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>Costo</label><input type="number" value={form.costo_s??""} onChange={e=>setForm({...form,costo_s:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_s??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_s:e.target.value})} className={iCls}/></div>
                    </div>
                    <div className="flex gap-2 mt-3"><button onClick={guardarService} className="bg-green-600 hover:bg-green-500 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-colors">Guardar</button><button onClick={()=>{setShowForm(false);setForm({});}} className="bg-[#1e2a3a] text-gray-400 px-4 py-2 rounded-xl text-sm transition-colors">Cancelar</button></div>
                  </div>
                )}
                <div className={`${cardCls} overflow-hidden`}>
                  <div className="px-4 py-3 border-b border-[#1e2d3d]"><span className="font-semibold text-gray-200 text-sm">🔧 Historial</span></div>
                  {servicios.length===0?<div className="text-center py-10 text-gray-600 text-sm">Sin historial</div>:(
                    <div className="overflow-x-auto"><table className="w-full text-sm min-w-[500px]"><thead><tr className="border-b border-[#1e2d3d]">{["Fecha","Tipo","Descripción","Km","Costo",""].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs text-gray-500 font-semibold">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-[#1a2535]">{servicios.map(s=><tr key={s.id} className="hover:bg-[#0f1923]/50"><td className="px-4 py-3 text-gray-500 text-xs">{s.fecha}</td><td className="px-4 py-3"><span className="bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-lg text-xs font-medium">{s.tipo}</span></td><td className="px-4 py-3 text-gray-300 text-xs">{s.descripcion}</td><td className="px-4 py-3 text-gray-500 text-xs">{s.km?(s.km.toLocaleString()+" km"):"—"}</td><td className="px-4 py-3 font-bold text-red-400 text-xs">${Number(s.costo).toLocaleString("es-AR")}</td><td className="px-4 py-3"><button onClick={async()=>{const sb=await getSB();await sb.from("ing_vehiculo_service").delete().eq("id",s.id);const sb2=await getSB();const{data}=await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id",vehiculoSel!.id).order("fecha",{ascending:false});setServicios(data??[]);}} className="text-gray-600 hover:text-red-400 text-xs transition-colors">✕</button></td></tr>)}</tbody>
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
            <div className="mb-4"><h2 className="text-lg font-bold text-gray-100">IA Campo</h2><p className="text-sm text-gray-500 mt-0.5">Dosis, plagas, enfermedades, cultivos y mercados</p></div>
            {aiChat.length===0&&(
              <div className="grid grid-cols-2 gap-2 mb-4">
                {["Dosis glifosato soja","Roya asiática síntomas","Fungicida maíz","Precio soja hoy","Insecticida MIP soja","Trigo siembra pampeana"].map(q=>(
                  <button key={q} onClick={()=>askAI(q)} className="text-left text-xs text-gray-500 border border-[#1e2d3d] px-3 py-3 rounded-xl hover:border-green-600/50 hover:text-green-400 hover:bg-green-950/30 transition-all bg-[#0f1923]">💬 {q}</button>
                ))}
              </div>
            )}
            <div className={`${cardCls} overflow-hidden mb-3`}>
              <div className="px-4 py-3 border-b border-[#1e2d3d] flex items-center justify-between">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/><span className="font-medium text-gray-200 text-sm">IA Agronómica</span></div>
                {aiChat.length>0&&<button onClick={()=>setAiChat([])} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Limpiar</button>}
              </div>
              <div className="p-4 max-h-80 overflow-y-auto flex flex-col gap-3">
                {aiChat.length===0&&<div className="text-center py-8 text-gray-700"><div className="text-3xl mb-2">🌾</div><p className="text-sm">Hacé tu consulta agronómica...</p></div>}
                {aiChat.map((msg,i)=>(
                  <div key={i} className={`flex ${msg.rol==="user"?"justify-end":"justify-start"}`}>
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.rol==="user"?"bg-green-600 text-white":"bg-[#1a2535] text-gray-200 border border-[#2d3f55]"}`}>
                      {msg.rol==="assistant"&&<div className="text-xs text-green-400 font-semibold mb-1.5">◆ IA Agronómica</div>}
                      <p className="whitespace-pre-wrap">{msg.texto}</p>
                    </div>
                  </div>
                ))}
                {aiLoad&&<div className="flex"><div className="bg-[#1a2535] border border-[#2d3f55] px-4 py-3 rounded-2xl"><div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="w-1.5 h-1.5 rounded-full bg-green-600 animate-bounce" style={{animationDelay:i*0.15+"s"}}/>)}</div></div></div>}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={escucharVoz} className="p-3 rounded-xl transition-colors flex-shrink-0" style={{background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.2)",color:"#22c55e"}}>🎤</button>
              <input type="text" value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&askAI()} placeholder="Consultá sobre dosis, plagas, cultivos..." className={`${iCls} flex-1`}/>
              <button onClick={()=>askAI()} disabled={aiLoad||!aiInput.trim()} className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors flex-shrink-0">→</button>
            </div>
          </div>
        )}

        {/* Espacio para botón flotante */}
        <div className="h-24"/>
      </div>

      {/* ══ PANEL VOZ ══ */}
      {vozPanel&&(
        <div className="fixed bottom-24 right-4 z-50 w-72 bg-[#0c1520] border border-[#1e2d3d] rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2d3d]">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{background:VOZ_COLOR[vozEstado]}}/><span className="text-green-400 text-xs font-bold">🎤 ASISTENTE</span></div>
            <button onClick={()=>{setVozPanel(false);recRef.current?.stop();setVozEstado("idle");}} className="text-gray-500 hover:text-gray-300 transition-colors">✕</button>
          </div>
          <div className="p-4 min-h-14">
            {vozEstado==="escuchando"&&<p className="text-red-400 text-sm animate-pulse">🔴 Escuchando...</p>}
            {vozEstado==="procesando"&&<p className="text-amber-400 text-sm">⚙️ Procesando...</p>}
            {vozEstado==="idle"&&(
              <div className="space-y-1.5">
                {["¿Cuántas ha totales?","Dosis glifosato soja","¿Cuántos productores?"].map(q=>(
                  <button key={q} onClick={()=>{askAI(q);setVozPanel(false);}} className="w-full text-left text-xs text-gray-500 hover:text-green-400 border border-[#1e2d3d] hover:border-green-800/50 px-3 py-2 rounded-lg transition-all">💬 {q}</button>
                ))}
              </div>
            )}
          </div>
          <div className="px-3 pb-3 flex gap-2 border-t border-[#1e2d3d] pt-3">
            <input value={vozInput} onChange={e=>setVozInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){askAI(vozInput);setVozInput("");setVozPanel(false);}}} placeholder="Escribí..." className={`${iCls} flex-1 text-xs py-2`}/>
            <button onClick={escucharVoz} className="px-3 py-2 rounded-xl text-sm transition-colors" style={{background:VOZ_COLOR[vozEstado]+"20",border:"1px solid "+VOZ_COLOR[vozEstado]+"50",color:VOZ_COLOR[vozEstado]}}>{VOZ_ICON[vozEstado]}</button>
          </div>
        </div>
      )}

      {/* Botón flotante voz */}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
        className="fixed bottom-6 right-4 z-40 w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-2xl transition-all"
        style={{background:VOZ_COLOR[vozEstado]+"20",border:"2px solid "+VOZ_COLOR[vozEstado]+"80",color:VOZ_COLOR[vozEstado],animation:vozEstado==="idle"?"float 3s ease-in-out infinite":"none",boxShadow:"0 4px 24px "+VOZ_COLOR[vozEstado]+"35"}}>
        {VOZ_ICON[vozEstado]}
      </button>
    </div>
  );
}
