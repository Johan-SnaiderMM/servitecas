import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enviar = vi.fn();
const configurar = vi.fn();
const consultarPublico = vi.fn();

vi.mock("web-push", () => ({ default: { sendNotification: enviar, setVapidDetails: configurar } }));
vi.mock("@/lib/datos/llamar", () => ({ consultarPublico }));

const { avisarMensaje, avisarRespuesta, llavesVapid } = await import("./push");

const aviso = { orden_id: "o1", numero: 7, estado: "autorizado", titulo: "Frenos", placa: "ABC123", cliente: "Laura" };
const subs = [
  { endpoint: "https://push.test/a", p256dh: "p1", auth: "a1" },
  { endpoint: "https://push.test/b", p256dh: "p2", auth: "a2" },
];

function conLlaves() {
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "publica");
  vi.stubEnv("VAPID_PRIVATE_KEY", "privada");
  vi.stubEnv("VAPID_SUBJECT", "mailto:prueba@ejemplo.test");
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("llavesVapid", () => {
  it("sin las tres variables no hay llaves", () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "publica");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "mailto:x@y.z");
    expect(llavesVapid()).toBeNull();
  });

  it("con las tres, las devuelve", () => {
    conLlaves();
    expect(llavesVapid()).toEqual({ publica: "publica", privada: "privada", asunto: "mailto:prueba@ejemplo.test" });
  });
});

describe("avisarRespuesta", () => {
  it("sin llaves no consulta ni manda nada", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    await avisarRespuesta("t", "h1");
    expect(consultarPublico).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });

  it("manda el aviso a cada suscripción, con el texto armado", async () => {
    conLlaves();
    consultarPublico.mockResolvedValueOnce({ ok: true, aviso, suscripciones: subs });
    enviar.mockResolvedValue({});
    await avisarRespuesta("token-1", "h1");

    expect(consultarPublico).toHaveBeenCalledWith("publico_tomar_aviso", { p_token: "token-1", p_hallazgo: "h1" });
    expect(configurar).toHaveBeenCalledWith("mailto:prueba@ejemplo.test", "publica", "privada");
    expect(enviar).toHaveBeenCalledTimes(2);
    const [destino, mensaje] = enviar.mock.calls[0];
    expect(destino).toEqual({ endpoint: "https://push.test/a", keys: { p256dh: "p1", auth: "a1" } });
    expect(JSON.parse(mensaje)).toMatchObject({ titulo: "✓ Autorizado · ABC 123", url: "/ordenes/o1" });
  });

  it("si la base no entrega el aviso (ya salió o venció), no manda nada", async () => {
    conLlaves();
    consultarPublico.mockResolvedValueOnce({ ok: false });
    await avisarRespuesta("t", "h1");
    expect(enviar).not.toHaveBeenCalled();
  });

  it("sin suscripciones no manda nada", async () => {
    conLlaves();
    consultarPublico.mockResolvedValueOnce({ ok: true, aviso, suscripciones: [] });
    await avisarRespuesta("t", "h1");
    expect(enviar).not.toHaveBeenCalled();
  });

  it("un celular que ya no existe (410 o 404) se olvida; otro error no", async () => {
    conLlaves();
    consultarPublico.mockResolvedValueOnce({ ok: true, aviso, suscripciones: subs });
    consultarPublico.mockResolvedValue({ ok: true });
    enviar.mockRejectedValueOnce({ statusCode: 410 }).mockRejectedValueOnce({ statusCode: 500 });
    await avisarRespuesta("t", "h1");

    const olvidos = consultarPublico.mock.calls.filter(([nombre]) => nombre === "publico_olvidar_suscripcion_push");
    expect(olvidos).toEqual([["publico_olvidar_suscripcion_push", { p_endpoint: "https://push.test/a" }]]);
  });

  it("nunca lanza: un fallo de la base o del servicio de push se registra y se traga", async () => {
    conLlaves();
    consultarPublico.mockRejectedValueOnce(new Error("sin señal"));
    await expect(avisarRespuesta("t", "h1")).resolves.toBeUndefined();

    consultarPublico.mockResolvedValueOnce({ ok: true, aviso, suscripciones: subs });
    configurar.mockImplementationOnce(() => {
      throw new Error("llaves malas");
    });
    await expect(avisarRespuesta("t", "h1")).resolves.toBeUndefined();
  });
});

describe("avisarMensaje", () => {
  it("toma el aviso del mensaje y lo manda con su texto", async () => {
    conLlaves();
    consultarPublico.mockResolvedValueOnce({
      ok: true,
      aviso: { orden_id: "o1", numero: 7, texto: "¿Ya está?", placa: "ABC123", cliente: "Laura" },
      suscripciones: subs.slice(0, 1),
    });
    enviar.mockResolvedValue({});
    await avisarMensaje("token-1", "m1");
    expect(consultarPublico).toHaveBeenCalledWith("publico_tomar_aviso_mensaje", { p_token: "token-1", p_mensaje: "m1" });
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(JSON.parse(enviar.mock.calls[0][1])).toMatchObject({ cuerpo: "Laura: ¿Ya está?", url: "/ordenes/o1#mensajes" });
  });

  it("si la base ya no lo entrega (repetido o viejo), no manda nada", async () => {
    conLlaves();
    consultarPublico.mockResolvedValueOnce({ ok: false });
    await avisarMensaje("token-1", "m1");
    expect(enviar).not.toHaveBeenCalled();
  });
});
