export type EvidenceCopyResult = "complete" | "without-image" | "text-only" | "failed";

export interface EvidenceCopyInput {
  text: string;
  html: string;
  imageBlob?: Blob;
  hasScreenshot: boolean;
}

interface ClipboardWriter {
  write?(items: unknown[]): Promise<void>;
  writeText?(value: string): Promise<void>;
}

interface ClipboardItemConstructor {
  new(data: Record<string, Blob>): unknown;
  supports?(type: string): boolean;
}

export interface EvidenceClipboardEnvironment {
  isSecureContext: boolean;
  clipboard?: ClipboardWriter;
  ClipboardItem?: ClipboardItemConstructor;
  Blob: typeof Blob;
  fallbackCopy(value: string): boolean | Promise<boolean>;
}

export async function copyEvidenceToClipboard(
  input: EvidenceCopyInput,
  environment: EvidenceClipboardEnvironment,
): Promise<EvidenceCopyResult> {
  const clipboard = environment.clipboard;
  const Item = environment.ClipboardItem;
  let richAttempted = false;
  if (environment.isSecureContext && clipboard?.write && Item) {
    richAttempted = true;
    const data: Record<string, Blob> = {
      "text/plain": new environment.Blob([input.text], { type: "text/plain" }),
      "text/html": new environment.Blob([input.html], { type: "text/html" }),
    };
    const supportsPng = Boolean(input.imageBlob)
      && (typeof Item.supports !== "function" || Item.supports("image/png"));
    if (supportsPng && input.imageBlob) data["image/png"] = input.imageBlob;
    try {
      await clipboard.write([new Item(data)]);
      return supportsPng ? "complete" : input.hasScreenshot ? "without-image" : "text-only";
    } catch {
      // O fallback textual abaixo é esperado para arquivos locais e browsers restritivos.
    }
  }
  if (environment.isSecureContext && clipboard?.writeText) {
    try {
      await clipboard.writeText(input.text);
      return richAttempted && input.hasScreenshot ? "without-image" : "text-only";
    } catch {
      // Mantém compatibilidade com o fallback document.execCommand existente.
    }
  }
  return await environment.fallbackCopy(input.text) ? "text-only" : "failed";
}
