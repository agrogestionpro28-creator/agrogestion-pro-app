// ══════════════════════════════════════════════
// INSUMOS STOCK — Vista con FIFO
// Los movimientos se cargan desde Centro de Gestión
// ══════════════════════════════════════════════
"use client";
// @ts-nocheck
import { useEffect, useState } from "react";

type Producto = { id:string; nombre:string; categoria:string; unidad:string; };
type LoteFifo = {
  id:string; producto_id:string; deposito_id:string|null;
  fecha_compra:string; cantidad_original:number; cantidad_restante:number;
  precio_unitario:number; moneda:string; precio_usd:number;
  proveedor:string; fecha_vto:string|null; observaciones:string;
};
type Movimiento = {
  id:string; fecha:string; tipo:string; cantidad:number;
  producto_id:string; precio_usd:number; costo_total_usd:number;
  cultivo:string; observaciones:string; lote_ids:string[];
  fifo_detalle:any;
};
type Deposito = { id:string; nombre:string; };

const CAT_COLORS:Record<string,string> = {
  herbicida:"#22c55e", fungicida:"#a78bfa", insecticida:"#f97316",
  fertilizante:"#d97706", semilla:"#60a5fa", curasemilla:"#06b6d4",
  coadyuvante:"#84cc16", repuesto:"#6b7280", otro:"#9ca3af"
};
const CAT_ICONS:Record<string,string> = {
  herbicida:"🌿", fungicida:"🍄", insecticida:"🐛",
  fertilizante:"💊", semilla:"🌱", curasemilla:"🧪",
  coadyuvante:"⚗️", repuesto:"🔧", otro:"📦"
};

function fmt(n:number){ return Math.round(n).toLocaleString("es-AR"); }

interface Props {
  empresaId:string|null;
  getSB:()=>Promise<any>;
  mostrarMsg:(t:string)=>void;
}

