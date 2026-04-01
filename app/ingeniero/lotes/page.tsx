"use client";
// app/ingeniero/lotes/page.tsx
// Vista de lotes del productor desde el panel del ingeniero
// El ingeniero puede: ver lotes, agregar labores, editar cultivo/estado
// NO puede: eliminar lotes, ver finanzas, gestionar contratos

import { useEffect, useState } from "react";

type Lote = {
  id: string; nombre: string; hectareas: number;
  tipo_tenencia: string; partido: string; provincia: string;
  cultivo: string; cultivo_orden: string; cultivo_completo: string;
  campana_id: string; fecha_siembra: string; fecha_cosecha: string;
  variedad: string; hibrido: string;
  rendimiento_esperado: number; rendimiento_real: number;
  estado: string; es_segundo_cultivo: boolean;
  observaciones: string;
};
type Labor = {
  id: string; lote_id: string; fecha: string; tipo: string;
  descripcion: string; superficie_ha: number; maquinaria: string;
  operario: string; costo_total: number; observaciones: string;
};
type Campana = { id: string; nombre: string; activa: boolean; };

const CULTIVOS_LISTA = [
  { cultivo:"soja", orden:"1ra", label:"SOJA 1RA", color:"#4ADE80", icon:"🌱" },
  { cultivo:"soja", orden:"2da", label:"SOJA 2DA", color:"#86EFAC", icon:"🌿" },
  { cultivo:"maiz", orden:"1ro_temprano", label:"MAIZ 1RO", color:"#C9A227", icon:"🌽" },
  { cultivo:"maiz", orden:"1ro_tardio", label:"MAIZ 1RO TARDIO", color:"#D97706", icon:"🌽" },
  { cultivo:"maiz", orden:"2do", label:"MAIZ 2DO", color:"#FCD34D", icon:"🌽" },
  { cultivo:"trigo", orden:"1ro", label:"TRIGO 1RO", color:"#F59E0B", icon:"🌾" },
  { cultivo:"girasol", orden:"1ro", label:"GIRASOL 1RO", color:"#FBBF24", icon:"🌻" },
  { cultivo:"girasol", orden:"2do", label:"GIRASOL 2DO", color:"#FDE68A", icon:"🌻" },
  { cultivo:"sorgo", orden:"1ro", label:"SORGO 1RO", color:"#F87171", icon:"🌿" },
  { cultivo:"sorgo", orden:"2do", label:"SORGO 2DO", color:"#FCA5A5", icon:"🌿" },
  { cultivo:"cebada", orden:"1ra", label:"CEBADA 1RA", color:"#A78BFA", icon:"🍃" },
  { cultivo:"arveja", orden:"1ra", label:"ARVEJA 1RA", color:"#34D399", icon:"🫛" },
  { cultivo:"vicia", orden:"cobertura", label:"VICIA COBERTURA", color:"#6EE7B7", icon:"🌱" },
  { cultivo:"verdeo", orden:"invierno", label:"VERDEO INVIERNO", color:"#60A5FA", icon:"🌾" },
  { cultivo:"verdeo", orden:"verano", label:"VERDEO VERANO", color:"#93C5FD", icon:"🌾" },
];
const TIPOS_LABOR = ["Siembra","Aplicacion","Fertilizacion","Cosecha","Labranza","Riego","Control malezas","Recorrida","Otro"];
const ESTADOS = [
  {v:"planificado",l:"PLANIFICADO",c:"#6B7280"},
  {v:"sembrado",l:"SEMBRADO",c:"#4ADE80"},
  {v:"en_desarrollo",l:"EN DESARROLLO",c:"#C9A227"},
  {v:"cosechado",l:"COSECHADO",c:"#60A5FA"},
  {v:"barbecho",l:"BARBECHO",c:"#A78BFA"},
];

