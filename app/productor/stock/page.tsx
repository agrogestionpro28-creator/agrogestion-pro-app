"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import EscanerIA from "@/components/EscanerIA";

type Tab = "granos" | "insumos" | "gasoil" | "varios";
type UbicacionItem = { id: string; cultivo: string; tipo_ubicacion: string; nombre_ubicacion: string; cantidad_tn: number; campana_id: string; };
type VentaPactada = { id: string; cultivo: string; cantidad_tn: number; precio_tn: number; destino: string; tipo_destino: string; fecha_entrega: string; estado: string; };
type InsumoItem = { id: string; nombre: string; categoria: string; subcategoria: string; cantidad: number; unidad: string; ubicacion: string; tipo_ubicacion: string; precio_unitario: number; precio_ppp: number; costo_total_stock: number; };
type GasoilItem = { id: string; cantidad_litros: number; ubicacion: string; tipo_ubicacion: string; precio_litro: number; precio_ppp: number; costo_total_stock: number; };
type GasoilMov = { id: string; gasoil_id: string; fecha: string; tipo: string; litros: number; descripcion: string; metodo: string; precio_litro: number; precio_ppp: number; };
type VariosItem = { id: string; nombre: string; categoria: string; cantidad: number; unidad: string; ubicacion: string; };
type Proveedor = { id: string; nombre: string; telefono: string; categoria: string; };

const UBICACIONES = [
  { value:"silo", label:"Silo", icon:"🏗️", img:"/ubicacion-silo.png" },
  { value:"silobolsa", label:"Silo Bolsa", icon:"🎒", img:"/ubicacion-silobolsa.png" },
  { value:"campo", label:"En Campo", icon:"🌾", img:"/ubicacion-campo.png" },
  { value:"coop", label:"Empresa/Coop", icon:"🏢", img:"/ubicacion-coop.png" },
];
const CULTIVO_ICONS: Record<string,string> = { soja:"🌱",maiz:"🌽",trigo:"🌾",girasol:"🌻",sorgo:"🌿",cebada:"🍃",arveja:"🫛",otro:"🌐" };
const SUBCATS_AGRO = ["Herbicida","Insecticida","Fungicida","Coadyuvante","Curasemilla","Fertilizante","Otro"];
const TABS = [
  { key:"granos", label:"Libro de Granos", icon:"🌾", color:"#d97706", img:"/stock-granos.png" },
  { key:"insumos", label:"Insumos", icon:"🧪", color:"#16a34a", img:"/stock-insumos.png" },
  { key:"gasoil", label:"Gasoil", icon:"⛽", color:"#1565c0", img:"/stock-gasoil.png" },
  { key:"varios", label:"Stock Varios", icon:"🔧", color:"#7c3aed", img:"/stock-varios.png" },
];
const CAT_INSUMOS = [
  { key:"semilla", label:"Semillas", color:"#22c55e", icon:"🌱" },
  { key:"fertilizante", label:"Fertilizantes", color:"#d97706", icon:"💊" },
  { key:"agroquimico", label:"Agroquímicos", color:"#1565c0", icon:"🧪" },
  { key:"otro", label:"Otros", color:"#7c3aed", icon:"🔧" },
];

type VozEstado = "idle"|"escuchando"|"procesando"|"respondiendo"|"error";

