"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import EscanerIA from "@/components/EscanerIA";

type Tab = "granos" | "insumos" | "gasoil" | "varios";
type UbicacionItem = { id: string; cultivo: string; tipo_ubicacion: string; nombre_ubicacion: string; cantidad_tn: number; };
type VentaPactada = { id: string; cultivo: string; cantidad_tn: number; precio_tn: number; destino: string; tipo_destino: string; fecha_entrega: string; estado: string; };
type InsumoItem = { id: string; nombre: string; categoria: string; subcategoria: string; cantidad: number; unidad: string; ubicacion: string; tipo_ubicacion: string; precio_unitario: number; };
type GasoilItem = { id: string; cantidad_litros: number; ubicacion: string; tipo_ubicacion: string; precio_litro: number; };
type GasoilMov = { id: string; gasoil_id: string; fecha: string; tipo: string; litros: number; descripcion: string; metodo: string; };
type VariosItem = { id: string; nombre: string; categoria: string; cantidad: number; unidad: string; ubicacion: string; };
type Proveedor = { id: string; nombre: string; telefono: string; categoria: string; };

const UBICACIONES = [
  { value:"silo", label:"Silo", icon:"🏗️", img:"/ubicacion-silo.png" },
  { value:"silobolsa", label:"Silo Bolsa", icon:"🎒", img:"/ubicacion-silobolsa.png" },
  { value:"campo", label:"En Campo", icon:"🌾", img:"/ubicacion-campo.png" },
  { value:"coop", label:"Empresa/Coop", icon:"🏢", img:"/ubicacion-coop.png" },
];
const CULTIVO_ICONS: Record<string,string> = { soja:"🌱",maiz:"🌽",trigo:"🌾",girasol:"🌻",sorgo:"🌿",cebada:"🍃",arveja:"🫛",otro:"🌐" };
const SUBCATS_AGRO = ["herbicida","insecticida","fungicida","coadyuvante","curasemilla","fertilizante_foliar","otro"];
const TABS = [
  { key:"granos", label:"Libro de Granos", icon:"🌾", color:"#C9A227", img:"/stock-granos.png" },
  { key:"insumos", label:"Insumos", icon:"🧪", color:"#4ADE80", img:"/stock-insumos.png" },
  { key:"gasoil", label:"Gasoil", icon:"⛽", color:"#60A5FA", img:"/stock-gasoil.png" },
  { key:"varios", label:"Stock Varios", icon:"🔧", color:"#A78BFA", img:"/stock-varios.png" },
];
const CAT_INSUMOS = [
  { key:"semilla", label:"Semillas", color:"#4ADE80", icon:"🌱" },
  { key:"fertilizante", label:"Fertilizantes", color:"#C9A227", icon:"💊" },
  { key:"agroquimico", label:"Agroquímicos", color:"#60A5FA", icon:"🧪" },
  { key:"otro", label:"Otros", color:"#A78BFA", icon:"🔧" },
];

type VozEstado = "idle"|"escuchando"|"procesando"|"respondiendo"|"error";