function naturalSort(a: string, b: string): number {
  const seg = (s: string) => {
    const p: Array<string|number> = []; let i = 0;
    while (i < s.length) {
      if (s[i] >= "0" && s[i] <= "9") {
        let n = ""; while (i < s.length && s[i] >= "0" && s[i] <= "9") { n += s[i]; i++; }
        p.push(parseInt(n, 10));
      } else {
        let t = ""; while (i < s.length && !(s[i] >= "0" && s[i] <= "9")) { t += s[i]; i++; }
        p.push(t.toLowerCase());
      }
    }
    return p;
  };
  const pa = seg(a); const pb = seg(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0; const vb = pb[i] ?? 0;
    if (typeof va === "number" && typeof vb === "number") { if (va !== vb) return va - vb; }
    else { const sa = String(va); const sb = String(vb); if (sa < sb) return -1; if (sa > sb) return 1; }
  }
  return 0;
}

function getCultivoInfo(cultivo: string, orden: string) {
  if (!cultivo) return { label:"SIN CULTIVO", color:"#4B5563", icon:"🌾" };
  return CULTIVOS_LISTA.find(c => c.cultivo===cultivo && c.orden===orden) ||
    CULTIVOS_LISTA.find(c => c.cultivo===cultivo) ||
    { label: cultivo.toUpperCase(), color:"#6B7280", icon:"🌱" };
}