function calcularPPP(stockActual: number, pppAnterior: number, cantidadNueva: number, precioNuevo: number): number {
  const totalUnidades = stockActual + cantidadNueva;
  if (totalUnidades <= 0) return precioNuevo;
  return (stockActual * pppAnterior + cantidadNueva * precioNuevo) / totalUnidades;
}

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
  const [editandoUbicacion, setEditandoUbicacion] = useState<string|null>(null);
  const [editandoInsumo, setEditandoInsumo] = useState<string|null>(null);
  const [editandoVarios, setEditandoVarios] = useState<string|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [importMsg, setImportMsg] = useState("");
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [msgExito, setMsgExito] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
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

  const getCampanaIdParaInsertar = async (eid: string): Promise<string> => {
    const cid = localStorage.getItem("campana_id") ?? "";
    if (cid) return cid;
    const sb = await getSB();
    const { data: activa } = await sb.from("campanas").select("id").eq("empresa_id", eid).eq("activa", true).order("año_inicio", { ascending: false }).limit(1).single();
    if (activa?.id) { localStorage.setItem("campana_id", activa.id); return activa.id; }
    const { data: reciente } = await sb.from("campanas").select("id").eq("empresa_id", eid).order("año_inicio", { ascending: false }).limit(1).single();
    return reciente?.id ?? "";
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
    const [ub, vt, ins, gas, gmov, var_, prov] = await Promise.all([
      sb.from("stock_granos_ubicaciones").select("*").eq("empresa_id", eid),
      sb.from("stock_ventas_pactadas").select("*").eq("empresa_id", eid).eq("estado","pactada"),
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

  const hablar = useCallback((texto: string) => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(texto);
    utt.lang = "es-AR"; utt.rate = 1.05;
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
    const resumenStock = [`Gasoil total: ${totalGasoil}L`, ...cultivosConStock.map(c => { const s = stockPorCultivo(c); return `${c}: ${s.totalFisico}tn físico, ${s.balance}tn disponible`; }), ...insumos.slice(0,6).map(i => `${i.nombre}: ${i.cantidad}${i.unidad} PPP:$${i.precio_ppp||i.precio_unitario}`)].join("; ");
    try {
      const res = await fetch("/api/scanner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 500, messages: [{ role: "user", content: `Asistente de stock agropecuario AgroGestión Pro. Stock actual: ${resumenStock}. El productor dijo: "${texto}". Respondé SOLO en JSON sin markdown: {"texto":"respuesta breve en español argentino máx 2 oraciones","accion":"consulta|cargar_gasoil|consumir_gasoil|ajustar_gasoil|cargar_insumo|descontar_insumo|cargar_grano|cargar_varios","datos":{campos relevantes o null}}` }] }) });
      const data = await res.json();
      const raw = (data.content?.[0]?.text ?? "{}").replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(raw);
      setVozRespuesta(parsed.texto ?? ""); hablar(parsed.texto ?? "");
      if (parsed.accion === "consumir_gasoil" && parsed.datos?.litros && empresaId) {
        const tanque = gasoil[0];
        if (tanque) {
          const sb = await getSB();
          const nuevaCant = Math.max(0, tanque.cantidad_litros - Number(parsed.datos.litros));
          const pppActual = tanque.precio_ppp || tanque.precio_litro || 0;
          await sb.from("stock_gasoil").update({ cantidad_litros: nuevaCant, costo_total_stock: nuevaCant * pppActual }).eq("id", tanque.id);
          await sb.from("stock_gasoil_movimientos").insert({ empresa_id: empresaId, gasoil_id: tanque.id, fecha: new Date().toISOString().split("T")[0], tipo: "consumo", litros: Number(parsed.datos.litros), descripcion: parsed.datos.descripcion ?? texto, metodo: "voz", precio_litro: 0, precio_ppp: pppActual });
          await fetchAll(empresaId);
        }
      } else if (parsed.accion === "descontar_insumo" && parsed.datos?.nombre && empresaId) {
        const insumo = insumos.find(i => i.nombre.toLowerCase().includes(parsed.datos.nombre.toLowerCase()));
        if (insumo) {
          const sb = await getSB();
          const nuevaCant = Math.max(0, insumo.cantidad - Number(parsed.datos.cantidad ?? 0));
          const pppActual = insumo.precio_ppp || insumo.precio_unitario || 0;
          await sb.from("stock_insumos").update({ cantidad: nuevaCant, costo_total_stock: nuevaCant * pppActual }).eq("id", insumo.id);
          await sb.from("stock_insumos_movimientos").insert({ empresa_id: empresaId, insumo_id: insumo.id, fecha: new Date().toISOString().split("T")[0], tipo: "uso", cantidad: Number(parsed.datos.cantidad ?? 0), precio_unitario: 0, precio_ppp: pppActual, descripcion: texto, metodo: "voz" });
          await fetchAll(empresaId);
        }
      } else if (parsed.accion === "cargar_gasoil" && parsed.datos) {
        setTab("gasoil"); setForm({ cantidad_litros: String(parsed.datos.litros ?? ""), tipo_ubicacion: "tanque_propio", ubicacion: parsed.datos.ubicacion ?? "" }); setShowFormGasoil(true);
      } else if (parsed.accion === "cargar_insumo" && parsed.datos) {
        setTab("insumos"); setForm({ nombre: parsed.datos.nombre ?? "", categoria: parsed.datos.categoria ?? "agroquimico", cantidad: String(parsed.datos.cantidad ?? ""), unidad: parsed.datos.unidad ?? "litros" }); setShowFormInsumo(true);
      } else if (parsed.accion === "cargar_grano" && parsed.datos) {
        setTab("granos"); setForm({ cultivo: parsed.datos.cultivo ?? "", cantidad_tn: String(parsed.datos.cantidad_tn ?? ""), tipo_ubicacion: parsed.datos.tipo_ubicacion ?? "silo" }); setShowFormCultivo(true);
      }
      setVozEstado("respondiendo");
    } catch { const err = "No pude interpretar. Intentá de nuevo."; setVozRespuesta(err); hablar(err); setVozEstado("error"); setTimeout(() => setVozEstado("idle"), 2000); }
  }, [gasoil, insumos, cultivosConStock, empresaId, hablar]);

  const escucharVoz = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) { alert("Usá Chrome para reconocimiento de voz"); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR(); rec.lang = "es-AR"; rec.continuous = false; recRef.current = rec;
    setVozEstado("escuchando"); setVozRespuesta(""); setVozPanel(true);
    rec.onresult = (e: any) => { const t = e.results[0][0].transcript; setVozTranscripcion(t); interpretarVoz(t); };
    rec.onerror = () => { setVozEstado("error"); setTimeout(() => setVozEstado("idle"), 2000); };
    rec.start();
  };

  const VOZ_COLOR: Record<VozEstado,string> = { idle:"#22c55e", escuchando:"#ef4444", procesando:"#d97706", respondiendo:"#60a5fa", error:"#ef4444" };
  const VOZ_ICON: Record<VozEstado,string> = { idle:"🎤", escuchando:"🔴", procesando:"⚙️", respondiendo:"🔊", error:"❌" };

  // ===== CRUD (lógica 100% original) =====

  const guardarUbicacion = async () => {
    if (!empresaId || !form.cultivo) return;
    const sb = await getSB();
    if (editandoUbicacion) {
      await sb.from("stock_granos_ubicaciones").update({ tipo_ubicacion: form.tipo_ubicacion ?? "silo", nombre_ubicacion: form.nombre_ubicacion ?? "", cantidad_tn: Number(form.cantidad_tn ?? 0) }).eq("id", editandoUbicacion);
      setEditandoUbicacion(null);
    } else {
      const cid = await getCampanaIdParaInsertar(empresaId);
      await sb.from("stock_granos_ubicaciones").insert({ empresa_id: empresaId, campana_id: cid, cultivo: form.cultivo, tipo_ubicacion: form.tipo_ubicacion ?? "silo", nombre_ubicacion: form.nombre_ubicacion ?? "", cantidad_tn: Number(form.cantidad_tn ?? 0) });
    }
    mostrarMsg("✅ Stock guardado"); await fetchAll(empresaId); setShowFormUbicacion(false); setShowFormCultivo(false); setForm({});
  };

  const guardarVenta = async () => {
    if (!empresaId || !form.cultivo) return;
    const sb = await getSB();
    const cid = await getCampanaIdParaInsertar(empresaId);
    await sb.from("stock_ventas_pactadas").insert({ empresa_id: empresaId, campana_id: cid, cultivo: form.cultivo, cantidad_tn: Number(form.cantidad_tn ?? 0), precio_tn: Number(form.precio_tn ?? 0), destino: form.destino ?? "", tipo_destino: form.tipo_destino ?? "cooperativa", fecha_entrega: form.fecha_entrega || null, estado: "pactada" });
    mostrarMsg("✅ Venta pactada"); await fetchAll(empresaId); setShowFormVenta(false); setForm({});
  };

  const guardarInsumo = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const cantNueva = Number(form.cantidad ?? 0);
    const precioNuevo = Number(form.precio_unitario ?? 0);
    if (editandoInsumo) {
      await sb.from("stock_insumos").update({ nombre: form.nombre, categoria: form.categoria ?? "agroquimico", subcategoria: form.subcategoria ?? "", cantidad: cantNueva, unidad: form.unidad ?? "litros", ubicacion: form.ubicacion ?? "", tipo_ubicacion: form.tipo_ubicacion ?? "deposito_propio", precio_unitario: precioNuevo }).eq("id", editandoInsumo);
      setEditandoInsumo(null);
    } else {
      const existente = insumos.find(i => i.nombre.toLowerCase().trim() === (form.nombre ?? "").toLowerCase().trim() && i.categoria === (form.categoria ?? "agroquimico"));
      if (existente) {
        const pppNuevo = calcularPPP(existente.cantidad, existente.precio_ppp || existente.precio_unitario, cantNueva, precioNuevo);
        const cantTotal = existente.cantidad + cantNueva;
        await sb.from("stock_insumos").update({ cantidad: cantTotal, precio_ppp: pppNuevo, precio_unitario: precioNuevo, costo_total_stock: cantTotal * pppNuevo }).eq("id", existente.id);
        await sb.from("stock_insumos_movimientos").insert({ empresa_id: empresaId, insumo_id: existente.id, fecha: new Date().toISOString().split("T")[0], tipo: "compra", cantidad: cantNueva, precio_unitario: precioNuevo, precio_ppp: pppNuevo, descripcion: `Compra: ${cantNueva} ${existente.unidad} a $${precioNuevo}`, metodo: "manual" });
        mostrarMsg(`✅ Stock actualizado — PPP: $${pppNuevo.toFixed(2)}/${existente.unidad}`);
      } else {
        const { data: nuevo } = await sb.from("stock_insumos").insert({ empresa_id: empresaId, nombre: form.nombre, categoria: form.categoria ?? "agroquimico", subcategoria: form.subcategoria ?? "", cantidad: cantNueva, unidad: form.unidad ?? "litros", ubicacion: form.ubicacion ?? "", tipo_ubicacion: form.tipo_ubicacion ?? "deposito_propio", precio_unitario: precioNuevo, precio_ppp: precioNuevo, costo_total_stock: cantNueva * precioNuevo }).select().single();
        if (nuevo) await sb.from("stock_insumos_movimientos").insert({ empresa_id: empresaId, insumo_id: nuevo.id, fecha: new Date().toISOString().split("T")[0], tipo: "compra", cantidad: cantNueva, precio_unitario: precioNuevo, precio_ppp: precioNuevo, descripcion: `Compra inicial: ${cantNueva} ${form.unidad ?? "litros"} a $${precioNuevo}`, metodo: "manual" });
        mostrarMsg("✅ Insumo cargado");
      }
    }
    await fetchAll(empresaId); setShowFormInsumo(false); setForm({});
  };

  const descontarInsumo = async (id: string, cantDescontar: number, loteId?: string) => {
    const sb = await getSB();
    const ins = insumos.find(i => i.id === id);
    if (!ins || !empresaId) return;
    const nuevaCant = Math.max(0, ins.cantidad - cantDescontar);
    const pppActual = ins.precio_ppp || ins.precio_unitario || 0;
    const costoImputado = cantDescontar * pppActual;
    await sb.from("stock_insumos").update({ cantidad: nuevaCant, costo_total_stock: nuevaCant * pppActual }).eq("id", id);
    await sb.from("stock_insumos_movimientos").insert({ empresa_id: empresaId, insumo_id: id, fecha: new Date().toISOString().split("T")[0], tipo: "uso", cantidad: cantDescontar, precio_unitario: 0, precio_ppp: pppActual, lote_id: loteId ?? null, descripcion: `Uso: ${cantDescontar} ${ins.unidad} — costo imputado $${costoImputado.toFixed(0)}`, metodo: "manual" });
    mostrarMsg(`✅ ${cantDescontar} ${ins.unidad} descontados — PPP: $${pppActual.toFixed(2)} — Costo: $${costoImputado.toFixed(0)}`);
    await fetchAll(empresaId);
  };

  const guardarGasoil = async () => {
    if (!empresaId) return;
    const sb = await getSB();
    const litros = Number(form.cantidad_litros ?? 0);
    const precioLitro = Number(form.precio_litro ?? 0);
    const { data: nuevo } = await sb.from("stock_gasoil").insert({ empresa_id: empresaId, cantidad_litros: litros, ubicacion: form.ubicacion ?? "", tipo_ubicacion: form.tipo_ubicacion ?? "tanque_propio", precio_litro: precioLitro, precio_ppp: precioLitro, costo_total_stock: litros * precioLitro }).select().single();
    if (nuevo) await sb.from("stock_gasoil_movimientos").insert({ empresa_id: empresaId, gasoil_id: nuevo.id, fecha: new Date().toISOString().split("T")[0], tipo: "carga", litros, descripcion: "Carga inicial", metodo: "manual", precio_litro: precioLitro, precio_ppp: precioLitro });
    mostrarMsg("✅ Gasoil cargado"); await fetchAll(empresaId); setShowFormGasoil(false); setForm({});
  };

  const registrarMovGasoil = async (gasoilId: string, tipo: "carga"|"consumo"|"ajuste") => {
    if (!empresaId) return;
    const sb = await getSB();
    const litros = Number(form.litros_mov ?? 0);
    const precioLitroNuevo = Number(form.precio_litro_mov ?? 0);
    const tanque = gasoil.find(g => g.id === gasoilId);
    if (!tanque) return;
    let nuevaCant: number; let pppNuevo: number;
    if (tipo === "carga") {
      nuevaCant = tanque.cantidad_litros + litros;
      pppNuevo = precioLitroNuevo > 0 ? calcularPPP(tanque.cantidad_litros, tanque.precio_ppp || tanque.precio_litro, litros, precioLitroNuevo) : tanque.precio_ppp || tanque.precio_litro;
    } else {
      nuevaCant = Math.max(0, tanque.cantidad_litros - litros);
      pppNuevo = tanque.precio_ppp || tanque.precio_litro;
    }
    await sb.from("stock_gasoil").update({ cantidad_litros: nuevaCant, precio_ppp: pppNuevo, costo_total_stock: nuevaCant * pppNuevo, ...(tipo === "carga" && precioLitroNuevo > 0 ? { precio_litro: precioLitroNuevo } : {}) }).eq("id", gasoilId);
    await sb.from("stock_gasoil_movimientos").insert({ empresa_id: empresaId, gasoil_id: gasoilId, fecha: form.fecha_mov ?? new Date().toISOString().split("T")[0], tipo, litros, descripcion: form.descripcion_mov ?? "", metodo: "manual", precio_litro: precioLitroNuevo, precio_ppp: pppNuevo, ...(form.lote_mov ? { lote_id: form.lote_mov } : {}) });
    mostrarMsg(tipo === "carga" ? `✅ Carga registrada — PPP: $${pppNuevo.toFixed(2)}/L` : `✅ Consumo — PPP: $${pppNuevo.toFixed(2)}/L — Costo: $${(litros * pppNuevo).toFixed(0)}`);
    await fetchAll(empresaId); setShowFormGasoilMov(""); setForm({});
  };

  const guardarVarios = async () => {
    if (!empresaId) return; const sb = await getSB();
    if (editandoVarios) { await sb.from("stock_varios").update({ nombre: form.nombre, categoria: form.categoria ?? "general", cantidad: Number(form.cantidad ?? 0), unidad: form.unidad ?? "unidad", ubicacion: form.ubicacion ?? "" }).eq("id", editandoVarios); setEditandoVarios(null); }
    else { await sb.from("stock_varios").insert({ empresa_id: empresaId, nombre: form.nombre, categoria: form.categoria ?? "general", cantidad: Number(form.cantidad ?? 0), unidad: form.unidad ?? "unidad", ubicacion: form.ubicacion ?? "" }); }
    mostrarMsg("✅ Guardado"); await fetchAll(empresaId); setShowFormVarios(false); setForm({});
  };

  const eliminarItem = async (tabla: string, id: string) => {
    if (!confirm("¿Eliminar?")) return; const sb = await getSB(); await sb.from(tabla).delete().eq("id", id); if (empresaId) await fetchAll(empresaId);
  };

  const marcarEntregada = async (id: string) => {
    const sb = await getSB(); await sb.from("stock_ventas_pactadas").update({ estado: "entregada" }).eq("id", id); if (empresaId) await fetchAll(empresaId);
  };

  const enviarWAProveedor = (proveedor: Proveedor, tipo: "gasoil"|"insumo", extra: string = "") => {
    const totalL = gasoil.reduce((a,g) => a + g.cantidad_litros, 0);
    const msg = tipo === "gasoil" ? `Hola ${proveedor.nombre}! Necesito cotización de gasoil.\nCantidad estimada: 2000 litros.\nStock actual: ${totalL}L.\n¿Precio y disponibilidad?` : `Hola ${proveedor.nombre}! Necesito cotización de insumos.\n${extra}\n¿Precio y disponibilidad?`;
    window.open(`https://wa.me/54${proveedor.telefono.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const enviarWAVenta = (cultivo: string, tipo: "sin_base"|"con_base") => {
    const { balance } = stockPorCultivo(cultivo);
    const vta = ventas.find(v => v.cultivo === cultivo && v.precio_tn > 0);
    const msg = tipo === "sin_base" ? `Hola! Tengo ${balance} tn de ${cultivo.toUpperCase()} disponibles. Sin precio base. ¿Oferta?` : `Hola! Tengo ${balance} tn de ${cultivo.toUpperCase()} disponibles. Base: $${Number(vta?.precio_tn??0).toLocaleString("es-AR")}/tn. ¿Les interesa?`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const leerExcelGranos = async (file: File) => {
    setImportMsg("Leyendo archivo...");
    try {
      const XLSX = await import("xlsx"); const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
      if (rows.length < 2) { setImportMsg("Sin datos"); return; }
      const headers = rows[0].map((h: any) => String(h).toLowerCase().trim());
      const ci = headers.findIndex((h: string) => h.includes("cultivo")||h.includes("grano"));
      const ct = headers.findIndex((h: string) => h.includes("tipo")||h.includes("ubic"));
      const cn = headers.findIndex((h: string) => h.includes("nombre")||h.includes("lugar"));
      const cq = headers.findIndex((h: string) => h.includes("tn")||h.includes("ton")||h.includes("cant"));
      if (ci === -1) { setImportMsg("❌ No se encontró columna CULTIVO"); return; }
      const preview = rows.slice(1).filter((r: any) => r[ci]).map((r: any) => ({ cultivo: String(r[ci]).toLowerCase().trim(), tipo_ubicacion: ct >= 0 ? String(r[ct]).toLowerCase().trim() : "silo", nombre_ubicacion: cn >= 0 ? String(r[cn]).trim() : "", cantidad_tn: Number(r[cq] ?? 0) || 0 }));
      setImportPreview(preview); setImportMsg(`✅ ${preview.length} registros — confirmá para importar`);
    } catch(e: any) { setImportMsg("❌ " + e.message); }
  };

  const confirmarImport = async () => {
    if (!empresaId || !importPreview.length) return; const sb = await getSB(); const cid = await getCampanaIdParaInsertar(empresaId);
    for (const r of importPreview) await sb.from("stock_granos_ubicaciones").insert({ empresa_id: empresaId, campana_id: cid, ...r });
    mostrarMsg(`✅ ${importPreview.length} registros importados`); await fetchAll(empresaId); setImportPreview([]); setImportMsg(""); setShowImport(false);
  };

  const exportarExcel = async () => {
    const XLSX = await import("xlsx"); const wb = XLSX.utils.book_new();
    if (tab === "granos") {
      const data = cultivosConStock.map(c => { const { totalFisico, totalPactado, balance, ubs } = stockPorCultivo(c); return { CULTIVO: c.toUpperCase(), "STOCK FISICO (tn)": totalFisico, "VENTAS PACTADAS (tn)": totalPactado, "BALANCE (tn)": balance, UBICACIONES: ubs.map(u=>`${u.tipo_ubicacion}: ${u.cantidad_tn}tn`).join(" | ") }; });
      const ws = XLSX.utils.json_to_sheet(data); ws["!cols"] = [{wch:14},{wch:16},{wch:18},{wch:12},{wch:40}]; XLSX.utils.book_append_sheet(wb, ws, "Granos"); XLSX.writeFile(wb, `stock_granos_${new Date().toISOString().slice(0,10)}.xlsx`);
    } else if (tab === "insumos") {
      const data = insumos.map(i => ({ NOMBRE: i.nombre, CATEGORIA: i.categoria, SUBCATEGORIA: i.subcategoria, CANTIDAD: i.cantidad, UNIDAD: i.unidad, "PRECIO COMPRA": i.precio_unitario, "PPP": i.precio_ppp || i.precio_unitario, "COSTO TOTAL STOCK": i.costo_total_stock || (i.cantidad * (i.precio_ppp || i.precio_unitario)), UBICACION: `${i.tipo_ubicacion} ${i.ubicacion}`.trim() }));
      const ws = XLSX.utils.json_to_sheet(data); ws["!cols"] = [{wch:22},{wch:14},{wch:14},{wch:10},{wch:8},{wch:14},{wch:12},{wch:18},{wch:20}]; XLSX.utils.book_append_sheet(wb, ws, "Insumos"); XLSX.writeFile(wb, `stock_insumos_${new Date().toISOString().slice(0,10)}.xlsx`);
    } else if (tab === "gasoil") {
      const data = gasoilMovs.map(m => ({ FECHA: m.fecha, TIPO: m.tipo, LITROS: m.litros, "PRECIO LITRO": m.precio_litro, "PPP AL MOMENTO": m.precio_ppp, DESCRIPCION: m.descripcion, METODO: m.metodo }));
      const ws = XLSX.utils.json_to_sheet(data); XLSX.utils.book_append_sheet(wb, ws, "Gasoil"); XLSX.writeFile(wb, `stock_gasoil_${new Date().toISOString().slice(0,10)}.xlsx`);
    }
  };

  // ── Estilos nuevos ──
  const iCls = "inp w-full px-3 py-2.5 text-[#1a2a4a] text-sm";
  const lCls = "block text-[10px] font-bold uppercase tracking-wider text-[#6b8aaa] mb-1.5";

  if (loading) return (
    <div style={{minHeight:"100vh",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:32,height:32,border:"3px solid #1976d2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <span style={{color:"#1565c0",fontWeight:600}}>Cargando inventario...</span>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",backgroundImage:"url('/FON.png')",backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"scroll"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}

        .inp{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;box-shadow:inset 0 1px 3px rgba(0,60,140,0.04);transition:all 0.18s;color:#1a2a4a;font-family:'DM Sans',system-ui;}
        .inp::placeholder{color:rgba(80,120,160,0.50);}
        .inp:focus{background:rgba(255,255,255,0.97);border-color:rgba(25,118,210,0.40);outline:none;box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .inp option{background:white;color:#1a2a4a;}
        .sel{background:rgba(255,255,255,0.75);border:1px solid rgba(180,210,240,0.55);border-radius:11px;color:#1a2a4a;padding:8px 12px;font-size:13px;font-family:'DM Sans',system-ui;width:100%;}
        .sel option{background:white;color:#1a2a4a;}

        /* Card base */
        .card{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.90);border-top:2px solid rgba(255,255,255,1);border-radius:18px;box-shadow:0 6px 24px rgba(20,80,160,0.14),inset 0 2px 0 rgba(255,255,255,0.90);position:relative;overflow:hidden;}
        .card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.62);border-radius:18px;pointer-events:none;z-index:0;}
        .card::after{content:"";position:absolute;top:0;left:0;right:0;height:42%;background:linear-gradient(180deg,rgba(255,255,255,0.48) 0%,transparent 100%);border-radius:18px 18px 0 0;pointer-events:none;z-index:1;}
        .card>*{position:relative;z-index:2;}

        /* Topbar */
        .topbar-st{background-image:url('/FON.png');background-size:cover;background-position:top center;border-bottom:1px solid rgba(255,255,255,0.40);box-shadow:0 2px 16px rgba(20,80,160,0.12);position:relative;}
        .topbar-st::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.30);pointer-events:none;}
        .topbar-st>*{position:relative;z-index:1;}

        /* Botones */
        .bbtn{background-image:url('/AZUL.png');background-size:cover;background-position:center;border:1.5px solid rgba(100,180,255,0.50);border-top:2px solid rgba(180,220,255,0.70);border-radius:12px;color:white;font-weight:800;font-size:12px;cursor:pointer;padding:8px 16px;text-shadow:0 1px 3px rgba(0,40,120,0.35);box-shadow:0 3px 12px rgba(25,118,210,0.35);transition:all 0.18s;}
        .bbtn:hover{transform:translateY(-1px);filter:brightness(1.08);}
        .abtn{background:rgba(255,255,255,0.70);border:1.5px solid rgba(255,255,255,0.92);border-radius:12px;color:#1e3a5f;font-weight:700;font-size:12px;cursor:pointer;padding:8px 14px;transition:all 0.18s;display:inline-flex;align-items:center;gap:5px;}
        .abtn:hover{background:rgba(255,255,255,0.95);}

        /* Tab de imagen */
        .tab-img{border-radius:14px;overflow:hidden;cursor:pointer;transition:all 0.20s;position:relative;height:72px;border:2px solid transparent;}
        .tab-img.active{border-color:rgba(255,255,255,0.90);box-shadow:0 4px 18px rgba(25,118,210,0.30);}
        .tab-img:hover{transform:translateY(-2px);}

        /* Cultivo card */
        .cultivo-card{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.88);border-radius:16px;box-shadow:0 4px 16px rgba(20,80,160,0.12);cursor:pointer;transition:all 0.20s;position:relative;overflow:hidden;}
        .cultivo-card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.58);border-radius:16px;pointer-events:none;}
        .cultivo-card>*{position:relative;}
        .cultivo-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(20,80,160,0.18);}

        /* KPI chip */
        .kpi-s{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.88);border-radius:12px;padding:8px 10px;text-align:center;position:relative;overflow:hidden;}
        .kpi-s::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.68);border-radius:12px;pointer-events:none;}
        .kpi-s>*{position:relative;}

        /* Ubicacion card */
        .ubic-card{background-image:url('/FON.png');background-size:cover;background-position:center;border:1.5px solid rgba(255,255,255,0.88);border-radius:14px;overflow:hidden;position:relative;}
        .ubic-card::before{content:"";position:absolute;inset:0;background:rgba(255,255,255,0.55);pointer-events:none;}
        .ubic-card>*{position:relative;}

        .fade-in{animation:fadeIn 0.20s ease;}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
        .row-s:hover{background:rgba(255,255,255,0.80)!important;}
        .form-box{background:rgba(255,255,255,0.55);border:1px solid rgba(180,210,240,0.40);border-radius:14px;padding:14px;}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar-st" style={{position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px"}}>
          <button onClick={()=>cultivoActivo?setCultivoActivo(null):gasoilActivo?setGasoilActivo(null):window.location.href="/productor/dashboard"}
            style={{background:"none",border:"none",cursor:"pointer",color:"#4a6a8a",fontSize:13,fontWeight:700}}>
            ← {cultivoActivo||gasoilActivo?"Volver":"Dashboard"}
          </button>
          <div style={{flex:1}}/>
          <div style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>📦 Stock</div>
          <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
            style={{display:"flex",alignItems:"center",gap:5,padding:"7px 12px",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",background:VOZ_COLOR[vozEstado]+"18",border:`1.5px solid ${VOZ_COLOR[vozEstado]}50`,color:VOZ_COLOR[vozEstado]}}>
            {VOZ_ICON[vozEstado]}
          </button>
          <button onClick={()=>window.location.href="/productor/dashboard"} style={{background:"none",border:"none",cursor:"pointer"}}>
            <Image src="/logo.png" alt="Logo" width={90} height={32} style={{objectFit:"contain"}}/>
          </button>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"14px 14px 80px",position:"relative",zIndex:1}}>

        {/* Toast */}
        {msgExito&&<div className="fade-in" style={{marginBottom:12,padding:"10px 14px",borderRadius:12,fontSize:13,fontWeight:600,color:msgExito.startsWith("✅")?"#16a34a":"#dc2626",background:msgExito.startsWith("✅")?"rgba(220,252,231,0.90)":"rgba(254,226,226,0.90)",border:`1px solid ${msgExito.startsWith("✅")?"rgba(22,163,74,0.25)":"rgba(220,38,38,0.20)"}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>{msgExito}<button onClick={()=>setMsgExito("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:0.5}}>✕</button></div>}

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div>
            <h1 style={{fontSize:20,fontWeight:800,color:"#0d2137",margin:0}}>📦 Stock</h1>
            <p style={{fontSize:11,color:"#6b8aaa",margin:"2px 0 0",fontWeight:600}}>Sistema de inventario agropecuario</p>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>setShowProveedores(!showProveedores)} className="abtn" style={{fontSize:11}}>💬 Proveedores WA</button>
            <button onClick={()=>setShowImport(!showImport)} className="abtn" style={{fontSize:11}}>📥 Importar</button>
            <button onClick={exportarExcel} className="abtn" style={{fontSize:11}}>📤 Exportar</button>
          </div>
        </div>

        {/* Proveedores WA */}
        {showProveedores&&(
          <div className="card fade-in" style={{padding:14,marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:800,color:"#16a34a"}}>💬 Proveedores — Cotización por WhatsApp</div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setShowFormProveedor(!showFormProveedor)} className="bbtn" style={{fontSize:11,padding:"5px 10px"}}>+ Agregar</button>
                <button onClick={()=>setShowProveedores(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:18}}>✕</button>
              </div>
            </div>
            {showFormProveedor&&(
              <div className="form-box fade-in" style={{marginBottom:10}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.prov_nombre??""} onChange={e=>setForm({...form,prov_nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Ej: YPF Agro"/></div>
                  <div><label className={lCls}>Teléfono WA</label><input type="text" value={form.prov_tel??""} onChange={e=>setForm({...form,prov_tel:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="3400123456"/></div>
                  <div><label className={lCls}>Categoría</label><select value={form.prov_cat??"proveedor_gasoil"} onChange={e=>setForm({...form,prov_cat:e.target.value})} className="sel"><option value="proveedor_gasoil">⛽ Gasoil</option><option value="proveedor_insumo">🧪 Insumos</option></select></div>
                  <div style={{display:"flex",alignItems:"flex-end"}}><button onClick={async()=>{if(!empresaId||!form.prov_nombre)return;const sb=await getSB();await sb.from("contactos").insert({empresa_id:empresaId,nombre:form.prov_nombre,telefono:form.prov_tel??"",categoria:form.prov_cat??"proveedor_gasoil",activo:true});mostrarMsg("✅ Proveedor agregado");await fetchAll(empresaId);setShowFormProveedor(false);setForm({});}} className="bbtn" style={{width:"100%"}}>Guardar</button></div>
                </div>
              </div>
            )}
            {proveedores.length===0
              ?<p style={{color:"#6b8aaa",fontSize:13,textAlign:"center",padding:"14px 0"}}>Sin proveedores agregados.</p>
              :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:8}}>
                {proveedores.map(p=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",borderRadius:12,background:"rgba(255,255,255,0.60)",border:"1px solid rgba(180,210,240,0.35)"}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"#0d2137"}}>{p.nombre}</div>
                      <div style={{fontSize:11,color:"#6b8aaa"}}>{p.categoria==="proveedor_gasoil"?"⛽ Gasoil":"🧪 Insumos"} · {p.telefono}</div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>enviarWAProveedor(p,p.categoria==="proveedor_gasoil"?"gasoil":"insumo")} style={{padding:"5px 10px",borderRadius:8,background:"rgba(22,163,74,0.10)",border:"1px solid rgba(22,163,74,0.25)",color:"#16a34a",cursor:"pointer",fontSize:11,fontWeight:700}}>💬 Cotizar</button>
                      <button onClick={()=>eliminarItem("contactos",p.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            }
          </div>
        )}

        {/* Import */}
        {showImport&&(
          <div className="card fade-in" style={{padding:14,marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:800,color:"#d97706"}}>📥 Importar Granos desde Excel</div>
              <button onClick={()=>{setShowImport(false);setImportPreview([]);setImportMsg("");}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:18}}>✕</button>
            </div>
            <p style={{fontSize:11,color:"#6b8aaa",marginBottom:10}}>Columnas: <span style={{color:"#d97706",fontWeight:700}}>CULTIVO · TIPO_UBICACION · NOMBRE_LUGAR · TN</span></p>
            <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)leerExcelGranos(f);}}/>
            {importPreview.length===0
              ?<button onClick={()=>importRef.current?.click()} className="abtn" style={{width:"100%",justifyContent:"center",padding:"12px",border:"2px dashed rgba(217,119,6,0.30)"}}>📁 Seleccionar archivo</button>
              :<div>
                <div style={{maxHeight:140,overflowY:"auto",marginBottom:10,borderRadius:10,border:"1px solid rgba(0,60,140,0.08)"}}>
                  <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
                    <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>{["Cultivo","Tipo","Lugar","Tn"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",color:"#6b8aaa",fontWeight:600}}>{h}</th>)}</tr></thead>
                    <tbody>{importPreview.map((r,i)=><tr key={i} style={{borderBottom:"1px solid rgba(0,60,140,0.05)"}}><td style={{padding:"5px 10px",fontWeight:700,color:"#0d2137"}}>{r.cultivo}</td><td style={{padding:"5px 10px",color:"#6b8aaa"}}>{r.tipo_ubicacion}</td><td style={{padding:"5px 10px",color:"#6b8aaa"}}>{r.nombre_ubicacion||"—"}</td><td style={{padding:"5px 10px",fontWeight:700,color:"#16a34a"}}>{r.cantidad_tn} tn</td></tr>)}</tbody>
                  </table>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={confirmarImport} className="bbtn">▶ Confirmar {importPreview.length} registros</button>
                  <button onClick={()=>{setImportPreview([]);setImportMsg("");}} className="abtn">Cancelar</button>
                </div>
              </div>
            }
            {importMsg&&<p style={{marginTop:8,fontSize:11,fontWeight:600,color:importMsg.startsWith("✅")?"#16a34a":"#dc2626"}}>{importMsg}</p>}
          </div>
        )}

        {/* ── TABS con imagen ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
          {TABS.map(t=>(
            <div key={t.key} className={`tab-img${tab===t.key?" active":""}`} onClick={()=>{setTab(t.key as Tab);setCultivoActivo(null);setGasoilActivo(null);}}>
              <Image src={t.img} alt={t.label} fill style={{objectFit:"cover"}} onError={(e:any)=>{e.target.src="/dashboard-bg.png";}}/>
              <div style={{position:"absolute",inset:0,background:tab===t.key?"rgba(255,255,255,0.18)":"rgba(20,40,80,0.45)",transition:"background 0.2s"}}/>
              <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"6px 10px",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:15}}>{t.icon}</span>
                <span style={{fontSize:11,fontWeight:800,color:"white",textShadow:"0 1px 3px rgba(0,0,0,0.55)"}}>{t.label}</span>
              </div>
              {tab===t.key&&<div style={{position:"absolute",top:6,right:6,width:7,height:7,borderRadius:"50%",background:"white",boxShadow:"0 0 6px rgba(255,255,255,0.8)"}}/>}
            </div>
          ))}
        </div>

        {/* ══════════════════════════════
            GRANOS — LISTA CULTIVOS
        ══════════════════════════════ */}
        {tab==="granos"&&!cultivoActivo&&(
          <div className="fade-in">
            {cultivosConStock.length===0?(
              <div className="card" style={{padding:"48px 20px",textAlign:"center"}}>
                <div style={{fontSize:48,opacity:0.12,marginBottom:12}}>🌾</div>
                <p style={{color:"#6b8aaa",marginBottom:12,fontSize:14}}>Sin stock de granos cargado</p>
                <button onClick={()=>setShowFormCultivo(true)} className="bbtn">+ Cargar primer stock</button>
              </div>
            ):(
              <div>
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
                  <button onClick={()=>setShowFormCultivo(true)} className="bbtn">+ Cargar Stock</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
                  {cultivosConStock.map(cultivo=>{
                    const {ubs,totalFisico,totalPactado,balance}=stockPorCultivo(cultivo);
                    return(
                      <div key={cultivo} className="cultivo-card" onClick={()=>setCultivoActivo(cultivo)}>
                        {/* imagen cabecera */}
                        <div style={{position:"relative",height:100,borderRadius:"16px 16px 0 0",overflow:"hidden"}}>
                          <Image src="/stock-granos.png" alt={cultivo} fill style={{objectFit:"cover"}} onError={(e:any)=>{e.target.src="/dashboard-bg.png";}}/>
                          <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,transparent 30%,rgba(255,255,255,0.70) 100%)"}}/>
                          <div style={{position:"absolute",bottom:6,left:10,display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:20}}>{CULTIVO_ICONS[cultivo]??"🌾"}</span>
                            <span style={{fontSize:15,fontWeight:800,color:"#0d2137",textTransform:"uppercase"}}>{cultivo}</span>
                          </div>
                          <div style={{position:"absolute",top:6,right:8}}>
                            <span style={{fontSize:11,fontWeight:800,padding:"2px 10px",borderRadius:20,background:balance>=0?"rgba(22,163,74,0.18)":"rgba(220,38,38,0.15)",color:balance>=0?"#16a34a":"#dc2626"}}>
                              {balance>=0?"+":""}{balance} tn
                            </span>
                          </div>
                        </div>
                        <div style={{padding:"10px 12px 12px"}}>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:8}}>
                            {[{l:"Físico",v:totalFisico+" tn",c:"#0d2137"},{l:"Pactado",v:totalPactado+" tn",c:"#1565c0"},{l:"Balance",v:balance+" tn",c:balance>=0?"#16a34a":"#dc2626"}].map(s=>(
                              <div key={s.l} className="kpi-s">
                                <div style={{fontSize:9,color:"#6b8aaa",fontWeight:600}}>{s.l}</div>
                                <div style={{fontSize:11,fontWeight:800,color:s.c,marginTop:1}}>{s.v}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                            {ubs.map(u=>{const ub=UBICACIONES.find(x=>x.value===u.tipo_ubicacion);return(<span key={u.id} style={{fontSize:10,padding:"2px 7px",borderRadius:6,background:"rgba(25,118,210,0.08)",color:"#4a6a8a",fontWeight:600}}>{ub?.icon??"📍"} {u.cantidad_tn}tn</span>);})}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {showFormCultivo&&(
              <div className="card fade-in" style={{padding:14,marginTop:12}}>
                <div style={{fontSize:13,fontWeight:800,color:"#d97706",marginBottom:12}}>+ Cargar Stock de Grano</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Cultivo</label><input type="text" value={form.cultivo??""} onChange={e=>setForm({...form,cultivo:e.target.value.toLowerCase()})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="soja, maiz, trigo..."/></div>
                  <div><label className={lCls}>Dónde está</label><select value={form.tipo_ubicacion??"silo"} onChange={e=>setForm({...form,tipo_ubicacion:e.target.value})} className="sel">{UBICACIONES.map(u=><option key={u.value} value={u.value}>{u.icon} {u.label}</option>)}</select></div>
                  <div><label className={lCls}>Nombre lugar</label><input type="text" value={form.nombre_ubicacion??""} onChange={e=>setForm({...form,nombre_ubicacion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Silo Norte, ACA..."/></div>
                  <div><label className={lCls}>Toneladas</label><input type="number" value={form.cantidad_tn??""} onChange={e=>setForm({...form,cantidad_tn:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarUbicacion} className="bbtn">Guardar</button>
                  <button onClick={()=>{setShowFormCultivo(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════
            GRANOS — DETALLE CULTIVO
        ══════════════════════════════ */}
        {tab==="granos"&&cultivoActivo&&(
          <div className="fade-in">
            {/* Header cultivo */}
            <div className="card" style={{padding:0,overflow:"hidden",marginBottom:14}}>
              <div style={{position:"relative",height:120}}>
                <Image src="/stock-granos.png" alt={cultivoActivo} fill style={{objectFit:"cover"}} onError={(e:any)=>{e.target.src="/dashboard-bg.png";}}/>
                <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,transparent 20%,rgba(255,255,255,0.85) 100%)"}}/>
                <div style={{position:"absolute",bottom:14,left:16,display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:32}}>{CULTIVO_ICONS[cultivoActivo]??"🌾"}</span>
                  <div>
                    <h2 style={{fontSize:22,fontWeight:800,color:"#0d2137",margin:0,textTransform:"uppercase"}}>{cultivoActivo}</h2>
                    {(()=>{const {totalFisico,totalPactado,balance}=stockPorCultivo(cultivoActivo);return(<div style={{display:"flex",gap:12,fontSize:11,fontWeight:700,marginTop:2}}><span style={{color:"#0d2137"}}>{totalFisico} tn físico</span><span style={{color:"#1565c0"}}>{totalPactado} tn pactado</span><span style={{color:balance>=0?"#16a34a":"#dc2626"}}>{balance>=0?"+":""}{balance} tn balance</span></div>);})()}
                  </div>
                </div>
                <div style={{position:"absolute",bottom:14,right:14,display:"flex",gap:7}}>
                  <button onClick={()=>{setShowFormUbicacion(true);setForm({cultivo:cultivoActivo});}} className="abtn" style={{fontSize:11}}>+ Stock</button>
                  <button onClick={()=>{setShowFormVenta(true);setForm({cultivo:cultivoActivo});}} style={{padding:"7px 12px",borderRadius:10,background:"rgba(22,163,74,0.10)",border:"1px solid rgba(22,163,74,0.28)",color:"#16a34a",cursor:"pointer",fontSize:11,fontWeight:700}}>+ Venta pactada</button>
                </div>
              </div>
            </div>

            {showFormUbicacion&&(
              <div className="card fade-in" style={{padding:14,marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:800,color:"#d97706",marginBottom:12}}>{editandoUbicacion?"✏️ Editar":"+"} Stock {cultivoActivo.toUpperCase()}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Dónde está</label><select value={form.tipo_ubicacion??"silo"} onChange={e=>setForm({...form,tipo_ubicacion:e.target.value})} className="sel">{UBICACIONES.map(u=><option key={u.value} value={u.value}>{u.icon} {u.label}</option>)}</select></div>
                  <div><label className={lCls}>Nombre lugar</label><input type="text" value={form.nombre_ubicacion??""} onChange={e=>setForm({...form,nombre_ubicacion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="ACA Rafaela..."/></div>
                  <div><label className={lCls}>Toneladas</label><input type="number" value={form.cantidad_tn??""} onChange={e=>setForm({...form,cantidad_tn:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarUbicacion} className="bbtn">Guardar</button>
                  <button onClick={()=>{setShowFormUbicacion(false);setEditandoUbicacion(null);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {showFormVenta&&(
              <div className="card fade-in" style={{padding:14,marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:800,color:"#16a34a",marginBottom:12}}>+ Venta Pactada — {cultivoActivo.toUpperCase()}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Toneladas</label><input type="number" value={form.cantidad_tn??""} onChange={e=>setForm({...form,cantidad_tn:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Precio ($/tn)</label><input type="number" value={form.precio_tn??""} onChange={e=>setForm({...form,precio_tn:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="0 = sin base"/></div>
                  <div><label className={lCls}>Destino</label><input type="text" value={form.destino??""} onChange={e=>setForm({...form,destino:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="AFA, Coop..."/></div>
                  <div><label className={lCls}>Tipo destino</label><select value={form.tipo_destino??"cooperativa"} onChange={e=>setForm({...form,tipo_destino:e.target.value})} className="sel"><option value="cooperativa">Cooperativa</option><option value="acopio">Acopio</option><option value="empresa">Empresa</option><option value="exportador">Exportador</option><option value="otro">Otro</option></select></div>
                  <div><label className={lCls}>Fecha entrega</label><input type="date" value={form.fecha_entrega??""} onChange={e=>setForm({...form,fecha_entrega:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarVenta} className="bbtn">Guardar</button>
                  <button onClick={()=>{setShowFormVenta(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {/* Ubicaciones */}
            <div style={{fontSize:11,fontWeight:800,color:"#d97706",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>📍 Stock por Ubicación</div>
            {ubicaciones.filter(u=>u.cultivo===cultivoActivo).length===0
              ?<p style={{color:"#6b8aaa",fontSize:13,marginBottom:12}}>Sin ubicaciones</p>
              :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:10,marginBottom:16}}>
                {ubicaciones.filter(u=>u.cultivo===cultivoActivo).map(u=>{
                  const ub=UBICACIONES.find(x=>x.value===u.tipo_ubicacion);
                  return(
                    <div key={u.id} className="ubic-card">
                      <div style={{position:"relative",height:90,borderRadius:"14px 14px 0 0",overflow:"hidden"}}>
                        <Image src={ub?.img??"/ubicacion-silo.png"} alt="" fill style={{objectFit:"cover"}} onError={(e:any)=>{e.target.src="/dashboard-bg.png";}}/>
                        <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,transparent 20%,rgba(255,255,255,0.80) 100%)"}}/>
                        <div style={{position:"absolute",bottom:6,left:8}}>
                          <div style={{fontSize:16,fontWeight:800,color:"#0d2137"}}>{u.cantidad_tn} tn</div>
                          <div style={{fontSize:11,color:"#d97706",fontWeight:600}}>{ub?.label??u.tipo_ubicacion}</div>
                          {u.nombre_ubicacion&&<div style={{fontSize:10,color:"#6b8aaa"}}>{u.nombre_ubicacion}</div>}
                        </div>
                      </div>
                      <div style={{padding:"6px 10px",display:"flex",gap:6}}>
                        <button onClick={()=>{setEditandoUbicacion(u.id);setForm({cultivo:cultivoActivo,tipo_ubicacion:u.tipo_ubicacion,nombre_ubicacion:u.nombre_ubicacion,cantidad_tn:String(u.cantidad_tn)});setShowFormUbicacion(true);}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:13}}>✏️</button>
                        <button onClick={()=>eliminarItem("stock_granos_ubicaciones",u.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            }

            {/* Ventas pactadas */}
            <div style={{fontSize:11,fontWeight:800,color:"#16a34a",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>💬 Ventas Pactadas</div>
            {ventas.filter(v=>v.cultivo===cultivoActivo).length===0
              ?<p style={{color:"#6b8aaa",fontSize:13,marginBottom:12}}>Sin ventas pactadas</p>
              :<div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:12}}>
                {ventas.filter(v=>v.cultivo===cultivoActivo).map(v=>(
                  <div key={v.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,padding:"10px 14px",borderRadius:12,background:"rgba(255,255,255,0.70)",border:"1px solid rgba(22,163,74,0.18)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{fontSize:16,fontWeight:800,color:"#0d2137"}}>{v.cantidad_tn} tn</div>
                      <div>
                        <div style={{fontSize:13,color:"#16a34a",fontWeight:700}}>{v.destino||"Sin destino"}</div>
                        <div style={{fontSize:11,color:"#6b8aaa"}}>{v.tipo_destino}{v.fecha_entrega?` · ${v.fecha_entrega}`:""}</div>
                      </div>
                      {v.precio_tn>0&&<div style={{fontSize:13,color:"#d97706",fontWeight:800}}>${Number(v.precio_tn).toLocaleString("es-AR")}/tn</div>}
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>marcarEntregada(v.id)} style={{fontSize:11,padding:"5px 12px",borderRadius:8,background:"rgba(22,163,74,0.10)",border:"1px solid rgba(22,163,74,0.25)",color:"#16a34a",cursor:"pointer",fontWeight:700}}>✓ Entregado</button>
                      <button onClick={()=>eliminarItem("stock_ventas_pactadas",v.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            }
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>enviarWAVenta(cultivoActivo,"sin_base")} style={{flex:1,padding:"10px",borderRadius:12,background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.22)",color:"#16a34a",cursor:"pointer",fontWeight:700,fontSize:12}}>💬 WA Sin base</button>
              <button onClick={()=>enviarWAVenta(cultivoActivo,"con_base")} style={{flex:1,padding:"10px",borderRadius:12,background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.22)",color:"#16a34a",cursor:"pointer",fontWeight:700,fontSize:12}}>💬 WA Con base</button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            INSUMOS
        ══════════════════════════════ */}
        {tab==="insumos"&&(
          <div className="fade-in">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              <button onClick={()=>{setShowFormInsumo(!showFormInsumo);setEditandoInsumo(null);setForm({categoria:"agroquimico"});}} className="bbtn">+ Cargar Insumo</button>
            </div>
            {showFormInsumo&&(
              <div className="card fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#16a34a",marginBottom:6}}>{editandoInsumo?"✏️ Editar":"+"} Insumo</div>
                {!editandoInsumo&&<p style={{fontSize:11,color:"#6b8aaa",marginBottom:10}}>💡 Si el insumo ya existe, se suma al stock y se recalcula el PPP automáticamente</p>}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Ej: Glifosato 48%"/></div>
                  <div><label className={lCls}>Categoría</label><select value={form.categoria??"agroquimico"} onChange={e=>setForm({...form,categoria:e.target.value,subcategoria:""})} className="sel">{CAT_INSUMOS.map(c=><option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}</select></div>
                  {form.categoria==="agroquimico"&&<div><label className={lCls}>Subcategoría</label><select value={form.subcategoria??""} onChange={e=>setForm({...form,subcategoria:e.target.value})} className="sel"><option value="">Seleccionar</option>{SUBCATS_AGRO.map(s=><option key={s} value={s}>{s}</option>)}</select></div>}
                  <div><label className={lCls}>Cantidad</label><input type="number" value={form.cantidad??""} onChange={e=>setForm({...form,cantidad:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Unidad</label><select value={form.unidad??"litros"} onChange={e=>setForm({...form,unidad:e.target.value})} className="sel"><option value="litros">Litros</option><option value="kg">kg</option><option value="bolsas">Bolsas</option><option value="unidad">Unidad</option></select></div>
                  <div><label className={lCls}>Precio de compra</label><input type="number" value={form.precio_unitario??""} onChange={e=>setForm({...form,precio_unitario:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Precio esta compra"/></div>
                  <div><label className={lCls}>Dónde está</label><select value={form.tipo_ubicacion??"deposito_propio"} onChange={e=>setForm({...form,tipo_ubicacion:e.target.value})} className="sel"><option value="deposito_propio">Depósito Propio</option><option value="comercio">Comercio</option><option value="cooperativa">Cooperativa</option></select></div>
                  <div><label className={lCls}>Nombre lugar</label><input type="text" value={form.ubicacion??""} onChange={e=>setForm({...form,ubicacion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarInsumo} className="bbtn">Guardar</button>
                  <button onClick={()=>{setShowFormInsumo(false);setEditandoInsumo(null);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}

            {CAT_INSUMOS.map(cat=>{
              const items=insumos.filter(i=>i.categoria===cat.key); if(items.length===0) return null;
              const renderTabla=(its:InsumoItem[],titulo?:string)=>(
                <div key={titulo||cat.key} style={{marginBottom:titulo?10:0}}>
                  {titulo&&<div style={{fontSize:10,color:"#6b8aaa",textTransform:"uppercase",letterSpacing:0.8,fontWeight:700,marginBottom:5,paddingLeft:2}}>— {titulo}</div>}
                  <div className="card" style={{padding:0,overflow:"hidden"}}>
                    <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                      <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                        {["Producto","Cantidad","Último Precio","PPP","Costo Stock","Ubicación",""].map(h=>(
                          <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>{its.map(i=>(
                        <tr key={i.id} className="row-s" style={{borderBottom:"1px solid rgba(0,60,140,0.05)",transition:"background 0.15s"}}>
                          <td style={{padding:"9px 12px",fontWeight:800,color:"#0d2137"}}>{i.nombre}</td>
                          <td style={{padding:"9px 12px",fontWeight:800,color:cat.color}}>{i.cantidad} {i.unidad}</td>
                          <td style={{padding:"9px 12px",color:"#6b8aaa"}}>{i.precio_unitario>0?`$${i.precio_unitario}/${i.unidad}`:"-"}</td>
                          <td style={{padding:"9px 12px",fontWeight:800,color:"#d97706"}}>{(i.precio_ppp||i.precio_unitario)>0?`$${Number(i.precio_ppp||i.precio_unitario).toFixed(2)}/${i.unidad}`:"—"}</td>
                          <td style={{padding:"9px 12px",color:"#16a34a",fontWeight:700}}>{(i.costo_total_stock||(i.cantidad*(i.precio_ppp||i.precio_unitario)))>0?`$${Math.round(i.costo_total_stock||(i.cantidad*(i.precio_ppp||i.precio_unitario))).toLocaleString("es-AR")}`:"—"}</td>
                          <td style={{padding:"9px 12px",color:"#6b8aaa"}}>{i.tipo_ubicacion?.replace("_"," ")}{i.ubicacion?` · ${i.ubicacion}`:""}</td>
                          <td style={{padding:"9px 12px"}}>
                            <div style={{display:"flex",gap:6}}>
                              <button onClick={()=>{setEditandoInsumo(i.id);setForm({nombre:i.nombre,categoria:i.categoria,subcategoria:i.subcategoria??"",cantidad:String(i.cantidad),unidad:i.unidad,ubicacion:i.ubicacion,tipo_ubicacion:i.tipo_ubicacion,precio_unitario:String(i.precio_unitario)});setShowFormInsumo(true);}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:13}}>✏️</button>
                              <button onClick={()=>{const cant=prompt(`Descontar cantidad (${i.unidad}):\nPPP actual: $${(i.precio_ppp||i.precio_unitario).toFixed(2)}`);if(cant&&Number(cant)>0)descontarInsumo(i.id,Number(cant));}} style={{background:"none",border:"none",cursor:"pointer",color:"#1565c0",fontSize:13,fontWeight:800}} title="Descontar uso">➖</button>
                              <button onClick={()=>eliminarItem("stock_insumos",i.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button>
                            </div>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              );
              if(cat.key==="agroquimico"){
                const subgrupos=SUBCATS_AGRO.reduce((acc,sub)=>{const filtered=items.filter(i=>i.subcategoria===sub||(!i.subcategoria&&sub==="otro"));if(filtered.length>0)acc[sub]=filtered;return acc;},{} as Record<string,InsumoItem[]>);
                return(<div key={cat.key} style={{marginBottom:18}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:18}}>{cat.icon}</span><span style={{fontSize:14,fontWeight:800,color:cat.color}}>{cat.label}</span><span style={{fontSize:11,color:"#6b8aaa"}}>{items.length} productos</span></div>{Object.entries(subgrupos).map(([sub,subItems])=>renderTabla(subItems,sub))}</div>);
              }
              return(<div key={cat.key} style={{marginBottom:18}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:18}}>{cat.icon}</span><span style={{fontSize:14,fontWeight:800,color:cat.color}}>{cat.label}</span><span style={{fontSize:11,color:"#6b8aaa"}}>{items.length} productos</span></div>{renderTabla(items)}</div>);
            })}
            {insumos.length===0&&!showFormInsumo&&<div className="card" style={{padding:"48px 20px",textAlign:"center"}}><div style={{fontSize:40,opacity:0.12,marginBottom:10}}>🧪</div><p style={{color:"#6b8aaa",fontSize:14}}>Sin insumos registrados</p></div>}
          </div>
        )}

        {/* ══════════════════════════════
            GASOIL
        ══════════════════════════════ */}
        {tab==="gasoil"&&(
          <div className="fade-in">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              <button onClick={()=>setShowFormGasoil(!showFormGasoil)} className="bbtn">+ Nuevo Tanque</button>
            </div>
            {showFormGasoil&&(
              <div className="card fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#1565c0",marginBottom:12}}>+ Nuevo Tanque / Stock Gasoil</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Litros iniciales</label><input type="number" value={form.cantidad_litros??""} onChange={e=>setForm({...form,cantidad_litros:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Tipo</label><select value={form.tipo_ubicacion??"tanque_propio"} onChange={e=>setForm({...form,tipo_ubicacion:e.target.value})} className="sel"><option value="tanque_propio">Tanque Propio</option><option value="proveedor">En Proveedor</option></select></div>
                  <div><label className={lCls}>Nombre lugar</label><input type="text" value={form.ubicacion??""} onChange={e=>setForm({...form,ubicacion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="YPF Ruta 34"/></div>
                  <div><label className={lCls}>Precio/litro</label><input type="number" value={form.precio_litro??""} onChange={e=>setForm({...form,precio_litro:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarGasoil} className="bbtn">Guardar</button>
                  <button onClick={()=>{setShowFormGasoil(false);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}
            {gasoil.length===0
              ?<div className="card" style={{padding:"48px 20px",textAlign:"center"}}><div style={{fontSize:40,opacity:0.12,marginBottom:10}}>⛽</div><p style={{color:"#6b8aaa",fontSize:14}}>Sin stock de gasoil</p></div>
              :<div style={{display:"flex",flexDirection:"column",gap:12}}>
                {gasoil.map(g=>{
                  const movsDeTanque=gasoilMovs.filter(m=>m.gasoil_id===g.id);
                  const isActivo=gasoilActivo===g.id;
                  const pppActual=g.precio_ppp||g.precio_litro;
                  return(
                    <div key={g.id} className="card" style={{padding:0,overflow:"hidden"}}>
                      {/* imagen gasoil */}
                      <div style={{position:"relative",height:100}}>
                        <Image src="/stock-gasoil.png" alt="gasoil" fill style={{objectFit:"cover"}} onError={(e:any)=>{e.target.src="/dashboard-bg.png";}}/>
                        <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,transparent 10%,rgba(255,255,255,0.85) 100%)"}}/>
                        <div style={{position:"absolute",bottom:10,left:14}}>
                          <div style={{fontSize:22,fontWeight:800,color:"#0d2137"}}>{g.cantidad_litros.toLocaleString("es-AR")} L</div>
                          <div style={{fontSize:11,color:"#1565c0",fontWeight:600}}>{g.tipo_ubicacion?.replace("_"," ")}{g.ubicacion?` · ${g.ubicacion}`:""}</div>
                        </div>
                        <div style={{position:"absolute",top:8,right:10,display:"flex",gap:6}}>
                          <button onClick={()=>setGasoilActivo(isActivo?null:g.id)} className="abtn" style={{fontSize:11,padding:"4px 10px"}}>{isActivo?"▲":"▼ Historial"}</button>
                          <button onClick={()=>eliminarItem("stock_gasoil",g.id)} style={{background:"rgba(255,255,255,0.70)",border:"1.5px solid rgba(255,255,255,0.92)",borderRadius:10,color:"#aab8c8",cursor:"pointer",padding:"4px 8px",fontSize:13}}>✕</button>
                        </div>
                      </div>
                      <div style={{padding:14}}>
                        {/* PPP info */}
                        <div style={{display:"flex",gap:14,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
                          <span style={{fontSize:12,color:"#6b8aaa"}}>Último precio: <strong style={{color:"#0d2137"}}>${g.precio_litro}/L</strong></span>
                          <span style={{fontSize:13,fontWeight:800,color:"#d97706"}}>PPP: ${pppActual.toFixed(2)}/L</span>
                          <span style={{fontSize:12,color:"#16a34a",fontWeight:600}}>Stock: ${Math.round(g.cantidad_litros*pppActual).toLocaleString("es-AR")}</span>
                        </div>
                        <div style={{display:"flex",gap:8,marginBottom:showFormGasoilMov.startsWith(g.id)?12:0}}>
                          <button onClick={()=>{setShowFormGasoilMov(g.id+"_carga");setForm({fecha_mov:new Date().toISOString().split("T")[0]});}} style={{flex:1,padding:"8px",borderRadius:10,background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.22)",color:"#16a34a",cursor:"pointer",fontWeight:700,fontSize:12}}>⬆️ Registrar carga</button>
                          <button onClick={()=>{setShowFormGasoilMov(g.id+"_consumo");setForm({fecha_mov:new Date().toISOString().split("T")[0]});}} style={{flex:1,padding:"8px",borderRadius:10,background:"rgba(220,38,38,0.07)",border:"1px solid rgba(220,38,38,0.20)",color:"#dc2626",cursor:"pointer",fontWeight:700,fontSize:12}}>⬇️ Registrar consumo</button>
                          {proveedores.filter(p=>p.categoria==="proveedor_gasoil").length>0&&<button onClick={()=>{const p=proveedores.find(x=>x.categoria==="proveedor_gasoil");if(p)enviarWAProveedor(p,"gasoil");}} style={{padding:"8px 12px",borderRadius:10,background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.22)",color:"#16a34a",cursor:"pointer",fontSize:11,fontWeight:700}}>💬 Cotizar</button>}
                        </div>

                        {/* Form mov gasoil */}
                        {(showFormGasoilMov===g.id+"_carga"||showFormGasoilMov===g.id+"_consumo")&&(
                          <div className="form-box fade-in" style={{marginBottom:10}}>
                            <div style={{fontSize:12,fontWeight:800,color:"#1565c0",marginBottom:10}}>{showFormGasoilMov.endsWith("_carga")?"⬆️ Cargar gasoil":"⬇️ Registrar consumo"}</div>
                            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:10}}>
                              <div><label className={lCls}>Litros</label><input type="number" value={form.litros_mov??""} onChange={e=>setForm({...form,litros_mov:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 12px"}}/></div>
                              {showFormGasoilMov.endsWith("_carga")&&<div><label className={lCls}>Precio/litro compra</label><input type="number" value={form.precio_litro_mov??""} onChange={e=>setForm({...form,precio_litro_mov:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 12px"}} placeholder={`PPP: $${pppActual.toFixed(2)}`}/></div>}
                              <div><label className={lCls}>Fecha</label><input type="date" value={form.fecha_mov??""} onChange={e=>setForm({...form,fecha_mov:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 12px"}}/></div>
                              <div><label className={lCls}>Descripción</label><input type="text" value={form.descripcion_mov??""} onChange={e=>setForm({...form,descripcion_mov:e.target.value})} className={iCls} style={{width:"100%",padding:"7px 12px"}} placeholder="Cosecha, tractor..."/></div>
                            </div>
                            {showFormGasoilMov.endsWith("_carga")&&form.litros_mov&&form.precio_litro_mov&&(
                              <div style={{fontSize:11,color:"#d97706",fontWeight:700,padding:"6px 10px",borderRadius:8,background:"rgba(217,119,6,0.08)",marginBottom:8}}>
                                PPP nuevo estimado: ${calcularPPP(g.cantidad_litros,pppActual,Number(form.litros_mov),Number(form.precio_litro_mov)).toFixed(2)}/L
                              </div>
                            )}
                            {showFormGasoilMov.endsWith("_consumo")&&form.litros_mov&&(
                              <div style={{fontSize:11,color:"#dc2626",fontWeight:700,padding:"6px 10px",borderRadius:8,background:"rgba(220,38,38,0.06)",marginBottom:8}}>
                                Costo imputado: ${Math.round(Number(form.litros_mov)*pppActual).toLocaleString("es-AR")} (PPP: ${pppActual.toFixed(2)}/L)
                              </div>
                            )}
                            <div style={{display:"flex",gap:8}}>
                              <button onClick={()=>registrarMovGasoil(g.id,showFormGasoilMov.endsWith("_carga")?"carga":"consumo")} className="bbtn" style={{fontSize:11,padding:"7px 14px"}}>▶ Guardar</button>
                              <button onClick={()=>{setShowFormGasoilMov("");setForm({});}} className="abtn" style={{fontSize:11,padding:"7px 12px"}}>Cancelar</button>
                            </div>
                          </div>
                        )}

                        {/* Historial */}
                        {isActivo&&movsDeTanque.length>0&&(
                          <div style={{borderTop:"1px solid rgba(0,60,140,0.08)",paddingTop:10}}>
                            <div style={{fontSize:10,fontWeight:800,color:"#1565c0",textTransform:"uppercase",marginBottom:8}}>Historial de movimientos</div>
                            <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:180,overflowY:"auto"}}>
                              {movsDeTanque.map(m=>(
                                <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,0.65)"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                                    <span style={{color:m.tipo==="carga"?"#16a34a":"#dc2626",fontSize:12}}>{m.tipo==="carga"?"⬆️":"⬇️"}</span>
                                    <span style={{fontSize:11,color:"#6b8aaa"}}>{m.fecha}</span>
                                    {m.descripcion&&<span style={{fontSize:11,color:"#4a6a8a"}}>{m.descripcion}</span>}
                                    {m.precio_ppp>0&&<span style={{fontSize:10,color:"#d97706",fontWeight:700}}>PPP:${m.precio_ppp.toFixed(2)}</span>}
                                    {m.metodo==="voz"&&<span style={{fontSize:10,color:"#7c3aed"}}>🎤</span>}
                                  </div>
                                  <div style={{textAlign:"right"}}>
                                    <span style={{fontSize:12,fontWeight:800,color:m.tipo==="carga"?"#16a34a":"#dc2626"}}>{m.tipo==="carga"?"+":"-"}{m.litros}L</span>
                                    {m.tipo==="consumo"&&m.precio_ppp>0&&<div style={{fontSize:10,color:"#dc2626",fontWeight:700}}>${Math.round(m.litros*m.precio_ppp).toLocaleString("es-AR")}</div>}
                                  </div>
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
            }
          </div>
        )}

        {/* ══════════════════════════════
            VARIOS
        ══════════════════════════════ */}
        {tab==="varios"&&(
          <div className="fade-in">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              <button onClick={()=>{setShowFormVarios(!showFormVarios);setEditandoVarios(null);setForm({});}} className="bbtn">+ Cargar Item</button>
            </div>
            {showFormVarios&&(
              <div className="card fade-in" style={{padding:14,marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:800,color:"#7c3aed",marginBottom:12}}>{editandoVarios?"✏️ Editar":"+"} Item</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:12}}>
                  <div><label className={lCls}>Nombre</label><input type="text" value={form.nombre??""} onChange={e=>setForm({...form,nombre:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Categoría</label><input type="text" value={form.categoria??""} onChange={e=>setForm({...form,categoria:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="Repuesto, herramienta..."/></div>
                  <div><label className={lCls}>Cantidad</label><input type="number" value={form.cantidad??""} onChange={e=>setForm({...form,cantidad:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                  <div><label className={lCls}>Unidad</label><input type="text" value={form.unidad??""} onChange={e=>setForm({...form,unidad:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}} placeholder="kg, unidad, m..."/></div>
                  <div><label className={lCls}>Ubicación</label><input type="text" value={form.ubicacion??""} onChange={e=>setForm({...form,ubicacion:e.target.value})} className={iCls} style={{width:"100%",padding:"8px 12px"}}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={guardarVarios} className="bbtn">Guardar</button>
                  <button onClick={()=>{setShowFormVarios(false);setEditandoVarios(null);setForm({});}} className="abtn">Cancelar</button>
                </div>
              </div>
            )}
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              {varios.length===0
                ?<div style={{textAlign:"center",padding:"40px 20px",color:"#6b8aaa",fontSize:14}}><div style={{fontSize:40,opacity:0.12,marginBottom:10}}>🔧</div>Sin items registrados</div>
                :<table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>{["Producto","Categoría","Cantidad","Ubicación",""].map(h=><th key={h} style={{textAlign:"left",padding:"10px 12px",fontSize:10,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                  <tbody>{varios.map(v=>(
                    <tr key={v.id} className="row-s" style={{borderBottom:"1px solid rgba(0,60,140,0.05)",transition:"background 0.15s"}}>
                      <td style={{padding:"9px 12px",fontWeight:800,color:"#0d2137"}}>{v.nombre}</td>
                      <td style={{padding:"9px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:6,background:"rgba(124,58,237,0.10)",color:"#7c3aed",fontWeight:700}}>{v.categoria}</span></td>
                      <td style={{padding:"9px 12px",fontWeight:800,color:"#7c3aed"}}>{v.cantidad} {v.unidad}</td>
                      <td style={{padding:"9px 12px",color:"#6b8aaa"}}>{v.ubicacion||"—"}</td>
                      <td style={{padding:"9px 12px"}}>
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>{setEditandoVarios(v.id);setForm({nombre:v.nombre,categoria:v.categoria,cantidad:String(v.cantidad),unidad:v.unidad,ubicacion:v.ubicacion});setShowFormVarios(true);}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:13}}>✏️</button>
                          <button onClick={()=>eliminarItem("stock_varios",v.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#aab8c8",fontSize:14}}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              }
            </div>
          </div>
        )}
      </div>

      {/* Panel voz */}
      {vozPanel&&(
        <div style={{position:"fixed",bottom:80,right:16,zIndex:50,width:288,borderRadius:18,overflow:"hidden",background:"rgba(255,255,255,0.94)",backdropFilter:"blur(16px)",border:"1px solid rgba(255,255,255,0.95)",boxShadow:"0 12px 36px rgba(20,80,160,0.16)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 13px",borderBottom:"1px solid rgba(0,60,140,0.07)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:6,height:6,borderRadius:"50%",background:VOZ_COLOR[vozEstado]}}/><span style={{fontSize:12,fontWeight:700,color:"#0d2137"}}>🎤 Asistente de Stock</span></div>
            <button onClick={()=>{setVozPanel(false);window.speechSynthesis?.cancel();recRef.current?.stop();setVozEstado("idle");}} style={{background:"none",border:"none",cursor:"pointer",color:"#6b8aaa",fontSize:18}}>✕</button>
          </div>
          <div style={{padding:"10px 12px",minHeight:72}}>
            {vozEstado==="escuchando"&&<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:12,color:"#dc2626",fontWeight:700}}>🔴 Escuchando...</span></div>}
            {vozEstado==="procesando"&&<p style={{fontSize:12,color:"#d97706",fontWeight:700}}>⚙️ Procesando...</p>}
            {vozTranscripcion&&vozEstado!=="escuchando"&&vozEstado!=="procesando"&&<div style={{padding:"6px 10px",borderRadius:8,background:"rgba(0,60,140,0.05)",marginBottom:6}}><p style={{fontSize:11,color:"#6b8aaa",margin:0,fontStyle:"italic"}}>"{vozTranscripcion}"</p></div>}
            {vozRespuesta&&<div style={{background:"rgba(22,163,74,0.08)",border:"1px solid rgba(22,163,74,0.20)",borderRadius:10,padding:"8px 12px",marginBottom:6}}><p style={{fontSize:12,color:"#0d2137",margin:0,lineHeight:1.5}}>{vozRespuesta}</p></div>}
            {!vozRespuesta&&!vozTranscripcion&&vozEstado==="idle"&&(
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {["¿Cuánto gasoil tengo?","¿Qué insumos me quedan?","Usé 200 litros de gasoil","¿Cuánto stock de soja?"].map(q=>(
                  <button key={q} onClick={()=>{setVozTranscripcion(q);interpretarVoz(q);}} style={{textAlign:"left",fontSize:11,color:"#4a6a8a",padding:"6px 10px",borderRadius:8,background:"rgba(255,255,255,0.70)",border:"1px solid rgba(255,255,255,0.90)",cursor:"pointer"}}>💬 {q}</button>
                ))}
              </div>
            )}
          </div>
          <div style={{padding:"6px 10px 10px",display:"flex",gap:6,borderTop:"1px solid rgba(0,60,140,0.07)"}}>
            <input value={vozInput} onChange={e=>setVozInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&vozInput.trim()){setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}}} placeholder="Escribí o hablá..." className={iCls} style={{flex:1,padding:"7px 11px",fontSize:12}}/>
            <button onClick={()=>{if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else escucharVoz();}} style={{padding:"7px 11px",borderRadius:10,fontSize:14,background:VOZ_COLOR[vozEstado]+"20",border:`1px solid ${VOZ_COLOR[vozEstado]}40`,color:VOZ_COLOR[vozEstado],cursor:"pointer"}}>{VOZ_ICON[vozEstado]}</button>
            {vozInput&&<button onClick={()=>{setVozTranscripcion(vozInput);interpretarVoz(vozInput);setVozInput("");}} className="bbtn" style={{padding:"7px 11px",fontSize:12}}>→</button>}
          </div>
        </div>
      )}

      {/* Botón voz flotante */}
      <button onClick={()=>{if(vozEstado==="idle"){setVozPanel(true);escucharVoz();}else if(vozEstado==="escuchando"){recRef.current?.stop();setVozEstado("idle");}else setVozPanel(!vozPanel);}}
        style={{position:"fixed",bottom:20,right:16,zIndex:40,width:52,height:52,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,cursor:"pointer",backgroundImage:"url('/AZUL.png')",backgroundSize:"cover",backgroundPosition:"center",color:"white",border:"2px solid rgba(180,220,255,0.70)",boxShadow:"0 4px 22px rgba(33,150,243,0.55)",animation:vozEstado==="idle"?"float 3s ease-in-out infinite":"none",transition:"all 0.2s ease"}}>
        {VOZ_ICON[vozEstado]}
      </button>

      <p style={{textAlign:"center",fontSize:11,color:"rgba(30,58,90,0.45)",fontWeight:600,letterSpacing:"0.20em",paddingBottom:16,paddingTop:4}}>© AgroGestión PRO · STOCK</p>
      {empresaId&&<EscanerIA empresaId={empresaId}/>}
    </div>
  );
}
