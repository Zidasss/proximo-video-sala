import { NextRequest, NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "../../../lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("video") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo de vídeo enviado." }, { status: 400 });
    }

    const filename = `klip_${Date.now()}_${file.name || "video.mp4"}`;

    if (isSupabaseConfigured) {
      const supabase = await createClient();
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const { data, error } = await supabase.storage
        .from("klip-videos")
        .upload(filename, buffer, {
          contentType: file.type || "video/mp4",
          upsert: true,
        });

      if (error) {
        console.error("Supabase Storage Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const { data: publicUrlData } = supabase.storage
        .from("klip-videos")
        .getPublicUrl(data.path);

      return NextResponse.json({
        success: true,
        filename,
        videoUrl: publicUrlData.publicUrl,
      });
    }

    // Fallback simulation for local development
    return NextResponse.json({
      success: true,
      filename,
      videoUrl: `https://mock-storage.klip.app/videos/${filename}`,
    });
  } catch (error: any) {
    console.error("Upload API Error:", error);
    return NextResponse.json(
      { error: error.message || "Erro no processamento do upload." },
      { status: 500 }
    );
  }
}
