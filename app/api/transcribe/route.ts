import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  isSupabaseConfigured,
} from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type OpenAiSegment = { start?: number; end?: number; text?: string };

type OpenAiTranscription = {
  error?: { message?: string };
  segments?: OpenAiSegment[];
  text?: string;
  duration?: number;
  language?: string;
};

const TRANSCRIPTION_TIMEOUT_MS = 230_000;
const TRANSLATION_TIMEOUT_MS = 45_000;
// Vercel request bodies are smaller than the upstream transcription limit.
// The editor therefore extracts and compresses the audio locally and sends
// sequential blocks below this ceiling instead of uploading the source video.
const TRANSCRIPTION_CHUNK_MAX_BYTES = 4 * 1024 * 1024;

const TRANSLATION_LANGUAGES: Record<string, string> = {
  en: "inglês natural",
  es: "espanhol natural",
};

const DETECTED_LANGUAGE_CODES: Record<string, string> = {
  english: "en",
  portuguese: "pt",
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  japanese: "ja",
  korean: "ko",
  chinese: "zh",
};

function normalizeDetectedLanguage(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return DETECTED_LANGUAGE_CODES[normalized] || normalized || "unknown";
}

async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  timeoutMs: number,
  parentSignal?: AbortSignal,
) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = parentSignal
    ? AbortSignal.any([parentSignal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, { ...init, signal });
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}

function friendlyUpstreamError(
  status: number,
  operation: "transcrição" | "tradução",
) {
  if (status === 400)
    return `O arquivo não pôde ser processado pelo serviço de ${operation}. Tente um trecho menor ou outro formato.`;
  if (status === 401 || status === 403)
    return `O serviço de ${operation} não está autenticado. Verifique a configuração da OPENAI_API_KEY.`;
  if (status === 408 || status === 504)
    return `O serviço de ${operation} demorou mais que o esperado. Tente novamente.`;
  if (status === 413)
    return `O arquivo é grande demais para o serviço de ${operation}. Corte um trecho menor e tente novamente.`;
  if (status === 429)
    return `O serviço de ${operation} está ocupado ou atingiu o limite de uso. Tente novamente em instantes.`;
  if (status >= 500)
    return `O serviço de ${operation} está temporariamente indisponível. Tente novamente.`;
  return `Não foi possível concluir a ${operation}. Tente novamente.`;
}

function friendlyFetchError(
  error: unknown,
  operation: "transcrição" | "tradução",
) {
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  )
    return `A ${operation} ultrapassou o tempo limite. Tente novamente com um trecho menor.`;
  if (error instanceof TypeError)
    return `Não foi possível conectar ao serviço de ${operation}. Verifique a conexão e tente novamente.`;
  return `A ${operation} não pôde ser concluída. Tente novamente.`;
}

