import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "../../../lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type OpenAiSegment = { start?: number; end?: number; text?: string };

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

    const segments = (result.segments || [])
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
