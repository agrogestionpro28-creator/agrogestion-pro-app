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
  accion_ejecutada: any;
  accion_estado: string;
  leido_por: string[];
  created_at: string;
};

type Conversacion = {
  id: string;
  tipo: string;
  nombre: string;
  participantes: string[];
  ultimoMensaje?: string;
  noLeidos?: number;
};

type Usuario = {
  id: string;
  nombre: string;
  rol: string;
  email: string;
};

const ROL_ICON: Record<string, string> = {
  admin: "👑", productor: "👨‍🌾", ingeniero: "👨‍💼",
  veterinario: "🩺", empleado: "👷", aplicador: "💧",
  sembrador: "🌱", cosechadora: "🌾", servicios: "🔧",
};
const ROL_COLOR: Record<string, string> = {
  admin: "#dc2626", productor: "#16a34a", ingeniero: "#1976d2",
  veterinario: "#7c3aed", empleado: "#d97706", aplicador: "#0891b2",
  sembrador: "#15803d", cosechadora: "#b45309", servicios: "#6b7280",
};

// Detecta si el mensaje tiene una acción para ejecutar
function detectarAccion(texto: string): { tipo: string; datos: any } | null {
  const t = texto.toLowerCase();

  // Siembra
  const siembra = t.match(/semb(?:ré|re|ramos|rado)\s+(?:el\s+)?lote\s+([a-zA-Z0-9\s]+?)(?:\s+hoy|\s+ayer|\s+el|\.|$)/i)
    || t.match(/realizamos?\s+siembra\s+(?:en\s+)?(?:el\s+)?lote\s+([a-zA-Z0-9\s]+)/i);
  if (siembra) return { tipo: "labor", datos: { tipo_lab: "Siembra", lote_nombre: siembra[1].trim(), descripcion: texto } };

  // Aplicación
  const aplicacion = t.match(/apliqu[eé]\s+(.+?)\s+(?:en\s+)?(?:el\s+)?lote\s+([a-zA-Z0-9\s]+)/i)
    || t.match(/pulveriz(?:amos?|ué?)\s+(?:el\s+)?lote\s+([a-zA-Z0-9\s]+)\s+con\s+(.+)/i);
  if (aplicacion) return { tipo: "labor", datos: { tipo_lab: "Aplicación", producto_dosis: aplicacion[1]?.trim(), lote_nombre: (aplicacion[2] || aplicacion[1]).trim(), descripcion: texto } };

  // Cosecha
  const cosecha = t.match(/cosech(?:amos?|é|amos)\s+(?:el\s+)?lote\s+([a-zA-Z0-9\s]+)/i);
  if (cosecha) return { tipo: "labor", datos: { tipo_lab: "Cosecha", lote_nombre: cosecha[1].trim(), descripcion: texto } };

  // Fertilización
  const fertil = t.match(/fertiliz(?:amos?|ué?)\s+(?:el\s+)?lote\s+([a-zA-Z0-9\s]+)/i);
  if (fertil) return { tipo: "labor", datos: { tipo_lab: "Fertilización", lote_nombre: fertil[1].trim(), descripcion: texto } };

  // Consumo gasoil
  const gasoil = t.match(/us[eé]\s+(\d+)\s*litros?\s+(?:de\s+)?gasoil/i)
    || t.match(/(\d+)\s*litros?\s+(?:de\s+)?gasoil\s+(?:consumidos?|gastados?|usados?)/i);
  if (gasoil) return { tipo: "gasoil", datos: { litros: Number(gasoil[1]), descripcion: texto } };

  // Descuento insumo
  const insumo = t.match(/usé\s+(\d+)\s*(?:litros?|kg|bolsas?)?\s+(?:de\s+)?(.+?)(?:\s+hoy|\s+en|\.|$)/i);
  if (insumo && !t.includes("gasoil")) return { tipo: "insumo", datos: { cantidad: Number(insumo[1]), nombre: insumo[2].trim(), descripcion: texto } };

  return null;
}

