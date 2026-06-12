export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

interface PendingImage {
  resolve: (result: { filename: string; webviewUri: string }) => void;
  reject: (err: unknown) => void;
}

interface ImageSaveResult {
  type: 'imageSaveResult';
  requestId: number;
  filename?: string;
  webviewUri?: string;
  error?: string;
}

export class Bridge {
  private nextRequestId = 1;
  private pendingImages = new Map<number, PendingImage>();
  private changeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChange: { meta: Record<string, unknown>; body: string } | null = null;

  constructor(private readonly vscode: VsCodeApi) {}

  sendChange(meta: Record<string, unknown>, body: string): void {
    this.pendingChange = { meta, body };
    if (this.changeTimer) clearTimeout(this.changeTimer);
    this.changeTimer = setTimeout(() => {
      if (!this.pendingChange) return;
      this.vscode.postMessage({ type: 'change', ...this.pendingChange });
      this.pendingChange = null;
      this.changeTimer = null;
    }, 200);
  }

  saveImage(bytes: Uint8Array, extension: string): Promise<{ filename: string; webviewUri: string }> {
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pendingImages.set(requestId, { resolve, reject });
      this.vscode.postMessage({
        type: 'requestImageSave',
        requestId,
        bytes: Array.from(bytes),
        extension
      });
    });
  }

  resolveImageSave(msg: ImageSaveResult): void {
    const pending = this.pendingImages.get(msg.requestId);
    if (!pending) return;
    this.pendingImages.delete(msg.requestId);
    if (msg.error || !msg.filename || !msg.webviewUri) {
      pending.reject(new Error(msg.error || 'unknown image-save error'));
    } else {
      pending.resolve({ filename: msg.filename, webviewUri: msg.webviewUri });
    }
  }
}

export function getVsCodeApi(): VsCodeApi {
  return acquireVsCodeApi();
}