export async function POST(request: NextRequest) {
  try {
    if (isSupabaseConfigured) {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user)
        return NextResponse.json(
          { error: "Entre na sua conta para gerar legendas automáticas." },
          { status: 401 },
        );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
      return NextResponse.json(
        {
          error:
            "Legendas automáticas ainda não foram ativadas pelo administrador (OPENAI_API_KEY).",
        },
        { status: 503 },
      );

    const incoming = await request.formData();
    const file = incoming.get("file");
    if (!(file instanceof File) || !file.size)
      return NextResponse.json(
        { error: "Envie um vídeo ou áudio para transcrever." },
        { status: 400 },
      );
    if (file.size > TRANSCRIPTION_CHUNK_MAX_BYTES)
      return NextResponse.json(
        {
          error:
            "Este bloco de áudio ficou grande demais. O KLIP precisa compactá-lo novamente antes da transcrição.",
        },
        { status: 413 },
      );

    const targetLanguage = String(
      incoming.get("targetLanguage") || "original",
    )
      .trim()
      .toLowerCase();
    const form = new FormData();
    form.append("file", file, file.name || "klip-video.mp4");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    const requestedLanguage =
      targetLanguage === "pt"
        ? "pt"
        : String(incoming.get("language") || "").trim().toLowerCase();
    if (requestedLanguage && requestedLanguage !== "auto")
      form.append("language", requestedLanguage);

    const response = await fetchWithTimeout(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      },
      TRANSCRIPTION_TIMEOUT_MS,
      request.signal,
    );
    const result = await readJson<OpenAiTranscription>(response);
    if (!response.ok) {
      console.error(
        "[transcribe] Falha no provedor de transcrição",
        response.status,
        result.error?.message || "Resposta sem detalhes",
      );
      return NextResponse.json(
        { error: friendlyUpstreamError(response.status, "transcrição") },
        { status: response.status },
      );
    }

    const detectedLanguage = normalizeDetectedLanguage(
      result.language || requestedLanguage,
    );

    let segments = (result.segments || [])
      .map((segment) => ({
        start: Number(segment.start || 0),
        end: Number(segment.end || 0),
        text: String(segment.text || "").trim(),
      }))
      .filter(
        (segment) =>
          segment.text &&
          Number.isFinite(segment.start) &&
          Number.isFinite(segment.end) &&
          segment.end > segment.start,
      );
    if (!segments.length)
      return NextResponse.json(
        {
          error:
            "Não foi possível identificar fala neste trecho. Confira se o vídeo tem voz audível e tente novamente.",
        },
        { status: 422 },
      );
    const translationLanguage = TRANSLATION_LANGUAGES[targetLanguage];
    let translated =
      targetLanguage === "original" || targetLanguage === detectedLanguage;
    let translationWarning = "";
    if (
      translationLanguage &&
      segments.length &&
      targetLanguage !== detectedLanguage
    ) {
      try {
        const translationResponse = await fetchWithTimeout(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: process.env.OPENAI_TRANSLATION_MODEL || "gpt-4o-mini",
              response_format: { type: "json_object" },
              temperature: 0.1,
              messages: [
                {
                  role: "system",
                  content: `Traduza cada legenda para ${translationLanguage}. Preserve nomes próprios, tom, sentido, ordem e quantidade. Responda somente JSON no formato {"translations":[{"id":0,"text":"..."}]}.`,
                },
                {
                  role: "user",
                  content: JSON.stringify(
                    segments.map((segment, id) => ({ id, text: segment.text })),
                  ),
                },
              ],
            }),
          },
          TRANSLATION_TIMEOUT_MS,
          request.signal,
        );
        const translationResult = await readJson<{
          error?: { message?: string };
          choices?: Array<{ message?: { content?: string } }>;
        }>(translationResponse);
        if (!translationResponse.ok) {
          console.error(
            "[transcribe] Falha no provedor de tradução",
            translationResponse.status,
            translationResult.error?.message || "Resposta sem detalhes",
          );
          translationWarning = `${friendlyUpstreamError(translationResponse.status, "tradução")} As legendas foram mantidas no idioma original.`;
        } else {
          const parsed = JSON.parse(
            translationResult.choices?.[0]?.message?.content || "{}",
          ) as { translations?: Array<{ id?: number; text?: string }> };
          const translatedById = new Map(
            (parsed.translations || []).map((item) => [
              Number(item.id),
              String(item.text || "").trim(),
            ]),
          );
          segments = segments.map((segment, id) => ({
            ...segment,
            text: translatedById.get(id) || segment.text,
          }));
          translated = translatedById.size === segments.length;
          if (!translatedById.size)
            translationWarning =
              "A tradução não retornou textos válidos. As legendas foram mantidas no idioma original.";
          else if (!translated)
            translationWarning =
              "A tradução ficou incompleta. Os trechos sem tradução foram mantidos no idioma original.";
        }
      } catch (error) {
        console.error("[transcribe] Erro durante a tradução", error);
        translationWarning = `${friendlyFetchError(error, "tradução")} As legendas foram mantidas no idioma original.`;
      }
    }
    return NextResponse.json({
      text: result.text || "",
      duration: result.duration || 0,
      segments,
      detectedLanguage,
      targetLanguage,
      translated,
      ...(translationWarning ? { translationWarning } : {}),
    });
  } catch (error) {
    console.error("[transcribe] Erro ao gerar legendas", error);
    const message = friendlyFetchError(error, "transcrição");
    const status =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
        ? 504
        : error instanceof TypeError
          ? 502
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
