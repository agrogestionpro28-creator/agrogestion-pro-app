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
  accion_estado: string | null;
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

export default function ChatFlotante({
  empresaId,
  usuarioId,
  usuarioNombre,
  usuarioRol,
}: {
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

  // FORZAR FOCO SIEMPRE QUE SE ABRE EL CHAT
  useEffect(() => {
    if (abierto && vista === "chat") {
      const t = setInterval(() => {
        inputRef.current?.focus();
      }, 300);
      return () => clearInterval(t);
    }
  }, [abierto, vista]);

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
        .insert({
          empresa_id: empresaId,
          tipo: "grupo",
          nombre: "🌾 Campo General",
          participantes: [usuarioId],
        })
        .select()
        .single();
      return nuevo;
    }

    const grupo = grupos[0];
    if (!grupo.participantes?.includes(usuarioId)) {
      await client
        .from("mensajes_conversaciones")
        .update({
          participantes: [...(grupo.participantes || []), usuarioId],
        })
        .eq("id", grupo.id);
    }
    return grupo;
  }, [empresaId, usuarioId, getSB]);

  const cargarConvs = useCallback(async () => {
    const client = await getSB();
    const { data } = await client
      .from("mensajes_conversaciones")
      .select("*")
      .eq("empresa_id", empresaId)
      .contains("participantes", [usuarioId]);

    if (!data) return;

    let total = 0;
    const convs = await Promise.all(
      data.map(async (c: any) => {
        const { count } = await client
          .from("mensajes")
          .select("*", { count: "exact", head: true })
          .eq("conversacion_id", c.id)
          .not("leido_por", "cs", `{${usuarioId}}`);
        total += count ?? 0;
        return { ...c, noLeidos: count ?? 0 };
      })
    );

    setConversaciones(convs);
    setNoLeidos(total);
  }, [empresaId, usuarioId, getSB]);

  const cargarUsuarios = useCallback(async () => {
    const client = await getSB();

    const { data: vincs } = await client
      .from("vinculaciones")
      .select("profesional_id")
      .eq("empresa_id", empresaId)
      .eq("activa", true);

    const { data: empresa } = await client
      .from("empresas")
      .select("propietario_id")
      .eq("id", empresaId)
      .maybeSingle();

    const ids = [
      ...new Set(
        [
          ...(vincs?.map((v: any) => v.profesional_id) ?? []),
          empresa?.propietario_id,
        ].filter(Boolean).filter((id) => id !== usuarioId)
      ),
    ];

    if (ids.length === 0) return;

    const { data: usrs } = await client
      .from("usuarios")
      .select("id,nombre,rol")
      .in("id", ids);

    setUsuarios(usrs ?? []);
  }, [empresaId, usuarioId, getSB]);

  const cargarMensajes = useCallback(
    async (convId: string) => {
      setCargando(true);
      const client = await getSB();

      const { data } = await client
        .from("mensajes")
        .select("*")
        .eq("conversacion_id", convId)
        .order("created_at", { ascending: true })
        .limit(60);

      setMensajes(data ?? []);
      setCargando(false);
      scrollBottom();

      if (data) {
        for (const m of data) {
          if (!m.leido_por?.includes(usuarioId)) {
            await client
              .from("mensajes")
              .update({
                leido_por: [...(m.leido_por ?? []), usuarioId],
              })
              .eq("id", m.id);
          }
        }
      }
    },
    [usuarioId, getSB]
  );

  const suscribir = useCallback(
    async (convId: string) => {
      const client = await getSB();
      if (channelRef.current) await client.removeChannel(channelRef.current);

      channelRef.current = client
        .channel(`chat_${convId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "mensajes",
            filter: `conversacion_id=eq.${convId}`,
          },
          (payload) => {
            const msg = payload.new as Mensaje;
            setMensajes((prev) => [...prev, msg]);
            scrollBottom();
          }
        )
        .subscribe();
    },
    [getSB]
  );

  useEffect(() => {
    if (!empresaId || !usuarioId) return;
    getGrupo().then(() => {
      cargarConvs();
      cargarUsuarios();
    });
  }, [empresaId, usuarioId]);

  useEffect(() => {
    if (convActiva) {
      cargarMensajes(convActiva.id);
      suscribir(convActiva.id);
      setVista("chat");
    }
  }, [convActiva]);

  const abrirConv = (conv: Conversacion) => {
    setConvActiva(conv);
  };

  const enviar = async () => {
    const txt = texto.trim();
    if (!txt || !convActiva) return;

    setTexto("");

    try {
      const client = await getSB();

      await client.from("mensajes").insert({
        conversacion_id: convActiva.id,
        empresa_id: empresaId,
        autor_id: usuarioId,
        autor_nombre: usuarioNombre,
        autor_rol: usuarioRol,
        contenido: txt,
        tipo: "texto",
        accion_estado: null,
        leido_por: [usuarioId],
      });
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  if (!empresaId || !usuarioId) return null;

  return (
    <>
      <button
        onClick={() => {
          setAbierto((v) => !v);
          if (!abierto) cargarConvs();
        }}
        style={{
          position: "fixed",
          bottom: 80,
          left: 16,
          zIndex: 9999,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "#1976d2",
          color: "white",
          fontSize: 22,
          border: "none",
        }}
      >
        💬
      </button>

      {abierto && (
        <div
          style={{
            position: "fixed",
            bottom: 140,
            left: 16,
            zIndex: 9999,
            width: 310,
            height: 440,
            background: "white",
            borderRadius: 16,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            pointerEvents: "auto",
          }}
        >
          <div style={{ flex: 1, overflow: "auto", padding: 10 }}>
            {mensajes.map((m) => (
              <div key={m.id}>{m.contenido}</div>
            ))}
            <div ref={endRef} />
          </div>

          <div style={{ padding: 10 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                ref={inputRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") enviar();
                }}
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 20,
                  border: "1px solid #ccc",
                }}
              />
              <button onClick={enviar}>→</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