export default function IngenieroLotesPage() {
  const [empresaId, setEmpresaId] = useState<string>("");
  const [empresaNombre, setEmpresaNombre] = useState<string>("");
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [labores, setLabores] = useState<Labor[]>([]);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [campanaActiva, setCampanaActiva] = useState<string>("");
  const [loteActivo, setLoteActivo] = useState<Lote|null>(null);
  const [loading, setLoading] = useState(true);
  const [showFormLabor, setShowFormLabor] = useState(false);
  const [showFormEditarLote, setShowFormEditarLote] = useState(false);
  const [editandoLabor, setEditandoLabor] = useState<string|null>(null);
  const [form, setForm] = useState<Record<string,string>>({});
  const [msgExito, setMsgExito] = useState("");
  const [filterCultivo, setFilterCultivo] = useState("todos");
  const [ingenieroNombre, setIngenieroNombre] = useState("");

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
    setIngenieroNombre(u.nombre);

    // Obtener empresa del localStorage
    const eid = localStorage.getItem("ing_empresa_id") ?? "";
    const enombre = localStorage.getItem("ing_empresa_nombre") ?? "";
    if (!eid) { window.location.href = "/ingeniero"; return; }
    setEmpresaId(eid); setEmpresaNombre(enombre);

    // Traer campañas de esa empresa
    const { data: camps } = await sb.from("campanas").select("*").eq("empresa_id", eid).order("año_inicio", { ascending: false });
    setCampanas(camps ?? []);
    const activa = (camps ?? []).find(c => c.activa)?.id ?? (camps ?? [])[0]?.id ?? "";
    setCampanaActiva(activa);
    if (activa) await fetchLotes(eid, activa);
    setLoading(false);
  };

  const fetchLotes = async (eid: string, cid: string) => {
    const sb = await getSB();
    const [ls, lbs] = await Promise.all([
      sb.from("lotes").select("*").eq("empresa_id", eid).eq("campana_id", cid),
      sb.from("lote_labores").select("*").eq("empresa_id", eid).order("fecha", { ascending: false }),
    ]);
    const sorted = (ls.data ?? []).sort((a: any, b: any) => naturalSort(a.nombre ?? "", b.nombre ?? ""));
    setLotes(sorted);
    setLabores(lbs.data ?? []);
  };

  const msg = (t: string) => { setMsgExito(t); setTimeout(() => setMsgExito(""), 3000); };

  // Guardar labor (ingeniero puede agregar labores)
  const guardarLabor = async () => {
    if (!loteActivo || !empresaId) return;
    const sb = await getSB();
    const payload = {
      empresa_id: empresaId, lote_id: loteActivo.id, campana_id: campanaActiva,
      fecha: form.fecha_lab ?? new Date().toISOString().split("T")[0],
      tipo: form.tipo_lab ?? "Aplicacion", descripcion: form.descripcion_lab ?? "",
      superficie_ha: Number(form.superficie_ha ?? loteActivo.hectareas ?? 0),
      maquinaria: form.maquinaria ?? "", operario: form.operario ?? ingenieroNombre,
      costo_total: Number(form.costo_total_lab ?? 0), observaciones: form.obs_lab ?? "",
      metodo_carga: "ingeniero",
    };
    if (editandoLabor) {
      await sb.from("lote_labores").update(payload).eq("id", editandoLabor);
      setEditandoLabor(null);
    } else {
      await sb.from("lote_labores").insert(payload);
    }
    msg("✅ LABOR GUARDADA");
    await fetchLotes(empresaId, campanaActiva);
    setShowFormLabor(false); setForm({});
  };

  // Editar cultivo/estado/variedad del lote (ingeniero puede editar esto)
  const guardarEdicionLote = async () => {
    if (!loteActivo || !empresaId) return;
    const sb = await getSB();
    const ci = CULTIVOS_LISTA.find(c => c.cultivo+"|"+c.orden === form.cultivo_key);
    const payload: Record<string,any> = { estado: form.estado ?? loteActivo.estado };
    if (ci) { payload.cultivo = ci.cultivo; payload.cultivo_orden = ci.orden; payload.cultivo_completo = ci.label; }
    if (form.variedad?.trim()) { payload.variedad = form.variedad.trim(); payload.hibrido = form.variedad.trim(); }
    if (form.fecha_siembra) payload.fecha_siembra = form.fecha_siembra;
    if (form.fecha_cosecha) payload.fecha_cosecha = form.fecha_cosecha;
    if (form.rendimiento_esperado) payload.rendimiento_esperado = Number(form.rendimiento_esperado);
    if (form.rendimiento_real) payload.rendimiento_real = Number(form.rendimiento_real);
    if (form.observaciones !== undefined) payload.observaciones = form.observaciones;
    const { error } = await sb.from("lotes").update(payload).eq("id", loteActivo.id);
    if (error) { msg("❌ " + error.message); return; }
    // Actualizar lote activo
    const { data: updated } = await sb.from("lotes").select("*").eq("id", loteActivo.id).single();
    if (updated) setLoteActivo(updated);
    msg("✅ LOTE ACTUALIZADO");
    await fetchLotes(empresaId, campanaActiva);
    setShowFormEditarLote(false); setForm({});
  };

  const eliminarLabor = async (id: string) => {
    if (!confirm("Eliminar labor?")) return;
    const sb = await getSB();
    await sb.from("lote_labores").delete().eq("id", id);
    if (empresaId) await fetchLotes(empresaId, campanaActiva);
  };

  const exportarCuaderno = async () => {
    if (!loteActivo) return;
    const XLSX = await import("xlsx");
    const labsLote = labores.filter(l => l.lote_id === loteActivo.id);
    const data = labsLote.map(l => ({
      LOTE: loteActivo.nombre, FECHA: l.fecha, TIPO: l.tipo,
      DESCRIPCION: l.descripcion, HA: l.superficie_ha,
      MAQUINARIA: l.maquinaria || "", OPERARIO: l.operario || "",
      COSTO: l.costo_total || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Labores");
    XLSX.writeFile(wb, "cuaderno_" + loteActivo.nombre + "_" + new Date().toISOString().slice(0,10) + ".xlsx");
  };

  const iCls = "w-full bg-[#0a1628]/80 border border-[#00FF80]/20 rounded-xl px-4 py-2.5 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all";
  const lCls = "block text-xs text-[#4B6B5B] uppercase tracking-widest mb-1 font-mono";

  // Datos para filtro y stats
  const lotesPrincipales = (() => {
    const vistos: string[] = [];
    return lotes.filter(l => !l.es_segundo_cultivo).filter(l => {
      const k = l.nombre.toLowerCase().trim();
      if (vistos.includes(k)) return false; vistos.push(k); return true;
    });
  })();
  const totalHa = lotesPrincipales.reduce((a,l) => a+(l.hectareas||0), 0);
  const cultivosUnicos = [...new Set(lotesPrincipales.map(l => l.cultivo_completo||l.cultivo).filter(Boolean))];
  const laboresLote = loteActivo ? labores.filter(l => l.lote_id === loteActivo.id) : [];
  const cultivoActivoInfo = loteActivo ? getCultivoInfo(loteActivo.cultivo||"", loteActivo.cultivo_orden||"") : null;
  const usaHibrido = loteActivo ? ["maiz","girasol","sorgo"].includes(loteActivo.cultivo||"") : false;

  if (loading) return <div className="min-h-screen bg-[#020810] flex items-center justify-center text-[#00FF80] font-mono animate-pulse">CARGANDO LOTES...</div>;

  return (
    <div className="min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        .card-l{background:rgba(10,22,40,0.85);border:1px solid rgba(201,162,39,0.18);border-radius:12px;transition:all 0.2s}
        .card-l:hover{border-color:rgba(201,162,39,0.4)}
        .lote-card:hover{border-color:rgba(0,255,128,0.5)!important;transform:translateY(-2px)}
        .lote-card{cursor:pointer;transition:all 0.2s}
      `}</style>

      {/* HEADER */}
      <div className="bg-[#020810]/95 border-b border-[#00FF80]/20 px-6 py-3 flex items-center gap-4">
        <button onClick={() => loteActivo ? setLoteActivo(null) : window.location.href="/ingeniero"}
          className="text-[#4B5563] hover:text-[#00FF80] font-mono text-sm transition-colors">
          ← {loteActivo ? "VOLVER A LOTES" : "MI PANEL"}
        </button>
        <div className="flex-1"/>
        <div className="text-right">
          <div className="text-xs text-[#E5E7EB] font-mono font-bold uppercase">{empresaNombre}</div>
          <div className="text-xs text-[#00FF80] font-mono">{ingenieroNombre} · INGENIERO</div>
        </div>
        {/* Selector campaña */}
        <select value={campanaActiva} onChange={async e => { setCampanaActiva(e.target.value); await fetchLotes(empresaId, e.target.value); setLoteActivo(null); }}
          className="bg-[#0a1628]/80 border border-[#00FF80]/25 rounded-lg px-3 py-1.5 text-[#00FF80] text-xs font-mono focus:outline-none">
          {campanas.filter((c,i,arr)=>arr.findIndex(x=>x.nombre===c.nombre)===i).map(c=>(
            <option key={c.id} value={c.id}>{c.nombre}{c.activa?" ★":""}</option>
          ))}
        </select>
      </div>

      <div className="max-w-7xl mx-auto p-5">
        {msgExito && <div className={"mb-4 px-4 py-2 rounded-lg text-sm font-mono border flex items-center justify-between " + (msgExito.startsWith("✅")?"border-[#4ADE80]/30 text-[#4ADE80] bg-[#4ADE80]/5":"border-[#F87171]/30 text-[#F87171] bg-[#F87171]/5")}>{msgExito}<button onClick={()=>setMsgExito("")}>✕</button></div>}

        {/* Aviso modo ingeniero */}
        <div className="bg-[#0a1628]/60 border border-[#60A5FA]/20 rounded-xl px-4 py-2 mb-4 flex items-center gap-3">
          <span className="text-[#60A5FA] text-sm">🔬</span>
          <p className="text-xs text-[#6B7280] font-mono">MODO INGENIERO — Podes agregar labores y editar cultivo/estado. Los datos son compartidos con el productor en tiempo real.</p>
        </div>

        {/* ===== DETALLE LOTE ===== */}
        {loteActivo && (
          <div className="space-y-4">
            {/* Header lote */}
            <div className="card-l p-5 flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{background:cultivoActivoInfo?.color}}/>
                <span className="text-3xl">{cultivoActivoInfo?.icon}</span>
                <div>
                  <h2 className="text-2xl font-bold text-white font-mono uppercase">{loteActivo.nombre}</h2>
                  <div className="flex items-center gap-3 text-xs font-mono mt-1 flex-wrap">
                    <span className="text-[#C9A227] font-bold">{loteActivo.hectareas} HA</span>
                    <span className="px-2 py-0.5 rounded-full font-bold uppercase" style={{background:(cultivoActivoInfo?.color??"#6B7280")+"20",color:cultivoActivoInfo?.color??"#6B7280"}}>{loteActivo.cultivo_completo||loteActivo.cultivo||"SIN CULTIVO"}</span>
                    {(() => { const e=ESTADOS.find(x=>x.v===loteActivo.estado); return e?<span className="px-2 py-0.5 rounded-full font-bold" style={{background:e.c+"20",color:e.c}}>{e.l}</span>:null; })()}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => {
                  const ci = CULTIVOS_LISTA.find(c=>c.cultivo===loteActivo.cultivo&&c.orden===loteActivo.cultivo_orden);
                  setForm({
                    cultivo_key: ci?ci.cultivo+"|"+ci.orden:"soja|1ra",
                    estado: loteActivo.estado||"planificado",
                    variedad: loteActivo.variedad||loteActivo.hibrido||"",
                    fecha_siembra: loteActivo.fecha_siembra||"",
                    fecha_cosecha: loteActivo.fecha_cosecha||"",
                    rendimiento_esperado: String(loteActivo.rendimiento_esperado||""),
                    rendimiento_real: String(loteActivo.rendimiento_real||""),
                    observaciones: loteActivo.observaciones||"",
                  });
                  setShowFormEditarLote(true);
                }} className="px-3 py-2 rounded-xl bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-mono text-xs font-bold hover:bg-[#C9A227]/25">✏️ EDITAR</button>
                <button onClick={()=>{setShowFormLabor(true);setEditandoLabor(null);setForm({operario:ingenieroNombre,superficie_ha:String(loteActivo.hectareas),fecha_lab:new Date().toISOString().split("T")[0]});}} className="px-3 py-2 rounded-xl bg-[#4ADE80]/15 border border-[#4ADE80]/40 text-[#4ADE80] font-mono text-xs font-bold hover:bg-[#4ADE80]/25">+ LABOR</button>
                <button onClick={exportarCuaderno} className="px-3 py-2 rounded-xl border border-[#60A5FA]/30 text-[#60A5FA] font-mono text-xs font-bold hover:bg-[#60A5FA]/10">📤 EXPORTAR</button>
              </div>
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {l:"TENENCIA",v:loteActivo.tipo_tenencia||"—",c:"#C9A227"},
                {l:"PARTIDO",v:loteActivo.partido||"—",c:"#9CA3AF"},
                {l:usaHibrido?"HIBRIDO":"VARIEDAD",v:loteActivo.variedad||loteActivo.hibrido||"—",c:"#4ADE80"},
                {l:"F. SIEMBRA",v:loteActivo.fecha_siembra||"SIN FECHA",c:"#60A5FA"},
                {l:"F. COSECHA",v:loteActivo.fecha_cosecha||"—",c:"#A78BFA"},
                {l:"REND. ESPERADO",v:loteActivo.rendimiento_esperado?loteActivo.rendimiento_esperado+" TN/HA":"—",c:"#C9A227"},
                {l:"REND. REAL",v:loteActivo.rendimiento_real?loteActivo.rendimiento_real+" TN/HA":"—",c:loteActivo.rendimiento_real?"#4ADE80":"#4B5563"},
                {l:"LABORES",v:laboresLote.length+" registros",c:"#E5E7EB"},
              ].map(s=>(
                <div key={s.l} className="card-l p-3">
                  <div className="text-xs text-[#4B5563] font-mono uppercase tracking-wider">{s.l}</div>
                  <div className="text-sm font-bold font-mono mt-1 uppercase" style={{color:s.c}}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Form editar cultivo/estado */}
            {showFormEditarLote && (
              <div className="card-l p-5">
                <h3 className="text-[#C9A227] font-mono text-sm font-bold mb-4">✏️ EDITAR LOTE — {loteActivo.nombre}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2"><label className={lCls}>CULTIVO</label>
                    <select value={form.cultivo_key??"soja|1ra"} onChange={e=>setForm({...form,cultivo_key:e.target.value})} className={iCls}>
                      <optgroup label="SOJA"><option value="soja|1ra">🌱 SOJA 1RA</option><option value="soja|2da">🌿 SOJA 2DA</option></optgroup>
                      <optgroup label="MAIZ"><option value="maiz|1ro_temprano">🌽 MAIZ 1RO</option><option value="maiz|1ro_tardio">🌽 MAIZ 1RO TARDIO</option><option value="maiz|2do">🌽 MAIZ 2DO</option></optgroup>
                      <optgroup label="INVIERNO"><option value="trigo|1ro">🌾 TRIGO 1RO</option><option value="cebada|1ra">🍃 CEBADA 1RA</option><option value="arveja|1ra">🫛 ARVEJA 1RA</option></optgroup>
                      <optgroup label="OTROS"><option value="girasol|1ro">🌻 GIRASOL 1RO</option><option value="girasol|2do">🌻 GIRASOL 2DO</option><option value="sorgo|1ro">🌿 SORGO 1RO</option><option value="sorgo|2do">🌿 SORGO 2DO</option><option value="vicia|cobertura">🌱 VICIA COBERTURA</option><option value="verdeo|invierno">🌾 VERDEO INVIERNO</option><option value="verdeo|verano">🌾 VERDEO VERANO</option></optgroup>
                    </select>
                  </div>
                  <div><label className={lCls}>{(() => { const ci=CULTIVOS_LISTA.find(c=>c.cultivo+"|"+c.orden===form.cultivo_key); return ["maiz","girasol","sorgo"].includes(ci?.cultivo??"")?"HIBRIDO":"VARIEDAD"; })()}</label>
                    <input type="text" value={form.variedad??""} onChange={e=>setForm({...form,variedad:e.target.value})} className={iCls} placeholder="DM4612, ALFORJA..."/>
                  </div>
                  <div><label className={lCls}>ESTADO</label>
                    <select value={form.estado??"planificado"} onChange={e=>setForm({...form,estado:e.target.value})} className={iCls}>
                      {ESTADOS.map(e=><option key={e.v} value={e.v}>{e.l}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>FECHA SIEMBRA</label><input type="date" value={form.fecha_siembra??""} onChange={e=>setForm({...form,fecha_siembra:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>FECHA COSECHA</label><input type="date" value={form.fecha_cosecha??""} onChange={e=>setForm({...form,fecha_cosecha:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>REND. ESPERADO TN/HA</label><input type="number" value={form.rendimiento_esperado??""} onChange={e=>setForm({...form,rendimiento_esperado:e.target.value})} className={iCls} placeholder="0"/></div>
                  <div><label className={lCls}>REND. REAL TN/HA</label><input type="number" value={form.rendimiento_real??""} onChange={e=>setForm({...form,rendimiento_real:e.target.value})} className={iCls} placeholder="Al cosechar"/></div>
                  <div className="md:col-span-2"><label className={lCls}>OBSERVACIONES</label><input type="text" value={form.observaciones??""} onChange={e=>setForm({...form,observaciones:e.target.value})} className={iCls}/></div>
                </div>
                {/* Cambio estado rapido */}
                <div className="mt-4 pt-4 border-t border-[#C9A227]/15">
                  <span className="text-xs text-[#4B5563] font-mono uppercase">CAMBIAR ESTADO:</span>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {ESTADOS.map(e=>(
                      <button key={e.v} onClick={()=>setForm({...form,estado:e.v})} className="px-3 py-1.5 rounded-lg text-xs font-mono border transition-all font-bold"
                        style={{borderColor:form.estado===e.v?e.c:e.c+"30",background:form.estado===e.v?e.c+"20":"transparent",color:e.c}}>
                        {e.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarEdicionLote} className="bg-[#C9A227]/15 border border-[#C9A227]/40 text-[#C9A227] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#C9A227]/25">▶ GUARDAR</button>
                  <button onClick={()=>{setShowFormEditarLote(false);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}

            {/* Form nueva labor */}
            {showFormLabor && (
              <div className="card-l p-5">
                <h3 className="text-[#4ADE80] font-mono text-sm font-bold mb-4">{editandoLabor?"✏️ EDITAR":"+"} LABOR — {loteActivo.nombre}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className={lCls}>TIPO</label>
                    <select value={form.tipo_lab??"Aplicacion"} onChange={e=>setForm({...form,tipo_lab:e.target.value})} className={iCls}>
                      {TIPOS_LABOR.map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div><label className={lCls}>FECHA</label><input type="date" value={form.fecha_lab??new Date().toISOString().split("T")[0]} onChange={e=>setForm({...form,fecha_lab:e.target.value})} className={iCls}/></div>
                  <div className="md:col-span-2"><label className={lCls}>DESCRIPCION</label><input type="text" value={form.descripcion_lab??""} onChange={e=>setForm({...form,descripcion_lab:e.target.value})} className={iCls} placeholder="EJ: GLIFOSATO 4L/HA + 2,4D 0.5L/HA"/></div>
                  <div><label className={lCls}>SUPERFICIE HA</label><input type="number" value={form.superficie_ha??String(loteActivo.hectareas)} onChange={e=>setForm({...form,superficie_ha:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>MAQUINARIA</label><input type="text" value={form.maquinaria??""} onChange={e=>setForm({...form,maquinaria:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>OPERARIO</label><input type="text" value={form.operario??ingenieroNombre} onChange={e=>setForm({...form,operario:e.target.value})} className={iCls}/></div>
                  <div><label className={lCls}>COSTO TOTAL $</label><input type="number" value={form.costo_total_lab??""} onChange={e=>setForm({...form,costo_total_lab:e.target.value})} className={iCls}/></div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={guardarLabor} className="bg-[#4ADE80]/10 border border-[#4ADE80]/30 text-[#4ADE80] font-bold px-6 py-2.5 rounded-xl text-sm font-mono hover:bg-[#4ADE80]/20">▶ GUARDAR</button>
                  <button onClick={()=>{setShowFormLabor(false);setEditandoLabor(null);setForm({});}} className="border border-[#1C2128] text-[#4B5563] px-6 py-2.5 rounded-xl text-sm font-mono">CANCELAR</button>
                </div>
              </div>
            )}

            {/* Historial labores */}
            <div className="card-l overflow-hidden">
              <div className="px-5 py-3 border-b border-[#C9A227]/15 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[#C9A227] font-mono text-sm font-bold">📋 HISTORIAL DE LABORES</span>
                  <span className="text-xs text-[#4B5563] font-mono">{laboresLote.length} REGISTROS</span>
                </div>
                <button onClick={exportarCuaderno} className="text-xs text-[#4ADE80] font-mono border border-[#4ADE80]/20 px-3 py-1.5 rounded-lg hover:bg-[#4ADE80]/10 font-bold">📤 EXPORTAR</button>
              </div>
              {laboresLote.length===0 ? <div className="text-center py-10 text-[#4B5563] font-mono text-sm">SIN LABORES REGISTRADAS</div> : (
                <table className="w-full">
                  <thead><tr className="border-b border-[#C9A227]/10">{["FECHA","TIPO","DESCRIPCION","HA","OPERARIO","COSTO",""].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs text-[#4B5563] font-mono">{h}</th>)}</tr></thead>
                  <tbody>{laboresLote.sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(l=>(
                    <tr key={l.id} className="border-b border-[#C9A227]/5 hover:bg-[#C9A227]/5">
                      <td className="px-4 py-3 text-xs text-[#6B7280] font-mono">{l.fecha}</td>
                      <td className="px-4 py-3"><span className="text-xs bg-[#C9A227]/10 text-[#C9A227] px-2 py-0.5 rounded font-mono font-bold">{l.tipo}</span></td>
                      <td className="px-4 py-3 text-sm text-[#E5E7EB] font-mono">{l.descripcion}</td>
                      <td className="px-4 py-3 text-sm text-[#9CA3AF] font-mono">{l.superficie_ha}</td>
                      <td className="px-4 py-3 text-xs text-[#9CA3AF] font-mono">{l.operario||"—"}</td>
                      <td className="px-4 py-3 font-bold text-[#C9A227] font-mono">{l.costo_total?"$"+Number(l.costo_total).toLocaleString("es-AR"):"-"}</td>
                      <td className="px-4 py-3 flex gap-2">
                        <button onClick={()=>{setEditandoLabor(l.id);setForm({tipo_lab:l.tipo,fecha_lab:l.fecha,descripcion_lab:l.descripcion,superficie_ha:String(l.superficie_ha),maquinaria:l.maquinaria,operario:l.operario,costo_total_lab:String(l.costo_total)});setShowFormLabor(true);}} className="text-[#C9A227] text-xs">✏️</button>
                        <button onClick={()=>eliminarLabor(l.id)} className="text-[#4B5563] hover:text-red-400 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== LISTA LOTES ===== */}
        {!loteActivo && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h1 className="text-xl font-bold text-white font-mono uppercase">{empresaNombre}</h1>
                <p className="text-xs text-[#00FF80] font-mono mt-0.5">{lotesPrincipales.length} LOTES · {totalHa.toLocaleString("es-AR")} HA</p>
              </div>
            </div>

            {/* KPIs + filtros */}
            <div className="flex items-start gap-3 mb-4 flex-wrap">
              <div className="flex gap-2">
                {[{l:"LOTES",v:String(lotesPrincipales.length),c:"#E5E7EB"},{l:"HA",v:totalHa.toLocaleString("es-AR"),c:"#C9A227"},{l:"CULTIVOS",v:String(cultivosUnicos.length),c:"#4ADE80"}].map(s=>(
                  <div key={s.l} className="card-l px-3 py-2 text-center" style={{minWidth:68}}>
                    <div className="text-xs text-[#4B5563] font-mono">{s.l}</div>
                    <div className="text-sm font-bold font-mono mt-0.5" style={{color:s.c}}>{s.v}</div>
                  </div>
                ))}
              </div>
              {/* Filtros cultivo */}
              <div className="flex gap-1.5 flex-wrap items-center">
                <button onClick={()=>setFilterCultivo("todos")} className={"px-3 py-1.5 rounded-lg text-xs font-mono border transition-all font-bold " + (filterCultivo==="todos"?"border-[#C9A227] text-[#C9A227] bg-[#C9A227]/15":"border-[#C9A227]/20 text-[#4B5563] hover:text-[#9CA3AF]")}>
                  TODOS ({lotesPrincipales.length})
                </button>
                {cultivosUnicos.map(c=>{
                  const info=getCultivoInfo(c.split(" ")[0].toLowerCase(),"");
                  const count=lotesPrincipales.filter(l=>(l.cultivo_completo||l.cultivo)===c).length;
                  return(
                    <button key={c} onClick={()=>setFilterCultivo(filterCultivo===c?"todos":c)}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono border transition-all font-bold"
                      style={{borderColor:filterCultivo===c?info.color:info.color+"50",background:filterCultivo===c?info.color+"20":"transparent",color:filterCultivo===c?info.color:info.color+"90"}}>
                      {c} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {lotesPrincipales.length===0 ? (
              <div className="text-center py-20 card-l">
                <div className="text-5xl mb-4 opacity-20">🌾</div>
                <p className="text-[#4B5563] font-mono">SIN LOTES EN ESTA CAMPAÑA</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {lotesPrincipales.filter(lote => {
                  if (filterCultivo==="todos") return true;
                  return (lote.cultivo_completo||lote.cultivo)===filterCultivo;
                }).map(lote => {
                  const ci = getCultivoInfo(lote.cultivo||"", lote.cultivo_orden||"");
                  const labsCount = labores.filter(l=>l.lote_id===lote.id).length;
                  const est = ESTADOS.find(e=>e.v===lote.estado);
                  return (
                    <div key={lote.id} className="lote-card card-l overflow-hidden" onClick={()=>setLoteActivo(lote)}>
                      <div className="flex items-center gap-3 p-4 border-b border-[#C9A227]/10">
                        <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{background:ci.color}}/>
                        <span className="text-xl flex-shrink-0">{ci.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white font-mono uppercase truncate">{lote.nombre}</div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs font-bold font-mono" style={{color:ci.color}}>{ci.label}</span>
                            {est&&<span className="text-xs px-1.5 py-0.5 rounded font-mono font-bold" style={{background:est.c+"20",color:est.c}}>{est.l}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="px-4 py-3 grid grid-cols-3 gap-2 text-xs font-mono">
                        <div className="text-center"><div className="text-[#4B5563]">HA</div><div className="font-bold text-[#C9A227] mt-0.5">{lote.hectareas}</div></div>
                        <div className="text-center"><div className="text-[#4B5563]">LABORES</div><div className="font-bold text-[#E5E7EB] mt-0.5">{labsCount}</div></div>
                        <div className="text-center"><div className="text-[#4B5563]">SIEMBRA</div><div className="font-bold text-[#60A5FA] mt-0.5 text-xs">{lote.fecha_siembra?.slice(5)||"—"}</div></div>
                      </div>
                      {(lote.variedad||lote.hibrido)&&<div className="px-4 pb-3 text-xs font-mono text-[#6B7280]">🌱 {lote.variedad||lote.hibrido}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="text-center text-[#0a2a1a] text-xs pb-4 tracking-widest font-mono mt-6">AGROGESTION PRO · INGENIERO · {empresaNombre.toUpperCase()}</p>
    </div>
  );
}
