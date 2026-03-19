"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

type Asistente = {
  id: string;
  icon: string;
  titulo: string;
  subtitulo: string;
  color: string;
  descripcion: string;
  preguntas: string[];
  systemPrompt: string;
};

const ASISTENTES: Asistente[] = [
  {
    id: "mejoras",
    icon: "💡",
    titulo: "Mejorá AgroGestión Pro",
    subtitulo: "Tu opinión construye la plataforma",
    color: "#00FF80",
    descripcion: "Sugerí funcionalidades, reportá problemas o contanos qué necesitás. Cada idea se registra y analiza para mejorar el sistema.",
    preguntas: [
      "Quiero sugerir una nueva función",
      "Encontré un problema en el sistema",
      "¿Qué funciones vienen próximamente?",
      "Quiero integrar con otra herramienta",
    ],
    systemPrompt: "Sos el asistente de mejora continua de AgroGestión Pro, una plataforma SaaS agropecuaria argentina. Tu rol es recopilar sugerencias, ideas y reportes de problemas de los productores. Respondé de forma empática y constructiva. Cuando el usuario sugiera algo, confirmá que fue registrado, agradecé la sugerencia y explicá cómo el equipo la va a evaluar. Si reporta un problema, pedí detalles para entenderlo mejor. Siempre respondé en español y mostrá entusiasmo por mejorar la plataforma.",
  },
  {
    id: "inversion",
    icon: "📈",
    titulo: "Asesor de Inversiones",
    subtitulo: "¿Dónde conviene poner el dinero?",
    color: "#C9A227",
    descripcion: "Analizá tus opciones de inversión: maquinaria propia vs. tercerización, más campo, hacienda, silos, insumos anticipados y más.",
    preguntas: [
      "¿Me conviene comprar o alquilar maquinaria?",
      "¿Invertir en hacienda o en granos?",
      "¿Cuánto campo más puedo tomar?",
      "¿Me conviene un silo propio?",
    ],
    systemPrompt: "Sos un asesor financiero y agropecuario experto para productores argentinos. Ayudás a tomar decisiones de inversión en el campo: maquinaria, hacienda, tierras, insumos anticipados, silos, tecnología. Considerá siempre el contexto argentino: inflación, tipo de cambio, tasas, precios de commodities. Pedí información sobre la situación actual del productor (hectáreas, cultivos, capital disponible) antes de dar recomendaciones. Sé práctico, concreto y usá números cuando sea posible. Respondé siempre en español.",
  },
  {
    id: "pagos",
    icon: "💳",
    titulo: "¿Cómo me conviene pagar?",
    subtitulo: "Contado, cuotas, leasing o canje",
    color: "#60A5FA",
    descripcion: "Analizá la mejor forma de pagar una compra según tu flujo de caja, tasa de inflación, stock de granos y condiciones del mercado.",
    preguntas: [
      "¿Contado o en cuotas con inflación alta?",
      "¿Qué es el leasing agropecuario?",
      "¿Conviene pagar en pesos o en dólares?",
      "¿Pago con cheque o transferencia?",
    ],
    systemPrompt: "Sos un experto en finanzas agropecuarias argentinas, especializado en estructuras de pago y financiamiento. Analizás si conviene pagar contado, en cuotas, con leasing, canje por granos, o con financiamiento bancario. Considerá siempre el contexto argentino: inflación mensual, tasas de interés, precio de los granos como moneda de cambio, y el costo de oportunidad del dinero. Pedí detalles sobre el monto, el tipo de compra y la situación financiera del productor. Respondé en español con análisis concretos y números cuando sea posible.",
  },
  {
    id: "clima",
    icon: "🌦️",
    titulo: "Clima y Plagas",
    subtitulo: "Alertas y recomendaciones por zona",
    color: "#4ADE80",
    descripcion: "Consultá sobre condiciones climáticas, riesgo de heladas, plagas estacionales y el momento ideal para aplicar o sembrar.",
    preguntas: [
      "¿Cuándo es el momento ideal para aplicar fungicida?",
      "Riesgo de heladas en mi zona",
      "¿Qué plagas hay que vigilar esta campaña?",
      "¿Cómo afecta La Niña a mis cultivos?",
    ],
    systemPrompt: "Sos un agrónomo especialista en climatología y manejo de plagas para la región pampeana y extrapampeana de Argentina. Dás recomendaciones sobre manejo según condiciones climáticas, riesgo de heladas, fenómenos como El Niño/La Niña, plagas estacionales (chinche, trips, pulgones, roya) y momentos óptimos para aplicaciones. Siempre pedí la zona o provincia del productor para dar información más precisa. Respondé en español de forma técnica pero accesible.",
  },
  {
    id: "campana",
    icon: "📊",
    titulo: "Análisis de Campaña",
    subtitulo: "Proyección de resultados y margen bruto",
    color: "#A78BFA",
    descripcion: "Calculá el margen bruto estimado, analizá costos por cultivo y proyectá el resultado económico de tu campaña actual.",
    preguntas: [
      "Calculá mi margen bruto de soja",
      "¿Cuánto me cuesta producir una tonelada de maíz?",
      "Análisis de rentabilidad de la campaña",
      "¿A qué precio de soja empato?",
    ],
    systemPrompt: "Sos un economista agrícola experto en análisis de rentabilidad para productores argentinos. Calculás márgenes brutos, costos de producción, punto de equilibrio y proyecciones de campaña. Usás datos actuales de precios de granos, insumos y costos de labores para Argentina. Pedí datos al productor: cultivo, rendimiento esperado, precio de venta, costos de insumos, labores y alquiler. Presentá los resultados en formato claro con tablas cuando sea posible. Respondé siempre en español.",
  },
  {
    id: "impuestos",
    icon: "🧾",
    titulo: "Asistente Impositivo",
    subtitulo: "IVA, Ganancias, Monotributo y más",
    color: "#FB923C",
    descripcion: "Resolvé dudas sobre obligaciones impositivas agropecuarias: IVA diferencial, retenciones, monotributo agropecuario, bienes personales.",
    preguntas: [
      "¿Cómo funciona el IVA en la venta de granos?",
      "¿Me conviene el monotributo agropecuario?",
      "¿Qué retenciones me hacen en la liquidación?",
      "¿Cuándo vence Ganancias para productores?",
    ],
    systemPrompt: "Sos un contador especialista en impuestos agropecuarios en Argentina. Explicás de forma clara y práctica: IVA diferencial en actividades agropecuarias (10.5% vs 21%), retenciones en la fuente, monotributo agropecuario, impuesto a las ganancias para productores, bienes personales, ingresos brutos y vencimientos impositivos. Siempre aclarás que tu información es orientativa y recomendás consultar con un contador certificado para decisiones importantes. Respondé en español.",
  },
];

