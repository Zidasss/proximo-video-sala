/** Utilitários compartilhados pelas integrações com as APIs das plataformas. */

/** Lê o corpo JSON tolerando respostas vazias ou malformadas. */
export async function readJson<T>(res: Response): Promise<Partial<T>> {
  try {
    return (await res.json()) as Partial<T>;
  } catch {
    return {};
  }
}

/** Mensagem legível a partir de um `catch (err: unknown)`. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

/** Formato de erro padrão da Meta Graph API. */
export interface GraphErrorBody {
  error?: {
    message?: string;
    error_user_msg?: string;
    code?: number;
    type?: string;
  };
}
