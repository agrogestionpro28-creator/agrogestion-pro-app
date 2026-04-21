"use client";
import { useEffect, useState, useRef } from "react";

type Msg = { id: string; autor_id: string; autor_nombre: string; autor_rol: string; contenido: string; created_at: string; leido_por: string[]; };
type Conv = { id: string; tipo: string; nombre: string; participantes: string[]; };
type User = { id: string; nombre: string; rol: string; };

export default function ChatFlotante({ empresaId, usuarioId, usuarioNombre, usuarioRol }: {
  empresaId: string; usuarioId: string; usuarioNombre: string; usuarioRol: string;
}) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<"list"|"users"|"chat">("list");
  const [convs, setConvs] = useState<Conv[]>([]);
  const [conv, setConv] = useState<Conv|null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [txt, setTxt] = useState("");
  const [badge, setBadge] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const chRef = useRef<any>(null);

  const SB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  const scroll = () => setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 80);

  const loadConvs = async () => {
    const sb = await SB();
    const { data } = await sb.from("mensajes_conversaciones").select("*")
      .eq("empresa_id", empresaId).contains("participantes", [usuarioId]);
    setConvs(data ?? []);
  };

  const loadUsers = async () => {
    const sb = await SB();
    const { data: vincs } = await sb.from("vinculaciones").select("profesional_id")
      .eq("empresa_id", empresaId).eq("activa", true);
    const { data: emp } = await sb.from("empresas").select("propietario_id").eq("id", empresaId).maybeSingle();
    const ids = [...new Set([...(vincs?.map((v:any)=>v.profesional_id)??[]), emp?.propietario_id].filter(Boolean).filter(id=>id!==usuarioId))];
    if (!ids.length) return;
    const { data } = await sb.from("usuarios").select("id,nombre,rol").in("id", ids);
    setUsers(data ?? []);
  };

  const getOrCreateGroup = async () => {
    const sb = await SB();
    const { data } = await sb.from("mensajes_conversaciones").select("*")
      .eq("empresa_id", empresaId).eq("tipo", "grupo");
    if (data && data.length > 0) {
      const g = data[0];
      if (!g.participantes?.includes(usuarioId)) {
        await sb.from("mensajes_conversaciones").update({ participantes: [...(g.participantes||[]), usuarioId] }).eq("id", g.id);
      }
      return { ...g, participantes: g.participantes?.includes(usuarioId) ? g.participantes : [...(g.participantes||[]), usuarioId] };
    }
    const { data: nuevo } = await sb.from("mensajes_conversaciones").insert({
      empresa_id: empresaId, tipo: "grupo", nombre: "Campo General", participantes: [usuarioId],
    }).select().single();
    return nuevo;
  };

  const openConv = async (c: Conv) => {
    setConv(c);
    setScreen("chat");
    const sb = await SB();
    const { data } = await sb.from("mensajes").select("*").eq("conversacion_id", c.id)
      .order("created_at", { ascending: true }).limit(60);
    setMsgs(data ?? []);
    scroll();
    if (chRef.current) { try { await (await SB()).removeChannel(chRef.current); } catch {} }
    chRef.current = (await SB()).channel("chat_" + c.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes", filter: `conversacion_id=eq.${c.id}` },
        (p: any) => { setMsgs(prev => [...prev, p.new]); scroll(); if (p.new.autor_id !== usuarioId) setBadge(b=>b+1); })
      .subscribe();
  };

  const openGroup = async () => {
    const g = await getOrCreateGroup();
    if (g) { await loadConvs(); await openConv(g); }
  };

  const openDM = async (u: User) => {
    const sb = await SB();
    const { data } = await sb.from("mensajes_conversaciones").select("*")
      .eq("empresa_id", empresaId).eq("tipo", "individual").contains("participantes", [usuarioId]);
    const ex = data?.find((c:any) => c.participantes?.includes(u.id) && c.participantes?.length === 2);
    if (ex) { await openConv(ex); return; }
    const { data: n } = await sb.from("mensajes_conversaciones").insert({
      empresa_id: empresaId, tipo: "individual", nombre: u.nombre, participantes: [usuarioId, u.id],
    }).select().single();
    if (n) await openConv(n);
  };

  const send = async () => {
    const t = txt.trim();
    if (!t || !conv) return;
    setTxt("");
    const sb = await SB();
    await sb.from("mensajes").insert({
      conversacion_id: conv.id, empresa_id: empresaId,
      autor_id: usuarioId, autor_nombre: usuarioNombre, autor_rol: usuarioRol,
      contenido: t, tipo: "texto", leido_por: [usuarioId],
    });
  };

  useEffect(() => {
    if (!empresaId || !usuarioId) return;
    getOrCreateGroup().then(() => { loadConvs(); loadUsers(); });
    if (typeof window !== "undefined" && Notification.permission === "default") Notification.requestPermission();
  }, [empresaId, usuarioId]);

  if (!empresaId || !usuarioId) return null;

  const ROLES: Record<string,string> = { productor:"👨‍🌾", ingeniero:"👨‍💼", veterinario:"🩺", empleado:"👷", aplicador:"💧", sembrador:"🌱", cosechadora:"🌾", servicios:"🔧" };

  return (
    <div style={{ position:"fixed", bottom:20, left:16, zIndex:9999, fontFamily:"system-ui,sans-serif", isolation:"isolate" }}>
      {/* PANEL */}
      {open && (
        <div style={{
          position:"absolute", bottom:64, left:0, top:"auto",
          width:300, maxHeight:400, height:"auto",
          background:"#fff", borderRadius:12,
          boxShadow:"0 4px 24px rgba(0,0,0,0.20)",
          border:"1px solid #d0e4f0",
          display:"flex", flexDirection:"column",
        }}>
          {/* HEADER */}
          <div style={{ background:"#1976d2", borderRadius:"12px 12px 0 0", padding:"10px 12px", display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
            {screen !== "list" && (
              <button onClick={()=>{ setScreen("list"); setConv(null); setMsgs([]); }}
                style={{ background:"none", border:"none", color:"#fff", cursor:"pointer", fontSize:18, padding:0, lineHeight:1, marginRight:2 }}>←</button>
            )}
            <span style={{ flex:1, color:"#fff", fontWeight:700, fontSize:13 }}>
              {screen==="list" ? "💬 Mensajería" : screen==="users" ? "Nuevo chat" : conv?.nombre || "Chat"}
            </span>
            {screen==="list" && (
              <button onClick={()=>setScreen("users")}
                style={{ background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", borderRadius:6, padding:"3px 9px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                + Nuevo
              </button>
            )}
            <button onClick={()=>setOpen(false)}
              style={{ background:"none", border:"none", color:"#fff", cursor:"pointer", fontSize:18, padding:0, lineHeight:1 }}>✕</button>
          </div>

          {/* LIST */}
          {screen==="list" && (
            <div style={{ flex:1, overflowY:"auto" }}>
              <div onClick={openGroup}
                style={{ padding:"12px 14px", borderBottom:"1px solid #f0f4f8", cursor:"pointer", display:"flex", alignItems:"center", gap:10, background:"#f0f7ff" }}>
                <div style={{ width:36, height:36, borderRadius:"50%", background:"#1976d2", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:17, flexShrink:0 }}>🌾</div>
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:"#0d2137" }}>Campo General</div>
                  <div style={{ fontSize:11, color:"#6b8aaa" }}>Todos los del campo</div>
                </div>
              </div>
              {convs.filter(c=>c.tipo==="individual").map(c=>(
                <div key={c.id} onClick={()=>openConv(c)}
                  style={{ padding:"12px 14px", borderBottom:"1px solid #f0f4f8", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:36, height:36, borderRadius:"50%", background:"#e8f4fd", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, flexShrink:0 }}>👤</div>
                  <div style={{ fontWeight:700, fontSize:13, color:"#0d2137" }}>{c.nombre}</div>
                </div>
              ))}
            </div>
          )}

          {/* USERS */}
          {screen==="users" && (
            <div style={{ flex:1, overflowY:"auto" }}>
              <div style={{ padding:"8px 14px", fontSize:11, color:"#999", textTransform:"uppercase", fontWeight:700 }}>Chatear con...</div>
              {users.length===0 && <div style={{ padding:"16px 14px", fontSize:12, color:"#aaa", textAlign:"center" }}>Sin otros usuarios conectados</div>}
              {users.map(u=>(
                <div key={u.id} onClick={()=>openDM(u)}
                  style={{ padding:"10px 14px", borderBottom:"1px solid #f0f4f8", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:"50%", background:"#f0f4f8", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>
                    {ROLES[u.rol]||"👤"}
                  </div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:"#0d2137" }}>{u.nombre}</div>
                    <div style={{ fontSize:11, color:"#1976d2", fontWeight:600 }}>{u.rol}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CHAT */}
          {screen==="chat" && (
            <>
              <div style={{ flex:1, overflowY:"auto", padding:"10px 12px", display:"flex", flexDirection:"column", gap:6 }}>
                {msgs.length===0 && (
                  <div style={{ textAlign:"center", padding:"30px 12px", color:"#aaa", fontSize:12 }}>
                    Sin mensajes. ¡Escribí el primero!
                  </div>
                )}
                {msgs.map(m=>{
                  const mine = m.autor_id===usuarioId;
                  return (
                    <div key={m.id} style={{ display:"flex", flexDirection:"column", alignItems:mine?"flex-end":"flex-start" }}>
                      {!mine && <div style={{ fontSize:10, color:"#1976d2", fontWeight:700, marginBottom:2, marginLeft:4 }}>{ROLES[m.autor_rol]||"👤"} {m.autor_nombre}</div>}
                      <div style={{
                        maxWidth:"80%", padding:"8px 11px", fontSize:13, lineHeight:1.4, wordBreak:"break-word",
                        borderRadius: mine?"14px 14px 3px 14px":"14px 14px 14px 3px",
                        background: mine?"#1976d2":"#f0f4f8",
                        color: mine?"#fff":"#1a2a4a",
                      }}>{m.contenido}</div>
                      <div style={{ fontSize:9, color:"#bbb", marginTop:2, marginLeft:4, marginRight:4 }}>
                        {new Date(m.created_at).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef}/>
              </div>

              {/* INPUT */}
              <div style={{ padding:"8px 10px", borderTop:"1px solid #e8f0f8", flexShrink:0, background:"#fff" }}>
                <div style={{ display:"flex", gap:6 }}>
                  <input
                    value={txt}
                    onChange={e=>setTxt(e.target.value)}
                    onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); send(); } }}
                    placeholder="Escribí un mensaje..."
                    style={{
                      flex:1, minWidth:0, padding:"8px 12px",
                      border:"1px solid #cde", borderRadius:20,
                      fontSize:13, outline:"none", color:"#1a2a4a", background:"#f7fafd",
                    }}
                  />
                  <button onClick={send}
                    style={{
                      width:34, height:34, borderRadius:"50%", flexShrink:0,
                      background: txt.trim()?"#1976d2":"#e0eaf4",
                      border:"none", color: txt.trim()?"#fff":"#aaa",
                      fontSize:16, cursor:"pointer",
                      display:"flex", alignItems:"center", justifyContent:"center",
                    }}>→</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* BOTÓN */}
      <button
        onClick={()=>{ setOpen(v=>!v); if(!open){ setBadge(0); loadConvs(); } }}
        style={{
          width:52, height:52, borderRadius:"50%",
          background:"#1976d2", border:"3px solid #fff",
          boxShadow:"0 4px 16px rgba(25,118,210,0.55)",
          cursor:"pointer", fontSize:22, color:"#fff",
          display:"flex", alignItems:"center", justifyContent:"center",
          position:"relative",
        }}
      >
        {open ? "✕" : "💬"}
        {badge>0 && !open && (
          <div style={{
            position:"absolute", top:-3, right:-3,
            background:"#dc2626", color:"#fff", borderRadius:"50%",
            width:18, height:18, fontSize:10, fontWeight:800,
            display:"flex", alignItems:"center", justifyContent:"center", border:"2px solid #fff",
          }}>{badge>9?"9+":badge}</div>
        )}
      </button>
    </div>
  );
}
