"use client";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import EscanerIA from "@/components/EscanerIA";

type Campana = { id: string; nombre: string; año_inicio: number; año_fin: number; activa: boolean; };
type Lote = {
  id: string; nombre: string; hectareas: number; tipo_alquiler: string;
  porcentaje_alquiler: number; cultivo: string; variedad: string;
  fecha_siembra: string; estado: string; observaciones: string;
  fertilizacion: string; herbicida: string; fungicida: string;
  rendimiento_esperado: number; costo_alquiler: number;
  ingeniero_id: string; campana_id: string;
};
type Labor = {
  id: string; tipo: string; descripcion: string; productos: string;
  dosis: string; fecha: string; metodo_carga: string;
  estado_carga?: string; metodo_entrada?: string;
};

const CULTIVOS = ["soja","maiz","trigo","girasol","sorgo","cebada","otro"];
const CULTIVO_ICONS: Record<string,string> = {
  soja:"🌱",maiz:"🌽",trigo:"🌾",girasol:"🌻",sorgo:"🌿",cebada:"🍃",otro:"🌐"
};
const CULTIVO_IMG: Record<string,string> = {
  soja:"/cultivo-soja.png", maiz:"/cultivo-maiz.png", trigo:"/cultivo-trigo.png",
  girasol:"/cultivo-girasol.png", sorgo:"/cultivo-sorgo.png",
  cebada:"/cultivo-cebada.png", otro:"/cultivo-otro.png",
};
const ESTADOS = ["sin_sembrar","sembrado","emergido","en_desarrollo","floración","llenado","cosechado"];
const ESTADO_COLORS: Record<string,string> = {
  sin_sembrar:"#4B5563",sembrado:"#60A5FA",emergido:"#4ADE80",
  en_desarrollo:"#00FF80",floración:"#C9A227",llenado:"#FB923C",cosechado:"#A78BFA"
};

