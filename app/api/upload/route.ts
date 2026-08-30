import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  isSupabaseConfigured,
  supabaseUrl,
} from "../../../lib/supabase/server";
import {
  directStorageUploadEndpoint,
  isOwnedUploadPath,
  MAX_PUBLISH_VIDEO_BYTES,
  PUBLISH_UPLOAD_BUCKET,
  validatePublishVideoMetadata,
} from "../../../lib/publishing/upload-policy";

const MAX_TICKET_REQUEST_BYTES = 16 * 1024;

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_TICKET_REQUEST_BYTES) {
      return jsonError("A solicitação de upload é inválida.", 413);
    }

    const body = (await req.json().catch(() => null)) as {
      size?: number;
      contentType?: string;
      fileName?: string;
    } | null;
    if (!body) return jsonError("Metadados do vídeo não enviados.", 400);

    const validation = validatePublishVideoMetadata({
      size: Number(body.size),
      contentType: body.contentType,
      fileName: body.fileName,
    });
    if (!validation.ok) {
      const status = Number(body.size) > MAX_PUBLISH_VIDEO_BYTES ? 413 : 415;
      return jsonError(validation.error, status);
    }

    if (!isSupabaseConfigured) {
      const filename = `klip-${crypto.randomUUID()}.${validation.extension}`;
      return NextResponse.json({
        success: true,
        mock: true,
        path: `mock/${filename}`,
        videoUrl: `https://mock-storage.klipapp.com.br/videos/${filename}`,
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonError("Entre na sua conta para enviar e publicar vídeos.", 401);
    }

    const month = new Date().toISOString().slice(0, 7);
    const path = `${user.id}/${month}/${crypto.randomUUID()}.${validation.extension}`;
    const { data, error } = await supabase.storage
      .from(PUBLISH_UPLOAD_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });

    if (error || !data?.token) {
      console.error("Falha ao criar ticket de upload:", error?.message);
      return jsonError(
        "Não foi possível autorizar o envio. Tente novamente em instantes.",
        500,
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from(PUBLISH_UPLOAD_BUCKET)
      .getPublicUrl(path);

    return NextResponse.json({
      success: true,
      mock: false,
      bucket: PUBLISH_UPLOAD_BUCKET,
      path,
      token: data.token,
      endpoint: directStorageUploadEndpoint(supabaseUrl),
      videoUrl: publicUrlData.publicUrl,
      contentType: validation.contentType,
      maxBytes: MAX_PUBLISH_VIDEO_BYTES,
    });
  } catch (error: unknown) {
    console.error("Upload ticket API error:", error);
    return jsonError("Erro ao preparar o envio do vídeo.", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!isSupabaseConfigured) return NextResponse.json({ success: true });
    const body = (await req.json().catch(() => null)) as { path?: string } | null;
    const path = String(body?.path || "");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError("Sessão expirada.", 401);
    if (!isOwnedUploadPath(path, user.id)) {
      return jsonError("Arquivo de upload inválido.", 403);
    }
    const { error } = await supabase.storage
      .from(PUBLISH_UPLOAD_BUCKET)
      .remove([path]);
    if (error) {
      console.error("Falha ao limpar upload:", error.message);
      return jsonError("Não foi possível limpar o arquivo temporário.", 500);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Upload cleanup API error:", error);
    return jsonError("Erro ao limpar o arquivo temporário.", 500);
  }
}
