import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type OpenAiSegment = { start?: number; end?: number; text?: string };

const TRANSLATION_LANGUAGES: Record<string, string> = {
  en: "inglês natural",
  es: "espanhol natural",
};

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
    if (file.size > 24 * 1024 * 1024)
      return NextResponse.json(
        {
          error:
            "Para gerar legendas agora, use um arquivo de até 24 MB ou primeiro corte o trecho desejado.",
        },
        { status: 413 },
      );

    const form = new FormData();
    form.append("file", file, file.name || "klip-video.mp4");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    const language = String(incoming.get("language") || "").trim();
    if (language) form.append("language", language);

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      },
    );
    const result = (await response.json()) as {
      error?: { message?: string };
      segments?: OpenAiSegment[];
      text?: string;
      duration?: number;
    };
    if (!response.ok)
      return NextResponse.json(
        { error: result.error?.message || "A transcrição não foi concluída." },
        { status: response.status },
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
    const targetLanguage = String(incoming.get("targetLanguage") || "original");
    const translationLanguage = TRANSLATION_LANGUAGES[targetLanguage];
    if (translationLanguage && segments.length) {
      const translationResponse = await fetch(
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
                content:
                  `Traduza cada legenda para ${translationLanguage}. Preserve nomes próprios, tom, sentido, ordem e quantidade. Responda somente JSON no formato {"translations":[{"id":0,"text":"..."}]}.`,
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
      );
      const translationResult = (await translationResponse.json()) as {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string } }>;
      };
      if (!translationResponse.ok)
        return NextResponse.json(
          {
            error:
              translationResult.error?.message ||
              "A transcrição terminou, mas a tradução falhou.",
          },
          { status: translationResponse.status },
        );
      try {
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
      } catch {
        return NextResponse.json(
          { error: "A tradução retornou um formato inválido. Tente novamente." },
          { status: 502 },
        );
      }
    }
    return NextResponse.json({
      text: result.text || "",
      duration: result.duration || 0,
      segments,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível gerar as legendas.",
      },
      { status: 500 },
    );
  }
}
