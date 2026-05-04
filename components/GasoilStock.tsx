// ══════════════════════════════════════════════
// GASOIL STOCK — Solo lectura
// Los movimientos se cargan desde Centro de Gestión
// ══════════════════════════════════════════════
"use client";
// @ts-nocheck
import { useEffect, useState } from "react";

type Deposito = { id:string; nombre:string; descripcion:string; };
type Movimiento = {
  id:string; fecha:string; tipo:string; litros:number;
  deposito_origen_id:string|null; deposito_destino_id:string|null;
  precio_litro:number; ppp_momento:number; monto_total:number;
  monto_usd:number; moneda:string;
  proveedor:string; equipo:string; observaciones:string;
  lote_ids:string[];
};

function fmt(n:number){ return Math.round(n).toLocaleString("es-AR"); }

interface Props {
  empresaId: string|null;
  getSB: ()=>Promise<any>;
  mostrarMsg: (t:string)=>void;
}

export function GasoilStock({ empresaId, getSB, mostrarMsg }:Props) {
  const [depositos, setDepositos]   = useState<Deposito[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [lotes, setLotes]           = useState<{id:string;nombre:string}[]>([]);
  const [loading, setLoading]       = useState(true);
  const [depActivo, setDepActivo]   = useState<string|null>(null);
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");

  useEffect(()=>{ if(empresaId) fetchAll(); },[empresaId]);

  const fetchAll = async () => {
    if (!empresaId) return;
    setLoading(true);
    const sb = await getSB();
    const [deps, movs, ls] = await Promise.all([
      sb.from("gasoil_depositos").select("*").eq("empresa_id",empresaId).eq("activo",true).order("nombre"),
      sb.from("gasoil_movimientos").select("*").eq("empresa_id",empresaId).order("fecha",{ascending:false}),
      sb.from("lotes").select("id,nombre").eq("empresa_id",empresaId).order("nombre"),
    ]);
    setDepositos(deps.data??[]);
    setMovimientos(movs.data??[]);
    setLotes(ls.data??[]);
    setLoading(false);
  };

  // Calcular stock y PPP por depósito
  const calcDeposito = (depId:string) => {
    const entradas = movimientos.filter(m=>m.deposito_destino_id===depId&&["compra","traslado"].includes(m.tipo));
    const salidas  = movimientos.filter(m=>m.deposito_origen_id===depId&&["traslado","consumo"].includes(m.tipo));
    const ajustes  = movimientos.filter(m=>(m.deposito_origen_id===depId||m.deposito_destino_id===depId)&&m.tipo==="ajuste");
    const litros   = entradas.reduce((a,m)=>a+Number(m.litros),0)
                   - salidas.reduce((a,m)=>a+Math.abs(Number(m.litros)),0)
                   + ajustes.reduce((a,m)=>a+Number(m.litros),0);
    // PPP global del depósito (solo compras)
    const compras = movimientos.filter(m=>m.deposito_destino_id===depId&&m.tipo==="compra"&&m.precio_litro>0);
    const totalLitComp = compras.reduce((a,m)=>a+Number(m.litros),0);
    const ppp = totalLitComp>0
      ? compras.reduce((a,m)=>a+Number(m.litros)*Number(m.precio_litro),0)/totalLitComp
      : 0;
    // Totales históricos
    const totalComprado  = entradas.filter(m=>m.tipo==="compra").reduce((a,m)=>a+Number(m.litros),0);
    const totalConsumido = salidas.filter(m=>m.tipo==="consumo").reduce((a,m)=>a+Math.abs(Number(m.litros)),0);
    const totalTrasladoSale = salidas.filter(m=>m.tipo==="traslado").reduce((a,m)=>a+Math.abs(Number(m.litros)),0);
    const totalTrasladoEntra = entradas.filter(m=>m.tipo==="traslado").reduce((a,m)=>a+Number(m.litros),0);
    return { litros:Math.max(0,litros), ppp, totalComprado, totalConsumido, totalTrasladoSale, totalTrasladoEntra };
  };

  // Totales generales
  const totalGeneral = depositos.reduce((a,d)=>a+calcDeposito(d.id).litros,0);
  const pppGeneral = (()=>{
    const compras = movimientos.filter(m=>m.tipo==="compra"&&m.precio_litro>0);
    const tot = compras.reduce((a,m)=>a+Number(m.litros),0);
    return tot>0 ? compras.reduce((a,m)=>a+Number(m.litros)*Number(m.precio_litro),0)/tot : 0;
  })();
  const totalGastadoUsd = movimientos.filter(m=>m.tipo==="consumo").reduce((a,m)=>a+Number(m.monto_usd||0),0);

  const movsFiltrados = depActivo
    ? movimientos.filter(m=>m.deposito_origen_id===depActivo||m.deposito_destino_id===depActivo)
    : movimientos;
  const movsPorTipo = filtroTipo==="todos" ? movsFiltrados : movsFiltrados.filter(m=>m.tipo===filtroTipo);

  const tipoColor:Record<string,string> = {
    compra:"#22c55e", traslado:"#60a5fa", consumo:"#f97316", ajuste:"#a78bfa"
  };
  const tipoIcon:Record<string,string> = {
    compra:"🛢", traslado:"🔄", consumo:"⚡", ajuste:"🔧"
  };

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const data = movsPorTipo.map(m=>({
      FECHA:m.fecha,
      TIPO:m.tipo.toUpperCase(),
      LITROS:m.litros,
      DEP_ORIGEN:depositos.find(d=>d.id===m.deposito_origen_id)?.nombre||"—",
      DEP_DESTINO:depositos.find(d=>d.id===m.deposito_destino_id)?.nombre||"—",
      PRECIO_LITRO:m.precio_litro,
      PPP_MOMENTO:m.ppp_momento,
      MONTO_ARS:m.monto_total,
      MONTO_USD:m.monto_usd,
      LOTES:m.lote_ids.map(lid=>lotes.find(l=>l.id===lid)?.nombre||lid).join(", "),
      EQUIPO:m.equipo||"",
      PROVEEDOR:m.proveedor||"",
      OBSERVACIONES:m.observaciones||"",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{wch:12},{wch:10},{wch:8},{wch:18},{wch:18},{wch:12},{wch:12},{wch:14},{wch:12},{wch:24},{wch:18},{wch:18},{wch:24}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Gasoil");
    XLSX.writeFile(wb,`gasoil_movimientos_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  if (loading) return (
    <div style={{textAlign:"center",padding:"40px",color:"#6b8aaa"}}>
      <div style={{width:24,height:24,border:"3px solid #1565c0",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 8px"}}/>
      Cargando gasoil...
    </div>
  );

  return (
    <div className="fade-in">

      {/* KPIs generales */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:18}}>
        {[
          {l:"Stock Total",     v:`${fmt(totalGeneral)} L`,              c:"#1565c0"},
          {l:"PPP General",     v:pppGeneral>0?`$${pppGeneral.toFixed(0)}/L`:"—", c:"#d97706"},
          {l:"Valor Stock",     v:pppGeneral>0?`$${fmt(totalGeneral*pppGeneral)}`:"—", c:"#22c55e"},
          {l:"Total imputado",  v:`U$S ${totalGastadoUsd.toFixed(0)}`,   c:"#f97316"},
          {l:"Depósitos",       v:String(depositos.length),              c:"#6b8aaa"},
          {l:"Movimientos",     v:String(movimientos.length),            c:"#6b8aaa"},
        ].map(s=>(
          <div key={s.l} className="kpi-s">
            <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",marginBottom:3}}>{s.l}</div>
            <div style={{fontSize:14,fontWeight:800,color:s.c}}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Banner: los movimientos se cargan desde Centro de Gestión */}
      <div style={{padding:"10px 16px",borderRadius:10,background:"rgba(25,118,210,0.07)",border:"1px solid rgba(25,118,210,0.20)",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"#1565c0"}}>⚙ Los movimientos se cargan desde Centro de Gestión → Combustibles</div>
          <div style={{fontSize:10,color:"#6b8aaa",marginTop:1}}>Compras, traslados, consumos y ajustes se registran allí e impactan aquí automáticamente</div>
        </div>
        <button onClick={()=>window.location.href="/productor/otros"}
          style={{padding:"6px 14px",borderRadius:9,background:"rgba(25,118,210,0.10)",border:"1px solid rgba(25,118,210,0.30)",color:"#1565c0",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
          Ir a Centro de Gestión →
        </button>
      </div>

      {/* Depósitos */}
      {depositos.length===0?(
        <div className="card" style={{padding:"40px 20px",textAlign:"center"}}>
          <div style={{fontSize:36,opacity:0.15,marginBottom:10}}>⛽</div>
          <p style={{color:"#6b8aaa",fontSize:13,marginBottom:6}}>Sin depósitos creados</p>
          <p style={{color:"#aab8c8",fontSize:11}}>Creá depósitos desde Centro de Gestión → Combustibles</p>
          <button onClick={()=>window.location.href="/productor/otros"} className="bbtn" style={{marginTop:12,fontSize:11}}>Ir a Centro de Gestión →</button>
        </div>
      ):(
        <>
          <div style={{fontSize:11,fontWeight:800,color:"#1565c0",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>⛽ Stock por Depósito</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10,marginBottom:18}}>
            {depositos.map(dep=>{
              const {litros,ppp,totalComprado,totalConsumido} = calcDeposito(dep.id);
              const isActivo = depActivo===dep.id;
              return(
                <div key={dep.id} className="card"
                  style={{padding:"14px 16px",cursor:"pointer",
                    border:`1.5px solid ${isActivo?"rgba(25,118,210,0.50)":"rgba(255,255,255,0.88)"}`}}
                  onClick={()=>setDepActivo(isActivo?null:dep.id)}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <span style={{fontSize:20}}>🛢</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:800,color:"#0d2137"}}>{dep.nombre}</div>
                      {isActivo&&<div style={{fontSize:9,color:"#1565c0",fontWeight:700}}>● Filtrando historial</div>}
                    </div>
                  </div>
                  {/* Número grande */}
                  <div style={{textAlign:"center",padding:"10px 0",borderRadius:9,
                    background:litros>0?"rgba(25,118,210,0.07)":"rgba(220,38,38,0.05)",
                    border:`1px solid ${litros>0?"rgba(25,118,210,0.18)":"rgba(220,38,38,0.15)"}`,
                    marginBottom:8}}>
                    <div style={{fontSize:22,fontWeight:900,color:litros>0?"#1565c0":"#dc2626"}}>{fmt(litros)} L</div>
                    {ppp>0&&<div style={{fontSize:10,color:"#d97706",fontWeight:700}}>PPP ${ppp.toFixed(0)}/L</div>}
                    {ppp>0&&<div style={{fontSize:10,color:"#6b8aaa"}}>Valor ${fmt(litros*ppp)}</div>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                    <div className="kpi-s" style={{padding:"4px 6px"}}>
                      <div style={{fontSize:8,color:"#6b8aaa"}}>Comprado</div>
                      <div style={{fontSize:10,fontWeight:800,color:"#22c55e"}}>{fmt(totalComprado)} L</div>
                    </div>
                    <div className="kpi-s" style={{padding:"4px 6px"}}>
                      <div style={{fontSize:8,color:"#6b8aaa"}}>Consumido</div>
                      <div style={{fontSize:10,fontWeight:800,color:"#f97316"}}>{fmt(totalConsumido)} L</div>
                    </div>
                  </div>
                  <div style={{marginTop:8,fontSize:9,color:"#1565c0",fontWeight:600,textAlign:"center"}}>
                    {isActivo?"Ver todos →":"Ver movimientos →"}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Historial movimientos */}
      {movimientos.length>0&&(
        <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:11,fontWeight:800,color:"#0d2137",textTransform:"uppercase",letterSpacing:0.8}}>
              📋 Historial{depActivo?` — ${depositos.find(d=>d.id===depActivo)?.nombre}`:" Completo"}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              {/* Filtro tipo */}
              {["todos","compra","traslado","consumo","ajuste"].map(t=>(
                <button key={t}
                  onClick={()=>setFiltroTipo(t)}
                  style={{padding:"4px 10px",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                    border:`1px solid ${filtroTipo===t?(tipoColor[t]||"#1565c0"):"rgba(180,210,240,0.40)"}`,
                    background:filtroTipo===t?(tipoColor[t]||"#1565c0")+"15":"rgba(255,255,255,0.60)",
                    color:filtroTipo===t?(tipoColor[t]||"#1565c0"):"#6b8aaa"}}>
                  {t==="todos"?"Todos":tipoIcon[t]+" "+t.charAt(0).toUpperCase()+t.slice(1)}
                </button>
              ))}
              {depActivo&&(
                <button onClick={()=>setDepActivo(null)}
                  style={{padding:"4px 10px",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                    background:"rgba(220,38,38,0.08)",border:"1px solid rgba(220,38,38,0.25)",color:"#dc2626"}}>
                  ✕ Quitar filtro
                </button>
              )}
              <button onClick={exportarExcel} className="abtn" style={{fontSize:10,padding:"4px 10px"}}>📤 Excel</button>
              <button onClick={fetchAll} className="abtn" style={{fontSize:10,padding:"4px 10px"}}>↺ Actualizar</button>
            </div>
          </div>

          <div className="card" style={{padding:0,overflow:"hidden"}}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:800}}>
                <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                  {["Fecha","Tipo","Litros","Origen","Destino","Precio/L","PPP","Monto $","U$S","Lotes/Equipo","Obs."].map(h=>(
                    <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{movsPorTipo.map(m=>{
                  const origen  = depositos.find(d=>d.id===m.deposito_origen_id)?.nombre;
                  const destino = depositos.find(d=>d.id===m.deposito_destino_id)?.nombre;
                  const lotesNombres = m.lote_ids?.map(lid=>lotes.find(l=>l.id===lid)?.nombre||"?").join(", ")||"";
                  const tc = tipoColor[m.tipo]||"#6b8aaa";
                  return(
                    <tr key={m.id} style={{borderBottom:"1px solid rgba(0,60,140,0.05)",transition:"background 0.15s"}}
                      onMouseEnter={e=>(e.currentTarget as any).style.background="rgba(255,255,255,0.80)"}
                      onMouseLeave={e=>(e.currentTarget as any).style.background="transparent"}>
                      <td style={{padding:"7px 12px",color:"#6b8aaa",whiteSpace:"nowrap",fontWeight:600}}>{m.fecha}</td>
                      <td style={{padding:"7px 12px"}}>
                        <span style={{fontSize:10,padding:"2px 8px",borderRadius:5,fontWeight:700,background:tc+"15",color:tc,whiteSpace:"nowrap"}}>
                          {tipoIcon[m.tipo]} {m.tipo}
                        </span>
                      </td>
                      <td style={{padding:"7px 12px",fontWeight:800,color:m.tipo==="compra"||m.tipo==="traslado"?"#22c55e":m.tipo==="consumo"?"#f97316":"#a78bfa",whiteSpace:"nowrap"}}>
                        {m.tipo==="consumo"||m.litros<0?"-":"+"}{fmt(Math.abs(m.litros))} L
                      </td>
                      <td style={{padding:"7px 12px",color:"#6b8aaa",fontSize:10}}>{origen||"—"}</td>
                      <td style={{padding:"7px 12px",color:"#6b8aaa",fontSize:10}}>{destino||"—"}</td>
                      <td style={{padding:"7px 12px",color:"#d97706"}}>{m.precio_litro>0?`$${fmt(m.precio_litro)}`:"—"}</td>
                      <td style={{padding:"7px 12px",color:"#d97706",fontWeight:700}}>{m.ppp_momento>0?`$${fmt(m.ppp_momento)}`:"—"}</td>
                      <td style={{padding:"7px 12px",fontWeight:700,color:"#0d2137",whiteSpace:"nowrap"}}>{m.monto_total>0?`$${fmt(m.monto_total)}`:"—"}</td>
                      <td style={{padding:"7px 12px",fontWeight:700,color:"#16a34a",whiteSpace:"nowrap"}}>{m.monto_usd>0?`U$S ${m.monto_usd.toFixed(2)}`:"—"}</td>
                      <td style={{padding:"7px 12px",color:"#4a6a8a",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {lotesNombres||m.equipo||m.proveedor||"—"}
                      </td>
                      <td style={{padding:"7px 12px",color:"#aab8c8",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:10}}>
                        {m.observaciones||"—"}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            {movsPorTipo.length===0&&(
              <div style={{textAlign:"center",padding:"30px",color:"#6b8aaa",fontSize:13}}>Sin movimientos para este filtro</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
