import { validatePublishVideoMetadata } from "./upload-policy";

export interface PublishingUploadTicket {
  success: true;
  mock: boolean;
  bucket?: string;
  path: string;
  token?: string;
  endpoint?: string;
  videoUrl: string;
  contentType?: string;
  maxBytes?: number;
}

interface DirectUploadOptions {
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
}

async function requestUploadTicket(file: Blob) {
  const fileName = file instanceof File ? file.name : "";
  const validation = validatePublishVideoMetadata({
    size: file.size,
    contentType: file.type,
    fileName,
  });
  if (!validation.ok) throw new Error(validation.error);

  const response = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      size: validation.size,
      contentType: validation.contentType,
      fileName,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as Partial<
    PublishingUploadTicket & { error: string }
  >;
  if (!response.ok || !data.success || !data.path || !data.videoUrl) {
    throw new Error(data.error || "Não foi possível autorizar o envio do vídeo.");
  }
  return data as PublishingUploadTicket;
}

export async function uploadVideoForPublishing(
  file: Blob,
  options: DirectUploadOptions = {},
) {
  const ticket = await requestUploadTicket(file);
  if (ticket.mock) {
    options.onProgress?.(100);
    return ticket;
  }
  if (!ticket.endpoint || !ticket.bucket || !ticket.path || !ticket.token) {
    throw new Error("O destino de upload retornou dados incompletos.");
  }
  const { endpoint, bucket, path, token } = ticket;

  const tus = await import("tus-js-client");
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let upload: InstanceType<typeof tus.Upload> | null = null;
      const abort = () => {
        void upload?.abort(true);
        finish(() => reject(new DOMException("Upload cancelado.", "AbortError")));
      };
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener("abort", abort);
        callback();
      };
      upload = new tus.Upload(file, {
        endpoint,
        retryDelays: [0, 1_000, 3_000, 5_000, 10_000, 20_000],
        headers: { "x-signature": token },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        storeFingerprintForResuming: false,
        chunkSize: 6 * 1024 * 1024,
        metadata: {
          bucketName: bucket,
          objectName: path,
          contentType: ticket.contentType || file.type,
          cacheControl: "3600",
        },
        onError(error) {
          finish(() => reject(error));
        },
        onProgress(bytesUploaded, bytesTotal) {
          const percentage = bytesTotal
            ? Math.round((bytesUploaded / bytesTotal) * 100)
            : 0;
          options.onProgress?.(Math.max(0, Math.min(100, percentage)));
        },
        onSuccess() {
          finish(resolve);
        },
      });
      if (options.signal?.aborted) abort();
      else {
        options.signal?.addEventListener("abort", abort, { once: true });
        upload.start();
      }
    });
  } catch (error) {
    await cleanupPublishingUpload(ticket.path);
    throw error;
  }
  return ticket;
}

export async function cleanupPublishingUpload(path: string) {
  if (!path || path.startsWith("mock/")) return;
  await fetch("/api/upload", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
    keepalive: true,
  }).catch(() => undefined);
}
