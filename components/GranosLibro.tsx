// ══════════════════════════════════════════════
// GRANOS LIBRO — Componente completo
// Stock acumulativo por cultivo y ubicación
// ══════════════════════════════════════════════

"use client";
// @ts-nocheck
import { useEffect, useState, useRef } from "react";

const CULTIVO_ICONS: Record<string,string> = {
  soja:"🌱",maiz:"🌽",trigo:"🌾",girasol:"🌻",sorgo:"🌿",cebada:"🍃",otro:"🌐"
};
const CULTIVO_COLORS: Record<string,string> = {
  soja:"#22c55e",maiz:"#d97706",trigo:"#f59e0b",girasol:"#fbbf24",
  sorgo:"#ef4444",cebada:"#a78bfa",otro:"#60a5fa"
};

type Mov = {
  id:string; fecha:string; tipo:string; cultivo:string;
  lote_id:string|null; kg_netos:number; kg_brutos:number;
  humedad_pct:number; merma_pct:number;
  destino:string; destinatario:string;
  origen:string; observaciones:string;
  cosecha_id:string|null; precio_usd:number; total_usd:number;
};

type Cosecha = {
  id:string; fecha:string; cultivo:string; lote_id:string;
  kg_brutos:number; humedad_campo:number; merma_pct:number; kg_netos:number;
  rinde_real:number; destino:string; destinatario:string; observaciones:string;
};

function fmt(n:number){ return Math.round(n).toLocaleString("es-AR"); }

interface Props {
  empresaId: string|null;
  mostrarMsg: (t:string)=>void;
  getSB: ()=>Promise<any>;
}

