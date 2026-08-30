export type LocalTranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type LocalTranscriptionProgress = {
  phase:
    | "loading-runtime"
    | "loading-model"
    | "transcribing"
    | "fallback-wasm";
  progress: number;
  device: "webgpu" | "wasm";
};

type LocalTranscriptionOptions = {
  targetLanguage: "original" | "en";
  signal: AbortSignal;
  onProgress?: (progress: LocalTranscriptionProgress) => void;
};

type LocalTranscriptionRequestOptions = Pick<
  LocalTranscriptionOptions,
  "targetLanguage" | "onProgress"
>;

export type LocalTranscriptionResult = {
  segments: LocalTranscriptSegment[];
  device: "webgpu" | "wasm";
};

export type LocalTranscriptionSession = {
  transcribe: (
    audio: Float32Array,
    options: LocalTranscriptionRequestOptions,
  ) => Promise<LocalTranscriptionResult>;
  dispose: () => void;
};

type WorkerMessage =
  | ({ type: "status" } & LocalTranscriptionProgress)
  | {
      type: "result";
      segments: LocalTranscriptSegment[];
      device: "webgpu" | "wasm";
    }
  | { type: "error"; message: string };

export function parseFloat32Wave(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  if (
    buffer.byteLength < 44 ||
    view.getUint32(0, false) !== 0x52494646 ||
    view.getUint32(8, false) !== 0x57415645
  )
    throw new Error("O áudio local não foi gerado em um WAV válido.");

  let offset = 12;
  let format = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= buffer.byteLength) {
    const id = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, true);
    const payload = offset + 8;
    if (payload + size > buffer.byteLength) break;
    if (id === 0x666d7420 && size >= 16) {
      format = view.getUint16(payload, true);
      channels = view.getUint16(payload + 2, true);
      bitsPerSample = view.getUint16(payload + 14, true);
    } else if (id === 0x64617461) {
      dataOffset = payload;
      dataSize = size;
      break;
    }
    offset = payload + size + (size % 2);
  }

  if (dataOffset < 0 || !dataSize)
    throw new Error("O WAV local não contém amostras de áudio.");
  if ((format !== 3 && format !== 0xfffe) || channels !== 1 || bitsPerSample !== 32)
    throw new Error("O WAV local não está em PCM float mono de 32 bits.");

  const aligned = buffer.slice(dataOffset, dataOffset + dataSize - (dataSize % 4));
  return new Float32Array(aligned);
}

export function friendlyLocalTranscriptionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/abort|cancel/i.test(message)) return "Transcrição cancelada. Nenhuma legenda foi alterada.";
  if (/fetch|network|load failed|importing a module/i.test(message))
    return "O download inicial do Whisper local foi interrompido. O KLIP usa a versão compacta do modelo: verifique a conexão, libere downloads para este site e tente novamente. Depois de concluído, ele fica armazenado neste dispositivo.";
  if (/memory|allocation|out of bounds/i.test(message))
    return "O navegador ficou sem memória para este bloco. Feche abas pesadas e tente novamente; o vídeo original continua intacto.";
  if (/timestamps must be non-negative/i.test(message))
    return "O contêiner do vídeo informou um tempo de áudio inválido neste bloco. O vídeo original continua intacto; atualize o KLIP e tente novamente.";
  return message || "O modelo local não conseguiu transcrever este trecho.";
}

export function createLocalTranscriptionSession(
  signal: AbortSignal,
): LocalTranscriptionSession {
  let worker: Worker | null = null;
  let disposed = false;
  let pending = false;
  let cpuOnly = false;

  const terminateWorker = () => {
    worker?.terminate();
    worker = null;
  };
  const getWorker = () => {
    if (typeof Worker === "undefined")
      throw new Error(
        "Este navegador não oferece Web Workers para a transcrição local.",
      );
    worker ??= new Worker("/workers/local-transcription.js", {
      type: "module",
      name: "klip-local-whisper",
    });
    return worker;
  };
  const run = (
    audio: Float32Array,
    options: LocalTranscriptionRequestOptions,
    preferWebGpu: boolean,
    onWebGpuAttempt: () => void,
  ): Promise<LocalTranscriptionResult> => {
    if (signal.aborted)
      return Promise.reject(
        new DOMException("Transcrição cancelada.", "AbortError"),
      );
    if (disposed)
      return Promise.reject(new Error("A sessão local já foi encerrada."));

    return new Promise((resolve, reject) => {
      const activeWorker = getWorker();
      let settled = false;
      const clear = () => {
        activeWorker.onmessage = null;
        activeWorker.onerror = null;
        signal.removeEventListener("abort", abort);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clear();
        terminateWorker();
        reject(error);
      };
      const abort = () =>
        fail(new DOMException("Transcrição cancelada.", "AbortError"));

      signal.addEventListener("abort", abort, { once: true });
      activeWorker.onerror = (event) =>
        fail(new Error(event.message || "Falha ao iniciar o Whisper local."));
      activeWorker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;
        if (message.type === "status") {
          if (message.device === "webgpu") onWebGpuAttempt();
          options.onProgress?.(message);
          return;
        }
        if (message.type === "error") {
          fail(new Error(message.message));
          return;
        }
        if (message.type === "result" && !settled) {
          settled = true;
          clear();
          resolve({ segments: message.segments, device: message.device });
        }
      };

      const transferableAudio =
        audio.byteOffset === 0 && audio.byteLength === audio.buffer.byteLength
          ? audio
          : audio.slice();
      activeWorker.postMessage(
        {
          type: "transcribe",
          audio: transferableAudio,
          targetLanguage: options.targetLanguage,
          preferWebGpu,
        },
        [transferableAudio.buffer],
      );
    });
  };

  return {
    async transcribe(audio, options) {
      if (pending)
        throw new Error("A sessão local já está transcrevendo outro bloco.");
      pending = true;
      const cpuRetryAudio = audio.slice();
      let attemptedWebGpu = false;
      try {
        try {
          return await run(audio, options, !cpuOnly, () => {
            attemptedWebGpu = true;
          });
        } catch (error) {
          if (!attemptedWebGpu || signal.aborted) throw error;
          cpuOnly = true;
          options.onProgress?.({
            phase: "fallback-wasm",
            progress: 0,
            device: "wasm",
          });
          return await run(cpuRetryAudio, options, false, () => undefined);
        }
      } finally {
        pending = false;
      }
    },
    dispose() {
      disposed = true;
      terminateWorker();
    },
  };
}

export async function transcribeAudioLocally(
  audio: Float32Array,
  options: LocalTranscriptionOptions,
): Promise<LocalTranscriptionResult> {
  const session = createLocalTranscriptionSession(options.signal);
  try {
    return await session.transcribe(audio, {
      targetLanguage: options.targetLanguage,
      onProgress: options.onProgress,
    });
  } finally {
    session.dispose();
  }
}