export default function ChatFlotante({ empresaId, usuarioId, usuarioNombre, usuarioRol }: {
  empresaId: string;
  usuarioId: string;
  usuarioNombre: string;
  usuarioRol: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [convActiva, setConvActiva] = useState<Conversacion | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [noLeidos, setNoLeidos] = useState(0);
  const [accionDetectada, setAccionDetectada] = useState<any>(null);
  const [showNuevoChat, setShowNuevoChat] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [permisosNotif, setPermisosNotif] = useState<NotificationPermission>("default");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const realtimeRef = useRef<any>(null);

  // Pedir permiso de notificaciones al montar
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermisosNotif(Notification.permission);
      if (Notification.permission === "default") {
        Notification.requestPermission().then(p => setPermisosNotif(p));
      }
    }
  }, []);

  const mostrarNotificacion = useCallback((titulo: string, cuerpo: string, icono?: string) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (document.visibilityState === "visible" && abierto) return; // No mostrar si el chat está abierto y visible

    try {
      const notif = new Notification(titulo, {
        body: cuerpo,
        icon: icono || "/logo.png",
        tag: "agro-chat",
      } as NotificationOptions);
      notif.onclick = () => {
        window.focus();
        setAbierto(true);
        notif.close();
      };
      // Auto cerrar después de 5 segundos
      setTimeout(() => notif.close(), 5000);
    } catch {}
  }, [abierto]);

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  // Scroll al último mensaje
  const scrollBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  // Cargar conversaciones del usuario
  const cargarConversaciones = useCallback(async () => {
    const sb = await getSB();
    const { data: convs } = await sb.from("mensajes_conversaciones")
      .select("*")
      .eq("empresa_id", empresaId)
      .contains("participantes", [usuarioId])
      .order("created_at", { ascending: false });

    if (!convs) return;

    // Para cada conversación, obtener último mensaje y no leídos
    const convsEnriquecidas = await Promise.all(convs.map(async (c: any) => {
      const { data: ultimoMsg } = await sb.from("mensajes")
        .select("contenido, created_at, autor_nombre")
        .eq("conversacion_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const { count } = await sb.from("mensajes")
        .select("*", { count: "exact", head: true })
        .eq("conversacion_id", c.id)
        .not("leido_por", "cs", `{${usuarioId}}`);

      return {
        ...c,
        ultimoMensaje: ultimoMsg ? `${ultimoMsg.autor_nombre}: ${ultimoMsg.contenido}` : "Sin mensajes",
        noLeidos: count ?? 0,
      };
    }));

    setConversaciones(convsEnriquecidas);
    setNoLeidos(convsEnriquecidas.reduce((a, c) => a + (c.noLeidos || 0), 0));
  }, [empresaId, usuarioId]);

  // Crear conversación grupal del campo si no existe
  const asegurarGrupo = useCallback(async () => {
    const sb = await getSB();

    // Buscar grupo existente
    const { data: grupos } = await sb.from("mensajes_conversaciones")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("tipo", "grupo");

    if (grupos && grupos.length > 0) {
      // Agregar usuario al grupo si no está
      const grupo = grupos[0];
      if (!grupo.participantes.includes(usuarioId)) {
        const nuevosParticipantes = [...grupo.participantes, usuarioId];
        await sb.from("mensajes_conversaciones")
          .update({ participantes: nuevosParticipantes })
          .eq("id", grupo.id);
      }
      return;
    }

    // Crear grupo con todos los usuarios de la empresa
    const { data: todosUsuarios } = await sb.from("vinculaciones")
      .select("profesional_id")
      .eq("empresa_id", empresaId)
      .eq("activa", true);

    // Obtener propietario de la empresa
    const { data: empresa } = await sb.from("empresas")
      .select("propietario_id")
      .eq("id", empresaId)
      .single();

    const participantes = [...new Set([
      usuarioId,
      empresa?.propietario_id,
      ...(todosUsuarios?.map((v: any) => v.profesional_id) ?? [])
    ].filter(Boolean))];

    await sb.from("mensajes_conversaciones").insert({
      empresa_id: empresaId,
      tipo: "grupo",
      nombre: "🌾 Campo General",
      participantes,
    });
  }, [empresaId, usuarioId]);

  // Cargar usuarios del campo para chats individuales
  const cargarUsuarios = useCallback(async () => {
    const sb = await getSB();

    const { data: vincs } = await sb.from("vinculaciones")
      .select("profesional_id")
      .eq("empresa_id", empresaId)
      .eq("activa", true);

    const { data: empresa } = await sb.from("empresas")
      .select("propietario_id")
      .eq("id", empresaId)
      .single();

    const ids = [...new Set([
      empresa?.propietario_id,
      ...(vincs?.map((v: any) => v.profesional_id) ?? [])
    ].filter(Boolean))];

    if (ids.length === 0) return;

    const { data: usrs } = await sb.from("usuarios")
      .select("id,nombre,rol,email")
      .in("id", ids);

    setUsuarios((usrs ?? []).filter((u: any) => u.id !== usuarioId));
  }, [empresaId, usuarioId]);

  // Cargar mensajes de una conversación
  const cargarMensajes = async (convId: string) => {
    setLoadingMsgs(true);
    const sb = await getSB();
    const { data } = await sb.from("mensajes")
      .select("*")
      .eq("conversacion_id", convId)
      .order("created_at", { ascending: true })
      .limit(50);

    setMensajes(data ?? []);
    setLoadingMsgs(false);
    scrollBottom();

    // Marcar como leídos
    if (data && data.length > 0) {
      for (const msg of data) {
        if (!msg.leido_por?.includes(usuarioId)) {
          await sb.from("mensajes").update({
            leido_por: [...(msg.leido_por ?? []), usuarioId]
          }).eq("id", msg.id);
        }
      }
      await cargarConversaciones();
    }
  };

  // Suscripción Realtime
  const suscribirRealtime = useCallback(async (convId: string) => {
    const sb = await getSB();
    if (realtimeRef.current) {
      await sb.removeChannel(realtimeRef.current);
    }
    const channel = sb.channel(`mensajes_${convId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "mensajes",
        filter: `conversacion_id=eq.${convId}`,
      }, (payload) => {
        const nuevoMsg = payload.new as Mensaje;
        // Ignorar mensajes propios y del sistema
        if (nuevoMsg.autor_id === usuarioId) return;
        setMensajes(prev => [...prev, nuevoMsg]);
        scrollBottom();
        // Marcar como leído si el chat está abierto
        if (abierto) {
          getSB().then(sb => sb.from("mensajes").update({
            leido_por: [...(nuevoMsg.leido_por ?? []), usuarioId]
          }).eq("id", nuevoMsg.id));
        } else {
          setNoLeidos(prev => prev + 1);
          // Notificación del navegador
          const rolIcon = ROL_ICON[nuevoMsg.autor_rol] || "👤";
          mostrarNotificacion(
            `${rolIcon} ${nuevoMsg.autor_nombre} — AgroGestión PRO`,
            nuevoMsg.contenido.length > 80 ? nuevoMsg.contenido.slice(0, 80) + "..." : nuevoMsg.contenido,
            "/logo.png"
          );
        }
      })
      .subscribe();
    realtimeRef.current = channel;
  }, [usuarioId, abierto]);

  useEffect(() => {
    if (!empresaId || !usuarioId) return;
    asegurarGrupo().then(() => {
      cargarConversaciones();
      cargarUsuarios();
    });
  }, [empresaId, usuarioId]);

  useEffect(() => {
    if (convActiva) {
      cargarMensajes(convActiva.id);
      suscribirRealtime(convActiva.id);
    }
  }, [convActiva]);

  // Detectar acción mientras escribe
  useEffect(() => {
    if (texto.length > 10) {
      const accion = detectarAccion(texto);
      setAccionDetectada(accion);
    } else {
      setAccionDetectada(null);
    }
  }, [texto]);

  // Ejecutar acción detectada
  const ejecutarAccion = async (accion: any, mensajeId: string) => {
    const sb = await getSB();

    if (accion.tipo === "labor") {
      // Buscar lote por nombre
      const { data: lotes } = await sb.from("lotes")
        .select("id,nombre,hectareas")
        .eq("empresa_id", empresaId)
        .ilike("nombre", `%${accion.datos.lote_nombre}%`)
        .limit(1);

      if (lotes && lotes.length > 0) {
        const lote = lotes[0];
        await sb.from("lote_labores").insert({
          empresa_id: empresaId,
          lote_id: lote.id,
          tipo: accion.datos.tipo_lab,
          descripcion: accion.datos.producto_dosis || accion.datos.descripcion,
          productos: accion.datos.producto_dosis || "",
          fecha: new Date().toISOString().split("T")[0],
          metodo_carga: "mensajeria",
          metodo_entrada: "chat",
          hectareas_trabajadas: lote.hectareas,
          estado_carga: "confirmado",
          cargado_por_rol: usuarioRol,
        });

        await sb.from("mensajes").update({
          accion_ejecutada: { ...accion.datos, lote_id: lote.id, lote_nombre: lote.nombre },
          accion_estado: "ejecutado"
        }).eq("id", mensajeId);

        return `✅ Labor "${accion.datos.tipo_lab}" registrada en lote ${lote.nombre}`;
      }
      return `⚠️ No se encontró el lote "${accion.datos.lote_nombre}"`;
    }

    if (accion.tipo === "gasoil") {
      const { data: tanques } = await sb.from("stock_gasoil")
        .select("id,cantidad_litros,precio_ppp")
        .eq("empresa_id", empresaId)
        .limit(1);

      if (tanques && tanques.length > 0) {
        const t = tanques[0];
        const nueva = Math.max(0, t.cantidad_litros - accion.datos.litros);
        await sb.from("stock_gasoil").update({ cantidad_litros: nueva }).eq("id", t.id);
        await sb.from("stock_gasoil_movimientos").insert({
          empresa_id: empresaId, gasoil_id: t.id,
          fecha: new Date().toISOString().split("T")[0],
          tipo: "consumo", litros: accion.datos.litros,
          descripcion: accion.datos.descripcion, metodo: "chat",
          precio_litro: 0, precio_ppp: t.precio_ppp || 0,
        });
        await sb.from("mensajes").update({ accion_ejecutada: accion.datos, accion_estado: "ejecutado" }).eq("id", mensajeId);
        return `✅ ${accion.datos.litros}L de gasoil descontados`;
      }
    }

    if (accion.tipo === "insumo") {
      const { data: ins } = await sb.from("stock_insumos")
        .select("id,nombre,cantidad,unidad,precio_ppp")
        .eq("empresa_id", empresaId)
        .ilike("nombre", `%${accion.datos.nombre}%`)
        .limit(1);

      if (ins && ins.length > 0) {
        const insumo = ins[0];
        const nueva = Math.max(0, insumo.cantidad - accion.datos.cantidad);
        await sb.from("stock_insumos").update({ cantidad: nueva }).eq("id", insumo.id);
        await sb.from("stock_insumos_movimientos").insert({
          empresa_id: empresaId, insumo_id: insumo.id,
          fecha: new Date().toISOString().split("T")[0],
          tipo: "uso", cantidad: accion.datos.cantidad,
          precio_unitario: 0, precio_ppp: insumo.precio_ppp || 0,
          descripcion: accion.datos.descripcion, metodo: "chat",
        });
        await sb.from("mensajes").update({ accion_ejecutada: accion.datos, accion_estado: "ejecutado" }).eq("id", mensajeId);
        return `✅ ${accion.datos.cantidad} ${insumo.unidad} de ${insumo.nombre} descontados`;
      }
    }

    return null;
  };

  // Enviar mensaje
  const enviar = async () => {
    if (!texto.trim() || !convActiva || enviando) return;
    setEnviando(true);

    const sb = await getSB();
    const accion = detectarAccion(texto);

    const { data: nuevoMsg } = await sb.from("mensajes").insert({
      conversacion_id: convActiva.id,
      empresa_id: empresaId,
      autor_id: usuarioId,
      autor_nombre: usuarioNombre,
      autor_rol: usuarioRol,
      contenido: texto.trim(),
      tipo: accion ? accion.tipo : "texto",
      accion_ejecutada: accion?.datos ?? null,
      accion_estado: accion ? "pendiente" : null,
      leido_por: [usuarioId],
    }).select().single();

    setTexto("");
    setAccionDetectada(null);

    // Ejecutar acción si detectó algo
    if (accion && nuevoMsg) {
      const resultado = await ejecutarAccion(accion, nuevoMsg.id);
      if (resultado) {
        await sb.from("mensajes").insert({
          conversacion_id: convActiva.id,
          empresa_id: empresaId,
          autor_id: usuarioId,
          autor_nombre: "🤖 Sistema",
          autor_rol: "sistema",
          contenido: resultado,
          tipo: "sistema",
          leido_por: [],
        });
      }
    }

    setEnviando(false);
    inputRef.current?.focus();
  };

  // Crear chat individual
  const crearChatIndividual = async (otroUsuario: Usuario) => {
    const sb = await getSB();

    // Verificar si ya existe
    const { data: existentes } = await sb.from("mensajes_conversaciones")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("tipo", "individual")
      .contains("participantes", [usuarioId]);

    const yaExiste = existentes?.find((c: any) =>
      c.participantes.includes(otroUsuario.id) && c.participantes.length === 2
    );

    if (yaExiste) {
      setConvActiva(yaExiste);
    } else {
      const { data: nueva } = await sb.from("mensajes_conversaciones").insert({
        empresa_id: empresaId,
        tipo: "individual",
        nombre: otroUsuario.nombre,
        participantes: [usuarioId, otroUsuario.id],
      }).select().single();
      if (nueva) setConvActiva(nueva);
    }
    setShowNuevoChat(false);
    await cargarConversaciones();
  };

  const formatHora = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatFecha = (ts: string) => {
    const d = new Date(ts);
    const hoy = new Date();
    if (d.toDateString() === hoy.toDateString()) return "Hoy";
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    if (d.toDateString() === ayer.toDateString()) return "Ayer";
    return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  };

  if (!empresaId || !usuarioId) return null;

  return (
    <>
      <style>{`
        @keyframes chatSlide{from{opacity:0;transform:translateY(20px) scale(0.95)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes badgePop{0%{transform:scale(0)}60%{transform:scale(1.3)}100%{transform:scale(1)}}
        @keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .chat-panel{animation:chatSlide 0.25s cubic-bezier(0.34,1.56,0.64,1);}
        .msg-bubble{animation:msgIn 0.18s ease;}
        .chat-input{background:rgba(255,255,255,0.90);border:1.5px solid rgba(180,210,240,0.60);border-radius:20px;padding:10px 16px;font-size:13px;color:#1a2a4a;font-family:'DM Sans',system-ui;outline:none;transition:all 0.18s;width:100%;box-sizing:border-box;}
        .chat-input:focus{background:white;border-color:rgba(25,118,210,0.45);box-shadow:0 0 0 3px rgba(25,118,210,0.10);}
        .chat-input::placeholder{color:rgba(80,120,160,0.55);}
        .conv-item{padding:10px 14px;cursor:pointer;transition:background 0.15s;border-bottom:1px solid rgba(0,60,140,0.06);}
        .conv-item:hover{background:rgba(255,255,255,0.80);}
        .conv-item.active{background:rgba(25,118,210,0.08);}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(25,118,210,0.20);border-radius:3px}
      `}</style>

      {/* ── BOTÓN FLOTANTE ── */}
      <button
        onClick={() => { setAbierto(!abierto); if (!abierto) { setNoLeidos(0); cargarConversaciones(); } }}
        style={{
          position: "fixed", bottom: 80, left: 16, zIndex: 50,
          width: 52, height: 52, borderRadius: "50%",
          backgroundImage: "url('/AZUL.png')", backgroundSize: "cover",
          border: "2px solid rgba(180,220,255,0.70)",
          boxShadow: "0 4px 22px rgba(25,118,210,0.55)",
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 22,
          transition: "all 0.2s ease",
          transform: abierto ? "scale(0.9)" : "scale(1)",
        }}
      >
        {abierto ? "✕" : "💬"}
        {noLeidos > 0 && !abierto && (
          <div style={{
            position: "absolute", top: -4, right: -4,
            background: "#dc2626", color: "white",
            fontSize: 10, fontWeight: 800,
            width: 20, height: 20, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "2px solid white", animation: "badgePop 0.3s ease",
          }}>
            {noLeidos > 9 ? "9+" : noLeidos}
          </div>
        )}
      </button>

      {/* ── PANEL CHAT ── */}
      {abierto && (
        <div className="chat-panel" style={{
          position: "fixed", top: 70, left: 16, zIndex: 9999,
          width: 320, height: "calc(100vh - 100px)", maxHeight: 520,
          borderRadius: 20, overflow: "hidden",
          background: "white",
          border: "1.5px solid #e0eaf4",
          boxShadow: "0 20px 60px rgba(20,80,160,0.22)",
          display: "flex", flexDirection: "column",
          fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif",
          boxSizing: "border-box",
          pointerEvents: "all",
        }}>

          {/* Header */}
          <div style={{
            backgroundImage: "url('/FON.png')", backgroundSize: "cover",
            borderBottom: "1px solid rgba(255,255,255,0.40)",
            padding: "12px 14px", position: "relative",
          }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
              {convActiva ? (
                <>
                  <button onClick={() => { setConvActiva(null); setMensajes([]); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#4a6a8a", fontSize: 16, padding: 0 }}>←</button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0d2137" }}>
                      {convActiva.tipo === "grupo" ? convActiva.nombre : `💬 ${convActiva.nombre}`}
                    </div>
                    <div style={{ fontSize: 10, color: "#6b8aaa" }}>
                      {convActiva.tipo === "grupo" ? `${convActiva.participantes?.length || 0} participantes` : "Chat privado"}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0d2137" }}>💬 Mensajería</div>
                    <div style={{ fontSize: 10, color: "#16a34a", fontWeight: 600 }}>
                      {ROL_ICON[usuarioRol]} {usuarioNombre}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    {permisosNotif !== "granted" && (
                      <button
                        onClick={() => Notification.requestPermission().then(p => setPermisosNotif(p))}
                        title="Activar notificaciones"
                        style={{ fontSize: 16, background: "none", border: "none", cursor: "pointer", opacity: 0.6 }}
                      >🔔</button>
                    )}
                    {permisosNotif === "granted" && (
                      <span title="Notificaciones activas" style={{ fontSize: 14, opacity: 0.5 }}>🔔</span>
                    )}
                    <button onClick={() => setShowNuevoChat(!showNuevoChat)}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, background: "rgba(25,118,210,0.10)", border: "1px solid rgba(25,118,210,0.25)", color: "#1565c0", cursor: "pointer", fontWeight: 700 }}>
                      ✏️ Nuevo
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Lista nuevo chat */}
          {!convActiva && showNuevoChat && (
            <div style={{ background: "rgba(255,255,255,0.95)", borderBottom: "1px solid rgba(0,60,140,0.08)", maxHeight: 160, overflowY: "auto" }}>
              <div style={{ padding: "8px 14px", fontSize: 10, fontWeight: 700, color: "#6b8aaa", textTransform: "uppercase", letterSpacing: 0.8 }}>
                Iniciar chat con...
              </div>
              {usuarios.map(u => (
                <div key={u.id} className="conv-item" onClick={() => crearChatIndividual(u)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${ROL_COLOR[u.rol] || "#6b7280"}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, border: `1px solid ${ROL_COLOR[u.rol] || "#6b7280"}30` }}>
                      {ROL_ICON[u.rol] || "👤"}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#0d2137" }}>{u.nombre}</div>
                      <div style={{ fontSize: 10, color: ROL_COLOR[u.rol] || "#6b7280", fontWeight: 600 }}>{u.rol}</div>
                    </div>
                  </div>
                </div>
              ))}
              {usuarios.length === 0 && <div style={{ padding: "12px 14px", fontSize: 12, color: "#6b8aaa" }}>Sin otros usuarios en el campo</div>}
            </div>
          )}

          {/* Lista conversaciones */}
          {!convActiva && (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {conversaciones.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b8aaa" }}>
                  <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.2 }}>💬</div>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>Sin conversaciones aún</p>
                  <p style={{ fontSize: 11, marginTop: 4 }}>Tocá "Nuevo" para empezar</p>
                </div>
              ) : (
                conversaciones.map(conv => (
                  <div key={conv.id} className={`conv-item${convActiva?.id === conv.id ? " active" : ""}`}
                    onClick={() => setConvActiva(conv)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", backgroundImage: "url('/AZUL.png')", backgroundSize: "cover", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                        {conv.tipo === "grupo" ? "🌾" : "👤"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#0d2137", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {conv.nombre || "Chat"}
                          </span>
                          {conv.noLeidos! > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 800, background: "#1976d2", color: "white", padding: "1px 7px", borderRadius: 20, flexShrink: 0 }}>
                              {conv.noLeidos}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "#6b8aaa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                          {conv.ultimoMensaje}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Mensajes de conversación activa */}
          {convActiva && (
            <>
              <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
                {loadingMsgs ? (
                  <div style={{ textAlign: "center", padding: 20, color: "#6b8aaa", fontSize: 12 }}>Cargando...</div>
                ) : mensajes.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 16px", color: "#6b8aaa" }}>
                    <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.2 }}>💬</div>
                    <p style={{ fontSize: 12 }}>Sin mensajes todavía</p>
                    <p style={{ fontSize: 11, color: "#aab8c8", marginTop: 4 }}>
                      Escribí "sembré lote X" o "apliqué glifosato en lote Y" para registrar labores automáticamente
                    </p>
                  </div>
                ) : (
                  mensajes.map((msg, i) => {
                    const esMio = msg.autor_id === usuarioId;
                    const esSistema = msg.autor_rol === "sistema";
                    const msgAnterior = i > 0 ? mensajes[i - 1] : null;
                    const mismaFecha = msgAnterior && formatFecha(msg.created_at) === formatFecha(msgAnterior.created_at);

                    return (
                      <div key={msg.id}>
                        {!mismaFecha && (
                          <div style={{ textAlign: "center", margin: "8px 0" }}>
                            <span style={{ fontSize: 10, color: "#6b8aaa", background: "rgba(255,255,255,0.70)", padding: "2px 10px", borderRadius: 20, fontWeight: 600 }}>
                              {formatFecha(msg.created_at)}
                            </span>
                          </div>
                        )}

                        {esSistema ? (
                          <div className="msg-bubble" style={{ textAlign: "center", margin: "4px 0" }}>
                            <span style={{ fontSize: 11, color: msg.contenido.startsWith("✅") ? "#16a34a" : "#d97706", background: msg.contenido.startsWith("✅") ? "rgba(220,252,231,0.80)" : "rgba(254,243,199,0.80)", padding: "4px 12px", borderRadius: 20, fontWeight: 700, border: `1px solid ${msg.contenido.startsWith("✅") ? "rgba(22,163,74,0.20)" : "rgba(217,119,6,0.20)"}` }}>
                              {msg.contenido}
                            </span>
                          </div>
                        ) : (
                          <div className="msg-bubble" style={{ display: "flex", flexDirection: "column", alignItems: esMio ? "flex-end" : "flex-start" }}>
                            {!esMio && (
                              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2, marginLeft: 4 }}>
                                <span style={{ fontSize: 12 }}>{ROL_ICON[msg.autor_rol] || "👤"}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, color: ROL_COLOR[msg.autor_rol] || "#6b7280" }}>{msg.autor_nombre}</span>
                              </div>
                            )}
                            <div style={{
                              maxWidth: "78%",
                              padding: "8px 12px",
                              borderRadius: esMio ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                              background: esMio ? "linear-gradient(135deg,#1976d2,#1565c0)" : "rgba(255,255,255,0.90)",
                              color: esMio ? "white" : "#0d2137",
                              fontSize: 13,
                              fontWeight: 500,
                              lineHeight: 1.4,
                              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                              border: esMio ? "none" : "1px solid rgba(180,210,240,0.40)",
                            }}>
                              {msg.contenido}
                              {msg.accion_estado === "ejecutado" && (
                                <div style={{ fontSize: 10, marginTop: 4, opacity: 0.75, fontWeight: 700 }}>
                                  ✅ Registrado en el sistema
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: 9, color: "#aab8c8", marginTop: 2, marginLeft: 4, marginRight: 4 }}>
                              {formatHora(msg.created_at)}
                              {esMio && <span style={{ marginLeft: 4 }}>{msg.leido_por?.length > 1 ? "✓✓" : "✓"}</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div style={{ padding: "8px 12px 12px", borderTop: "1px solid rgba(0,60,140,0.06)", background: "rgba(255,255,255,0.95)", flexShrink: 0 }}>
                {accionDetectada && (
                  <div style={{ marginBottom: 6, padding: "5px 10px", borderRadius: 8, background: "rgba(22,163,74,0.10)", border: "1px solid rgba(22,163,74,0.25)", fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
                    ⚡ Se detectó: {accionDetectada.tipo === "labor" ? `Labor ${accionDetectada.datos.tipo_lab} en ${accionDetectada.datos.lote_nombre}` : accionDetectada.tipo === "gasoil" ? `Consumo ${accionDetectada.datos.litros}L gasoil` : `Uso de ${accionDetectada.datos.nombre}`} — se registrará automáticamente
                  </div>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={texto}
                    onChange={e => setTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                    placeholder="Escribí un mensaje o novedad del campo..."
                    className="chat-input"
                    style={{ flex: 1 }}
                    disabled={enviando}
                  />
                  <button
                    onClick={enviar}
                    disabled={!texto.trim() || enviando}
                    style={{
                      width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                      backgroundImage: "url('/AZUL.png')", backgroundSize: "cover",
                      border: "1.5px solid rgba(100,180,255,0.50)",
                      color: "white", fontSize: 16, cursor: "pointer",
                      opacity: texto.trim() ? 1 : 0.5, transition: "all 0.18s",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 2px 8px rgba(25,118,210,0.35)",
                    }}
                  >
                    {enviando ? "⏳" : "→"}
                  </button>
                </div>
                <div style={{ fontSize: 9, color: "#aab8c8", marginTop: 4, textAlign: "center" }}>
                  Tip: "Apliqué glifosato en lote Norte" → registra labor automáticamente
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