type Chat = { rol: "user" | "assistant"; texto: string };

export default function OtrosPage() {
  const [asistenteActivo, setAsistenteActivo] = useState<Asistente | null>(null);
  const [chats, setChats] = useState<Record<string, Chat[]>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [nombreUsuario, setNombreUsuario] = useState("");

  const getSB = async () => {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  };

  useEffect(() => {
    const init = async () => {
      const sb = await getSB();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      const { data: u } = await sb.from("usuarios").select("nombre").eq("auth_id", user.id).single();
      if (u) setNombreUsuario(u.nombre);
    };
    init();
  }, []);

  const chatActivo = asistenteActivo ? (chats[asistenteActivo.id] ?? []) : [];

  const enviar = async (pregunta?: string) => {
    if (!asistenteActivo) return;
    const texto = pregunta ?? input.trim();
    if (!texto) return;
    setInput("");
    const nuevoChat: Chat[] = [...chatActivo, { rol: "user", texto }];
    setChats(prev => ({ ...prev, [asistenteActivo.id]: nuevoChat }));
    setLoading(true);
    try {
      const historial = nuevoChat.map(m => ({ role: m.rol === "user" ? "user" : "assistant", content: m.texto }));
      const res = await fetch("/api/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          system: `${asistenteActivo.systemPrompt} El usuario se llama ${nombreUsuario}.`,
          messages: historial,
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const respuesta = data.content?.[0]?.text ?? "Sin respuesta";
      setChats(prev => ({
        ...prev,
        [asistenteActivo.id]: [...nuevoChat, { rol: "assistant", texto: respuesta }]
      }));
    } catch (err: any) {
      setChats(prev => ({
        ...prev,
        [asistenteActivo.id]: [...nuevoChat, { rol: "assistant", texto: `Error: ${err.message ?? "No se pudo conectar con la IA"}` }]
      }));
    }
    setLoading(false);
  };

  const startVoice = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) { alert("Sin soporte de voz"); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR(); rec.lang = "es-AR"; rec.continuous = false;
    setListening(true);
    rec.onresult = (e: any) => { setInput(e.results[0][0].transcript); setListening(false); };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const limpiarChat = () => {
    if (!asistenteActivo) return;
    setChats(prev => ({ ...prev, [asistenteActivo.id]: [] }));
  };

  return (
    <div className="relative min-h-screen bg-[#020810] text-[#E5E7EB]">
      <style>{`
        .asist-card:hover { transform: translateY(-3px); }
        .asist-card { transition: all 0.2s ease; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .msg-in { animation: fadeIn 0.3s ease; }
      `}</style>

      <div className="absolute inset-0 z-0">
        <Image src="/dashboard-bg.png" alt="bg" fill style={{ objectFit: "cover" }} />
        <div className="absolute inset-0 bg-[#020810]/88" />
      </div>
      <div className="absolute inset-0 z-1 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: `linear-gradient(rgba(0,255,128,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,128,1) 1px, transparent 1px)`, backgroundSize: "50px 50px" }} />

      {/* Header */}
      <div className="relative z-10 border-b border-[#00FF80]/20 bg-[#020810]/80 backdrop-blur-sm px-6 py-3 flex items-center gap-4">
        <button onClick={() => asistenteActivo ? setAsistenteActivo(null) : window.location.href = "/productor/dashboard"}
          className="text-[#4B5563] hover:text-[#00FF80] transition-colors font-mono text-sm">
          ← {asistenteActivo ? "Volver a Asistentes" : "Dashboard"}
        </button>
        <div className="flex-1" />
        <Image src="/logo.png" alt="Logo" width={100} height={35} className="object-contain" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto p-6">

        {/* ===== PANEL PRINCIPAL — Grid de asistentes ===== */}
        {!asistenteActivo && (
          <div>
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold text-[#E5E7EB] font-mono mb-2">🤖 ASISTENTES IA</h1>
              <p className="text-[#4B5563] font-mono text-sm">Consultores especializados disponibles 24/7 para ayudarte a tomar mejores decisiones</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {ASISTENTES.map(a => (
                <div key={a.id} className="asist-card cursor-pointer bg-[#0a1628]/80 border border-[#00FF80]/15 rounded-2xl overflow-hidden"
                  style={{ borderColor: (chats[a.id]?.length ?? 0) > 0 ? a.color + "40" : undefined }}
                  onClick={() => setAsistenteActivo(a)}>
                  {/* Top color bar */}
                  <div className="h-1" style={{ background: `linear-gradient(90deg, ${a.color}80, transparent)` }} />
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                        style={{ background: a.color + "15", border: `1px solid ${a.color}30` }}>
                        {a.icon}
                      </div>
                      {(chats[a.id]?.length ?? 0) > 0 && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: a.color }} />
                          <span className="text-xs font-mono" style={{ color: a.color }}>
                            {Math.floor((chats[a.id]?.length ?? 0) / 2)} consultas
                          </span>
                        </div>
                      )}
                    </div>
                    <h2 className="font-bold text-[#E5E7EB] font-mono text-lg mb-1">{a.titulo}</h2>
                    <p className="text-xs font-mono mb-3" style={{ color: a.color }}>{a.subtitulo}</p>
                    <p className="text-xs text-[#4B5563] font-mono leading-relaxed mb-4">{a.descripcion}</p>

                    {/* Preguntas frecuentes preview */}
                    <div className="space-y-1.5">
                      {a.preguntas.slice(0, 2).map(q => (
                        <div key={q} className="text-xs text-[#4B5563] font-mono px-3 py-1.5 rounded-lg border border-[#00FF80]/5 bg-[#020810]/40">
                          💬 {q}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#00FF80]/5">
                      <span className="text-xs text-[#4B5563] font-mono">Disponible 24/7</span>
                      <span className="text-xs font-mono px-3 py-1.5 rounded-lg border transition-all hover:opacity-80"
                        style={{ color: a.color, borderColor: a.color + "40", background: a.color + "10" }}>
                        Consultar →
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer info */}
            <div className="mt-8 bg-[#0a1628]/60 border border-[#00FF80]/10 rounded-xl p-5 text-center">
              <p className="text-xs text-[#4B5563] font-mono">
                ◆ Todos los asistentes están potenciados por IA · Las respuestas son orientativas · Para decisiones importantes consultá con profesionales certificados
              </p>
            </div>
          </div>
        )}

        {/* ===== CHAT CON ASISTENTE ===== */}
        {asistenteActivo && (
          <div className="flex flex-col h-[calc(100vh-160px)]">
            {/* Header del asistente */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                  style={{ background: asistenteActivo.color + "15", border: `1px solid ${asistenteActivo.color}30` }}>
                  {asistenteActivo.icon}
                </div>
                <div>
                  <h2 className="font-bold text-[#E5E7EB] font-mono">{asistenteActivo.titulo}</h2>
                  <p className="text-xs font-mono" style={{ color: asistenteActivo.color }}>{asistenteActivo.subtitulo}</p>
                </div>
              </div>
              {chatActivo.length > 0 && (
                <button onClick={limpiarChat} className="text-xs text-[#4B5563] hover:text-[#9CA3AF] font-mono transition-colors border border-[#1C2128] px-3 py-1.5 rounded-lg">
                  🗑 Limpiar chat
                </button>
              )}
            </div>

            {/* Área de chat */}
            <div className="flex-1 bg-[#0a1628]/60 border border-[#00FF80]/10 rounded-xl overflow-hidden flex flex-col">

              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatActivo.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-10">
                    <div className="text-5xl mb-4 opacity-30">{asistenteActivo.icon}</div>
                    <p className="text-[#4B5563] font-mono text-sm mb-6">{asistenteActivo.descripcion}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-lg">
                      {asistenteActivo.preguntas.map(q => (
                        <button key={q} onClick={() => enviar(q)}
                          className="text-left text-xs font-mono px-4 py-3 rounded-xl border transition-all hover:opacity-80"
                          style={{ borderColor: asistenteActivo.color + "30", color: asistenteActivo.color, background: asistenteActivo.color + "08" }}>
                          💬 {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  chatActivo.map((m, i) => (
                    <div key={i} className={`msg-in flex ${m.rol === "user" ? "justify-end" : "justify-start"}`}>
                      {m.rol === "assistant" && (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg mr-3 flex-shrink-0 mt-1"
                          style={{ background: asistenteActivo.color + "15" }}>
                          {asistenteActivo.icon}
                        </div>
                      )}
                      <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm font-mono leading-relaxed ${
                        m.rol === "user"
                          ? "bg-[#00FF80]/10 border border-[#00FF80]/20 text-[#E5E7EB] rounded-tr-sm"
                          : "bg-[#0F1115] border border-[#1C2128] text-[#9CA3AF] rounded-tl-sm"
                      }`}>
                        {m.rol === "assistant" && (
                          <div className="text-xs mb-2 font-bold" style={{ color: asistenteActivo.color }}>
                            ◆ {asistenteActivo.titulo}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{m.texto}</p>
                      </div>
                    </div>
                  ))
                )}
                {loading && (
                  <div className="flex justify-start">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg mr-3 flex-shrink-0"
                      style={{ background: asistenteActivo.color + "15" }}>
                      {asistenteActivo.icon}
                    </div>
                    <div className="bg-[#0F1115] border border-[#1C2128] px-4 py-3 rounded-2xl rounded-tl-sm">
                      <div className="flex gap-1 items-center">
                        {[0,1,2].map(i => (
                          <div key={i} className="w-2 h-2 rounded-full animate-bounce"
                            style={{ background: asistenteActivo.color, animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="p-4 border-t border-[#00FF80]/10">
                <div className="flex gap-3">
                  <button onClick={startVoice}
                    className={`flex items-center gap-1.5 px-3 py-3 rounded-xl border font-mono text-xs transition-all flex-shrink-0 ${listening ? "border-red-400 text-red-400 animate-pulse" : "border-[#00FF80]/20 text-[#4B5563] hover:text-[#00FF80] hover:border-[#00FF80]/30"}`}>
                    🎤 {listening ? "..." : "Voz"}
                  </button>
                  <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && enviar()}
                    placeholder={`Consultá al ${asistenteActivo.titulo.toLowerCase()}...`}
                    className="flex-1 bg-[#020810]/80 border border-[#00FF80]/15 rounded-xl px-4 py-3 text-[#E5E7EB] text-sm focus:outline-none focus:border-[#00FF80] font-mono transition-all"
                    style={{ borderColor: input ? asistenteActivo.color + "40" : undefined }}
                  />
                  <button onClick={() => enviar()} disabled={loading || !input.trim()}
                    className="px-5 py-3 rounded-xl font-bold font-mono text-sm transition-all disabled:opacity-40 flex-shrink-0"
                    style={{ background: asistenteActivo.color + "15", border: `1px solid ${asistenteActivo.color}40`, color: asistenteActivo.color }}>
                    ▶ Enviar
                  </button>
                </div>
                <p className="text-xs text-[#1a3a1a] font-mono mt-2 text-center">
                  Las respuestas son orientativas · Consultá con profesionales para decisiones importantes
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
