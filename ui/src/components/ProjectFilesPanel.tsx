import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, FolderUp, Trash2 } from "lucide-react";
import { projectFilesApi } from "../api/project-files";
import {
  formatBytes,
  PROJECT_FILES_ACCEPT,
  PROJECT_FILES_SAAS_ACCEPT,
  selectProjectFiles,
  uploadProjectFiles,
} from "../lib/project-file-upload";
import { useSaasMode } from "../hooks/useSaasMode";
import { Button } from "./ui/button";

const filesKey = (companyId: string, projectId: string) => ["project-files", companyId, projectId] as const;

/** Upload attributes the browser needs for picking a whole folder. */
const FOLDER_INPUT_PROPS = { webkitdirectory: "", directory: "" } as Record<string, string>;

/**
 * The project's uploaded folder: brand assets, briefs and references the
 * agents work from. Limited to 100 MB and 500 files per project.
 */
export function ProjectFilesPanel({ companyId, projectId }: { companyId: string; projectId: string }) {
  const client = useQueryClient();
  const saasMode = useSaasMode();
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const files = useQuery({ queryKey: filesKey(companyId, projectId), queryFn: () => projectFilesApi.list(companyId, projectId) });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (fileId: string) => projectFilesApi.remove(companyId, projectId, fileId),
    onSettled: () => void client.invalidateQueries({ queryKey: filesKey(companyId, projectId) }),
  });

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const current = files.data;
    const selection = selectProjectFiles(list, { count: current?.files.length ?? 0, bytes: current?.totalBytes ?? 0 }, saasMode);
    if (selection.error) { setMessage(selection.error); return; }
    if (selection.files.length === 0) { setMessage("No supported files. Upload images, videos, PDFs or documents."); return; }
    setMessage(null);
    setProgress({ done: 0, total: selection.files.length });
    const failed = await uploadProjectFiles(companyId, projectId, selection.files, (done) => setProgress({ done, total: selection.files.length }), saasMode);
    setProgress(null);
    await client.invalidateQueries({ queryKey: filesKey(companyId, projectId) });
    const skipped = selection.skipped ? ` ${selection.skipped} unsupported ${selection.skipped === 1 ? "file was" : "files were"} skipped.` : "";
    setMessage(failed.length ? `${failed.length} ${failed.length === 1 ? "file" : "files"} failed: ${failed[0]!.path} (${failed[0]!.error}).${skipped}` : `Uploaded ${selection.files.length} ${selection.files.length === 1 ? "file" : "files"}.${skipped}`);
  }

  const data = files.data;
  return (
    <section className="mt-8 space-y-3" aria-labelledby="project-files-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="project-files-heading" className="text-sm font-medium">Files</h3>
          <p className="text-xs text-muted-foreground">
            {saasMode
              ? "Brand assets, briefs and references for this project. Upload individual images, videos, PDFs and documents. Videos up to 100 MB, other files up to 10 MB."
              : "Brand assets, briefs and references for this project. Images, videos, PDFs and documents, up to 100 MB and 500 files."}
          </p>
        </div>
        <div className="flex gap-2">
          {!saasMode && <input ref={folderInput} type="file" multiple hidden {...FOLDER_INPUT_PROPS} onChange={(event) => { void upload(event.target.files); event.target.value = ""; }} />}
          <input ref={filesInput} type="file" multiple hidden accept={saasMode ? PROJECT_FILES_SAAS_ACCEPT : PROJECT_FILES_ACCEPT} onChange={(event) => { void upload(event.target.files); event.target.value = ""; }} />
          {!saasMode && (
            <Button type="button" variant="outline" size="sm" disabled={Boolean(progress)} onClick={() => folderInput.current?.click()}>
              <FolderUp className="size-4" aria-hidden />Upload folder
            </Button>
          )}
          <Button type="button" variant={saasMode ? "outline" : "ghost"} size="sm" disabled={Boolean(progress)} onClick={() => filesInput.current?.click()}>Add files</Button>
        </div>
      </div>
      {progress && <p role="status" className="text-sm text-muted-foreground">Uploading {progress.done} of {progress.total}…</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      {files.error && <p role="alert" className="text-sm text-destructive">{files.error instanceof Error ? files.error.message : "Could not load files."}</p>}
      {remove.error && <p role="alert" className="text-sm text-destructive">{remove.error instanceof Error ? remove.error.message : "Could not remove the file."}</p>}
      {data && (
        <>
          <p className="text-xs text-muted-foreground">{data.files.length} of {data.limits.maxFiles} files · {formatBytes(data.totalBytes)} of {formatBytes(data.limits.maxTotalBytes)}</p>
          {data.files.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">No files yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {data.files.map((file) => (
                <li key={file.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <a className="min-w-0 flex-1 truncate hover:underline" href={file.contentPath} target="_blank" rel="noreferrer">{file.path}</a>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.byteSize)}</span>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${file.path}`} disabled={remove.isPending} onClick={() => remove.mutate(file.id)}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
