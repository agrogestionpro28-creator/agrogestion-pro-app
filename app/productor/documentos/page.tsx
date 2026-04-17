"use client";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import EscanerIA from "@/components/EscanerIA";

type Carpeta = "factura" | "hacienda" | "agronomica" | "contrato" | "empleado" | "otro";
type Documento = {
  id: string; categoria: Carpeta; subcategoria: string; nombre: string;
  descripcion: string; archivo_url: string; archivo_nombre: string; archivo_tipo: string;
  monto: number; fecha: string; fecha_vencimiento: string;
  proveedor_cliente: string; numero_documento: string; tags: string;
};
type Empleado = {
  id: string; nombre: string; dni: string; cuil: string; categoria: string;
  fecha_ingreso: string; sueldo_basico: number; telefono: string;
  email: string; direccion: string; activo: boolean; observaciones: string;
  // campos expandidos
  fecha_nacimiento: string; estado_civil: string;
  contacto_emergencia: string; telefono_emergencia: string;
  tipo_contratacion: string; jornada_horas_dia: number;
  forma_pago: string; alta_afip: boolean; alta_seguridad_social: boolean;
  art: string; obra_social: string; auth_id: string;
};
type Lote = { id: string; nombre: string; hectareas: number; tipo_alquiler: string; cultivo: string; };
type Contrato = {
  id: string; empresa_id: string; lote_id: string; propietario_nombre: string;
  propietario_telefono: string; propietario_email: string;
  fecha_inicio: string; fecha_fin: string; frecuencia_pago: string;
  condicion: string; monto: number; moneda: string; unidad: string;
  descuentos_comercializacion: number; observaciones: string; archivo_url: string; activo: boolean;
};
type Pago = {
  id: string; contrato_id: string; periodo: string; fecha_vencimiento: string;
  fecha_pago: string; cantidad_qq: number; precio_qq: number;
  monto_pesos: number; descuentos_pct: number; estado: string; observaciones: string;
};

const CARPETAS: Record<Carpeta, { label: string; icon: string; color: string; desc: string }> = {
  factura:    { label: "Facturas y Remitos",    icon: "🧾", color: "#1565c0", desc: "Facturas, remitos, comprobantes de pago" },
  hacienda:   { label: "Hacienda",              icon: "🐄", color: "#16a34a", desc: "DTE, guías de traslado, certificados sanitarios" },
  agronomica: { label: "Carpeta Agronómica",    icon: "🌱", color: "#22c55e", desc: "Recetas, análisis de suelo, mapas de lotes" },
  contrato:   { label: "Contratos de Alquiler", icon: "🏘️", color: "#d97706", desc: "Contratos de campo, acuerdos, escrituras" },
  empleado:   { label: "Empleados",             icon: "👷", color: "#ea580c", desc: "Legajos, contratos laborales, datos personales" },
  otro:       { label: "Otros Documentos",      icon: "📁", color: "#7c3aed", desc: "Seguros, impuestos, documentación general" },
};

