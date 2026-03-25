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
  factura:    { label: "Facturas y Remitos",    icon: "🧾", color: "#60A5FA", desc: "Facturas, remitos, comprobantes de pago" },
  hacienda:   { label: "Hacienda",              icon: "🐄", color: "#4ADE80", desc: "DTE, guías de traslado, certificados sanitarios" },
  agronomica: { label: "Carpeta Agronómica",    icon: "🌱", color: "#00FF80", desc: "Recetas, análisis de suelo, mapas de lotes" },
  contrato:   { label: "Contratos de Alquiler", icon: "🏘️", color: "#C9A227", desc: "Contratos de campo, acuerdos, escrituras" },
  empleado:   { label: "Empleados",             icon: "👷", color: "#FB923C", desc: "Legajos, contratos laborales, datos personales" },
  otro:       { label: "Otros Documentos",      icon: "📁", color: "#A78BFA", desc: "Seguros, impuestos, documentación general" },
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

export default function DocumentosPage() {
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [campanaId, setCampanaId] = useState<string | null>(null);
  const [carpetaActiva, setCarpetaActiva] = useState<Carpeta | null>(null);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showFormContrato, setShowFormContrato] = useState<string | null>(null);
  const [showPagos, setShowPagos] = useState<string | null>(null); // contrato_id
  const [showFormPago, setShowFormPago] = useState<string | null>(null); // contrato_id
  const [form, setForm] = useState<Record<string, string>>({});
  const [formPago, setFormPago] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [archivoSel, setArchivoSel] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const contratoFileRef = useRef<HTMLInputElement>(null);
  const [contratoArchivo, setContratoArchivo] = useState<File | null>(null);

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

  const fetchAll = async (eid: string, campana?: string | null) => {
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

    // Lotes no propios
    let lotesData: any[] = [];
    if (cid) {
      const { data } = await sb.from("lotes").select("id, nombre, hectareas, tipo_alquiler, cultivo")
        .eq("empresa_id", eid).eq("campana_id", cid).neq("tipo_alquiler", "propio").order("nombre");
      lotesData = data ?? [];
    }
    if (lotesData.length === 0) {
      const { data } = await sb.from("lotes").select("id, nombre, hectareas, tipo_alquiler, cultivo")
        .eq("empresa_id", eid).neq("tipo_alquiler", "propio").order("nombre");
      lotesData = data ?? [];
    }
    const vistos = new Set<string>();
    setLotes(lotesData.filter((l: any) => { if (vistos.has(l.nombre)) return false; vistos.add(l.nombre); return true; }));
  };

  const subirArchivo = async (file: File, eid: string): Promise<{ url: string; nombre: string; tipo: string } | null> => {
    const sb = await getSB();
    const path = `${eid}/${Date.now()}-${file.name}`;
    const { error } = await sb.storage.from("documentos").upload(path, file);
    if (error) { setMsg("Error al subir: " + error.message); return null; }
    const { data: urlData } = sb.storage.from("documentos").getPublicUrl(path);
    return { url: urlData.publicUrl, nombre: file.name, tipo: file.type };
  };

  const guardarDocumento = async () => {
    if (!empresaId) return;
    setUploading(true);
    const sb = await getSB();
    let archivoData = { url: "", nombre: "", tipo: "" };
    if (archivoSel) {
      const result = await subirArchivo(archivoSel, empresaId);
      if (!result) { setUploading(false); return; }
      archivoData = result;
    }
    await sb.from("documentos").insert({
      empresa_id: empresaId, categoria: carpetaActiva ?? "otro",
      subcategoria: form.subcategoria ?? "",
      nombre: form.nombre ?? archivoData.nombre ?? "Sin nombre",
      descripcion: form.descripcion ?? "",
      archivo_url: archivoData.url, archivo_nombre: archivoData.nombre,
      archivo_tipo: archivoData.tipo, monto: Number(form.monto ?? 0),
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      fecha_vencimiento: form.fecha_vencimiento || null,
      proveedor_cliente: form.proveedor_cliente ?? "",
      numero_documento: form.numero_documento ?? "",
      tags: form.tags ?? "", activo: true,
    });
    setMsg("✅ Documento guardado");
    await fetchAll(empresaId);
    setShowForm(false); setForm({}); setArchivoSel(null); setUploading(false);
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
      propietario_nombre: form.propietario_nombre ?? "",
      propietario_telefono: form.propietario_telefono ?? "",
      propietario_email: form.propietario_email ?? "",
      fecha_inicio: form.fecha_inicio || null,
      fecha_fin: form.fecha_fin || null,
      condicion: form.condicion ?? "fijo_pesos",
      monto: Number(form.monto ?? 0),
      moneda: form.moneda ?? "ARS",
      unidad: form.unidad ?? "",
      frecuencia_pago: form.frecuencia_pago ?? "mensual",
      descuentos_comercializacion: Number(form.descuentos_comercializacion ?? 0),
      observaciones: form.observaciones ?? "",
      archivo_url: archivoUrl || existing?.archivo_url || "",
    };
    if (existing) {
      await sb.from("contratos_alquiler").update(payload).eq("id", existing.id);
      // Generar notificación si vence en 60 días
      await generarNotificacionVencimiento(existing.id, payload.fecha_fin, loteId);
    } else {
      const { data: nuevo } = await sb.from("contratos_alquiler").insert({ ...payload, empresa_id: empresaId, lote_id: loteId, activo: true }).select().single();
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
    const dias = Math.round((new Date(fechaFin).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (dias <= 60) {
      await sb.from("notificaciones").insert({
        empresa_id: empresaId,
        tipo: "contrato_vencimiento",
        titulo: `Contrato por vencer — ${lote?.nombre ?? ""}`,
        mensaje: `El contrato de alquiler del lote ${lote?.nombre ?? ""} vence en ${dias} días (${fechaFin})`,
        leida: false,
        url_destino: "/productor/documentos",
      });
    }
  };

  const registrarPago = async (contratoId: string) => {
    if (!empresaId) return;
    const sb = await getSB();
    const contrato = contratos.find(c => c.id === contratoId);
    const lote = lotes.find(l => l.id === contrato?.lote_id);

    // Calcular monto en pesos si es qq
    const cantQq = Number(formPago.cantidad_qq ?? 0);
    const precioQq = Number(formPago.precio_qq ?? 0);
    const descPct = Number(formPago.descuentos_pct ?? contrato?.descuentos_comercializacion ?? 0);
    // Productor tiene que vender más para cubrir descuentos
    const qqBrutos = descPct > 0 ? cantQq / (1 - descPct / 100) : cantQq;
    const montoPesos = Number(formPago.monto_pesos ?? (cantQq * precioQq));

    await sb.from("contrato_pagos").insert({
      contrato_id: contratoId,
      empresa_id: empresaId,
      periodo: formPago.periodo ?? new Date().toISOString().slice(0, 7),
      fecha_vencimiento: formPago.fecha_vencimiento || null,
      fecha_pago: formPago.fecha_pago ?? new Date().toISOString().split("T")[0],
      cantidad_qq: cantQq,
      precio_qq: precioQq,
      monto_pesos: montoPesos,
      descuentos_pct: descPct,
      estado: "pagado",
      observaciones: formPago.observaciones ?? "",
    });

    // Notificación de pago registrado
    await sb.from("notificaciones").insert({
      empresa_id: empresaId,
      tipo: "pago_alquiler",
      titulo: `Pago registrado — ${lote?.nombre ?? ""}`,
      mensaje: `Pago del período ${formPago.periodo ?? ""}: ${cantQq} qq · $${montoPesos.toLocaleString("es-AR")}`,
      leida: false,
      url_destino: "/productor/documentos",
    });

    setMsg("✅ Pago registrado");
    await fetchAll(empresaId);
    setShowFormPago(null); setFormPago({});
  };

  const guardarEmpleado = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("empleados").insert({
      empresa_id: empresaId, nombre: form.nombre ?? "",
      dni: form.dni ?? "", cuil: form.cuil ?? "",
      categoria: form.categoria ?? "",
      fecha_ingreso: form.fecha_ingreso || null,
      sueldo_basico: Number(form.sueldo_basico ?? 0),
      telefono: form.telefono ?? "", email: form.email ?? "",
      direccion: form.direccion ?? "", activo: true,
      observaciones: form.observaciones ?? "",
    });
    setMsg("✅ Empleado guardado");
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const eliminarDoc = async (id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from("documentos").update({ activo: false }).eq("id", id);
    if (empresaId) await fetchAll(empresaId);
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
  };

  const diasParaVencer = (fecha: string) => {
    if (!fecha) return null;
    return Math.round((new Date(fecha).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const alertasVenc = documentos.filter(d => {
    if (!d.fecha_vencimiento) return false;
    return (new Date(d.fecha_vencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 30;
  });

  const alertasContratos = contratos.filter(c => {
    if (!c.fecha_fin) return false;
    const diff = diasParaVencer(c.fecha_fin);
    return diff !== null && diff <= 60;
  });

  const docsFiltrados = documentos.filter(d => {
    const matchCarpeta = carpetaActiva ? d.categoria === carpetaActiva : true;
    const matchBusqueda = busqueda ? d.nombre.toLowerCase().includes(busqueda.toLowerCase()) || d.proveedor_cliente?.toLowerCase().includes(busqueda.toLowerCase()) : true;
    return matchCarpeta && matchBusqueda;
  });

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const labelClass = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";
  const contPorCarpeta = (c: Carpeta) => documentos.filter(d => d.categoria === c).length;

  const formatCondicion = (c: Contrato) => {
    switch(c.condicion) {
      case "fijo_pesos": return `$${Number(c.monto).toLocaleString("es-AR")}/ha`;
      case "fijo_usd": return `USD ${c.monto}/ha`;
      case "quintales": return `${c.monto} qq ${c.unidad ?? ""}/ha`;
      case "porcentaje": return `${c.monto}% producción`;
      default: return c.observaciones || `${c.monto}`;
    }
  };

  const pagosDe = (contratoId: string) => pagos.filter(p => p.contrato_id === contratoId);

  // Calcular cuotas mensuales de un contrato
  const calcularCuotasMensuales = (contrato: Contrato, lote: Lote) => {
    if (contrato.frecuencia_pago === "anual" || contrato.condicion === "porcentaje" || contrato.condicion === "otros") return null;
    const mesesPorFrecuencia: Record<string, number> = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 };
    const meses = mesesPorFrecuencia[contrato.frecuencia_pago] ?? 1;
    const montoTotal = Number(contrato.monto) * lote.hectareas;
    return montoTotal / (12 / meses);
  };

  if (loading) return (
    <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">
      ▶ Cargando Documentos...
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        .card-doc:hover { border-color: rgba(0,255,128,0.4) !important; transform: translateY(-2px); }
        .card-doc { transition: all 0.2s ease; }
        .carpeta-active { border-color: #00FF80 !important; background: rgba(0,255,128,0.08) !important; }
        @keyframes gradient-flow { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
      `}</style>

      <div className="absolute inset-0 z-0"><Image src="/dashboard-bg.png" alt="bg" fill style={{ objectFit: "cover" }} /><div className="absolute inset-0 bg-[#020810]/88" /></div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.03]" style={{ backgroundImage: `linear-gradient(rgba(0,255,128,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,128,1) 1px, transparent 1px)`, backgroundSize: "50px 50px" }} />

      {/* Header */}
      <div className="relative z-10">
        <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{ background: "linear-gradient(90deg, transparent, #00FF80, #00AAFF, #00FF80, transparent)", backgroundSize: "200% 100%", animation: "gradient-flow 4s ease infinite" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(2,8,16,0.95) 0%, rgba(0,20,10,0.90) 50%, rgba(2,8,16,0.95) 100%)" }} />
        <div className="relative px-6 py-4 flex items-center gap-4">
          <button onClick={() => window.location.href = "/productor/dashboard"} className="text-[#4B5563] hover:text-[#00FF80] transition-colors font-mono text-sm">← Dashboard</button>
          <div className="flex-1" />
          <div className="cursor-pointer" onClick={() => window.location.href = "/productor/dashboard"}>
            <Image src="/logo.png" alt="Logo" width={110} height={38} className="object-contain hover:drop-shadow-[0_0_12px_rgba(0,255,128,0.8)] transition-all" />
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">

        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">📁 DOCUMENTOS</h1>
            <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">◆ GESTIÓN DOCUMENTAL INTEGRAL</p>
          </div>
          <div className="flex gap-3">
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar..." className="bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono w-48" />
            {carpetaActiva && carpetaActiva !== "contrato" && (
              <button onClick={() => { setShowForm(!showForm); setForm({ fecha: new Date().toISOString().split("T")[0] }); setMsg(""); }}
                className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm transition-all">
                + {carpetaActiva === "empleado" ? "Nuevo Empleado" : "Nuevo Documento"}
              </button>
            )}
          </div>
        </div>

        {/* Alertas */}
        {(alertasVenc.length > 0 || alertasContratos.length > 0) && (
          <div className="bg-[#0a1628]/80 border border-[#F87171]/30 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#F87171] animate-pulse" />
              <span className="text-[#F87171] text-xs font-mono font-bold">⚠️ ALERTAS ({alertasVenc.length + alertasContratos.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {alertasContratos.map(c => {
                const dias = diasParaVencer(c.fecha_fin);
                const lote = lotes.find(l => l.id === c.lote_id);
                return (
                  <div key={c.id} className={`px-3 py-1.5 rounded-lg text-xs font-mono border ${dias !== null && dias <= 30 ? "border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5" : "border-[#C9A227]/30 text-[#C9A227] bg-[#C9A227]/5"}`}>
                    🏘️ {dias !== null && dias <= 0 ? "VENCIDO" : `${dias} días`} · {lote?.nombre ?? c.propietario_nombre}
                  </div>
                );
              })}
              {alertasVenc.map(d => {
                const diff = Math.round((new Date(d.fecha_vencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={d.id} className={`px-3 py-1.5 rounded-lg text-xs font-mono border ${diff <= 7 ? "border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5" : "border-[#C9A227]/30 text-[#C9A227] bg-[#C9A227]/5"}`}>
                    {diff <= 0 ? "🔴 VENCIDO" : `🟡 ${diff} días`} · {d.nombre}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {msg && (
          <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-mono border ${msg.startsWith("✅") ? "border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5" : "border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5"}`}>
            {msg} <button onClick={() => setMsg("")} className="ml-3 opacity-50 hover:opacity-100">✕</button>
          </div>
        )}

        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#00FF80]/10"><span className="text-[#00FF80] text-xs font-mono tracking-widest">◆ CARPETAS</span></div>
              <button onClick={() => { setCarpetaActiva(null); setShowForm(false); setBusqueda(""); }}
                className={`w-full text-left px-4 py-3 border-b border-[#00FF80]/5 transition-all flex items-center justify-between ${!carpetaActiva ? "carpeta-active" : "hover:bg-[#00FF80]/5"}`}>
                <span className="text-sm font-mono text-[#E5E7EB]">📂 Todos</span>
                <span className="text-xs text-[#4B5563] font-mono">{documentos.length}</span>
              </button>
              {(Object.keys(CARPETAS) as Carpeta[]).map(c => {
                const config = CARPETAS[c];
                const count = c === "empleado" ? empleados.length : c === "contrato" ? contratos.length : contPorCarpeta(c);
                const alertas = c === "contrato" ? alertasContratos.length : alertasVenc.filter(d => d.categoria === c).length;
                return (
                  <button key={c} onClick={() => { setCarpetaActiva(c); setShowForm(false); setMsg(""); }}
                    className={`w-full text-left px-4 py-3 border-b border-[#00FF80]/5 transition-all flex items-center justify-between ${carpetaActiva === c ? "carpeta-active" : "hover:bg-[#00FF80]/5"}`}>
                    <div className="flex items-center gap-2">
                      <span>{config.icon}</span>
                      <span className="text-sm font-mono" style={{ color: carpetaActiva === c ? config.color : "#9CA3AF" }}>{config.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {alertas > 0 && <span className="text-xs text-[#F87171] font-mono">⚠️</span>}
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: config.color + "20", color: config.color }}>{count}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl p-4">
              <div className="text-xs text-[#4B5563] font-mono mb-3">RESUMEN</div>
              <div className="space-y-2">
                {[
                  { label: "Total docs", value: documentos.length, color: "#00FF80" },
                  { label: "Contratos activos", value: contratos.length, color: "#C9A227" },
                  { label: "Pagos registrados", value: pagos.length, color: "#60A5FA" },
                  { label: "Empleados activos", value: empleados.filter(e => e.activo).length, color: "#FB923C" },
                  { label: "Por vencer", value: alertasVenc.length + alertasContratos.length, color: "#F87171" },
                ].map(s => (
                  <div key={s.label} className="flex justify-between text-xs font-mono">
                    <span className="text-[#4B5563]">{s.label}</span>
                    <span className="font-bold" style={{ color: s.color }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Contenido */}
          <div className="flex-1 min-w-0">

            {/* Vista general */}
            {!carpetaActiva && (
              <div>
                <h2 className="text-lg font-bold font-mono text-[#E5E7EB] mb-4">📂 TODAS LAS CARPETAS</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {(Object.keys(CARPETAS) as Carpeta[]).map(c => {
                    const config = CARPETAS[c];
                    const count = c === "empleado" ? empleados.length : c === "contrato" ? contratos.length : contPorCarpeta(c);
                    const venc = c === "contrato" ? alertasContratos.length : alertasVenc.filter(d => d.categoria === c).length;
                    return (
                      <div key={c} className="card-doc bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl p-5 cursor-pointer" onClick={() => { setCarpetaActiva(c); setShowForm(false); }}>
                        <div className="flex items-start justify-between mb-4">
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: config.color + "15", border: `1px solid ${config.color}30` }}>{config.icon}</div>
                          {venc > 0 && <span className="text-xs bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/30 px-2 py-0.5 rounded font-mono">⚠️ {venc}</span>}
                        </div>
                        <div className="font-bold text-[#E5E7EB] font-mono mb-1">{config.label}</div>
                        <div className="text-xs text-[#4B5563] font-mono mb-3">{config.desc}</div>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-bold font-mono" style={{ color: config.color }}>{count}</span>
                          <span className="text-xs text-[#4B5563] font-mono">{c === "empleado" ? "empleados" : c === "contrato" ? "contratos" : "documentos"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ===== CONTRATOS DE ALQUILER ===== */}
            {carpetaActiva === "contrato" && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">🏘️</span>
                  <div>
                    <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">CONTRATOS DE ALQUILER</h2>
                    <p className="text-xs text-[#C9A227] font-mono">{lotes.length} lotes no propios · {contratos.length} contratos · {pagos.length} pagos registrados</p>
                  </div>
                </div>

                {lotes.length === 0 ? (
                  <div className="text-center py-20 bg-[#0a1628]/60 border border-[#C9A227]/15 rounded-xl">
                    <div className="text-5xl mb-4 opacity-20">🏘️</div>
                    <p className="text-[#4B5563] font-mono">No hay lotes alquilados</p>
                    <p className="text-xs text-[#4B5563] font-mono mt-2">Los lotes con tenencia "Alquilado", "Mixto" o "A porcentaje" aparecen aquí</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {lotes.map(lote => {
                      const contrato = contratos.find(c => c.lote_id === lote.id);
                      const dias = contrato?.fecha_fin ? diasParaVencer(contrato.fecha_fin) : null;
                      const vencido = dias !== null && dias <= 0;
                      const porVencer60 = dias !== null && dias > 0 && dias <= 60;
                      const porVencer30 = dias !== null && dias > 0 && dias <= 30;
                      const editando = showFormContrato === lote.id;
                      const pagosDelContrato = contrato ? pagosDe(contrato.id) : [];
                      const cuotaMensual = contrato ? calcularCuotasMensuales(contrato, lote) : null;

                      return (
                        <div key={lote.id} className={`bg-[#0a1628]/80 border rounded-xl overflow-hidden ${vencido ? "border-[#F87171]/30" : porVencer30 ? "border-[#F87171]/20" : porVencer60 ? "border-[#C9A227]/30" : "border-[#C9A227]/15"}`}>
                          {/* Header lote */}
                          <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 flex items-center justify-center font-bold text-[#C9A227] font-mono text-sm">{lote.hectareas}</div>
                              <div>
                                <div className="font-bold text-[#E5E7EB] font-mono">{lote.nombre}</div>
                                <div className="flex items-center gap-2 text-xs font-mono">
                                  <span className="text-[#C9A227]">{lote.hectareas} Ha</span>
                                  <span className="text-[#4B5563]">·</span>
                                  <span className="text-[#9CA3AF]">{lote.tipo_alquiler}</span>
                                  {lote.cultivo && <><span className="text-[#4B5563]">·</span><span className="text-[#00FF80]">{lote.cultivo.toUpperCase()}</span></>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {!contrato && <span className="text-xs bg-[#4B5563]/20 text-[#4B5563] border border-[#4B5563]/30 px-3 py-1 rounded-full font-mono">Sin contrato</span>}
                              {contrato && vencido && <span className="text-xs bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/30 px-3 py-1 rounded-full font-mono">🔴 VENCIDO</span>}
                              {contrato && porVencer30 && !vencido && <span className="text-xs bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/20 px-3 py-1 rounded-full font-mono">⚠️ {dias} días</span>}
                              {contrato && porVencer60 && !porVencer30 && <span className="text-xs bg-[#C9A227]/10 text-[#C9A227] border border-[#C9A227]/20 px-3 py-1 rounded-full font-mono">🟡 {dias} días</span>}
                              {contrato && !vencido && !porVencer60 && <span className="text-xs bg-[#4ADE80]/10 text-[#4ADE80] border border-[#4ADE80]/20 px-3 py-1 rounded-full font-mono">✓ Vigente</span>}
                              {contrato && (
                                <button onClick={() => setShowPagos(showPagos === contrato.id ? null : contrato.id)}
                                  className="text-xs px-3 py-1.5 rounded-xl border border-[#60A5FA]/30 text-[#60A5FA] hover:bg-[#60A5FA]/10 font-mono transition-all">
                                  💳 {pagosDelContrato.length} pagos
                                </button>
                              )}
                              <button onClick={() => {
                                if (editando) { setShowFormContrato(null); setForm({}); }
                                else {
                                  setShowFormContrato(lote.id);
                                  setForm(contrato ? {
                                    propietario_nombre: contrato.propietario_nombre ?? "",
                                    propietario_telefono: contrato.propietario_telefono ?? "",
                                    propietario_email: contrato.propietario_email ?? "",
                                    fecha_inicio: contrato.fecha_inicio ?? "",
                                    fecha_fin: contrato.fecha_fin ?? "",
                                    condicion: contrato.condicion ?? "fijo_pesos",
                                    monto: String(contrato.monto ?? 0),
                                    unidad: contrato.unidad ?? "",
                                    frecuencia_pago: contrato.frecuencia_pago ?? "mensual",
                                    descuentos_comercializacion: String(contrato.descuentos_comercializacion ?? 0),
                                    observaciones: contrato.observaciones ?? "",
                                  } : { condicion: "quintales", frecuencia_pago: "mensual", unidad: "soja", descuentos_comercializacion: "7" });
                                }
                              }} className={`text-xs px-4 py-2 rounded-xl border font-mono transition-all ${editando ? "border-[#4B5563]/30 text-[#4B5563]" : "border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/10"}`}>
                                {editando ? "Cancelar" : contrato ? "✏️ Editar" : "+ Cargar contrato"}
                              </button>
                            </div>
                          </div>

                          {/* Datos contrato */}
                          {contrato && !editando && (
                            <div className="px-5 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                              <div className="bg-[#020810]/40 rounded-lg p-3">
                                <div className="text-xs text-[#4B5563] font-mono mb-1">PROPIETARIO</div>
                                <div className="text-sm text-[#E5E7EB] font-mono font-bold">{contrato.propietario_nombre || "—"}</div>
                                {contrato.propietario_telefono && (
                                  <a href={`https://wa.me/54${contrato.propietario_telefono.replace(/\D/g,"")}?text=Hola ${contrato.propietario_nombre}!`}
                                    target="_blank" rel="noreferrer" className="text-xs text-[#25D366] font-mono mt-1 block hover:underline">
                                    💬 {contrato.propietario_telefono}
                                  </a>
                                )}
                              </div>
                              <div className="bg-[#020810]/40 rounded-lg p-3">
                                <div className="text-xs text-[#4B5563] font-mono mb-1">CONDICIÓN</div>
                                <div className="text-sm text-[#C9A227] font-mono font-bold">{formatCondicion(contrato)}</div>
                                <div className="text-xs text-[#4B5563] font-mono mt-1">
                                  Total anual: {contrato.condicion === "quintales" ? `${Number(contrato.monto) * lote.hectareas} qq ${contrato.unidad ?? ""}` :
                                    contrato.condicion === "fijo_usd" ? `USD ${Number(contrato.monto) * lote.hectareas}` :
                                    contrato.condicion === "fijo_pesos" ? `$${(Number(contrato.monto) * lote.hectareas).toLocaleString("es-AR")}` : "—"}
                                </div>
                                {cuotaMensual && (
                                  <div className="text-xs text-[#9CA3AF] font-mono mt-0.5">
                                    Por {contrato.frecuencia_pago}: {contrato.condicion === "quintales" ? `${cuotaMensual.toFixed(1)} qq` : `$${cuotaMensual.toLocaleString("es-AR")}`}
                                  </div>
                                )}
                                {contrato.descuentos_comercializacion > 0 && (
                                  <div className="text-xs text-[#F87171] font-mono mt-0.5">⚠️ Desc. comerc.: {contrato.descuentos_comercializacion}%</div>
                                )}
                              </div>
                              <div className="bg-[#020810]/40 rounded-lg p-3">
                                <div className="text-xs text-[#4B5563] font-mono mb-1">VIGENCIA</div>
                                <div className="text-xs text-[#9CA3AF] font-mono">{contrato.fecha_inicio || "—"}</div>
                                <div className="text-xs text-[#9CA3AF] font-mono">al {contrato.fecha_fin || "—"}</div>
                                <div className="text-xs text-[#60A5FA] font-mono mt-1">{contrato.frecuencia_pago ?? "mensual"}</div>
                              </div>
                              <div className="bg-[#020810]/40 rounded-lg p-3">
                                <div className="text-xs text-[#4B5563] font-mono mb-1">PAGOS</div>
                                <div className="text-lg font-bold text-[#60A5FA] font-mono">{pagosDelContrato.length}</div>
                                <div className="text-xs text-[#4B5563] font-mono">registrados</div>
                                {contrato.archivo_url && (
                                  <a href={contrato.archivo_url} target="_blank" rel="noreferrer" className="text-xs text-[#00FF80] font-mono block mt-1 hover:underline">📎 Ver PDF</a>
                                )}
                                <button onClick={() => eliminarContrato(contrato.id)} className="text-xs text-[#4B5563] hover:text-red-400 font-mono transition-colors mt-1 block">✕ Eliminar</button>
                              </div>
                            </div>
                          )}

                          {/* Panel pagos */}
                          {contrato && showPagos === contrato.id && !editando && (
                            <div className="border-t border-[#60A5FA]/20 bg-[#020810]/40 p-4">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-[#60A5FA] text-xs font-mono font-bold">💳 HISTORIAL DE PAGOS</span>
                                <button onClick={() => { setShowFormPago(contrato.id); setFormPago({ periodo: new Date().toISOString().slice(0,7), descuentos_pct: String(contrato.descuentos_comercializacion ?? 0) }); }}
                                  className="text-xs text-[#60A5FA] border border-[#60A5FA]/30 px-3 py-1 rounded-lg font-mono hover:bg-[#60A5FA]/10 transition-all">
                                  + Registrar pago
                                </button>
                              </div>

                              {/* Form pago */}
                              {showFormPago === contrato.id && (
                                <div className="bg-[#0a1628]/80 border border-[#60A5FA]/30 rounded-xl p-4 mb-3">
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    <div><label className={labelClass}>Período (YYYY-MM)</label>
                                      <input type="month" value={formPago.periodo ?? ""} onChange={e => setFormPago({...formPago, periodo: e.target.value})} className={inputClass} />
                                    </div>
                                    <div><label className={labelClass}>Fecha de pago</label>
                                      <input type="date" value={formPago.fecha_pago ?? new Date().toISOString().split("T")[0]} onChange={e => setFormPago({...formPago, fecha_pago: e.target.value})} className={inputClass} />
                                    </div>
                                    {contrato.condicion === "quintales" && (
                                      <>
                                        <div><label className={labelClass}>Quintales pagados</label>
                                          <input type="number" value={formPago.cantidad_qq ?? ""} onChange={e => setFormPago({...formPago, cantidad_qq: e.target.value})} className={inputClass} placeholder="0" />
                                        </div>
                                        <div><label className={labelClass}>Precio qq ({contrato.unidad}) $/tn</label>
                                          <input type="number" value={formPago.precio_qq ?? ""} onChange={e => setFormPago({...formPago, precio_qq: e.target.value})} className={inputClass} placeholder="0" />
                                        </div>
                                        <div><label className={labelClass}>% Descuentos comerc.</label>
                                          <input type="number" value={formPago.descuentos_pct ?? ""} onChange={e => setFormPago({...formPago, descuentos_pct: e.target.value})} className={inputClass} placeholder="7" />
                                        </div>
                                      </>
                                    )}
                                    <div><label className={labelClass}>Monto total en $</label>
                                      <input type="number" value={formPago.monto_pesos ?? ""} onChange={e => setFormPago({...formPago, monto_pesos: e.target.value})} className={inputClass} placeholder="0" />
                                    </div>
                                    <div><label className={labelClass}>Observaciones</label>
                                      <input type="text" value={formPago.observaciones ?? ""} onChange={e => setFormPago({...formPago, observaciones: e.target.value})} className={inputClass} placeholder="Notas" />
                                    </div>
                                  </div>
                                  {/* Preview cálculo */}
                                  {contrato.condicion === "quintales" && formPago.cantidad_qq && formPago.descuentos_pct && (
                                    <div className="mt-3 p-3 bg-[#C9A227]/5 border border-[#C9A227]/20 rounded-lg">
                                      <p className="text-xs text-[#C9A227] font-mono">
                                        Para pagar {formPago.cantidad_qq} qq netos con {formPago.descuentos_pct}% de descuentos → debés vender{" "}
                                        <span className="font-bold">{(Number(formPago.cantidad_qq) / (1 - Number(formPago.descuentos_pct) / 100)).toFixed(1)} qq brutos</span>
                                      </p>
                                    </div>
                                  )}
                                  <div className="flex gap-2 mt-3">
                                    <button onClick={() => registrarPago(contrato.id)} className="bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-bold px-4 py-2 rounded-lg text-xs font-mono">▶ Registrar</button>
                                    <button onClick={() => { setShowFormPago(null); setFormPago({}); }} className="border border-[#1C2128] text-[#4B5563] px-4 py-2 rounded-lg text-xs font-mono">Cancelar</button>
                                  </div>
                                </div>
                              )}

                              {pagosDelContrato.length === 0 ? (
                                <p className="text-xs text-[#4B5563] font-mono text-center py-4">Sin pagos registrados</p>
                              ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {pagosDelContrato.map(p => (
                                    <div key={p.id} className="flex items-center justify-between bg-[#0a1628]/60 rounded-lg px-4 py-2.5">
                                      <div className="flex items-center gap-3">
                                        <span className="text-xs font-mono text-[#E5E7EB] font-bold">{p.periodo}</span>
                                        {p.cantidad_qq > 0 && <span className="text-xs text-[#C9A227] font-mono">{p.cantidad_qq} qq</span>}
                                        {p.precio_qq > 0 && <span className="text-xs text-[#4B5563] font-mono">@ ${p.precio_qq}/tn</span>}
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="text-xs text-[#4ADE80] font-mono font-bold">${Number(p.monto_pesos).toLocaleString("es-AR")}</span>
                                        <span className="text-xs text-[#4B5563] font-mono">{p.fecha_pago}</span>
                                        <span className="text-xs bg-[#4ADE80]/10 text-[#4ADE80] px-2 py-0.5 rounded font-mono">✓ Pagado</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Form contrato */}
                          {editando && (
                            <div className="px-5 pb-5 border-t border-[#C9A227]/15 pt-4">
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div><label className={labelClass}>Propietario del campo</label>
                                  <input type="text" value={form.propietario_nombre ?? ""} onChange={e => setForm({...form, propietario_nombre: e.target.value})} className={inputClass} placeholder="Nombre y apellido" />
                                </div>
                                <div><label className={labelClass}>Teléfono / WhatsApp</label>
                                  <input type="text" value={form.propietario_telefono ?? ""} onChange={e => setForm({...form, propietario_telefono: e.target.value})} className={inputClass} placeholder="11-1234-5678" />
                                </div>
                                <div><label className={labelClass}>Email</label>
                                  <input type="email" value={form.propietario_email ?? ""} onChange={e => setForm({...form, propietario_email: e.target.value})} className={inputClass} />
                                </div>
                                <div><label className={labelClass}>Condición de alquiler</label>
                                  <select value={form.condicion ?? "quintales"} onChange={e => setForm({...form, condicion: e.target.value})} className={inputClass}>
                                    {CONDICIONES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                  </select>
                                </div>
                                {form.condicion !== "otros" && form.condicion !== "porcentaje" && (
                                  <div><label className={labelClass}>
                                    {form.condicion === "fijo_pesos" ? "Monto $/ha/año" : form.condicion === "fijo_usd" ? "Monto USD/ha/año" : "Quintales/ha/año"}
                                  </label>
                                    <input type="number" value={form.monto ?? ""} onChange={e => setForm({...form, monto: e.target.value})} className={inputClass} placeholder="0" />
                                  </div>
                                )}
                                {form.condicion === "porcentaje" && (
                                  <div><label className={labelClass}>% de producción</label>
                                    <input type="number" value={form.monto ?? ""} onChange={e => setForm({...form, monto: e.target.value})} className={inputClass} placeholder="0" />
                                  </div>
                                )}
                                {form.condicion === "quintales" && (
                                  <div><label className={labelClass}>Especie (soja, trigo...)</label>
                                    <input type="text" value={form.unidad ?? "soja"} onChange={e => setForm({...form, unidad: e.target.value})} className={inputClass} />
                                  </div>
                                )}
                                {form.condicion !== "otros" && (
                                  <div><label className={labelClass}>Descuentos comerc. (%)</label>
                                    <input type="number" value={form.descuentos_comercializacion ?? "7"} onChange={e => setForm({...form, descuentos_comercializacion: e.target.value})} className={inputClass} placeholder="Ej: 7" />
                                  </div>
                                )}
                                <div><label className={labelClass}>Frecuencia de pago</label>
                                  <select value={form.frecuencia_pago ?? "mensual"} onChange={e => setForm({...form, frecuencia_pago: e.target.value})} className={inputClass}>
                                    {FRECUENCIAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                  </select>
                                </div>
                                <div><label className={labelClass}>Inicio del contrato</label>
                                  <input type="date" value={form.fecha_inicio ?? ""} onChange={e => setForm({...form, fecha_inicio: e.target.value})} className={inputClass} />
                                </div>
                                <div><label className={labelClass}>Fin / Vencimiento</label>
                                  <input type="date" value={form.fecha_fin ?? ""} onChange={e => setForm({...form, fecha_fin: e.target.value})} className={inputClass} />
                                </div>
                                <div className="md:col-span-3"><label className={labelClass}>
                                  {form.condicion === "otros" ? "Descripción de la condición de pago" : "Observaciones"}
                                </label>
                                  <input type="text" value={form.observaciones ?? ""} onChange={e => setForm({...form, observaciones: e.target.value})} className={inputClass} placeholder={form.condicion === "otros" ? "Describí la forma de pago acordada..." : "Notas del contrato"} />
                                </div>
                                <div className="md:col-span-3">
                                  <label className={labelClass}>Adjuntar contrato (PDF)</label>
                                  <div className="flex items-center gap-3">
                                    <input ref={contratoFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={e => setContratoArchivo(e.target.files?.[0] ?? null)} />
                                    <button onClick={() => contratoFileRef.current?.click()} className="px-4 py-2 border border-[#C9A227]/30 text-[#C9A227] rounded-xl text-sm font-mono hover:bg-[#C9A227]/10 transition-all">📎 Seleccionar PDF</button>
                                    {contratoArchivo && <span className="text-xs text-[#4ADE80] font-mono">✓ {contratoArchivo.name}</span>}
                                  </div>
                                </div>
                              </div>
                              {/* Preview total */}
                              {form.monto && form.condicion !== "otros" && (
                                <div className="mt-3 p-3 bg-[#C9A227]/5 border border-[#C9A227]/20 rounded-xl">
                                  <p className="text-xs text-[#C9A227] font-mono">
                                    Total anual: <span className="font-bold">{form.condicion === "quintales" ? `${Number(form.monto) * lote.hectareas} qq ${form.unidad ?? "soja"}` : form.condicion === "fijo_usd" ? `USD ${Number(form.monto) * lote.hectareas}` : `$${(Number(form.monto) * lote.hectareas).toLocaleString("es-AR")}`}</span>
                                    {form.descuentos_comercializacion && Number(form.descuentos_comercializacion) > 0 && (
                                      <span className="text-[#F87171] ml-2">· Con {form.descuentos_comercializacion}% desc. → vendés {form.condicion === "quintales" ? `${(Number(form.monto) * lote.hectareas / (1 - Number(form.descuentos_comercializacion)/100)).toFixed(1)} qq brutos` : "más"}</span>
                                    )}
                                  </p>
                                </div>
                              )}
                              <div className="flex gap-3 mt-4">
                                <button onClick={() => guardarContrato(lote.id)} disabled={uploading}
                                  className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono disabled:opacity-50 hover:bg-[#C9A227]/20 transition-all">
                                  {uploading ? "Guardando..." : "▶ Guardar Contrato"}
                                </button>
                                <button onClick={() => { setShowFormContrato(null); setForm({}); setContratoArchivo(null); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Vista EMPLEADOS */}
            {carpetaActiva === "empleado" && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-2xl">👷</span>
                  <div>
                    <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">EMPLEADOS</h2>
                    <p className="text-xs text-[#FB923C] font-mono">{empleados.filter(e => e.activo).length} activos · {empleados.filter(e => !e.activo).length} inactivos</p>
                  </div>
                </div>
                {showForm && (
                  <div className="bg-[#0a1628]/80 border border-[#FB923C]/30 rounded-xl p-5 mb-6">
                    <h3 className="text-[#FB923C] font-mono text-sm font-bold mb-4">+ NUEVO EMPLEADO</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre ?? ""} onChange={e => setForm({...form, nombre: e.target.value})} className={inputClass} /></div>
                      <div><label className={labelClass}>DNI</label><input type="text" value={form.dni ?? ""} onChange={e => setForm({...form, dni: e.target.value})} className={inputClass} /></div>
                      <div><label className={labelClass}>CUIL</label><input type="text" value={form.cuil ?? ""} onChange={e => setForm({...form, cuil: e.target.value})} className={inputClass} /></div>
                      <div><label className={labelClass}>Categoría</label>
                        <select value={form.categoria ?? ""} onChange={e => setForm({...form, categoria: e.target.value})} className={inputClass}>
                          <option value="">Seleccionar</option>
                          <option value="peon_general">Peón general</option>
                          <option value="tractorista">Tractorista</option>
                          <option value="encargado">Encargado</option>
                          <option value="ordeñador">Ordeñador</option>
                          <option value="administrador">Administrador</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>
                      <div><label className={labelClass}>Fecha ingreso</label><input type="date" value={form.fecha_ingreso ?? ""} onChange={e => setForm({...form, fecha_ingreso: e.target.value})} className={inputClass} /></div>
                      <div><label className={labelClass}>Sueldo básico</label><input type="number" value={form.sueldo_basico ?? ""} onChange={e => setForm({...form, sueldo_basico: e.target.value})} className={inputClass} /></div>
                      <div><label className={labelClass}>Teléfono</label><input type="text" value={form.telefono ?? ""} onChange={e => setForm({...form, telefono: e.target.value})} className={inputClass} /></div>
                      <div><label className={labelClass}>Email</label><input type="email" value={form.email ?? ""} onChange={e => setForm({...form, email: e.target.value})} className={inputClass} /></div>
                      <div><label className={labelClass}>Dirección</label><input type="text" value={form.direccion ?? ""} onChange={e => setForm({...form, direccion: e.target.value})} className={inputClass} /></div>
                      <div className="md:col-span-3"><label className={labelClass}>Observaciones</label><input type="text" value={form.observaciones ?? ""} onChange={e => setForm({...form, observaciones: e.target.value})} className={inputClass} /></div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button onClick={guardarEmpleado} className="bg-[#FB923C]/10 border border-[#FB923C]/30 text-[#FB923C] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                      <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                    </div>
                  </div>
                )}
                {empleados.length === 0 ? (
                  <div className="text-center py-20 bg-[#0a1628]/60 border border-[#FB923C]/15 rounded-xl">
                    <div className="text-5xl mb-4 opacity-20">👷</div>
                    <p className="text-[#4B5563] font-mono">Sin empleados registrados</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {empleados.map(e => (
                      <div key={e.id} className="card-doc bg-[#0a1628]/80 border border-[#FB923C]/15 rounded-xl p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#FB923C]/10 border border-[#FB923C]/30 flex items-center justify-center font-bold text-[#FB923C] font-mono">{e.nombre.charAt(0).toUpperCase()}</div>
                            <div>
                              <div className="font-bold text-[#E5E7EB] font-mono">{e.nombre}</div>
                              <div className="text-xs text-[#4B5563] font-mono">{e.categoria?.replace("_"," ") ?? "—"}</div>
                            </div>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded font-mono ${e.activo ? "bg-[#4ADE80]/10 text-[#4ADE80]" : "bg-[#F87171]/10 text-[#F87171]"}`}>{e.activo ? "Activo" : "Inactivo"}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div><span className="text-[#4B5563]">DNI: </span><span className="text-[#9CA3AF]">{e.dni || "—"}</span></div>
                          <div><span className="text-[#4B5563]">CUIL: </span><span className="text-[#9CA3AF]">{e.cuil || "—"}</span></div>
                          <div><span className="text-[#4B5563]">Ingreso: </span><span className="text-[#9CA3AF]">{e.fecha_ingreso || "—"}</span></div>
                          <div><span className="text-[#4B5563]">Sueldo: </span><span className="text-[#FB923C] font-bold">${Number(e.sueldo_basico).toLocaleString("es-AR")}</span></div>
                          {e.telefono && <div><span className="text-[#4B5563]">Tel: </span><span className="text-[#9CA3AF]">{e.telefono}</span></div>}
                        </div>
                        <div className="flex gap-3 mt-3 pt-3 border-t border-[#FB923C]/10">
                          <button onClick={() => toggleEmpleado(e.id, e.activo)} className="text-xs text-[#4B5563] hover:text-[#FB923C] font-mono transition-colors">{e.activo ? "Dar de baja" : "Reactivar"}</button>
                          <button onClick={() => eliminarEmpleado(e.id)} className="text-xs text-[#4B5563] hover:text-red-400 font-mono transition-colors">Eliminar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Vista DOCUMENTOS genéricos */}
            {carpetaActiva && carpetaActiva !== "empleado" && carpetaActiva !== "contrato" && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-2xl">{CARPETAS[carpetaActiva].icon}</span>
                  <div>
                    <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">{CARPETAS[carpetaActiva].label.toUpperCase()}</h2>
                    <p className="text-xs font-mono" style={{ color: CARPETAS[carpetaActiva].color }}>{CARPETAS[carpetaActiva].desc}</p>
                  </div>
                </div>
                {showForm && (
                  <div className="bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-xl p-5 mb-6">
                    <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-4">+ NUEVO DOCUMENTO</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2"><label className={labelClass}>Nombre</label><input type="text" value={form.nombre ?? ""} onChange={e => setForm({...form, nombre: e.target.value})} className={inputClass} /></div>
                      <div><label className={labelClass}>Subcategoría</label><input type="text" value={form.subcategoria ?? ""} onChange={e => setForm({...form, subcategoria: e.target.value})} className={inputClass} /></div>
                      <div><label className={labelClass}>N° Documento</label><input type="text" value={form.numero_documento ?? ""} onChange={e => setForm({...form, numero_documento: e.target.value})} className={inputClass} /></div>
                      <div><label className={labelClass}>Proveedor / Cliente</label><input type="text" value={form.proveedor_cliente ?? ""} onChange={e => setForm({...form, proveedor_cliente: e.target.value})} className={inputClass} /></div>
                      <div><label className={labelClass}>Monto</label><input type="number" value={form.monto ?? ""} onChange={e => setForm({...form, monto: e.target.value})} className={inputClass} /></div>
                      <div><label className={labelClass}>Fecha</label><input type="date" value={form.fecha ?? new Date().toISOString().split("T")[0]} onChange={e => setForm({...form, fecha: e.target.value})} className={inputClass} /></div>
                      <div><label className={labelClass}>Vencimiento</label><input type="date" value={form.fecha_vencimiento ?? ""} onChange={e => setForm({...form, fecha_vencimiento: e.target.value})} className={inputClass} /></div>
                      <div><label className={labelClass}>Descripción</label><input type="text" value={form.descripcion ?? ""} onChange={e => setForm({...form, descripcion: e.target.value})} className={inputClass} /></div>
                      <div className="md:col-span-3">
                        <label className={labelClass}>Archivo adjunto</label>
                        <div className="flex items-center gap-3">
                          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx" onChange={e => setArchivoSel(e.target.files?.[0] ?? null)} className="hidden" />
                          <button onClick={() => fileRef.current?.click()} className="px-4 py-2 border border-[#00FF80]/30 text-[#00FF80] rounded-xl text-sm font-mono hover:bg-[#00FF80]/10 transition-all">📎 Seleccionar</button>
                          {archivoSel ? <span className="text-xs text-[#4ADE80] font-mono">✓ {archivoSel.name}</span> : <span className="text-xs text-[#4B5563] font-mono">Sin archivo</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button onClick={guardarDocumento} disabled={uploading} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono disabled:opacity-50">{uploading ? "Subiendo..." : "▶ Guardar"}</button>
                      <button onClick={() => { setShowForm(false); setForm({}); setArchivoSel(null); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                    </div>
                  </div>
                )}
                {docsFiltrados.length === 0 ? (
                  <div className="text-center py-20 bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl">
                    <div className="text-5xl mb-4 opacity-20">{CARPETAS[carpetaActiva].icon}</div>
                    <p className="text-[#4B5563] font-mono text-sm">Sin documentos en esta carpeta</p>
                    <button onClick={() => setShowForm(true)} className="mt-4 text-xs text-[#00FF80] font-mono border border-[#00FF80]/20 px-4 py-2 rounded-lg hover:bg-[#00FF80]/10 transition-all">+ Agregar</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {docsFiltrados.map(d => {
                      const vencido = d.fecha_vencimiento && new Date(d.fecha_vencimiento) < new Date();
                      const porVencer = d.fecha_vencimiento && !vencido && (new Date(d.fecha_vencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 30;
                      const config = CARPETAS[d.categoria];
                      return (
                        <div key={d.id} className="card-doc bg-[#0a1628]/80 border rounded-xl p-5" style={{ borderColor: vencido ? "rgba(248,113,113,0.3)" : porVencer ? "rgba(201,162,39,0.3)" : "rgba(0,255,128,0.15)" }}>
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: config.color + "15", border: `1px solid ${config.color}30` }}>
                                {d.archivo_tipo?.includes("pdf") ? "📄" : d.archivo_tipo?.includes("image") ? "🖼️" : config.icon}
                              </div>
                              <div>
                                <div className="font-bold text-[#E5E7EB] font-mono text-sm">{d.nombre}</div>
                                {d.subcategoria && <div className="text-xs text-[#4B5563] font-mono">{d.subcategoria}</div>}
                              </div>
                            </div>
                            {vencido && <span className="text-xs bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/30 px-2 py-0.5 rounded font-mono">VENCIDO</span>}
                            {porVencer && <span className="text-xs bg-[#C9A227]/10 text-[#C9A227] border border-[#C9A227]/30 px-2 py-0.5 rounded font-mono">⚠️ Por vencer</span>}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
                            {d.proveedor_cliente && <div><span className="text-[#4B5563]">De/Para: </span><span className="text-[#9CA3AF]">{d.proveedor_cliente}</span></div>}
                            {d.numero_documento && <div><span className="text-[#4B5563]">N°: </span><span className="text-[#9CA3AF]">{d.numero_documento}</span></div>}
                            <div><span className="text-[#4B5563]">Fecha: </span><span className="text-[#9CA3AF]">{d.fecha}</span></div>
                            {d.fecha_vencimiento && <div><span className="text-[#4B5563]">Vence: </span><span style={{ color: vencido ? "#F87171" : porVencer ? "#C9A227" : "#9CA3AF" }}>{d.fecha_vencimiento}</span></div>}
                            {d.monto > 0 && <div><span className="text-[#4B5563]">Monto: </span><span className="text-[#C9A227] font-bold">${Number(d.monto).toLocaleString("es-AR")}</span></div>}
                          </div>
                          {d.descripcion && <div className="text-xs text-[#4B5563] font-mono mb-3">💬 {d.descripcion}</div>}
                          <div className="flex gap-3 pt-3 border-t border-[#00FF80]/10">
                            {d.archivo_url && <a href={d.archivo_url} target="_blank" rel="noreferrer" className="text-xs text-[#00FF80] font-mono">📎 Ver</a>}
                            <button onClick={() => eliminarDoc(d.id)} className="text-xs text-[#4B5563] hover:text-red-400 font-mono ml-auto">✕</button>
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
      </div>

      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 tracking-[0.3em] font-mono mt-6">© AGROGESTION PRO · GESTIÓN DOCUMENTAL</p>
      {empresaId && <EscanerIA empresaId={empresaId} />}
    </div>
  );
}