export default function StockPage() {
  const [tab, setTab] = useState<Tab>("granos");
  const [empresaId, setEmpresaId] = useState<string|null>(null);
  const [ubicaciones, setUbicaciones] = useState<UbicacionItem[]>([]);
  const [ventas, setVentas] = useState<VentaPactada[]>([]);
  const [insumos, setInsumos] = useState<InsumoItem[]>([]);
  const [gasoil, setGasoil] = useState<GasoilItem[]>([]);
  const [gasoilMovs, setGasoilMovs] = useState<GasoilMov[]>([]);
  const [varios, setVarios] = useState<VariosItem[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [cultivoActivo, setCultivoActivo] = useState<string|null>(null);
  const [gasoilActivo, setGasoilActivo] = useState<string|null>(null);

  // Forms
  const [showFormUbicacion, setShowFormUbicacion] = useState(false);
  const [showFormVenta, setShowFormVenta] = useState(false);
  const [showFormInsumo, setShowFormInsumo] = useState(false);
  const [showFormGasoil, setShowFormGasoil] = useState(false);
  const [showFormGasoilMov, setShowFormGasoilMov] = useState("");
  const [showFormVarios, setShowFormVarios] = useState(false);
  const [showFormCultivo, setShowFormCultivo] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showProveedores, setShowProveedores] = useState(false);
  const [showFormProveedor, setShowFormProveedor] = useState(false);

  // Edición
  const [editandoUbicacion, setEditandoUbicacion] = useState<string|null>(null);
  const [editandoInsumo, setEditandoInsumo] = useState<string|null>(null);
  const [editandoVarios, setEditandoVarios] = useState<string|null>(null);

  const [form, setForm] = useState<Record<string,string>>({});
  const [importMsg, setImportMsg] = useState("");
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [msgExito, setMsgExito] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  // VOZ
  const [vozEstado, setVozEstado] = useState<VozEstado>("idle");
  const [vozPanel, setVozPanel] = useState(false);
  const [vozTranscripcion, setVozTranscripcion] = useState("");
  const [vozRespuesta, setVozRespuesta] = useState("");
  const [vozInput, setVozInput] = useState("");
  const recRef = useRef<any>(null);

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
    if (!emp) { setLoading(false); return; }
    setEmpresaId(emp.id);
    await fetchAll(emp.id);
    setLoading(false);
  };

  const fetchAll = async (eid: string) => {
    const sb = await getSB();
    const cid = localStorage.getItem("campana_id") ?? "";
    const [ub, vt, ins, gas, gmov, var_, prov] = await Promise.all([
      sb.from("stock_granos_ubicaciones").select("*").eq("empresa_id", eid).eq("campana_id", cid),
      sb.from("stock_ventas_pactadas").select("*").eq("empresa_id", eid).eq("campana_id", cid).eq("estado","pactada"),
      sb.from("stock_insumos").select("*").eq("empresa_id", eid).order("categoria"),
      sb.from("stock_gasoil").select("*").eq("empresa_id", eid),
      sb.from("stock_gasoil_movimientos").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }),
      sb.from("stock_varios").select("*").eq("empresa_id", eid),
      sb.from("contactos").select("*").eq("empresa_id", eid).order("nombre"),
    ]);
    setUbicaciones(ub.data ?? []);
    setVentas(vt.data ?? []);
    setInsumos(ins.data ?? []);
    setGasoil(gas.data ?? []);
    setGasoilMovs(gmov.data ?? []);
    setVarios(var_.data ?? []);
    setProveedores((prov.data ?? []).filter((c: any) => c.categoria === "proveedor_gasoil" || c.categoria === "proveedor_insumo"));
  };

  const cultivosConStock = [...new Set(ubicaciones.map(u => u.cultivo))];

  const stockPorCultivo = (cultivo: string) => {
    const ubs = ubicaciones.filter(u => u.cultivo === cultivo);
    const totalFisico = ubs.reduce((a,u) => a + u.cantidad_tn, 0);
    const totalPactado = ventas.filter(v => v.cultivo === cultivo).reduce((a,v) => a + v.cantidad_tn, 0);
    return { ubs, totalFisico, totalPactado, balance: totalFisico - totalPactado };
  };

  const mostrarMsg = (texto: string) => { setMsgExito(texto); setTimeout(()=>setMsgExito(""), 3000); };

  // ===== VOZ =====
  const hablar = useCallback((texto: string) => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(texto);
    utt.lang = "es-AR"; utt.rate = 1.05; utt.pitch = 1;
    const voces = window.speechSynthesis.getVoices();
    const voz = voces.find(v => v.lang.startsWith("es")) || voces[0];
    if (voz) utt.voice = voz;
    utt.onstart = () => setVozEstado("respondiendo");
    utt.onend = () => setVozEstado("idle");
    window.speechSynthesis.speak(utt);
  }, []);

  const interpretarVoz = useCallback(async (texto: string) => {
    setVozEstado("procesando");
    const totalGasoil = gasoil.reduce((a,g) => a + g.cantidad_litros, 0);
    const resumenStock = [
      `Gasoil total: ${totalGasoil}L`,
      ...cultivosConStock.map(c => { const s = stockPorCultivo(c); return `${c}: ${s.totalFisico}tn físico, ${s.balance}tn disponible`; }),
      ...insumos.slice(0,6).map(i => `${i.nombre}: ${i.cantidad}${i.unidad}`),
    ].join("; ");

    try {
      const res = await fetch("/api/scanner", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 500,
          messages: [{ role: "user", content: `Asistente de stock agropecuario AgroGestión Pro. Stock actual: ${resumenStock}. El productor dijo: "${texto}". Respondé SOLO en JSON sin markdown: {"texto":"respuesta breve en español argentino máx 2 oraciones","accion":"consulta|cargar_gasoil|consumir_gasoil|ajustar_gasoil|cargar_insumo|descontar_insumo|cargar_grano|cargar_varios","datos":{campos relevantes o null}}` }]
        })
      });
      const data = await res.json();
      const raw = (data.content?.[0]?.text ?? "{}").replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(raw);
      setVozRespuesta(parsed.texto ?? "");
      hablar(parsed.texto ?? "");

      // Ejecutar acción automáticamente
      if (parsed.accion === "consumir_gasoil" && parsed.datos?.litros && empresaId) {
        const tanque = gasoil[0];
        if (tanque) {
          const sb = await getSB();
          const nuevaCant = Math.max(0, tanque.cantidad_litros - Number(parsed.datos.litros));
          await sb.from("stock_gasoil").update({ cantidad_litros: nuevaCant }).eq("id", tanque.id);
          await sb.from("stock_gasoil_movimientos").insert({
            empresa_id: empresaId, gasoil_id: tanque.id,
            fecha: new Date().toISOString().split("T")[0],
            tipo: "consumo", litros: Number(parsed.datos.litros),
            descripcion: parsed.datos.descripcion ?? texto, metodo: "voz",
          });
          await fetchAll(empresaId);
        }
      } else if (parsed.accion === "descontar_insumo" && parsed.datos?.nombre && empresaId) {
        const insumo = insumos.find(i => i.nombre.toLowerCase().includes(parsed.datos.nombre.toLowerCase()));
        if (insumo) {
          const sb = await getSB();
          const nuevaCant = Math.max(0, insumo.cantidad - Number(parsed.datos.cantidad ?? 0));
          await sb.from("stock_insumos").update({ cantidad: nuevaCant }).eq("id", insumo.id);
          await fetchAll(empresaId);
        }
      } else if (parsed.accion === "cargar_gasoil" && parsed.datos) {
        setTab("gasoil");
        setForm({ cantidad_litros: String(parsed.datos.litros ?? parsed.datos.cantidad_litros ?? ""), tipo_ubicacion: "tanque_propio", ubicacion: parsed.datos.ubicacion ?? "" });
        setShowFormGasoil(true);
      } else if (parsed.accion === "cargar_insumo" && parsed.datos) {
        setTab("insumos");
        setForm({ nombre: parsed.datos.nombre ?? "", categoria: parsed.datos.categoria ?? "agroquimico", cantidad: String(parsed.datos.cantidad ?? ""), unidad: parsed.datos.unidad ?? "litros" });
        setShowFormInsumo(true);
      } else if (parsed.accion === "cargar_grano" && parsed.datos) {
        setTab("granos");
        setForm({ cultivo: parsed.datos.cultivo ?? "", cantidad_tn: String(parsed.datos.cantidad_tn ?? ""), tipo_ubicacion: parsed.datos.tipo_ubicacion ?? "silo" });
        setShowFormCultivo(true);
      }
      setVozEstado("respondiendo");
    } catch {
      const err = "No pude interpretar. Intentá de nuevo.";
      setVozRespuesta(err); hablar(err);
      setVozEstado("error");
      setTimeout(() => setVozEstado("idle"), 2000);
    }
  }, [gasoil, insumos, cultivosConStock, empresaId, hablar]);

  const escucharVoz = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Usá Chrome para reconocimiento de voz"); return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR(); rec.lang = "es-AR"; rec.continuous = false;
    recRef.current = rec;
    setVozEstado("escuchando"); setVozRespuesta(""); setVozPanel(true);
    rec.onresult = (e: any) => { const t = e.results[0][0].transcript; setVozTranscripcion(t); interpretarVoz(t); };
    rec.onerror = () => { setVozEstado("error"); setTimeout(() => setVozEstado("idle"), 2000); };
    rec.start();
  };

  const VOZ_COLOR: Record<VozEstado,string> = { idle:"#00FF80", escuchando:"#F87171", procesando:"#C9A227", respondiendo:"#60A5FA", error:"#F87171" };
  const VOZ_ICON: Record<VozEstado,string> = { idle:"🎤", escuchando:"🔴", procesando:"⚙️", respondiendo:"🔊", error:"❌" };
  const VOZ_LABEL: Record<VozEstado,string> = { idle:"Hablar", escuchando:"Escuchando...", procesando:"Procesando...", respondiendo:"Respondiendo...", error:"Error" };

  // ===== CRUD =====
  const guardarUbicacion = async () => {
    if (!empresaId || !form.cultivo) return;
    const sb = await getSB();
    const cid = localStorage.getItem("campana_id") ?? "";
    if (editandoUbicacion) {
      await sb.from("stock_granos_ubicaciones").update({
        tipo_ubicacion: form.tipo_ubicacion ?? "silo",
        nombre_ubicacion: form.nombre_ubicacion ?? "",
        cantidad_tn: Number(form.cantidad_tn ?? 0),
      }).eq("id", editandoUbicacion);
      setEditandoUbicacion(null);
    } else {
      await sb.from("stock_granos_ubicaciones").insert({
        empresa_id: empresaId, campana_id: cid, cultivo: form.cultivo,
        tipo_ubicacion: form.tipo_ubicacion ?? "silo",
        nombre_ubicacion: form.nombre_ubicacion ?? "",
        cantidad_tn: Number(form.cantidad_tn ?? 0),
      });
    }
    mostrarMsg("✅ Stock guardado");
    await fetchAll(empresaId); setShowFormUbicacion(false); setShowFormCultivo(false); setForm({});
  };

  const guardarVenta = async () => {
    if (!empresaId || !form.cultivo) return;
    const sb = await getSB();
    const cid = localStorage.getItem("campana_id") ?? "";
    await sb.from("stock_ventas_pactadas").insert({
      empresa_id: empresaId, campana_id: cid, cultivo: form.cultivo,
      cantidad_tn: Number(form.cantidad_tn ?? 0), precio_tn: Number(form.precio_tn ?? 0),
      destino: form.destino ?? "", tipo_destino: form.tipo_destino ?? "cooperativa",
      fecha_entrega: form.fecha_entrega || null, estado: "pactada",
    });
    mostrarMsg("✅ Venta pactada"); await fetchAll(empresaId); setShowFormVenta(false); setForm({});
  };

  const guardarInsumo = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    if (editandoInsumo) {
      await sb.from("stock_insumos").update({
        nombre: form.nombre, categoria: form.categoria ?? "agroquimico",
        subcategoria: form.subcategoria ?? "", cantidad: Number(form.cantidad ?? 0),
        unidad: form.unidad ?? "litros", ubicacion: form.ubicacion ?? "",
        tipo_ubicacion: form.tipo_ubicacion ?? "deposito_propio",
        precio_unitario: Number(form.precio_unitario ?? 0),
      }).eq("id", editandoInsumo);
      setEditandoInsumo(null);
    } else {
      await sb.from("stock_insumos").insert({
        empresa_id: empresaId, nombre: form.nombre, categoria: form.categoria ?? "agroquimico",
        subcategoria: form.subcategoria ?? "", cantidad: Number(form.cantidad ?? 0),
        unidad: form.unidad ?? "litros", ubicacion: form.ubicacion ?? "",
        tipo_ubicacion: form.tipo_ubicacion ?? "deposito_propio",
        precio_unitario: Number(form.precio_unitario ?? 0),
      });
    }
    mostrarMsg("✅ Insumo guardado"); await fetchAll(empresaId); setShowFormInsumo(false); setForm({});
  };

  const descontarInsumo = async (id: string, cantDescontar: number) => {
    const sb = await getSB();
    const ins = insumos.find(i => i.id === id);
    if (!ins) return;
    const nueva = Math.max(0, ins.cantidad - cantDescontar);
    await sb.from("stock_insumos").update({ cantidad: nueva }).eq("id", id);
    mostrarMsg(`✅ Descontado ${cantDescontar} ${ins.unidad} de ${ins.nombre}`);
    if (empresaId) await fetchAll(empresaId);
  };

  const guardarGasoil = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const litros = Number(form.cantidad_litros ?? 0);
    const { data: nuevo } = await sb.from("stock_gasoil").insert({
      empresa_id: empresaId, cantidad_litros: litros,
      ubicacion: form.ubicacion ?? "", tipo_ubicacion: form.tipo_ubicacion ?? "tanque_propio",
      precio_litro: Number(form.precio_litro ?? 0),
    }).select().single();
    if (nuevo) {
      await sb.from("stock_gasoil_movimientos").insert({
        empresa_id: empresaId, gasoil_id: nuevo.id,
        fecha: new Date().toISOString().split("T")[0],
        tipo: "carga", litros, descripcion: "Carga inicial", metodo: "manual",
      });
    }
    mostrarMsg("✅ Gasoil cargado"); await fetchAll(empresaId); setShowFormGasoil(false); setForm({});
  };

  const registrarMovGasoil = async (gasoilId: string, tipo: "carga"|"consumo"|"ajuste") => {
    if (!empresaId) return;
    const sb = await getSB();
    const litros = Number(form.litros_mov ?? 0);
    const tanque = gasoil.find(g => g.id === gasoilId);
    if (!tanque) return;
    const nueva = tipo === "carga"
      ? tanque.cantidad_litros + litros
      : Math.max(0, tanque.cantidad_litros - litros);
    await sb.from("stock_gasoil").update({ cantidad_litros: nueva }).eq("id", gasoilId);
    await sb.from("stock_gasoil_movimientos").insert({
      empresa_id: empresaId, gasoil_id: gasoilId,
      fecha: form.fecha_mov ?? new Date().toISOString().split("T")[0],
      tipo, litros, descripcion: form.descripcion_mov ?? "", metodo: "manual",
    });
    mostrarMsg(`✅ ${tipo === "carga" ? "Carga" : "Consumo"} registrado`);
    await fetchAll(empresaId); setShowFormGasoilMov(""); setForm({});
  };

  const guardarVarios = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    if (editandoVarios) {
      await sb.from("stock_varios").update({
        nombre: form.nombre, categoria: form.categoria ?? "general",
        cantidad: Number(form.cantidad ?? 0), unidad: form.unidad ?? "unidad", ubicacion: form.ubicacion ?? "",
      }).eq("id", editandoVarios);
      setEditandoVarios(null);
    } else {
      await sb.from("stock_varios").insert({
        empresa_id: empresaId, nombre: form.nombre, categoria: form.categoria ?? "general",
        cantidad: Number(form.cantidad ?? 0), unidad: form.unidad ?? "unidad", ubicacion: form.ubicacion ?? "",
      });
    }
    mostrarMsg("✅ Guardado"); await fetchAll(empresaId); setShowFormVarios(false); setForm({});
  };

  const eliminarItem = async (tabla: string, id: string) => {
    if (!confirm("¿Eliminar?")) return;
    const sb = await getSB();
    await sb.from(tabla).delete().eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  const marcarEntregada = async (id: string) => {
    const sb = await getSB();
    await sb.from("stock_ventas_pactadas").update({ estado: "entregada" }).eq("id", id);
    if (empresaId) await fetchAll(empresaId);
  };

  // WhatsApp proveedores
  const enviarWAProveedor = (proveedor: Proveedor, tipo: "gasoil"|"insumo", extra: string = "") => {
    const totalGasoilL = gasoil.reduce((a,g) => a + g.cantidad_litros, 0);
    let msg = "";
    if (tipo === "gasoil") {
      msg = `Hola ${proveedor.nombre}! Necesito cotización de gasoil.\nCantidad estimada: 2000 litros.\nStockactual: ${totalGasoilL}L.\n¿Precio y disponibilidad?`;
    } else {
      msg = `Hola ${proveedor.nombre}! Necesito cotización de insumos.\n${extra}\n¿Precio y disponibilidad?`;
    }
    window.open(`https://wa.me/54${proveedor.telefono.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const enviarWAVenta = (cultivo: string, tipo: "sin_base"|"con_base") => {
    const { balance } = stockPorCultivo(cultivo);
    const vta = ventas.find(v => v.cultivo === cultivo && v.precio_tn > 0);
    const msg = tipo === "sin_base"
      ? `Hola! Tengo ${balance} tn de ${cultivo.toUpperCase()} disponibles. Sin precio base. ¿Oferta?`
      : `Hola! Tengo ${balance} tn de ${cultivo.toUpperCase()} disponibles. Base: $${Number(vta?.precio_tn??0).toLocaleString("es-AR")}/tn. ¿Les interesa?`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  // Import/Export Excel
  const leerExcelGranos = async (file: File) => {
    setImportMsg("Leyendo archivo...");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      if (rows.length < 2) { setImportMsg("Sin datos"); return; }
      const headers = rows[0].map((h: any) => String(h).toLowerCase().trim());
      const ci = headers.findIndex((h: string) => h.includes("cultivo")||h.includes("grano"));
      const ct = headers.findIndex((h: string) => h.includes("tipo")||h.includes("ubic"));
      const cn = headers.findIndex((h: string) => h.includes("nombre")||h.includes("lugar"));
      const cq = headers.findIndex((h: string) => h.includes("tn")||h.includes("ton")||h.includes("cant"));
      if (ci === -1) { setImportMsg("❌ No se encontró columna CULTIVO"); return; }
      const preview = rows.slice(1).filter((r: any) => r[ci]).map((r: any) => ({
        cultivo: String(r[ci]).toLowerCase().trim(),
        tipo_ubicacion: ct >= 0 ? String(r[ct]).toLowerCase().trim() : "silo",
        nombre_ubicacion: cn >= 0 ? String(r[cn]).trim() : "",
        cantidad_tn: Number(r[cq] ?? 0) || 0,
      }));
      setImportPreview(preview);
      setImportMsg(`✅ ${preview.length} registros — confirmá para importar`);
    } catch(e: any) { setImportMsg("❌ " + e.message); }
  };

  const confirmarImport = async () => {
    if (!empresaId || !importPreview.length) return;
    const sb = await getSB();
    const cid = localStorage.getItem("campana_id") ?? "";
    for (const r of importPreview) await sb.from("stock_granos_ubicaciones").insert({ empresa_id: empresaId, campana_id: cid, ...r });
    mostrarMsg(`✅ ${importPreview.length} registros importados`);
    await fetchAll(empresaId); setImportPreview([]); setImportMsg(""); setShowImport(false);
  };

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    // Granos
    if (tab === "granos") {
      const data = cultivosConStock.map(c => {
        const { totalFisico, totalPactado, balance, ubs } = stockPorCultivo(c);
        return { CULTIVO: c.toUpperCase(), "STOCK FISICO (tn)": totalFisico, "VENTAS PACTADAS (tn)": totalPactado, "BALANCE (tn)": balance, UBICACIONES: ubs.map(u=>`${u.tipo_ubicacion}: ${u.cantidad_tn}tn`).join(" | ") };
      });
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [{wch:14},{wch:16},{wch:18},{wch:12},{wch:40}];
      XLSX.utils.book_append_sheet(wb, ws, "Granos");
      XLSX.writeFile(wb, `stock_granos_${new Date().toISOString().slice(0,10)}.xlsx`);
    } else if (tab === "insumos") {
      const data = insumos.map(i => ({ NOMBRE: i.nombre, CATEGORIA: i.categoria, SUBCATEGORIA: i.subcategoria, CANTIDAD: i.cantidad, UNIDAD: i.unidad, "PRECIO UNIT.": i.precio_unitario, UBICACION: `${i.tipo_ubicacion} ${i.ubicacion}`.trim() }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [{wch:22},{wch:14},{wch:14},{wch:10},{wch:8},{wch:12},{wch:20}];
      XLSX.utils.book_append_sheet(wb, ws, "Insumos");
      XLSX.writeFile(wb, `stock_insumos_${new Date().toISOString().slice(0,10)}.xlsx`);
    } else if (tab === "gasoil") {
      const data = gasoilMovs.map(m => ({ FECHA: m.fecha, TIPO: m.tipo, LITROS: m.litros, DESCRIPCION: m.descripcion, METODO: m.metodo }));
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Gasoil");
      XLSX.writeFile(wb, `stock_gasoil_${new Date().toISOString().slice(0,10)}.xlsx`);
    }
  };

  const iCls = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const lCls = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  if (loading) return <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">Cargando inventario...</div>;

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        @keyframes gf{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes wave{0%{transform:scaleY(0.5)}100%{transform:scaleY(1.5)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse-ring{0%{box-shadow:0 0 0 0 rgba(248,113,113,0.4)}100%{box-shadow:0 0 0 12px rgba(248,113,113,0)}}
        .card-s:hover{border-color:rgba(201,162,39,0.5)!important;transform:translateY(-2px)}
        .card-s{transition:all 0.2s ease}
        .tab-on{border-color:#00FF80!important}
        .tab-img-s{transition:all 0.2s ease}
        .tab-img-s:hover{transform:translateY(-2px)}
        .logo-b:hover{filter:drop-shadow(0 0 12px rgba(0,255,128,0.8));transform:scale(1.03)}
        .logo-b{transition:all 0.2s;cursor:pointer}
        .btn-voz-esc{animation:pulse-ring 1s infinite}
      `}</style>

      <div className="absolute inset-0 z-0"><Image src="/dashboard-bg.png" alt="" fill style={{objectFit:"cover"}}/><div className="absolute inset-0 bg-[#020810]/88"/></div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.03]" style={{backgroundImage:`linear-gradient(rgba(0,255,128,1) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,128,1) 1px,transparent 1px)`,backgroundSize:"50px 50px"}}/>

      {/* HEADER */}
      <div className="relative z-10">
        <div className="absolute bottom-0 left-0 right-0 h-[1px]" style={{background:"linear-gradient(90deg,transparent,#00FF80,#00AAFF,#00FF80,transparent)",backgroundSize:"200% 100%",animation:"gf 4s ease infinite"}}/>
        <div className="absolute inset-0" style={{background:"linear-gradient(135deg,rgba(2,8,16,0.95) 0%,rgba(0,20,10,0.90) 50%,rgba(2,8,16,0.95) 100%)"}}/>
        <div className="relative px-6 py-4 flex items-center gap-4">
          <button onClick={()=>cultivoActivo?setCultivoActivo(null):gasoilActivo?setGasoilActivo(null):window.location.href="/productor/dashboard"}
            className="text-[#4B5563] hover:text-[#00FF80] transition-colors font-mono text-sm">
            ← {cultivoActivo||gasoilActivo?"Volver":"Dashboard"}
          </button>
          <div className="flex-1"/>
          {/* Botón voz en header */}
          <button onClick={vozEstado==="escuchando"?(()=>{recRef.current?.stop();setVozEstado("idle");}):(()=>{setVozPanel(true);escucharVoz();})}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono text-sm transition-all ${vozEstado==="escuchando"?"border-red-400 text-red-400 btn-voz-esc":vozEstado==="procesando"?"border-[#C9A227] text-[#C9A227]":vozEstado==="respondiendo"?"border-[#60A5FA] text-[#60A5FA]":"border-[#00FF80]/30 text-[#00FF80] hover:bg-[#00FF80]/10"}`}>
            {VOZ_ICON[vozEstado]} {VOZ_LABEL[vozEstado]}
          </button>
          <div className="logo-b" onClick={()=>window.location.href="/productor/dashboard"}><Image src="/logo.png" alt="Logo" width={110} height={38} className="object-contain"/></div>
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto p-6">

        {/* Mensaje éxito */}
        {msgExito && (
          <div className="mb-4 px-4 py-2 rounded-lg border border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5 text-sm font-mono flex items-center justify-between">
            {msgExito} <button onClick={()=>setMsgExito("")} className="opacity-50 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Title + acciones */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#E5E7EB] font-mono">▣ STOCK</h1>
            <p className="text-[#00FF80] text-xs tracking-widest font-mono mt-1">SISTEMA DE INVENTARIO AGROPECUARIO</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={()=>setShowProveedores(!showProveedores)}
              className="px-4 py-2 rounded-xl border border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/10 font-mono text-sm transition-all">
              💬 Proveedores WA
            </button>
            <button onClick={()=>setShowImport(!showImport)}
              className="px-4 py-2 rounded-xl border border-[#C9A227]/30 text-[#C9A227] hover:bg-[#C9A227]/10 font-mono text-sm transition-all">
              📥 Importar
            </button>
            <button onClick={exportarExcel}
              className="px-4 py-2 rounded-xl border border-[#4ADE80]/30 text-[#4ADE80] hover:bg-[#4ADE80]/10 font-mono text-sm transition-all">
              📤 Exportar
            </button>
          </div>
        </div>

        {/* Panel proveedores WhatsApp */}
        {showProveedores && (
          <div className="bg-[#0a1628]/80 border border-[#25D366]/30 rounded-xl p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#25D366] font-mono text-sm font-bold">💬 PROVEEDORES — COTIZACIÓN POR WHATSAPP</h3>
              <div className="flex gap-2">
                <button onClick={()=>setShowFormProveedor(!showFormProveedor)} className="text-xs text-[#25D366] border border-[#25D366]/30 px-3 py-1.5 rounded-lg font-mono hover:bg-[#25D366]/10">+ Agregar</button>
                <button onClick={()=>setShowProveedores(false)} className="text-[#4B5563] text-sm">✕</button>
              </div>
            </div>
            {showFormProveedor && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 bg-[#020810]/40 rounded-xl">
                <div><label className={lCls}>Nombre</label><input type="text" value={form.prov_nombre??""} onChange={e=>setForm({...form,prov_nombre:e.target.value})} className={iCls} placeholder="Ej: YPF Agro"/></div>
                <div><label className={lCls}>Teléfono WA</label><input type="text" value={form.prov_tel??""} onChange={e=>setForm({...form,prov_tel:e.target.value})} className={iCls} placeholder="3400123456"/></div>
                <div><label className={lCls}>Categoría</label>
                  <select value={form.prov_cat??"proveedor_gasoil"} onChange={e=>setForm({...form,prov_cat:e.target.value})} className={iCls}>
                    <option value="proveedor_gasoil">⛽ Gasoil</option>
                    <option value="proveedor_insumo">🧪 Insumos</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button onClick={async()=>{
                    if (!empresaId||!form.prov_nombre) return;
                    const sb = await getSB();
                    await sb.from("contactos").insert({ empresa_id: empresaId, nombre: form.prov_nombre, telefono: form.prov_tel??"", categoria: form.prov_cat??"proveedor_gasoil", activo: true });
                    mostrarMsg("✅ Proveedor agregado"); await fetchAll(empresaId); setShowFormProveedor(false); setForm({});
                  }} className="w-full bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-bold px-4 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                </div>
              </div>
            )}
            {proveedores.length === 0 ? (
              <p className="text-[#4B5563] font-mono text-sm text-center py-4">Sin proveedores. Agregá uno para cotizar por WhatsApp.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {proveedores.map(p => (
                  <div key={p.id} className="bg-[#020810]/40 rounded-xl p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-[#E5E7EB] font-mono">{p.nombre}</div>
                      <div className="text-xs text-[#4B5563] font-mono">{p.categoria==="proveedor_gasoil"?"⛽ Gasoil":"🧪 Insumos"} · {p.telefono}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={()=>enviarWAProveedor(p, p.categoria==="proveedor_gasoil"?"gasoil":"insumo")}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] text-xs font-mono hover:bg-[#25D366]/20">
                        💬 Cotizar
                      </button>
                      <button onClick={()=>eliminarItem("contactos",p.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Import Excel */}
        {showImport && (
          <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[#C9A227] font-mono text-sm font-bold">📥 IMPORTAR GRANOS DESDE EXCEL</h3>
              <button onClick={()=>{setShowImport(false);setImportPreview([]);setImportMsg("");}} className="text-[#4B5563] text-sm">✕</button>
            </div>
            <p className="text-xs text-[#4B5563] font-mono mb-3">Columnas: <span className="text-[#C9A227]">CULTIVO · TIPO_UBICACION · NOMBRE_LUGAR · TN</span></p>
            <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)leerExcelGranos(f);}}/>
            {importPreview.length===0?(
              <button onClick={()=>importRef.current?.click()} className="flex items-center gap-2 px-4 py-3 border border-dashed border-[#C9A227]/40 rounded-xl text-[#C9A227] font-mono text-sm w-full justify-center hover:border-[#C9A227]/70 transition-all">📁 Seleccionar archivo</button>
            ):(
              <div>
                <div className="max-h-36 overflow-y-auto mb-3 rounded-lg border border-[#C9A227]/15">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-[#C9A227]/10">{["Cultivo","Tipo","Lugar","Tn"].map(h=><th key={h} className="text-left px-3 py-2 text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                    <tbody>{importPreview.map((r,i)=>(
                      <tr key={i} className="border-b border-[#C9A227]/5">
                        <td className="px-3 py-2 text-[#E5E7EB] font-mono font-bold">{r.cultivo}</td>
                        <td className="px-3 py-2 text-[#9CA3AF] font-mono">{r.tipo_ubicacion}</td>
                        <td className="px-3 py-2 text-[#9CA3AF] font-mono">{r.nombre_ubicacion||"—"}</td>
                        <td className="px-3 py-2 text-[#00FF80] font-mono font-bold">{r.cantidad_tn} tn</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div className="flex gap-3">
                  <button onClick={confirmarImport} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-4 py-2 rounded-lg text-xs font-mono hover:bg-[#C9A227]/20">▶ Confirmar {importPreview.length} registros</button>
                  <button onClick={()=>{setImportPreview([]);setImportMsg("");}} className="border border-[#1C2128] text-[#4B5563] px-4 py-2 rounded-lg text-xs font-mono">Cancelar</button>
                </div>
              </div>
            )}
            {importMsg && <p className={`mt-3 text-xs font-mono ${importMsg.startsWith("✅")?"text-[#4ADE80]":"text-[#F87171]"}`}>{importMsg}</p>}
          </div>
        )}

        {/* TABS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {TABS.map(t=>(
            <div key={t.key} className={`tab-img-s cursor-pointer rounded-xl overflow-hidden border-2 ${tab===t.key?"tab-on border-[#00FF80]":"border-transparent"}`} style={{height:"80px",position:"relative"}}
              onClick={()=>{setTab(t.key as Tab);setCultivoActivo(null);setGasoilActivo(null);}}>
              <Image src={t.img} alt={t.label} fill style={{objectFit:"cover"}} onError={(e)=>{(e.target as any).src="/dashboard-bg.png";}}/>
              <div className="absolute inset-0" style={{background:tab===t.key?"rgba(0,255,128,0.15)":"rgba(2,8,16,0.55)"}}/>
              <div className="absolute bottom-0 left-0 right-0 p-2 flex items-center gap-1.5">
                <span>{t.icon}</span><span className="text-xs font-bold font-mono text-white">{t.label}</span>
              </div>
              {tab===t.key&&<div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#00FF80]"/>}
            </div>
          ))}
        </div>

        {/* ===== GRANOS ===== */}
        {tab==="granos" && !cultivoActivo && (
          <div>
            {cultivosConStock.length===0?(
              <div className="text-center py-20 bg-[#0a1628]/60 border border-[#C9A227]/15 rounded-xl">
                <div className="text-5xl mb-4 opacity-20">🌾</div>
                <p className="text-[#4B5563] font-mono mb-4">Sin stock de granos cargado</p>
                <button onClick={()=>setShowFormCultivo(true)} className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm">+ Cargar primer stock</button>
              </div>
            ):(
              <div>
                <div className="flex justify-end mb-4">
                  <button onClick={()=>setShowFormCultivo(true)} className="px-4 py-2 rounded-xl bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-mono text-sm hover:bg-[#C9A227]/20">+ Cargar Stock</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {cultivosConStock.map(cultivo=>{
                    const {ubs,totalFisico,totalPactado,balance}=stockPorCultivo(cultivo);
                    return (
                      <div key={cultivo} className="card-s border border-[#C9A227]/20 rounded-xl overflow-hidden cursor-pointer" onClick={()=>setCultivoActivo(cultivo)}>
                        <div className="relative h-28">
                          <Image src="/stock-granos.png" alt={cultivo} fill style={{objectFit:"cover"}} onError={(e)=>{(e.target as any).src="/dashboard-bg.png";}}/>
                          <div className="absolute inset-0 bg-gradient-to-t from-[#020810] via-[#020810]/40 to-transparent"/>
                          <div className="absolute bottom-2 left-3 flex items-center gap-2">
                            <span className="text-xl">{CULTIVO_ICONS[cultivo]??"🌾"}</span>
                            <span className="font-bold text-white font-mono text-lg uppercase">{cultivo}</span>
                          </div>
                          <div className="absolute top-2 right-2">
                            <span className="text-xs font-bold px-2 py-1 rounded-full font-mono" style={{background:balance>=0?"rgba(74,222,128,0.25)":"rgba(248,113,113,0.25)",color:balance>=0?"#4ADE80":"#F87171"}}>{balance>=0?"+":""}{balance} tn</span>
                          </div>
                        </div>
                        <div className="p-4 bg-[#0a1628]/80">
                          <div className="grid grid-cols-3 gap-2 text-xs font-mono mb-3">
                            <div className="text-center bg-[#020810]/40 rounded-lg p-2"><div className="text-[#4B5563] mb-1">Físico</div><div className="text-[#E5E7EB] font-bold">{totalFisico} tn</div></div>
                            <div className="text-center bg-[#020810]/40 rounded-lg p-2"><div className="text-[#4B5563] mb-1">Pactado</div><div className="text-[#60A5FA] font-bold">{totalPactado} tn</div></div>
                            <div className="text-center bg-[#020810]/40 rounded-lg p-2"><div className="text-[#4B5563] mb-1">Balance</div><div className="font-bold" style={{color:balance>=0?"#4ADE80":"#F87171"}}>{balance} tn</div></div>
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {ubs.map(u=>{const ub=UBICACIONES.find(x=>x.value===u.tipo_ubicacion);return(
                              <div key={u.id} className="flex items-center gap-1 bg-[#020810]/60 rounded-lg px-2 py-1">
                                <span className="text-xs">{ub?.icon??"📍"}</span>
                                <span className="text-xs text-[#9CA3AF] font-mono">{u.cantidad_tn}tn</span>
                              </div>
                            );})}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {showFormCultivo && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mt-4">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">+ CARGAR STOCK DE GRANO</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>Cultivo</label><input type="text" value={form.cultivo??""} onChange={e=>setForm({...form,cultivo:e.target.value.toLowerCase()})} className={iCls} placeholder="soja, maiz, trigo..."/></div>
                  <div><label className={lCls}>Dónde está</label>
                    <select value={form.tipo_ubicacion??"silo"} onChange={e=>setForm({...form,tipo_ubicacion:e.target.value})} className={iCls}>
                      {UBICACIONES.map(u=><option key={u.value} value={u.value}>{u.icon} {u.label}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>Nombre lugar</label><input type="text" value={form.nombre_ubicacion??""} onChange={e=>setForm({...form,nombre_ubicacion:e.target.value})} className={iCls} placeholder="Silo Norte, ACA..."/></div>
                  <div><label className={lCls}>Toneladas</label><input type="number" value={form.cantidad_tn??""} onChange={e=>setForm({...form,cantidad_tn:e.target.value})} className={iCls} placeholder="0"/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarUbicacion} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#C9A227]/20">▶ Guardar</button>
                  <button onClick={()=>{setShowFormCultivo(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* DETALLE CULTIVO */}
        {tab==="granos" && cultivoActivo && (
          <div>
            <div className="relative rounded-2xl overflow-hidden mb-5 h-40">
              <Image src="/stock-granos.png" alt={cultivoActivo} fill style={{objectFit:"cover"}} onError={(e)=>{(e.target as any).src="/dashboard-bg.png";}}/>
              <div className="absolute inset-0 bg-gradient-to-t from-[#020810] via-[#020810]/50 to-transparent"/>
              <div className="absolute bottom-4 left-5 flex items-center gap-3">
                <span className="text-4xl">{CULTIVO_ICONS[cultivoActivo]??"🌾"}</span>
                <div>
                  <h2 className="text-3xl font-bold text-white font-mono uppercase">{cultivoActivo}</h2>
                  {(()=>{const {totalFisico,totalPactado,balance}=stockPorCultivo(cultivoActivo);return(
                    <div className="flex gap-3 text-xs font-mono mt-1">
                      <span className="text-[#E5E7EB]">{totalFisico}tn físico</span>
                      <span className="text-[#60A5FA]">{totalPactado}tn pactado</span>
                      <span style={{color:balance>=0?"#4ADE80":"#F87171"}}>{balance>=0?"+":""}{balance}tn balance</span>
                    </div>
                  );})()}
                </div>
              </div>
              <div className="absolute bottom-4 right-5 flex gap-2">
                <button onClick={()=>{setShowFormUbicacion(true);setForm({cultivo:cultivoActivo});}} className="px-3 py-2 rounded-xl bg-[#C9A227]/20 border border-[#C9A227]/40 text-[#C9A227] font-mono text-xs">+ Stock</button>
                <button onClick={()=>{setShowFormVenta(true);setForm({cultivo:cultivoActivo});}} className="px-3 py-2 rounded-xl bg-[#25D366]/20 border border-[#25D366]/40 text-[#25D366] font-mono text-xs">+ Venta pactada</button>
              </div>
            </div>

            {showFormUbicacion && (
              <div className="bg-[#0a1628]/80 border border-[#C9A227]/30 rounded-xl p-5 mb-4">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">{editandoUbicacion?"✏️ EDITAR":"+"} STOCK {cultivoActivo.toUpperCase()}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={lCls}>Dónde está</label>
                    <select value={form.tipo_ubicacion??"silo"} onChange={e=>setForm({...form,tipo_ubicacion:e.target.value})} className={iCls}>
                      {UBICACIONES.map(u=><option key={u.value} value={u.value}>{u.icon} {u.label}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>Nombre lugar</label><input type="text" value={form.nombre_ubicacion??""} onChange={e=>setForm({...form,nombre_ubicacion:e.target.value})} className={iCls} placeholder="ACA Rafaela..."/></div>
                  <div><label className={lCls}>Toneladas</label><input type="number" value={form.cantidad_tn??""} onChange={e=>setForm({...form,cantidad_tn:e.target.value})} className={iCls} placeholder="0"/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarUbicacion} className="bg-[#C9A227]/10 border border-[#C9A227]/30 text-[#C9A227] font-bold px-5 py-2 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowFormUbicacion(false);setEditandoUbicacion(null);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {showFormVenta && (
              <div className="bg-[#0a1628]/80 border border-[#25D366]/30 rounded-xl p-5 mb-4">
                <h3 className="text-[#25D366] font-mono text-sm font-bold mb-4">+ VENTA PACTADA — {cultivoActivo.toUpperCase()}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={lCls}>Toneladas</label><input type="number" value={form.cantidad_tn??""} onChange={e=>setForm({...form,cantidad_tn:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Precio ($/tn)</label><input type="number" value={form.precio_tn??""} onChange={e=>setForm({...form,precio_tn:e.target.value})} className={iCls} placeholder="0 = sin base"/></div>
                  <div><label className={lCls}>Destino</label><input type="text" value={form.destino??""} onChange={e=>setForm({...form,destino:e.target.value})} className={iCls} placeholder="AFA, Coop..."/></div>
                  <div><label className={lCls}>Tipo destino</label>
                    <select value={form.tipo_destino??"cooperativa"} onChange={e=>setForm({...form,tipo_destino:e.target.value})} className={iCls}>
                      <option value="cooperativa">Cooperativa</option><option value="acopio">Acopio</option>
                      <option value="empresa">Empresa</option><option value="exportador">Exportador</option><option value="otro">Otro</option>
                    </select>
                  </div>
                  <div><label className={lCls}>Fecha entrega</label><input type="date" value={form.fecha_entrega??""} onChange={e=>setForm({...form,fecha_entrega:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarVenta} className="bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-bold px-5 py-2 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowFormVenta(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-5 py-2 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-3">📍 STOCK POR UBICACIÓN</h3>
            {ubicaciones.filter(u=>u.cultivo===cultivoActivo).length===0?<p className="text-[#4B5563] font-mono text-sm mb-4">Sin ubicaciones</p>:(
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {ubicaciones.filter(u=>u.cultivo===cultivoActivo).map(u=>{
                  const ub=UBICACIONES.find(x=>x.value===u.tipo_ubicacion);
                  return (
                    <div key={u.id} className="card-s border border-[#C9A227]/20 rounded-xl overflow-hidden">
                      <div className="relative h-28">
                        <Image src={ub?.img??"/ubicacion-silo.png"} alt="" fill style={{objectFit:"cover"}} onError={(e)=>{(e.target as any).src="/dashboard-bg.png";}}/>
                        <div className="absolute inset-0 bg-gradient-to-t from-[#020810]/90 to-transparent"/>
                        <div className="absolute bottom-2 left-2 right-2">
                          <div className="text-lg font-bold text-white font-mono">{u.cantidad_tn} tn</div>
                          <div className="text-xs text-[#C9A227] font-mono">{ub?.label??u.tipo_ubicacion}</div>
                          {u.nombre_ubicacion&&<div className="text-xs text-[#9CA3AF] font-mono truncate">{u.nombre_ubicacion}</div>}
                        </div>
                      </div>
                      <div className="p-2 bg-[#0a1628]/80 flex justify-between items-center gap-1">
                        <button onClick={()=>{setEditandoUbicacion(u.id);setForm({cultivo:cultivoActivo,tipo_ubicacion:u.tipo_ubicacion,nombre_ubicacion:u.nombre_ubicacion,cantidad_tn:String(u.cantidad_tn)});setShowFormUbicacion(true);}} className="text-xs text-[#C9A227] font-mono hover:underline">✏️</button>
                        <button onClick={()=>eliminarItem("stock_granos_ubicaciones",u.id)} className="text-xs text-[#4B5563] hover:text-red-400 font-mono">✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <h3 className="text-[#25D366] font-mono text-sm font-bold mb-3">💬 VENTAS PACTADAS</h3>
            {ventas.filter(v=>v.cultivo===cultivoActivo).length===0?<p className="text-[#4B5563] font-mono text-sm mb-4">Sin ventas pactadas</p>:(
              <div className="space-y-2 mb-4">
                {ventas.filter(v=>v.cultivo===cultivoActivo).map(v=>(
                  <div key={v.id} className="bg-[#0a1628]/80 border border-[#25D366]/15 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-4">
                      <div className="text-xl font-bold text-[#E5E7EB] font-mono">{v.cantidad_tn} tn</div>
                      <div>
                        <div className="text-sm text-[#25D366] font-mono font-bold">{v.destino||"Sin destino"}</div>
                        <div className="text-xs text-[#4B5563] font-mono">{v.tipo_destino}{v.fecha_entrega?` · ${v.fecha_entrega}`:""}</div>
                      </div>
                      {v.precio_tn>0&&<div className="text-sm text-[#C9A227] font-mono font-bold">${Number(v.precio_tn).toLocaleString("es-AR")}/tn</div>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={()=>marcarEntregada(v.id)} className="text-xs text-[#4ADE80] border border-[#4ADE80]/20 px-3 py-1.5 rounded-lg font-mono hover:bg-[#4ADE80]/10">✓ Entregado</button>
                      <button onClick={()=>eliminarItem("stock_ventas_pactadas",v.id)} className="text-xs text-[#4B5563] hover:text-red-400 font-mono">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={()=>enviarWAVenta(cultivoActivo,"sin_base")} className="flex-1 py-3 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-mono text-sm hover:bg-[#25D366]/20 transition-all">💬 WA Sin base</button>
              <button onClick={()=>enviarWAVenta(cultivoActivo,"con_base")} className="flex-1 py-3 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-mono text-sm hover:bg-[#25D366]/20 transition-all">💬 WA Con base</button>
            </div>
          </div>
        )}

        {/* ===== INSUMOS ===== */}
        {tab==="insumos" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={()=>{setShowFormInsumo(!showFormInsumo);setEditandoInsumo(null);setForm({categoria:"agroquimico"});}} className="px-4 py-2 rounded-xl bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-mono text-sm hover:bg-[#4ADE80]/20">+ Cargar Insumo</button>
            </div>
            {showFormInsumo && (
              <div className="bg-[#0a1628]/80 border border-[#4ADE80]/30 rounded-xl p-5 mb-5">
                <h3 className="text-[#4ADE80] font-mono text-sm font-bold mb-4">{editandoInsumo?"✏️ EDITAR":"+"} INSUMO</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} placeholder="Ej: Glifosato 48%"/></div>
                  <div><label className={lCls}>Categoría</label>
                    <select value={form.categoria??"agroquimico"} onChange={e=>setForm({...form,categoria:e.target.value,subcategoria:""})} className={iCls}>
                      {CAT_INSUMOS.map(c=><option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                    </select>
                  </div>
                  {form.categoria==="agroquimico"&&(
                    <div><label className={lCls}>Subcategoría</label>
                      <select value={form.subcategoria??""} onChange={e=>setForm({...form,subcategoria:e.target.value})} className={iCls}>
                        <option value="">Seleccionar</option>
                        {SUBCATS_AGRO.map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                  <div><label className={lCls}>Cantidad</label><input type="number" value={form.cantidad??""} onChange={e=>setForm({...form,cantidad:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Unidad</label>
                    <select value={form.unidad??"litros"} onChange={e=>setForm({...form,unidad:e.target.value})} className={iCls}>
                      <option value="litros">Litros</option><option value="kg">kg</option><option value="bolsas">Bolsas</option><option value="unidad">Unidad</option>
                    </select>
                  </div>
                  <div><label className={lCls}>Precio unitario</label><input type="number" value={form.precio_unitario??""} onChange={e=>setForm({...form,precio_unitario:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Dónde está</label>
                    <select value={form.tipo_ubicacion??"deposito_propio"} onChange={e=>setForm({...form,tipo_ubicacion:e.target.value})} className={iCls}>
                      <option value="deposito_propio">Depósito Propio</option><option value="comercio">Comercio</option><option value="cooperativa">Cooperativa</option>
                    </select>
                  </div>
                  <div><label className={lCls}>Nombre lugar</label><input type="text" value={form.ubicacion??""} onChange={e=>setForm({...form,ubicacion:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarInsumo} className="bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowFormInsumo(false);setEditandoInsumo(null);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            {CAT_INSUMOS.map(cat=>{
              const items=insumos.filter(i=>i.categoria===cat.key);
              if(items.length===0) return null;
              const renderTabla=(its:InsumoItem[],titulo?:string)=>(
                <div key={titulo||cat.key} className={titulo?"mb-3":""}>
                  {titulo&&<div className="text-xs text-[#4B5563] uppercase tracking-widest font-mono mb-1.5 px-1">— {titulo}</div>}
                  <div className="bg-[#0a1628]/80 border rounded-xl overflow-hidden" style={{borderColor:cat.color+"25"}}>
                    <table className="w-full">
                      <thead><tr className="border-b" style={{borderColor:cat.color+"15"}}>{["Producto","Cantidad","Precio","Ubicación",""].map(h=><th key={h} className="text-left px-4 py-2 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                      <tbody>{its.map(i=>(
                        <tr key={i.id} className="border-b hover:bg-white/5" style={{borderColor:cat.color+"10"}}>
                          <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono font-bold">{i.nombre}</td>
                          <td className="px-4 py-3 text-sm font-mono font-bold" style={{color:cat.color}}>{i.cantidad} {i.unidad}</td>
                          <td className="px-4 py-3 text-xs text-[#C9A227] font-mono">{i.precio_unitario>0?`$${i.precio_unitario}/${i.unidad}`:"-"}</td>
                          <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{i.tipo_ubicacion?.replace("_"," ")}{i.ubicacion?` · ${i.ubicacion}`:""}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button onClick={()=>{setEditandoInsumo(i.id);setForm({nombre:i.nombre,categoria:i.categoria,subcategoria:i.subcategoria??"",cantidad:String(i.cantidad),unidad:i.unidad,ubicacion:i.ubicacion,tipo_ubicacion:i.tipo_ubicacion,precio_unitario:String(i.precio_unitario)});setShowFormInsumo(true);}} className="text-xs text-[#C9A227] font-mono hover:underline">✏️</button>
                              <button onClick={()=>{const cant=prompt(`Descontar cantidad (${i.unidad}):`);if(cant&&Number(cant)>0)descontarInsumo(i.id,Number(cant));}} className="text-xs text-[#60A5FA] font-mono hover:underline" title="Descontar uso">➖</button>
                              <button onClick={()=>eliminarItem("stock_insumos",i.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                            </div>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              );
              if(cat.key==="agroquimico"){
                const subgrupos=SUBCATS_AGRO.reduce((acc,sub)=>{
                  const filtered=items.filter(i=>i.subcategoria===sub||(!i.subcategoria&&sub==="otro"));
                  if(filtered.length>0) acc[sub]=filtered;
                  return acc;
                },{} as Record<string,InsumoItem[]>);
                return (
                  <div key={cat.key} className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">{cat.icon}</span>
                      <h3 className="font-bold font-mono" style={{color:cat.color}}>{cat.label}</h3>
                      <span className="text-xs text-[#4B5563] font-mono">{items.length} productos</span>
                    </div>
                    {Object.entries(subgrupos).map(([sub,subItems])=>renderTabla(subItems,sub))}
                  </div>
                );
              }
              return (
                <div key={cat.key} className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{cat.icon}</span>
                    <h3 className="font-bold font-mono" style={{color:cat.color}}>{cat.label}</h3>
                    <span className="text-xs text-[#4B5563] font-mono">{items.length} productos</span>
                  </div>
                  {renderTabla(items)}
                </div>
              );
            })}
            {insumos.length===0&&!showFormInsumo&&<div className="text-center py-16 text-[#4B5563] font-mono bg-[#0a1628]/60 border border-[#4ADE80]/15 rounded-xl">Sin insumos registrados</div>}
          </div>
        )}

        {/* ===== GASOIL ===== */}
        {tab==="gasoil" && (
          <div>
            <div className="flex justify-end mb-4 gap-2">
              <button onClick={()=>setShowFormGasoil(!showFormGasoil)} className="px-4 py-2 rounded-xl bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-mono text-sm hover:bg-[#60A5FA]/20">+ Nuevo Tanque</button>
            </div>
            {showFormGasoil && (
              <div className="bg-[#0a1628]/80 border border-[#60A5FA]/30 rounded-xl p-5 mb-5">
                <h3 className="text-[#60A5FA] font-mono text-sm font-bold mb-4">+ NUEVO TANQUE / STOCK GASOIL</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>Litros iniciales</label><input type="number" value={form.cantidad_litros??""} onChange={e=>setForm({...form,cantidad_litros:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Tipo</label>
                    <select value={form.tipo_ubicacion??"tanque_propio"} onChange={e=>setForm({...form,tipo_ubicacion:e.target.value})} className={iCls}>
                      <option value="tanque_propio">Tanque Propio</option><option value="proveedor">En Proveedor</option>
                    </select>
                  </div>
                  <div><label className={lCls}>Nombre lugar</label><input type="text" value={form.ubicacion??""} onChange={e=>setForm({...form,ubicacion:e.target.value})} className={iCls} placeholder="YPF Ruta 34"/></div>
                  <div><label className={lCls}>Precio/litro</label><input type="number" value={form.precio_litro??""} onChange={e=>setForm({...form,precio_litro:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarGasoil} className="bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowFormGasoil(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}

            {gasoil.length===0?<div className="text-center py-16 text-[#4B5563] font-mono bg-[#0a1628]/80 border border-[#60A5FA]/15 rounded-xl">Sin stock de gasoil</div>:(
              <div className="space-y-4">
                {gasoil.map(g=>{
                  const movsDeTanque = gasoilMovs.filter(m => m.gasoil_id === g.id);
                  const isActivo = gasoilActivo === g.id;
                  return (
                    <div key={g.id} className="card-s bg-[#0a1628]/80 border border-[#60A5FA]/20 rounded-xl overflow-hidden">
                      <div className="relative h-28">
                        <Image src="/stock-gasoil.png" alt="gasoil" fill style={{objectFit:"cover"}} onError={(e)=>{(e.target as any).src="/dashboard-bg.png";}}/>
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628] to-transparent"/>
                        <div className="absolute bottom-3 left-4">
                          <div className="text-2xl font-bold text-white font-mono">{g.cantidad_litros.toLocaleString("es-AR")} L</div>
                          <div className="text-xs text-[#60A5FA] font-mono">{g.tipo_ubicacion?.replace("_"," ")}{g.ubicacion?` · ${g.ubicacion}`:""}</div>
                        </div>
                        <div className="absolute top-2 right-2 flex gap-2">
                          <button onClick={()=>setGasoilActivo(isActivo?null:g.id)} className="px-2 py-1 rounded-lg bg-[#60A5FA]/20 border border-[#60A5FA]/40 text-[#60A5FA] text-xs font-mono">{isActivo?"▲":"▼ Historial"}</button>
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[#C9A227] font-mono font-bold">${g.precio_litro}/L · Total: ${(g.cantidad_litros*g.precio_litro).toLocaleString("es-AR")}</span>
                          <button onClick={()=>eliminarItem("stock_gasoil",g.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                        </div>
                        {/* Botones carga/consumo */}
                        <div className="flex gap-2 mb-3">
                          <button onClick={()=>{setShowFormGasoilMov(g.id+"_carga");setForm({fecha_mov:new Date().toISOString().split("T")[0]});}}
                            className="flex-1 py-2 rounded-lg bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] text-xs font-mono hover:bg-[#4ADE80]/20">
                            ⬆️ Registrar carga
                          </button>
                          <button onClick={()=>{setShowFormGasoilMov(g.id+"_consumo");setForm({fecha_mov:new Date().toISOString().split("T")[0]});}}
                            className="flex-1 py-2 rounded-lg bg-[#F87171]/10 border border-[#F87171]/30 text-[#F87171] text-xs font-mono hover:bg-[#F87171]/20">
                            ⬇️ Registrar consumo
                          </button>
                          {/* WA proveedores gasoil */}
                          {proveedores.filter(p=>p.categoria==="proveedor_gasoil").length > 0 && (
                            <button onClick={()=>{const p=proveedores.find(x=>x.categoria==="proveedor_gasoil");if(p)enviarWAProveedor(p,"gasoil");}}
                              className="px-3 py-2 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] text-xs font-mono hover:bg-[#25D366]/20">
                              💬 Cotizar
                            </button>
                          )}
                        </div>

                        {/* Form movimiento gasoil */}
                        {(showFormGasoilMov === g.id+"_carga" || showFormGasoilMov === g.id+"_consumo") && (
                          <div className="bg-[#020810]/60 rounded-xl p-3 mb-3 border border-[#60A5FA]/20">
                            <h4 className="text-[#60A5FA] font-mono text-xs font-bold mb-3">
                              {showFormGasoilMov.endsWith("_carga")?"⬆️ CARGAR GASOIL":"⬇️ REGISTRAR CONSUMO"}
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                              <div><label className={lCls}>Litros</label><input type="number" value={form.litros_mov??""} onChange={e=>setForm({...form,litros_mov:e.target.value})} className={iCls}/></div>
                              <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_mov??""} onChange={e=>setForm({...form,fecha_mov:e.target.value})} className={iCls}/></div>
                              <div><label className={lCls}>Descripción</label><input type="text" value={form.descripcion_mov??""} onChange={e=>setForm({...form,descripcion_mov:e.target.value})} className={iCls} placeholder="Ej: Cosecha, tractor..."/></div>
                            </div>
                            <div className="flex gap-2 mt-3">
                              <button onClick={()=>registrarMovGasoil(g.id,showFormGasoilMov.endsWith("_carga")?"carga":"consumo")}
                                className="bg-[#60A5FA]/10 border border-[#60A5FA]/30 text-[#60A5FA] font-bold px-4 py-2 rounded-lg text-xs font-mono">▶ Guardar</button>
                              <button onClick={()=>{setShowFormGasoilMov("");setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-4 py-2 rounded-lg text-xs font-mono">Cancelar</button>
                            </div>
                          </div>
                        )}

                        {/* Historial movimientos */}
                        {isActivo && movsDeTanque.length > 0 && (
                          <div className="border-t border-[#60A5FA]/15 pt-3">
                            <div className="text-xs text-[#60A5FA] font-mono font-bold mb-2">HISTORIAL DE MOVIMIENTOS</div>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto">
                              {movsDeTanque.map(m=>(
                                <div key={m.id} className="flex items-center justify-between bg-[#020810]/40 rounded-lg px-3 py-2">
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs" style={{color:m.tipo==="carga"?"#4ADE80":"#F87171"}}>{m.tipo==="carga"?"⬆️":"⬇️"}</span>
                                    <span className="text-xs text-[#9CA3AF] font-mono">{m.fecha}</span>
                                    {m.descripcion&&<span className="text-xs text-[#4B5563] font-mono">{m.descripcion}</span>}
                                    {m.metodo==="voz"&&<span className="text-xs text-[#A78BFA] font-mono">🎤</span>}
                                  </div>
                                  <span className="text-sm font-bold font-mono" style={{color:m.tipo==="carga"?"#4ADE80":"#F87171"}}>{m.tipo==="carga"?"+":"-"}{m.litros}L</span>
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
          </div>
        )}

        {/* ===== VARIOS ===== */}
        {tab==="varios" && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={()=>{setShowFormVarios(!showFormVarios);setEditandoVarios(null);setForm({});}} className="px-4 py-2 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-mono text-sm hover:bg-[#A78BFA]/20">+ Cargar Item</button>
            </div>
            {showFormVarios && (
              <div className="bg-[#0a1628]/80 border border-[#A78BFA]/30 rounded-xl p-5 mb-5">
                <h3 className="text-[#A78BFA] font-mono text-sm font-bold mb-4">{editandoVarios?"✏️ EDITAR":"+"} ITEM</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Categoría</label><input type="text" value={form.categoria??""} onChange={e=>setForm({...form,categoria:e.target.value})} className={iCls} placeholder="Repuesto, herramienta..."/></div>
                  <div><label className={lCls}>Cantidad</label><input type="number" value={form.cantidad??""} onChange={e=>setForm({...form,cantidad:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>Unidad</label><input type="text" value={form.unidad??""} onChange={e=>setForm({...form,unidad:e.target.value})} className={iCls} placeholder="kg, unidad, m..."/></div>
                  <div><label className={lCls}>Ubicación</label><input type="text" value={form.ubicacion??""} onChange={e=>setForm({...form,ubicacion:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarVarios} className="bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] font-bold px-6 py-2.5 rounded-xl text-sm font-mono">▶ Guardar</button>
                  <button onClick={()=>{setShowFormVarios(false);setEditandoVarios(null);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">Cancelar</button>
                </div>
              </div>
            )}
            <div className="bg-[#0a1628]/80 border border-[#A78BFA]/15 rounded-xl overflow-hidden">
              {varios.length===0?<div className="text-center py-16 text-[#4B5563] font-mono">Sin items registrados</div>:(
                <table className="w-full">
                  <thead><tr className="border-b border-[#A78BFA]/10">{["Producto","Categoría","Cantidad","Ubicación",""].map(h=><th key={h} className="text-left px-5 py-3 text-xs text-[#4B5563] uppercase font-mono">{h}</th>)}</tr></thead>
                  <tbody>{varios.map(v=>(
                    <tr key={v.id} className="border-b border-[#A78BFA]/5 hover:bg-[#A78BFA]/5">
                      <td className="px-5 py-3 text-sm text-[#E5E7EB] font-mono font-bold">{v.nombre}</td>
                      <td className="px-5 py-3"><span className="text-xs bg-[#A78BFA]/10 text-[#A78BFA] px-2 py-1 rounded font-mono">{v.categoria}</span></td>
                      <td className="px-5 py-3 text-sm text-[#00FF80] font-mono font-bold">{v.cantidad} {v.unidad}</td>
                      <td className="px-5 py-3 text-xs text-[#9CA3AF] font-mono">{v.ubicacion||"—"}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={()=>{setEditandoVarios(v.id);setForm({nombre:v.nombre,categoria:v.categoria,cantidad:String(v.cantidad),unidad:v.unidad,ubicacion:v.ubicacion});setShowFormVarios(true);}} className="text-xs text-[#C9A227] font-mono hover:underline">✏️</button>
                          <button onClick={()=>eliminarItem("stock_varios",v.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== PANEL VOZ FLOTANTE ===== */}
      {vozPanel && (
        <div className="fixed bottom-44 right-6 z-50 w-80 bg-[#0a1628]/97 border border-[#00FF80]/30 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#00FF80]/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{background:VOZ_COLOR[vozEstado],animation:vozEstado==="escuchando"?"pulse 1s infinite":"none"}}/>
              <span className="text-[#00FF80] text-xs font-mono font-bold">🎤 ASISTENTE DE STOCK</span>
            </div>
            <button onClick={()=>{setVozPanel(false);window.speechSynthesis?.cancel();recRef.current?.stop();setVozEstado("idle");}} className="text-[#4B5563] hover:text-white text-sm">✕</button>
          </div>

          <div className="px-4 pt-3 pb-2 min-h-24">
            {vozEstado==="escuchando"&&(
              <div className="flex items-center gap-3 py-3">
                <div className="flex gap-1 items-end h-8">
                  {[1,2,3,4,5].map(i=><div key={i} className="w-1.5 rounded-full bg-[#F87171]" style={{height:`${10+i*5}px`,animation:`wave ${0.3+i*0.1}s ease-in-out infinite alternate`}}/>)}
                </div>
                <span className="text-[#F87171] text-sm font-mono">Escuchando...</span>
              </div>
            )}
            {vozEstado==="procesando"&&(
              <div className="flex items-center gap-3 py-3">
                <div className="w-5 h-5 border-2 border-[#C9A227] border-t-transparent rounded-full" style={{animation:"spin 0.8s linear infinite"}}/>
                <div>
                  <p className="text-[#C9A227] text-xs font-mono">Procesando...</p>
                  {vozTranscripcion&&<p className="text-[#4B5563] text-xs font-mono italic mt-0.5">"{vozTranscripcion}"</p>}
                </div>
              </div>
            )}
            {vozTranscripcion && vozEstado!=="escuchando" && vozEstado!=="procesando" && (
              <div className="bg-[#020810]/60 rounded-lg px-3 py-2 mb-2">
                <p className="text-[#4B5563] text-xs font-mono">Dijiste:</p>
                <p className="text-[#9CA3AF] text-xs font-mono italic">"{vozTranscripcion}"</p>
              </div>
            )}
            {vozRespuesta&&(
              <div className="bg-[#00FF80]/8 border border-[#00FF80]/20 rounded-lg px-3 py-2 mb-2">
                <p className="text-[#E5E7EB] text-sm font-mono leading-relaxed">{vozRespuesta}</p>
              </div>
            )}
            {!vozRespuesta && !vozTranscripcion && vozEstado==="idle" && (
              <div className="space-y-1 py-1">
                {["¿Cuánto gasoil tengo?","¿Qué insumos me quedan?","¿Cuánto stock de soja tengo disponible?","Usé 200 litros de gasoil hoy"].map(q=>(
                  <button key={q} onClick={()=>{setVozTranscripcion(q);interpretarVoz(q);}} className="w-full text-left text-xs text-[#4B6B5B] hover:text-[#00FF80] border border-[#00FF80]/10 hover:border-[#00FF80]/30 px-3 py-2 rounded-lg font-mono transition-all">💬 {q}</button>
                ))}
              </div>
            )}
          </div>

          <div className="px-3 pb-3 flex gap-2 border-t border-[#00FF80]/10 pt-3">
            <input value={vozInput} onChange={e=>setVozInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}}}
              placeholder="Escribí o hablá..." className="flex-1 bg-[#020810]/80 border border-[#00FF80]/20 rounded-lg px-3 py-2 text-[#E5E7EB] text-xs font-mono focus:outline-none focus:border-[#00FF80]"/>
            <button onClick={()=>{if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else escucharVoz();}}
              className="px-3 py-2 rounded-lg text-sm transition-all font-mono font-bold" style={{background:VOZ_COLOR[vozEstado]+"20",border:`1px solid ${VOZ_COLOR[vozEstado]}`,color:VOZ_COLOR[vozEstado]}}>
              {VOZ_ICON[vozEstado]}
            </button>
            {vozInput&&<button onClick={()=>{setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}} className="px-3 py-2 rounded-lg bg-[#00FF80]/10 border border-[#00FF80]/30 text-[#00FF80] text-xs font-mono">▶</button>}
          </div>
        </div>
      )}

      {/* Botón flotante voz */}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
        className="fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-lg transition-all"
        style={{background:VOZ_COLOR[vozEstado]+"18",border:`2px solid ${VOZ_COLOR[vozEstado]}`,color:VOZ_COLOR[vozEstado],animation:vozEstado==="idle"?"float 3s ease-in-out infinite":vozEstado==="escuchando"?"pulse-ring 1s infinite":"none"}}>
        {VOZ_ICON[vozEstado]}
      </button>

      <p className="relative z-10 text-center text-[#0a2a1a] text-xs pb-4 tracking-[0.3em] font-mono mt-6">© AGROGESTION PRO · STOCK</p>
      {empresaId && <EscanerIA empresaId={empresaId}/>}
    </div>
  );
}