export default function LotesPage() {
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [campanaActiva, setCampanaActiva] = useState<Campana | null>(null);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [labores, setLabores] = useState<Labor[]>([]);
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [usuarioId, setUsuarioId] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<"lista"|"cultivo">("lista");
  const [loteSeleccionado, setLoteSeleccionado] = useState<Lote|null>(null);
  const [showFormLote, setShowFormLote] = useState(false);
  const [showFormCampana, setShowFormCampana] = useState(false);
  const [showFormLabor, setShowFormLabor] = useState(false);
  const [showIA, setShowIA] = useState(false);
  const [showImportar, setShowImportar] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importando, setImportando] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const cuadernoImportRef = useRef<HTMLInputElement>(null);
  const [showImportCuaderno, setShowImportCuaderno] = useState(false);
  const [cuadernoImportPreview, setCuadernoImportPreview] = useState<any[]>([]);
  const [cuadernoImportMsg, setCuadernoImportMsg] = useState("");
  const [cuadernoImportando, setCuadernoImportando] = useState(false);
  const [form, setForm] = useState<Record<string,string>>({});
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [listening, setListening] = useState(false);
  const [ingenieros, setIngenieros] = useState<{id:string;nombre:string}[]>([]);

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
    setUsuarioId(u.id);
    const { data: emp } = await sb.from("empresas").select("id").eq("propietario_id", u.id).single();
    if (!emp) {
      const { data: newEmp } = await sb.from("empresas").insert({ nombre: "Mi Empresa", propietario_id: u.id }).select().single();
      if (newEmp) { setEmpresaId(newEmp.id); await fetchCampanas(newEmp.id); }
    } else {
      setEmpresaId(emp.id);
      await fetchCampanas(emp.id);
    }
    const { data: ings } = await sb.from("usuarios").select("id, nombre").eq("rol", "ingeniero");
    setIngenieros(ings ?? []);
    setLoading(false);
  };

  const fetchCampanas = async (eid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("campanas").select("*").eq("empresa_id", eid).order("año_inicio", { ascending: false });
    setCampanas(data ?? []);
    const activa = data?.find(c => c.activa) ?? data?.[0] ?? null;
    setCampanaActiva(activa);
    if (activa) await fetchLotes(eid, activa.id);
  };

  const fetchLotes = async (eid: string, cid: string) => {
    const sb = await getSB();
    const { data } = await sb.from("lotes").select("*").eq("empresa_id", eid).eq("campana_id", cid).order("nombre");
    setLotes(data ?? []);
  };

  const fetchLabores = async (loteId: string) => {
    const sb = await getSB();
    const { data } = await sb.from("lote_labores").select("*").eq("lote_id", loteId).order("fecha", { ascending: true });
    setLabores(data ?? []);
  };

  const crearCampana = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    await sb.from("campanas").update({ activa: false }).eq("empresa_id", empresaId);
    const { data: nuevaCampana } = await sb.from("campanas").insert({
      empresa_id: empresaId, nombre: `${form.año_inicio}/${form.año_fin}`,
      año_inicio: Number(form.año_inicio), año_fin: Number(form.año_fin), activa: true
    }).select().single();
    if (nuevaCampana && lotes.length > 0) {
      await sb.from("lotes").insert(lotes.map(l => ({
        empresa_id: empresaId, campana_id: nuevaCampana.id, nombre: l.nombre,
        hectareas: l.hectareas, tipo_alquiler: l.tipo_alquiler,
        porcentaje_alquiler: l.porcentaje_alquiler, cultivo: "", estado: "sin_sembrar", ingeniero_id: l.ingeniero_id,
      })));
    }
    await fetchCampanas(empresaId);
    setShowFormCampana(false); setForm({});
  };

  const guardarLote = async () => {
    if (!empresaId || !campanaActiva) return;
    const sb = await getSB();
    const payload = {
      empresa_id: empresaId, campana_id: campanaActiva.id,
      nombre: form.nombre, hectareas: Number(form.hectareas ?? 0),
      tipo_alquiler: form.tipo_alquiler ?? "propio",
      porcentaje_alquiler: Number(form.porcentaje_alquiler ?? 0),
      cultivo: form.cultivo ?? "", variedad: form.variedad ?? "",
      fecha_siembra: form.fecha_siembra ?? null, estado: form.estado ?? "sin_sembrar",
      fertilizacion: form.fertilizacion ?? "", herbicida: form.herbicida ?? "",
      fungicida: form.fungicida ?? "",
      rendimiento_esperado: Number(form.rendimiento_esperado ?? 0),
      costo_alquiler: Number(form.costo_alquiler ?? 0),
      ingeniero_id: form.ingeniero_id ?? null, observaciones: form.observaciones ?? "",
    };
    if (form._editando_id) {
      const { error } = await sb.from("lotes").update({
        nombre: payload.nombre, hectareas: payload.hectareas,
        tipo_alquiler: payload.tipo_alquiler, porcentaje_alquiler: payload.porcentaje_alquiler,
        cultivo: payload.cultivo, variedad: payload.variedad,
        fecha_siembra: payload.fecha_siembra, estado: payload.estado,
        fertilizacion: payload.fertilizacion, herbicida: payload.herbicida,
        fungicida: payload.fungicida, rendimiento_esperado: payload.rendimiento_esperado,
        costo_alquiler: payload.costo_alquiler, ingeniero_id: payload.ingeniero_id || null,
        observaciones: payload.observaciones,
      }).eq("id", form._editando_id);
      if (error) { console.error("Error:", error); return; }
      const { data: updated } = await sb.from("lotes").select("*").eq("id", form._editando_id).single();
      if (updated) setLoteSeleccionado(updated);
    } else {
      await sb.from("lotes").insert(payload);
    }
    if (empresaId && campanaActiva) await fetchLotes(empresaId, campanaActiva.id);
    setShowFormLote(false); setForm({});
  };

  const eliminarLote = async (id: string) => {
    if (!confirm("¿Eliminar este lote?")) return;
    const sb = await getSB();
    await sb.from("lotes").delete().eq("id", id);
    if (empresaId && campanaActiva) await fetchLotes(empresaId, campanaActiva.id);
    if (loteSeleccionado?.id === id) setLoteSeleccionado(null);
  };

  const guardarLabor = async () => {
    if (!loteSeleccionado || !empresaId || !usuarioId) return;
    const sb = await getSB();
    await sb.from("lote_labores").insert({
      lote_id: loteSeleccionado.id, empresa_id: empresaId,
      tipo: form.tipo_labor ?? "aplicacion",
      descripcion: form.descripcion_labor ?? "",
      productos: form.productos_labor ?? "", dosis: form.dosis_labor ?? "",
      fecha: form.fecha_labor ?? new Date().toISOString().split("T")[0],
      metodo_carga: "manual", metodo_entrada: "manual",
      estado_carga: "confirmado", cargado_por: usuarioId,
    });
    await fetchLabores(loteSeleccionado.id);
    setShowFormLabor(false); setForm({});
  };

  const confirmarLabor = async (id: string) => {
    const sb = await getSB();
    await sb.from("lote_labores").update({ estado_carga: "confirmado" }).eq("id", id);
    if (loteSeleccionado) await fetchLabores(loteSeleccionado.id);
  };

  const eliminarLabor = async (id: string) => {
    if (!confirm("¿Eliminar esta labor?")) return;
    const sb = await getSB();
    await sb.from("lote_labores").delete().eq("id", id);
    if (loteSeleccionado) await fetchLabores(loteSeleccionado.id);
  };

  const normalizarCultivo = (texto: string): string => {
    const t = texto.toLowerCase().trim();
    if (t.includes("maiz") || t.includes("maíz")) return "maiz";
    if (t.includes("trigo")) return "trigo";
    if (t.includes("girasol")) return "girasol";
    if (t.includes("sorgo")) return "sorgo";
    if (t.includes("cebada")) return "cebada";
    if (t.includes("soja")) return "soja";
    return "otro";
  };

  const parsearFecha = (valor: any): string => {
    const str = String(valor ?? "").trim();
    if (!str) return new Date().toISOString().split("T")[0];
    if (!isNaN(Number(str)) && Number(str) > 1000) {
      const d = new Date((Number(str) - 25569) * 86400 * 1000);
      return d.toISOString().split("T")[0];
    }
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
      const day = parts[0].padStart(2,"0");
      const month = parts[1].padStart(2,"0");
      const year = parts[2].length === 2 ? "20"+parts[2] : parts[2];
      return `${year}-${month}-${day}`;
    }
    return str;
  };

  const leerExcel = async (file: File) => {
    setImportMsg("Leyendo archivo...");
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (rows.length < 2) { setImportMsg("El archivo no tiene datos"); return; }
      const headers = rows[0].map((h: any) => String(h).toLowerCase().trim());
      const colLote = headers.findIndex((h: string) => h.includes("lote") || h.includes("nombre") || h.includes("campo"));
      const colHas = headers.findIndex((h: string) => h.includes("ha") || h.includes("hect"));
      const colCultivo = headers.length - 1;
      if (colLote === -1) { setImportMsg("No se encontró columna de lotes"); return; }
      const preview = rows.slice(1)
        .filter((r: any) => r[colLote] && String(r[colLote]).trim())
        .map((r: any) => {
          const nombreLote = String(r[colLote]).trim();
          const has = Number(r[colHas] ?? 0) || 0;
          const cultivoTexto = colCultivo >= 0 ? String(r[colCultivo] ?? "").trim() : "";
          const existe = lotes.find(l => l.nombre.toLowerCase().trim() === nombreLote.toLowerCase());
          return { nombre: nombreLote, hectareas: has, cultivo: normalizarCultivo(cultivoTexto), cultivo_original: cultivoTexto, accion: existe ? "actualizar" : "crear", id_existente: existe?.id ?? null };
        });
      setImportPreview(preview);
      setImportMsg(`✅ ${preview.length} lotes detectados`);
    } catch(e: any) { setImportMsg("Error: " + e.message); }
  };

  const confirmarImport = async () => {
    if (!empresaId || !campanaActiva || importPreview.length === 0) return;
    setImportando(true);
    const sb = await getSB();
    let creados = 0; let actualizados = 0;
    for (const l of importPreview) {
      if (l.accion === "actualizar" && l.id_existente) {
        await sb.from("lotes").update({ hectareas: l.hectareas, cultivo: l.cultivo }).eq("id", l.id_existente);
        actualizados++;
      } else {
        await sb.from("lotes").insert({ empresa_id: empresaId, campana_id: campanaActiva.id, nombre: l.nombre, hectareas: l.hectareas, cultivo: l.cultivo, tipo_alquiler: "propio", estado: "sin_sembrar" });
        creados++;
      }
    }
    await fetchLotes(empresaId, campanaActiva.id);
    setImportMsg(`✅ ${creados} creados · ${actualizados} actualizados`);
    setImportPreview([]); setImportando(false);
    setTimeout(() => { setShowImportar(false); setImportMsg(""); }, 3000);
  };

  const exportarCuaderno = async () => {
    if (!loteSeleccionado) return;
    const XLSX = await import("xlsx");
    const headers = ["LOTE","HAS","FECHA","TIPO","DESCRIPCION / PRODUCTOS","DOSIS","ESTADO CULTIVO","MÉTODO","ESTADO CARGA"];
    const rows = labores.map(l => [
      loteSeleccionado.nombre,
      loteSeleccionado.hectareas,
      l.fecha || "",
      l.tipo || "",
      l.descripcion || l.productos || "",
      l.dosis || "",
      loteSeleccionado.estado?.replace("_"," ") || "",
      l.metodo_carga || "",
      l.estado_carga || "confirmado",
    ]);
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 16 }, { wch: 6 }, { wch: 12 }, { wch: 14 },
      { wch: 40 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 12 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cuaderno");
    XLSX.writeFile(wb, `cuaderno_${loteSeleccionado.nombre}_${campanaActiva?.nombre ?? "campana"}.xlsx`);
  };

  const parsearFilaLabor = (r: any, headers: string[], colFecha: number, colObs: number, colEstado: number) => {
    const fechaStr = parsearFecha(r[colFecha]);
    const observacion = colObs >= 0 ? String(r[colObs] ?? "").trim() : "";
    const estado = colEstado >= 0 ? String(r[colEstado] ?? "").trim() : "";
    let tipo = "aplicacion";
    const obs = observacion.toLowerCase(); const est = estado.toLowerCase();
    if (est.includes("siem") || obs.includes("siem")) tipo = "siembra";
    else if (est.includes("cosech") || obs.includes("cosech")) tipo = "cosecha";
    else if (obs.includes("fertil") || obs.includes("urea") || obs.includes("map") || obs.includes("supertriple") || obs.includes("super triple")) tipo = "fertilizacion";
    return { fecha: fechaStr, tipo, descripcion: observacion, productos: observacion, dosis: "", estado_lote: estado };
  };

  const leerExcelCuaderno = async (file: File) => {
    setCuadernoImportMsg("Leyendo archivo...");
    setCuadernoImportPreview([]);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (rows.length < 2) { setCuadernoImportMsg("El archivo no tiene datos"); return; }
      const headers = rows[0].map((h: any) => String(h).toLowerCase().trim());
      const colFecha = headers.findIndex((h: string) => h.includes("fecha"));
      const colObs = headers.findIndex((h: string) => h.includes("obs") || h.includes("product") || h.includes("dosis") || h.includes("desc") || h.includes("aplic"));
      const colEstado = headers.findIndex((h: string) => h.includes("estado") || h.includes("etapa"));
      const colLote = headers.findIndex((h: string) => h.includes("lote") || h.includes("campo") || h.includes("nombre"));

      const dataRows = rows.slice(1).filter((r: any) => r[colFecha] && String(r[colFecha]).trim());

      // SI ESTAMOS DENTRO DE UN LOTE → filtrar solo las filas de ese lote
      if (loteSeleccionado) {
        const nombreLoteActual = loteSeleccionado.nombre.toLowerCase().trim();
        let filtradasPorLote = dataRows;
        let ignoradas = 0;

        if (colLote >= 0) {
          filtradasPorLote = dataRows.filter((r: any) => {
            const nombreFila = String(r[colLote] ?? "").toLowerCase().trim();
            if (!nombreFila) return true; // sin columna lote → incluir todo
            const match = nombreFila === nombreLoteActual ||
              nombreFila.includes(nombreLoteActual) ||
              nombreLoteActual.includes(nombreFila);
            if (!match) ignoradas++;
            return match;
          });
        }

        const preview = filtradasPorLote.map((r: any) => parsearFilaLabor(r, headers, colFecha, colObs, colEstado));
        setCuadernoImportPreview(preview);
        if (ignoradas > 0) {
          setCuadernoImportMsg(`✅ ${preview.length} labores del lote "${loteSeleccionado.nombre}" · ${ignoradas} filas de otros lotes ignoradas`);
        } else {
          setCuadernoImportMsg(`✅ ${preview.length} labores detectadas para "${loteSeleccionado.nombre}"`);
        }
        return;
      }

      // SI ESTAMOS EN LA LISTA GENERAL → importación masiva
      if (colLote === -1) { setCuadernoImportMsg("Para importación masiva el Excel debe tener columna LOTE"); return; }

      const preview: any[] = [];
      const lotesSinRegistrar: string[] = [];

      for (const r of dataRows) {
        const nombreLoteFila = String(r[colLote] ?? "").trim();
        if (!nombreLoteFila) continue;

        const loteEncontrado = lotes.find(l =>
          l.nombre.toLowerCase().trim() === nombreLoteFila.toLowerCase() ||
          l.nombre.toLowerCase().trim().includes(nombreLoteFila.toLowerCase()) ||
          nombreLoteFila.toLowerCase().includes(l.nombre.toLowerCase().trim())
        );

        if (!loteEncontrado) {
          if (!lotesSinRegistrar.includes(nombreLoteFila)) lotesSinRegistrar.push(nombreLoteFila);
          preview.push({ ...parsearFilaLabor(r, headers, colFecha, colObs, colEstado), lote_nombre: nombreLoteFila, lote_id: null, error: true });
        } else {
          preview.push({ ...parsearFilaLabor(r, headers, colFecha, colObs, colEstado), lote_nombre: loteEncontrado.nombre, lote_id: loteEncontrado.id, error: false });
        }
      }

      setCuadernoImportPreview(preview);
      if (lotesSinRegistrar.length > 0) {
        setCuadernoImportMsg(`⚠️ ${lotesSinRegistrar.length} lote(s) no registrado(s): ${lotesSinRegistrar.join(", ")} · ${preview.filter((p:any)=>!p.error).length} labores OK`);
      } else {
        setCuadernoImportMsg(`✅ ${preview.length} labores detectadas en ${[...new Set(preview.map((p:any)=>p.lote_nombre))].length} lotes`);
      }
    } catch(e: any) { setCuadernoImportMsg("Error: " + e.message); }
  };

  const confirmarImportCuaderno = async () => {
    if (!empresaId || !usuarioId || cuadernoImportPreview.length === 0) return;
    // Filtrar solo las que tienen lote válido
    const validas = cuadernoImportPreview.filter((l: any) => !l.error);
    if (validas.length === 0) { setCuadernoImportMsg("No hay labores válidas para importar"); return; }
    setCuadernoImportando(true);
    const sb = await getSB();
    let cargadas = 0;
    for (const labor of validas as any[]) {
      // Si estamos dentro de un lote → usar ese lote
      // Si es masivo → usar el lote_id de cada fila
      const loteId = loteSeleccionado ? loteSeleccionado.id : labor.lote_id;
      if (!loteId) continue;
      await sb.from("lote_labores").insert({
        lote_id: loteId, empresa_id: empresaId,
        tipo: labor.tipo, descripcion: labor.descripcion,
        productos: labor.productos, dosis: labor.dosis ?? "",
        fecha: labor.fecha, metodo_carga: "excel", metodo_entrada: "excel",
        estado_carga: "confirmado", cargado_por: usuarioId,
      });
      cargadas++;
    }
    // Refrescar labores ANTES de cerrar el panel
    if (loteSeleccionado) {
      await fetchLabores(loteSeleccionado.id);
    }
    const ignoradas = cuadernoImportPreview.filter((l: any) => l.error).length;
    setCuadernoImportPreview([]);
    setCuadernoImportando(false);
    setShowImportCuaderno(false);
    setCuadernoImportMsg(`✅ ${cargadas} labores cargadas${ignoradas > 0 ? ` · ${ignoradas} ignoradas` : ""}`);
  };

  const askAI = async (prompt: string) => {
    setAiLoading(true); setAiMsg("");
    try {
      const res = await fetch("/api/scanner", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: `Sos un asistente agronómico experto para AgroGestión Pro. Respondé en español, práctico y conciso. Contexto: ${lotes.length} lotes, cultivos: ${[...new Set(lotes.map(l=>l.cultivo).filter(Boolean))].join(", ")}. ${prompt}` }]
        })
      });
      const data = await res.json();
      setAiMsg(data.content?.[0]?.text ?? "Sin respuesta");
    } catch { setAiMsg("Error al conectar con IA"); }
    setAiLoading(false);
  };

  const startVoice = (modo: "labor"|"consulta") => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) { alert("Sin soporte de voz"); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR(); rec.lang = "es-AR"; rec.continuous = false;
    setListening(true);
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript; setListening(false);
      if (modo === "labor") { askAI(`Voz del productor: "${text}". Interpretá qué labor quiere registrar. Extraé tipo, fecha si la menciona, productos y dosis.`); setShowIA(true); }
      else { setAiInput(text); setShowIA(true); }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const headers = ["LOTE","HAS","TIPO","CULTIVO","VARIEDAD","ESTADO","FECHA SIEMBRA","REND.(tn/ha)","OBSERVACIONES"];
    const rows = lotes.map(l => [
      l.nombre,
      l.hectareas,
      l.tipo_alquiler,
      l.cultivo || "",
      l.variedad || "",
      l.estado?.replace("_"," ") || "",
      l.fecha_siembra || "",
      l.rendimiento_esperado || 0,
      l.observaciones || "",
    ]);
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    // Ancho de columnas
    ws["!cols"] = [
      { wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 25 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lotes");
    XLSX.writeFile(wb, `lotes_${campanaActiva?.nombre ?? "campana"}.xlsx`);
  };

  const inputClass = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const labelClass = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";
  const lotesPorCultivo = CULTIVOS.reduce((acc, c) => { const ls = lotes.filter(l => l.cultivo === c); if (ls.length > 0) acc[c] = ls; return acc; }, {} as Record<string, Lote[]>);
  const laboresPorFecha = labores.reduce((acc, l) => { const f = l.fecha ?? "sin fecha"; if (!acc[f]) acc[f] = []; acc[f].push(l); return acc; }, {} as Record<string, Labor[]>);
  const borradores = labores.filter((l: any) => l.estado_carga === "borrador").length;

  if (loading) return <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">▶ Cargando módulo de lotes...</div>;

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        @keyframes gradient-flow { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .lote-card:hover { border-color: rgba(0,255,128,0.5) !important; }
        .lote-card { transition: border-color 0.2s ease; }
        .logo-btn:hover { filter: drop-shadow(0 0 12px rgba(0,255,128,0.8)); transform: scale(1.03); }
        .logo-btn { transition: all 0.2s ease; cursor: pointer; }
        .btn-ia { animation: float 3s ease-in-out infinite; }
        .btn-ia:hover { transform: scale(1.1) !important; }
      `}</style>

      <div className="absolute inset-0 z-0"><Image src="/dashboard-bg.png" alt="bg" fill style={{ objectFit: "cover" }} /><div className="absolute inset-0 bg-[#020810]/85" /></div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.03]" style={{ backgroundImage: `linear-gradient(rgba(0,255,128,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,128,1) 1px, transparent 1px)`, backgroundSize: "50px 50px" }} />

      {/* HEADER */}
      <div className="relative z-10">
        <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{ background: "linear-gradient(90deg, transparent, #00FF80, #00AAFF, #00FF80, transparent)", backgroundSize: "200% 100%", animation: "gradient-flow 4s ease infinite" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(2,8,16,0.95) 0%, rgba(0,20,10,0.90) 50%, rgba(2,8,16,0.95) 100%)" }} />
        <div className="relative px-6 py-4 flex items-center gap-4">
          <button onClick={() => loteSeleccionado ? setLoteSeleccionado(null) : window.location.href = "/productor/dashboard"} className="text-[#4B5563] hover:text-[#00FF80] transition-colors font-mono text-sm">← {loteSeleccionado ? "Volver" : "Dashboard"}</button>
          <div className="flex-1" />
          <div className="logo-btn" onClick={() => window.location.href = "/productor/dashboard"}><Image src="/logo.png" alt="Logo" width={110} height={38} className="object-contain" /></div>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        {loteSeleccionado ? (
          <div>
            {/* Banner */}
            <div className="relative rounded-2xl overflow-hidden mb-6 h-48">
              <Image src={CULTIVO_IMG[loteSeleccionado.cultivo] ?? "/cultivo-default.png"} alt={loteSeleccionado.cultivo} fill style={{ objectFit: "cover" }} onError={(e) => { (e.target as any).src = "/dashboard-bg.png"; }} />
              <div className="absolute inset-0 bg-gradient-to-t from-[#020810] via-[#020810]/60 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-3xl font-bold text-white font-mono mb-1">{loteSeleccionado.nombre}</h1>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[#00FF80] text-sm font-mono">{loteSeleccionado.cultivo?.toUpperCase() || "Sin cultivo"} · {loteSeleccionado.hectareas} Ha · {loteSeleccionado.tipo_alquiler}</span>
                    <span className="text-xs px-3 py-1 rounded-full font-mono border" style={{ color: ESTADO_COLORS[loteSeleccionado.estado] ?? "#4B5563", borderColor: ESTADO_COLORS[loteSeleccionado.estado] ?? "#4B5563", background: (ESTADO_COLORS[loteSeleccionado.estado] ?? "#4B5563") + "30" }}>{loteSeleccionado.estado?.replace("_"," ").toUpperCase()}</span>
                    {borradores > 0 && <span className="text-xs px-2 py-1 rounded-full font-mono bg-[#C9A227]/15 text-[#C9A227] border border-[#C9A227]/30">⏳ {borradores} borrador{borradores > 1 ? "es" : ""}</span>}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => startVoice("labor")} className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all ${listening ? "border-red-400 text-red-400 animate-pulse" : "border-[#00FF80]/40 text-[#00FF80] bg-[#020810]/60 hover:bg-[#00FF80]/10"}`}>🎤 {listening ? "Escuchando..." : "Voz"}</button>
                  <button onClick={() => { setShowFormLabor(true); setForm({}); }} className="px-4 py-2 rounded-xl bg-[#00FF80]/20 border border-[#00FF80]/40 text-[#00FF80] font-mono text-sm">+ Labor</button>
                  <button onClick={() => { setShowFormLote(true); setForm({...Object.fromEntries(Object.entries(loteSeleccionado).map(([k,v])=>[k,String(v??"")])), _editando_id: loteSeleccionado.id}); }} className="px-4 py-2 rounded-xl border border-[#C9A227]/40 text-[#C9A227] bg-[#020810]/60 font-mono text-sm">✏️ Editar</button>
                </div>
              </div>
            </div>

            {/* Datos */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Variedad/Híbrido", value: loteSeleccionado.variedad || "—", color: "#00FF80" },
                { label: "Fecha Siembra", value: loteSeleccionado.fecha_siembra || "—", color: "#60A5FA" },
                { label: "Cultivo", value: loteSeleccionado.cultivo?.toUpperCase() || "Sin cultivo", color: "#4ADE80" },
                { label: "Rend. Esperado", value: loteSeleccionado.rendimiento_esperado ? `${loteSeleccionado.rendimiento_esperado} tn/ha` : "—", color: "#FB923C" },
                { label: "Tenencia", value: loteSeleccionado.tipo_alquiler || "—", color: "#C9A227" },
                { label: "Hectáreas", value: `${loteSeleccionado.hectareas} Ha`, color: "#00FF80" },
                { label: "Ingeniero", value: ingenieros.find(i => i.id === loteSeleccionado.ingeniero_id)?.nombre || "Sin asignar", color: "#60A5FA" },
                { label: "Observaciones", value: loteSeleccionado.observaciones || "—", color: "#9CA3AF" },
              ].map(d => (
                <div key={d.label} className="bg-[#0a1628]/80 border border-[#00FF80]/10 rounded-xl p-4">
                  <div className="text-xs text-[#4B5563] uppercase tracking-widest font-mono mb-1">{d.label}</div>
                  <div className="text-sm font-mono" style={{ color: d.color }}>{d.value}</div>
                </div>
              ))}
            </div>

            {/* Form editar */}
            {showFormLote && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">✏️ EDITAR LOTE</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Nombre</label><input type="text" value={form.nombre ?? ""} onChange={e => setForm({...form, nombre: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Hectáreas</label><input type="number" value={form.hectareas ?? ""} onChange={e => setForm({...form, hectareas: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Tenencia</label>
                    <select value={form.tipo_alquiler ?? "propio"} onChange={e => setForm({...form, tipo_alquiler: e.target.value})} className={inputClass}>
                      <option value="propio">Propio</option><option value="alquilado">Alquilado</option><option value="mixto">Mixto</option><option value="porcentaje">A porcentaje</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Cultivo</label>
                    <select value={form.cultivo ?? ""} onChange={e => setForm({...form, cultivo: e.target.value})} className={inputClass}>
                      <option value="">Sin cultivo</option>{CULTIVOS.map(c => <option key={c} value={c}>{CULTIVO_ICONS[c]} {c.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Variedad/Híbrido</label><input type="text" value={form.variedad ?? ""} onChange={e => setForm({...form, variedad: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Fecha siembra</label><input type="date" value={form.fecha_siembra ?? ""} onChange={e => setForm({...form, fecha_siembra: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Estado</label>
                    <select value={form.estado ?? "sin_sembrar"} onChange={e => setForm({...form, estado: e.target.value})} className={inputClass}>
                      {ESTADOS.map(s => <option key={s} value={s}>{s.replace("_"," ").toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Rend. esperado (tn/ha)</label><input type="number" value={form.rendimiento_esperado ?? ""} onChange={e => setForm({...form, rendimiento_esperado: e.target.value})} className={inputClass} placeholder="0" /></div>
                  <div className="md:col-span-2 bg-[#020810]/40 border border-[#C9A227]/10 rounded-xl p-3">
                    <p className="text-xs text-[#4B5563] font-mono">💡 Herbicida, fungicida y fertilización se registran en el <span className="text-[#C9A227]">Cuaderno de Campo</span> como labores. El alquiler se gestiona en <span className="text-[#C9A227]">Contratos</span>.</p>
                  </div>
                  <div><label className={labelClass}>Ingeniero</label>
                    <select value={form.ingeniero_id ?? ""} onChange={e => setForm({...form, ingeniero_id: e.target.value})} className={inputClass}>
                      <option value="">Sin asignar</option>{ingenieros.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={labelClass}>Observaciones</label><input type="text" value={form.observaciones ?? ""} onChange={e => setForm({...form, observaciones: e.target.value})} className={inputClass} /></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarLote} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={() => { setShowFormLote(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Form labor */}
            {showFormLabor && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ REGISTRAR LABOR</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Tipo</label>
                    <select value={form.tipo_labor ?? "aplicacion"} onChange={e => setForm({...form, tipo_labor: e.target.value})} className={inputClass}>
                      <option value="aplicacion">Aplicación</option><option value="siembra">Siembra</option><option value="fertilizacion">Fertilización</option><option value="cosecha">Cosecha</option><option value="recorrida">Recorrida</option><option value="otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={labelClass}>Descripción</label><input type="text" value={form.descripcion_labor ?? ""} onChange={e => setForm({...form, descripcion_labor: e.target.value})} className={inputClass} placeholder="Ej: Aplicación herbicida" /></div>
                  <div><label className={labelClass}>Productos y dosis</label><input type="text" value={form.productos_labor ?? ""} onChange={e => setForm({...form, productos_labor: e.target.value})} className={inputClass} placeholder="Ej: 2 GLIFO + 1 2,4D" /></div>
                  <div><label className={labelClass}>Fecha</label><input type="date" value={form.fecha_labor ?? new Date().toISOString().split("T")[0]} onChange={e => setForm({...form, fecha_labor: e.target.value})} className={inputClass} /></div>
                  <div><label className={labelClass}>Estado del cultivo</label><input type="text" value={form.estado_labor ?? ""} onChange={e => setForm({...form, estado_labor: e.target.value})} className={inputClass} placeholder="Ej: V2, R3, Barbecho" /></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarLabor} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={() => setShowFormLabor(false)} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* CUADERNO */}
            <div className="bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#00FF80]/10 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-[#00FF80] text-sm font-mono font-bold">📋 CUADERNO DE CAMPO</span>
                  <span className="text-xs text-[#4B5563] font-mono">{labores.length} registros</span>
                  {borradores > 0 && <span className="text-xs bg-[#C9A227]/10 text-[#C9A227] border border-[#C9A227]/20 px-2 py-0.5 rounded font-mono">⏳ {borradores} sin confirmar</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={exportarCuaderno} className="text-xs text-[#4ADE80] font-mono border border-[#4ADE80]/20 px-3 py-1 rounded-lg hover:bg-[#4ADE80]/10 transition-all">📊 Exportar</button>
                  <button onClick={() => { setShowImportCuaderno(!showImportCuaderno); setCuadernoImportPreview([]); setCuadernoImportMsg(""); }} className="text-xs text-[#C9A227] font-mono border border-[#C9A227]/20 px-3 py-1 rounded-lg hover:bg-[#C9A227]/10 transition-all">📥 Importar Excel</button>
                  <button onClick={() => loteSeleccionado && fetchLabores(loteSeleccionado.id)} className="text-xs text-[#4B5563] hover:text-[#00FF80] font-mono transition-colors px-2">↻</button>
                </div>
              </div>

              {/* Panel import cuaderno */}
              {showImportCuaderno && (
                <div className="border-b border-[#C9A227]/20 bg-[#020810]/60 p-4">
                  <p className="text-xs text-[#4B5563] font-mono mb-3">
                    Columnas detectadas automáticamente: <span className="text-[#C9A227]">FECHA · OBSERVACIÓN / PRODUCTOS · ESTADO</span><br/>
                    Las labores quedan en <span className="text-[#C9A227]">borrador</span> — el ing/productor confirma cada una.
                  </p>
                  <input ref={cuadernoImportRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) leerExcelCuaderno(f); }} />
                  {cuadernoImportPreview.length === 0 ? (
                    <button onClick={() => cuadernoImportRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border border-dashed border-[#C9A227]/30 rounded-xl text-[#C9A227] font-mono text-xs hover:border-[#C9A227]/60 transition-all">
                      📁 Seleccionar archivo Excel o CSV
                    </button>
                  ) : (
                    <div>
                      <div className="max-h-48 overflow-y-auto mb-3 rounded-lg border border-[#C9A227]/15">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b border-[#C9A227]/10 bg-[#020810]/60">
                            {[...(cuadernoImportPreview.some((l:any)=>l.lote_nombre) && !loteSeleccionado ? ["Lote"] : []), "Fecha","Tipo","Descripción / Productos","Estado"].map(h => <th key={h} className="text-left px-3 py-2 text-[#4B5563] font-mono">{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {cuadernoImportPreview.map((l: any, i: number) => (
                              <tr key={i} className={`border-b border-[#C9A227]/5 ${l.error ? "bg-red-500/5" : "hover:bg-[#C9A227]/5"}`}>
                                {l.lote_nombre && !loteSeleccionado && (
                                  <td className="px-3 py-2 font-mono whitespace-nowrap">
                                    {l.error
                                      ? <span className="text-red-400 flex items-center gap-1">⚠️ {l.lote_nombre}</span>
                                      : <span className="text-[#00FF80]">{l.lote_nombre}</span>
                                    }
                                  </td>
                                )}
                                <td className="px-3 py-2 font-mono text-[#E5E7EB] whitespace-nowrap">{l.fecha}</td>
                                <td className="px-3 py-2"><span className="bg-[#00FF80]/10 text-[#00FF80] px-1.5 py-0.5 rounded font-mono">{l.tipo}</span></td>
                                <td className="px-3 py-2 text-[#9CA3AF] font-mono max-w-xs truncate">{l.descripcion}</td>
                                <td className="px-3 py-2 text-[#C9A227] font-mono">{l.estado_lote}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={confirmarImportCuaderno} disabled={cuadernoImportando || cuadernoImportPreview.filter((l:any)=>!l.error).length === 0}
                          className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-4 py-2 rounded-lg text-xs font-mono disabled:opacity-50">
                          {cuadernoImportando ? "Importando..." : `▶ Importar ${cuadernoImportPreview.filter((l:any)=>!l.error).length} labores válidas`}
                        </button>
                        <button onClick={() => { setCuadernoImportPreview([]); cuadernoImportRef.current?.click(); }} className="border border-[#1C2128] text-[#4B5563] px-3 py-2 rounded-lg text-xs font-mono">Cambiar archivo</button>
                      </div>
                    </div>
                  )}
                  {cuadernoImportMsg && <p className={`mt-2 text-xs font-mono ${cuadernoImportMsg.startsWith("✅") ? "text-[#4ADE80]" : "text-[#F87171]"}`}>{cuadernoImportMsg}</p>}
                </div>
              )}

              {/* Labores agrupadas por fecha */}
              {labores.length === 0 ? (
                <div className="text-center py-10 text-[#4B5563] font-mono text-sm">Sin labores registradas</div>
              ) : (
                <div>
                  {Object.entries(laboresPorFecha).sort(([a],[b]) => a.localeCompare(b)).map(([fecha, laborsDeFecha]) => (
                    <div key={fecha} className="border-b border-[#00FF80]/5 last:border-0">
                      <div className="px-5 py-2 bg-[#020810]/40 flex items-center gap-3">
                        <span className="text-xs font-bold text-[#E5E7EB] font-mono">📅 {fecha}</span>
                        <span className="text-xs text-[#4B5563] font-mono">{laborsDeFecha.length} labor{laborsDeFecha.length > 1 ? "es" : ""}</span>
                        {(laborsDeFecha as any[]).some((l: any) => l.estado_carga === "borrador") && <span className="text-xs text-[#C9A227] font-mono">⏳ borrador</span>}
                      </div>
                      {(laborsDeFecha as any[]).map((l: any) => (
                        <div key={l.id} className={`px-5 py-3 hover:bg-[#00FF80]/3 transition-colors ${l.estado_carga === "borrador" ? "border-l-4 border-[#C9A227]/50" : "border-l-4 border-transparent"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-xs bg-[#00FF80]/10 text-[#00FF80] px-2 py-0.5 rounded font-mono">{l.tipo}</span>
                                {l.estado_carga === "borrador" && <span className="text-xs bg-[#C9A227]/10 text-[#C9A227] border border-[#C9A227]/20 px-2 py-0.5 rounded font-mono">⏳ BORRADOR</span>}
                                {l.metodo_entrada === "excel" && <span className="text-xs text-[#60A5FA] font-mono">📊 Excel</span>}
                                {l.metodo_entrada === "voz" && <span className="text-xs text-[#A78BFA] font-mono">🎤 Voz</span>}
                                {l.metodo_entrada === "foto" && <span className="text-xs text-[#FB923C] font-mono">📸 Foto</span>}
                              </div>
                              {l.descripcion && <p className="text-sm text-[#E5E7EB] font-mono leading-relaxed">{l.descripcion}</p>}
                              {l.productos && l.productos !== l.descripcion && <p className="text-xs text-[#C9A227] font-mono mt-1">🧪 {l.productos}{l.dosis ? ` · ${l.dosis}` : ""}</p>}
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              {l.estado_carga === "borrador" && (
                                <button onClick={() => confirmarLabor(l.id)} className="text-xs text-[#4ADE80] border border-[#4ADE80]/20 px-2 py-1 rounded font-mono hover:bg-[#4ADE80]/10 transition-all">✓ Confirmar</button>
                              )}
                              <button onClick={() => eliminarLabor(l.id)} className="text-xs text-[#4B5563] hover:text-red-400 px-2 py-1 rounded font-mono transition-colors">✕</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        ) : (
          <>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">◱ LOTES Y CULTIVOS</h1>
                <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">◆ CUADERNO DE CAMPO DIGITAL</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => startVoice("consulta")} className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all ${listening ? "border-red-400 text-red-400 animate-pulse" : "border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/10"}`}>🎤 {listening ? "..." : "Voz"}</button>
                <button onClick={exportarExcel} className="px-4 py-2 rounded-xl border border-[#4ADE80]/30 text-[#4ADE80] hover:bg-[#4ADE80]/10 font-mono text-sm transition-all">📊 Exportar</button>
                <button onClick={() => { setShowImportar(!showImportar); setImportPreview([]); setImportMsg(""); }} className="px-4 py-2 rounded-xl border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/10 font-mono text-sm transition-all">📥 Importar Excel</button>
                <button onClick={() => setVista(vista === "lista" ? "cultivo" : "lista")} className="px-4 py-2 rounded-xl border border-[#60A5FA]/30 text-[#60A5FA] hover:bg-[#60A5FA]/10 font-mono text-sm transition-all">{vista === "lista" ? "◈ Por Cultivo" : "☰ Lista"}</button>
                <button onClick={() => { setShowFormLote(true); setForm({}); }} className="px-4 py-2 rounded-xl bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/20 font-mono text-sm transition-all">+ Nuevo Lote</button>
              </div>
            </div>

            {/* Selector campaña */}
            <div className="bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-[#4B5563] uppercase tracking-widest font-mono">Campaña:</span>
                  {campanas.map(c => (
                    <button key={c.id} onClick={async () => { setCampanaActiva(c); if (empresaId) await fetchLotes(empresaId, c.id); }}
                      className={`px-4 py-1.5 rounded-xl text-sm font-mono border transition-all ${campanaActiva?.id === c.id ? "border-[#C9A227] text-[#C9A227] bg-[#C9A227]/10" : "border-[#1C2128] text-[#4B5563] hover:text-[#9CA3AF]"}`}>
                      {c.nombre} {c.activa && "✓"}
                    </button>
                  ))}
                  <button onClick={() => { setShowFormCampana(true); setForm({ año_inicio: "2025", año_fin: "2026" }); }} className="px-4 py-1.5 rounded-xl text-sm font-mono border border-[#00FF80]/20 text-[#00FF80] hover:bg-[#00FF80]/10 transition-all">+ Nueva Campaña</button>
                </div>
                <div className="text-xs text-[#4B5563] font-mono">{lotes.length} lotes · {lotes.reduce((a, l) => a + (l.hectareas ?? 0), 0)} Ha totales</div>
              </div>
            </div>

            {/* Import lotes */}
            {showImportar && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[#C9A227] font-mono text-sm font-bold">📥 IMPORTAR LOTES DESDE EXCEL</h3>
                  <button onClick={() => { setShowImportar(false); setImportPreview([]); setImportMsg(""); }} className="text-[#4B5563] hover:text-white text-sm">✕</button>
                </div>
                <p className="text-xs text-[#4B5563] font-mono mb-4">Columnas: <span className="text-[#C9A227]">LOTE · HAS · CULTIVO</span> — Lotes existentes se actualizan, nuevos se crean.</p>
                <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) leerExcel(f); }} />
                {importPreview.length === 0 ? (
                  <button onClick={() => importRef.current?.click()} className="flex items-center gap-3 px-6 py-4 border-2 border-dashed border-[#C9A227]/30 rounded-xl text-[#C9A227] font-mono text-sm hover:border-[#C9A227]/60 hover:bg-[#C9A227]/5 transition-all w-full justify-center">
                    📁 Seleccionar archivo Excel (.xlsx, .xls, .csv)
                  </button>
                ) : (
                  <div>
                    <div className="max-h-64 overflow-y-auto mb-4 rounded-xl border border-[#C9A227]/15">
                      <table className="w-full">
                        <thead><tr className="border-b border-[#C9A227]/15 bg-[#020810]/60">{["Lote","Hectáreas","Cultivo","Original","Acción"].map(h => <th key={h} className="text-left px-4 py-2 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                        <tbody>
                          {importPreview.map((l: any, i: number) => (
                            <tr key={i} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                              <td className="px-4 py-2 text-sm text-[#E5E7EB] font-mono font-bold">{l.nombre}</td>
                              <td className="px-4 py-2 text-sm text-[#00FF80] font-mono">{l.hectareas} Ha</td>
                              <td className="px-4 py-2 text-xs font-mono">{CULTIVO_ICONS[l.cultivo]} {l.cultivo.toUpperCase()}</td>
                              <td className="px-4 py-2 text-xs text-[#4B5563] font-mono">{l.cultivo_original}</td>
                              <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded font-mono ${l.accion === "crear" ? "bg-[#4ADE80]/10 text-[#4ADE80]" : "bg-[#60A5FA]/10 text-[#60A5FA]"}`}>{l.accion === "crear" ? "✚ Crear" : "✎ Actualizar"}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={confirmarImport} disabled={importando} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono disabled:opacity-50">{importando ? "▶ Importando..." : `▶ Confirmar ${importPreview.length} lotes`}</button>
                      <button onClick={() => { setImportPreview([]); setImportMsg(""); importRef.current?.click(); }} className="border border-[#1C2128] text-[#4B5563] px-4 py-2.5 rounded-xl text-sm font-mono">Cambiar archivo</button>
                    </div>
                  </div>
                )}
                {importMsg && <p className={`mt-3 text-xs font-mono ${importMsg.startsWith("✅") ? "text-[#4ADE80]" : "text-[#F87171]"}`}>{importMsg}</p>}
              </div>
            )}

            {/* Form campaña */}
            {showFormCampana && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-6">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ NUEVA CAMPAÑA {lotes.length > 0 && `— Se migrarán ${lotes.length} lotes`}</h3>
                <div className="flex gap-4 items-end flex-wrap">
                  <div><label className={labelClass}>Año inicio</label><input type="number" value={form.año_inicio ?? "2025"} onChange={e => setForm({...form, año_inicio: e.target.value})} className={inputClass + " w-32"} /></div>
                  <div><label className={labelClass}>Año fin</label><input type="number" value={form.año_fin ?? "2026"} onChange={e => setForm({...form, año_fin: e.target.value})} className={inputClass + " w-32"} /></div>
                  <button onClick={crearCampana} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2.5 rounded-xl text-sm font-mono">▶ Crear y Migrar</button>
                  <button onClick={() => setShowFormCampana(false)} className="border border-[#1C2128] text-[#4B5563] px-5 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Form nuevo lote */}
            {showFormLote && !loteSeleccionado && (
              <div className="bg-[#0a1628]/80 border border-[#00FF80]/30 rounded-2xl p-6 mb-6">
                <h3 className="text-[#00FF80] font-mono text-sm font-bold mb-5">+ NUEVO LOTE</h3>
                <div className="mb-5">
                  <input type="text" value={form.nombre ?? ""} onChange={e => setForm({...form, nombre: e.target.value})} placeholder="NOMBRE DEL LOTE"
                    className="w-full bg-transparent border-b-2 border-[#00FF80]/40 text-white text-3xl font-bold font-mono focus:outline-none focus:border-[#00FF80] placeholder-[#1a3a2a] pb-2 tracking-widest uppercase transition-all" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-[#020810]/60 rounded-xl p-4 border border-[#00FF80]/10">
                    <label className="block text-xs text-[#4B6B5B] uppercase tracking-widest mb-2 font-mono">Hectáreas</label>
                    <input type="number" value={form.hectareas ?? ""} onChange={e => setForm({...form, hectareas: e.target.value})} placeholder="0" className="w-full bg-transparent text-[#00FF80] text-3xl font-bold font-mono focus:outline-none placeholder-[#1a3a2a]" />
                    <span className="text-xs text-[#4B5563] font-mono">Ha</span>
                  </div>
                  <div className="bg-[#020810]/60 rounded-xl p-4 border border-[#00FF80]/10">
                    <label className="block text-xs text-[#4B6B5B] uppercase tracking-widest mb-2 font-mono">Tenencia</label>
                    <div className="flex flex-col gap-1.5">
                      {["propio","alquilado","mixto","porcentaje"].map(t => (
                        <button key={t} onClick={() => setForm({...form, tipo_alquiler: t})}
                          className={`text-left text-sm font-mono px-3 py-1.5 rounded-lg transition-all ${form.tipo_alquiler === t || (!form.tipo_alquiler && t === "propio") ? "bg-[#00FF80]/15 text-[#00FF80] border border-[#00FF80]/30" : "text-[#4B5563] hover:text-[#9CA3AF]"}`}>
                          {t === "propio" ? "✓ Propio" : t === "alquilado" ? "🏘️ Alquilado" : t === "mixto" ? "⚡ Mixto" : "% A porcentaje"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-[#020810]/60 rounded-xl p-4 border border-[#00FF80]/10">
                    <label className="block text-xs text-[#4B6B5B] uppercase tracking-widest mb-2 font-mono">Ingeniero</label>
                    <select value={form.ingeniero_id ?? ""} onChange={e => setForm({...form, ingeniero_id: e.target.value})} className="w-full bg-transparent text-[#E5E7EB] text-sm font-mono focus:outline-none">
                      <option value="">Sin asignar</option>{ingenieros.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                    </select>
                    <p className="text-xs text-[#4B5563] font-mono mt-2">El cultivo se carga al entrar al lote</p>
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={guardarLote} className="bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] font-bold px-8 py-3 rounded-xl text-sm hover:bg-[#00FF80]/20 transition-all font-mono">▶ Crear Lote</button>
                  <button onClick={() => { setShowFormLote(false); setForm({}); }} className="border border-[#1C2128] text-[#4B5563] px-6 py-3 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {/* Grid lotes */}
            {lotes.length === 0 ? (
              <div className="text-center py-20 bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl">
                <div className="text-5xl mb-4 opacity-20">◱</div>
                <p className="text-[#4B5563] font-mono">No hay lotes en esta campaña</p>
              </div>
            ) : vista === "lista" ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                {lotes.map(l => (
                  <div key={l.id} className="lote-card border border-[#00FF80]/15 rounded-xl overflow-hidden cursor-pointer" style={{ height: "160px", position: "relative" }} onClick={() => { setLoteSeleccionado(l); fetchLabores(l.id); }}>
                    <div className="absolute inset-0">
                      <Image src={CULTIVO_IMG[l.cultivo] ?? "/cultivo-default.png"} alt={l.cultivo || "lote"} fill style={{ objectFit: "cover" }} onError={(e) => { (e.target as any).src = "/dashboard-bg.png"; }} />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#020810]/95 via-[#020810]/40 to-transparent" />
                    </div>
                    <button onClick={e => { e.stopPropagation(); eliminarLote(l.id); }} className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-[#020810]/80 text-[#4B5563] hover:text-red-400 text-xs flex items-center justify-center transition-colors">✕</button>
                    <div className="absolute top-2 left-2 z-10">
                      <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ color: ESTADO_COLORS[l.estado] ?? "#4B5563", background: (ESTADO_COLORS[l.estado] ?? "#4B5563") + "25", border: `1px solid ${ESTADO_COLORS[l.estado] ?? "#4B5563"}40` }}>{l.estado?.replace("_"," ")}</span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 z-10 p-4">
                      <div className="font-bold text-white font-mono text-lg leading-tight">{l.nombre}</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[#00FF80] text-xs font-mono font-bold">{l.hectareas} Ha</span>
                        <span className="text-[#4B5563] text-xs font-mono">{l.cultivo?.toUpperCase() || "Sin cultivo"}</span>
                      </div>
                      {l.variedad && <div className="text-xs text-[#4B5563] font-mono mt-0.5">{l.variedad}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(lotesPorCultivo).map(([cultivo, lotesDelCultivo]) => (
                  <div key={cultivo} className="bg-[#0a1628]/60 border border-[#00FF80]/15 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-[#00FF80]/10 flex items-center gap-3">
                      <span className="text-2xl">{CULTIVO_ICONS[cultivo]}</span>
                      <span className="font-bold text-[#E5E7EB] font-mono uppercase">{cultivo}</span>
                      <span className="text-xs text-[#4B5563] font-mono">{lotesDelCultivo.length} lotes · {lotesDelCultivo.reduce((a,l) => a + (l.hectareas ?? 0), 0)} Ha</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
                      {lotesDelCultivo.map(l => (
                        <div key={l.id} className="lote-card bg-[#020810]/60 border border-[#00FF80]/10 rounded-lg p-3 cursor-pointer" onClick={() => { setLoteSeleccionado(l); fetchLabores(l.id); }}>
                          <div className="font-bold text-sm text-[#E5E7EB] font-mono">{l.nombre}</div>
                          <div className="text-xs text-[#4B5563] font-mono">{l.hectareas} Ha</div>
                          <div className="text-xs font-mono mt-1" style={{ color: ESTADO_COLORS[l.estado] ?? "#4B5563" }}>{l.estado?.replace("_"," ")}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Botón IA flotante */}
      <button onClick={() => setShowIA(!showIA)} className="btn-ia fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full overflow-hidden shadow-lg shadow-[#60A5FA]/30" title="Asistente IA Agronómico">
        <Image src="/btn-ia.png" alt="IA" fill style={{ objectFit: "cover" }} />
      </button>

      {/* Panel IA */}
      {showIA && (
        <div className="fixed bottom-44 right-6 z-40 w-80 bg-[#0a1628]/95 border border-[#60A5FA]/30 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#60A5FA]/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#60A5FA] animate-pulse" />
              <span className="text-[#60A5FA] text-xs font-mono font-bold">◆ ASISTENTE IA AGRONÓMICO</span>
            </div>
            <button onClick={() => { setShowIA(false); setAiMsg(""); }} className="text-[#4B5563] hover:text-white text-sm">✕</button>
          </div>
          <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
            {!aiMsg && !aiLoading && (
              <div className="space-y-1">
                {["Resumen de todos mis lotes","¿Qué lotes necesitan atención urgente?","Calculá el margen bruto total"].map(q => (
                  <button key={q} onClick={() => askAI(q)} className="w-full text-left text-xs text-[#4B6B5B] hover:text-[#60A5FA] border border-[#60A5FA]/10 hover:border-[#60A5FA]/30 px-3 py-2 rounded-lg font-mono transition-all">💬 {q}</button>
                ))}
              </div>
            )}
            {aiLoading && <p className="text-[#60A5FA] text-xs font-mono animate-pulse px-2">▶ Analizando...</p>}
            {aiMsg && <p className="text-[#9CA3AF] text-xs font-mono leading-relaxed px-2 whitespace-pre-wrap">{aiMsg}</p>}
          </div>
          <div className="px-3 pb-3 flex gap-2">
            <input value={aiInput} onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && aiInput.trim()) { askAI(aiInput); setAiInput(""); } }}
              placeholder="Preguntá algo..." className="flex-1 bg-[#020810]/80 border border-[#60A5FA]/20 rounded-lg px-3 py-2 text-[#E5E7EB] text-xs font-mono focus:outline-none focus:border-[#60A5FA]" />
            <button onClick={() => { if (aiInput.trim()) { askAI(aiInput); setAiInput(""); } }} className="px-3 py-2 rounded-lg bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] text-xs font-mono">▶</button>
          </div>
        </div>
      )}

      {empresaId && <EscanerIA empresaId={empresaId} />}
    </div>
  );
}