export function InsumosStock({ empresaId, getSB, mostrarMsg }:Props) {
  const [productos, setProductos]     = useState<Producto[]>([]);
  const [lotesFifo, setLotesFifo]     = useState<LoteFifo[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [depositos, setDepositos]     = useState<Deposito[]>([]);
  const [lotes, setLotes]             = useState<{id:string;nombre:string}[]>([]);
  const [loading, setLoading]         = useState(true);
  const [prodActivo, setProdActivo]   = useState<string|null>(null);
  const [catFiltro, setCatFiltro]     = useState<string>("todos");
  const [showLotesFifo, setShowLotesFifo] = useState(false);

  useEffect(()=>{ if(empresaId) fetchAll(); },[empresaId]);

  const fetchAll = async () => {
    if(!empresaId){ setLoading(false); return; }
    setLoading(true);
    const sb = await getSB();
    const [prods, fifo, movs, deps, ls] = await Promise.all([
      sb.from("insumos_productos").select("*").eq("empresa_id",empresaId).eq("activo",true).order("categoria").order("nombre"),
      sb.from("insumos_lotes_fifo").select("*").eq("empresa_id",empresaId).order("fecha_compra",{ascending:true}),
      sb.from("insumos_movimientos").select("*").eq("empresa_id",empresaId).order("fecha",{ascending:false}),
      sb.from("insumos_depositos").select("*").eq("empresa_id",empresaId).eq("activo",true).order("nombre"),
      sb.from("lotes").select("id,nombre").eq("empresa_id",empresaId).order("nombre"),
    ]);
    setProductos(prods.data??[]);
    setLotesFifo(fifo.data??[]);
    setMovimientos(movs.data??[]);
    setDepositos(deps.data??[]);
    setLotes(ls.data??[]);
    setLoading(false);
  };

  // Stock por producto
  const stockProducto = (prodId:string) => {
    const fifo = lotesFifo.filter(l=>l.producto_id===prodId);
    const totalComprado = fifo.filter(l=>l.cantidad_original>0).reduce((a,l)=>a+l.cantidad_original,0);
    const stockActual   = fifo.reduce((a,l)=>a+l.cantidad_restante,0);
    const enNegativo    = fifo.filter(l=>l.cantidad_restante<0).reduce((a,l)=>a+l.cantidad_restante,0);
    // PPP de lotes con precio > 0 y cantidad > 0
    const lotesConPrecio = fifo.filter(l=>l.cantidad_restante>0&&l.precio_usd>0);
    const totLit = lotesConPrecio.reduce((a,l)=>a+l.cantidad_restante,0);
    const ppp = totLit>0 ? lotesConPrecio.reduce((a,l)=>a+l.cantidad_restante*l.precio_usd,0)/totLit : 0;
    // Costo total
    const costoUsd = stockActual>0 ? stockActual*ppp : 0;
    // Movimientos del producto
    const movsProd = movimientos.filter(m=>m.producto_id===prodId);
    const totalUsado  = movsProd.filter(m=>m.tipo==="uso").reduce((a,m)=>a+m.cantidad,0);
    const totalCostoUsd = movsProd.filter(m=>m.tipo==="uso").reduce((a,m)=>a+m.costo_total_usd,0);
    return { stockActual, totalComprado, enNegativo, ppp, costoUsd, totalUsado, totalCostoUsd, movsProd };
  };

  const exportarExcel = async (prodId?:string) => {
    const XLSX = await import("xlsx");
    const data = movimientos
      .filter(m=>!prodId||m.producto_id===prodId)
      .map(m=>{
        const prod = productos.find(p=>p.id===m.producto_id);
        return {
          FECHA:m.fecha, PRODUCTO:prod?.nombre||"—", CATEGORIA:prod?.categoria||"—",
          TIPO:m.tipo.toUpperCase(), CANTIDAD:m.cantidad, UNIDAD:prod?.unidad||"",
          PRECIO_USD:m.precio_usd, COSTO_TOTAL_USD:m.costo_total_usd,
          CULTIVO:m.cultivo||"—",
          LOTES:m.lote_ids?.map(lid=>lotes.find(l=>l.id===lid)?.nombre||"?").join(", ")||"",
          OBSERVACIONES:m.observaciones||"",
        };
      });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"]=[{wch:12},{wch:22},{wch:14},{wch:10},{wch:10},{wch:8},{wch:12},{wch:16},{wch:12},{wch:24},{wch:24}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,prodId?"Insumo":"Todos");
    XLSX.writeFile(wb,`insumos_${prodId?"movimientos":"stock"}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const categorias = [...new Set(productos.map(p=>p.categoria))];
  const prodsFiltrados = catFiltro==="todos" ? productos : productos.filter(p=>p.categoria===catFiltro);
  const prodActivoData = prodActivo ? productos.find(p=>p.id===prodActivo) : null;
  const stockActivoData = prodActivo ? stockProducto(prodActivo) : null;
  const lotesFifoActivo = prodActivo ? lotesFifo.filter(l=>l.producto_id===prodActivo) : [];
  const movsActivos = prodActivo ? movimientos.filter(m=>m.producto_id===prodActivo) : [];

  if(loading) return(
    <div style={{textAlign:"center",padding:"40px",color:"#6b8aaa"}}>
      <div style={{width:24,height:24,border:"3px solid #16a34a",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 8px"}}/>
      Cargando insumos...
    </div>
  );

  // ══ DETALLE PRODUCTO ══
  if(prodActivo&&prodActivoData&&stockActivoData) {
    const color = CAT_COLORS[prodActivoData.categoria]??"#6b7280";
    const icon  = CAT_ICONS[prodActivoData.categoria]??"📦";
    return(
      <div className="fade-in">
        {/* Header */}
        <div className="card" style={{padding:"12px 16px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:24}}>{icon}</span>
              <div>
                <div style={{fontSize:16,fontWeight:800,color:"#0d2137"}}>{prodActivoData.nombre}</div>
                <div style={{fontSize:11,color:color,fontWeight:700,textTransform:"uppercase"}}>{prodActivoData.categoria} · {prodActivoData.unidad}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>exportarExcel(prodActivo)} className="abtn" style={{fontSize:11}}>📤 Excel</button>
              <button onClick={()=>setShowLotesFifo(!showLotesFifo)} className="abtn" style={{fontSize:11}}>
                {showLotesFifo?"▲ Ocultar":"📦 Lotes FIFO"}
              </button>
              <button onClick={()=>setProdActivo(null)} className="abtn" style={{fontSize:11}}>← Volver</button>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8,marginBottom:14}}>
          {[
            {l:"Stock Actual",    v:`${stockActivoData.stockActual.toFixed(2)} ${prodActivoData.unidad}`, c:stockActivoData.stockActual>=0?"#16a34a":"#dc2626"},
            {l:"PPP actual",     v:stockActivoData.ppp>0?`U$S ${stockActivoData.ppp.toFixed(2)}/${prodActivoData.unidad}`:"—", c:"#d97706"},
            {l:"Valor stock",    v:stockActivoData.costoUsd>0?`U$S ${stockActivoData.costoUsd.toFixed(2)}`:"—", c:"#22c55e"},
            {l:"Total comprado", v:`${stockActivoData.totalComprado.toFixed(1)} ${prodActivoData.unidad}`, c:"#1565c0"},
            {l:"Total usado",    v:`${stockActivoData.totalUsado.toFixed(1)} ${prodActivoData.unidad}`, c:"#f97316"},
            {l:"Costo imputado", v:`U$S ${stockActivoData.totalCostoUsd.toFixed(2)}`, c:"#7c3aed"},
          ].map(s=>(
            <div key={s.l} className="kpi-s">
              <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",marginBottom:3}}>{s.l}</div>
              <div style={{fontSize:12,fontWeight:800,color:s.c}}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Alerta negativo */}
        {stockActivoData.enNegativo<0&&(
          <div style={{padding:"8px 14px",borderRadius:9,background:"rgba(220,38,38,0.08)",border:"1px solid rgba(220,38,38,0.25)",marginBottom:12,fontSize:12,color:"#fca5a5",fontWeight:700}}>
            ⚠️ Stock negativo: {stockActivoData.enNegativo.toFixed(2)} {prodActivoData.unidad} — hay usos sin compra registrada. Cargá la compra desde Centro de Gestión → Insumos.
          </div>
        )}

        {/* Lotes FIFO */}
        {showLotesFifo&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:800,color:"#0d2137",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>📦 Lotes FIFO (orden de consumo)</div>
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:600}}>
                  <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                    {["Fecha compra","Depósito","Cant. orig.","Cant. restante","Precio","Moneda","U$S/u","Proveedor","Vto.","Estado"].map(h=>(
                      <th key={h} style={{textAlign:"left",padding:"7px 12px",fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{lotesFifoActivo.map(l=>{
                    const dep = depositos.find(d=>d.id===l.deposito_id);
                    const agotado = l.cantidad_restante<=0;
                    const negativo = l.cantidad_restante<0;
                    const hoy = new Date();
                    const vencido = l.fecha_vto&&new Date(l.fecha_vto)<hoy;
                    return(
                      <tr key={l.id} style={{borderBottom:"1px solid rgba(0,60,140,0.05)",opacity:agotado&&!negativo?0.45:1,
                        background:negativo?"rgba(220,38,38,0.04)":vencido?"rgba(217,119,6,0.04)":"transparent"}}>
                        <td style={{padding:"7px 12px",color:"#6b8aaa",whiteSpace:"nowrap",fontWeight:600}}>{l.fecha_compra}</td>
                        <td style={{padding:"7px 12px",color:"#4a6a8a",fontSize:10}}>{dep?.nombre||"—"}</td>
                        <td style={{padding:"7px 12px",fontWeight:700,color:"#0d2137"}}>{Number(l.cantidad_original).toFixed(2)} {prodActivoData.unidad}</td>
                        <td style={{padding:"7px 12px",fontWeight:800,color:negativo?"#dc2626":agotado?"#aab8c8":"#16a34a"}}>{Number(l.cantidad_restante).toFixed(2)} {prodActivoData.unidad}</td>
                        <td style={{padding:"7px 12px",color:"#d97706"}}>{l.precio_unitario>0?`$${fmt(l.precio_unitario)}`:"—"}</td>
                        <td style={{padding:"7px 12px",color:"#6b8aaa",fontSize:10}}>{l.moneda}</td>
                        <td style={{padding:"7px 12px",fontWeight:700,color:"#c9a227"}}>{l.precio_usd>0?`U$S ${l.precio_usd.toFixed(2)}`:"—"}</td>
                        <td style={{padding:"7px 12px",color:"#6b8aaa",fontSize:10}}>{l.proveedor||"—"}</td>
                        <td style={{padding:"7px 12px",fontSize:10,color:vencido?"#d97706":"#6b8aaa"}}>{l.fecha_vto||"—"}{vencido&&" ⚠️"}</td>
                        <td style={{padding:"7px 12px"}}>
                          <span style={{fontSize:9,padding:"2px 7px",borderRadius:20,fontWeight:700,
                            background:negativo?"rgba(220,38,38,0.12)":agotado?"rgba(107,114,128,0.12)":"rgba(22,163,74,0.12)",
                            color:negativo?"#dc2626":agotado?"#6b7280":"#16a34a"}}>
                            {negativo?"Negativo":agotado?"Agotado":"Disponible"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Historial movimientos */}
        <div style={{fontSize:11,fontWeight:800,color:"#0d2137",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>📋 Historial de Movimientos</div>
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          {movsActivos.length===0
            ?<div style={{textAlign:"center",padding:"30px",color:"#6b8aaa",fontSize:13}}>Sin movimientos registrados</div>
            :<div style={{overflowX:"auto"}}>
              <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:600}}>
                <thead><tr style={{borderBottom:"1px solid rgba(0,60,140,0.08)"}}>
                  {["Fecha","Tipo","Cantidad","Precio U$S","Costo total","Cultivo","Lotes","Obs."].map(h=>(
                    <th key={h} style={{textAlign:"left",padding:"7px 12px",fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{movsActivos.map(m=>{
                  const tc = {compra:"#22c55e",uso:"#f97316",ajuste:"#a78bfa"}[m.tipo]||"#6b7280";
                  const lotesNom = m.lote_ids?.map((lid:string)=>lotes.find(l=>l.id===lid)?.nombre||"?").join(", ")||"";
                  return(
                    <tr key={m.id} style={{borderBottom:"1px solid rgba(0,60,140,0.05)"}}
                      onMouseEnter={e=>(e.currentTarget as any).style.background="rgba(240,248,255,0.50)"}
                      onMouseLeave={e=>(e.currentTarget as any).style.background="transparent"}>
                      <td style={{padding:"7px 12px",color:"#6b8aaa",whiteSpace:"nowrap",fontWeight:600}}>{m.fecha}</td>
                      <td style={{padding:"7px 12px"}}>
                        <span style={{fontSize:10,padding:"2px 7px",borderRadius:5,fontWeight:700,background:tc+"15",color:tc}}>{m.tipo}</span>
                      </td>
                      <td style={{padding:"7px 12px",fontWeight:800,color:m.tipo==="compra"?"#22c55e":"#f97316",whiteSpace:"nowrap"}}>
                        {m.tipo==="compra"?"+":"-"}{Math.abs(m.cantidad).toFixed(2)} {prodActivoData.unidad}
                      </td>
                      <td style={{padding:"7px 12px",color:"#d97706"}}>{m.precio_usd>0?`U$S ${m.precio_usd.toFixed(2)}`:"—"}</td>
                      <td style={{padding:"7px 12px",fontWeight:700,color:m.tipo==="uso"?"#f97316":"#22c55e"}}>{m.costo_total_usd>0?`U$S ${m.costo_total_usd.toFixed(2)}`:"—"}</td>
                      <td style={{padding:"7px 12px",color:"#16a34a",fontSize:10}}>{m.cultivo||"—"}</td>
                      <td style={{padding:"7px 12px",color:"#4a6a8a",fontSize:10,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{lotesNom||"—"}</td>
                      <td style={{padding:"7px 12px",color:"#aab8c8",fontSize:10,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.observaciones||"—"}</td>
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

  // ══ VISTA PRINCIPAL ══
  // KPIs generales
  const totalProductos = productos.length;
  const prodConStock   = productos.filter(p=>stockProducto(p.id).stockActual>0).length;
  const prodNegativos  = productos.filter(p=>stockProducto(p.id).stockActual<0).length;
  const valorTotal     = productos.reduce((a,p)=>a+stockProducto(p.id).costoUsd,0);

  return(
    <div className="fade-in">
      {/* Banner Centro de Gestión */}
      <div style={{padding:"10px 16px",borderRadius:10,background:"rgba(22,163,74,0.07)",border:"1px solid rgba(22,163,74,0.20)",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"#16a34a"}}>⚙ Compras y usos se cargan desde Centro de Gestión → Insumos</div>
          <div style={{fontSize:10,color:"#6b8aaa",marginTop:1}}>El stock se actualiza automáticamente con lógica FIFO (primero entrado, primero salido)</div>
        </div>
        <button onClick={()=>window.location.href="/productor/otros"}
          style={{padding:"6px 14px",borderRadius:9,background:"rgba(22,163,74,0.10)",border:"1px solid rgba(22,163,74,0.30)",color:"#16a34a",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
          Ir a Centro de Gestión →
        </button>
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8,marginBottom:14}}>
        {[
          {l:"Productos",       v:String(totalProductos),            c:"#0d2137"},
          {l:"Con stock",       v:String(prodConStock),              c:"#16a34a"},
          {l:"Negativos",       v:String(prodNegativos),             c:prodNegativos>0?"#dc2626":"#6b8aaa"},
          {l:"Valor total",     v:`U$S ${fmt(valorTotal)}`,          c:"#d97706"},
          {l:"Depósitos",       v:String(depositos.length),          c:"#6b8aaa"},
          {l:"Movimientos",     v:String(movimientos.length),        c:"#6b8aaa"},
        ].map(s=>(
          <div key={s.l} className="kpi-s">
            <div style={{fontSize:9,color:"#6b8aaa",fontWeight:700,textTransform:"uppercase",marginBottom:3}}>{s.l}</div>
            <div style={{fontSize:14,fontWeight:800,color:s.c}}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Filtros por categoría */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,alignItems:"center"}}>
        <button onClick={()=>setCatFiltro("todos")}
          style={{padding:"5px 12px",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
            border:`1px solid ${catFiltro==="todos"?"#0d2137":"rgba(180,210,240,0.40)"}`,
            background:catFiltro==="todos"?"rgba(13,33,55,0.10)":"rgba(255,255,255,0.60)",
            color:catFiltro==="todos"?"#0d2137":"#6b8aaa"}}>
          Todos ({totalProductos})
        </button>
        {categorias.map(cat=>{
          const c = CAT_COLORS[cat]??"#6b7280";
          const count = productos.filter(p=>p.categoria===cat).length;
          return(
            <button key={cat} onClick={()=>setCatFiltro(cat)}
              style={{padding:"5px 12px",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                border:`1px solid ${catFiltro===cat?c:c+"40"}`,
                background:catFiltro===cat?c+"15":"rgba(255,255,255,0.60)",
                color:catFiltro===cat?c:c+"80"}}>
              {CAT_ICONS[cat]||"📦"} {cat} ({count})
            </button>
          );
        })}
        <button onClick={()=>exportarExcel()} className="abtn" style={{fontSize:10,padding:"4px 10px",marginLeft:"auto"}}>📤 Excel todo</button>
        <button onClick={fetchAll} className="abtn" style={{fontSize:10,padding:"4px 10px"}}>↺</button>
      </div>

      {/* Grid productos */}
      {prodsFiltrados.length===0?(
        <div className="card" style={{padding:"40px 20px",textAlign:"center"}}>
          <div style={{fontSize:36,opacity:0.15,marginBottom:10}}>🧪</div>
          <p style={{color:"#6b8aaa",fontSize:13,marginBottom:6}}>Sin productos cargados</p>
          <p style={{color:"#aab8c8",fontSize:11}}>Creá productos desde Centro de Gestión → Insumos</p>
          <button onClick={()=>window.location.href="/productor/otros"} className="bbtn" style={{marginTop:12,fontSize:11}}>Ir a Centro de Gestión →</button>
        </div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
          {prodsFiltrados.map(prod=>{
            const s = stockProducto(prod.id);
            const color = CAT_COLORS[prod.categoria]??"#6b7280";
            const icon  = CAT_ICONS[prod.categoria]??"📦";
            const vencidos = lotesFifo.filter(l=>l.producto_id===prod.id&&l.fecha_vto&&new Date(l.fecha_vto)<new Date()&&l.cantidad_restante>0).length;
            return(
              <div key={prod.id} className="card"
                style={{padding:"12px 14px",cursor:"pointer",
                  border:`1.5px solid ${s.stockActual<0?"rgba(220,38,38,0.30)":vencidos>0?"rgba(217,119,6,0.30)":"rgba(255,255,255,0.88)"}`}}
                onClick={()=>setProdActivo(prod.id)}>
                {/* Franja color */}
                <div style={{height:3,background:color,borderRadius:"10px 10px 0 0",margin:"-12px -14px 10px",width:"calc(100% + 28px)"}}/>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{fontSize:18}}>{icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#0d2137",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{prod.nombre}</div>
                    <div style={{fontSize:9,color:color,fontWeight:700,textTransform:"uppercase"}}>{prod.categoria}</div>
                  </div>
                  {vencidos>0&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:20,fontWeight:700,background:"rgba(217,119,6,0.12)",color:"#d97706"}}>⚠️</span>}
                </div>
                {/* Stock grande */}
                <div style={{textAlign:"center",padding:"8px 0",borderRadius:8,
                  background:s.stockActual>=0?"rgba(22,163,74,0.06)":"rgba(220,38,38,0.06)",
                  border:`1px solid ${s.stockActual>=0?"rgba(22,163,74,0.15)":"rgba(220,38,38,0.15)"}`,
                  marginBottom:8}}>
                  <div style={{fontSize:18,fontWeight:900,color:s.stockActual>=0?"#16a34a":"#dc2626"}}>
                    {s.stockActual.toFixed(1)}
                  </div>
                  <div style={{fontSize:10,color:"#6b8aaa",fontWeight:600}}>{prod.unidad}</div>
                </div>
                {/* Mini stats */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                  <div className="kpi-s" style={{padding:"4px 6px"}}>
                    <div style={{fontSize:8,color:"#6b8aaa"}}>PPP</div>
                    <div style={{fontSize:10,fontWeight:800,color:"#d97706"}}>{s.ppp>0?`U$S ${s.ppp.toFixed(2)}`:"—"}</div>
                  </div>
                  <div className="kpi-s" style={{padding:"4px 6px"}}>
                    <div style={{fontSize:8,color:"#6b8aaa"}}>Valor</div>
                    <div style={{fontSize:10,fontWeight:800,color:"#0d2137"}}>{s.costoUsd>0?`U$S ${s.costoUsd.toFixed(0)}`:"—"}</div>
                  </div>
                </div>
                <div style={{marginTop:8,fontSize:9,color:"#1565c0",fontWeight:600,textAlign:"center"}}>Ver detalle FIFO →</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
