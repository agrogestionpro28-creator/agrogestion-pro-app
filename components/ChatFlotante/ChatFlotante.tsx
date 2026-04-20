"use client";
import { useEffect, useState, useRef, useCallback } from "react";

type Mensaje = {
  id: string;
  conversacion_id: string;
  autor_id: string;
  autor_nombre: string;
  autor_rol: string;
  contenido: string;
  tipo: string;
  accion_estado: string;
  leido_por: string[];
  created_at: string;
};

type Conversacion = {
  id: string;
  tipo: string;
  nombre: string;
  participantes: string[];
  noLeidos?: number;
};

type Usuario = {
  id: string;
  nombre: string;
  rol: string;
};

const ROL_COLOR: Record<string, string> = {
  productor: "#16a34a", ingeniero: "#1976d2", veterinario: "#7c3aed",
  empleado: "#d97706", aplicador: "#0891b2", sembrador: "#15803d",
  cosechadora: "#b45309", servicios: "#6b7280", admin: "#dc2626",
};
const ROL_ICON: Record<string, string> = {
  productor: "👨‍🌾", ingeniero: "👨‍💼", veterinario: "🩺",
  empleado: "👷", aplicador: "💧", sembrador: "🌱",
  cosechadora: "🌾", servicios: "🔧", admin: "👑",
};

