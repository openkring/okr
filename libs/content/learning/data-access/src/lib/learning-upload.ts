/** Thrown when the signed PUT fails or is aborted. */
export class LearningUploadError extends Error {
  constructor(public readonly aborted: boolean, public readonly status?: number) {
    super(aborted ? 'Upload aborted' : `Upload failed${status ? ` (${status})` : ''}`);
    this.name = 'LearningUploadError';
  }
}

/** PUT `file` to a signed URL with exactly `headers`; XHR for upload progress (0..1) and abort. */
export function uploadToSignedUrl(
  url: string, file: Blob, headers: Record<string, string>,
  onProgress?: (fraction: number) => void, signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new LearningUploadError(true));
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const done = () => signal?.removeEventListener('abort', onAbort);
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = e => { if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(1); resolve(); }
      else reject(new LearningUploadError(false, xhr.status));
    };
    xhr.onerror = () => { done(); reject(new LearningUploadError(false)); };
    xhr.onabort = () => { done(); reject(new LearningUploadError(true)); };
    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.send(file);
  });
}
