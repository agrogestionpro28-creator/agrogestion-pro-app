"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Seccion = "productores" | "recetas" | "historial" | "cobranza" | "vehiculo";
type ModoProductor = "lista" | "vincular" | "crear";

type Productor = {
  empresa_id: string; empresa_nombre: string;
  propietario_nombre: string; propietario_email: string;
  vinculacion_id: string; honorario_tipo: string;
  honorario_monto: number;
};
type CategoriaHacienda = { id: string; especie: string; categoria: string; cantidad: number; };
type Receta = {
  id: string; empresa_id: string; categoria_id: string; fecha: string;
  diagnostico: string; tratamiento: string; producto: string; dosis: string;
  via_administracion: string; duracion_dias: number; cantidad_animales: number;
  periodo_retiro_dias: number; observaciones: string;
};
type Historial = {
  id: string; empresa_id: string; categoria_id: string; fecha: string;
  tipo: string; descripcion: string; diagnostico: string; tratamiento: string;
  resultado: string; proximo_control: string; costo: number;
};
type Cobranza = {
  id: string; empresa_id: string; concepto: string; monto: number;
  fecha: string; estado: string; metodo_pago: string; observaciones: string;
};
type Vehiculo = {
  id: string; nombre: string; marca: string; modelo: string; año: number;
  patente: string; seguro_vencimiento: string; seguro_compania: string;
  vtv_vencimiento: string; km_actuales: number; proximo_service_km: number;
};
type ServiceVehiculo = {
  id: string; tipo: string; descripcion: string; costo: number; km: number; fecha: string; taller: string;
};