export default function ChatFlotante({ empresaId, usuarioId, usuarioNombre, usuarioRol }: {
  empresaId: string;
  usuarioId: string;
  usuarioNombre: string;
  usuarioRol: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [vista, setVista] = useState<"lista" | "chat" | "nuevos">("lista");
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [convActiva, setConvActiva] = useState<Conversacion | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [texto, setTexto] = useState("");
  const [noLeidos, setNoLeidos] = useState(0);
  const [cargando, setCargando] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<any>(null);

  const getSB = useCallback(async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const scrollBottom = () => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const getGrupo = useCallback(async () => {
    const client = await getSB();
    const { data: grupos } = await client
      .from("mensajes_conversaciones")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("tipo", "grupo");

    if (!grupos || grupos.length === 0) {
      const { data: nuevo } = await client
        .from("mensajes_conversaciones")
        .insert({ empresa_id: empresaId, tipo: "grupo", nombre: "🌾 Campo General", participantes: [usuarioId] })
        .select().single();
      return nuevo;
    }
    const grupo = grupos[0];
    if (!grupo.participantes?.includes(usuarioId)) {
      await client.from("mensajes_conversaciones")
        .update({ participantes: [...(grupo.participantes || []), usuarioId] })
        .eq("id", grupo.id);
    }
    return grupo;
  }, [empresaId, usuarioId, getSB]);

  const cargarConvs = useCallback(async () => {
    const client = await getSB();
    const { data } = await client.from("mensajes_conversaciones")
      .select("*").eq("empresa_id", empresaId).contains("participantes", [usuarioId]);
    if (!data) return;
    let total = 0;
    const convs = await Promise.all(data.map(async (c: any) => {
      const { count } = await client.from("mensajes")
        .select("*", { count: "exact", head: true })
        .eq("conversacion_id", c.id)
        .not("leido_por", "cs", `{${usuarioId}}`);
      total += count ?? 0;
      return { ...c, noLeidos: count ?? 0 };
    }));
    setConversaciones(convs);
    setNoLeidos(total);
  }, [empresaId, usuarioId, getSB]);

  const cargarUsuarios = useCallback(async () => {
    const client = await getSB();
    const { data: vincs } = await client.from("vinculaciones")
      .select("profesional_id").eq("empresa_id", empresaId).eq("activa", true);
    const { data: empresa } = await client.from("empresas")
      .select("propietario_id").eq("id", empresaId).maybeSingle();
    const ids = [...new Set([
      ...(vincs?.map((v: any) => v.profesional_id) ?? []),
      empresa?.propietario_id,
    ].filter(Boolean).filter((id) => id !== usuarioId))];
    if (ids.length === 0) return;
    const { data: usrs } = await client.from("usuarios").select("id,nombre,rol").in("id", ids);
    setUsuarios(usrs ?? []);
  }, [empresaId, usuarioId, getSB]);

  const cargarMensajes = useCallback(async (convId: string) => {
    setCargando(true);
    const client = await getSB();
    const { data } = await client.from("mensajes").select("*")
      .eq("conversacion_id", convId).order("created_at", { ascending: true }).limit(60);
    setMensajes(data ?? []);
    setCargando(false);
    scrollBottom();
    if (data) {
      for (const m of data) {
        if (!m.leido_por?.includes(usuarioId)) {
          await client.from("mensajes")
            .update({ leido_por: [...(m.leido_por ?? []), usuarioId] }).eq("id", m.id);
        }
      }
    }
  }, [usuarioId, getSB]);

  const suscribir = useCallback(async (convId: string) => {
    const client = await getSB();
    if (channelRef.current) await client.removeChannel(channelRef.current);
    channelRef.current = client.channel(`chat_${convId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes", filter: `conversacion_id=eq.${convId}` },
        (payload) => {
          const msg = payload.new as Mensaje;
          setMensajes((prev) => [...prev, msg]);
          scrollBottom();
          if (msg.autor_id !== usuarioId) {
            setNoLeidos((n) => n + 1);
            if (typeof window !== "undefined" && Notification.permission === "granted") {
              new Notification(`${ROL_ICON[msg.autor_rol] || "💬"} ${msg.autor_nombre}`, { body: msg.contenido, icon: "/logo.png" });
            }
          }
        })
      .subscribe();
  }, [usuarioId, getSB]);

  useEffect(() => {
    if (!empresaId || !usuarioId) return;
    getGrupo().then(() => { cargarConvs(); cargarUsuarios(); });
    if (typeof window !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [empresaId, usuarioId]);

  useEffect(() => {
    if (convActiva) {
      cargarMensajes(convActiva.id);
      suscribir(convActiva.id);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [convActiva]);

  const abrirConv = (conv: Conversacion) => { setConvActiva(conv); setVista("chat"); };

  const abrirGrupo = async () => {
    const grupo = await getGrupo();
    if (grupo) { await cargarConvs(); abrirConv(grupo); }
  };

  const crearIndividual = async (otro: Usuario) => {
    const client = await getSB();
    const { data: existentes } = await client.from("mensajes_conversaciones")
      .select("*").eq("empresa_id", empresaId).eq("tipo", "individual").contains("participantes", [usuarioId]);
    const existe = existentes?.find((c: any) => c.participantes?.includes(otro.id) && c.participantes?.length === 2);
    if (existe) { abrirConv(existe); return; }
    const { data: nueva } = await client.from("mensajes_conversaciones").insert({
      empresa_id: empresaId, tipo: "individual", nombre: otro.nombre, participantes: [usuarioId, otro.id],
    }).select().single();
    if (nueva) abrirConv(nueva);
  };

  const enviar = async () => {
    const txt = texto.trim();
    if (!txt || !convActiva) return;
    setTexto("");
    const client = await getSB();
    await client.from("mensajes").insert({
      conversacion_id: convActiva.id, empresa_id: empresaId,
      autor_id: usuarioId, autor_nombre: usuarioNombre, autor_rol: usuarioRol,
      contenido: txt, tipo: "texto", accion_estado: null, leido_por: [usuarioId],
    });
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const hora = (ts: string) => new Date(ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

  if (!empresaId || !usuarioId) return null;

  return (
    <>
      {/* BOTÓN FLOTANTE */}
      <button
        onClick={() => { setAbierto((v) => !v); if (!abierto) cargarConvs(); }}
        style={{
          position: "fixed", bottom: 80, left: 16, zIndex: 1000,
          width: 52, height: 52, borderRadius: "50%",
          background: "linear-gradient(135deg,#1976d2,#1565c0)",
          border: "3px solid white", boxShadow: "0 4px 16px rgba(25,118,210,0.55)",
          cursor: "pointer", fontSize: 22, color: "white",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {abierto ? "✕" : "💬"}
        {noLeidos > 0 && !abierto && (
          <div style={{
            position: "absolute", top: -3, right: -3,
            background: "#dc2626", color: "white", fontSize: 10, fontWeight: 800,
            width: 18, height: 18, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid white",
          }}>{noLeidos > 9 ? "9+" : noLeidos}</div>
        )}
      </button>

      {/* PANEL */}
      {abierto && (
        <div style={{
          position: "fixed", bottom: 144, left: 16, zIndex: 1000,
          width: 310, height: 440,
          background: "white", borderRadius: 16,
          border: "1px solid #dde8f4", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif",
        }}>
          {/* HEADER */}
          <div style={{
            background: "linear-gradient(135deg,#1976d2,#1565c0)",
            padding: "11px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            {vista !== "lista" && (
              <button onClick={() => { setVista("lista"); setConvActiva(null); setMensajes([]); }}
                style={{ background: "none", border: "none", color: "white", cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1 }}>←</button>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>
                {vista === "lista" ? "💬 Mensajería" : vista === "nuevos" ? "Nuevo chat" : convActiva?.nombre || "Chat"}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.80)" }}>{ROL_ICON[usuarioRol]} {usuarioNombre}</div>
            </div>
            {vista === "lista" && (
              <button onClick={() => setVista("nuevos")}
                style={{ background: "rgba(255,255,255,0.22)", border: "1px solid rgba(255,255,255,0.40)", borderRadius: 8, color: "white", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "4px 10px" }}>
                ✏️ Nuevo
              </button>
            )}
          </div>

          {/* VISTA LISTA */}
          {vista === "lista" && (
            <div style={{ flex: 1, overflowY: "auto" }}>
              <div onClick={abrirGrupo}
                style={{ padding: "12px 14px", borderBottom: "1px solid #f0f4f8", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, background: "#f8fbff" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#1976d2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🌾</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0d2137" }}>Campo General</div>
                  <div style={{ fontSize: 11, color: "#6b8aaa" }}>Todos los del campo</div>
                </div>
              </div>
              {conversaciones.filter(c => c.tipo === "individual").map(conv => (
                <div key={conv.id} onClick={() => abrirConv(conv)}
                  style={{ padding: "12px 14px", borderBottom: "1px solid #f0f4f8", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#e8f4fd", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>👤</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0d2137" }}>{conv.nombre}</div>
                    <div style={{ fontSize: 11, color: "#6b8aaa" }}>Chat privado</div>
                  </div>
                  {(conv.noLeidos ?? 0) > 0 && (
                    <div style={{ background: "#1976d2", color: "white", borderRadius: 20, fontSize: 10, fontWeight: 800, padding: "2px 7px" }}>{conv.noLeidos}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* VISTA NUEVOS */}
          {vista === "nuevos" && (
            <div style={{ flex: 1, overflowY: "auto" }}>
              <div style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#6b8aaa", textTransform: "uppercase" }}>Iniciar chat con...</div>
              {usuarios.map(u => (
                <div key={u.id} onClick={() => crearIndividual(u)}
                  style={{ padding: "10px 14px", borderBottom: "1px solid #f0f4f8", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: `${ROL_COLOR[u.rol] || "#6b7280"}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                    {ROL_ICON[u.rol] || "👤"}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0d2137" }}>{u.nombre}</div>
                    <div style={{ fontSize: 11, color: ROL_COLOR[u.rol] || "#6b7280", fontWeight: 600 }}>{u.rol}</div>
                  </div>
                </div>
              ))}
              {usuarios.length === 0 && <div style={{ padding: "20px 14px", fontSize: 12, color: "#9ab0c4", textAlign: "center" }}>Sin otros usuarios en el campo</div>}
            </div>
          )}

          {/* VISTA CHAT */}
          {vista === "chat" && (
            <>
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                {cargando && <div style={{ textAlign: "center", color: "#9ab0c4", fontSize: 12, padding: 20 }}>Cargando...</div>}
                {!cargando && mensajes.length === 0 && (
                  <div style={{ textAlign: "center", padding: "30px 12px", color: "#9ab0c4", fontSize: 12 }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>💬</div>
                    Sin mensajes. ¡Escribí el primero!
                  </div>
                )}
                {mensajes.map((msg) => {
                  const esMio = msg.autor_id === usuarioId;
                  if (msg.autor_rol === "sistema") return (
                    <div key={msg.id} style={{ textAlign: "center", margin: "4px 0" }}>
                      <span style={{ fontSize: 11, color: "#16a34a", background: "#f0fdf4", padding: "3px 10px", borderRadius: 20, fontWeight: 600, border: "1px solid #bbf7d0" }}>{msg.contenido}</span>
                    </div>
                  );
                  return (
                    <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: esMio ? "flex-end" : "flex-start" }}>
                      {!esMio && (
                        <div style={{ fontSize: 10, color: ROL_COLOR[msg.autor_rol] || "#6b8aaa", fontWeight: 700, marginBottom: 2, marginLeft: 4 }}>
                          {ROL_ICON[msg.autor_rol]} {msg.autor_nombre}
                        </div>
                      )}
                      <div style={{
                        maxWidth: "80%", padding: "8px 11px", wordBreak: "break-word",
                        borderRadius: esMio ? "14px 14px 3px 14px" : "14px 14px 14px 3px",
                        background: esMio ? "#1976d2" : "#f0f4f8",
                        color: esMio ? "white" : "#1a2a4a", fontSize: 13, lineHeight: 1.4,
                      }}>{msg.contenido}</div>
                      <div style={{ fontSize: 9, color: "#b0c0d0", marginTop: 2, marginLeft: 4, marginRight: 4 }}>{hora(msg.created_at)}</div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {/* INPUT */}
              <div style={{ padding: "8px 10px", borderTop: "1px solid #e8f0f8", background: "white", flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } }}
                    placeholder="Escribí un mensaje..."
                    style={{
                      flex: 1, minWidth: 0, padding: "9px 13px", borderRadius: 20,
                      border: "1.5px solid #cddff0", fontSize: 13, color: "#1a2a4a",
                      outline: "none", background: "#f7fafd",
                      fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif",
                    }}
                    autoComplete="off"
                  />
                  <button
                    onClick={enviar}
                    style={{
                      width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                      background: texto.trim() ? "#1976d2" : "#e0eaf4",
                      border: "none", color: texto.trim() ? "white" : "#9ab0c4",
                      fontSize: 16, cursor: texto.trim() ? "pointer" : "default",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >→</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
