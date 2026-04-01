"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import EscanerIA from "@/components/EscanerIA";

type Seccion = "productores" | "cobranza" | "vehiculo" | "ia_campo";

type ProductorIng = {
  id: string; nombre: string; telefono: string; email: string;
  localidad: string; provincia: string; hectareas_total: number;
  observaciones: string; empresa_id: string | null;
  tiene_cuenta: boolean; honorario_tipo: string; honorario_monto: number;
};
type Cobranza = {
  id: string; productor_id: string; concepto: string;
  monto: number; fecha: string; estado: string;
  metodo_pago: string; observaciones: string;
};
type Vehiculo = {
  id: string; nombre: string; marca: string; modelo: string;
  anio: number; patente: string; seguro_vencimiento: string;
  seguro_compania: string; vtv_vencimiento: string;
  km_actuales: number; proximo_service_km: number;
};
type ServiceVehiculo = {
  id: string; tipo: string; descripcion: string;
  costo: number; km: number; fecha: string; taller: string;
};
type MensajeIA = { rol: "user"|"assistant"; texto: string };

type VozEstado = "idle"|"escuchando"|"procesando"|"respondiendo"|"error";

export default function IngenieroPanel() {
  const [seccion, setSeccion] = useState<Seccion>("productores");
  const [ingenieroId, setIngenieroId] = useState<string|null>(null);
  const [ingenieroNombre, setIngenieroNombre] = useState("");
  const [productores, setProductores] = useState<ProductorIng[]>([]);
  const [cobranzas, setCobranzas] = useState<Cobranza[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [servicios, setServicios] = useState<ServiceVehiculo[]>([]);
  const [vehiculoSel, setVehiculoSel] = useState<Vehiculo|null>(null);
  const [todosLotes, setTodosLotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editandoProductor, setEditandoProductor] = useState<string|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [msgExito, setMsgExito] = useState("");
  const [alertas, setAlertas] = useState<{msg:string;urgencia:string}[]>([]);
  const [filterCultivo, setFilterCultivo] = useState("todos");
  const [filterProductor, setFilterProductor] = useState("todos");
  const [filterEstado, setFilterEstado] = useState("todos");
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importMsg, setImportMsg] = useState("");
  const [showImport, setShowImport] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // VOZ
  const [vozEstado, setVozEstado] = useState<VozEstado>("idle");
  const [vozPanel, setVozPanel] = useState(false);
  const [vozTranscripcion, setVozTranscripcion] = useState("");
  const [vozRespuesta, setVozRespuesta] = useState("");
  const [vozInput, setVozInput] = useState("");
  const recRef = useRef<any>(null);

  // IA CAMPO
  const [aiChat, setAiChat] = useState<MensajeIA[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [listening, setListening] = useState(false);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => { init(); }, []);

  const init = async () => {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    const { data: u } = await sb.from("usuarios").select("id,nombre,rol").eq("auth_id", user.id).single();
    if (!u || u.rol !== "ingeniero") { window.location.href = "/login"; return; }
    setIngenieroId(u.id); setIngenieroNombre(u.nombre);
    await fetchAll(u.id);
    setLoading(false);
  };

  const fetchAll = async (iid: string) => {
    const sb = await getSB();
    const { data: prods } = await sb.from("ing_productores").select("*").eq("ingeniero_id", iid).eq("activo", true).order("nombre");
    setProductores(prods ?? []);
    // Lotes de productores vinculados
    const lotesTodos: any[] = [];
    for (const p of (prods ?? []).filter((x: any) => x.empresa_id)) {
      const { data: lotes } = await sb.from("lotes").select("*").eq("empresa_id", p.empresa_id).eq("es_segundo_cultivo", false);
      (lotes ?? []).forEach((l: any) => lotesTodos.push({ ...l, productor_nombre: p.nombre }));
    }
    setTodosLotes(lotesTodos);
    const { data: cobs } = await sb.from("ing_cobranzas").select("*").eq("ingeniero_id", iid).order("fecha", { ascending: false });
    setCobranzas(cobs ?? []);
    const { data: vehs } = await sb.from("ing_vehiculos").select("*").eq("ingeniero_id", iid);
    setVehiculos(vehs ?? []);
    calcularAlertas(vehs ?? [], cobs ?? []);
  };

  const calcularAlertas = (vehs: Vehiculo[], cobs: Cobranza[]) => {
    const alerts: {msg:string;urgencia:string}[] = [];
    const hoy = new Date();
    vehs.forEach(v => {
      if (v.seguro_vencimiento) {
        const d = (new Date(v.seguro_vencimiento).getTime() - hoy.getTime()) / (1000*60*60*24);
        if (d < 0) alerts.push({ msg: v.nombre+": Seguro VENCIDO", urgencia:"alta" });
        else if (d <= 30) alerts.push({ msg: v.nombre+": Seguro vence en "+Math.round(d)+" dias", urgencia: d<=7?"alta":"media" });
      }
      if (v.vtv_vencimiento) {
        const d = (new Date(v.vtv_vencimiento).getTime() - hoy.getTime()) / (1000*60*60*24);
        if (d < 0) alerts.push({ msg: v.nombre+": VTV VENCIDA", urgencia:"alta" });
        else if (d <= 30) alerts.push({ msg: v.nombre+": VTV vence en "+Math.round(d)+" dias", urgencia: d<=7?"alta":"media" });
      }
      if (v.proximo_service_km > 0 && v.km_actuales >= v.proximo_service_km - 500)
        alerts.push({ msg: v.nombre+": Service proximo ("+v.km_actuales+"/"+v.proximo_service_km+" km)", urgencia:"media" });
    });
    cobs.filter(c => c.estado === "pendiente").forEach(c => {
      const d = (hoy.getTime() - new Date(c.fecha).getTime()) / (1000*60*60*24);
      if (d > 30) alerts.push({ msg: "Cobro pendiente hace +30 dias: $"+c.monto.toLocaleString("es-AR"), urgencia:"media" });
    });
    setAlertas(alerts);
  };

  const msg = (t: string) => { setMsgExito(t); setTimeout(() => setMsgExito(""), 4000); };

  // ===== CRUD PRODUCTORES =====
  const guardarProductor = async () => {
    if (!ingenieroId || !form.nombre?.trim()) { msg("❌ INGRESA AL MENOS EL NOMBRE"); return; }
    const sb = await getSB();
    // Si tiene email, buscar si existe cuenta en la app
    let empresa_id = null;
    let tiene_cuenta = false;
    if (form.email?.trim()) {
      const { data: usuario } = await sb.from("usuarios").select("id").eq("email", form.email.trim()).single();
      if (usuario) {
        const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", usuario.id).single();
        if (emp) { empresa_id = emp.id; tiene_cuenta = true; }
      }
    }
    const payload = {
      ingeniero_id: ingenieroId, nombre: form.nombre.trim(),
      telefono: form.telefono ?? "", email: form.email ?? "",
      localidad: form.localidad ?? "", provincia: form.provincia ?? "Santa Fe",
      hectareas_total: Number(form.hectareas_total ?? 0),
      observaciones: form.observaciones ?? "",
      honorario_tipo: form.honorario_tipo ?? "mensual",
      honorario_monto: Number(form.honorario_monto ?? 0),
      empresa_id, tiene_cuenta, activo: true,
    };
    if (editandoProductor) {
      await sb.from("ing_productores").update(payload).eq("id", editandoProductor);
      setEditandoProductor(null);
    } else {
      await sb.from("ing_productores").insert(payload);
    }
    msg(tiene_cuenta ? "✅ PRODUCTOR GUARDADO — VINCULADO A CUENTA APP" : "✅ PRODUCTOR GUARDADO");
    await fetchAll(ingenieroId);
    setShowForm(false); setForm({});
  };

  const eliminarProductor = async (id: string) => {
    if (!confirm("Eliminar productor?")) return;
    const sb = await getSB();
    await sb.from("ing_productores").update({ activo: false }).eq("id", id);
    if (ingenieroId) await fetchAll(ingenieroId);
  };

  const entrarProductor = (prod: ProductorIng) => {
    if (!prod.empresa_id) { msg("❌ ESTE PRODUCTOR NO TIENE CUENTA EN LA APP"); return; }
    localStorage.setItem("ing_empresa_id", prod.empresa_id);
    localStorage.setItem("ing_empresa_nombre", prod.nombre);
    window.location.href = "/ingeniero/lotes";
  };

  // ===== IMPORT EXCEL PRODUCTORES =====
  const leerExcelProductores = async (file: File) => {
    setImportMsg("LEYENDO...");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type:"array" });
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:"" });
      if (rows.length < 2) { setImportMsg("SIN DATOS"); return; }
      const headers = rows[0].map((h: any) => String(h).toLowerCase().trim());
      const cn = headers.findIndex((h: string) => h.includes("nombre") || h.includes("productor"));
      const ct = headers.findIndex((h: string) => h.includes("tel") || h.includes("cel"));
      const ce = headers.findIndex((h: string) => h.includes("email") || h.includes("correo"));
      const cl = headers.findIndex((h: string) => h.includes("local") || h.includes("ciudad") || h.includes("partido"));
      const ch = headers.findIndex((h: string) => h.includes("ha") || h.includes("hect"));
      const preview = rows.slice(1).filter((r: any) => r[cn >= 0 ? cn : 0]).map((r: any) => ({
        nombre: String(r[cn >= 0 ? cn : 0]).trim(),
        telefono: ct >= 0 ? String(r[ct]).trim() : "",
        email: ce >= 0 ? String(r[ce]).trim() : "",
        localidad: cl >= 0 ? String(r[cl]).trim() : "",
        hectareas_total: ch >= 0 ? Number(r[ch]) || 0 : 0,
        existe: productores.some(p => p.nombre.toLowerCase().trim() === String(r[cn >= 0 ? cn : 0]).toLowerCase().trim()),
      }));
      setImportPreview(preview);
      setImportMsg("✅ " + preview.length + " PRODUCTORES DETECTADOS");
    } catch(e: any) { setImportMsg("❌ " + e.message); }
  };

  const confirmarImportProductores = async () => {
    if (!ingenieroId || !importPreview.length) return;
    const sb = await getSB();
    let creados = 0;
    for (const p of importPreview.filter(x => !x.existe)) {
      await sb.from("ing_productores").insert({
        ingeniero_id: ingenieroId, nombre: p.nombre,
        telefono: p.telefono, email: p.email, localidad: p.localidad,
        hectareas_total: p.hectareas_total, honorario_tipo: "mensual",
        honorario_monto: 0, activo: true,
      });
      creados++;
    }
    msg("✅ " + creados + " PRODUCTORES IMPORTADOS");
    await fetchAll(ingenieroId);
    setImportPreview([]); setImportMsg(""); setShowImport(false);
  };

  // ===== EXPORT EXCEL =====
  const exportarExcel = async (tipo: "productores"|"lotes") => {
    const XLSX = await import("xlsx");
    if (tipo === "productores") {
      const data = productores.map(p => ({
        NOMBRE: p.nombre, TELEFONO: p.telefono, EMAIL: p.email,
        LOCALIDAD: p.localidad, PROVINCIA: p.provincia,
        HECTAREAS: p.hectareas_total,
        HONORARIO_TIPO: p.honorario_tipo, HONORARIO_MONTO: p.honorario_monto,
        TIENE_CUENTA_APP: p.tiene_cuenta ? "SI" : "NO",
        OBSERVACIONES: p.observaciones,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = Array(10).fill({ wch: 18 });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Productores");
      XLSX.writeFile(wb, "mis_productores_" + new Date().toISOString().slice(0,10) + ".xlsx");
    } else {
      let lotesFiltrados = todosLotes;
      if (filterCultivo !== "todos") lotesFiltrados = lotesFiltrados.filter(l => (l.cultivo_completo||l.cultivo) === filterCultivo);
      if (filterProductor !== "todos") lotesFiltrados = lotesFiltrados.filter(l => l.productor_nombre === filterProductor);
      if (filterEstado !== "todos") lotesFiltrados = lotesFiltrados.filter(l => l.estado === filterEstado);
      const data = lotesFiltrados.map(l => ({
        PRODUCTOR: l.productor_nombre, LOTE: l.nombre,
        HECTAREAS: l.hectareas, CULTIVO: l.cultivo_completo || l.cultivo,
        ESTADO: l.estado, FECHA_SIEMBRA: l.fecha_siembra || "",
        VARIEDAD: l.variedad || l.hibrido || "",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = Array(7).fill({ wch: 18 });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Lotes");
      XLSX.writeFile(wb, "lotes_" + new Date().toISOString().slice(0,10) + ".xlsx");
    }
  };

  // ===== VOZ =====
  const hablar = useCallback((texto: string) => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(texto);
    utt.lang = "es-AR"; utt.rate = 1.05;
    const v = window.speechSynthesis.getVoices().find(x => x.lang.startsWith("es"));
    if (v) utt.voice = v;
    utt.onstart = () => setVozEstado("respondiendo");
    utt.onend = () => setVozEstado("idle");
    window.speechSynthesis.speak(utt);
  }, []);

  const interpretarVoz = useCallback(async (texto: string) => {
    setVozEstado("procesando");
    const resumen = productores.slice(0,5).map(p => p.nombre + " (" + p.hectareas_total + "ha, " + p.localidad + ")").join("; ");
    try {
      const res = await fetch("/api/scanner", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 500,
          messages: [{ role: "user", content: "Asistente de panel ingeniero agronomo. Productores: " + resumen + ". Usuario dijo: \"" + texto + "\". Responde SOLO en JSON sin markdown: {\"texto\":\"respuesta breve español argentino\",\"accion\":\"consulta|crear_productor|otro\",\"datos\":{campos o null}}" }]
        })
      });
      const data = await res.json();
      const parsed = JSON.parse((data.content?.[0]?.text ?? "{}").replace(/```json|```/g,"").trim());
      setVozRespuesta(parsed.texto ?? ""); hablar(parsed.texto ?? "");
      if (parsed.accion === "crear_productor" && parsed.datos) {
        setForm({
          nombre: parsed.datos.nombre ?? "", telefono: parsed.datos.telefono ?? "",
          localidad: parsed.datos.localidad ?? "", hectareas_total: String(parsed.datos.hectareas ?? ""),
        });
        setShowForm(true);
      }
      setVozEstado("respondiendo");
    } catch {
      const e = "No pude interpretar."; setVozRespuesta(e); hablar(e);
      setVozEstado("error"); setTimeout(() => setVozEstado("idle"), 2000);
    }
  }, [productores, hablar]);

  const escucharVoz = () => {
    const hasSR = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
    if (!hasSR) { alert("Usa Chrome"); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR(); rec.lang = "es-AR"; rec.continuous = false;
    recRef.current = rec; setVozEstado("escuchando"); setVozRespuesta(""); setVozPanel(true);
    rec.onresult = (e: any) => { const t = e.results[0][0].transcript; setVozTranscripcion(t); interpretarVoz(t); };
    rec.onerror = () => { setVozEstado("error"); setTimeout(() => setVozEstado("idle"), 2000); };
    rec.start();
  };

  // ===== IA CAMPO =====
  const askAI = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim(); setAiInput(""); setAiLoading(true);
    setAiChat(prev => [...prev, { rol:"user", texto:userMsg }]);
    try {
      const hist = aiChat.map(m => ({ role: m.rol === "user" ? "user" : "assistant", content: m.texto }));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1500,
          system: "Sos un asistente agronomico experto para ingenieros agronomos en Argentina. Respondé en español, tecnico y practico. Ayuda con dosis, diagnostico de enfermedades y plagas, recomendaciones de cultivo, mercados y normativas SENASA. Ingeniero: " + ingenieroNombre + ". Productores: " + productores.length + ".",
          messages: [...hist, { role:"user", content:userMsg }]
        })
      });
      const data = await res.json();
      setAiChat(prev => [...prev, { rol:"assistant", texto: data.content?.[0]?.text ?? "Sin respuesta" }]);
    } catch { setAiChat(prev => [...prev, { rol:"assistant", texto:"Error IA" }]); }
    setAiLoading(false);
  };

  const startVoiceIA = () => {
    const hasSR = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
    if (!hasSR) { alert("Usa Chrome"); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR(); rec.lang = "es-AR"; setListening(true);
    rec.onresult = (e: any) => { setAiInput(e.results[0][0].transcript); setListening(false); };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  // Cobranza
  const guardarCobranza = async () => {
    if (!ingenieroId) return;
    const sb = await getSB();
    await sb.from("ing_cobranzas").insert({
      ingeniero_id: ingenieroId, productor_id: form.productor_id ?? null,
      concepto: form.concepto ?? "", monto: Number(form.monto ?? 0),
      fecha: form.fecha ?? new Date().toISOString().split("T")[0],
      estado: form.estado ?? "pendiente", metodo_pago: form.metodo_pago ?? "",
      observaciones: form.observaciones ?? "",
    });
    await fetchAll(ingenieroId); setShowForm(false); setForm({});
    msg("✅ COBRO REGISTRADO");
  };

  const marcarCobrado = async (id: string) => {
    const sb = await getSB();
    await sb.from("ing_cobranzas").update({ estado:"cobrado" }).eq("id", id);
    if (ingenieroId) await fetchAll(ingenieroId);
  };

  // Vehiculo
  const guardarVehiculo = async () => {
    if (!ingenieroId || !form.nombre?.trim()) return;
    const sb = await getSB();
    await sb.from("ing_vehiculos").insert({
      ingeniero_id: ingenieroId, nombre: form.nombre, marca: form.marca ?? "",
      modelo: form.modelo ?? "", año: Number(form.anio ?? 0), patente: form.patente ?? "",
      seguro_vencimiento: form.seguro_vencimiento || null, seguro_compania: form.seguro_compania ?? "",
      vtv_vencimiento: form.vtv_vencimiento || null,
      km_actuales: Number(form.km_actuales ?? 0), proximo_service_km: Number(form.proximo_service_km ?? 0),
    });
    await fetchAll(ingenieroId); setShowForm(false); setForm({});
    msg("✅ VEHICULO GUARDADO");
  };

  const guardarService = async () => {
    if (!vehiculoSel || !ingenieroId) return;
    const sb = await getSB();
    await sb.from("ing_vehiculo_service").insert({
      vehiculo_id: vehiculoSel.id, ingeniero_id: ingenieroId,
      tipo: form.tipo_service ?? "service", descripcion: form.descripcion ?? "",
      costo: Number(form.costo ?? 0), km: Number(form.km ?? 0),
      fecha: form.fecha ?? new Date().toISOString().split("T")[0], taller: form.taller ?? "",
    });
    const sb2 = await getSB();
    const { data } = await sb2.from("ing_vehiculo_service").select("*").eq("vehiculo_id", vehiculoSel.id).order("fecha", { ascending: false });
    setServicios(data ?? []); setShowForm(false); setForm({});
    msg("✅ SERVICE GUARDADO");
  };

  const eliminar = async (tabla: string, id: string) => {
    if (!confirm("Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (ingenieroId) await fetchAll(ingenieroId);
  };

  const VOZ_COLOR: Record<string,string> = { idle:"#00FF80", escuchando:"#F87171", procesando:"#C9A227", respondiendo:"#60A5FA", error:"#F87171" };
  const VOZ_ICON: Record<string,string> = { idle:"🎤", escuchando:"🔴", procesando:"⚙️", respondiendo:"🔊", error:"❌" };
  const iCls = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const lCls = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  const totalHa = productores.reduce((a,p) => a+p.hectareas_total, 0);
  const totalPendiente = cobranzas.filter(c=>c.estado==="pendiente").reduce((a,c)=>a+c.monto,0);
  const totalCobrado = cobranzas.filter(c=>c.estado==="cobrado").reduce((a,c)=>a+c.monto,0);
  const cultivosUnicos = [...new Set(todosLotes.map(l=>l.cultivo_completo||l.cultivo).filter(Boolean))];

  const SECCIONES = [
    { key:"productores" as Seccion, label:"MIS PRODUCTORES", icon:"👨‍🌾" },
    { key:"cobranza" as Seccion, label:"COBRANZA", icon:"💰" },
    { key:"vehiculo" as Seccion, label:"MI VEHICULO", icon:"🚗" },
    { key:"ia_campo" as Seccion, label:"IA CAMPO", icon:"🤖" },
  ];

  if (loading) return <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">CARGANDO PANEL INGENIERO...</div>;

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes gf{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        .card-ing{background:rgba(10,22,40,0.85);border:1px solid rgba(0,255,128,0.15);border-radius:12px;transition:all 0.2s}
        .card-ing:hover{border-color:rgba(0,255,128,0.4);transform:translateY(-2px)}
        .sec-active{border-color:#00FF80!important;color:#00FF80!important;background:rgba(0,255,128,0.08)!important}
        .logo-b{cursor:pointer;transition:all 0.2s}
        .logo-b:hover{filter:drop-shadow(0 0 10px rgba(0,255,128,0.7))}
      `}</style>

      <div className="absolute inset-0 z-0"><Image src="/dashboard-bg.png" alt="" fill style={{objectFit:"cover"}}/><div className="absolute inset-0 bg-[#020810]/88"/></div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.025]" style={{backgroundImage:"linear-gradient(rgba(0,255,128,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,128,0.5) 1px,transparent 1px)",backgroundSize:"50px 50px"}}/>

      {/* HEADER */}
      <div className="relative z-10 bg-[#020810]/95 border-b border-[#00FF80]/20 px-6 py-3 flex items-center gap-4">
        <div className="logo-b" onClick={()=>window.location.href="/ingeniero"}><Image src="/logo.png" alt="" width={100} height={36} className="object-contain"/></div>
        <div className="flex-1"/>
        <div className="text-right">
          <div className="text-xs text-[#E5E7EB] font-mono font-bold">{ingenieroNombre}</div>
          <div className="text-xs text-[#00FF80] font-mono">INGENIERO AGRONOMO</div>
        </div>
        {alertas.length > 0 && <div className="w-7 h-7 rounded-full bg-[#F87171]/10 border border-[#F87171]/30 flex items-center justify-center"><span className="text-[#F87171] text-xs font-bold">{alertas.length}</span></div>}
        {/* Botón voz header */}
        <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all font-bold"
          style={{borderColor:VOZ_COLOR[vozEstado]+"60",color:VOZ_COLOR[vozEstado],background:VOZ_COLOR[vozEstado]+"12"}}>
          {VOZ_ICON[vozEstado]} VOZ
        </button>
        <button onClick={async()=>{const sb=await getSB();await sb.auth.signOut();window.location.href="/login";}} className="text-xs text-[#4B5563] hover:text-red-400 font-mono">Salir</button>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">◆ PANEL INGENIERO AGRONOMO</h1>
          <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">{productores.length} PRODUCTORES · {totalHa.toLocaleString("es-AR")} HA TOTALES · IA AGRONOMICA ACTIVA</p>
        </div>

        {/* Alertas */}
        {alertas.length > 0 && (
          <div className="bg-[#0a1628]/80 border border-[#F87171]/30 rounded-xl p-4 mb-5">
            <div className="flex items-center gap-2 mb-3"><div className="w-2 h-2 rounded-full bg-[#F87171] animate-pulse"/><span className="text-[#F87171] text-xs font-mono font-bold">ALERTAS ({alertas.length})</span></div>
            <div className="flex flex-wrap gap-2">
              {alertas.map((a,i)=>(
                <div key={i} className={"px-3 py-1.5 rounded-lg text-xs font-mono border "+(a.urgencia==="alta"?"border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5":"border-[#C9A227]/30 text-[#C9A227] bg-[#C9A227]/5")}>
                  {a.urgencia==="alta"?"🔴":"🟡"} {a.msg}
                </div>
              ))}
            </div>
          </div>
        )}

        {msgExito && <div className={"mb-4 px-4 py-2 rounded-lg text-sm font-mono border flex items-center justify-between "+(msgExito.startsWith("✅")?"border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5":"border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5")}>{msgExito}<button onClick={()=>setMsgExito("")}>✕</button></div>}

        {/* TABS */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {SECCIONES.map(s=>(
            <button key={s.key} onClick={()=>{setSeccion(s.key);setShowForm(false);setForm({});setVehiculoSel(null);}}
              className={"px-5 py-2.5 rounded-xl border text-sm font-mono transition-all font-bold "+(seccion===s.key?"sec-active":"border-[#00FF80]/15 text-[#4B5563] hover:text-[#9CA3AF]")}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        {/* ===== MIS PRODUCTORES ===== */}
        {seccion==="productores" && (
          <div>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[{l:"PRODUCTORES",v:String(productores.length),c:"#E5E7EB"},{l:"HA TOTALES",v:totalHa.toLocaleString("es-AR"),c:"#C9A227"},{l:"LOTES APP",v:String(todosLotes.length),c:"#4ADE80"},{l:"CON CUENTA APP",v:String(productores.filter(p=>p.tiene_cuenta).length),c:"#60A5FA"}].map(s=>(
                <div key={s.l} className="card-ing p-4 text-center">
                  <div className="text-xs text-[#4B5563] font-mono uppercase">{s.l}</div>
                  <div className="text-xl font-bold font-mono mt-1" style={{color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Acciones */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <button onClick={()=>{setShowForm(!showForm);setEditandoProductor(null);setForm({provincia:"Santa Fe",honorario_tipo:"mensual"});}}
                className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-mono text-sm font-bold hover:bg-[#00FF80]/20 transition-all">
                + NUEVO PRODUCTOR
              </button>
              <button onClick={()=>setShowImport(!showImport)}
                className="px-4 py-2 rounded-xl border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm font-bold hover:bg-[#C9A227]/10 transition-all">
                📥 IMPORTAR EXCEL
              </button>
              <button onClick={()=>exportarExcel("productores")}
                className="px-4 py-2 rounded-xl border border-[#4ADE80]/30 text-[#4ADE80] font-mono text-sm font-bold hover:bg-[#4ADE80]/10 transition-all">
                📤 EXPORTAR PRODUCTORES
              </button>
              {todosLotes.length > 0 && (
                <button onClick={()=>exportarExcel("lotes")}
                  className="px-4 py-2 rounded-xl border border-[#60A5FA]/30 text-[#60A5FA] font-mono text-sm font-bold hover:bg-[#60A5FA]/10 transition-all">
                  📤 EXPORTAR LOTES
                </button>
              )}
            </div>

            {/* Import panel */}
            {showImport && (
              <div className="card-ing p-5 mb-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[#C9A227] font-mono text-sm font-bold">📥 IMPORTAR PRODUCTORES DESDE EXCEL</h3>
                  <button onClick={()=>{setShowImport(false);setImportPreview([]);setImportMsg("");}} className="text-[#4B5563] text-sm">✕</button>
                </div>
                <p className="text-xs text-[#4B5563] font-mono mb-3">COLUMNAS: <span className="text-[#C9A227]">NOMBRE · TELEFONO · EMAIL · LOCALIDAD · HECTAREAS</span></p>
                <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)leerExcelProductores(f);}}/>
                {importPreview.length===0?(
                  <button onClick={()=>importRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border border-dashed border-[#C9A227]/40 rounded-xl text-[#C9A227] font-mono text-sm w-full justify-center hover:border-[#C9A227]/70 transition-all">📁 SELECCIONAR ARCHIVO</button>
                ):(
                  <div>
                    <div className="max-h-40 overflow-y-auto mb-3 rounded-lg border border-[#C9A227]/15">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-[#C9A227]/10">{["NOMBRE","TEL","EMAIL","LOCALIDAD","HA","ESTADO"].map(h=><th key={h} className="text-left px-3 py-2 text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                        <tbody>{importPreview.map((r,i)=>(
                          <tr key={i} className="border-b border-[#C9A227]/5">
                            <td className="px-3 py-2 text-[#E5E7EB] font-mono font-bold">{r.nombre}</td>
                            <td className="px-3 py-2 text-[#9CA3AF] font-mono">{r.telefono||"—"}</td>
                            <td className="px-3 py-2 text-[#9CA3AF] font-mono">{r.email||"—"}</td>
                            <td className="px-3 py-2 text-[#9CA3AF] font-mono">{r.localidad||"—"}</td>
                            <td className="px-3 py-2 text-[#C9A227] font-mono">{r.hectareas_total||"—"}</td>
                            <td className="px-3 py-2"><span className={r.existe?"text-[#60A5FA] font-mono text-xs":"text-[#4ADE80] font-mono text-xs"}>{r.existe?"Ya existe":"Nuevo"}</span></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={confirmarImportProductores} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-4 py-2 rounded-lg text-xs font-mono hover:bg-[#C9A227]/20">▶ IMPORTAR {importPreview.filter(p=>!p.existe).length} NUEVOS</button>
                      <button onClick={()=>{setImportPreview([]);importRef.current?.click();}} className="border border-[#1C2128] text-[#4B5563] px-4 py-2 rounded-lg text-xs font-mono">CAMBIAR ARCHIVO</button>
                    </div>
                  </div>
                )}
                {importMsg && <p className={"mt-2 text-xs font-mono "+(importMsg.startsWith("✅")?"text-[#4ADE80]":"text-[#F87171]")}>{importMsg}</p>}
              </div>
            )}

            {/* Form nuevo/editar productor */}
            {showForm && (
              <div className="card-ing p-5 mb-5">
                <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-4">{editandoProductor?"✏️ EDITAR":"+"} PRODUCTOR</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>NOMBRE *</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} placeholder="Nombre y apellido"/></div>
                  <div><label className={lCls}>TELEFONO / WA</label><input type="text" value={form.telefono??""} onChange={e=>setForm({...form,telefono:e.target.value})} className={iCls} placeholder="3400..."/></div>
                  <div><label className={lCls}>EMAIL <span className="normal-case text-[#4B5563]">(si tiene cuenta app)</span></label><input type="email" value={form.email??""} onChange={e=>setForm({...form,email:e.target.value})} className={iCls} placeholder="email@..."/></div>
                  <div><label className={lCls}>LOCALIDAD</label><input type="text" value={form.localidad??""} onChange={e=>setForm({...form,localidad:e.target.value})} className={iCls} placeholder="Rafaela"/></div>
                  <div><label className={lCls}>PROVINCIA</label><input type="text" value={form.provincia??"Santa Fe"} onChange={e=>setForm({...form,provincia:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>HECTAREAS TOTALES</label><input type="number" value={form.hectareas_total??""} onChange={e=>setForm({...form,hectareas_total:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div><label className={lCls}>HONORARIO TIPO</label>
                    <select value={form.honorario_tipo??"mensual"} onChange={e=>setForm({...form,honorario_tipo:e.target.value})} className={iCls}>
                      <option value="mensual">Mensual</option><option value="por_ha">Por hectarea</option>
                      <option value="por_campana">Por campaña</option><option value="otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={lCls}>HONORARIO MONTO</label><input type="number" value={form.honorario_monto??""} onChange={e=>setForm({...form,honorario_monto:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div className="md:col-span-2"><label className={lCls}>OBSERVACIONES</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls} placeholder="Notas internas"/></div>
                </div>
                {form.email && (
                  <div className="mt-3 p-3 bg-[#60A5FA]/5 border border-[#60A5FA]/20 rounded-xl text-xs font-mono text-[#60A5FA]">
                    ℹ️ Si el email ingresado tiene cuenta en AgroGestion PRO, los lotes se vincularan automaticamente al guardar.
                  </div>
                )}
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarProductor} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#00FF80]/20">▶ GUARDAR</button>
                  <button onClick={()=>{setShowForm(false);setEditandoProductor(null);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}

            {/* Exportar lotes con filtros */}
            {todosLotes.length > 0 && (
              <div className="card-ing p-4 mb-5">
                <span className="text-[#C9A227] font-mono text-sm font-bold">📊 EXPORTAR LOTES CON FILTROS</span>
                <div className="flex flex-wrap gap-3 items-end mt-3">
                  <div>
                    <label className={lCls}>CULTIVO</label>
                    <select value={filterCultivo} onChange={e=>setFilterCultivo(e.target.value)} className={iCls+" w-40"}>
                      <option value="todos">Todos</option>
                      {cultivosUnicos.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lCls}>PRODUCTOR</label>
                    <select value={filterProductor} onChange={e=>setFilterProductor(e.target.value)} className={iCls+" w-44"}>
                      <option value="todos">Todos</option>
                      {productores.filter(p=>p.tiene_cuenta).map(p=><option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lCls}>ESTADO</label>
                    <select value={filterEstado} onChange={e=>setFilterEstado(e.target.value)} className={iCls+" w-36"}>
                      <option value="todos">Todos</option>
                      {["planificado","sembrado","en_desarrollo","cosechado","barbecho"].map(e=><option key={e} value={e}>{e.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <button onClick={()=>exportarExcel("lotes")} className="px-5 py-2.5 rounded-xl bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-mono text-sm font-bold hover:bg-[#4ADE80]/20">
                    📤 EXPORTAR ({todosLotes.filter(l=>filterCultivo==="todos"||(l.cultivo_completo||l.cultivo)===filterCultivo).filter(l=>filterProductor==="todos"||l.productor_nombre===filterProductor).filter(l=>filterEstado==="todos"||l.estado===filterEstado).length} lotes)
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[#C9A227]/10">
                  <span className="text-xs text-[#4B5563] font-mono self-center">RAPIDO:</span>
                  <button onClick={()=>{setFilterCultivo("todos");setFilterProductor("todos");setFilterEstado("todos");setTimeout(()=>exportarExcel("lotes"),100);}} className="px-3 py-1.5 rounded-lg bg-[#E5E7EB]/5 border border-[#E5E7EB]/15 text-[#E5E7EB] text-xs font-mono font-bold">📊 TOTAL GENERAL</button>
                  {cultivosUnicos.map(c=>(
                    <button key={c} onClick={()=>{setFilterCultivo(c);setFilterProductor("todos");setFilterEstado("todos");setTimeout(()=>exportarExcel("lotes"),100);}}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono border font-bold"
                      style={{borderColor:"rgba(201,162,39,0.4)",background:"rgba(201,162,39,0.1)",color:"#C9A227"}}>
                      📊 {c} ({todosLotes.filter(l=>(l.cultivo_completo||l.cultivo)===c).reduce((a: number,l: any)=>a+l.hectareas,0).toLocaleString()}HA)
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Lista productores */}
            {productores.length===0?(
              <div className="text-center py-20 card-ing">
                <div className="text-5xl mb-4 opacity-20">👨‍🌾</div>
                <p className="text-[#4B5563] font-mono">SIN PRODUCTORES REGISTRADOS</p>
                <p className="text-[#4B5563] font-mono text-xs mt-1">Agrega productores manualmente, por voz o importando un Excel</p>
              </div>
            ):(
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {productores.map(p=>(
                  <div key={p.id} className="card-ing overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#00FF80]/10 border border-[#00FF80]/30 flex items-center justify-center text-lg">👨‍🌾</div>
                          <div>
                            <div className="font-bold text-[#E5E7EB] font-mono uppercase">{p.nombre}</div>
                            <div className="text-xs text-[#4B5563] font-mono">{p.localidad}{p.provincia?", "+p.provincia:""}</div>
                            {p.tiene_cuenta && <div className="text-xs text-[#4ADE80] font-mono">✓ USA LA APP</div>}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={()=>{setEditandoProductor(p.id);setForm({nombre:p.nombre,telefono:p.telefono,email:p.email,localidad:p.localidad,provincia:p.provincia,hectareas_total:String(p.hectareas_total),honorario_tipo:p.honorario_tipo,honorario_monto:String(p.honorario_monto),observaciones:p.observaciones});setShowForm(true);}} className="text-[#C9A227] text-xs px-2 py-1 rounded hover:bg-[#C9A227]/10">✏️</button>
                          <button onClick={()=>eliminarProductor(p.id)} className="text-[#4B5563] hover:text-red-400 text-xs px-2 py-1 rounded">✕</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
                        <div className="bg-[#020810]/40 rounded-lg p-2 text-center">
                          <div className="text-[#4B5563]">HA</div>
                          <div className="font-bold text-[#C9A227] mt-0.5">{p.hectareas_total.toLocaleString("es-AR")}</div>
                        </div>
                        <div className="bg-[#020810]/40 rounded-lg p-2 text-center">
                          <div className="text-[#4B5563]">HONORARIO</div>
                          <div className="font-bold text-[#00FF80] mt-0.5">${p.honorario_monto.toLocaleString("es-AR")}</div>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {p.telefono && <a href={"https://wa.me/54"+p.telefono.replace(/\D/g,"")} target="_blank" rel="noreferrer" className="flex-1 text-center py-2 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] text-xs font-mono font-bold hover:bg-[#25D366]/20">💬 WHATSAPP</a>}
                        {p.tiene_cuenta && <button onClick={()=>entrarProductor(p)} className="flex-1 text-center py-2 rounded-lg bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] text-xs font-mono font-bold hover:bg-[#00FF80]/20">🌾 VER LOTES</button>}
                      </div>
                    </div>
                    {p.observaciones && <div className="border-t border-[#00FF80]/10 px-5 py-2 text-xs text-[#4B5563] font-mono">{p.observaciones}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== COBRANZA ===== */}
        {seccion==="cobranza" && (
          <div>
            <div className="flex items-center justify-between mb-5 flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">💰 COBRANZA</h2>
                <div className="flex gap-4 mt-1">
                  <span className="text-xs font-mono text-[#F87171]">Pendiente: <strong>${totalPendiente.toLocaleString("es-AR")}</strong></span>
                  <span className="text-xs font-mono text-[#4ADE80]">Cobrado: <strong>${totalCobrado.toLocaleString("es-AR")}</strong></span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={async()=>{
                  const XLSX=await import("xlsx");
                  const data=cobranzas.map(c=>{const p=productores.find(x=>x.id===c.productor_id);return{PRODUCTOR:p?.nombre??"—",CONCEPTO:c.concepto,MONTO:c.monto,FECHA:c.fecha,ESTADO:c.estado,METODO:c.metodo_pago,OBS:c.observaciones};});
                  const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb,ws,"Cobranzas");XLSX.writeFile(wb,"cobranzas_"+new Date().toISOString().slice(0,10)+".xlsx");
                }} className="px-4 py-2 rounded-xl border border-[#4ADE80]/30 text-[#4ADE80] font-mono text-sm font-bold hover:bg-[#4ADE80]/10">📤 EXPORTAR</button>
                <button onClick={()=>{setShowForm(!showForm);setForm({estado:"pendiente",fecha:new Date().toISOString().split("T")[0]});}}
                  className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm font-bold hover:bg-[#C9A227]/20">
                  + NUEVO COBRO
                </button>
              </div>
            </div>
            {showForm && (
              <div className="card-ing p-5 mb-5">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ REGISTRAR COBRO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>PRODUCTOR</label>
                    <select value={form.productor_id??""} onChange={e=>setForm({...form,productor_id:e.target.value})} className={iCls}>
                      <option value="">Sin productor</option>
                      {productores.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>CONCEPTO</label><input type="text" value={form.concepto??""} onChange={e=>setForm({...form,concepto:e.target.value})} className={iCls} placeholder="Honorario enero"/></div>
                  <div><label className={lCls}>MONTO</label><input type="number" value={form.monto??""} onChange={e=>setForm({...form,monto:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>FECHA</label><input type="date" value={form.fecha??""} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>ESTADO</label>
                    <select value={form.estado??"pendiente"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}>
                      <option value="pendiente">Pendiente</option><option value="cobrado">Cobrado</option>
                    </select>
                  </div>
                  <div><label className={lCls}>METODO</label>
                    <select value={form.metodo_pago??""} onChange={e=>setForm({...form,metodo_pago:e.target.value})} className={iCls}>
                      <option value="">—</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option>
                    </select>
                  </div>
                  <div className="md:col-span-2"><label className={lCls}>OBSERVACIONES</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarCobranza} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono hover:bg-[#C9A227]/20">▶ GUARDAR</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}
            <div className="card-ing overflow-hidden">
              {cobranzas.length===0?<div className="text-center py-16 text-[#4B5563] font-mono">SIN COBROS REGISTRADOS</div>:(
                <table className="w-full">
                  <thead><tr className="border-b border-[#00FF80]/10">{["FECHA","PRODUCTOR","CONCEPTO","MONTO","ESTADO","METODO",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono uppercase">{h}</th>)}</tr></thead>
                  <tbody>{cobranzas.map(c=>{
                    const p=productores.find(x=>x.id===c.productor_id);
                    return(
                      <tr key={c.id} className="border-b border-[#00FF80]/5 hover:bg-[#00FF80]/5">
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.fecha}</td>
                        <td className="px-4 py-3 text-xs text-[#E5E7EB] font-mono">{p?.nombre??"—"}</td>
                        <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{c.concepto}</td>
                        <td className="px-4 py-3 font-bold text-[#C9A227] font-mono">${Number(c.monto).toLocaleString("es-AR")}</td>
                        <td className="px-4 py-3"><span className={"text-xs px-2 py-0.5 rounded font-mono "+(c.estado==="cobrado"?"bg-[#4ADE80]/10 text-[#4ADE80]":"bg-[#F87171]/10 text-[#F87171]")}>{c.estado}</span></td>
                        <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{c.metodo_pago||"—"}</td>
                        <td className="px-4 py-3 flex gap-2">
                          {c.estado==="pendiente"&&<button onClick={()=>marcarCobrado(c.id)} className="text-xs text-[#4ADE80] font-mono hover:underline">✓</button>}
                          <button onClick={()=>eliminar("ing_cobranzas",c.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== VEHICULO ===== */}
        {seccion==="vehiculo" && (
          <div>
            <div className="flex items-center justify-between mb-5 flex-wrap gap-4">
              <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">🚗 MI VEHICULO</h2>
              {!vehiculoSel?(
                <button onClick={()=>{setShowForm(true);setForm({});}} className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-mono text-sm font-bold hover:bg-[#00FF80]/20">+ AGREGAR</button>
              ):(
                <div className="flex gap-3">
                  <button onClick={()=>{setShowForm(true);setForm({});}} className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm font-bold">+ SERVICE</button>
                  <button onClick={()=>{setVehiculoSel(null);setServicios([]);setShowForm(false);}} className="px-4 py-2 rounded-xl border border-[#1C2128] text-[#4B5563] font-mono text-sm">← VOLVER</button>
                </div>
              )}
            </div>
            {showForm && !vehiculoSel && (
              <div className="card-ing p-5 mb-5">
                <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-4">+ NUEVO VEHICULO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>NOMBRE</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} placeholder="Toyota Hilux"/></div>
                  <div><label className={lCls}>MARCA</label><input type="text" value={form.marca??""} onChange={e=>setForm({...form,marca:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>MODELO</label><input type="text" value={form.modelo??""} onChange={e=>setForm({...form,modelo:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>AÑO</label><input type="number" value={form.anio??""} onChange={e=>setForm({...form,anio:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>PATENTE</label><input type="text" value={form.patente??""} onChange={e=>setForm({...form,patente:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>VENC. SEGURO</label><input type="date" value={form.seguro_vencimiento??""} onChange={e=>setForm({...form,seguro_vencimiento:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>COMPANIA SEGURO</label><input type="text" value={form.seguro_compania??""} onChange={e=>setForm({...form,seguro_compania:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>VENC. VTV</label><input type="date" value={form.vtv_vencimiento??""} onChange={e=>setForm({...form,vtv_vencimiento:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>KM ACTUALES</label><input type="number" value={form.km_actuales??""} onChange={e=>setForm({...form,km_actuales:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>PROX. SERVICE KM</label><input type="number" value={form.proximo_service_km??""} onChange={e=>setForm({...form,proximo_service_km:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarVehiculo} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#00FF80]/20">▶ GUARDAR</button>
                  <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}
            {!vehiculoSel?(
              vehiculos.length===0?<div className="text-center py-20 card-ing"><div className="text-5xl mb-4 opacity-20">🚗</div><p className="text-[#4B5563] font-mono">SIN VEHICULOS REGISTRADOS</p></div>:(
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vehiculos.map(v=>{
                    const segVenc=v.seguro_vencimiento&&new Date(v.seguro_vencimiento)<new Date();
                    const vtvVenc=v.vtv_vencimiento&&new Date(v.vtv_vencimiento)<new Date();
                    return(
                      <div key={v.id} className="card-ing p-5 cursor-pointer" onClick={async()=>{setVehiculoSel(v);const sb=await getSB();const{data}=await sb.from("ing_vehiculo_service").select("*").eq("vehiculo_id",v.id).order("fecha",{ascending:false});setServicios(data??[]);}}>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3"><span className="text-3xl">🚗</span>
                            <div><div className="font-bold text-[#E5E7EB] font-mono">{v.nombre}</div><div className="text-xs text-[#4B5563] font-mono">{v.marca} {v.modelo} · {v.anio} · {v.patente}</div></div>
                          </div>
                          <button onClick={e=>{e.stopPropagation();eliminar("ing_vehiculos",v.id);}} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-[#020810]/60 rounded-lg p-3"><div className="text-xs text-[#4B5563] font-mono">KM</div><div className="text-lg font-bold font-mono text-[#00FF80]">{(v.km_actuales||0).toLocaleString()} km</div></div>
                          <div className="bg-[#020810]/60 rounded-lg p-3"><div className="text-xs text-[#4B5563] font-mono">PROX. SERVICE</div><div className="text-lg font-bold font-mono text-[#C9A227]">{v.proximo_service_km?(v.proximo_service_km.toLocaleString()+" km"):"—"}</div></div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <span className={"text-xs px-2 py-1 rounded font-mono "+(segVenc?"bg-[#F87171]/10 text-[#F87171]":"bg-[#4ADE80]/10 text-[#4ADE80]")}>🛡️ {segVenc?"VENCIDO":v.seguro_vencimiento||"—"}</span>
                          <span className={"text-xs px-2 py-1 rounded font-mono "+(vtvVenc?"bg-[#F87171]/10 text-[#F87171]":"bg-[#4ADE80]/10 text-[#4ADE80]")}>📋 VTV {vtvVenc?"VENCIDA":v.vtv_vencimiento||"—"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ):(
              <div>
                <div className="card-ing p-5 mb-4">
                  <div className="flex items-center gap-4 mb-4"><span className="text-4xl">🚗</span><div><div className="font-bold text-xl text-[#E5E7EB] font-mono">{vehiculoSel.nombre}</div><div className="text-xs text-[#4B5563] font-mono">{vehiculoSel.marca} {vehiculoSel.modelo} · {vehiculoSel.anio} · {vehiculoSel.patente}</div></div></div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[{l:"KM",v:(vehiculoSel.km_actuales||0).toLocaleString()+" km",c:"#00FF80"},{l:"PROX. SERVICE",v:vehiculoSel.proximo_service_km?(vehiculoSel.proximo_service_km.toLocaleString()+" km"):"—",c:"#C9A227"},{l:"SEGURO",v:vehiculoSel.seguro_vencimiento||"—",c:vehiculoSel.seguro_vencimiento&&new Date(vehiculoSel.seguro_vencimiento)<new Date()?"#F87171":"#4ADE80"},{l:"VTV",v:vehiculoSel.vtv_vencimiento||"—",c:vehiculoSel.vtv_vencimiento&&new Date(vehiculoSel.vtv_vencimiento)<new Date()?"#F87171":"#4ADE80"}].map(d=>(
                      <div key={d.l} className="bg-[#020810]/60 rounded-lg p-3"><div className="text-xs text-[#4B5563] font-mono">{d.l}</div><div className="text-sm font-bold font-mono mt-1" style={{color:d.c}}>{d.v}</div></div>
                    ))}
                  </div>
                </div>
                {showForm && vehiculoSel && (
                  <div className="card-ing p-5 mb-4">
                    <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ SERVICE / REPARACION</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div><label className={lCls}>TIPO</label><select value={form.tipo_service??"service"} onChange={e=>setForm({...form,tipo_service:e.target.value})} className={iCls}><option value="service">Service</option><option value="reparacion">Reparacion</option><option value="preventivo">Preventivo</option><option value="vtv">VTV</option><option value="otro">Otro</option></select></div>
                      <div><label className={lCls}>DESCRIPCION</label><input type="text" value={form.descripcion??""} onChange={e=>setForm({...form,descripcion:e.target.value})} className={iCls} placeholder="Cambio aceite"/></div>
                      <div><label className={lCls}>TALLER</label><input type="text" value={form.taller??""} onChange={e=>setForm({...form,taller:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>KM</label><input type="number" value={form.km??""} onChange={e=>setForm({...form,km:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>COSTO</label><input type="number" value={form.costo??""} onChange={e=>setForm({...form,costo:e.target.value})} className={iCls}/></div>
                      <div><label className={lCls}>FECHA</label><input type="date" value={form.fecha??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha:e.target.value})} className={iCls}/></div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button onClick={guardarService} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono hover:bg-[#C9A227]/20">▶ GUARDAR</button>
                      <button onClick={()=>{setShowForm(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">CANCELAR</button>
                    </div>
                  </div>
                )}
                <div className="card-ing overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#00FF80]/10"><span className="text-[#00FF80] text-sm font-mono font-bold">🔧 HISTORIAL</span></div>
                  {servicios.length===0?<div className="text-center py-10 text-[#4B5563] font-mono text-sm">SIN HISTORIAL</div>:(
                    <table className="w-full">
                      <thead><tr className="border-b border-[#00FF80]/10">{["FECHA","TIPO","DESCRIPCION","TALLER","KM","COSTO",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                      <tbody>{servicios.map(s=>(
                        <tr key={s.id} className="border-b border-[#00FF80]/5 hover:bg-[#00FF80]/5">
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.fecha}</td>
                          <td className="px-4 py-3"><span className="text-xs bg-[#C9A227]/10 text-[#C9A227] px-2 py-0.5 rounded font-mono">{s.tipo}</span></td>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{s.descripcion}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.taller}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{s.km?(s.km.toLocaleString()+" km"):"—"}</td>
                          <td className="px-4 py-3 font-bold font-mono text-[#F87171]">${Number(s.costo).toLocaleString("es-AR")}</td>
                          <td className="px-4 py-3"><button onClick={()=>eliminar("ing_vehiculo_service",s.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== IA CAMPO ===== */}
        {seccion==="ia_campo" && (
          <div>
            <div className="mb-5">
              <h2 className="text-lg font-bold font-mono text-[#E5E7EB]">🤖 IA CAMPO — ASISTENTE AGRONOMICO</h2>
              <p className="text-xs text-[#4B5563] font-mono mt-1">Consulta sobre dosis, plagas, enfermedades, cultivos y mercados</p>
            </div>
            {aiChat.length===0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                {["Dosis glifosato soja post-emergencia","Como identificar roya asiatica soja","Fungicida manchas foliares maiz","Recomendaciones siembra trigo pampeana","Cuando aplicar insecticida soja MIP","Precio soja mercado actual"].map(q=>(
                  <button key={q} onClick={()=>setAiInput(q)} className="text-left text-xs text-[#4B6B5B] hover:text-[#00FF80] border border-[#00FF80]/10 hover:border-[#00FF80]/30 px-4 py-3 rounded-xl font-mono transition-all bg-[#0a1628]/60">💬 {q}</button>
                ))}
              </div>
            )}
            <div className="card-ing overflow-hidden mb-4">
              <div className="px-5 py-3 border-b border-[#00FF80]/10 flex items-center justify-between">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#00FF80] animate-pulse"/><span className="text-[#00FF80] text-xs font-mono">◆ IA AGRONOMICA ACTIVA</span></div>
                {aiChat.length>0&&<button onClick={()=>setAiChat([])} className="text-xs text-[#4B5563] hover:text-[#9CA3AF] font-mono">Limpiar</button>}
              </div>
              <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                {aiChat.length===0&&<div className="text-center py-10 text-[#4B5563] font-mono text-sm"><div className="text-4xl mb-3 opacity-30">🌾</div>Hace tu consulta agronomica...</div>}
                {aiChat.map((m,i)=>(
                  <div key={i} className={"flex "+(m.rol==="user"?"justify-end":"justify-start")}>
                    <div className={"max-w-[80%] px-4 py-3 rounded-xl text-sm font-mono "+(m.rol==="user"?"bg-[#00FF80]/10 border border-[#00FF80]/20 text-[#E5E7EB]":"bg-[#0F1115] border border-[#1C2128] text-[#9CA3AF]")}>
                      {m.rol==="assistant"&&<div className="text-[#00FF80] text-xs mb-2">◆ IA AGRONOMICA</div>}
                      <p className="leading-relaxed whitespace-pre-wrap">{m.texto}</p>
                    </div>
                  </div>
                ))}
                {aiLoading&&<div className="flex justify-start"><div className="bg-[#0F1115] border border-[#1C2128] px-4 py-3 rounded-xl"><p className="text-[#00FF80] text-xs font-mono animate-pulse">▶ Analizando...</p></div></div>}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={startVoiceIA} className={"flex items-center gap-2 px-4 py-3 rounded-xl border font-mono text-sm flex-shrink-0 "+(listening?"border-red-400 text-red-400 animate-pulse":"border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/10")}>🎤 {listening?"...":"VOZ"}</button>
              <input type="text" value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&askAI()} placeholder="Consulta sobre dosis, plagas, enfermedades, precios..." className="flex-1 bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-3 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono"/>
              <button onClick={askAI} disabled={aiLoading||!aiInput.trim()} className="px-6 py-3 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm disabled:opacity-40 flex-shrink-0 font-bold">▶ ENVIAR</button>
            </div>
          </div>
        )}
      </div>

      {/* Panel voz flotante */}
      {vozPanel && (
        <div className="fixed bottom-44 right-6 z-50 w-80 bg-[#0a1628]/97 border border-[#00FF80]/30 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#00FF80]/20">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{background:VOZ_COLOR[vozEstado]}}/><span className="text-[#00FF80] text-xs font-mono font-bold">🎤 ASISTENTE INGENIERO</span></div>
            <button onClick={()=>{setVozPanel(false);window.speechSynthesis?.cancel();recRef.current?.stop();setVozEstado("idle");}} className="text-[#4B5563] hover:text-white text-sm">✕</button>
          </div>
          <div className="px-4 pt-3 pb-2 min-h-20">
            {vozEstado==="escuchando"&&<div className="flex items-center gap-3 py-2"><div className="flex gap-1 items-end h-8">{[1,2,3,4,5].map(i=><div key={i} className="w-1.5 rounded-full bg-[#F87171]" style={{height:(10+i*5)+"px"}}/>)}</div><span className="text-[#F87171] text-sm font-mono">ESCUCHANDO...</span></div>}
            {vozEstado==="procesando"&&<div className="flex items-center gap-3 py-2"><div className="w-5 h-5 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin"/><span className="text-[#C9A227] text-xs font-mono">{vozTranscripcion}</span></div>}
            {vozRespuesta&&<div className="bg-[#00FF80]/8 border border-[#00FF80]/20 rounded-lg px-3 py-2 mb-2"><p className="text-[#E5E7EB] text-sm font-mono leading-relaxed">{vozRespuesta}</p></div>}
            {!vozRespuesta&&!vozTranscripcion&&vozEstado==="idle"&&(
              <div className="space-y-1 py-1">
                {["Cuantos productores tengo","Agrega productor Juan Perez 200 has Rafaela","Cual es mi total de hectareas"].map(q=>(
                  <button key={q} onClick={()=>{setVozTranscripcion(q);interpretarVoz(q);}} className="w-full text-left text-xs text-[#4B6B5B] hover:text-[#00FF80] border border-[#00FF80]/10 hover:border-[#00FF80]/30 px-3 py-2 rounded-lg font-mono transition-all">💬 {q}</button>
                ))}
              </div>
            )}
          </div>
          <div className="px-3 pb-3 flex gap-2 border-t border-[#00FF80]/10 pt-3">
            <input value={vozInput} onChange={e=>setVozInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}}} placeholder="Escribi o habla..." className="flex-1 bg-[#020810]/80 border border-[#00FF80]/20 rounded-lg px-3 py-2 text-[#E5E7EB] text-xs font-mono focus:outline-none focus:border-[#00FF80]"/>
            <button onClick={()=>{if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else escucharVoz();}} className="px-3 py-2 rounded-lg text-sm" style={{background:VOZ_COLOR[vozEstado]+"20",border:"1px solid "+VOZ_COLOR[vozEstado],color:VOZ_COLOR[vozEstado]}}>{VOZ_ICON[vozEstado]}</button>
            {vozInput&&<button onClick={()=>{setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}} className="px-3 py-2 rounded-lg bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] text-xs font-mono">▶</button>}
          </div>
        </div>
      )}

      {/* Botón flotante voz */}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
        className="fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-lg"
        style={{background:VOZ_COLOR[vozEstado]+"18",border:"2px solid "+VOZ_COLOR[vozEstado],color:VOZ_COLOR[vozEstado],animation:vozEstado==="idle"?"float 3s ease-in-out infinite":"none"}}>
        {VOZ_ICON[vozEstado]}
      </button>

      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 tracking-widest font-mono mt-6">AGROGESTION PRO · PANEL INGENIERO AGRONOMO</p>
      {ingenieroId && <EscanerIA empresaId={ingenieroId}/>}
    </div>
  );
}