export default function VeterinarioPanel() {
  const [seccion, setSeccion] = useState<Seccion>("productores");
  const [modoProductor, setModoProductor] = useState<ModoProductor>("lista");
  const [vetId, setVetId] = useState<string | null>(null);
  const [vetNombre, setVetNombre] = useState("");
  const [productores, setProductores] = useState<Productor[]>([]);
  const [prodSel, setProdSel] = useState<Productor | null>(null);
  const [categorias, setCategorias] = useState<CategoriaHacienda[]>([]);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [historial, setHistorial] = useState<Historial[]>([]);
  const [cobranzas, setCobranzas] = useState<Cobranza[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [servicios, setServicios] = useState<ServiceVehiculo[]>([]);
  const [vehiculoSel, setVehiculoSel] = useState<Vehiculo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [alertas, setAlertas] = useState<{ msg: string; urgencia: string }[]>([]);
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("id, nombre, rol").eq("auth_id", user.id).single();
    if (!u || u.rol !== "veterinario") { window.location.href = "/login"; return; }
    setVetId(u.id);
    setVetNombre(u.nombre);
    await fetchAll(u.id);
    setLoading(false);
  };

  const fetchAll = async (vid: string) => {
    const sb = await getSB();
    // Productores vinculados
    const { data: vincs } = await sb.from("vinculaciones").select("*, empresas(id, nombre, propietario_id)").eq("ingeniero_id", vid).eq("activa", true);
    if (vincs && vincs.length > 0) {
      const prods: Productor[] = [];
      for (const v of vincs) {
        const emp = (v as any).empresas;
        if (!emp) continue;
        const { data: prop } = await sb.from("usuarios").select("nombre, email").eq("id", emp.propietario_id).single();
        prods.push({
          empresa_id: emp.id, empresa_nombre: emp.nombre,
          propietario_nombre: prop?.nombre ?? "—",
          propietario_email: prop?.email ?? "—",
          vinculacion_id: v.id,
          honorario_tipo: v.honorario_tipo ?? "mensual",
          honorario_monto: v.honorario_monto ?? 0,
        });
      }
      setProductores(prods);
    } else { setProductores([]); }
    // Recetas e historial
    const [recs, hist, cobs, vehs] = await Promise.all([
      sb.from("vet_recetas").select("*").eq("veterinario_id", vid).order("fecha", { ascending: false }),
      sb.from("vet_historial").select("*").eq("veterinario_id", vid).order("fecha", { ascending: false }),
      sb.from("vet_cobranzas").select("*").eq("veterinario_id", vid).order("fecha", { ascending: false }),
      sb.from("vet_vehiculos").select("*").eq("veterinario_id", vid),
    ]);
    setRecetas(recs.data ?? []);
    setHistorial(hist.data ?? []);
    setCobranzas(cobs.data ?? []);
    setVehiculos(vehs.data ?? []);
    calcularAlertas(vehs.data ?? [], hist.data ?? [], cobs.data ?? []);
  };

  const calcularAlertas = (vehs: Vehiculo[], hist: Historial[], cobs: Cobranza[]) => {
    const alerts: { msg: string; urgencia: string }[] = [];
    const hoy = new Date();
    vehs.forEach(v => {
      if (v.seguro_vencimiento) {
        const diff = (new Date(v.seguro_vencimiento).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
        if (diff < 0) alerts.push({ msg: `${v.nombre}: Seguro VENCIDO`, urgencia: "alta" });
        else if (diff <= 30) alerts.push({ msg: `${v.nombre}: Seguro vence en ${Math.round(diff)} días`, urgencia: diff <= 7 ? "alta" : "media" });
      }
      if (v.vtv_vencimiento) {
        const diff = (new Date(v.vtv_vencimiento).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
        if (diff < 0) alerts.push({ msg: `${v.nombre}: VTV VENCIDA`, urgencia: "alta" });
        else if (diff <= 30) alerts.push({ msg: `${v.nombre}: VTV vence en ${Math.round(diff)} días`, urgencia: diff <= 7 ? "alta" : "media" });
      }
    });
    hist.filter(h => h.proximo_control).forEach(h => {
      const diff = (new Date(h.proximo_control).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
      if (diff < 0) alerts.push({ msg: `Control vencido: ${h.descripcion}`, urgencia: "alta" });
      else if (diff <= 7) alerts.push({ msg: `Control en ${Math.round(diff)} días: ${h.descripcion}`, urgencia: "media" });
    });
    cobs.filter(c => c.estado === "pendiente").forEach(c => {
      const diff = (hoy.getTime() - new Date(c.fecha).getTime()) / (1000 * 60 * 60 * 24);
      if (diff > 30) alerts.push({ msg: `Cobro pendiente +30 días: $${c.monto.toLocaleString("es-AR")}`, urgencia: "media" });
    });
    setAlertas(alerts);
  };

  const fetchCategorias = async (empId: string) => {
    const sb = await getSB();
    const { data } = await sb.from("hacienda_categorias").select("id, especie, categoria, cantidad").eq("empresa_id", empId);
    setCategorias(data ?? []);
  };

  const crearProductor = async () => {
    if (!vetId) return;
    setMsg("Creando productor...");
    const sb = await getSB();
    try {
      const { data: todos } = await sb.from("usuarios").select("codigo").eq("rol", "productor");
      const codigos = (todos ?? []).map((u: any) => Number(u.codigo)).filter((c: number) => c > 10000);
      const nuevoCodigo = codigos.length === 0 ? 10001 : Math.max(...codigos) + 1;
      const { data, error } = await sb.auth.signUp({
        email: form.email_nuevo, password: form.password_nuevo,
        options: { data: { nombre: form.nombre_nuevo } }
      });
      if (error) { setMsg("Error: " + error.message); return; }
      if (!data.user) { setMsg("Error al crear usuario"); return; }
      await sb.from("usuarios").insert({
        auth_id: data.user.id, nombre: form.nombre_nuevo,
        email: form.email_nuevo, rol: "productor",
        codigo: String(nuevoCodigo), activo: true,
      });
      const { data: nuevoUser } = await sb.from("usuarios").select("id").eq("auth_id", data.user.id).single();
      let empId = null;
      if (nuevoUser) {
        const { data: newEmp } = await sb.from("empresas").insert({
          nombre: form.nombre_empresa_nuevo || `Empresa de ${form.nombre_nuevo}`,
          propietario_id: nuevoUser.id,
        }).select().single();
        empId = newEmp?.id;
      }
      if (empId && form.vincular_tambien === "si") {
        await sb.from("vinculaciones").insert({
          ingeniero_id: vetId, empresa_id: empId, activa: true,
          honorario_tipo: form.honorario_tipo ?? "mensual",
          honorario_monto: Number(form.honorario_monto ?? 0),
        });
      }
      const vinMsg = form.vincular_tambien === "si" ? "— Vinculado con vos" : "— Sin vincular";
      setMsg(`✅ Productor creado — Código: ${nuevoCodigo} ${vinMsg}`);
      await fetchAll(vetId);
      setModoProductor("lista"); setForm({});
    } catch { setMsg("Error inesperado"); }
  };

  const vincularProductor = async () => {
    if (!vetId) return;
    const sb = await getSB();
    const { data: u } = await sb.from("usuarios").select("id").eq("email", form.email_productor).single();
    if (!u) { setMsg("Productor no encontrado"); return; }
    const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
    if (!emp) { setMsg("El productor no tiene empresa"); return; }
    const { data: existe } = await sb.from("vinculaciones").select("id").eq("ingeniero_id", vetId).eq("empresa_id", emp.id).single();
    if (existe) { setMsg("Ya estás vinculado con este productor"); return; }
    await sb.from("vinculaciones").insert({
      ingeniero_id: vetId, empresa_id: emp.id, activa: true,
      honorario_tipo: form.honorario_tipo ?? "mensual",
      honorario_monto: Number(form.honorario_monto ?? 0),
    });
    setMsg("✅ Vinculado correctamente");
    await fetchAll(vetId);
    setModoProductor("lista"); setForm({});
  };

  const desvincular = async (vinculacion_id: string) => {
    if (!confirm("¿Desvincular este productor?")) return;
    const sb = await getSB();
    await sb.from("vinculaciones").update({ activa: false }).eq("id", vinculacion_id);
    if (vetId) await fetchAll(vetId);
  };

  const guardarReceta = async () => {
    if (!vetId) return;
    const sb = await getSB();
    await sb.from("vet_recetas").insert({
      veterinario_id: vetId,
      empresa_id: form.empresa_id ?? null,
      categoria_id: form.categoria_id || null,
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      diagnostico: form.diagnostico ?? "",
      tratamiento: form.tratamiento ?? "",
      producto: form.producto ?? "",
      dosis: form.dosis ?? "",
      via_administracion: form.via_administracion ?? "",
      duracion_dias: Number(form.duracion_dias ?? 1),
      cantidad_animales: Number(form.cantidad_animales ?? 0),
      periodo_retiro_dias: Number(form.periodo_retiro_dias ?? 0),
      observaciones: form.observaciones ?? "",
    });
    await fetchAll(vetId);
    setShowForm(false); setForm({});
    setMsg("✅ Receta guardada");
  };

  const guardarHistorial = async () => {
    if (!vetId) return;
    const sb = await getSB();
    await sb.from("vet_historial").insert({
      veterinario_id: vetId,
      empresa_id: form.empresa_id ?? null,
      categoria_id: form.categoria_id || null,
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      tipo: form.tipo_hist ?? "consulta",
      descripcion: form.descripcion ?? "",
      diagnostico: form.diagnostico ?? "",
      tratamiento: form.tratamiento ?? "",
      resultado: form.resultado ?? "",
      proximo_control: form.proximo_control || null,
      costo: Number(form.costo ?? 0),
    });
    await fetchAll(vetId);
    setShowForm(false); setForm({});
    setMsg("✅ Historial guardado");
  };

  const guardarCobranza = async () => {
    if (!vetId) return;
    const sb = await getSB();
    await sb.from("vet_cobranzas").insert({
      veterinario_id: vetId, empresa_id: form.empresa_id ?? null,
      concepto: form.concepto ?? "", monto: Number(form.monto ?? 0),
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      estado: form.estado ?? "pendiente", metodo_pago: form.metodo_pago ?? "",
      observaciones: form.observaciones ?? "",
    });
    await fetchAll(vetId);
    setShowForm(false); setForm({});
  };

  const marcarCobrado = async (id: string) => {
    const sb = await getSB();
    await sb.from("vet_cobranzas").update({ estado: "cobrado" }).eq("id", id);
    if (vetId) await fetchAll(vetId);
  };

  const guardarVehiculo = async () => {
    if (!vetId) return;
    const sb = await getSB();
    await sb.from("vet_vehiculos").insert({
      veterinario_id: vetId, nombre: form.nombre, marca: form.marca ?? "",
      modelo: form.modelo ?? "", año: Number(form.año ?? 0), patente: form.patente ?? "",
      seguro_vencimiento: form.seguro_vencimiento || null, seguro_compania: form.seguro_compania ?? "",
      vtv_vencimiento: form.vtv_vencimiento || null, km_actuales: Number(form.km_actuales ?? 0),
      proximo_service_km: Number(form.proximo_service_km ?? 0),
    });
    await fetchAll(vetId);
    setShowForm(false); setForm({});
  };

  const guardarService = async () => {
    if (!vehiculoSel || !vetId) return;
    const sb = await getSB();
    await sb.from("vet_vehiculo_service").insert({
      vehiculo_id: vehiculoSel.id, veterinario_id: vetId,
      tipo: form.tipo_service ?? "service", descripcion: form.descripcion ?? "",
      costo: Number(form.costo ?? 0), km: Number(form.km ?? 0),
      fecha: form.fecha ?? new Date().toISOString().split("T")[0], taller: form.taller ?? "",
    });
    await fetchServicios(vehiculoSel.id);
    setShowForm(false); setForm({});
  };

  const fetchServicios = async (vid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("vet_vehiculo_service").select("*").eq("vehiculo_id", vid).order("fecha", { ascending: false });
    setServicios(data ?? []);
  };

  const eliminar = async (tabla: string, id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (vetId) await fetchAll(vetId);
  };

  const imprimirReceta = (r: Receta) => {
    const prod = productores.find(p => p.empresa_id === r.empresa_id);
    const cat = categorias.find(c => c.id === r.categoria_id);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>Receta Veterinaria</title>
      <style>body{font-family:monospace;padding:40px;max-width:700px;margin:0 auto}
      h1{border-bottom:2px solid #000;padding-bottom:10px}
      .row{display:flex;justify-content:space-between;margin:8px 0}
      .label{font-weight:bold;color:#555}
      .box{border:1px solid #ccc;padding:15px;margin:15px 0;border-radius:8px}
      .footer{margin-top:60px;border-top:1px solid #000;padding-top:20px;display:flex;justify-content:space-between}
      </style></head><body>
      <h1>🩺 RECETA VETERINARIA — AGROGESTION PRO</h1>
      <div class="row"><span class="label">Veterinario:</span><span>${vetNombre}</span></div>
      <div class="row"><span class="label">Fecha:</span><span>${r.fecha}</span></div>
      <div class="row"><span class="label">Productor:</span><span>${prod?.propietario_nombre ?? "—"}</span></div>
      <div class="row"><span class="label">Empresa:</span><span>${prod?.empresa_nombre ?? "—"}</span></div>
      <div class="row"><span class="label">Categoría:</span><span>${cat ? `${cat.categoria} (${cat.especie})` : "—"}</span></div>
      <div class="row"><span class="label">Cantidad animales:</span><span>${r.cantidad_animales}</span></div>
      <div class="box">
        <div class="label">DIAGNÓSTICO:</div><p>${r.diagnostico}</p>
        <div class="label">TRATAMIENTO:</div><p>${r.tratamiento}</p>
      </div>
      <div class="box">
        <div class="label">PRESCRIPCIÓN:</div>
        <div class="row"><span class="label">Producto:</span><span>${r.producto}</span></div>
        <div class="row"><span class="label">Dosis:</span><span>${r.dosis}</span></div>
        <div class="row"><span class="label">Vía:</span><span>${r.via_administracion}</span></div>
        <div class="row"><span class="label">Duración:</span><span>${r.duracion_dias} días</span></div>
        <div class="row"><span class="label">Período de retiro:</span><span>${r.periodo_retiro_dias} días</span></div>
      </div>
      ${r.observaciones ? `<div class="box"><div class="label">OBSERVACIONES:</div><p>${r.observaciones}</p></div>` : ""}
      <div class="footer">
        <div><p>Firma y sello del veterinario</p><br/><br/>____________________</div>
        <div style="text-align:right"><small>AgroGestión PRO · Receta generada digitalmente</small></div>
      </div>
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  const askAI = async (prompt: string) => {
    setAiLoading(true); setAiMsg("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: `Sos un veterinario experto en producción animal para Argentina. Respondé en español, de forma técnica y práctica. Veterinario: ${vetNombre}. Productores asesorados: ${productores.length}. ${prompt}` }]
        })
      });
      const data = await res.json();
      setAiMsg(data.content?.[0]?.text ?? "Sin respuesta");
    } catch { setAiMsg("Error al conectar con IA"); }
    setAiLoading(false);
  };

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#A78BFA]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#A78BFA] font-mono transition-all";
  const labelClass = "block text-xs text-[#6B5B8B] uppercase tracking-widest mb-1 font-mono";
  const totalPendiente = cobranzas.filter(c => c.estado === "pendiente").reduce((a, c) => a + c.monto, 0);
  const totalCobrado = cobranzas.filter(c => c.estado === "cobrado").reduce((a, c) => a + c.monto, 0);

  const secciones = [
    { key: "productores" as Seccion, label: "MIS PRODUCTORES", icon: "👨‍🌾" },
    { key: "recetas" as Seccion, label: "RECETAS", icon: "📋" },
    { key: "historial" as Seccion, label: "HISTORIAL CLÍNICO", icon: "🩺" },
    { key: "cobranza" as Seccion, label: "COBRANZA", icon: "💰" },
    { key: "vehiculo" as Seccion, label: "MI VEHÍCULO", icon: "🚗" },
  ];

  if (loading) return (
    <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#A78BFA] font-mono animate-pulse">
      ▶ Cargando Panel Veterinario...
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        .card-vet:hover { border-color: rgba(167,139,250,0.4) !important; transform: translateY(-2px); }
        .card-vet { transition: all 0.2s ease; }
        .sec-vet-active { border-color: #A78BFA !important; color: #A78BFA !important; background: rgba(167,139,250,0.08) !important; }
        .modo-vet-active { border-color: #C9A227 !important; color: #C9A227 !important; background: rgba(201,162,39,0.08) !important; }
      `}</style>

      <div className="absolute inset-0 z-0">
        <Image src="/dashboard-bg.png" alt="bg" fill style={{ objectFit: "cover" }} />
        <div className="absolute inset-0 bg-[#020810]/88" />
      </div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: `linear-gradient(rgba(167,139,250,1) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,1) 1px, transparent 1px)`, backgroundSize: "50px 50px" }} />

      {/* Header */}
      <div className="relative z-10 border-b border-[#A78BFA]/20 bg-[#020810]/80 backdrop-blur-sm px-6 py-3 flex items-center gap-4">
        <Image src="/logo.png" alt="Logo" width={100} height={35} className="object-contain" />
        <div className="flex-1" />
        <div className="text-right">
          <div className="text-xs text-[#E5E7EB] font-mono">{vetNombre}</div>
          <div className="text-xs text-[#A78BFA] font-mono">VETERINARIO</div>
        </div>
        {alertas.length > 0 && (
          <div className="w-8 h-8 rounded-full bg-[#F87171]/10 border border-[#F87171]/30 flex items-center justify-center">
            <span className="text-[#F87171] text-xs font-bold">{alertas.length}</span>
          </div>
        )}
        <button onClick={async () => { const sb = await getSB(); await sb.auth.signOut(); window.location.href = "/login"; }}
          className="text-xs text-[#4B5563] hover:text-red-400 transition-colors font-mono">Salir</button>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">◆ PANEL VETERINARIO</h1>
          <p className="text-[#A78BFA] text-xs tracking-widest font-mono mt-1">{productores.length} PRODUCTOR{productores.length !== 1 ? "ES" : ""} ASESORADO{productores.length !== 1 ? "S" : ""} · IA VETERINARIA ACTIVA</p>
        </div>

        {/* Alertas */}
        {alertas.length > 0 && (
          <div className="bg-[#0a1628]/80 border border-[#F87171]/30 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#F87171] animate-pulse" />
              <span className="text-[#F87171] text-xs font-mono font-bold">⚠️ ALERTAS ({alertas.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {alertas.map((a, i) => (
                <div key={i} className={`px-3 py-1.5 rounded-lg text-xs font-mono border ${a.urgencia === "alta" ? "border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5" : "border-[#C9A227]/30 text-[#C9A227] bg-[#C9A227]/5"}`}>
                  {a.urgencia === "alta" ? "🔴" : "🟡"} {a.msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mensaje */}
        {msg && (
          <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-mono border ${msg.startsWith("✅") ? "border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5" : "border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5"}`}>
            {msg} <button onClick={() => setMsg("")} className="ml-3 opacity-50 hover:opacity-100">✕</button>
          </div>
        )}

        {/* IA rápida */}
        <div className="bg-[#0a1628]/60 border border-[#A78BFA]/15 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#A78BFA] animate-pulse" />
            <span className="text-[#A78BFA] text-xs font-mono tracking-widest">◆ ASISTENTE VETERINARIO IA</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {["Dosis de ivermectina en bovinos","Período de retiro de oxitetraciclina","Protocolo vacunación aftosa Argentina","Signos de tristeza parasitaria"].map(q => (
              <button key={q} onClick={() => askAI(q)}
                className="text-xs text-[#6B5B8B] hover:text-[#A78BFA] border border-[#A78BFA]/10 hover:border-[#A78BFA]/30 px-3 py-1.5 rounded-lg font-mono transition-all">
                {q}
              </button>
            ))}
          </div>
          {aiLoading && <p className="text-[#A78BFA] text-xs font-mono mt-3 animate-pulse">▶ Consultando base veterinaria...</p>}
          {aiMsg && <div className="mt-3 p-3 bg-[#A78BFA]/5 border border-[#A78BFA]/20 rounded-lg"><p className="text-[#9CA3AF] text-sm leading-relaxed">{aiMsg}</p></div>}
        </div>

        {/* Navegación */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {secciones.map(s => (
            <button key={s.key} onClick={() => { setSeccion(s.key); setShowForm(false); setForm({}); setVehiculoSel(null); setModoProductor("lista"); setMsg(""); }}
              className={`px-5 py-2.5 rounded-xl border border-[#A78BFA]/15 text-sm font-mono transition-all ${seccion === s.key ? "sec-vet-active" : "text-[#4B5563] hover:text-[#9CA3AF]"}`}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        {/* ===== PRODUCTORES ===== */}
        {seccion === "productores" && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">👨‍🌾 MIS PRODUCTORES</h2>
                <p className="text-xs text-[#4B5563] font-mono">Clickeá un productor para ver su hacienda</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setModoProductor(modoProductor === "crear" ? "lista" : "crear"); setForm({}); setMsg(""); }}
                  className={`px-4 py-2 rounded-xl border font-mono text-sm transition-all ${modoProductor === "crear" ? "modo-vet-active" : "border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/10"}`}>
                  + Crear Productor
                </button>
                <button onClick={() => { setModoProductor(modoProductor === "vincular" ? "lista" : "vincular"); setForm({}); setMsg(""); }}
                  className={`px-4 py-2 rounded-xl border font-mono text-sm transition-all ${modoProductor === "vincular" ? "sec-vet-active" : "border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/10"}`}>
                  🔗 Vincular Existente
                </button>
              </div>
            </div>

            {/* Form CREAR */}
            {modoProductor === "crear" && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-2">+ CREAR NUEVO PRODUCTOR</h3>
                <p className="text-xs text-[#4B5563] font-mono mb-4">Se crea el usuario y su empresa. Podés vincularte o dejarlo solo.</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Nombre completo</label>
                    <input type="text" value={form.nombre_nuevo ?? ""} onChange={e => setForm({ ...form, nombre_nuevo: e.target.value })} className={inputClass} placeholder="Nombre y apellido" />
                  </div>
                  <div><label className={labelClass}>Email</label>
                    <input type="email" value={form.email_nuevo ?? ""} onChange={e => setForm({ ...form, email_nuevo: e.target.value })} className={inputClass} placeholder="email@productor.com" />
                  </div>
                  <div><label className={labelClass}>Contraseña inicial</label>
                    <input type="text" value={form.password_nuevo ?? ""} onChange={e => setForm({ ...form, password_nuevo: e.target.value })} className={inputClass} placeholder="Clave temporal" />
                  </div>
                  <div><label className={labelClass}>Nombre empresa</label>
                    <input type="text" value={form.nombre_empresa_nuevo ?? ""} onChange={e => setForm({ ...form, nombre_empresa_nuevo: e.target.value })} className={inputClass} placeholder="Ej: Establecimiento Don Juan" />
                  </div>
                </div>
                <div className="mt-4 p-4 bg-[#020810]/60 border border-[#C9A227]/15 rounded-xl">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div onClick={() => setForm({ ...form, vincular_tambien: form.vincular_tambien === "si" ? "no" : "si" })}
                      className={"w-5 h-5 rounded border-2 flex items-center justify-center transition-all " + (form.vincular_tambien === "si" ? "bg-[#C9A227] border-[#C9A227]" : "border-[#4B5563] bg-transparent")}>
                      {form.vincular_tambien === "si" && <span className="text-[#020810] text-xs font-bold">✓</span>}
                    </div>
                    <div>
                      <div className="text-sm text-[#E5E7EB] font-mono">Vincularme como veterinario de este productor</div>
                      <div className="text-xs text-[#4B5563] font-mono">Si lo activás, aparecerá en tu lista de productores</div>
                    </div>
                  </label>
                  {form.vincular_tambien === "si" && (
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div><label className={labelClass}>Tipo honorario</label>
                        <select value={form.honorario_tipo ?? "mensual"} onChange={e => setForm({ ...form, honorario_tipo: e.target.value })} className={inputClass}>
                          <option value="mensual">Mensual</option>
                          <option value="por_visita">Por visita</option>
                          <option value="por_campaña">Por campaña</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>
                      <div><label className={labelClass}>Monto</label>
                        <input type="number" value={form.honorario_monto ?? ""} onChange={e => setForm({ ...form, honorario_monto: e.target.value })} className={inputClass} placeholder="0" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={crearProductor} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#C9A227]/20 transition-all font-mono">▶ Crear Productor</button>
                  <button onClick={() => { setModoProductor("lista"); setForm({}); setMsg(""); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Form VINCULAR */}
            {modoProductor === "vincular" && (
              <div className="bg-[#0a1628]/80 border border-[#A78BFA]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#A78BFA] font-mono text-sm font-bold mb-2">🔗 VINCULAR PRODUCTOR EXISTENTE</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2"><label className={labelClass}>Email del productor</label>
                    <input type="email" value={form.email_productor ?? ""} onChange={e => setForm({ ...form, email_productor: e.target.value })} className={inputClass} placeholder="email@productor.com" />
                  </div>
                  <div><label className={labelClass}>Tipo honorario</label>
                    <select value={form.honorario_tipo ?? "mensual"} onChange={e => setForm({ ...form, honorario_tipo: e.target.value })} className={inputClass}>
                      <option value="mensual">Mensual</option>
                      <option value="por_visita">Por visita</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Monto</label>
                    <input type="number" value={form.honorario_monto ?? ""} onChange={e => setForm({ ...form, honorario_monto: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={vincularProductor} className="bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#A78BFA]/20 transition-all font-mono">▶ Vincular</button>
                  <button onClick={() => { setModoProductor("lista"); setForm({}); setMsg(""); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {productores.length === 0 ? (
              <div className="text-center py-20 bg-[#0a1628]/60 border border-[#A78BFA]/15 rounded-xl">
                <div className="text-5xl mb-4 opacity-20">👨‍🌾</div>
                <p className="text-[#4B5563] font-mono text-sm">No tenés productores vinculados todavía</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {productores.map(p => (
                  <div key={p.empresa_id} className="card-vet bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl overflow-hidden">
                    <div className="p-5 cursor-pointer" onClick={() => { setProdSel(p); fetchCategorias(p.empresa_id); }}>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#A78BFA]/10 border border-[#A78BFA]/30 flex items-center justify-center text-lg">👨‍🌾</div>
                          <div>
                            <div className="font-bold text-[#E5E7EB] font-mono">{p.propietario_nombre}</div>
                            <div className="text-xs text-[#4B5563] font-mono">{p.empresa_nombre}</div>
                          </div>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-[#A78BFA] animate-pulse" />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-[#4B5563] font-mono">Honorario</div>
                          <div className="text-sm font-bold font-mono text-[#C9A227]">${p.honorario_monto.toLocaleString("es-AR")} / {p.honorario_tipo.replace("_"," ")}</div>
                        </div>
                        <div className="text-xs text-[#A78BFA] font-mono border border-[#A78BFA]/20 px-3 py-1.5 rounded-lg hover:bg-[#A78BFA]/10 transition-colors">Ver hacienda →</div>
                      </div>
                    </div>
                    <div className="border-t border-[#A78BFA]/10 px-5 py-2 flex items-center justify-between">
                      <span className="text-xs text-[#4B5563] font-mono">{p.propietario_email}</span>
                      <button onClick={() => desvincular(p.vinculacion_id)} className="text-xs text-[#4B5563] hover:text-red-400 font-mono">Desvincular</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Panel hacienda del productor seleccionado */}
            {prodSel && (
              <div className="mt-6 bg-[#0a1628]/80 border border-[#A78BFA]/20 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-[#A78BFA] font-mono font-bold">🐄 HACIENDA DE: {prodSel.propietario_nombre.toUpperCase()}</h3>
                    <p className="text-xs text-[#4B5563] font-mono">{prodSel.empresa_nombre}</p>
                  </div>
                  <button onClick={() => { setProdSel(null); setCategorias([]); }} className="text-xs text-[#4B5563] hover:text-[#9CA3AF] font-mono">✕ Cerrar</button>
                </div>
                {categorias.length === 0 ? (
                  <p className="text-[#4B5563] font-mono text-sm text-center py-8">Sin categorías de hacienda registradas</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {categorias.map(c => (
                      <div key={c.id} className="bg-[#020810]/60 border border-[#A78BFA]/10 rounded-xl p-3 text-center">
                        <div className="text-xs text-[#4B5563] font-mono">{c.especie}</div>
                        <div className="font-bold text-[#E5E7EB] font-mono">{c.categoria}</div>
                        <div className="text-2xl font-bold text-[#A78BFA] font-mono">{c.cantidad}</div>
                        <div className="text-xs text-[#4B5563] font-mono">cabezas</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== RECETAS ===== */}
        {seccion === "recetas" && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">📋 RECETAS Y PRESCRIPCIONES</h2>
              <button onClick={() => { setShowForm(!showForm); setForm({ fecha: new Date().toISOString().split("T")[0] }); }}
                className="px-4 py-2 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/20 font-mono text-sm transition-all">
                + Nueva Receta
              </button>
            </div>

            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#A78BFA]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#A78BFA] font-mono text-sm font-bold mb-4">+ NUEVA RECETA VETERINARIA</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Productor</label>
                    <select value={form.empresa_id ?? ""} onChange={e => { setForm({ ...form, empresa_id: e.target.value, categoria_id: "" }); if (e.target.value) fetchCategorias(e.target.value); }} className={inputClass}>
                      <option value="">Seleccionar</option>
                      {productores.map(p => <option key={p.empresa_id} value={p.empresa_id}>{p.propietario_nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Categoría / Especie</label>
                    <select value={form.categoria_id ?? ""} onChange={e => setForm({ ...form, categoria_id: e.target.value })} className={inputClass}>
                      <option value="">Todas las categorías</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.categoria} ({c.especie}) — {c.cantidad} cab.</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Fecha</label>
                    <input type="date" value={form.fecha ?? ""} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputClass} />
                  </div>
                  <div><label className={labelClass}>Cantidad animales</label>
                    <input type="number" value={form.cantidad_animales ?? ""} onChange={e => setForm({ ...form, cantidad_animales: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div className="md:col-span-2"><label className={labelClass}>Diagnóstico</label>
                    <input type="text" value={form.diagnostico ?? ""} onChange={e => setForm({ ...form, diagnostico: e.target.value })} className={inputClass} placeholder="Diagnóstico clínico" />
                  </div>
                  <div className="md:col-span-3"><label className={labelClass}>Tratamiento indicado</label>
                    <input type="text" value={form.tratamiento ?? ""} onChange={e => setForm({ ...form, tratamiento: e.target.value })} className={inputClass} placeholder="Descripción del tratamiento" />
                  </div>
                  <div><label className={labelClass}>Producto / Medicamento</label>
                    <input type="text" value={form.producto ?? ""} onChange={e => setForm({ ...form, producto: e.target.value })} className={inputClass} placeholder="Nombre del producto" />
                  </div>
                  <div><label className={labelClass}>Dosis</label>
                    <input type="text" value={form.dosis ?? ""} onChange={e => setForm({ ...form, dosis: e.target.value })} className={inputClass} placeholder="Ej: 1ml/10kg" />
                  </div>
                  <div><label className={labelClass}>Vía de administración</label>
                    <select value={form.via_administracion ?? ""} onChange={e => setForm({ ...form, via_administracion: e.target.value })} className={inputClass}>
                      <option value="">Seleccionar</option>
                      <option value="intramuscular">Intramuscular</option>
                      <option value="subcutanea">Subcutánea</option>
                      <option value="endovenosa">Endovenosa</option>
                      <option value="oral">Oral</option>
                      <option value="topica">Tópica</option>
                      <option value="pour_on">Pour-On</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Duración (días)</label>
                    <input type="number" value={form.duracion_dias ?? ""} onChange={e => setForm({ ...form, duracion_dias: e.target.value })} className={inputClass} placeholder="1" />
                  </div>
                  <div><label className={labelClass}>Período retiro (días)</label>
                    <input type="number" value={form.periodo_retiro_dias ?? ""} onChange={e => setForm({ ...form, periodo_retiro_dias: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div><label className={labelClass}>Observaciones</label>
                    <input type="text" value={form.observaciones ?? ""} onChange={e => setForm({ ...form, observaciones: e.target.value })} className={inputClass} placeholder="Notas" />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarReceta} className="bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#A78BFA]/20 transition-all font-mono">▶ Guardar Receta</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            <div className="bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl overflow-hidden">
              {recetas.length === 0 ? (
                <div className="text-center py-16 text-[#4B5563] font-mono">Sin recetas registradas</div>
              ) : (
                <table className="w-full">
                  <thead><tr className="border-b border-[#A78BFA]/10">
                    {["Fecha","Productor","Diagnóstico","Producto","Dosis","Vía","Retiro",""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {recetas.map(r => {
                      const prod = productores.find(p => p.empresa_id === r.empresa_id);
                      return (
                        <tr key={r.id} className="border-b border-[#A78BFA]/5 hover:bg-[#A78BFA]/5 transition-colors">
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{r.fecha}</td>
                          <td className="px-4 py-3 text-xs text-[#E5E7EB] font-mono">{prod?.propietario_nombre ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{r.diagnostico}</td>
                          <td className="px-4 py-3 text-xs text-[#A78BFA] font-mono font-bold">{r.producto}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{r.dosis}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{r.via_administracion}</td>
                          <td className="px-4 py-3 text-xs font-mono" style={{ color: r.periodo_retiro_dias > 0 ? "#F87171" : "#4B5563" }}>
                            {r.periodo_retiro_dias > 0 ? `${r.periodo_retiro_dias} días` : "—"}
                          </td>
                          <td className="px-4 py-3 flex items-center gap-2">
                            <button onClick={() => imprimirReceta(r)} className="text-xs text-[#A78BFA] hover:text-[#A78BFA]/70 font-mono">🖨️ Imprimir</button>
                            <button onClick={() => eliminar("vet_recetas", r.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== HISTORIAL CLÍNICO ===== */}
        {seccion === "historial" && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">🩺 HISTORIAL CLÍNICO</h2>
              <button onClick={() => { setShowForm(!showForm); setForm({ fecha: new Date().toISOString().split("T")[0], tipo_hist: "consulta" }); }}
                className="px-4 py-2 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/20 font-mono text-sm transition-all">
                + Nuevo Evento
              </button>
            </div>

            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#A78BFA]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#A78BFA] font-mono text-sm font-bold mb-4">+ EVENTO CLÍNICO</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_hist ?? "consulta"} onChange={e => setForm({ ...form, tipo_hist: e.target.value })} className={inputClass}>
                      <option value="consulta">Consulta</option>
                      <option value="cirugia">Cirugía</option>
                      <option value="emergencia">Emergencia</option>
                      <option value="control">Control</option>
                      <option value="vacunacion">Vacunación</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Productor</label>
                    <select value={form.empresa_id ?? ""} onChange={e => { setForm({ ...form, empresa_id: e.target.value }); if (e.target.value) fetchCategorias(e.target.value); }} className={inputClass}>
                      <option value="">Seleccionar</option>
                      {productores.map(p => <option key={p.empresa_id} value={p.empresa_id}>{p.propietario_nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Categoría</label>
                    <select value={form.categoria_id ?? ""} onChange={e => setForm({ ...form, categoria_id: e.target.value })} className={inputClass}>
                      <option value="">Todas</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.categoria} ({c.especie})</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Fecha</label>
                    <input type="date" value={form.fecha ?? ""} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputClass} />
                  </div>
                  <div><label className={labelClass}>Próximo control</label>
                    <input type="date" value={form.proximo_control ?? ""} onChange={e => setForm({ ...form, proximo_control: e.target.value })} className={inputClass} />
                  </div>
                  <div><label className={labelClass}>Costo</label>
                    <input type="number" value={form.costo ?? ""} onChange={e => setForm({ ...form, costo: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div className="md:col-span-3"><label className={labelClass}>Descripción</label>
                    <input type="text" value={form.descripcion ?? ""} onChange={e => setForm({ ...form, descripcion: e.target.value })} className={inputClass} placeholder="Descripción del evento" />
                  </div>
                  <div className="md:col-span-2"><label className={labelClass}>Diagnóstico</label>
                    <input type="text" value={form.diagnostico ?? ""} onChange={e => setForm({ ...form, diagnostico: e.target.value })} className={inputClass} placeholder="Diagnóstico" />
                  </div>
                  <div><label className={labelClass}>Tratamiento</label>
                    <input type="text" value={form.tratamiento ?? ""} onChange={e => setForm({ ...form, tratamiento: e.target.value })} className={inputClass} placeholder="Tratamiento indicado" />
                  </div>
                  <div className="md:col-span-2"><label className={labelClass}>Resultado / Evolución</label>
                    <input type="text" value={form.resultado ?? ""} onChange={e => setForm({ ...form, resultado: e.target.value })} className={inputClass} placeholder="Cómo evolucionó" />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarHistorial} className="bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#A78BFA]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            <div className="bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl overflow-hidden">
              {historial.length === 0 ? (
                <div className="text-center py-16 text-[#4B5563] font-mono">Sin historial clínico registrado</div>
              ) : (
                <table className="w-full">
                  <thead><tr className="border-b border-[#A78BFA]/10">
                    {["Fecha","Tipo","Productor","Descripción","Diagnóstico","Próx. Control","Costo",""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {historial.map(h => {
                      const prod = productores.find(p => p.empresa_id === h.empresa_id);
                      const vencido = h.proximo_control && new Date(h.proximo_control) < new Date();
                      return (
                        <tr key={h.id} className="border-b border-[#A78BFA]/5 hover:bg-[#A78BFA]/5 transition-colors">
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{h.fecha}</td>
                          <td className="px-4 py-3"><span className="text-xs bg-[#A78BFA]/10 text-[#A78BFA] px-2 py-0.5 rounded font-mono">{h.tipo}</span></td>
                          <td className="px-4 py-3 text-xs text-[#E5E7EB] font-mono">{prod?.propietario_nombre ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{h.descripcion}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{h.diagnostico || "—"}</td>
                          <td className="px-4 py-3 text-xs font-mono" style={{ color: vencido ? "#F87171" : "#9CA3AF" }}>
                            {h.proximo_control || "—"} {vencido && "⚠️"}
                          </td>
                          <td className="px-4 py-3 font-bold font-mono text-[#C9A227]">{h.costo ? `$${Number(h.costo).toLocaleString("es-AR")}` : "—"}</td>
                          <td className="px-4 py-3"><button onClick={() => eliminar("vet_historial", h.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== COBRANZA ===== */}
        {seccion === "cobranza" && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">💰 COBRANZA</h2>
                <div className="flex gap-4 mt-1">
                  <span className="text-xs font-mono text-[#F87171]">Pendiente: <strong>${totalPendiente.toLocaleString("es-AR")}</strong></span>
                  <span className="text-xs font-mono text-[#4ADE80]">Cobrado: <strong>${totalCobrado.toLocaleString("es-AR")}</strong></span>
                </div>
              </div>
              <button onClick={() => { setShowForm(!showForm); setForm({ estado: "pendiente", fecha: new Date().toISOString().split("T")[0] }); }}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/20 font-mono text-sm transition-all">
                + Nuevo Cobro
              </button>
            </div>

            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ REGISTRAR COBRO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Productor</label>
                    <select value={form.empresa_id ?? ""} onChange={e => setForm({ ...form, empresa_id: e.target.value })} className={inputClass}>
                      <option value="">Sin productor</option>
                      {productores.map(p => <option key={p.empresa_id} value={p.empresa_id}>{p.propietario_nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Concepto</label>
                    <input type="text" value={form.concepto ?? ""} onChange={e => setForm({ ...form, concepto: e.target.value })} className={inputClass} placeholder="Ej: Visita enero" />
                  </div>
                  <div><label className={labelClass}>Monto</label>
                    <input type="number" value={form.monto ?? ""} onChange={e => setForm({ ...form, monto: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div><label className={labelClass}>Fecha</label>
                    <input type="date" value={form.fecha ?? ""} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputClass} />
                  </div>
                  <div><label className={labelClass}>Estado</label>
                    <select value={form.estado ?? "pendiente"} onChange={e => setForm({ ...form, estado: e.target.value })} className={inputClass}>
                      <option value="pendiente">Pendiente</option>
                      <option value="cobrado">Cobrado</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Método pago</label>
                    <select value={form.metodo_pago ?? ""} onChange={e => setForm({ ...form, metodo_pago: e.target.value })} className={inputClass}>
                      <option value="">—</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarCobranza} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#C9A227]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            <div className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl overflow-hidden">
              {cobranzas.length === 0 ? (
                <div className="text-center py-16 text-[#4B5563] font-mono">Sin cobros registrados</div>
              ) : (
                <table className="w-full">
                  <thead><tr className="border-b border-[#C9A227]/10">
                    {["Fecha","Productor","Concepto","Monto","Estado","Método",""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {cobranzas.map(c => {
                      const prod = productores.find(p => p.empresa_id === c.empresa_id);
                      return (
                        <tr key={c.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5 transition-colors">
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.fecha}</td>
                          <td className="px-4 py-3 text-xs text-[#E5E7EB] font-mono">{prod?.propietario_nombre ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{c.concepto}</td>
                          <td className="px-4 py-3 font-bold font-mono text-[#C9A227]">${Number(c.monto).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded font-mono ${c.estado === "cobrado" ? "bg-[#4ADE80]/10 text-[#4ADE80]" : "bg-[#F87171]/10 text-[#F87171]"}`}>{c.estado}</span></td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.metodo_pago || "—"}</td>
                          <td className="px-4 py-3 flex gap-2">
                            {c.estado === "pendiente" && <button onClick={() => marcarCobrado(c.id)} className="text-xs text-[#4ADE80] font-mono">✓ Cobrar</button>}
                            <button onClick={() => eliminar("vet_cobranzas", c.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== VEHÍCULO ===== */}
        {seccion === "vehiculo" && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">🚗 MI VEHÍCULO</h2>
              {!vehiculoSel ? (
                <button onClick={() => { setShowForm(true); setForm({}); }}
                  className="px-4 py-2 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/20 font-mono text-sm transition-all">
                  + Agregar Vehículo
                </button>
              ) : (
                <div className="flex gap-3">
                  <button onClick={() => { setShowForm(true); setForm({}); }}
                    className="px-4 py-2 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/20 font-mono text-sm transition-all">
                    + Service / Reparación
                  </button>
                  <button onClick={() => { setVehiculoSel(null); setServicios([]); setShowForm(false); }}
                    className="px-4 py-2 rounded-xl border border-[#1C2128] text-[#4B5563] hover:text-[#9CA3AF] font-mono text-sm">← Volver</button>
                </div>
              )}
            </div>

            {showForm && !vehiculoSel && (
              <div className="bg-[#0a1628]/80 border border-[#A78BFA]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#A78BFA] font-mono text-sm font-bold mb-4">+ NUEVO VEHÍCULO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre ?? ""} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputClass} placeholder="Ej: Ford Ranger" /></div>
                  <div><label className={labelClass}>Marca</label><input type="text" value={form.marca ?? ""} onChange={e => setForm({ ...form, marca: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Modelo</label><input type="text" value={form.modelo ?? ""} onChange={e => setForm({ ...form, modelo: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Año</label><input type="number" value={form.año ?? ""} onChange={e => setForm({ ...form, año: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Patente</label><input type="text" value={form.patente ?? ""} onChange={e => setForm({ ...form, patente: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Venc. Seguro</label><input type="date" value={form.seguro_vencimiento ?? ""} onChange={e => setForm({ ...form, seguro_vencimiento: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Compañía</label><input type="text" value={form.seguro_compania ?? ""} onChange={e => setForm({ ...form, seguro_compania: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Venc. VTV</label><input type="date" value={form.vtv_vencimiento ?? ""} onChange={e => setForm({ ...form, vtv_vencimiento: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Km actuales</label><input type="number" value={form.km_actuales ?? ""} onChange={e => setForm({ ...form, km_actuales: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Próx. service (km)</label><input type="number" value={form.proximo_service_km ?? ""} onChange={e => setForm({ ...form, proximo_service_km: e.target.value })} className={inputClass} /></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarVehiculo} className="bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#A78BFA]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {!vehiculoSel ? (
              vehiculos.length === 0 ? (
                <div className="text-center py-20 bg-[#0a1628]/60 border border-[#A78BFA]/15 rounded-xl">
                  <div className="text-5xl mb-4 opacity-20">🚗</div>
                  <p className="text-[#4B5563] font-mono">Sin vehículos registrados</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vehiculos.map(v => {
                    const segVenc = v.seguro_vencimiento && new Date(v.seguro_vencimiento) < new Date();
                    const vtvVenc = v.vtv_vencimiento && new Date(v.vtv_vencimiento) < new Date();
                    return (
                      <div key={v.id} className="card-vet bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl p-5 cursor-pointer"
                        onClick={() => { setVehiculoSel(v); fetchServicios(v.id); }}>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">🚗</span>
                            <div>
                              <div className="font-bold text-[#E5E7EB] font-mono">{v.nombre}</div>
                              <div className="text-xs text-[#4B5563] font-mono">{v.marca} {v.modelo} · {v.año} · {v.patente}</div>
                            </div>
                          </div>
                          <button onClick={e => { e.stopPropagation(); eliminar("vet_vehiculos", v.id); }} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-[#020810]/60 rounded-lg p-3">
                            <div className="text-xs text-[#4B5563] font-mono">Km actuales</div>
                            <div className="text-lg font-bold font-mono text-[#A78BFA]">{v.km_actuales.toLocaleString()} km</div>
                          </div>
                          <div className="bg-[#020810]/60 rounded-lg p-3">
                            <div className="text-xs text-[#4B5563] font-mono">Próx. service</div>
                            <div className="text-lg font-bold font-mono text-[#C9A227]">{v.proximo_service_km ? `${v.proximo_service_km.toLocaleString()} km` : "—"}</div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <span className={`text-xs px-2 py-1 rounded font-mono ${segVenc ? "bg-[#F87171]/10 text-[#F87171]" : "bg-[#4ADE80]/10 text-[#4ADE80]"}`}>
                            🛡️ {segVenc ? "Seguro VENCIDO" : `Seguro ${v.seguro_vencimiento || "—"}`}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded font-mono ${vtvVenc ? "bg-[#F87171]/10 text-[#F87171]" : "bg-[#4ADE80]/10 text-[#4ADE80]"}`}>
                            📋 {vtvVenc ? "VTV VENCIDA" : `VTV ${v.vtv_vencimiento || "—"}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div>
                <div className="bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl p-5 mb-4">
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-4xl">🚗</span>
                    <div>
                      <div className="font-bold text-xl text-[#E5E7EB] font-mono">{vehiculoSel.nombre}</div>
                      <div className="text-xs text-[#4B5563] font-mono">{vehiculoSel.marca} {vehiculoSel.modelo} · {vehiculoSel.año} · {vehiculoSel.patente}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Km actuales", value: `${vehiculoSel.km_actuales.toLocaleString()} km`, color: "#A78BFA" },
                      { label: "Próx. service", value: vehiculoSel.proximo_service_km ? `${vehiculoSel.proximo_service_km.toLocaleString()} km` : "—", color: "#C9A227" },
                      { label: "Seguro", value: vehiculoSel.seguro_vencimiento || "—", color: vehiculoSel.seguro_vencimiento && new Date(vehiculoSel.seguro_vencimiento) < new Date() ? "#F87171" : "#4ADE80" },
                      { label: "VTV", value: vehiculoSel.vtv_vencimiento || "—", color: vehiculoSel.vtv_vencimiento && new Date(vehiculoSel.vtv_vencimiento) < new Date() ? "#F87171" : "#4ADE80" },
                    ].map(d => (
                      <div key={d.label} className="bg-[#020810]/60 rounded-lg p-3">
                        <div className="text-xs text-[#4B5563] font-mono">{d.label}</div>
                        <div className="text-sm font-bold font-mono mt-1" style={{ color: d.color }}>{d.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {showForm && (
                  <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-4">
                    <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ SERVICE / REPARACIÓN</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div><label className={labelClass}>Tipo</label>
                        <select value={form.tipo_service ?? "service"} onChange={e => setForm({ ...form, tipo_service: e.target.value })} className={inputClass}>
                          <option value="service">Service</option>
                          <option value="reparacion">Reparación</option>
                          <option value="vtv">VTV</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>
                      <div><label className={labelClass}>Descripción</label><input type="text" value={form.descripcion ?? ""} onChange={e => setForm({ ...form, descripcion: e.target.value })} className={inputClass} /></div>
                      <div><label className={labelClass}>Taller</label><input type="text" value={form.taller ?? ""} onChange={e => setForm({ ...form, taller: e.target.value })} className={inputClass} /></div>
                      <div><label className={labelClass}>Km</label><input type="number" value={form.km ?? ""} onChange={e => setForm({ ...form, km: e.target.value })} className={inputClass} /></div>
                      <div><label className={labelClass}>Costo</label><input type="number" value={form.costo ?? ""} onChange={e => setForm({ ...form, costo: e.target.value })} className={inputClass} /></div>
                      <div><label className={labelClass}>Fecha</label><input type="date" value={form.fecha ?? new Date().toISOString().split("T")[0]} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputClass} /></div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button onClick={guardarService} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono">▶ Guardar</button>
                      <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                    </div>
                  </div>
                )}
                <div className="bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#A78BFA]/10">
                    <span className="text-[#A78BFA] text-sm font-mono font-bold">🔧 HISTORIAL</span>
                  </div>
                  {servicios.length === 0 ? (
                    <div className="text-center py-10 text-[#4B5563] font-mono text-sm">Sin historial</div>
                  ) : (
                    <table className="w-full">
                      <thead><tr className="border-b border-[#A78BFA]/10">
                        {["Fecha","Tipo","Descripción","Taller","Km","Costo",""].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {servicios.map(s => (
                          <tr key={s.id} className="border-b border-[#A78BFA]/5 hover:bg-[#A78BFA]/5 transition-colors">
                            <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.fecha}</td>
                            <td className="px-4 py-3"><span className="text-xs bg-[#C9A227]/10 text-[#C9A227] px-2 py-0.5 rounded font-mono">{s.tipo}</span></td>
                            <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{s.descripcion}</td>
                            <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.taller}</td>
                            <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.km ? `${s.km.toLocaleString()} km` : "—"}</td>
                            <td className="px-4 py-3 font-bold font-mono text-[#F87171]">${Number(s.costo).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3"><button onClick={() => eliminar("vet_vehiculo_service", s.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <p className="relative z-10 text-center text-[#0a0a2a] text-xs pb-4 tracking-[0.3em] font-mono">© AGROGESTION PRO · PANEL VETERINARIO</p>
    </div>
  );
}
"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Seccion = "productores" | "recetas" | "historial" | "cobranza" | "vehiculo";
type ModoProductor = "lista" | "vincular" | "crear";

type Productor = {
  empresa_id: string; empresa_nombre: string;
  propietario_nombre: string; propietario_email: string;
  vinculacion_id: string; honorario_tipo: string;
  honorario_monto: number;
};
type CategoriaHacienda = { id: string; especie: string; categoria: string; cantidad: number; };
type Receta = {
  id: string; empresa_id: string; categoria_id: string; fecha: string;
  diagnostico: string; tratamiento: string; producto: string; dosis: string;
  via_administracion: string; duracion_dias: number; cantidad_animales: number;
  periodo_retiro_dias: number; observaciones: string;
};
type Historial = {
  id: string; empresa_id: string; categoria_id: string; fecha: string;
  tipo: string; descripcion: string; diagnostico: string; tratamiento: string;
  resultado: string; proximo_control: string; costo: number;
};
type Cobranza = {
  id: string; empresa_id: string; concepto: string; monto: number;
  fecha: string; estado: string; metodo_pago: string; observaciones: string;
};
type Vehiculo = {
  id: string; nombre: string; marca: string; modelo: string; año: number;
  patente: string; seguro_vencimiento: string; seguro_compania: string;
  vtv_vencimiento: string; km_actuales: number; proximo_service_km: number;
};
type ServiceVehiculo = {
  id: string; tipo: string; descripcion: string; costo: number; km: number; fecha: string; taller: string;
};

export default function VeterinarioPanel() {
  const [seccion, setSeccion] = useState<Seccion>("productores");
  const [modoProductor, setModoProductor] = useState<ModoProductor>("lista");
  const [vetId, setVetId] = useState<string | null>(null);
  const [vetNombre, setVetNombre] = useState("");
  const [productores, setProductores] = useState<Productor[]>([]);
  const [prodSel, setProdSel] = useState<Productor | null>(null);
  const [categorias, setCategorias] = useState<CategoriaHacienda[]>([]);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [historial, setHistorial] = useState<Historial[]>([]);
  const [cobranzas, setCobranzas] = useState<Cobranza[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [servicios, setServicios] = useState<ServiceVehiculo[]>([]);
  const [vehiculoSel, setVehiculoSel] = useState<Vehiculo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [alertas, setAlertas] = useState<{ msg: string; urgencia: string }[]>([]);
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("id, nombre, rol").eq("auth_id", user.id).single();
    if (!u || u.rol !== "veterinario") { window.location.href = "/login"; return; }
    setVetId(u.id);
    setVetNombre(u.nombre);
    await fetchAll(u.id);
    setLoading(false);
  };

  const fetchAll = async (vid: string) => {
    const sb = await getSB();
    // Productores vinculados
    const { data: vincs } = await sb.from("vinculaciones").select("*, empresas(id, nombre, propietario_id)").eq("ingeniero_id", vid).eq("activa", true);
    if (vincs && vincs.length > 0) {
      const prods: Productor[] = [];
      for (const v of vincs) {
        const emp = (v as any).empresas;
        if (!emp) continue;
        const { data: prop } = await sb.from("usuarios").select("nombre, email").eq("id", emp.propietario_id).single();
        prods.push({
          empresa_id: emp.id, empresa_nombre: emp.nombre,
          propietario_nombre: prop?.nombre ?? "—",
          propietario_email: prop?.email ?? "—",
          vinculacion_id: v.id,
          honorario_tipo: v.honorario_tipo ?? "mensual",
          honorario_monto: v.honorario_monto ?? 0,
        });
      }
      setProductores(prods);
    } else { setProductores([]); }
    // Recetas e historial
    const [recs, hist, cobs, vehs] = await Promise.all([
      sb.from("vet_recetas").select("*").eq("veterinario_id", vid).order("fecha", { ascending: false }),
      sb.from("vet_historial").select("*").eq("veterinario_id", vid).order("fecha", { ascending: false }),
      sb.from("vet_cobranzas").select("*").eq("veterinario_id", vid).order("fecha", { ascending: false }),
      sb.from("vet_vehiculos").select("*").eq("veterinario_id", vid),
    ]);
    setRecetas(recs.data ?? []);
    setHistorial(hist.data ?? []);
    setCobranzas(cobs.data ?? []);
    setVehiculos(vehs.data ?? []);
    calcularAlertas(vehs.data ?? [], hist.data ?? [], cobs.data ?? []);
  };

  const calcularAlertas = (vehs: Vehiculo[], hist: Historial[], cobs: Cobranza[]) => {
    const alerts: { msg: string; urgencia: string }[] = [];
    const hoy = new Date();
    vehs.forEach(v => {
      if (v.seguro_vencimiento) {
        const diff = (new Date(v.seguro_vencimiento).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
        if (diff < 0) alerts.push({ msg: `${v.nombre}: Seguro VENCIDO`, urgencia: "alta" });
        else if (diff <= 30) alerts.push({ msg: `${v.nombre}: Seguro vence en ${Math.round(diff)} días`, urgencia: diff <= 7 ? "alta" : "media" });
      }
      if (v.vtv_vencimiento) {
        const diff = (new Date(v.vtv_vencimiento).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
        if (diff < 0) alerts.push({ msg: `${v.nombre}: VTV VENCIDA`, urgencia: "alta" });
        else if (diff <= 30) alerts.push({ msg: `${v.nombre}: VTV vence en ${Math.round(diff)} días`, urgencia: diff <= 7 ? "alta" : "media" });
      }
    });
    hist.filter(h => h.proximo_control).forEach(h => {
      const diff = (new Date(h.proximo_control).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
      if (diff < 0) alerts.push({ msg: `Control vencido: ${h.descripcion}`, urgencia: "alta" });
      else if (diff <= 7) alerts.push({ msg: `Control en ${Math.round(diff)} días: ${h.descripcion}`, urgencia: "media" });
    });
    cobs.filter(c => c.estado === "pendiente").forEach(c => {
      const diff = (hoy.getTime() - new Date(c.fecha).getTime()) / (1000 * 60 * 60 * 24);
      if (diff > 30) alerts.push({ msg: `Cobro pendiente +30 días: $${c.monto.toLocaleString("es-AR")}`, urgencia: "media" });
    });
    setAlertas(alerts);
  };

  const fetchCategorias = async (empId: string) => {
    const sb = await getSB();
    const { data } = await sb.from("hacienda_categorias").select("id, especie, categoria, cantidad").eq("empresa_id", empId);
    setCategorias(data ?? []);
  };

  const crearProductor = async () => {
    if (!vetId) return;
    setMsg("Creando productor...");
    const sb = await getSB();
    try {
      const { data: todos } = await sb.from("usuarios").select("codigo").eq("rol", "productor");
      const codigos = (todos ?? []).map((u: any) => Number(u.codigo)).filter((c: number) => c > 10000);
      const nuevoCodigo = codigos.length === 0 ? 10001 : Math.max(...codigos) + 1;
      const { data, error } = await sb.auth.signUp({
        email: form.email_nuevo, password: form.password_nuevo,
        options: { data: { nombre: form.nombre_nuevo } }
      });
      if (error) { setMsg("Error: " + error.message); return; }
      if (!data.user) { setMsg("Error al crear usuario"); return; }
      await sb.from("usuarios").insert({
        auth_id: data.user.id, nombre: form.nombre_nuevo,
        email: form.email_nuevo, rol: "productor",
        codigo: String(nuevoCodigo), activo: true,
      });
      const { data: nuevoUser } = await sb.from("usuarios").select("id").eq("auth_id", data.user.id).single();
      let empId = null;
      if (nuevoUser) {
        const { data: newEmp } = await sb.from("empresas").insert({
          nombre: form.nombre_empresa_nuevo || `Empresa de ${form.nombre_nuevo}`,
          propietario_id: nuevoUser.id,
        }).select().single();
        empId = newEmp?.id;
      }
      if (empId && form.vincular_tambien === "si") {
        await sb.from("vinculaciones").insert({
          ingeniero_id: vetId, empresa_id: empId, activa: true,
          honorario_tipo: form.honorario_tipo ?? "mensual",
          honorario_monto: Number(form.honorario_monto ?? 0),
        });
      }
      const vinMsg = form.vincular_tambien === "si" ? "— Vinculado con vos" : "— Sin vincular";
      setMsg(`✅ Productor creado — Código: ${nuevoCodigo} ${vinMsg}`);
      await fetchAll(vetId);
      setModoProductor("lista"); setForm({});
    } catch { setMsg("Error inesperado"); }
  };

  const vincularProductor = async () => {
    if (!vetId) return;
    const sb = await getSB();
    const { data: u } = await sb.from("usuarios").select("id").eq("email", form.email_productor).single();
    if (!u) { setMsg("Productor no encontrado"); return; }
    const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
    if (!emp) { setMsg("El productor no tiene empresa"); return; }
    const { data: existe } = await sb.from("vinculaciones").select("id").eq("ingeniero_id", vetId).eq("empresa_id", emp.id).single();
    if (existe) { setMsg("Ya estás vinculado con este productor"); return; }
    await sb.from("vinculaciones").insert({
      ingeniero_id: vetId, empresa_id: emp.id, activa: true,
      honorario_tipo: form.honorario_tipo ?? "mensual",
      honorario_monto: Number(form.honorario_monto ?? 0),
    });
    setMsg("✅ Vinculado correctamente");
    await fetchAll(vetId);
    setModoProductor("lista"); setForm({});
  };

  const desvincular = async (vinculacion_id: string) => {
    if (!confirm("¿Desvincular este productor?")) return;
    const sb = await getSB();
    await sb.from("vinculaciones").update({ activa: false }).eq("id", vinculacion_id);
    if (vetId) await fetchAll(vetId);
  };

  const guardarReceta = async () => {
    if (!vetId) return;
    const sb = await getSB();
    await sb.from("vet_recetas").insert({
      veterinario_id: vetId,
      empresa_id: form.empresa_id ?? null,
      categoria_id: form.categoria_id || null,
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      diagnostico: form.diagnostico ?? "",
      tratamiento: form.tratamiento ?? "",
      producto: form.producto ?? "",
      dosis: form.dosis ?? "",
      via_administracion: form.via_administracion ?? "",
      duracion_dias: Number(form.duracion_dias ?? 1),
      cantidad_animales: Number(form.cantidad_animales ?? 0),
      periodo_retiro_dias: Number(form.periodo_retiro_dias ?? 0),
      observaciones: form.observaciones ?? "",
    });
    await fetchAll(vetId);
    setShowForm(false); setForm({});
    setMsg("✅ Receta guardada");
  };

  const guardarHistorial = async () => {
    if (!vetId) return;
    const sb = await getSB();
    await sb.from("vet_historial").insert({
      veterinario_id: vetId,
      empresa_id: form.empresa_id ?? null,
      categoria_id: form.categoria_id || null,
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      tipo: form.tipo_hist ?? "consulta",
      descripcion: form.descripcion ?? "",
      diagnostico: form.diagnostico ?? "",
      tratamiento: form.tratamiento ?? "",
      resultado: form.resultado ?? "",
      proximo_control: form.proximo_control || null,
      costo: Number(form.costo ?? 0),
    });
    await fetchAll(vetId);
    setShowForm(false); setForm({});
    setMsg("✅ Historial guardado");
  };

  const guardarCobranza = async () => {
    if (!vetId) return;
    const sb = await getSB();
    await sb.from("vet_cobranzas").insert({
      veterinario_id: vetId, empresa_id: form.empresa_id ?? null,
      concepto: form.concepto ?? "", monto: Number(form.monto ?? 0),
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      estado: form.estado ?? "pendiente", metodo_pago: form.metodo_pago ?? "",
      observaciones: form.observaciones ?? "",
    });
    await fetchAll(vetId);
    setShowForm(false); setForm({});
  };

  const marcarCobrado = async (id: string) => {
    const sb = await getSB();
    await sb.from("vet_cobranzas").update({ estado: "cobrado" }).eq("id", id);
    if (vetId) await fetchAll(vetId);
  };

  const guardarVehiculo = async () => {
    if (!vetId) return;
    const sb = await getSB();
    await sb.from("vet_vehiculos").insert({
      veterinario_id: vetId, nombre: form.nombre, marca: form.marca ?? "",
      modelo: form.modelo ?? "", año: Number(form.año ?? 0), patente: form.patente ?? "",
      seguro_vencimiento: form.seguro_vencimiento || null, seguro_compania: form.seguro_compania ?? "",
      vtv_vencimiento: form.vtv_vencimiento || null, km_actuales: Number(form.km_actuales ?? 0),
      proximo_service_km: Number(form.proximo_service_km ?? 0),
    });
    await fetchAll(vetId);
    setShowForm(false); setForm({});
  };

  const guardarService = async () => {
    if (!vehiculoSel || !vetId) return;
    const sb = await getSB();
    await sb.from("vet_vehiculo_service").insert({
      vehiculo_id: vehiculoSel.id, veterinario_id: vetId,
      tipo: form.tipo_service ?? "service", descripcion: form.descripcion ?? "",
      costo: Number(form.costo ?? 0), km: Number(form.km ?? 0),
      fecha: form.fecha ?? new Date().toISOString().split("T")[0], taller: form.taller ?? "",
    });
    await fetchServicios(vehiculoSel.id);
    setShowForm(false); setForm({});
  };

  const fetchServicios = async (vid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("vet_vehiculo_service").select("*").eq("vehiculo_id", vid).order("fecha", { ascending: false });
    setServicios(data ?? []);
  };

  const eliminar = async (tabla: string, id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (vetId) await fetchAll(vetId);
  };

  const imprimirReceta = (r: Receta) => {
    const prod = productores.find(p => p.empresa_id === r.empresa_id);
    const cat = categorias.find(c => c.id === r.categoria_id);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>Receta Veterinaria</title>
      <style>body{font-family:monospace;padding:40px;max-width:700px;margin:0 auto}
      h1{border-bottom:2px solid #000;padding-bottom:10px}
      .row{display:flex;justify-content:space-between;margin:8px 0}
      .label{font-weight:bold;color:#555}
      .box{border:1px solid #ccc;padding:15px;margin:15px 0;border-radius:8px}
      .footer{margin-top:60px;border-top:1px solid #000;padding-top:20px;display:flex;justify-content:space-between}
      </style></head><body>
      <h1>🩺 RECETA VETERINARIA — AGROGESTION PRO</h1>
      <div class="row"><span class="label">Veterinario:</span><span>${vetNombre}</span></div>
      <div class="row"><span class="label">Fecha:</span><span>${r.fecha}</span></div>
      <div class="row"><span class="label">Productor:</span><span>${prod?.propietario_nombre ?? "—"}</span></div>
      <div class="row"><span class="label">Empresa:</span><span>${prod?.empresa_nombre ?? "—"}</span></div>
      <div class="row"><span class="label">Categoría:</span><span>${cat ? `${cat.categoria} (${cat.especie})` : "—"}</span></div>
      <div class="row"><span class="label">Cantidad animales:</span><span>${r.cantidad_animales}</span></div>
      <div class="box">
        <div class="label">DIAGNÓSTICO:</div><p>${r.diagnostico}</p>
        <div class="label">TRATAMIENTO:</div><p>${r.tratamiento}</p>
      </div>
      <div class="box">
        <div class="label">PRESCRIPCIÓN:</div>
        <div class="row"><span class="label">Producto:</span><span>${r.producto}</span></div>
        <div class="row"><span class="label">Dosis:</span><span>${r.dosis}</span></div>
        <div class="row"><span class="label">Vía:</span><span>${r.via_administracion}</span></div>
        <div class="row"><span class="label">Duración:</span><span>${r.duracion_dias} días</span></div>
        <div class="row"><span class="label">Período de retiro:</span><span>${r.periodo_retiro_dias} días</span></div>
      </div>
      ${r.observaciones ? `<div class="box"><div class="label">OBSERVACIONES:</div><p>${r.observaciones}</p></div>` : ""}
      <div class="footer">
        <div><p>Firma y sello del veterinario</p><br/><br/>____________________</div>
        <div style="text-align:right"><small>AgroGestión PRO · Receta generada digitalmente</small></div>
      </div>
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  const askAI = async (prompt: string) => {
    setAiLoading(true); setAiMsg("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: `Sos un veterinario experto en producción animal para Argentina. Respondé en español, de forma técnica y práctica. Veterinario: ${vetNombre}. Productores asesorados: ${productores.length}. ${prompt}` }]
        })
      });
      const data = await res.json();
      setAiMsg(data.content?.[0]?.text ?? "Sin respuesta");
    } catch { setAiMsg("Error al conectar con IA"); }
    setAiLoading(false);
  };

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#A78BFA]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#A78BFA] font-mono transition-all";
  const labelClass = "block text-xs text-[#6B5B8B] uppercase tracking-widest mb-1 font-mono";
  const totalPendiente = cobranzas.filter(c => c.estado === "pendiente").reduce((a, c) => a + c.monto, 0);
  const totalCobrado = cobranzas.filter(c => c.estado === "cobrado").reduce((a, c) => a + c.monto, 0);

  const secciones = [
    { key: "productores" as Seccion, label: "MIS PRODUCTORES", icon: "👨‍🌾" },
    { key: "recetas" as Seccion, label: "RECETAS", icon: "📋" },
    { key: "historial" as Seccion, label: "HISTORIAL CLÍNICO", icon: "🩺" },
    { key: "cobranza" as Seccion, label: "COBRANZA", icon: "💰" },
    { key: "vehiculo" as Seccion, label: "MI VEHÍCULO", icon: "🚗" },
  ];

  if (loading) return (
    <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#A78BFA] font-mono animate-pulse">
      ▶ Cargando Panel Veterinario...
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        .card-vet:hover { border-color: rgba(167,139,250,0.4) !important; transform: translateY(-2px); }
        .card-vet { transition: all 0.2s ease; }
        .sec-vet-active { border-color: #A78BFA !important; color: #A78BFA !important; background: rgba(167,139,250,0.08) !important; }
        .modo-vet-active { border-color: #C9A227 !important; color: #C9A227 !important; background: rgba(201,162,39,0.08) !important; }
      `}</style>

      <div className="absolute inset-0 z-0">
        <Image src="/dashboard-bg.png" alt="bg" fill style={{ objectFit: "cover" }} />
        <div className="absolute inset-0 bg-[#020810]/88" />
      </div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: `linear-gradient(rgba(167,139,250,1) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,1) 1px, transparent 1px)`, backgroundSize: "50px 50px" }} />

      {/* Header */}
      <div className="relative z-10 border-b border-[#A78BFA]/20 bg-[#020810]/80 backdrop-blur-sm px-6 py-3 flex items-center gap-4">
        <Image src="/logo.png" alt="Logo" width={100} height={35} className="object-contain" />
        <div className="flex-1" />
        <div className="text-right">
          <div className="text-xs text-[#E5E7EB] font-mono">{vetNombre}</div>
          <div className="text-xs text-[#A78BFA] font-mono">VETERINARIO</div>
        </div>
        {alertas.length > 0 && (
          <div className="w-8 h-8 rounded-full bg-[#F87171]/10 border border-[#F87171]/30 flex items-center justify-center">
            <span className="text-[#F87171] text-xs font-bold">{alertas.length}</span>
          </div>
        )}
        <button onClick={async () => { const sb = await getSB(); await sb.auth.signOut(); window.location.href = "/login"; }}
          className="text-xs text-[#4B5563] hover:text-red-400 transition-colors font-mono">Salir</button>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">◆ PANEL VETERINARIO</h1>
          <p className="text-[#A78BFA] text-xs tracking-widest font-mono mt-1">{productores.length} PRODUCTOR{productores.length !== 1 ? "ES" : ""} ASESORADO{productores.length !== 1 ? "S" : ""} · IA VETERINARIA ACTIVA</p>
        </div>

        {/* Alertas */}
        {alertas.length > 0 && (
          <div className="bg-[#0a1628]/80 border border-[#F87171]/30 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#F87171] animate-pulse" />
              <span className="text-[#F87171] text-xs font-mono font-bold">⚠️ ALERTAS ({alertas.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {alertas.map((a, i) => (
                <div key={i} className={`px-3 py-1.5 rounded-lg text-xs font-mono border ${a.urgencia === "alta" ? "border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5" : "border-[#C9A227]/30 text-[#C9A227] bg-[#C9A227]/5"}`}>
                  {a.urgencia === "alta" ? "🔴" : "🟡"} {a.msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mensaje */}
        {msg && (
          <div className={`mb-4 px-4 py-2 rounded-lg text-sm font-mono border ${msg.startsWith("✅") ? "border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5" : "border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5"}`}>
            {msg} <button onClick={() => setMsg("")} className="ml-3 opacity-50 hover:opacity-100">✕</button>
          </div>
        )}

        {/* IA rápida */}
        <div className="bg-[#0a1628]/60 border border-[#A78BFA]/15 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#A78BFA] animate-pulse" />
            <span className="text-[#A78BFA] text-xs font-mono tracking-widest">◆ ASISTENTE VETERINARIO IA</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {["Dosis de ivermectina en bovinos","Período de retiro de oxitetraciclina","Protocolo vacunación aftosa Argentina","Signos de tristeza parasitaria"].map(q => (
              <button key={q} onClick={() => askAI(q)}
                className="text-xs text-[#6B5B8B] hover:text-[#A78BFA] border border-[#A78BFA]/10 hover:border-[#A78BFA]/30 px-3 py-1.5 rounded-lg font-mono transition-all">
                {q}
              </button>
            ))}
          </div>
          {aiLoading && <p className="text-[#A78BFA] text-xs font-mono mt-3 animate-pulse">▶ Consultando base veterinaria...</p>}
          {aiMsg && <div className="mt-3 p-3 bg-[#A78BFA]/5 border border-[#A78BFA]/20 rounded-lg"><p className="text-[#9CA3AF] text-sm leading-relaxed">{aiMsg}</p></div>}
        </div>

        {/* Navegación */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {secciones.map(s => (
            <button key={s.key} onClick={() => { setSeccion(s.key); setShowForm(false); setForm({}); setVehiculoSel(null); setModoProductor("lista"); setMsg(""); }}
              className={`px-5 py-2.5 rounded-xl border border-[#A78BFA]/15 text-sm font-mono transition-all ${seccion === s.key ? "sec-vet-active" : "text-[#4B5563] hover:text-[#9CA3AF]"}`}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        {/* ===== PRODUCTORES ===== */}
        {seccion === "productores" && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">👨‍🌾 MIS PRODUCTORES</h2>
                <p className="text-xs text-[#4B5563] font-mono">Clickeá un productor para ver su hacienda</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setModoProductor(modoProductor === "crear" ? "lista" : "crear"); setForm({}); setMsg(""); }}
                  className={`px-4 py-2 rounded-xl border font-mono text-sm transition-all ${modoProductor === "crear" ? "modo-vet-active" : "border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/10"}`}>
                  + Crear Productor
                </button>
                <button onClick={() => { setModoProductor(modoProductor === "vincular" ? "lista" : "vincular"); setForm({}); setMsg(""); }}
                  className={`px-4 py-2 rounded-xl border font-mono text-sm transition-all ${modoProductor === "vincular" ? "sec-vet-active" : "border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/10"}`}>
                  🔗 Vincular Existente
                </button>
              </div>
            </div>

            {/* Form CREAR */}
            {modoProductor === "crear" && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-2">+ CREAR NUEVO PRODUCTOR</h3>
                <p className="text-xs text-[#4B5563] font-mono mb-4">Se crea el usuario y su empresa. Podés vincularte o dejarlo solo.</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Nombre completo</label>
                    <input type="text" value={form.nombre_nuevo ?? ""} onChange={e => setForm({ ...form, nombre_nuevo: e.target.value })} className={inputClass} placeholder="Nombre y apellido" />
                  </div>
                  <div><label className={labelClass}>Email</label>
                    <input type="email" value={form.email_nuevo ?? ""} onChange={e => setForm({ ...form, email_nuevo: e.target.value })} className={inputClass} placeholder="email@productor.com" />
                  </div>
                  <div><label className={labelClass}>Contraseña inicial</label>
                    <input type="text" value={form.password_nuevo ?? ""} onChange={e => setForm({ ...form, password_nuevo: e.target.value })} className={inputClass} placeholder="Clave temporal" />
                  </div>
                  <div><label className={labelClass}>Nombre empresa</label>
                    <input type="text" value={form.nombre_empresa_nuevo ?? ""} onChange={e => setForm({ ...form, nombre_empresa_nuevo: e.target.value })} className={inputClass} placeholder="Ej: Establecimiento Don Juan" />
                  </div>
                </div>
                <div className="mt-4 p-4 bg-[#020810]/60 border border-[#C9A227]/15 rounded-xl">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div onClick={() => setForm({ ...form, vincular_tambien: form.vincular_tambien === "si" ? "no" : "si" })}
                      className={"w-5 h-5 rounded border-2 flex items-center justify-center transition-all " + (form.vincular_tambien === "si" ? "bg-[#C9A227] border-[#C9A227]" : "border-[#4B5563] bg-transparent")}>
                      {form.vincular_tambien === "si" && <span className="text-[#020810] text-xs font-bold">✓</span>}
                    </div>
                    <div>
                      <div className="text-sm text-[#E5E7EB] font-mono">Vincularme como veterinario de este productor</div>
                      <div className="text-xs text-[#4B5563] font-mono">Si lo activás, aparecerá en tu lista de productores</div>
                    </div>
                  </label>
                  {form.vincular_tambien === "si" && (
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div><label className={labelClass}>Tipo honorario</label>
                        <select value={form.honorario_tipo ?? "mensual"} onChange={e => setForm({ ...form, honorario_tipo: e.target.value })} className={inputClass}>
                          <option value="mensual">Mensual</option>
                          <option value="por_visita">Por visita</option>
                          <option value="por_campaña">Por campaña</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>
                      <div><label className={labelClass}>Monto</label>
                        <input type="number" value={form.honorario_monto ?? ""} onChange={e => setForm({ ...form, honorario_monto: e.target.value })} className={inputClass} placeholder="0" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={crearProductor} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#C9A227]/20 transition-all font-mono">▶ Crear Productor</button>
                  <button onClick={() => { setModoProductor("lista"); setForm({}); setMsg(""); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Form VINCULAR */}
            {modoProductor === "vincular" && (
              <div className="bg-[#0a1628]/80 border border-[#A78BFA]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#A78BFA] font-mono text-sm font-bold mb-2">🔗 VINCULAR PRODUCTOR EXISTENTE</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2"><label className={labelClass}>Email del productor</label>
                    <input type="email" value={form.email_productor ?? ""} onChange={e => setForm({ ...form, email_productor: e.target.value })} className={inputClass} placeholder="email@productor.com" />
                  </div>
                  <div><label className={labelClass}>Tipo honorario</label>
                    <select value={form.honorario_tipo ?? "mensual"} onChange={e => setForm({ ...form, honorario_tipo: e.target.value })} className={inputClass}>
                      <option value="mensual">Mensual</option>
                      <option value="por_visita">Por visita</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Monto</label>
                    <input type="number" value={form.honorario_monto ?? ""} onChange={e => setForm({ ...form, honorario_monto: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={vincularProductor} className="bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#A78BFA]/20 transition-all font-mono">▶ Vincular</button>
                  <button onClick={() => { setModoProductor("lista"); setForm({}); setMsg(""); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {productores.length === 0 ? (
              <div className="text-center py-20 bg-[#0a1628]/60 border border-[#A78BFA]/15 rounded-xl">
                <div className="text-5xl mb-4 opacity-20">👨‍🌾</div>
                <p className="text-[#4B5563] font-mono text-sm">No tenés productores vinculados todavía</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {productores.map(p => (
                  <div key={p.empresa_id} className="card-vet bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl overflow-hidden">
                    <div className="p-5 cursor-pointer" onClick={() => { setProdSel(p); fetchCategorias(p.empresa_id); }}>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#A78BFA]/10 border border-[#A78BFA]/30 flex items-center justify-center text-lg">👨‍🌾</div>
                          <div>
                            <div className="font-bold text-[#E5E7EB] font-mono">{p.propietario_nombre}</div>
                            <div className="text-xs text-[#4B5563] font-mono">{p.empresa_nombre}</div>
                          </div>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-[#A78BFA] animate-pulse" />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-[#4B5563] font-mono">Honorario</div>
                          <div className="text-sm font-bold font-mono text-[#C9A227]">${p.honorario_monto.toLocaleString("es-AR")} / {p.honorario_tipo.replace("_"," ")}</div>
                        </div>
                        <div className="text-xs text-[#A78BFA] font-mono border border-[#A78BFA]/20 px-3 py-1.5 rounded-lg hover:bg-[#A78BFA]/10 transition-colors">Ver hacienda →</div>
                      </div>
                    </div>
                    <div className="border-t border-[#A78BFA]/10 px-5 py-2 flex items-center justify-between">
                      <span className="text-xs text-[#4B5563] font-mono">{p.propietario_email}</span>
                      <button onClick={() => desvincular(p.vinculacion_id)} className="text-xs text-[#4B5563] hover:text-red-400 font-mono">Desvincular</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Panel hacienda del productor seleccionado */}
            {prodSel && (
              <div className="mt-6 bg-[#0a1628]/80 border border-[#A78BFA]/20 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-[#A78BFA] font-mono font-bold">🐄 HACIENDA DE: {prodSel.propietario_nombre.toUpperCase()}</h3>
                    <p className="text-xs text-[#4B5563] font-mono">{prodSel.empresa_nombre}</p>
                  </div>
                  <button onClick={() => { setProdSel(null); setCategorias([]); }} className="text-xs text-[#4B5563] hover:text-[#9CA3AF] font-mono">✕ Cerrar</button>
                </div>
                {categorias.length === 0 ? (
                  <p className="text-[#4B5563] font-mono text-sm text-center py-8">Sin categorías de hacienda registradas</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {categorias.map(c => (
                      <div key={c.id} className="bg-[#020810]/60 border border-[#A78BFA]/10 rounded-xl p-3 text-center">
                        <div className="text-xs text-[#4B5563] font-mono">{c.especie}</div>
                        <div className="font-bold text-[#E5E7EB] font-mono">{c.categoria}</div>
                        <div className="text-2xl font-bold text-[#A78BFA] font-mono">{c.cantidad}</div>
                        <div className="text-xs text-[#4B5563] font-mono">cabezas</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== RECETAS ===== */}
        {seccion === "recetas" && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">📋 RECETAS Y PRESCRIPCIONES</h2>
              <button onClick={() => { setShowForm(!showForm); setForm({ fecha: new Date().toISOString().split("T")[0] }); }}
                className="px-4 py-2 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/20 font-mono text-sm transition-all">
                + Nueva Receta
              </button>
            </div>

            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#A78BFA]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#A78BFA] font-mono text-sm font-bold mb-4">+ NUEVA RECETA VETERINARIA</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Productor</label>
                    <select value={form.empresa_id ?? ""} onChange={e => { setForm({ ...form, empresa_id: e.target.value, categoria_id: "" }); if (e.target.value) fetchCategorias(e.target.value); }} className={inputClass}>
                      <option value="">Seleccionar</option>
                      {productores.map(p => <option key={p.empresa_id} value={p.empresa_id}>{p.propietario_nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Categoría / Especie</label>
                    <select value={form.categoria_id ?? ""} onChange={e => setForm({ ...form, categoria_id: e.target.value })} className={inputClass}>
                      <option value="">Todas las categorías</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.categoria} ({c.especie}) — {c.cantidad} cab.</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Fecha</label>
                    <input type="date" value={form.fecha ?? ""} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputClass} />
                  </div>
                  <div><label className={labelClass}>Cantidad animales</label>
                    <input type="number" value={form.cantidad_animales ?? ""} onChange={e => setForm({ ...form, cantidad_animales: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div className="md:col-span-2"><label className={labelClass}>Diagnóstico</label>
                    <input type="text" value={form.diagnostico ?? ""} onChange={e => setForm({ ...form, diagnostico: e.target.value })} className={inputClass} placeholder="Diagnóstico clínico" />
                  </div>
                  <div className="md:col-span-3"><label className={labelClass}>Tratamiento indicado</label>
                    <input type="text" value={form.tratamiento ?? ""} onChange={e => setForm({ ...form, tratamiento: e.target.value })} className={inputClass} placeholder="Descripción del tratamiento" />
                  </div>
                  <div><label className={labelClass}>Producto / Medicamento</label>
                    <input type="text" value={form.producto ?? ""} onChange={e => setForm({ ...form, producto: e.target.value })} className={inputClass} placeholder="Nombre del producto" />
                  </div>
                  <div><label className={labelClass}>Dosis</label>
                    <input type="text" value={form.dosis ?? ""} onChange={e => setForm({ ...form, dosis: e.target.value })} className={inputClass} placeholder="Ej: 1ml/10kg" />
                  </div>
                  <div><label className={labelClass}>Vía de administración</label>
                    <select value={form.via_administracion ?? ""} onChange={e => setForm({ ...form, via_administracion: e.target.value })} className={inputClass}>
                      <option value="">Seleccionar</option>
                      <option value="intramuscular">Intramuscular</option>
                      <option value="subcutanea">Subcutánea</option>
                      <option value="endovenosa">Endovenosa</option>
                      <option value="oral">Oral</option>
                      <option value="topica">Tópica</option>
                      <option value="pour_on">Pour-On</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Duración (días)</label>
                    <input type="number" value={form.duracion_dias ?? ""} onChange={e => setForm({ ...form, duracion_dias: e.target.value })} className={inputClass} placeholder="1" />
                  </div>
                  <div><label className={labelClass}>Período retiro (días)</label>
                    <input type="number" value={form.periodo_retiro_dias ?? ""} onChange={e => setForm({ ...form, periodo_retiro_dias: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div><label className={labelClass}>Observaciones</label>
                    <input type="text" value={form.observaciones ?? ""} onChange={e => setForm({ ...form, observaciones: e.target.value })} className={inputClass} placeholder="Notas" />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarReceta} className="bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#A78BFA]/20 transition-all font-mono">▶ Guardar Receta</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            <div className="bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl overflow-hidden">
              {recetas.length === 0 ? (
                <div className="text-center py-16 text-[#4B5563] font-mono">Sin recetas registradas</div>
              ) : (
                <table className="w-full">
                  <thead><tr className="border-b border-[#A78BFA]/10">
                    {["Fecha","Productor","Diagnóstico","Producto","Dosis","Vía","Retiro",""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {recetas.map(r => {
                      const prod = productores.find(p => p.empresa_id === r.empresa_id);
                      return (
                        <tr key={r.id} className="border-b border-[#A78BFA]/5 hover:bg-[#A78BFA]/5 transition-colors">
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{r.fecha}</td>
                          <td className="px-4 py-3 text-xs text-[#E5E7EB] font-mono">{prod?.propietario_nombre ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{r.diagnostico}</td>
                          <td className="px-4 py-3 text-xs text-[#A78BFA] font-mono font-bold">{r.producto}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{r.dosis}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{r.via_administracion}</td>
                          <td className="px-4 py-3 text-xs font-mono" style={{ color: r.periodo_retiro_dias > 0 ? "#F87171" : "#4B5563" }}>
                            {r.periodo_retiro_dias > 0 ? `${r.periodo_retiro_dias} días` : "—"}
                          </td>
                          <td className="px-4 py-3 flex items-center gap-2">
                            <button onClick={() => imprimirReceta(r)} className="text-xs text-[#A78BFA] hover:text-[#A78BFA]/70 font-mono">🖨️ Imprimir</button>
                            <button onClick={() => eliminar("vet_recetas", r.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== HISTORIAL CLÍNICO ===== */}
        {seccion === "historial" && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">🩺 HISTORIAL CLÍNICO</h2>
              <button onClick={() => { setShowForm(!showForm); setForm({ fecha: new Date().toISOString().split("T")[0], tipo_hist: "consulta" }); }}
                className="px-4 py-2 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/20 font-mono text-sm transition-all">
                + Nuevo Evento
              </button>
            </div>

            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#A78BFA]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#A78BFA] font-mono text-sm font-bold mb-4">+ EVENTO CLÍNICO</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_hist ?? "consulta"} onChange={e => setForm({ ...form, tipo_hist: e.target.value })} className={inputClass}>
                      <option value="consulta">Consulta</option>
                      <option value="cirugia">Cirugía</option>
                      <option value="emergencia">Emergencia</option>
                      <option value="control">Control</option>
                      <option value="vacunacion">Vacunación</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Productor</label>
                    <select value={form.empresa_id ?? ""} onChange={e => { setForm({ ...form, empresa_id: e.target.value }); if (e.target.value) fetchCategorias(e.target.value); }} className={inputClass}>
                      <option value="">Seleccionar</option>
                      {productores.map(p => <option key={p.empresa_id} value={p.empresa_id}>{p.propietario_nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Categoría</label>
                    <select value={form.categoria_id ?? ""} onChange={e => setForm({ ...form, categoria_id: e.target.value })} className={inputClass}>
                      <option value="">Todas</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.categoria} ({c.especie})</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Fecha</label>
                    <input type="date" value={form.fecha ?? ""} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputClass} />
                  </div>
                  <div><label className={labelClass}>Próximo control</label>
                    <input type="date" value={form.proximo_control ?? ""} onChange={e => setForm({ ...form, proximo_control: e.target.value })} className={inputClass} />
                  </div>
                  <div><label className={labelClass}>Costo</label>
                    <input type="number" value={form.costo ?? ""} onChange={e => setForm({ ...form, costo: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div className="md:col-span-3"><label className={labelClass}>Descripción</label>
                    <input type="text" value={form.descripcion ?? ""} onChange={e => setForm({ ...form, descripcion: e.target.value })} className={inputClass} placeholder="Descripción del evento" />
                  </div>
                  <div className="md:col-span-2"><label className={labelClass}>Diagnóstico</label>
                    <input type="text" value={form.diagnostico ?? ""} onChange={e => setForm({ ...form, diagnostico: e.target.value })} className={inputClass} placeholder="Diagnóstico" />
                  </div>
                  <div><label className={labelClass}>Tratamiento</label>
                    <input type="text" value={form.tratamiento ?? ""} onChange={e => setForm({ ...form, tratamiento: e.target.value })} className={inputClass} placeholder="Tratamiento indicado" />
                  </div>
                  <div className="md:col-span-2"><label className={labelClass}>Resultado / Evolución</label>
                    <input type="text" value={form.resultado ?? ""} onChange={e => setForm({ ...form, resultado: e.target.value })} className={inputClass} placeholder="Cómo evolucionó" />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarHistorial} className="bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#A78BFA]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            <div className="bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl overflow-hidden">
              {historial.length === 0 ? (
                <div className="text-center py-16 text-[#4B5563] font-mono">Sin historial clínico registrado</div>
              ) : (
                <table className="w-full">
                  <thead><tr className="border-b border-[#A78BFA]/10">
                    {["Fecha","Tipo","Productor","Descripción","Diagnóstico","Próx. Control","Costo",""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {historial.map(h => {
                      const prod = productores.find(p => p.empresa_id === h.empresa_id);
                      const vencido = h.proximo_control && new Date(h.proximo_control) < new Date();
                      return (
                        <tr key={h.id} className="border-b border-[#A78BFA]/5 hover:bg-[#A78BFA]/5 transition-colors">
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{h.fecha}</td>
                          <td className="px-4 py-3"><span className="text-xs bg-[#A78BFA]/10 text-[#A78BFA] px-2 py-0.5 rounded font-mono">{h.tipo}</span></td>
                          <td className="px-4 py-3 text-xs text-[#E5E7EB] font-mono">{prod?.propietario_nombre ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{h.descripcion}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{h.diagnostico || "—"}</td>
                          <td className="px-4 py-3 text-xs font-mono" style={{ color: vencido ? "#F87171" : "#9CA3AF" }}>
                            {h.proximo_control || "—"} {vencido && "⚠️"}
                          </td>
                          <td className="px-4 py-3 font-bold font-mono text-[#C9A227]">{h.costo ? `$${Number(h.costo).toLocaleString("es-AR")}` : "—"}</td>
                          <td className="px-4 py-3"><button onClick={() => eliminar("vet_historial", h.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== COBRANZA ===== */}
        {seccion === "cobranza" && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">💰 COBRANZA</h2>
                <div className="flex gap-4 mt-1">
                  <span className="text-xs font-mono text-[#F87171]">Pendiente: <strong>${totalPendiente.toLocaleString("es-AR")}</strong></span>
                  <span className="text-xs font-mono text-[#4ADE80]">Cobrado: <strong>${totalCobrado.toLocaleString("es-AR")}</strong></span>
                </div>
              </div>
              <button onClick={() => { setShowForm(!showForm); setForm({ estado: "pendiente", fecha: new Date().toISOString().split("T")[0] }); }}
                className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/20 font-mono text-sm transition-all">
                + Nuevo Cobro
              </button>
            </div>

            {showForm && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ REGISTRAR COBRO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Productor</label>
                    <select value={form.empresa_id ?? ""} onChange={e => setForm({ ...form, empresa_id: e.target.value })} className={inputClass}>
                      <option value="">Sin productor</option>
                      {productores.map(p => <option key={p.empresa_id} value={p.empresa_id}>{p.propietario_nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Concepto</label>
                    <input type="text" value={form.concepto ?? ""} onChange={e => setForm({ ...form, concepto: e.target.value })} className={inputClass} placeholder="Ej: Visita enero" />
                  </div>
                  <div><label className={labelClass}>Monto</label>
                    <input type="number" value={form.monto ?? ""} onChange={e => setForm({ ...form, monto: e.target.value })} className={inputClass} placeholder="0" />
                  </div>
                  <div><label className={labelClass}>Fecha</label>
                    <input type="date" value={form.fecha ?? ""} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputClass} />
                  </div>
                  <div><label className={labelClass}>Estado</label>
                    <select value={form.estado ?? "pendiente"} onChange={e => setForm({ ...form, estado: e.target.value })} className={inputClass}>
                      <option value="pendiente">Pendiente</option>
                      <option value="cobrado">Cobrado</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Método pago</label>
                    <select value={form.metodo_pago ?? ""} onChange={e => setForm({ ...form, metodo_pago: e.target.value })} className={inputClass}>
                      <option value="">—</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarCobranza} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm hover:bg-[#C9A227]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            <div className="bg-[#0a1628]/80 border border-[#C9A227]/15 rounded-xl overflow-hidden">
              {cobranzas.length === 0 ? (
                <div className="text-center py-16 text-[#4B5563] font-mono">Sin cobros registrados</div>
              ) : (
                <table className="w-full">
                  <thead><tr className="border-b border-[#C9A227]/10">
                    {["Fecha","Productor","Concepto","Monto","Estado","Método",""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {cobranzas.map(c => {
                      const prod = productores.find(p => p.empresa_id === c.empresa_id);
                      return (
                        <tr key={c.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5 transition-colors">
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.fecha}</td>
                          <td className="px-4 py-3 text-xs text-[#E5E7EB] font-mono">{prod?.propietario_nombre ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{c.concepto}</td>
                          <td className="px-4 py-3 font-bold font-mono text-[#C9A227]">${Number(c.monto).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded font-mono ${c.estado === "cobrado" ? "bg-[#4ADE80]/10 text-[#4ADE80]" : "bg-[#F87171]/10 text-[#F87171]"}`}>{c.estado}</span></td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.metodo_pago || "—"}</td>
                          <td className="px-4 py-3 flex gap-2">
                            {c.estado === "pendiente" && <button onClick={() => marcarCobrado(c.id)} className="text-xs text-[#4ADE80] font-mono">✓ Cobrar</button>}
                            <button onClick={() => eliminar("vet_cobranzas", c.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== VEHÍCULO ===== */}
        {seccion === "vehiculo" && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">🚗 MI VEHÍCULO</h2>
              {!vehiculoSel ? (
                <button onClick={() => { setShowForm(true); setForm({}); }}
                  className="px-4 py-2 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/20 font-mono text-sm transition-all">
                  + Agregar Vehículo
                </button>
              ) : (
                <div className="flex gap-3">
                  <button onClick={() => { setShowForm(true); setForm({}); }}
                    className="px-4 py-2 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/20 font-mono text-sm transition-all">
                    + Service / Reparación
                  </button>
                  <button onClick={() => { setVehiculoSel(null); setServicios([]); setShowForm(false); }}
                    className="px-4 py-2 rounded-xl border border-[#1C2128] text-[#4B5563] hover:text-[#9CA3AF] font-mono text-sm">← Volver</button>
                </div>
              )}
            </div>

            {showForm && !vehiculoSel && (
              <div className="bg-[#0a1628]/80 border border-[#A78BFA]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#A78BFA] font-mono text-sm font-bold mb-4">+ NUEVO VEHÍCULO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre ?? ""} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputClass} placeholder="Ej: Ford Ranger" /></div>
                  <div><label className={labelClass}>Marca</label><input type="text" value={form.marca ?? ""} onChange={e => setForm({ ...form, marca: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Modelo</label><input type="text" value={form.modelo ?? ""} onChange={e => setForm({ ...form, modelo: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Año</label><input type="number" value={form.año ?? ""} onChange={e => setForm({ ...form, año: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Patente</label><input type="text" value={form.patente ?? ""} onChange={e => setForm({ ...form, patente: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Venc. Seguro</label><input type="date" value={form.seguro_vencimiento ?? ""} onChange={e => setForm({ ...form, seguro_vencimiento: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Compañía</label><input type="text" value={form.seguro_compania ?? ""} onChange={e => setForm({ ...form, seguro_compania: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Venc. VTV</label><input type="date" value={form.vtv_vencimiento ?? ""} onChange={e => setForm({ ...form, vtv_vencimiento: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Km actuales</label><input type="number" value={form.km_actuales ?? ""} onChange={e => setForm({ ...form, km_actuales: e.target.value })} className={inputClass} /></div>
                  <div><label className={labelClass}>Próx. service (km)</label><input type="number" value={form.proximo_service_km ?? ""} onChange={e => setForm({ ...form, proximo_service_km: e.target.value })} className={inputClass} /></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarVehiculo} className="bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-[#A78BFA]/20 transition-all font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {!vehiculoSel ? (
              vehiculos.length === 0 ? (
                <div className="text-center py-20 bg-[#0a1628]/60 border border-[#A78BFA]/15 rounded-xl">
                  <div className="text-5xl mb-4 opacity-20">🚗</div>
                  <p className="text-[#4B5563] font-mono">Sin vehículos registrados</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vehiculos.map(v => {
                    const segVenc = v.seguro_vencimiento && new Date(v.seguro_vencimiento) < new Date();
                    const vtvVenc = v.vtv_vencimiento && new Date(v.vtv_vencimiento) < new Date();
                    return (
                      <div key={v.id} className="card-vet bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl p-5 cursor-pointer"
                        onClick={() => { setVehiculoSel(v); fetchServicios(v.id); }}>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">🚗</span>
                            <div>
                              <div className="font-bold text-[#E5E7EB] font-mono">{v.nombre}</div>
                              <div className="text-xs text-[#4B5563] font-mono">{v.marca} {v.modelo} · {v.año} · {v.patente}</div>
                            </div>
                          </div>
                          <button onClick={e => { e.stopPropagation(); eliminar("vet_vehiculos", v.id); }} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-[#020810]/60 rounded-lg p-3">
                            <div className="text-xs text-[#4B5563] font-mono">Km actuales</div>
                            <div className="text-lg font-bold font-mono text-[#A78BFA]">{v.km_actuales.toLocaleString()} km</div>
                          </div>
                          <div className="bg-[#020810]/60 rounded-lg p-3">
                            <div className="text-xs text-[#4B5563] font-mono">Próx. service</div>
                            <div className="text-lg font-bold font-mono text-[#C9A227]">{v.proximo_service_km ? `${v.proximo_service_km.toLocaleString()} km` : "—"}</div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <span className={`text-xs px-2 py-1 rounded font-mono ${segVenc ? "bg-[#F87171]/10 text-[#F87171]" : "bg-[#4ADE80]/10 text-[#4ADE80]"}`}>
                            🛡️ {segVenc ? "Seguro VENCIDO" : `Seguro ${v.seguro_vencimiento || "—"}`}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded font-mono ${vtvVenc ? "bg-[#F87171]/10 text-[#F87171]" : "bg-[#4ADE80]/10 text-[#4ADE80]"}`}>
                            📋 {vtvVenc ? "VTV VENCIDA" : `VTV ${v.vtv_vencimiento || "—"}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div>
                <div className="bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl p-5 mb-4">
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-4xl">🚗</span>
                    <div>
                      <div className="font-bold text-xl text-[#E5E7EB] font-mono">{vehiculoSel.nombre}</div>
                      <div className="text-xs text-[#4B5563] font-mono">{vehiculoSel.marca} {vehiculoSel.modelo} · {vehiculoSel.año} · {vehiculoSel.patente}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Km actuales", value: `${vehiculoSel.km_actuales.toLocaleString()} km`, color: "#A78BFA" },
                      { label: "Próx. service", value: vehiculoSel.proximo_service_km ? `${vehiculoSel.proximo_service_km.toLocaleString()} km` : "—", color: "#C9A227" },
                      { label: "Seguro", value: vehiculoSel.seguro_vencimiento || "—", color: vehiculoSel.seguro_vencimiento && new Date(vehiculoSel.seguro_vencimiento) < new Date() ? "#F87171" : "#4ADE80" },
                      { label: "VTV", value: vehiculoSel.vtv_vencimiento || "—", color: vehiculoSel.vtv_vencimiento && new Date(vehiculoSel.vtv_vencimiento) < new Date() ? "#F87171" : "#4ADE80" },
                    ].map(d => (
                      <div key={d.label} className="bg-[#020810]/60 rounded-lg p-3">
                        <div className="text-xs text-[#4B5563] font-mono">{d.label}</div>
                        <div className="text-sm font-bold font-mono mt-1" style={{ color: d.color }}>{d.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {showForm && (
                  <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-4">
                    <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ SERVICE / REPARACIÓN</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div><label className={labelClass}>Tipo</label>
                        <select value={form.tipo_service ?? "service"} onChange={e => setForm({ ...form, tipo_service: e.target.value })} className={inputClass}>
                          <option value="service">Service</option>
                          <option value="reparacion">Reparación</option>
                          <option value="vtv">VTV</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>
                      <div><label className={labelClass}>Descripción</label><input type="text" value={form.descripcion ?? ""} onChange={e => setForm({ ...form, descripcion: e.target.value })} className={inputClass} /></div>
                      <div><label className={labelClass}>Taller</label><input type="text" value={form.taller ?? ""} onChange={e => setForm({ ...form, taller: e.target.value })} className={inputClass} /></div>
                      <div><label className={labelClass}>Km</label><input type="number" value={form.km ?? ""} onChange={e => setForm({ ...form, km: e.target.value })} className={inputClass} /></div>
                      <div><label className={labelClass}>Costo</label><input type="number" value={form.costo ?? ""} onChange={e => setForm({ ...form, costo: e.target.value })} className={inputClass} /></div>
                      <div><label className={labelClass}>Fecha</label><input type="date" value={form.fecha ?? new Date().toISOString().split("T")[0]} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputClass} /></div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button onClick={guardarService} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono">▶ Guardar</button>
                      <button onClick={() => { setShowForm(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                    </div>
                  </div>
                )}
                <div className="bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#A78BFA]/10">
                    <span className="text-[#A78BFA] text-sm font-mono font-bold">🔧 HISTORIAL</span>
                  </div>
                  {servicios.length === 0 ? (
                    <div className="text-center py-10 text-[#4B5563] font-mono text-sm">Sin historial</div>
                  ) : (
                    <table className="w-full">
                      <thead><tr className="border-b border-[#A78BFA]/10">
                        {["Fecha","Tipo","Descripción","Taller","Km","Costo",""].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] uppercase tracking-widest font-mono">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {servicios.map(s => (
                          <tr key={s.id} className="border-b border-[#A78BFA]/5 hover:bg-[#A78BFA]/5 transition-colors">
                            <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.fecha}</td>
                            <td className="px-4 py-3"><span className="text-xs bg-[#C9A227]/10 text-[#C9A227] px-2 py-0.5 rounded font-mono">{s.tipo}</span></td>
                            <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{s.descripcion}</td>
                            <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.taller}</td>
                            <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.km ? `${s.km.toLocaleString()} km` : "—"}</td>
                            <td className="px-4 py-3 font-bold font-mono text-[#F87171]">${Number(s.costo).toLocaleString("es-AR")}</td>
                            <td className="px-4 py-3"><button onClick={() => eliminar("vet_vehiculo_service", s.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <p className="relative z-10 text-center text-[#0a0a2a] text-xs pb-4 tracking-[0.3em] font-mono">© AGROGESTION PRO · PANEL VETERINARIO</p>
    </div>
  );
}
