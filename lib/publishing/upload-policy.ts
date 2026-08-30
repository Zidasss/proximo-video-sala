export const PUBLISH_UPLOAD_BUCKET = "klip-videos";
export const MAX_PUBLISH_VIDEO_BYTES = 500 * 1024 * 1024;

const VIDEO_EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-m4v": "m4v",
};

export function normalizeVideoContentType(value: string | undefined) {
  return String(value || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

export function videoExtensionForContentType(value: string | undefined) {
  return VIDEO_EXTENSIONS[normalizeVideoContentType(value)] || null;
}

export function resolveVideoContentType(
  contentType: string | undefined,
  fileName = "",
) {
  const normalized = normalizeVideoContentType(contentType);
  if (VIDEO_EXTENSIONS[normalized]) return normalized;
  const extension = fileName.toLowerCase().split(".").pop();
  return (
    {
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      m4v: "video/x-m4v",
    } as Record<string, string>
  )[extension || ""] || normalized;
}

export function validatePublishVideoMetadata(input: {
  size: number;
  contentType?: string;
  fileName?: string;
}) {
  const size = Number(input.size);
  const contentType = resolveVideoContentType(input.contentType, input.fileName);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false as const, error: "O arquivo de vídeo está vazio." };
  }
  if (size > MAX_PUBLISH_VIDEO_BYTES) {
    return {
      ok: false as const,
      error: "O vídeo ultrapassa o limite de 500 MB para publicação.",
    };
  }
  const extension = videoExtensionForContentType(contentType);
  if (!extension) {
    return {
      ok: false as const,
      error: "Formato não suportado. Use MP4, MOV, M4V ou WebM.",
    };
  }
  return { ok: true as const, contentType, extension, size };
}

export function isOwnedUploadPath(path: string, userId: string) {
  if (!userId || !path || path.includes("\\") || path.includes("..")) return false;
  return path.startsWith(`${userId}/`) && path.split("/").length === 3;
}

export function directStorageUploadEndpoint(supabaseUrl: string) {
  const parsed = new URL(supabaseUrl);
  const projectRef = parsed.hostname.split(".")[0];
  if (!projectRef) throw new Error("URL do Supabase inválida.");
  return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
}

export function isAllowedPublishingVideoUrl(
  value: string | undefined,
  supabaseUrl: string,
) {
  if (!value) return false;
  try {
    const candidate = new URL(value);
    const project = new URL(supabaseUrl);
    const projectRef = project.hostname.split(".")[0];
    const allowedHosts = new Set([
      project.hostname,
      `${projectRef}.storage.supabase.co`,
    ]);
    return (
      candidate.protocol === "https:" &&
      allowedHosts.has(candidate.hostname) &&
      candidate.pathname.startsWith(
        `/storage/v1/object/public/${PUBLISH_UPLOAD_BUCKET}/`,
      )
    );
  } catch {
    return false;
  }
}

export function storagePathFromPublicVideoUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const prefix = `/storage/v1/object/public/${PUBLISH_UPLOAD_BUCKET}/`;
    if (!parsed.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return path && !path.includes("..") && !path.includes("\\") ? path : null;
  } catch {
    return null;
  }
}
