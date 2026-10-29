import { projectFilesApi } from "../api/project-files";

export const PROJECT_FILES_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const PROJECT_FILES_MAX_COUNT = 500;
export const PROJECT_FILES_ACCEPT = "image/*,video/*,.pdf,.txt,.md,.csv,.rtf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp";

const DOCUMENT_EXTENSIONS = new Set(["pdf", "txt", "md", "csv", "rtf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"]);
const MEDIA_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "avif", "mp4", "mov", "webm", "m4v"]);

/** Same rule as the server: images, videos, PDFs and documents. */
export function isAllowedProjectFile(file: File) {
  if (file.type.startsWith("image/") || file.type.startsWith("video/")) return true;
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return DOCUMENT_EXTENSIONS.has(extension) || MEDIA_EXTENSIONS.has(extension);
}

/** The path inside the chosen folder, or the bare name for single files. */
export function projectFilePath(file: File) {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ProjectFileSelection {
  files: File[];
  skipped: number;
  totalBytes: number;
  error: string | null;
}

/** Drops unsupported and hidden files, then checks the project limits before any upload. */
export function selectProjectFiles(list: FileList | File[], existing = { count: 0, bytes: 0 }): ProjectFileSelection {
  const all = [...list].filter((file) => !projectFilePath(file).split("/").some((part) => part.startsWith(".")));
  const files = all.filter(isAllowedProjectFile);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const error = existing.count + files.length > PROJECT_FILES_MAX_COUNT
    ? `A project can hold at most ${PROJECT_FILES_MAX_COUNT} files.`
    : existing.bytes + totalBytes > PROJECT_FILES_MAX_TOTAL_BYTES
      ? "Project files are limited to 100 MB in total."
      : null;
  return { files, skipped: all.length - files.length, totalBytes, error };
}

/** Uploads one file at a time and keeps going past single failures. */
export async function uploadProjectFiles(
  companyId: string,
  projectId: string,
  files: File[],
  onProgress: (done: number) => void,
) {
  const failed: { path: string; error: string }[] = [];
  for (const [index, file] of files.entries()) {
    try {
      await projectFilesApi.upload(companyId, projectId, file, projectFilePath(file));
    } catch (error) {
      failed.push({ path: projectFilePath(file), error: error instanceof Error ? error.message : "Upload failed" });
    }
    onProgress(index + 1);
  }
  return failed;
}
