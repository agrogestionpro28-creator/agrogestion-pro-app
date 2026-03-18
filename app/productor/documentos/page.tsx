"use client";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";

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

const CARPETAS: Record<Carpeta, { label: string; icon: string; color: string; desc: string }> = {
  factura:    { label: "Facturas y Remitos",     icon: "🧾", color: "#60A5FA", desc: "Facturas, remitos, comprobantes de pago" },
  hacienda:   { label: "Hacienda",               icon: "🐄", color: "#4ADE80", desc: "DTE, guías de traslado, certificados sanitarios" },
  agronomica: { label: "Carpeta Agronómica",     icon: "🌱", color: "#00FF80", desc: "Recetas, análisis de suelo, mapas de lotes" },
  contrato:   { label: "Contratos de Alquiler",  icon: "🏘️", color: "#C9A227", desc: "Contratos de campo, acuerdos, escrituras" },
  empleado:   { label: "Empleados",              icon: "👷", color: "#FB923C", desc: "Legajos, contratos laborales, datos personales" },
  otro:       { label: "Otros Documentos",       icon: "📁", color: "#A78BFA", desc: "Seguros, impuestos, documentación general" },
};

export default function DocumentosPage() {
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [carpetaActiva, setCarpetaActiva] = useState<Carpeta | null>(null);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [archivoSel, setArchivoSel] = useState<File | null>(null);
  const [preview, setPreview] = useState<Documento | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    if (!u) return;
    const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
    if (!emp) return;
    setEmpresaId(emp.id);
    await fetchAll(emp.id);
    setLoading(false);
  };

  const fetchAll = async (eid: string) => {
    const sb = await getSB();
    const [docs, emps] = await Promise.all([
      sb.from("documentos").select("*").eq("empresa_id", eid).eq("activo", true).order("created_at", { ascending: false }),
      sb.from("empleados").select("*").eq("empresa_id", eid).order("nombre"),
    ]);
    setDocumentos(docs.data ?? []);
    setEmpleados(emps.data ?? []);
  };

  const subirArchivo = async (file: File, eid: string): Promise<{ url: string; nombre: string; tipo: string } | null> => {
    const sb = await getSB();
    const ext = file.name.split(".").pop();
    const path = `${eid}/${Date.now()}-${file.name}`;
    const { error } = await sb.storage.from("documentos").upload(path, file);
    if (error) { setMsg("Error al subir archivo: " + error.message); return null; }
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
      empresa_id: empresaId,
      categoria: carpetaActiva ?? "otro",
      subcategoria: form.subcategoria ?? "",
      nombre: form.nombre ?? archivoData.nombre ?? "Sin nombre",
      descripcion: form.descripcion ?? "",
      archivo_url: archivoData.url,
      archivo_nombre: archivoData.nombre,
      archivo_tipo: archivoData.tipo,
      monto: Number(form.monto ?? 0),
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      fecha_vencimiento: form.fecha_vencimiento || null,
      proveedor_cliente: form.proveedor_cliente ?? "",
      numero_documento: form.numero_documento ?? "",
      tags: form.tags ?? "",
      activo: true,
    });
    setMsg("✅ Documento guardado");
    await fetchAll(empresaId);
    setShowForm(false); setForm({}); setArchivoSel(null);
    setUploading(false);
  };

  const guardarEmpleado = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("empleados").insert({
      empresa_id: empresaId,
      nombre: form.nombre ?? "",
      dni: form.dni ?? "",
      cuil: form.cuil ?? "",
      categoria: form.categoria ?? "",
      fecha_ingreso: form.fecha_ingreso || null,
      sueldo_basico: Number(form.sueldo_basico ?? 0),
      telefono: form.telefono ?? "",
      email: form.email ?? "",
      direccion: form.direccion ?? "",
      activo: true,
      observaciones: form.observaciones ?? "",
    });
    setMsg("✅ Empleado guardado");
    await fetchAll(empresaId);
    setShowForm(false); setForm({});
  };

  const eliminarDoc = async (id: string) => {
    if (!confirm("¿Eliminar documento?")) return;
    const sb = await getSB();
    await sb.from("documentos").update({ activo: false }).eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const toggleEmpleado = async (id: string, activo: boolean) => {
    const sb = await getSB();
    await sb.from("empleados").update({ activo: !activo }).eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const eliminarEmpleado = async (id: string) => {
    if (!confirm("¿Eliminar empleado?")) return;
    const sb = await getSB();
    await sb.from("empleados").delete().eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  // Alertas de vencimiento
  const alertasVenc = documentos.filter(d => {
    if (!d.fecha_vencimiento) return false;
    const diff = (new Date(d.fecha_vencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff <= 30;
  });

  const docsFiltrados = documentos.filter(d => {
    const matchCarpeta = carpetaActiva ? d.categoria === carpetaActiva : true;
    const matchBusqueda = busqueda
      ? d.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        d.proveedor_cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
        d.numero_documento.toLowerCase().includes(busqueda.toLowerCase())
      : true;
    return matchCarpeta && matchBusqueda;
  });

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const labelClass = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  const contPorCarpeta = (c: Carpeta) => documentos.filter(d => d.categoria === c).length;

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
      `}</style>

      <div className="absolute inset-0 z-0">
        <Image src="/dashboard-bg.png" alt="bg" fill style={{ objectFit: "cover" }} />
        <div className="absolute inset-0 bg-[#020810]/88" />
      </div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: `linear-gradient(rgba(0,255,128,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,128,1) 1px, transparent 1px)`, backgroundSize: "50px 50px" }} />

      {/* Header */}
      <div className="relative z-10 border-b border-[#00FF80]/20 bg-[#020810]/80 backdrop-blur-sm px-6 py-3 flex items-center gap-4">
        <button onClick={() => window.location.href = "/productor/dashboard"} className="text-[#4B5563] hover:text-[#00FF80] transition-colors font-mono text-sm">← Dashboard</button>
        <div className="flex-1" />
        <Image src="/logo.png" alt="Logo" width={100} height={35} className="object-contain" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">

        {/* Title */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">📁 DOCUMENTOS</h1>
            <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">◆ GESTIÓN DOCUMENTAL INTEGRAL</p>
          </div>
          <div className="flex gap-3">
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar documentos..." className="bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono w-56" />
            {carpetaActiva && (
              <button onClick={() => { setShowForm(!showForm); setForm({ fecha: new Date().toISOString().split("T")[0] }); setMsg(""); }}
                className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm transition-all">
                + {carpetaActiva === "empleado" ? "Nuevo Empleado" : "Nuevo Documento"}
              </button>
            )}
          </div>
        </div>

        {/* Alertas vencimiento */}
        {alertasVenc.length > 0 && (
          <div className="bg-[#0a1628]/80 border border-[#F87171]/30 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#F87171] animate-pulse" />
              <span className="text-[#F87171] text-xs font-mono font-bold">⚠️ DOCUMENTOS POR VENCER ({alertasVenc.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
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

        {/* Mensaje */}
        {msg && (
          <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-mono border ${msg.startsWith("✅") ? "border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5" : "border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5"}`}>
            {msg} <button onClick={() => setMsg("")} className="ml-3 opacity-50 hover:opacity-100">✕</button>
          </div>
        )}

        <div className="flex gap-6">
          {/* Sidebar carpetas */}
          <div className="w-64 flex-shrink-0">
            <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#00FF80]/10">
                <span className="text-[#00FF80] text-xs font-mono tracking-widest">◆ CARPETAS</span>
              </div>
              <button onClick={() => { setCarpetaActiva(null); setShowForm(false); setBusqueda(""); }}
                className={`w-full text-left px-4 py-3 border-b border-[#00FF80]/5 transition-all flex items-center justify-between ${!carpetaActiva ? "carpeta-active" : "hover:bg-[#00FF80]/5"}`}>
                <span className="text-sm font-mono text-[#E5E7EB]">📂 Todos</span>
                <span className="text-xs text-[#4B5563] font-mono">{documentos.length}</span>
              </button>
              {(Object.keys(CARPETAS) as Carpeta[]).map(c => {
                const config = CARPETAS[c];
                const count = c === "empleado" ? empleados.length : contPorCarpeta(c);
                return (
                  <button key={c} onClick={() => { setCarpetaActiva(c); setShowForm(false); setMsg(""); }}
                    className={`w-full text-left px-4 py-3 border-b border-[#00FF80]/5 transition-all flex items-center justify-between group ${carpetaActiva === c ? "carpeta-active" : "hover:bg-[#00FF80]/5"}`}>
                    <div className="flex items-center gap-2">
                      <span>{config.icon}</span>
                      <span className="text-sm font-mono" style={{ color: carpetaActiva === c ? config.color : "#9CA3AF" }}>{config.label}</span>
                    </div>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: config.color + "20", color: config.color }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Stats */}
            <div className="mt-4 bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl p-4">
              <div className="text-xs text-[#4B5563] font-mono mb-3">RESUMEN</div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#4B5563]">Total docs</span>
                  <span className="text-[#00FF80] font-bold">{documentos.length}</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#4B5563]">Empleados activos</span>
                  <span className="text-[#FB923C] font-bold">{empleados.filter(e => e.activo).length}</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[#4B5563]">Por vencer</span>
                  <span className="text-[#F87171] font-bold">{alertasVenc.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Contenido principal */}
          <div className="flex-1 min-w-0">

            {/* Vista general — todas las carpetas */}
            {!carpetaActiva && (
              <div>
                <h2 className="text-lg font-bold font-mono text-[#E5E7EB] mb-4">📂 TODAS LAS CARPETAS</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {(Object.keys(CARPETAS) as Carpeta[]).map(c => {
                    const config = CARPETAS[c];
                    const count = c === "empleado" ? empleados.length : contPorCarpeta(c);
                    const venc = alertasVenc.filter(d => d.categoria === c).length;
                    return (
                      <div key={c} className="card-doc bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl p-5 cursor-pointer"
                        onClick={() => { setCarpetaActiva(c); setShowForm(false); }}>
                        <div className="flex items-start justify-between mb-4">
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: config.color + "15", border: `1px solid ${config.color}30` }}>
                            {config.icon}
                          </div>
                          {venc > 0 && <span className="text-xs bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/30 px-2 py-0.5 rounded font-mono">⚠️ {venc}</span>}
                        </div>
                        <div className="font-bold text-[#E5E7EB] font-mono mb-1">{config.label}</div>
                        <div className="text-xs text-[#4B5563] font-mono mb-3">{config.desc}</div>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-bold font-mono" style={{ color: config.color }}>{count}</span>
                          <span className="text-xs text-[#4B5563] font-mono">{c === "empleado" ? "empleados" : "documentos"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Documentos recientes */}
                {documentos.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-bold font-mono text-[#E5E7EB] mb-3">🕒 RECIENTES</h3>
                    <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead><tr className="border-b border-[#00FF80]/10">
                          {["Nombre","Carpeta","Fecha","Vencimiento",""].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {documentos.slice(0, 8).map(d => {
                            const config = CARPETAS[d.categoria];
                            const vencido = d.fecha_vencimiento && new Date(d.fecha_vencimiento) < new Date();
                            return (
                              <tr key={d.id} className="border-b border-[#00FF80]/5 hover:bg-[#00FF80]/5 transition-colors">
                                <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{d.nombre}</td>
                                <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: config?.color + "15", color: config?.color }}>{config?.icon} {config?.label}</span></td>
                                <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{d.fecha}</td>
                                <td className="px-4 py-3 text-xs font-mono" style={{ color: vencido ? "#F87171" : "#9CA3AF" }}>{d.fecha_vencimiento || "—"} {vencido && "⚠️"}</td>
                                <td className="px-4 py-3 flex gap-2">
                                  {d.archivo_url && <a href={d.archivo_url} target="_blank" rel="noreferrer" className="text-xs text-[#00FF80] hover:text-[#00FF80]/70 font-mono">📎 Ver</a>}
                                  <button onClick={() => eliminarDoc(d.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
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
            )}

            {/* Vista carpeta EMPLEADOS */}
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
                      <div><label className={labelClass}>Nombre completo</label>
                        <input type="text" value={form.nombre ?? ""} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputClass} placeholder="Nombre y apellido" />
                      </div>
                      <div><label className={labelClass}>DNI</label>
                        <input type="text" value={form.dni ?? ""} onChange={e => setForm({ ...form, dni: e.target.value })} className={inputClass} placeholder="12345678" />
                      </div>
                      <div><label className={labelClass}>CUIL</label>
                        <input type="text" value={form.cuil ?? ""} onChange={e => setForm({ ...form, cuil: e.target.value })} className={inputClass} placeholder="20-12345678-0" />
                      </div>
                      <div><label className={labelClass}>Categoría laboral</label>
                        <select value={form.categoria ?? ""} onChange={e => setForm({ ...form, categoria: e.target.value })} className={inputClass}>
                          <option value="">Seleccionar</option>
                          <option value="peon_general">Peón general</option>
                          <option value="tractorista">Tractorista</option>
                          <option value="encargado">Encargado</option>
                          <option value="ordeñador">Ordeñador</option>
                          <option value="administrador">Administrador</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>
                      <div><label className={labelClass}>Fecha ingreso</label>
                        <input type="date" value={form.fecha_ingreso ?? ""} onChange={e => setForm({ ...form, fecha_ingreso: e.target.value })} className={inputClass} />
                      </div>
                      <div><label className={labelClass}>Sueldo básico</label>
                        <input type="number" value={form.sueldo_basico ?? ""} onChange={e => setForm({ ...form, sueldo_basico: e.target.value })} className={inputClass} placeholder="0" />
                      </div>
                      <div><label className={labelClass}>Teléfono</label>
                        <input type="text" value={form.telefono ?? ""} onChange={e => setForm({ ...form, telefono: e.target.value })} className={inputClass} placeholder="11-1234-5678" />
                      </div>
                      <div><label className={labelClass}>Email</label>
                        <input type="email" value={form.email ?? ""} onChange={e => setForm({ ...form, email: e.target.value })} className={inputClass} placeholder="email@ejemplo.com" />
                      </div>
                      <div><label className={labelClass}>Dirección</label>
                        <input type="text" value={form.direccion ?? ""} onChange={e => setForm({ ...form, direccion: e.target.value })} className={inputClass} placeholder="Domicilio" />
                      </div>
                      <div className="md:col-span-3"><label className={labelClass}>Observaciones</label>
                        <input type="text" value={form.observaciones ?? ""} onChange={e => setForm({ ...form, observaciones: e.target.value })} className={inputClass} placeholder="Notas adicionales" />
                      </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button onClick={guardarEmpleado} className="bg-[#FB923C]/10 border border-[#FB923C]/30 text-[#FB923C] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#FB923C]/20 transition-all font-mono">▶ Guardar Empleado</button>
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
                            <div className="w-10 h-10 rounded-full bg-[#FB923C]/10 border border-[#FB923C]/30 flex items-center justify-center font-bold text-[#FB923C] font-mono">
                              {e.nombre.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-[#E5E7EB] font-mono">{e.nombre}</div>
                              <div className="text-xs text-[#4B5563] font-mono">{e.categoria?.replace("_", " ") ?? "—"}</div>
                            </div>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded font-mono ${e.activo ? "bg-[#4ADE80]/10 text-[#4ADE80]" : "bg-[#F87171]/10 text-[#F87171]"}`}>
                            {e.activo ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div><span className="text-[#4B5563]">DNI: </span><span className="text-[#9CA3AF]">{e.dni || "—"}</span></div>
                          <div><span className="text-[#4B5563]">CUIL: </span><span className="text-[#9CA3AF]">{e.cuil || "—"}</span></div>
                          <div><span className="text-[#4B5563]">Ingreso: </span><span className="text-[#9CA3AF]">{e.fecha_ingreso || "—"}</span></div>
                          <div><span className="text-[#4B5563]">Sueldo: </span><span className="text-[#FB923C] font-bold">${Number(e.sueldo_basico).toLocaleString("es-AR")}</span></div>
                          {e.telefono && <div><span className="text-[#4B5563]">Tel: </span><span className="text-[#9CA3AF]">{e.telefono}</span></div>}
                          {e.email && <div><span className="text-[#4B5563]">Email: </span><span className="text-[#9CA3AF]">{e.email}</span></div>}
                        </div>
                        {e.observaciones && <div className="text-xs text-[#4B5563] font-mono mt-2">💬 {e.observaciones}</div>}
                        <div className="flex gap-3 mt-3 pt-3 border-t border-[#FB923C]/10">
                          <button onClick={() => toggleEmpleado(e.id, e.activo)} className="text-xs text-[#4B5563] hover:text-[#FB923C] font-mono transition-colors">
                            {e.activo ? "Dar de baja" : "Reactivar"}
                          </button>
                          <button onClick={() => eliminarEmpleado(e.id)} className="text-xs text-[#4B5563] hover:text-red-400 font-mono transition-colors">Eliminar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Vista carpeta de DOCUMENTOS */}
            {carpetaActiva && carpetaActiva !== "empleado" && (
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
                      <div className="md:col-span-2"><label className={labelClass}>Nombre del documento</label>
                        <input type="text" value={form.nombre ?? ""} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputClass} placeholder="Ej: Factura Agroquímicos enero" />
                      </div>
                      <div><label className={labelClass}>Subcategoría</label>
                        <input type="text" value={form.subcategoria ?? ""} onChange={e => setForm({ ...form, subcategoria: e.target.value })} className={inputClass} placeholder="Ej: Proveedor, DTE, etc." />
                      </div>
                      <div><label className={labelClass}>N° Documento</label>
                        <input type="text" value={form.numero_documento ?? ""} onChange={e => setForm({ ...form, numero_documento: e.target.value })} className={inputClass} placeholder="Ej: 0001-00012345" />
                      </div>
                      <div><label className={labelClass}>Proveedor / Cliente / Campo</label>
                        <input type="text" value={form.proveedor_cliente ?? ""} onChange={e => setForm({ ...form, proveedor_cliente: e.target.value })} className={inputClass} placeholder="Nombre" />
                      </div>
                      <div><label className={labelClass}>Monto</label>
                        <input type="number" value={form.monto ?? ""} onChange={e => setForm({ ...form, monto: e.target.value })} className={inputClass} placeholder="0" />
                      </div>
                      <div><label className={labelClass}>Fecha</label>
                        <input type="date" value={form.fecha ?? new Date().toISOString().split("T")[0]} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputClass} />
                      </div>
                      <div><label className={labelClass}>Vencimiento (opcional)</label>
                        <input type="date" value={form.fecha_vencimiento ?? ""} onChange={e => setForm({ ...form, fecha_vencimiento: e.target.value })} className={inputClass} />
                      </div>
                      <div><label className={labelClass}>Descripción</label>
                        <input type="text" value={form.descripcion ?? ""} onChange={e => setForm({ ...form, descripcion: e.target.value })} className={inputClass} placeholder="Notas" />
                      </div>
                      {/* Upload archivo */}
                      <div className="md:col-span-3">
                        <label className={labelClass}>Archivo adjunto (PDF, imagen, Excel)</label>
                        <div className="flex items-center gap-3">
                          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx"
                            onChange={e => setArchivoSel(e.target.files?.[0] ?? null)}
                            className="hidden" />
                          <button onClick={() => fileRef.current?.click()}
                            className="px-4 py-2 border border-[#00FF80]/30 text-[#00FF80] rounded-xl text-sm font-mono hover:bg-[#00FF80]/10 transition-all">
                            📎 Seleccionar archivo
                          </button>
                          {archivoSel && <span className="text-xs text-[#4ADE80] font-mono">✓ {archivoSel.name}</span>}
                          {!archivoSel && <span className="text-xs text-[#4B5563] font-mono">Sin archivo seleccionado</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button onClick={guardarDocumento} disabled={uploading}
                        className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#00FF80]/20 transition-all font-mono disabled:opacity-50">
                        {uploading ? "▶ Subiendo..." : "▶ Guardar"}
                      </button>
                      <button onClick={() => { setShowForm(false); setForm({}); setArchivoSel(null); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                    </div>
                  </div>
                )}

                {docsFiltrados.length === 0 ? (
                  <div className="text-center py-20 bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl">
                    <div className="text-5xl mb-4 opacity-20">{CARPETAS[carpetaActiva].icon}</div>
                    <p className="text-[#4B5563] font-mono text-sm">Sin documentos en esta carpeta</p>
                    <button onClick={() => setShowForm(true)} className="mt-4 text-xs text-[#00FF80] font-mono border border-[#00FF80]/20 px-4 py-2 rounded-lg hover:bg-[#00FF80]/10 transition-all">
                      + Agregar primer documento
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {docsFiltrados.map(d => {
                      const vencido = d.fecha_vencimiento && new Date(d.fecha_vencimiento) < new Date();
                      const porVencer = d.fecha_vencimiento && !vencido && (new Date(d.fecha_vencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 30;
                      const config = CARPETAS[d.categoria];
                      return (
                        <div key={d.id} className="card-doc bg-[#0a1628]/80 border rounded-xl p-5"
                          style={{ borderColor: vencido ? "rgba(248,113,113,0.3)" : porVencer ? "rgba(201,162,39,0.3)" : "rgba(0,255,128,0.15)" }}>
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: config.color + "15", border: `1px solid ${config.color}30` }}>
                                {d.archivo_tipo?.includes("pdf") ? "📄" : d.archivo_tipo?.includes("image") ? "🖼️" : d.archivo_tipo?.includes("sheet") || d.archivo_tipo?.includes("excel") ? "📊" : config.icon}
                              </div>
                              <div>
                                <div className="font-bold text-[#E5E7EB] font-mono text-sm">{d.nombre}</div>
                                {d.subcategoria && <div className="text-xs text-[#4B5563] font-mono">{d.subcategoria}</div>}
                              </div>
                            </div>
                            {vencido && <span className="text-xs bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/30 px-2 py-0.5 rounded font-mono">VENCIDO</span>}
                            {porVencer && !vencido && <span className="text-xs bg-[#C9A227]/10 text-[#C9A227] border border-[#C9A227]/30 px-2 py-0.5 rounded font-mono">⚠️ Por vencer</span>}
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
                            {d.archivo_url && (
                              <a href={d.archivo_url} target="_blank" rel="noreferrer"
                                className="text-xs text-[#00FF80] hover:text-[#00FF80]/70 font-mono transition-colors">
                                📎 Ver archivo
                              </a>
                            )}
                            <button onClick={() => eliminarDoc(d.id)} className="text-xs text-[#4B5563] hover:text-red-400 font-mono ml-auto transition-colors">✕ Eliminar</button>
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
    </div>
  );
}