const CONDICIONES = [
  { value: "fijo_pesos",  label: "$ Pesos fijo/ha" },
  { value: "fijo_usd",    label: "USD fijo/ha" },
  { value: "quintales",   label: "Quintales/ha" },
  { value: "porcentaje",  label: "% producción" },
  { value: "otros",       label: "Otros (describir)" },
];
const FRECUENCIAS = [
  { value: "mensual",    label: "Mensual" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral",  label: "Semestral" },
  { value: "anual",      label: "Anual / A cosecha" },
];
const CATEGORIAS_LAB = ["peon_general","tractorista","encargado","ordeñador","administrador","tambero","cosechero","aplicador","otro"];
const TIPO_CONTRATACION = ["permanente","temporario","jornalizado","a_prueba"];

export default function DocumentosPage() {
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [usuarioId, setUsuarioId] = useState<string|null>(null);
  const [campanaId, setCampanaId] = useState<string|null>(null);
  const [carpetaActiva, setCarpetaActiva] = useState<Carpeta|null>(null);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showFormContrato, setShowFormContrato] = useState<string|null>(null);
  const [showPagos, setShowPagos] = useState<string|null>(null);
  const [showFormPago, setShowFormPago] = useState<string|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [formPago, setFormPago] = useState<Record<string,string>>({});
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [archivoSel, setArchivoSel] = useState<File|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const contratoFileRef = useRef<HTMLInputElement>(null);
  const [contratoArchivo, setContratoArchivo] = useState<File|null>(null);
  // Empleado expandido
  const [empSeleccionado, setEmpSeleccionado] = useState<Empleado|null>(null);
  const [tabEmp, setTabEmp] = useState("personal");
  const [docEmpArchivo, setDocEmpArchivo] = useState<File|null>(null);
  const docEmpFileRef = useRef<HTMLInputElement>(null);
  const [formDocEmp, setFormDocEmp] = useState<Record<string,string>>({});
  const [showFormDocEmp, setShowFormDocEmp] = useState(false);
  const [docsEmpleado, setDocsEmpleado] = useState<Documento[]>([]);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("id").eq("auth_id", user.id).single();
    if (!u) { setLoading(false); return; }
    setUsuarioId(u.id);
    const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
    if (!emp) {
      const { data: socio } = await sb.from("empresa_socios").select("empresa_id").eq("email", user.email ?? "").single();
      if (socio) {
        setEmpresaId(socio.empresa_id);
        const ca = localStorage.getItem("campana_id");
        if (ca) setCampanaId(ca);
        await fetchAll(socio.empresa_id, ca);
      }
      setLoading(false); return;
    }
    setEmpresaId(emp.id);
    const ca = localStorage.getItem("campana_id");
    if (ca) setCampanaId(ca);
    await fetchAll(emp.id, ca);
    setLoading(false);
  };

  const fetchAll = async (eid: string, campana?: string|null) => {
    const sb = await getSB();
    const cid = campana ?? campanaId;
    const [docs, emps, conts, pgs] = await Promise.all([
      sb.from("documentos").select("*").eq("empresa_id", eid).eq("activo", true).order("created_at", { ascending: false }),
      sb.from("empleados").select("*").eq("empresa_id", eid).order("nombre"),
      sb.from("contratos_alquiler").select("*").eq("empresa_id", eid).eq("activo", true),
      sb.from("contrato_pagos").select("*").eq("empresa_id", eid).order("fecha_vencimiento"),
    ]);
    setDocumentos(docs.data ?? []);
    setEmpleados(emps.data ?? []);
    setContratos(conts.data ?? []);
    setPagos(pgs.data ?? []);
    let lotesData: any[] = [];
    if (cid) {
      const { data } = await sb.from("lotes").select("id,nombre,hectareas,tipo_alquiler,cultivo").eq("empresa_id", eid).eq("campana_id", cid).neq("tipo_alquiler", "propio").order("nombre");
      lotesData = data ?? [];
    }
    if (lotesData.length === 0) {
      const { data } = await sb.from("lotes").select("id,nombre,hectareas,tipo_alquiler,cultivo").eq("empresa_id", eid).neq("tipo_alquiler", "propio").order("nombre");
      lotesData = data ?? [];
    }
    const vistos = new Set<string>();
    setLotes(lotesData.filter((l: any) => { if (vistos.has(l.nombre)) return false; vistos.add(l.nombre); return true; }));
  };

  const fetchDocsEmpleado = async (empId: string) => {
    if (!empresaId) return;
    const sb = await getSB();
    const { data } = await sb.from("documentos").select("*").eq("empresa_id", empresaId).eq("subcategoria", empId).eq("categoria","empleado").eq("activo",true).order("created_at",{ascending:false});
    setDocsEmpleado(data ?? []);
  };

  const subirArchivo = async (file: File, eid: string): Promise<{url:string;nombre:string;tipo:string}|null> => {
    const sb = await getSB();
    const path = `${eid}/${Date.now()}-${file.name}`;
    const { error } = await sb.storage.from("documentos").upload(path, file);
    if (error) { setMsg("Error al subir: "+error.message); return null; }
    const { data: urlData } = sb.storage.from("documentos").getPublicUrl(path);
    return { url: urlData.publicUrl, nombre: file.name, tipo: file.type };
  };

  const guardarDocumento = async () => {
    if (!empresaId) return;
    setUploading(true);
    const sb = await getSB();
    let archivoData = { url:"", nombre:"", tipo:"" };
    if (archivoSel) {
      const result = await subirArchivo(archivoSel, empresaId);
      if (!result) { setUploading(false); return; }
      archivoData = result;
    }
    await sb.from("documentos").insert({
      empresa_id: empresaId, categoria: carpetaActiva??"otro",
      subcategoria: form.subcategoria??"",
      nombre: form.nombre||archivoData.nombre||"Sin nombre",
      descripcion: form.descripcion??"",
      archivo_url: archivoData.url, archivo_nombre: archivoData.nombre,
      archivo_tipo: archivoData.tipo, monto: Number(form.monto??0),
      fecha: form.fecha??new Date().toISOString().split("T")[0],
      fecha_vencimiento: form.fecha_vencimiento||null,
      proveedor_cliente: form.proveedor_cliente??"",
      numero_documento: form.numero_documento??"",
      tags: form.tags??"", activo: true,
    });
    setMsg("✅ Documento guardado");
    await fetchAll(empresaId);
    setShowForm(false); setForm({}); setArchivoSel(null); setUploading(false);
  };

  const guardarDocEmpleado = async () => {
    if (!empresaId || !empSeleccionado) return;
    setUploading(true);
    const sb = await getSB();
    let archivoData = { url:"", nombre:"", tipo:"" };
    if (docEmpArchivo) {
      const result = await subirArchivo(docEmpArchivo, empresaId);
      if (!result) { setUploading(false); return; }
      archivoData = result;
    }
    await sb.from("documentos").insert({
      empresa_id: empresaId,
      categoria: "empleado",
      subcategoria: empSeleccionado.id, // vincula doc al empleado
      nombre: formDocEmp.nombre||archivoData.nombre||"Sin nombre",
      descripcion: formDocEmp.descripcion??"",
      archivo_url: archivoData.url,
      archivo_nombre: archivoData.nombre,
      archivo_tipo: archivoData.tipo,
      monto: 0,
      fecha: formDocEmp.fecha??new Date().toISOString().split("T")[0],
      fecha_vencimiento: formDocEmp.fecha_vencimiento||null,
      proveedor_cliente: empSeleccionado.nombre,
      numero_documento: formDocEmp.numero_documento??"",
      tags: formDocEmp.tipo_doc??"",
      activo: true,
    });
    setMsg("✅ Documento guardado");
    await fetchDocsEmpleado(empSeleccionado.id);
    setShowFormDocEmp(false); setFormDocEmp({}); setDocEmpArchivo(null); setUploading(false);
  };

  const guardarContrato = async (loteId: string) => {
    if (!empresaId) return;
    setUploading(true);
    const sb = await getSB();
    let archivoUrl = "";
    if (contratoArchivo) {
      const result = await subirArchivo(contratoArchivo, empresaId);
      if (result) archivoUrl = result.url;
    }
    const existing = contratos.find(c => c.lote_id === loteId);
    const payload = {
      propietario_nombre: form.propietario_nombre??"",
      propietario_telefono: form.propietario_telefono??"",
      propietario_email: form.propietario_email??"",
      fecha_inicio: form.fecha_inicio||null,
      fecha_fin: form.fecha_fin||null,
      condicion: form.condicion??"fijo_pesos",
      monto: Number(form.monto??0),
      moneda: form.moneda??"ARS",
      unidad: form.unidad??"",
      frecuencia_pago: form.frecuencia_pago??"mensual",
      descuentos_comercializacion: Number(form.descuentos_comercializacion??0),
      observaciones: form.observaciones??"",
      archivo_url: archivoUrl||existing?.archivo_url||"",
    };
    if (existing) {
      await sb.from("contratos_alquiler").update(payload).eq("id", existing.id);
      await generarNotificacionVencimiento(existing.id, payload.fecha_fin, loteId);
    } else {
      const { data: nuevo } = await sb.from("contratos_alquiler").insert({...payload,empresa_id:empresaId,lote_id:loteId,activo:true}).select().single();
      if (nuevo) await generarNotificacionVencimiento(nuevo.id, payload.fecha_fin, loteId);
    }
    setMsg("✅ Contrato guardado");
    await fetchAll(empresaId);
    setShowFormContrato(null); setForm({}); setContratoArchivo(null); setUploading(false);
  };

  const generarNotificacionVencimiento = async (contratoId: string, fechaFin: string, loteId: string) => {
    if (!empresaId || !fechaFin) return;
    const sb = await getSB();
    const lote = lotes.find(l => l.id === loteId);
    const dias = Math.round((new Date(fechaFin).getTime()-Date.now())/(1000*60*60*24));
    if (dias <= 60) {
      await sb.from("notificaciones").insert({ empresa_id: empresaId, tipo: "contrato_vencimiento", titulo: `Contrato por vencer — ${lote?.nombre??""}`, mensaje: `El contrato de alquiler del lote ${lote?.nombre??""} vence en ${dias} días (${fechaFin})`, leida: false, url_destino: "/productor/documentos" });
    }
  };

  const registrarPago = async (contratoId: string) => {
    if (!empresaId) return;
    const sb = await getSB();
    const contrato = contratos.find(c => c.id === contratoId);
    const lote = lotes.find(l => l.id === contrato?.lote_id);
    const cantQq = Number(formPago.cantidad_qq??0);
    const precioQq = Number(formPago.precio_qq??0);
    const descPct = Number(formPago.descuentos_pct??contrato?.descuentos_comercializacion??0);
    const montoPesos = Number(formPago.monto_pesos??(cantQq*precioQq));
    await sb.from("contrato_pagos").insert({ contrato_id: contratoId, empresa_id: empresaId, periodo: formPago.periodo??new Date().toISOString().slice(0,7), fecha_vencimiento: formPago.fecha_vencimiento||null, fecha_pago: formPago.fecha_pago??new Date().toISOString().split("T")[0], cantidad_qq: cantQq, precio_qq: precioQq, monto_pesos: montoPesos, descuentos_pct: descPct, estado: "pagado", observaciones: formPago.observaciones??"" });
    await sb.from("notificaciones").insert({ empresa_id: empresaId, tipo: "pago_alquiler", titulo: `Pago registrado — ${lote?.nombre??""}`, mensaje: `Pago del período ${formPago.periodo??""}: ${cantQq} qq · $${montoPesos.toLocaleString("es-AR")}`, leida: false, url_destino: "/productor/documentos" });
    setMsg("✅ Pago registrado");
    await fetchAll(empresaId);
    setShowFormPago(null); setFormPago({});
  };

  // ── GUARDAR EMPLEADO EXPANDIDO ──
  const guardarEmpleado = async () => {
    if (!empresaId) return;
    setSaving(true);
    const sb = await getSB();
    const payload = {
      empresa_id: empresaId,
      nombre: form.nombre??"",
      dni: form.dni??"",
      cuil: form.cuil??"",
      fecha_nacimiento: form.fecha_nacimiento||null,
      estado_civil: form.estado_civil??"",
      contacto_emergencia: form.contacto_emergencia??"",
      telefono_emergencia: form.telefono_emergencia??"",
      categoria: form.categoria??"peon_general",
      tipo_contratacion: form.tipo_contratacion??"permanente",
      fecha_ingreso: form.fecha_ingreso||null,
      jornada_horas_dia: Number(form.jornada_horas_dia??8),
      sueldo_basico: Number(form.sueldo_basico??0),
      forma_pago: form.forma_pago??"mensual",
      alta_afip: form.alta_afip==="si",
      alta_seguridad_social: form.alta_seguridad_social==="si",
      art: form.art??"",
      obra_social: form.obra_social??"",
      telefono: form.telefono??"",
      email: form.email??"",
      direccion: form.direccion??"",
      observaciones: form.observaciones??"",
      activo: true,
      permisos: [],
    };
    if (empSeleccionado && showForm) {
      await sb.from("empleados").update(payload).eq("id", empSeleccionado.id);
      setMsg("✅ Empleado actualizado");
    } else {
      await sb.from("empleados").insert(payload);
      setMsg("✅ Empleado registrado");
    }
    await fetchAll(empresaId);
    setShowForm(false); setForm({}); setSaving(false);
  };

  const [saving, setSaving] = useState(false);

  const eliminarDoc = async (id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from("documentos").update({ activo: false }).eq("id", id);
    if (empresaId) await fetchAll(empresaId);
    if (empSeleccionado) await fetchDocsEmpleado(empSeleccionado.id);
  };

  const eliminarContrato = async (id: string) => {
    if (!confirm("¿Eliminar contrato?")) return;
    const sb = await getSB();
    await sb.from("contratos_alquiler").update({ activo: false }).eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const toggleEmpleado = async (id: string, activo: boolean) => {
    const sb = await getSB();
    await sb.from("empleados").update({ activo: !activo }).eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const eliminarEmpleado = async (id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from("empleados").delete().eq("id", id);
    if (empresaId) await fetchAll(empresaId);
    setEmpSeleccionado(null);
  };

  const abrirFichaEmpleado = async (e: Empleado) => {
    setEmpSeleccionado(e);
    setTabEmp("personal");
    await fetchDocsEmpleado(e.id);
  };

  const diasParaVencer = (fecha: string) => {
    if (!fecha) return null;
    return Math.round((new Date(fecha).getTime()-Date.now())/(1000*60*60*24));
  };

  const alertasVenc = documentos.filter(d => {
    if (!d.fecha_vencimiento) return false;
    return (new Date(d.fecha_vencimiento).getTime()-Date.now())/(1000*60*60*24) <= 30;
  });
  const alertasContratos = contratos.filter(c => {
    if (!c.fecha_fin) return false;
    const diff = diasParaVencer(c.fecha_fin);
    return diff !== null && diff <= 60;
  });

  const docsFiltrados = documentos.filter(d => {
    const matchCarpeta = carpetaActiva ? d.categoria === carpetaActiva : true;
    const matchBusqueda = busqueda ? d.nombre.toLowerCase().includes(busqueda.toLowerCase())||d.proveedor_cliente?.toLowerCase().includes(busqueda.toLowerCase()) : true;
    return matchCarpeta && matchBusqueda;
  });

  const iCls = "inp w-full px-3 py-2.5 text-[#1a2a4a] text-sm";
  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1.5";
  const contPorCarpeta = (c: Carpeta) => documentos.filter(d => d.categoria === c).length;

  const formatCondicion = (c: Contrato) => {
    switch(c.condicion) {
      case "fijo_pesos": return `$${Number(c.monto).toLocaleString("es-AR")}/ha`;
      case "fijo_usd": return `USD ${c.monto}/ha`;
      case "quintales": return `${c.monto} qq ${c.unidad??""}/ha`;
      case "porcentaje": return `${c.monto}% producción`;
      default: return c.observaciones||`${c.monto}`;
    }
  };

  const pagosDe = (contratoId: string) => pagos.filter(p => p.contrato_id === contratoId);

  const calcularCuotasMensuales = (contrato: Contrato, lote: Lote) => {
    if (contrato.frecuencia_pago === "anual"||contrato.condicion === "porcentaje"||contrato.condicion === "otros") return null;
    const mesesPorFrecuencia: Record<string,number> = { mensual:1, trimestral:3, semestral:6, anual:12 };
    const meses = mesesPorFrecuencia[contrato.frecuencia_pago]??1;
    const montoTotal = Number(contrato.monto)*lote.hectareas;
    return montoTotal/(12/meses);
  };

  if (loading) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:32,height:32,border:"3px solid #1976d2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#1565c0",fontWeight:600}}>Cargando Documentos...</span>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"scroll"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

        .inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;font-family:'DM Sans',system-ui;}
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .inp option{background:white;color:#1a2a4a;}
        .sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:9px 12px;font-size:13px;width:100%;}

        .topbar-d{background-image:url('/FON.png');background-size:cover;background-position:top center;border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar-d::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar-d>*{position:relative;z-index:1;}

        .card-g{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid rgba(255,255,255,1);border-radius:18px;box-shadow:0 6px 24px rgba(20,80,160,0.14),inset 0 2px 0 rgba(255,255,255,0.90);position:relative;overflow:hidden;}
        .card-g::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);pointer-events:none;z-index:0;}
        .card-g>*{position:relative;z-index:1;}

        .sec-w{background:rgba(255,255,255,0.88);border:1.5px solid rgba(255,255,255,0.92);border-radius:16px;box-shadow:0 4px 18px rgba(20,80,160,0.10);overflow:hidden;}

        .sidebar-w{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.90);border-radius:16px;box-shadow:0 4px 16px rgba(20,80,160,0.12);position:relative;overflow:hidden;}
        .sidebar-w::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);pointer-events:none;}
        .sidebar-w>*{position:relative;}

        .carpeta-btn{display:flex;align-items:center;justify-content:space-between;width:100%;padding:9px 14px;border:none;background:transparent;cursor:pointer;transition:background 0.15s;border-bottom:1px solid rgba(0,60,140,0.06);}
        .carpeta-btn:hover{background:rgba(255,255,255,0.60);}
        .carpeta-btn.activa{background:rgba(25,118,210,0.10);}

        .doc-card{background-image:url('/FON.png');background-size:cover;background-position:center;border-radius:16px;box-shadow:0 4px 14px rgba(20,80,160,0.12);cursor:pointer;transition:all 0.20s;position:relative;overflow:hidden;}
        .doc-card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.60);pointer-events:none;}
        .doc-card>*{position:relative;}
        .doc-card:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(20,80,160,0.18);}

        .cont-card{background-image:url('/FON.png');background-size:cover;background-position:center;border-radius:16px;box-shadow:0 4px 14px rgba(20,80,160,0.10);position:relative;overflow:hidden;}
        .cont-card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);pointer-events:none;}
        .cont-card>*{position:relative;}

        .bbtn{background-image:url('/AZUL.png');background-size:cover;background-position:center;border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);border-radius:12px;color:white;font-weight:800;font-size:12px;cursor:pointer;padding:8px 16px;text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);transition:all 0.18s;}
        .bbtn:hover{transform:translateY(-1px);filter:brightness(1.08);}
        .abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);border-radius:12px;color:#1e3a5f;font-weight:700;font-size:12px;cursor:pointer;padding:8px 14px;transition:all 0.18s;}
        .abtn:hover{background:rgba(255,255,255,0.95);}

        .tab-emp{padding:7px 12px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;transition:all 0.18s;border:1.5px solid rgba(255,255,255,0.88);background:rgba(255,255,255,0.65);color:#4a6a8a;white-space:nowrap;}
        .tab-emp.on{background-image:url('/AZUL.png');background-size:cover;color:white;border:1.5px solid rgba(100,180,255,0.45);text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);}

        .kpi-d{background:rgba(255,255,255,0.80);border:1px solid rgba(255,255,255,0.90);border-radius:10px;padding:10px 12px;}

        .fade-in{animation:fadeIn 0.20s ease;}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
        .row-d:hover{background:rgba(255,255,255,0.90)!important;}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar-d" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px"}}>
          <button onClick={()=>empSeleccionado?setEmpSeleccionado(null):window.location.href="/productor/dashboard"} style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700}}>
            ← {empSeleccionado?"Volver":"Dashboard"}
          </button>
          <div style={{flex:1}}/>
          <div style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>📁 Documentos</div>
          <button onClick={()=>window.location.href="/productor/dashboard"} style={{background:"none",border:"none",cursor:"pointer"}}>
            <Image src="/logo.png" alt="Logo" width={90} height={32} style={{objectFit:"contain"}}/>
          </button>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"14px 14px 80px"}}>

        {/* Título + búsqueda */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div>
            <h1 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>📁 Documentos</h1>
            <p style={{fontSize:11,color:"#6b8aaa",margin:"2px 0 0",fontWeight:600}}>Gestión documental integral</p>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <input type="text" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar..." className="inp" style={{padding:"7px 12px",width:180,fontSize:12}}/>
            {carpetaActiva&&carpetaActiva!=="contrato"&&!empSeleccionado&&(
              <button onClick={()=>{setShowForm(!showForm);setForm({fecha:new Date().toISOString().split("T")[0],tipo_contratacion:"permanente",categoria:"peon_general",jornada_horas_dia:"8",forma_pago:"mensual",alta_afip:"no",alta_seguridad_social:"no"});setMsg("");}} className="bbtn">
                + {carpetaActiva==="empleado"?"Nuevo Empleado":"Nuevo Documento"}
              </button>
            )}
          </div>
        </div>

        {/* Alertas */}
        {(alertasVenc.length>0||alertasContratos.length>0)&&(
          <div style={{padding:"10px 14px",marginBottom:14,borderRadius:14,background:"rgba(220,38,38,0.06)",border:"1px solid rgba(220,38,38,0.22)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:"#dc2626"}}/>
              <span style={{fontSize:11,fontWeight:800,color:"#dc2626"}}>⚠️ Alertas ({alertasVenc.length+alertasContratos.length})</span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {alertasContratos.map(c=>{const dias=diasParaVencer(c.fecha_fin);const lote=lotes.find(l=>l.id===c.lote_id);return<div key={c.id} style={{fontSize:10,padding:"3px 10px",borderRadius:7,fontWeight:700,border:`1px solid ${dias!==null&&dias<=30?"rgba(220,38,38,0.30)":"rgba(217,119,6,0.30)"}`,color:dias!==null&&dias<=30?"#dc2626":"#d97706"}}>🏘️ {dias!==null&&dias<=0?"VENCIDO":`${dias} días`} · {lote?.nombre??c.propietario_nombre}</div>;})}
              {alertasVenc.map(d=>{const diff=Math.round((new Date(d.fecha_vencimiento).getTime()-Date.now())/(1000*60*60*24));return<div key={d.id} style={{fontSize:10,padding:"3px 10px",borderRadius:7,fontWeight:700,border:`1px solid ${diff<=7?"rgba(220,38,38,0.30)":"rgba(217,119,6,0.30)"}`,color:diff<=7?"#dc2626":"#d97706"}}>{diff<=0?"🔴 VENCIDO":`🟡 ${diff} días`} · {d.nombre}</div>;})}
            </div>
          </div>
        )}

        {/* Toast */}
        {msg&&<div style={{marginBottom:12,padding:"8px 14px",borderRadius:10,fontSize:13,fontWeight:600,color:msg.startsWith("✅")?"#16a34a":"#dc2626",background:msg.startsWith("✅")?"rgba(220,252,231,0.90)":"rgba(254,226,226,0.90)",border:`1px solid ${msg.startsWith("✅")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>{msg}<button onClick={()=>setMsg("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:0.5}}>✕</button></div>}

        {/* ══ FICHA EMPLEADO EXPANDIDA ══ */}
        {carpetaActiva==="empleado"&&empSeleccionado&&(
          <div className="fade-in">
            {/* Header ficha */}
            <div className="card-g" style={{padding:14,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
                <div style={{width:52,height:52,borderRadius:"50%",background:"rgba(234,88,12,0.10)",border:"2px solid rgba(234,88,12,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:"#ea580c",fontSize:22,flexShrink:0}}>{empSeleccionado.nombre.charAt(0).toUpperCase()}</div>
                <div style={{flex:1}}>
                  <h2 style={{fontSize:18,fontWeight:800,color:"#0d2137",margin:0}}>{empSeleccionado.nombre}</h2>
                  <div style={{fontSize:11,color:"#6b8aaa",fontWeight:600}}>{empSeleccionado.categoria?.replace("_"," ")||"—"} · {empSeleccionado.tipo_contratacion?.replace("_"," ")||"—"}</div>
                  <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:empSeleccionado.activo?"rgba(22,163,74,0.12)":"rgba(220,38,38,0.10)",color:empSeleccionado.activo?"#16a34a":"#dc2626"}}>{empSeleccionado.activo?"Activo":"Inactivo"}</span>
                    {empSeleccionado.alta_afip&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:"rgba(22,163,74,0.10)",color:"#16a34a"}}>AFIP ✅</span>}
                    {empSeleccionado.auth_id&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:"rgba(25,118,210,0.10)",color:"#1565c0"}}>Portal 🔑</span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button onClick={()=>{setShowForm(true);setForm(Object.fromEntries(Object.entries(empSeleccionado).map(([k,v])=>[k,String(v??"")])));}} className="abtn" style={{fontSize:11}}>✏️ Editar</button>
                  <button onClick={()=>window.location.href="/productor/empleados"} className="bbtn" style={{fontSize:11}}>📋 Ver Asistencia y Costos →</button>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
              {[{k:"personal",l:"📋 Datos Personales"},{k:"laboral",l:"💼 Laboral"},{k:"documentos",l:"📎 Documentos"}].map(t=>(
                <button key={t.k} onClick={()=>setTabEmp(t.k)} className={`tab-emp${tabEmp===t.k?" on":""}`}>{t.l}</button>
              ))}
            </div>

            {/* Tab: DATOS PERSONALES */}
            {tabEmp==="personal"&&(
              <div className="sec-w fade-in" style={{padding:16}}>
                <div style={{fontSize:12,fontWeight:800,color:"#0d2137",marginBottom:14}}>📋 Datos Personales</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
                  {[
                    {l:"Nombre completo",v:empSeleccionado.nombre},
                    {l:"DNI",v:empSeleccionado.dni||"—"},
                    {l:"CUIL",v:empSeleccionado.cuil||"—"},
                    {l:"Fecha de nacimiento",v:empSeleccionado.fecha_nacimiento||"—"},
                    {l:"Estado civil",v:empSeleccionado.estado_civil||"—"},
                    {l:"Teléfono",v:empSeleccionado.telefono||"—"},
                    {l:"Email",v:empSeleccionado.email||"—"},
                    {l:"Domicilio",v:empSeleccionado.direccion||"—"},
                    {l:"Contacto emergencia",v:empSeleccionado.contacto_emergencia||"—"},
                    {l:"Tel. emergencia",v:empSeleccionado.telefono_emergencia||"—"},
                  ].map(d=>(
                    <div key={d.l} style={{padding:"9px 12px",borderRadius:10,background:"rgba(255,255,255,0.65)"}}>
                      <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>{d.l}</div>
                      <div style={{fontSize:12,fontWeight:700,color:"#0d2137"}}>{d.v}</div>
                    </div>
                  ))}
                </div>
                {empSeleccionado.observaciones&&<div style={{marginTop:10,padding:"9px 12px",borderRadius:10,background:"rgba(255,255,255,0.65)"}}><div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",marginBottom:3}}>Observaciones</div><div style={{fontSize:12,color:"#0d2137"}}>{empSeleccionado.observaciones}</div></div>}
              </div>
            )}

            {/* Tab: LABORAL */}
            {tabEmp==="laboral"&&(
              <div className="sec-w fade-in" style={{padding:16}}>
                <div style={{fontSize:12,fontWeight:800,color:"#0d2137",marginBottom:14}}>💼 Datos Laborales</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
                  {[
                    {l:"Fecha de ingreso",v:empSeleccionado.fecha_ingreso||"—",c:"#0d2137"},
                    {l:"Tipo contratación",v:empSeleccionado.tipo_contratacion?.replace("_"," ")||"—",c:"#1565c0"},
                    {l:"Categoría laboral",v:empSeleccionado.categoria?.replace("_"," ")||"—",c:"#0d2137"},
                    {l:"Jornada diaria",v:`${empSeleccionado.jornada_horas_dia||8} hs/día`,c:"#0d2137"},
                    {l:"Sueldo básico",v:`$${Number(empSeleccionado.sueldo_basico||0).toLocaleString("es-AR")}`,c:"#d97706"},
                    {l:"Forma de pago",v:empSeleccionado.forma_pago||"mensual",c:"#0d2137"},
                    {l:"Alta AFIP",v:empSeleccionado.alta_afip?"✅ Sí":"❌ No",c:empSeleccionado.alta_afip?"#16a34a":"#dc2626"},
                    {l:"Alta Seg. Social",v:empSeleccionado.alta_seguridad_social?"✅ Sí":"❌ No",c:empSeleccionado.alta_seguridad_social?"#16a34a":"#dc2626"},
                    {l:"ART",v:empSeleccionado.art||"—",c:"#0d2137"},
                    {l:"Obra social",v:empSeleccionado.obra_social||"—",c:"#0d2137"},
                  ].map(d=>(
                    <div key={d.l} style={{padding:"9px 12px",borderRadius:10,background:"rgba(255,255,255,0.65)"}}>
                      <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>{d.l}</div>
                      <div style={{fontSize:12,fontWeight:700,color:d.c}}>{d.v}</div>
                    </div>
                  ))}
                </div>
                {/* Link a módulo empleados */}
                <div style={{marginTop:14,padding:"12px 14px",borderRadius:12,background:"rgba(25,118,210,0.07)",border:"1px solid rgba(25,118,210,0.18)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"#1565c0"}}>📊 Asistencia, costos y gestión operativa</div>
                    <div style={{fontSize:11,color:"#6b8aaa"}}>Para ver planilla de asistencia, horas extra y costos por lote</div>
                  </div>
                  <button onClick={()=>window.location.href="/productor/empleados"} className="bbtn" style={{fontSize:11,whiteSpace:"nowrap"}}>Ver en Empleados →</button>
                </div>
              </div>
            )}

            {/* Tab: DOCUMENTOS DEL EMPLEADO */}
            {tabEmp==="documentos"&&(
              <div className="fade-in">
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#0d2137"}}>📎 Documentación del Empleado</div>
                  <button onClick={()=>{setShowFormDocEmp(!showFormDocEmp);setFormDocEmp({fecha:new Date().toISOString().split("T")[0],tipo_doc:"dni"});}} className="bbtn" style={{fontSize:11}}>+ Agregar documento</button>
                </div>

                {/* Tipos de docs sugeridos */}
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                  {["DNI","Constancia CUIL","Alta AFIP","Recibo sueldo","Contrato","Certificado médico","Capacitación"].map(t=>(
                    <span key={t} style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:600,background:"rgba(234,88,12,0.08)",color:"#ea580c",border:"1px solid rgba(234,88,12,0.20)"}}>{t}</span>
                  ))}
                </div>

                {showFormDocEmp&&(
                  <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#ea580c",marginBottom:12}}>+ Nuevo Documento</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                      <div><label className={lCls}>Tipo de documento</label>
                        <select value={formDocEmp.tipo_doc??"dni"} onChange={e=>setFormDocEmp({...formDocEmp,tipo_doc:e.target.value,nombre:e.target.value.replace("_"," ")})} className="sel">
                          <option value="dni">DNI</option>
                          <option value="cuil">Constancia CUIL</option>
                          <option value="alta_afip">Alta AFIP</option>
                          <option value="recibo_sueldo">Recibo de sueldo</option>
                          <option value="contrato_laboral">Contrato laboral</option>
                          <option value="certificado_medico">Certificado médico</option>
                          <option value="capacitacion">Capacitación</option>
                          <option value="epp">EPP / Seguridad</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>
                      <div><label className={lCls}>Nombre</label><input type="text" value={formDocEmp.nombre??""} onChange={e=>setFormDocEmp({...formDocEmp,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>N° Documento</label><input type="text" value={formDocEmp.numero_documento??""} onChange={e=>setFormDocEmp({...formDocEmp,numero_documento:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Número o referencia"/></div>
                      <div><label className={lCls}>Fecha</label><input type="date" value={formDocEmp.fecha??""} onChange={e=>setFormDocEmp({...formDocEmp,fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Vencimiento</label><input type="date" value={formDocEmp.fecha_vencimiento??""} onChange={e=>setFormDocEmp({...formDocEmp,fecha_vencimiento:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Descripción</label><input type="text" value={formDocEmp.descripcion??""} onChange={e=>setFormDocEmp({...formDocEmp,descripcion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Notas opcionales"/></div>
                      <div style={{gridColumn:"span 2"}}>
                        <label className={lCls}>Archivo adjunto (PDF / imagen)</label>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <input ref={docEmpFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style={{display:"none"}} onChange={e=>setDocEmpArchivo(e.target.files?.[0]??null)}/>
                          <button onClick={()=>docEmpFileRef.current?.click()} className="abtn" style={{fontSize:11}}>📎 Seleccionar archivo</button>
                          {docEmpArchivo?<span style={{fontSize:11,color:"#16a34a",fontWeight:600}}>✓ {docEmpArchivo.name}</span>:<span style={{fontSize:11,color:"#6b8aaa"}}>Sin archivo</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={guardarDocEmpleado} disabled={uploading} className="bbtn">{uploading?"Subiendo...":"▶ Guardar"}</button>
                      <button onClick={()=>{setShowFormDocEmp(false);setFormDocEmp({});setDocEmpArchivo(null);}} className="abtn">Cancelar</button>
                    </div>
                  </div>
                )}

                {docsEmpleado.length===0?(
                  <div className="card-g" style={{padding:"32px 20px",textAlign:"center"}}>
                    <div style={{fontSize:36,opacity:0.12,marginBottom:8}}>📎</div>
                    <p style={{color:"#6b8aaa",fontSize:13}}>Sin documentos cargados para este empleado</p>
                    <p style={{color:"#6b8aaa",fontSize:11,marginTop:3}}>Agregá DNI, CUIL, alta AFIP, recibos de sueldo, etc.</p>
                  </div>
                ):(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>
                    {docsEmpleado.map(d=>{
                      const vencido=d.fecha_vencimiento&&new Date(d.fecha_vencimiento)<new Date();
                      const porVencer=d.fecha_vencimiento&&!vencido&&(new Date(d.fecha_vencimiento).getTime()-Date.now())/(1000*60*60*24)<=30;
                      return(
                        <div key={d.id} className="doc-card" style={{padding:12,border:`1.5px solid ${vencido?"rgba(220,38,38,0.30)":porVencer?"rgba(217,119,6,0.30)":"rgba(255,255,255,0.88)"}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                            <div style={{width:34,height:34,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,background:"rgba(234,88,12,0.08)",border:"1px solid rgba(234,88,12,0.18)",flexShrink:0}}>
                              {d.archivo_tipo?.includes("pdf")?"📄":d.archivo_tipo?.includes("image")?"🖼️":"📋"}
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:12,fontWeight:800,color:"#0d2137"}}>{d.nombre}</div>
                              {d.tags&&<div style={{fontSize:10,color:"#ea580c",fontWeight:600}}>{d.tags.replace("_"," ")}</div>}
                            </div>
                            {vencido&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:20,fontWeight:700,background:"rgba(220,38,38,0.10)",color:"#dc2626"}}>VENCIDO</span>}
                            {porVencer&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:20,fontWeight:700,background:"rgba(217,119,6,0.10)",color:"#d97706"}}>⚠️</span>}
                          </div>
                          <div style={{fontSize:10,color:"#6b8aaa",marginBottom:6}}>
                            {d.fecha&&<span>📅 {d.fecha}</span>}
                            {d.fecha_vencimiento&&<span style={{marginLeft:8,color:vencido?"#dc2626":porVencer?"#d97706":"#6b8aaa"}}>· Vence: {d.fecha_vencimiento}</span>}
                          </div>
                          {d.descripcion&&<div style={{fontSize:10,color:"#6b8aaa",marginBottom:6}}>💬 {d.descripcion}</div>}
                          <div style={{display:"flex",gap:8,paddingTop:6,borderTop:"1px solid rgba(0,60,140,0.06)"}}>
                            {d.archivo_url&&<a href={d.archivo_url} target="_blank" rel="noreferrer" style={{fontSize:11,color:"#16a34a",fontWeight:700}}>📎 Ver archivo</a>}
                            <button onClick={()=>eliminarDoc(d.id)} style={{fontSize:10,color:"#aab8c8",background:"none",border:"none",cursor:"pointer",marginLeft:"auto"}}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Form editar empleado */}
            {showForm&&(
              <div className="card-g fade-in" style={{padding:16,marginTop:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#ea580c",marginBottom:14}}>✏️ Editar — {empSeleccionado.nombre}</div>

                <div style={{fontSize:11,fontWeight:800,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8,paddingBottom:4,borderBottom:"1px solid rgba(0,60,140,0.08)"}}>📋 Datos Personales</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:14}}>
                  <div><label className={lCls}>Nombre completo</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>DNI</label><input type="text" value={form.dni??""} onChange={e=>setForm({...form,dni:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>CUIL</label><input type="text" value={form.cuil??""} onChange={e=>setForm({...form,cuil:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Fecha nacimiento</label><input type="date" value={form.fecha_nacimiento??""} onChange={e=>setForm({...form,fecha_nacimiento:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Estado civil</label><select value={form.estado_civil??""} onChange={e=>setForm({...form,estado_civil:e.target.value})} className="sel"><option value="">Seleccionar</option><option value="soltero">Soltero/a</option><option value="casado">Casado/a</option><option value="divorciado">Divorciado/a</option><option value="viudo">Viudo/a</option></select></div>
                  <div><label className={lCls}>Teléfono</label><input type="text" value={form.telefono??""} onChange={e=>setForm({...form,telefono:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Email</label><input type="email" value={form.email??""} onChange={e=>setForm({...form,email:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Domicilio</label><input type="text" value={form.direccion??""} onChange={e=>setForm({...form,direccion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Contacto emergencia</label><input type="text" value={form.contacto_emergencia??""} onChange={e=>setForm({...form,contacto_emergencia:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Tel. emergencia</label><input type="text" value={form.telefono_emergencia??""} onChange={e=>setForm({...form,telefono_emergencia:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>

                <div style={{fontSize:11,fontWeight:800,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8,paddingBottom:4,borderBottom:"1px solid rgba(0,60,140,0.08)"}}>💼 Datos Laborales</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:14}}>
                  <div><label className={lCls}>Fecha de ingreso</label><input type="date" value={form.fecha_ingreso??""} onChange={e=>setForm({...form,fecha_ingreso:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Tipo contratación</label><select value={form.tipo_contratacion??"permanente"} onChange={e=>setForm({...form,tipo_contratacion:e.target.value})} className="sel">{TIPO_CONTRATACION.map(t=><option key={t} value={t}>{t.replace("_"," ")}</option>)}</select></div>
                  <div><label className={lCls}>Categoría</label><select value={form.categoria??"peon_general"} onChange={e=>setForm({...form,categoria:e.target.value})} className="sel">{CATEGORIAS_LAB.map(c=><option key={c} value={c}>{c.replace("_"," ")}</option>)}</select></div>
                  <div><label className={lCls}>Jornada (hs/día)</label><input type="number" value={form.jornada_horas_dia??"8"} onChange={e=>setForm({...form,jornada_horas_dia:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} min="1" max="12"/></div>
                  <div><label className={lCls}>Sueldo básico</label><input type="number" value={form.sueldo_basico??""} onChange={e=>setForm({...form,sueldo_basico:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Forma de pago</label><select value={form.forma_pago??"mensual"} onChange={e=>setForm({...form,forma_pago:e.target.value})} className="sel"><option value="mensual">Mensual</option><option value="quincenal">Quincenal</option><option value="semanal">Semanal</option><option value="jornal">Por jornal</option></select></div>
                  <div><label className={lCls}>Alta AFIP</label><select value={form.alta_afip??"no"} onChange={e=>setForm({...form,alta_afip:e.target.value})} className="sel"><option value="si">✅ Sí</option><option value="no">❌ No</option></select></div>
                  <div><label className={lCls}>Alta Seg. Social</label><select value={form.alta_seguridad_social??"no"} onChange={e=>setForm({...form,alta_seguridad_social:e.target.value})} className="sel"><option value="si">✅ Sí</option><option value="no">❌ No</option></select></div>
                  <div><label className={lCls}>ART</label><input type="text" value={form.art??""} onChange={e=>setForm({...form,art:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Aseguradora"/></div>
                  <div><label className={lCls}>Obra social</label><input type="text" value={form.obra_social??""} onChange={e=>setForm({...form,obra_social:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div style={{gridColumn:"span 2"}}><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>

                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarEmpleado} disabled={saving} className="bbtn">{saving?"Guardando...":"▶ Guardar cambios"}</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Layout con sidebar — solo cuando NO hay ficha abierta */}
        {!(carpetaActiva==="empleado"&&empSeleccionado)&&(
        <div style={{display:"flex",gap:14}}>

          {/* ── SIDEBAR ── */}
          <div style={{width:220,flexShrink:0}}>
            <div className="sidebar-w" style={{marginBottom:12}}>
              <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                <span style={{fontSize:10,fontWeight:800,color:"#0d2137",textTransform:"uppercase",letterSpacing:0.8}}>◆ Carpetas</span>
              </div>
              <button className={`carpeta-btn${!carpetaActiva?" activa":""}`} onClick={()=>{setCarpetaActiva(null);setShowForm(false);setBusqueda("");}}>
                <span style={{fontSize:12,fontWeight:700,color:"#0d2137"}}>📂 Todos</span>
                <span style={{fontSize:10,color:"#6b8aaa",fontWeight:700}}>{documentos.length}</span>
              </button>
              {(Object.keys(CARPETAS) as Carpeta[]).map(c=>{
                const config=CARPETAS[c];
                const count=c==="empleado"?empleados.length:c==="contrato"?contratos.length:contPorCarpeta(c);
                const alertas=c==="contrato"?alertasContratos.length:alertasVenc.filter(d=>d.categoria===c).length;
                return(
                  <button key={c} className={`carpeta-btn${carpetaActiva===c?" activa":""}`} onClick={()=>{setCarpetaActiva(c);setShowForm(false);setMsg("");setEmpSeleccionado(null);}}>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <span style={{fontSize:14}}>{config.icon}</span>
                      <span style={{fontSize:11,fontWeight:700,color:carpetaActiva===c?config.color:"#4a6a8a"}}>{config.label}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      {alertas>0&&<span style={{fontSize:10,color:"#dc2626"}}>⚠️</span>}
                      <span style={{fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:20,background:`${config.color}20`,color:config.color}}>{count}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="sidebar-w" style={{padding:12}}>
              <div style={{fontSize:10,fontWeight:800,color:"#0d2137",textTransform:"uppercase",marginBottom:10}}>Resumen</div>
              {[
                {label:"Total docs",value:documentos.length,color:"#1565c0"},
                {label:"Contratos activos",value:contratos.length,color:"#d97706"},
                {label:"Pagos registrados",value:pagos.length,color:"#1565c0"},
                {label:"Empleados activos",value:empleados.filter(e=>e.activo).length,color:"#ea580c"},
                {label:"Por vencer",value:alertasVenc.length+alertasContratos.length,color:"#dc2626"},
              ].map(s=>(
                <div key={s.label} style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:11}}>
                  <span style={{color:"#6b8aaa",fontWeight:600}}>{s.label}</span>
                  <span style={{fontWeight:800,color:s.color}}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── CONTENIDO ── */}
          <div style={{flex:1,minWidth:0}}>

            {/* Vista general */}
            {!carpetaActiva&&(
              <div className="fade-in">
                <div style={{fontSize:14,fontWeight:800,color:"#0d2137",marginBottom:12}}>📂 Todas las Carpetas</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
                  {(Object.keys(CARPETAS) as Carpeta[]).map(c=>{
                    const config=CARPETAS[c];
                    const count=c==="empleado"?empleados.length:c==="contrato"?contratos.length:contPorCarpeta(c);
                    const venc=c==="contrato"?alertasContratos.length:alertasVenc.filter(d=>d.categoria===c).length;
                    return(
                      <div key={c} className="doc-card" style={{border:`1.5px solid rgba(255,255,255,0.88)`,padding:16,cursor:"pointer"}} onClick={()=>{setCarpetaActiva(c);setShowForm(false);}}>
                        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
                          <div style={{width:44,height:44,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,background:`${config.color}15`,border:`1px solid ${config.color}30`}}>{config.icon}</div>
                          {venc>0&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:"rgba(220,38,38,0.10)",color:"#dc2626",border:"1px solid rgba(220,38,38,0.25)"}}>⚠️ {venc}</span>}
                        </div>
                        <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:3}}>{config.label}</div>
                        <div style={{fontSize:11,color:"#6b8aaa",marginBottom:10,fontWeight:500}}>{config.desc}</div>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <span style={{fontSize:24,fontWeight:800,color:config.color}}>{count}</span>
                          <span style={{fontSize:11,color:"#6b8aaa",fontWeight:600}}>{c==="empleado"?"empleados":c==="contrato"?"contratos":"documentos"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══ CONTRATOS ══ */}
            {carpetaActiva==="contrato"&&(
              <div className="fade-in">
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <span style={{fontSize:24}}>🏘️</span>
                  <div>
                    <div style={{fontSize:15,fontWeight:800,color:"#0d2137"}}>Contratos de Alquiler</div>
                    <p style={{fontSize:11,color:"#d97706",fontWeight:600,margin:0}}>{lotes.length} lotes no propios · {contratos.length} contratos · {pagos.length} pagos registrados</p>
                  </div>
                </div>
                {lotes.length===0?(
                  <div className="card-g" style={{padding:"48px 20px",textAlign:"center"}}>
                    <div style={{fontSize:40,opacity:0.12,marginBottom:10}}>🏘️</div>
                    <p style={{color:"#6b8aaa",fontSize:14}}>No hay lotes alquilados</p>
                  </div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    {lotes.map(lote=>{
                      const contrato=contratos.find(c=>c.lote_id===lote.id);
                      const dias=contrato?.fecha_fin?diasParaVencer(contrato.fecha_fin):null;
                      const vencido=dias!==null&&dias<=0;
                      const porVencer60=dias!==null&&dias>0&&dias<=60;
                      const porVencer30=dias!==null&&dias>0&&dias<=30;
                      const editando=showFormContrato===lote.id;
                      const pagosDelContrato=contrato?pagosDe(contrato.id):[];
                      const cuotaMensual=contrato?calcularCuotasMensuales(contrato,lote):null;
                      return(
                        <div key={lote.id} className="cont-card" style={{border:`1.5px solid ${vencido?"rgba(220,38,38,0.30)":porVencer30?"rgba(220,38,38,0.20)":porVencer60?"rgba(217,119,6,0.30)":"rgba(255,255,255,0.88)"}`}}>
                          <div style={{padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                            <div style={{display:"flex",alignItems:"center",gap:12}}>
                              <div style={{width:40,height:40,borderRadius:10,background:"rgba(217,119,6,0.10)",border:"1px solid rgba(217,119,6,0.28)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:"#d97706",fontSize:12}}>{lote.hectareas}</div>
                              <div>
                                <div style={{fontSize:14,fontWeight:800,color:"#0d2137"}}>{lote.nombre}</div>
                                <div style={{display:"flex",gap:8,fontSize:11,fontWeight:600}}>
                                  <span style={{color:"#d97706"}}>{lote.hectareas} Ha</span>
                                  <span style={{color:"#6b8aaa"}}>· {lote.tipo_alquiler}</span>
                                  {lote.cultivo&&<span style={{color:"#16a34a"}}>· {lote.cultivo.toUpperCase()}</span>}
                                </div>
                              </div>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                              {!contrato&&<span style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,background:"rgba(107,138,170,0.12)",color:"#6b8aaa",border:"1px solid rgba(107,138,170,0.25)"}}>Sin contrato</span>}
                              {contrato&&vencido&&<span style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,background:"rgba(220,38,38,0.10)",color:"#dc2626",border:"1px solid rgba(220,38,38,0.28)"}}>🔴 VENCIDO</span>}
                              {contrato&&porVencer30&&!vencido&&<span style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,background:"rgba(220,38,38,0.08)",color:"#dc2626",border:"1px solid rgba(220,38,38,0.20)"}}>⚠️ {dias} días</span>}
                              {contrato&&porVencer60&&!porVencer30&&<span style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,background:"rgba(217,119,6,0.10)",color:"#d97706",border:"1px solid rgba(217,119,6,0.25)"}}>🟡 {dias} días</span>}
                              {contrato&&!vencido&&!porVencer60&&<span style={{fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,background:"rgba(22,163,74,0.10)",color:"#16a34a",border:"1px solid rgba(22,163,74,0.25)"}}>✓ Vigente</span>}
                              {contrato&&<button onClick={()=>setShowPagos(showPagos===contrato.id?null:contrato.id)} style={{fontSize:11,padding:"5px 12px",borderRadius:9,fontWeight:700,background:"rgba(25,118,210,0.08)",border:"1px solid rgba(25,118,210,0.25)",color:"#1565c0",cursor:"pointer"}}>💳 {pagosDelContrato.length} pagos</button>}
                              <button onClick={()=>{if(editando){setShowFormContrato(null);setForm({});}else{setShowFormContrato(lote.id);setForm(contrato?{propietario_nombre:contrato.propietario_nombre??"",propietario_telefono:contrato.propietario_telefono??"",propietario_email:contrato.propietario_email??"",fecha_inicio:contrato.fecha_inicio??"",fecha_fin:contrato.fecha_fin??"",condicion:contrato.condicion??"fijo_pesos",monto:String(contrato.monto??0),unidad:contrato.unidad??"",frecuencia_pago:contrato.frecuencia_pago??"mensual",descuentos_comercializacion:String(contrato.descuentos_comercializacion??0),observaciones:contrato.observaciones??""}:{condicion:"quintales",frecuencia_pago:"mensual",unidad:"soja",descuentos_comercializacion:"7"});}}} className="abtn" style={{fontSize:11}}>{editando?"Cancelar":contrato?"✏️ Editar":"+ Cargar contrato"}</button>
                            </div>
                          </div>
                          {contrato&&!editando&&(
                            <div style={{padding:"0 14px 14px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8}}>
                              {[
                                {l:"PROPIETARIO",v:contrato.propietario_nombre||"—",extra:contrato.propietario_telefono?<a href={`https://wa.me/54${contrato.propietario_telefono.replace(/\D/g,"")}?text=Hola ${contrato.propietario_nombre}!`} target="_blank" rel="noreferrer" style={{fontSize:10,color:"#16a34a",display:"block",marginTop:2}}>💬 {contrato.propietario_telefono}</a>:null},
                                {l:"CONDICIÓN",v:formatCondicion(contrato),extra:<><div style={{fontSize:10,color:"#6b8aaa",marginTop:2}}>{contrato.condicion==="quintales"?`${Number(contrato.monto)*lote.hectareas} qq ${contrato.unidad??""}`:contrato.condicion==="fijo_usd"?`USD ${Number(contrato.monto)*lote.hectareas}`:contrato.condicion==="fijo_pesos"?`$${(Number(contrato.monto)*lote.hectareas).toLocaleString("es-AR")}`:""} total/año</div>{contrato.descuentos_comercializacion>0&&<div style={{fontSize:10,color:"#dc2626",marginTop:1}}>⚠️ Desc. comerc.: {contrato.descuentos_comercializacion}%</div>}</>},
                                {l:"VIGENCIA",v:`${contrato.fecha_inicio||"—"} al ${contrato.fecha_fin||"—"}`,extra:<div style={{fontSize:10,color:"#1565c0",marginTop:2}}>{contrato.frecuencia_pago??"mensual"}</div>},
                                {l:"PAGOS",v:`${pagosDelContrato.length} registrados`,extra:<>{contrato.archivo_url&&<a href={contrato.archivo_url} target="_blank" rel="noreferrer" style={{fontSize:10,color:"#16a34a",display:"block",marginTop:2}}>📎 Ver PDF</a>}<button onClick={()=>eliminarContrato(contrato.id)} style={{fontSize:10,color:"#aab8c8",background:"none",border:"none",cursor:"pointer",display:"block",marginTop:2}}>✕ Eliminar</button></>},
                              ].map(d=>(
                                <div key={d.l} className="kpi-d">
                                  <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>{d.l}</div>
                                  <div style={{fontSize:12,fontWeight:800,color:"#0d2137"}}>{d.v}</div>
                                  {(d as any).extra}
                                </div>
                              ))}
                            </div>
                          )}
                          {contrato&&showPagos===contrato.id&&!editando&&(
                            <div style={{borderTop:"1px solid rgba(25,118,210,0.15)",background:"rgba(255,255,255,0.50)",padding:"12px 14px"}}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                                <span style={{fontSize:11,fontWeight:800,color:"#1565c0"}}>💳 Historial de Pagos</span>
                                <button onClick={()=>{setShowFormPago(contrato.id);setFormPago({periodo:new Date().toISOString().slice(0,7),descuentos_pct:String(contrato.descuentos_comercializacion??0)});}} style={{fontSize:11,padding:"4px 10px",borderRadius:8,fontWeight:700,background:"rgba(25,118,210,0.08)",border:"1px solid rgba(25,118,210,0.25)",color:"#1565c0",cursor:"pointer"}}>+ Registrar pago</button>
                              </div>
                              {showFormPago===contrato.id&&(
                                <div className="card-g" style={{padding:12,marginBottom:10}}>
                                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:10}}>
                                    <div><label className={lCls}>Período</label><input type="month" value={formPago.periodo??""} onChange={e=>setFormPago({...formPago,periodo:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 12px"}}/></div>
                                    <div><label className={lCls}>Fecha pago</label><input type="date" value={formPago.fecha_pago??new Date().toISOString().split("T")[0]} onChange={e=>setFormPago({...formPago,fecha_pago:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 12px"}}/></div>
                                    {contrato.condicion==="quintales"&&(<><div><label className={lCls}>Quintales pagados</label><input type="number" value={formPago.cantidad_qq??""} onChange={e=>setFormPago({...formPago,cantidad_qq:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 12px"}}/></div><div><label className={lCls}>Precio qq ({contrato.unidad}) $/tn</label><input type="number" value={formPago.precio_qq??""} onChange={e=>setFormPago({...formPago,precio_qq:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 12px"}}/></div><div><label className={lCls}>% Desc. comerc.</label><input type="number" value={formPago.descuentos_pct??""} onChange={e=>setFormPago({...formPago,descuentos_pct:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 12px"}}/></div></>)}
                                    <div><label className={lCls}>Monto total $</label><input type="number" value={formPago.monto_pesos??""} onChange={e=>setFormPago({...formPago,monto_pesos:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 12px"}}/></div>
                                    <div><label className={lCls}>Observaciones</label><input type="text" value={formPago.observaciones??""} onChange={e=>setFormPago({...formPago,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 12px"}}/></div>
                                  </div>
                                  {contrato.condicion==="quintales"&&formPago.cantidad_qq&&formPago.descuentos_pct&&(<div style={{marginBottom:10,padding:"7px 10px",borderRadius:8,background:"rgba(217,119,6,0.08)",border:"1px solid rgba(217,119,6,0.20)",fontSize:11,color:"#d97706",fontWeight:600}}>Para pagar {formPago.cantidad_qq} qq netos con {formPago.descuentos_pct}% de descuentos → vendés <strong>{(Number(formPago.cantidad_qq)/(1-Number(formPago.descuentos_pct)/100)).toFixed(1)} qq brutos</strong></div>)}
                                  <div style={{display:"flex",gap:8}}><button onClick={()=>registrarPago(contrato.id)} className="bbtn" style={{fontSize:11,padding:"7px 14px"}}>▶ Registrar</button><button onClick={()=>{setShowFormPago(null);setFormPago({});}} className="abtn" style={{fontSize:11,padding:"7px 12px"}}>Cancelar</button></div>
                                </div>
                              )}
                              {pagosDelContrato.length===0?<p style={{fontSize:11,color:"#6b8aaa",textAlign:"center",padding:"10px 0"}}>Sin pagos registrados</p>:<div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:180,overflowY:"auto"}}>{pagosDelContrato.map(p=>(<div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,0.65)"}}><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:11,fontWeight:800,color:"#0d2137"}}>{p.periodo}</span>{p.cantidad_qq>0&&<span style={{fontSize:11,color:"#d97706",fontWeight:600}}>{p.cantidad_qq} qq</span>}{p.precio_qq>0&&<span style={{fontSize:10,color:"#6b8aaa"}}>@ ${p.precio_qq}/tn</span>}</div><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:11,fontWeight:800,color:"#16a34a"}}>${Number(p.monto_pesos).toLocaleString("es-AR")}</span><span style={{fontSize:10,color:"#6b8aaa"}}>{p.fecha_pago}</span><span style={{fontSize:9,padding:"2px 7px",borderRadius:20,fontWeight:700,background:"rgba(22,163,74,0.10)",color:"#16a34a"}}>✓ Pagado</span></div></div>))}</div>}
                            </div>
                          )}
                          {editando&&(
                            <div style={{padding:"12px 14px 14px",borderTop:"1px solid rgba(217,119,6,0.15)"}}>
                              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                                <div><label className={lCls}>Propietario del campo</label><input type="text" value={form.propietario_nombre??""} onChange={e=>setForm({...form,propietario_nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Nombre y apellido"/></div>
                                <div><label className={lCls}>Teléfono / WhatsApp</label><input type="text" value={form.propietario_telefono??""} onChange={e=>setForm({...form,propietario_telefono:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="11-1234-5678"/></div>
                                <div><label className={lCls}>Email</label><input type="email" value={form.propietario_email??""} onChange={e=>setForm({...form,propietario_email:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                                <div><label className={lCls}>Condición de alquiler</label><select value={form.condicion??"quintales"} onChange={e=>setForm({...form,condicion:e.target.value})} className="sel">{CONDICIONES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                                {form.condicion!=="otros"&&form.condicion!=="porcentaje"&&<div><label className={lCls}>{form.condicion==="fijo_pesos"?"Monto $/ha/año":form.condicion==="fijo_usd"?"Monto USD/ha/año":"Quintales/ha/año"}</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>}
                                {form.condicion==="porcentaje"&&<div><label className={lCls}>% de producción</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>}
                                {form.condicion==="quintales"&&<div><label className={lCls}>Especie (soja, trigo...)</label><input type="text" value={form.unidad??"soja"} onChange={e=>setForm({...form,unidad:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>}
                                {form.condicion!=="otros"&&<div><label className={lCls}>Descuentos comerc. (%)</label><input type="number" value={form.descuentos_comercializacion??"7"} onChange={e=>setForm({...form,descuentos_comercializacion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>}
                                <div><label className={lCls}>Frecuencia de pago</label><select value={form.frecuencia_pago??"mensual"} onChange={e=>setForm({...form,frecuencia_pago:e.target.value})} className="sel">{FRECUENCIAS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
                                <div><label className={lCls}>Inicio del contrato</label><input type="date" value={form.fecha_inicio??""} onChange={e=>setForm({...form,fecha_inicio:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                                <div><label className={lCls}>Fin / Vencimiento</label><input type="date" value={form.fecha_fin??""} onChange={e=>setForm({...form,fecha_fin:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                                <div style={{gridColumn:"span 3"}}><label className={lCls}>{form.condicion==="otros"?"Descripción de la condición de pago":"Observaciones"}</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder={form.condicion==="otros"?"Describí la forma de pago acordada...":"Notas del contrato"}/></div>
                                <div style={{gridColumn:"span 3"}}><label className={lCls}>Adjuntar contrato (PDF)</label><div style={{display:"flex",alignItems:"center",gap:10}}><input ref={contratoFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style={{display:"none"}} onChange={e=>setContratoArchivo(e.target.files?.[0]??null)}/><button onClick={()=>contratoFileRef.current?.click()} className="abtn" style={{fontSize:11}}>📎 Seleccionar PDF</button>{contratoArchivo&&<span style={{fontSize:11,color:"#16a34a",fontWeight:600}}>✓ {contratoArchivo.name}</span>}</div></div>
                              </div>
                              {form.monto&&form.condicion!=="otros"&&(<div style={{marginBottom:10,padding:"8px 12px",borderRadius:10,background:"rgba(217,119,6,0.08)",border:"1px solid rgba(217,119,6,0.20)",fontSize:11,color:"#d97706",fontWeight:600}}>Total anual: <strong>{form.condicion==="quintales"?`${Number(form.monto)*lote.hectareas} qq ${form.unidad??"soja"}`:form.condicion==="fijo_usd"?`USD ${Number(form.monto)*lote.hectareas}`:`$${(Number(form.monto)*lote.hectareas).toLocaleString("es-AR")}`}</strong>{form.descuentos_comercializacion&&Number(form.descuentos_comercializacion)>0&&<span style={{color:"#dc2626",marginLeft:8}}>· Con {form.descuentos_comercializacion}% desc. → vendés {form.condicion==="quintales"?`${(Number(form.monto)*lote.hectareas/(1-Number(form.descuentos_comercializacion)/100)).toFixed(1)} qq brutos`:"más"}</span>}</div>)}
                              <div style={{display:"flex",gap:8}}><button onClick={()=>guardarContrato(lote.id)} disabled={uploading} className="bbtn">{uploading?"Guardando...":"▶ Guardar Contrato"}</button><button onClick={()=>{setShowFormContrato(null);setForm({});setContratoArchivo(null);}} className="abtn">Cancelar</button></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ══ EMPLEADOS — LISTA ══ */}
            {carpetaActiva==="empleado"&&!empSeleccionado&&(
              <div className="fade-in">
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:22}}>👷</span>
                    <div>
                      <div style={{fontSize:15,fontWeight:800,color:"#0d2137"}}>Empleados</div>
                      <p style={{fontSize:11,color:"#ea580c",fontWeight:600,margin:0}}>{empleados.filter(e=>e.activo).length} activos · {empleados.filter(e=>!e.activo).length} inactivos</p>
                    </div>
                  </div>
                  <button onClick={()=>window.location.href="/productor/empleados"} style={{fontSize:11,padding:"7px 12px",borderRadius:10,fontWeight:700,background:"rgba(25,118,210,0.08)",border:"1px solid rgba(25,118,210,0.25)",color:"#1565c0",cursor:"pointer"}}>📊 Asistencia y Costos →</button>
                </div>

                {/* Form nuevo empleado */}
                {showForm&&(
                  <div className="card-g fade-in" style={{padding:16,marginBottom:14}}>
                    <div style={{fontSize:13,fontWeight:800,color:"#ea580c",marginBottom:14}}>+ Nuevo Empleado</div>

                    <div style={{fontSize:11,fontWeight:800,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8,paddingBottom:4,borderBottom:"1px solid rgba(0,60,140,0.08)"}}>📋 Datos Personales</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:14}}>
                      <div><label className={lCls}>Nombre completo</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Apellido y nombre"/></div>
                      <div><label className={lCls}>DNI</label><input type="text" value={form.dni??""} onChange={e=>setForm({...form,dni:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>CUIL</label><input type="text" value={form.cuil??""} onChange={e=>setForm({...form,cuil:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="20-12345678-9"/></div>
                      <div><label className={lCls}>Fecha nacimiento</label><input type="date" value={form.fecha_nacimiento??""} onChange={e=>setForm({...form,fecha_nacimiento:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Estado civil</label><select value={form.estado_civil??""} onChange={e=>setForm({...form,estado_civil:e.target.value})} className="sel"><option value="">Seleccionar</option><option value="soltero">Soltero/a</option><option value="casado">Casado/a</option><option value="divorciado">Divorciado/a</option><option value="viudo">Viudo/a</option></select></div>
                      <div><label className={lCls}>Teléfono</label><input type="text" value={form.telefono??""} onChange={e=>setForm({...form,telefono:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Email</label><input type="email" value={form.email??""} onChange={e=>setForm({...form,email:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Domicilio</label><input type="text" value={form.direccion??""} onChange={e=>setForm({...form,direccion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Contacto emergencia</label><input type="text" value={form.contacto_emergencia??""} onChange={e=>setForm({...form,contacto_emergencia:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Tel. emergencia</label><input type="text" value={form.telefono_emergencia??""} onChange={e=>setForm({...form,telefono_emergencia:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                    </div>

                    <div style={{fontSize:11,fontWeight:800,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8,paddingBottom:4,borderBottom:"1px solid rgba(0,60,140,0.08)"}}>💼 Datos Laborales</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:14}}>
                      <div><label className={lCls}>Fecha de ingreso</label><input type="date" value={form.fecha_ingreso??""} onChange={e=>setForm({...form,fecha_ingreso:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Tipo contratación</label><select value={form.tipo_contratacion??"permanente"} onChange={e=>setForm({...form,tipo_contratacion:e.target.value})} className="sel">{TIPO_CONTRATACION.map(t=><option key={t} value={t}>{t.replace("_"," ")}</option>)}</select></div>
                      <div><label className={lCls}>Categoría</label><select value={form.categoria??"peon_general"} onChange={e=>setForm({...form,categoria:e.target.value})} className="sel">{CATEGORIAS_LAB.map(c=><option key={c} value={c}>{c.replace("_"," ")}</option>)}</select></div>
                      <div><label className={lCls}>Jornada (hs/día)</label><input type="number" value={form.jornada_horas_dia??"8"} onChange={e=>setForm({...form,jornada_horas_dia:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} min="1" max="12"/></div>
                      <div><label className={lCls}>Sueldo básico</label><input type="number" value={form.sueldo_basico??""} onChange={e=>setForm({...form,sueldo_basico:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Forma de pago</label><select value={form.forma_pago??"mensual"} onChange={e=>setForm({...form,forma_pago:e.target.value})} className="sel"><option value="mensual">Mensual</option><option value="quincenal">Quincenal</option><option value="semanal">Semanal</option><option value="jornal">Por jornal</option></select></div>
                      <div><label className={lCls}>Alta AFIP</label><select value={form.alta_afip??"no"} onChange={e=>setForm({...form,alta_afip:e.target.value})} className="sel"><option value="si">✅ Sí</option><option value="no">❌ No</option></select></div>
                      <div><label className={lCls}>Alta Seg. Social</label><select value={form.alta_seguridad_social??"no"} onChange={e=>setForm({...form,alta_seguridad_social:e.target.value})} className="sel"><option value="si">✅ Sí</option><option value="no">❌ No</option></select></div>
                      <div><label className={lCls}>ART</label><input type="text" value={form.art??""} onChange={e=>setForm({...form,art:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Aseguradora de riesgos"/></div>
                      <div><label className={lCls}>Obra social</label><input type="text" value={form.obra_social??""} onChange={e=>setForm({...form,obra_social:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div style={{gridColumn:"span 2"}}><label className={lCls}>Observaciones</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={guardarEmpleado} disabled={saving} className="bbtn">{saving?"Guardando...":"▶ Guardar Empleado"}</button>
                      <button onClick={()=>{setShowForm(false);setForm({});}} className="abtn">Cancelar</button>
                    </div>
                  </div>
                )}

                {/* Grid empleados */}
                {empleados.length===0?(
                  <div className="card-g" style={{padding:"48px 20px",textAlign:"center"}}>
                    <div style={{fontSize:40,opacity:0.12,marginBottom:10}}>👷</div>
                    <p style={{color:"#6b8aaa",fontSize:14}}>Sin empleados registrados</p>
                  </div>
                ):(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
                    {empleados.map(e=>(
                      <div key={e.id} className="doc-card" style={{padding:14,cursor:"pointer"}} onClick={()=>abrirFichaEmpleado(e)}>
                        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:38,height:38,borderRadius:"50%",background:"rgba(234,88,12,0.10)",border:"1px solid rgba(234,88,12,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:"#ea580c",fontSize:16,flexShrink:0}}>{e.nombre.charAt(0).toUpperCase()}</div>
                            <div>
                              <div style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>{e.nombre}</div>
                              <div style={{fontSize:11,color:"#6b8aaa"}}>{e.categoria?.replace("_"," ")??"—"}</div>
                            </div>
                          </div>
                          <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,background:e.activo?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.10)",color:e.activo?"#16a34a":"#dc2626"}}>{e.activo?"Activo":"Inactivo"}</span>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,fontSize:11,marginBottom:10}}>
                          <div><span style={{color:"#6b8aaa"}}>DNI: </span><span style={{color:"#4a6a8a"}}>{e.dni||"—"}</span></div>
                          <div><span style={{color:"#6b8aaa"}}>CUIL: </span><span style={{color:"#4a6a8a"}}>{e.cuil||"—"}</span></div>
                          <div><span style={{color:"#6b8aaa"}}>Ingreso: </span><span style={{color:"#4a6a8a"}}>{e.fecha_ingreso||"—"}</span></div>
                          <div><span style={{color:"#6b8aaa"}}>Sueldo: </span><span style={{color:"#ea580c",fontWeight:800}}>${Number(e.sueldo_basico||0).toLocaleString("es-AR")}</span></div>
                          {e.alta_afip&&<div style={{gridColumn:"span 2"}}><span style={{fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:700,background:"rgba(22,163,74,0.10)",color:"#16a34a"}}>AFIP ✅</span>{e.auth_id&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:700,background:"rgba(25,118,210,0.10)",color:"#1565c0",marginLeft:4}}>Portal 🔑</span>}</div>}
                        </div>
                        <div style={{display:"flex",gap:10,paddingTop:8,borderTop:"1px solid rgba(0,60,140,0.08)"}}>
                          <span style={{fontSize:11,color:"#1565c0",fontWeight:600}}>Ver ficha completa →</span>
                          <button onClick={e2=>{e2.stopPropagation();toggleEmpleado(e.id,e.activo);}} style={{fontSize:11,color:"#6b8aaa",background:"none",border:"none",cursor:"pointer",fontWeight:600,marginLeft:"auto"}}>{e.activo?"Dar de baja":"Reactivar"}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ══ DOCUMENTOS GENÉRICOS ══ */}
            {carpetaActiva&&carpetaActiva!=="empleado"&&carpetaActiva!=="contrato"&&(
              <div className="fade-in">
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <span style={{fontSize:22}}>{CARPETAS[carpetaActiva].icon}</span>
                  <div>
                    <div style={{fontSize:15,fontWeight:800,color:"#0d2137"}}>{CARPETAS[carpetaActiva].label}</div>
                    <p style={{fontSize:11,fontWeight:600,margin:0,color:CARPETAS[carpetaActiva].color}}>{CARPETAS[carpetaActiva].desc}</p>
                  </div>
                </div>
                {showForm&&(
                  <div className="card-g fade-in" style={{padding:14,marginBottom:14}}>
                    <div style={{fontSize:13,fontWeight:800,color:"#0d2137",marginBottom:12}}>+ Nuevo Documento</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                      <div style={{gridColumn:"span 2"}}><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Subcategoría</label><input type="text" value={form.subcategoria??""} onChange={e=>setForm({...form,subcategoria:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>N° Documento</label><input type="text" value={form.numero_documento??""} onChange={e=>setForm({...form,numero_documento:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Proveedor / Cliente</label><input type="text" value={form.proveedor_cliente??""} onChange={e=>setForm({...form,proveedor_cliente:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Monto</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Vencimiento</label><input type="date" value={form.fecha_vencimiento??""} onChange={e=>setForm({...form,fecha_vencimiento:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div><label className={lCls}>Descripción</label><input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                      <div style={{gridColumn:"span 3"}}><label className={lCls}>Archivo adjunto</label><div style={{display:"flex",alignItems:"center",gap:10}}><input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx" onChange={e=>setArchivoSel(e.target.files?.[0]??null)} style={{display:"none"}}/><button onClick={()=>fileRef.current?.click()} className="abtn" style={{fontSize:11}}>📎 Seleccionar</button>{archivoSel?<span style={{fontSize:11,color:"#16a34a",fontWeight:600}}>✓ {archivoSel.name}</span>:<span style={{fontSize:11,color:"#6b8aaa"}}>Sin archivo</span>}</div></div>
                    </div>
                    <div style={{display:"flex",gap:8}}><button onClick={guardarDocumento} disabled={uploading} className="bbtn">{uploading?"Subiendo...":"▶ Guardar"}</button><button onClick={()=>{setShowForm(false);setForm({});setArchivoSel(null);}} className="abtn">Cancelar</button></div>
                  </div>
                )}
                {docsFiltrados.length===0?(
                  <div className="card-g" style={{padding:"48px 20px",textAlign:"center"}}>
                    <div style={{fontSize:40,opacity:0.12,marginBottom:10}}>{CARPETAS[carpetaActiva].icon}</div>
                    <p style={{color:"#6b8aaa",fontSize:14}}>Sin documentos en esta carpeta</p>
                    <button onClick={()=>setShowForm(true)} style={{marginTop:12,fontSize:11,padding:"6px 14px",borderRadius:9,fontWeight:700,background:`${CARPETAS[carpetaActiva].color}10`,border:`1px solid ${CARPETAS[carpetaActiva].color}30`,color:CARPETAS[carpetaActiva].color,cursor:"pointer"}}>+ Agregar</button>
                  </div>
                ):(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
                    {docsFiltrados.map(d=>{
                      const vencido=d.fecha_vencimiento&&new Date(d.fecha_vencimiento)<new Date();
                      const porVencer=d.fecha_vencimiento&&!vencido&&(new Date(d.fecha_vencimiento).getTime()-Date.now())/(1000*60*60*24)<=30;
                      const config=CARPETAS[d.categoria];
                      return(
                        <div key={d.id} className="doc-card" style={{padding:14,border:`1.5px solid ${vencido?"rgba(220,38,38,0.30)":porVencer?"rgba(217,119,6,0.30)":"rgba(255,255,255,0.88)"}`}}>
                          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <div style={{width:38,height:38,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,background:`${config.color}15`,border:`1px solid ${config.color}30`}}>{d.archivo_tipo?.includes("pdf")?"📄":d.archivo_tipo?.includes("image")?"🖼️":config.icon}</div>
                              <div><div style={{fontSize:12,fontWeight:800,color:"#0d2137"}}>{d.nombre}</div>{d.subcategoria&&<div style={{fontSize:10,color:"#6b8aaa"}}>{d.subcategoria}</div>}</div>
                            </div>
                            {vencido&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:20,fontWeight:700,background:"rgba(220,38,38,0.10)",color:"#dc2626"}}>VENCIDO</span>}
                            {porVencer&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:20,fontWeight:700,background:"rgba(217,119,6,0.10)",color:"#d97706"}}>⚠️ Por vencer</span>}
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:11,marginBottom:8}}>
                            {d.proveedor_cliente&&<div><span style={{color:"#6b8aaa"}}>De/Para: </span><span style={{color:"#4a6a8a"}}>{d.proveedor_cliente}</span></div>}
                            {d.numero_documento&&<div><span style={{color:"#6b8aaa"}}>N°: </span><span style={{color:"#4a6a8a"}}>{d.numero_documento}</span></div>}
                            <div><span style={{color:"#6b8aaa"}}>Fecha: </span><span style={{color:"#4a6a8a"}}>{d.fecha}</span></div>
                            {d.fecha_vencimiento&&<div><span style={{color:"#6b8aaa"}}>Vence: </span><span style={{color:vencido?"#dc2626":porVencer?"#d97706":"#4a6a8a"}}>{d.fecha_vencimiento}</span></div>}
                            {d.monto>0&&<div><span style={{color:"#6b8aaa"}}>Monto: </span><span style={{color:"#d97706",fontWeight:800}}>${Number(d.monto).toLocaleString("es-AR")}</span></div>}
                          </div>
                          {d.descripcion&&<div style={{fontSize:10,color:"#6b8aaa",marginBottom:8}}>💬 {d.descripcion}</div>}
                          <div style={{display:"flex",gap:10,paddingTop:8,borderTop:"1px solid rgba(0,60,140,0.08)"}}>
                            {d.archivo_url&&<a href={d.archivo_url} target="_blank" rel="noreferrer" style={{fontSize:11,color:"#16a34a",fontWeight:700}}>📎 Ver</a>}
                            <button onClick={()=>eliminarDoc(d.id)} style={{fontSize:11,color:"#6b8aaa",background:"none",border:"none",cursor:"pointer",marginLeft:"auto"}}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}

      </div>
      <p style={{textAlign:"center",fontSize:11,color:"rgba(30,58,90,0.45)",fontWeight:600,letterSpacing:"0.20em",paddingBottom:16,paddingTop:4}}>© AgroGestión PRO · Gestión Documental</p>
      {empresaId&&<EscanerIA empresaId={empresaId}/>}
    </div>
  );
}
