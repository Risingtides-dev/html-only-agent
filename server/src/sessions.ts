export interface FileEntry {
  name: string;
  mime: string;
  size: number;
  text: string;
  uploadedAt: number;
}

export interface FileMeta {
  name: string;
  mime: string;
  size: number;
  uploadedAt: number;
}

export const MAX_FILES_PER_SESSION = 10;
export const MAX_FILE_BYTES = 1_000_000;
export const READ_TEXT_CAP = 100_000;

const TEXTUAL_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/tab-separated-values",
  "text/html",
  "text/xml",
  "text/yaml",
  "application/json",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "application/javascript",
  "application/typescript",
]);

const TEXTUAL_EXTS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "yaml",
  "yml",
  "xml",
  "html",
  "htm",
  "log",
  "ini",
  "toml",
  "js",
  "ts",
  "tsx",
  "jsx",
  "css",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "sql",
  "sh",
  "env",
]);

export function isTextual(name: string, mime: string): boolean {
  if (mime.startsWith("text/")) return true;
  if (TEXTUAL_MIMES.has(mime)) return true;
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext && TEXTUAL_EXTS.has(ext)) return true;
  return false;
}

const sessions = new Map<string, Map<string, FileEntry>>();

function getOrCreate(sessionId: string): Map<string, FileEntry> {
  let s = sessions.get(sessionId);
  if (!s) {
    s = new Map();
    sessions.set(sessionId, s);
  }
  return s;
}

export function listFiles(sessionId: string): FileMeta[] {
  const s = sessions.get(sessionId);
  if (!s) return [];
  return [...s.values()]
    .map(({ name, mime, size, uploadedAt }) => ({ name, mime, size, uploadedAt }))
    .sort((a, b) => a.uploadedAt - b.uploadedAt);
}

export function getFile(sessionId: string, name: string): FileEntry | undefined {
  return sessions.get(sessionId)?.get(name);
}

export function addFile(
  sessionId: string,
  name: string,
  mime: string,
  bytes: Buffer,
): { ok: true; file: FileMeta } | { ok: false; error: string } {
  if (!name || name.includes("/") || name.includes("\\") || name.length > 200) {
    return { ok: false, error: "invalid filename" };
  }
  if (bytes.length === 0) return { ok: false, error: "empty file" };
  if (bytes.length > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `file exceeds ${(MAX_FILE_BYTES / 1000) | 0} KB limit`,
    };
  }
  if (!isTextual(name, mime)) {
    return { ok: false, error: "only text-like files are supported (txt, md, csv, json, yaml, code, etc.)" };
  }

  const session = getOrCreate(sessionId);
  if (!session.has(name) && session.size >= MAX_FILES_PER_SESSION) {
    return { ok: false, error: `file limit reached (${MAX_FILES_PER_SESSION})` };
  }

  const text = bytes.toString("utf8");
  const entry: FileEntry = {
    name,
    mime,
    size: bytes.length,
    text,
    uploadedAt: Date.now(),
  };
  session.set(name, entry);
  return {
    ok: true,
    file: { name, mime, size: bytes.length, uploadedAt: entry.uploadedAt },
  };
}

export function removeFile(sessionId: string, name: string): boolean {
  return sessions.get(sessionId)?.delete(name) ?? false;
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function fileCount(sessionId: string): number {
  return sessions.get(sessionId)?.size ?? 0;
}

export function manifestLine(sessionId: string): string | null {
  const files = listFiles(sessionId);
  if (files.length === 0) return null;
  const list = files
    .map((f) => `${f.name} (${formatBytes(f.size)}, ${f.mime || "text"})`)
    .join(", ");
  return `Files attached this conversation: ${list}. Use list_files / read_file to read them when relevant.`;
}

function formatBytes(n: number): string {
  if (n < 1000) return `${n} B`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)} KB`;
  return `${(n / 1_000_000).toFixed(2)} MB`;
}