export function GranosLibro({ empresaId, mostrarMsg, getSB }:Props) {
  const [movimientos, setMovimientos]   = useState<Mov[]>([]);
  const [cosechas, setCosechas]         = useState<Cosecha[]>([]);
  const [lotes, setLotes]               = useState<{id:string;nombre:string}[]>([]);
  const [loading, setLoading]           = useState(true);
  const [cultivoActivo, setCultivoActivo] = useState<string|null>(null);
  const [showFormMov, setShowFormMov]   = useState(false);
  const [showFormCosecha, setShowFormCosecha] = useState(false);
  const [form, setForm]                 = useState<Record<string,string>>({});
  const importRef                       = useRef<HTMLInputElement>(null);

  const iCls = {
    background:"rgba(255,255,255,0.75)",border:"1px solid rgba(180,210,240,0.55)",
    borderRadius:11,color:"#1a2a4a",padding:"8px 12px",fontSize:13,
    fontFamily:"'DM Sans',system-ui",width:"100%",outline:"none"
  };
  const lCls = {
    display:"block",fontSize:9,fontWeight:700,textTransform:"uppercase" as const,
    letterSpacing:"0.8px",color:"#6b8aaa",marginBottom:5
  };

  useEffect(()=>{ if(empresaId) fetchAll(); },[empresaId]);

  const fetchAll = async () => {
    if (!empresaId) return;
    setLoading(true);
    const sb = await getSB();
    const [movs, coses, ls] = await Promise.all([
      sb.from("stock_granos_movimientos").select("*").eq("empresa_id",empresaId).order("fecha",{ascending:false}),
      sb.from("stock_granos_cosecha").select("*").eq("empresa_id",empresaId).order("fecha",{ascending:false}),
      sb.from("lotes").select("id,nombre").eq("empresa_id",empresaId).order("nombre"),
    ]);
    setMovimientos(movs.data??[]);
    setCosechas(coses.data??[]);
    setLotes(ls.data??[]);
    setLoading(false);
  };

  // ── Stock por cultivo (acumulativo, sin corte de año)
  const stockPorCultivo = (cultivo:string) => {
    const movs = movimientos.filter(m=>m.cultivo===cultivo);
    const entradas = movs.filter(m=>m.tipo==="entrada").reduce((a,m)=>a+m.kg_netos,0);
    const salidas = movs.filter(m=>["salida","consumo","semilla"].includes(m.tipo)).reduce((a,m)=>a+m.kg_netos,0);
    const ajustes = movs.filter(m=>m.tipo==="ajuste").reduce((a,m)=>a+m.kg_netos,0); // puede ser + o -
    const comprometido = movs.filter(m=>m.tipo==="comprometido").reduce((a,m)=>a+m.kg_netos,0);
    const stock = entradas - salidas + ajustes;
    return { stock, entradas, salidas, comprometido, disponible: stock - comprometido };
  };

  // ── Stock por ubicación (dentro de un cultivo)
  const stockPorUbicacion = (cultivo:string) => {
    const movs = movimientos.filter(m=>m.cultivo===cultivo);
    const mapa: Record<string,{kg:number;tipo:string;movimientos:Mov[]}> = {};
    for (const m of movs) {
      const key = (m.destinatario||m.destino||"Sin especificar").trim();
      if (!mapa[key]) mapa[key] = { kg:0, tipo:m.destino||"", movimientos:[] };
      if (m.tipo==="entrada") mapa[key].kg += m.kg_netos;
      else if (["salida","consumo","semilla"].includes(m.tipo)) mapa[key].kg -= m.kg_netos;
      else if (m.tipo==="ajuste") mapa[key].kg += m.kg_netos;
      mapa[key].movimientos.push(m);
    }
    return Object.entries(mapa).map(([nombre,data])=>({nombre,...data}));
  };

  const cultivosConMovimientos = [...new Set(movimientos.map(m=>m.cultivo))].sort();

  // ── Guardar movimiento manual (ajuste, salida, etc.)
  const guardarMovimiento = async () => {
    if (!empresaId||!form.cultivo||!form.tipo||!form.fecha||!form.kg_netos) return;
    const sb = await getSB();
    const kgNetos = Number(form.kg_netos);
    const { error } = await sb.from("stock_granos_movimientos").insert({
      empresa_id:empresaId,
      campana_id:"00000000-0000-0000-0000-000000000000", // placeholder
      cultivo:form.cultivo,
      fecha:form.fecha,
      tipo:form.tipo,
      lote_id:form.lote_id||null,
      destino:form.destino||"",
      destinatario:form.destinatario||"",
      kg_brutos:Number(form.kg_brutos||kgNetos),
      humedad_pct:Number(form.humedad||0),
      merma_pct:Number(form.merma||0),
      kg_netos:form.tipo==="ajuste"&&form.signo==="-"?-kgNetos:kgNetos,
      precio_usd:Number(form.precio_usd||0),
      total_usd:kgNetos*(Number(form.precio_usd||0)/1000),
      origen:"manual",
      observaciones:form.observaciones||"",
    });
    if (error) { mostrarMsg(`❌ ${error.message}`); return; }
    mostrarMsg(`✅ Movimiento registrado — ${fmt(kgNetos)} kg`);
    await fetchAll();
    setShowFormMov(false); setForm({});
  };

  // ── Exportar Excel
  const exportarExcel = async (cultivo?:string) => {
    const XLSX = await import("xlsx");
    const data = movimientos
      .filter(m=>!cultivo||m.cultivo===cultivo)
      .map(m=>({
        FECHA:m.fecha, CULTIVO:m.cultivo.toUpperCase(), TIPO:m.tipo,
        LOTE:lotes.find(l=>l.id===m.lote_id)?.nombre||"—",
        KG_BRUTOS:m.kg_brutos, HUMEDAD:m.humedad_pct, MERMA:m.merma_pct,
        KG_NETOS:m.kg_netos, DESTINO:m.destinatario||m.destino||"—",
        PRECIO_USD:m.precio_usd, TOTAL_USD:m.total_usd,
        OBSERVACIONES:m.observaciones||"",
      }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{wch:12},{wch:10},{wch:12},{wch:16},{wch:10},{wch:8},{wch:8},{wch:10},{wch:20},{wch:10},{wch:10},{wch:24}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,cultivo||"Granos");
    XLSX.writeFile(wb,`stock_granos_${cultivo||"todo"}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── Importar Excel
  const importarExcel = async (file:File) => {
    if (!empresaId) return;
    mostrarMsg("⏳ Importando...");
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(),{type:"array"});
    const rows:any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
    const sb = await getSB();
    let ok=0;
    for (const r of rows) {
      if (!r.CULTIVO||!r.FECHA||!r.KG_NETOS) continue;
      await sb.from("stock_granos_movimientos").insert({
        empresa_id:empresaId,
        campana_id:"00000000-0000-0000-0000-000000000000",
        cultivo:String(r.CULTIVO).toLowerCase(),
        fecha:r.FECHA, tipo:r.TIPO||"entrada",
        lote_id:null, destino:r.DESTINO||"", destinatario:r.DESTINO||"",
        kg_brutos:Number(r.KG_BRUTOS||r.KG_NETOS),
        humedad_pct:Number(r.HUMEDAD||0), merma_pct:Number(r.MERMA||0),
        kg_netos:Number(r.KG_NETOS),
        precio_usd:Number(r.PRECIO_USD||0), total_usd:Number(r.TOTAL_USD||0),
        origen:"excel", observaciones:r.OBSERVACIONES||"",
      });
      ok++;
    }
    mostrarMsg(`✅ ${ok} registros importados`);
    await fetchAll();
  };

  if (loading) return (
    <div style={{textAlign:"center",padding:"40px",color:"#6b8aaa"}}>
      <div style={{width:24,height:24,border:"3px solid #d97706",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 8px"}}/>
      Cargando libro de granos...
    </div>
  );

  // ══ VISTA DETALLE CULTIVO ══
  if (cultivoActivo) {
    const { stock, entradas, salidas, comprometido, disponible } = stockPorCultivo(cultivoActivo);
    const ubicaciones = stockPorUbicacion(cultivoActivo);
    const movsDelCultivo = movimientos.filter(m=>m.cultivo===cultivoActivo);
    const cosechasDelCultivo = cosechas.filter(c=>c.cultivo===cultivoActivo);
    const color = CULTIVO_COLORS[cultivoActivo]??"#22c55e";
    const icon = CULTIVO_ICONS[cultivoActivo]??"🌾";

    return (
      <div className="fade-in">
        {/* Header */}
        <div className="card" style={{padding:"14px 16px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:28}}>{icon}</span>
              <div>
                <div style={{fontSize:18,fontWeight:800,color:"#0d2137",textTransform:"uppercase"}}>{cultivoActivo}</div>
                <div style={{fontSize:11,color:"#6b8aaa",marginTop:2}}>
                  {movsDelCultivo.length} movimientos · {cosechasDelCultivo.length} cosechas
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={()=>{setShowFormMov(true);setForm({cultivo:cultivoActivo,fecha:new Date().toISOString().split("T")[0],tipo:"ajuste",signo:"+"});}} className="abtn" style={{fontSize:11}}>🔧 Ajuste</button>
              <button onClick={()=>exportarExcel(cultivoActivo)} className="abtn" style={{fontSize:11}}>📤 Excel</button>
              <button onClick={()=>setCultivoActivo(null)} className="abtn" style={{fontSize:11}}>← Volver</button>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8,marginBottom:14}}>
          {[
            {l:"Stock Total",    v:`${fmt(stock)} kg`,      c:stock>=0?"#16a34a":"#dc2626"},
            {l:"Stock en tn",    v:`${(stock/1000).toFixed(2)} tn`, c:stock>=0?"#d97706":"#dc2626"},
            {l:"Total Entradas", v:`${fmt(entradas)} kg`,   c:"#16a34a"},
            {l:"Total Salidas",  v:`${fmt(salidas)} kg`,    c:"#dc2626"},
            {l:"Comprometido",   v:`${fmt(comprometido)} kg`,c:"#1565c0"},
            {l:"Disponible",     v:`${fmt(disponible)} kg`, c:disponible>=0?"#22c55e":"#dc2626"},
          ].map(s=>(
            <div key={s.l} className="kpi-s">
              <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",marginBottom:3}}>{s.l}</div>
              <div style={{fontSize:12,fontWeight:800,color:s.c}}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Form movimiento */}
        {showFormMov&&(
          <div className="card fade-in" style={{padding:14,marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:800,color:"#d97706",marginBottom:10}}>🔧 Registrar Movimiento</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:10}}>
              <div>
                <div style={lCls}>Tipo</div>
                <select value={form.tipo||"ajuste"} onChange={e=>setForm({...form,tipo:e.target.value})} style={iCls as any} className="sel">
                  <option value="entrada">⬆️ Entrada</option>
                  <option value="salida">⬇️ Salida/Venta</option>
                  <option value="ajuste">🔧 Ajuste</option>
                  <option value="consumo">🔄 Consumo propio</option>
                  <option value="semilla">🌱 Semilla</option>
                  <option value="comprometido">📋 Forward/Comprometido</option>
                </select>
              </div>
              {form.tipo==="ajuste"&&(
                <div>
                  <div style={lCls}>Signo</div>
                  <div style={{display:"flex",gap:6}}>
                    {[{v:"+",l:"+ Suma"},{v:"-",l:"− Resta"}].map(s=>(
                      <button key={s.v} onClick={()=>setForm({...form,signo:s.v})}
                        style={{flex:1,padding:"8px",borderRadius:9,fontSize:12,fontWeight:800,cursor:"pointer",
                          border:"1px solid",fontFamily:"inherit",
                          borderColor:(form.signo||"+")===s.v?(s.v==="+"?"#16a34a":"#dc2626"):"rgba(180,210,240,0.50)",
                          background:(form.signo||"+")===s.v?(s.v==="+"?"rgba(22,163,74,0.10)":"rgba(220,38,38,0.08)"):"rgba(255,255,255,0.70)",
                          color:(form.signo||"+")===s.v?(s.v==="+"?"#16a34a":"#dc2626"):"#6b8aaa"}}>
                        {s.l}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div><div style={lCls}>Fecha *</div><input type="date" value={form.fecha||""} onChange={e=>setForm({...form,fecha:e.target.value})} style={iCls as any}/></div>
              <div><div style={lCls}>Kg netos *</div><input type="number" value={form.kg_netos||""} onChange={e=>setForm({...form,kg_netos:e.target.value})} style={iCls as any} placeholder="0"/></div>
              <div><div style={lCls}>Destinatario / Lugar</div><input type="text" value={form.destinatario||""} onChange={e=>setForm({...form,destinatario:e.target.value})} style={iCls as any} placeholder="Acopio, silo bolsa..."/></div>
              {(form.tipo==="salida"||form.tipo==="comprometido")&&(
                <div><div style={lCls}>Precio U$S/tn</div><input type="number" step="0.5" value={form.precio_usd||""} onChange={e=>setForm({...form,precio_usd:e.target.value})} style={iCls as any} placeholder="0"/></div>
              )}
              <div><div style={lCls}>Humedad %</div><input type="number" step="0.1" value={form.humedad||""} onChange={e=>setForm({...form,humedad:e.target.value})} style={iCls as any} placeholder="0"/></div>
              <div style={{gridColumn:"span 2"}}><div style={lCls}>Observaciones</div><input type="text" value={form.observaciones||""} onChange={e=>setForm({...form,observaciones:e.target.value})} style={iCls as any} placeholder="Detalle..."/></div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={guardarMovimiento} className="bbtn">✓ Guardar</button>
              <button onClick={()=>{setShowFormMov(false);setForm({});}} className="abtn">Cancelar</button>
            </div>
          </div>
        )}

        {/* UBICACIONES */}
        <div style={{fontSize:11,fontWeight:800,color:"#d97706",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>📍 Stock por Ubicación</div>
        {ubicaciones.length===0
          ?<div style={{color:"#6b8aaa",fontSize:13,marginBottom:12,padding:"16px",textAlign:"center"}}>Sin ubicaciones registradas</div>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10,marginBottom:14}}>
            {ubicaciones.map(ub=>(
              <div key={ub.nombre} className="card" style={{padding:"12px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{fontSize:16}}>
                    {ub.tipo==="silo_bolsa"?"🎒":ub.tipo==="acopio"?"🏢":ub.tipo==="planta_propia"?"🏭":"📍"}
                  </span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#0d2137",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ub.nombre}</div>
                    <div style={{fontSize:10,color:"#6b8aaa"}}>{ub.movimientos.length} movimientos</div>
                  </div>
                </div>
                <div style={{fontSize:16,fontWeight:800,color:ub.kg>=0?"#16a34a":"#dc2626"}}>
                  {fmt(ub.kg)} kg
                </div>
                <div style={{fontSize:10,color:"#6b8aaa"}}>{(ub.kg/1000).toFixed(2)} tn</div>
                {/* Mini barra */}
                {stock>0&&ub.kg>0&&(
                  <div style={{marginTop:6,height:3,background:"rgba(0,0,0,0.08)",borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",background:color,borderRadius:2,width:`${Math.min(100,ub.kg/stock*100)}%`}}/>
                  </div>
                )}
              </div>
            ))}
          </div>
        }

        {/* COSECHAS */}
        {cosechasDelCultivo.length>0&&(
          <>
            <div style={{fontSize:11,fontWeight:800,color:"#16a34a",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>🌾 Cosechas Registradas</div>
            <div className="card" style={{padding:0,overflow:"hidden",marginBottom:14}}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:600}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                    {["Fecha","Lote","Kg brutos","Humedad","Merma","Kg netos","Rinde","Destino"].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"7px 12px",fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{cosechasDelCultivo.map(c=>(
                    <tr key={c.id} style={{borderBottom:"1px solid rgba(0,60,140,0.05)"}}>
                      <td style={{padding:"7px 12px",color:"#6b8aaa",whiteSpace:"nowrap"}}>{c.fecha}</td>
                      <td style={{padding:"7px 12px",fontWeight:700,color:"#0d2137"}}>{lotes.find(l=>l.id===c.lote_id)?.nombre||"—"}</td>
                      <td style={{padding:"7px 12px",color:"#6b8aaa"}}>{fmt(c.kg_brutos)} kg</td>
                      <td style={{padding:"7px 12px",color:"#d97706"}}>{c.humedad_campo}%</td>
                      <td style={{padding:"7px 12px",color:"#6b8aaa"}}>{c.merma_pct}%</td>
                      <td style={{padding:"7px 12px",fontWeight:800,color:"#16a34a"}}>{fmt(c.kg_netos)} kg</td>
                      <td style={{padding:"7px 12px",color:"#d97706",fontWeight:700}}>{c.rinde_real>0?`${c.rinde_real} tn/ha`:"—"}</td>
                      <td style={{padding:"7px 12px",color:"#6b8aaa",fontSize:10}}>{c.destinatario||c.destino||"—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* HISTORIAL MOVIMIENTOS */}
        <div style={{fontSize:11,fontWeight:800,color:"#0d2137",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>📋 Historial Completo</div>
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          {movsDelCultivo.length===0
            ?<div style={{textAlign:"center",padding:"30px",color:"#6b8aaa",fontSize:13}}>Sin movimientos</div>
            :<div style={{overflowX:"auto"}}>
              <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:700}}>
                <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                  {["Fecha","Tipo","Lote","Kg netos","Humedad","Destino","Precio","Total U$S","Obs."].map(h=>(
                    <th key={h} style={{textAlign:"left",padding:"7px 12px",fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{movsDelCultivo.map(m=>{
                  const tipoColor = m.tipo==="entrada"?"#16a34a":m.tipo==="salida"||m.tipo==="consumo"||m.tipo==="semilla"?"#dc2626":m.tipo==="comprometido"?"#1565c0":"#d97706";
                  return(
                    <tr key={m.id} style={{borderBottom:"1px solid rgba(0,60,140,0.05)",cursor:"default"}}
                      onMouseEnter={e=>(e.currentTarget as any).style.background="rgba(255,255,255,0.80)"}
                      onMouseLeave={e=>(e.currentTarget as any).style.background="transparent"}>
                      <td style={{padding:"6px 12px",color:"#6b8aaa",whiteSpace:"nowrap"}}>{m.fecha}</td>
                      <td style={{padding:"6px 12px"}}>
                        <span style={{fontSize:10,padding:"1px 7px",borderRadius:5,fontWeight:700,background:tipoColor+"18",color:tipoColor}}>{m.tipo}</span>
                      </td>
                      <td style={{padding:"6px 12px",color:"#4a6a8a",fontSize:10}}>{lotes.find(l=>l.id===m.lote_id)?.nombre||"—"}</td>
                      <td style={{padding:"6px 12px",fontWeight:800,color:m.kg_netos>=0?"#16a34a":"#dc2626"}}>{m.kg_netos>=0?"+":""}{fmt(m.kg_netos)} kg</td>
                      <td style={{padding:"6px 12px",color:"#6b8aaa"}}>{m.humedad_pct>0?`${m.humedad_pct}%`:"—"}</td>
                      <td style={{padding:"6px 12px",color:"#6b8aaa",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.destinatario||m.destino||"—"}</td>
                      <td style={{padding:"6px 12px",color:"#d97706"}}>{m.precio_usd>0?`U$S ${m.precio_usd}/tn`:"—"}</td>
                      <td style={{padding:"6px 12px",fontWeight:700,color:"#16a34a"}}>{m.total_usd>0?`U$S ${m.total_usd.toFixed(2)}`:"—"}</td>
                      <td style={{padding:"6px 12px",color:"#aab8c8",fontSize:10,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.observaciones||"—"}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          }
        </div>
      </div>
    );
  }

  // ══ VISTA PRINCIPAL — lista cultivos ══
  return (
    <div className="fade-in">
      {/* Acciones */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:12,fontWeight:700,color:"#6b8aaa"}}>
          Stock acumulativo · {cultivosConMovimientos.length} cultivos
        </div>
        <div style={{display:"flex",gap:8}}>
          <input ref={importRef} type="file" accept=".xlsx,.xls" style={{display:"none"}}
            onChange={e=>{const f=e.target.files?.[0];if(f)importarExcel(f);}}/>
          <button onClick={()=>importRef.current?.click()} className="abtn" style={{fontSize:11}}>📥 Importar Excel</button>
          <button onClick={()=>exportarExcel()} className="abtn" style={{fontSize:11}}>📤 Exportar Excel</button>
        </div>
      </div>

      {cultivosConMovimientos.length===0?(
        <div className="card" style={{padding:"48px 20px",textAlign:"center"}}>
          <div style={{fontSize:48,opacity:0.12,marginBottom:12}}>🌾</div>
          <p style={{color:"#6b8aaa",fontSize:14,marginBottom:8}}>Sin movimientos de granos</p>
          <p style={{color:"#aab8c8",fontSize:11}}>Cargá una cosecha desde Centro de Gestión → Cosecha</p>
        </div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
          {cultivosConMovimientos.map(cultivo=>{
            const {stock,entradas,salidas,comprometido,disponible} = stockPorCultivo(cultivo);
            const color = CULTIVO_COLORS[cultivo]??"#22c55e";
            const icon = CULTIVO_ICONS[cultivo]??"🌾";
            return(
              <div key={cultivo} className="cultivo-card" onClick={()=>setCultivoActivo(cultivo)}
                style={{cursor:"pointer"}}>
                {/* Franja color */}
                <div style={{height:4,background:color,borderRadius:"16px 16px 0 0"}}/>
                <div style={{padding:"12px 14px 14px"}}>
                  {/* Header */}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <span style={{fontSize:22}}>{icon}</span>
                    <div>
                      <div style={{fontSize:14,fontWeight:800,color:"#0d2137",textTransform:"uppercase"}}>{cultivo}</div>
                    </div>
                    <div style={{marginLeft:"auto"}}>
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,fontWeight:700,
                        background:stock>=0?"rgba(22,163,74,0.12)":"rgba(220,38,38,0.10)",
                        color:stock>=0?"#16a34a":"#dc2626"}}>
                        {stock>=0?"+":""}{(stock/1000).toFixed(1)} tn
                      </span>
                    </div>
                  </div>

                  {/* Número grande */}
                  <div style={{textAlign:"center",padding:"10px 0",borderRadius:10,
                    background:stock>=0?"rgba(22,163,74,0.06)":"rgba(220,38,38,0.06)",
                    border:`1px solid ${stock>=0?"rgba(22,163,74,0.15)":"rgba(220,38,38,0.15)"}`,
                    marginBottom:10}}>
                    <div style={{fontSize:24,fontWeight:900,color:stock>=0?"#16a34a":"#dc2626"}}>
                      {fmt(stock)} kg
                    </div>
                    <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600}}>STOCK ACTUAL</div>
                  </div>

                  {/* Mini stats */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    {[
                      {l:"Entradas",v:`${fmt(entradas)} kg`,c:"#16a34a"},
                      {l:"Salidas",v:`${fmt(salidas)} kg`,c:"#dc2626"},
                      {l:"Comprometido",v:`${fmt(comprometido)} kg`,c:"#1565c0"},
                      {l:"Disponible",v:`${fmt(disponible)} kg`,c:disponible>=0?"#d97706":"#dc2626"},
                    ].map(s=>(
                      <div key={s.l} className="kpi-s" style={{padding:"5px 7px"}}>
                        <div style={{fontSize:8,color:"#6b8aaa",fontWeight:600}}>{s.l}</div>
                        <div style={{fontSize:11,fontWeight:800,color:s.c,marginTop:1}}>{s.v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{marginTop:10,fontSize:10,color:"#1565c0",fontWeight:600,textAlign:"center"}}>
                    Ver detalle →
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
