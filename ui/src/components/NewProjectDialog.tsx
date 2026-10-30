import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PROJECT_COLORS } from "@paperclipai/shared";
import { FolderUp, X } from "lucide-react";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { trackRecentProject } from "../lib/recent-projects";
import {
  formatBytes,
  PROJECT_FILES_SAAS_ACCEPT,
  selectProjectFiles,
  uploadProjectFiles,
  type ProjectFileSelection,
} from "../lib/project-file-upload";
import { useSaasMode } from "../hooks/useSaasMode";
import { ProjectTile } from "./ProjectTile";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";

/** Upload attributes the browser needs for picking a whole folder. */
const FOLDER_INPUT_PROPS = { webkitdirectory: "", directory: "" } as Record<string, string>;

export function NewProjectDialog() {
  const { newProjectOpen, closeNewProject } = useDialog();
  const { selectedCompanyId } = useCompany();
  return selectedCompanyId && newProjectOpen
    ? <NewProjectForm key={selectedCompanyId} companyId={selectedCompanyId} onClose={closeNewProject} /> : null;
}

/**
 * New agency project: a name and, optionally, a folder of brand assets,
 * briefs or references (images, videos, PDFs and documents; 100 MB and 500
 * files). Source code repositories are not part of an agency project.
 */
export function NewProjectForm({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const client = useQueryClient();
  const saasMode = useSaasMode();
  const [name, setName] = useState("");
  const [color] = useState(() => PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)]!);
  const [selection, setSelection] = useState<ProjectFileSelection | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadFailures, setUploadFailures] = useState<{ path: string; error: string }[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const create = useMutation({
    mutationFn: async () => {
      const project = await projectsApi.create(companyId, { name: name.trim(), color, status: "planned" });
      trackRecentProject(project.id, companyId);
      void client.invalidateQueries({ queryKey: queryKeys.projects.all(companyId) });
      const files = selection?.files ?? [];
      if (files.length === 0) return [];
      setProgress({ done: 0, total: files.length });
      const failed = await uploadProjectFiles(companyId, project.id, files, (done) => setProgress({ done, total: files.length }), saasMode);
      setProgress(null);
      return failed;
    },
    onSuccess: (failed) => {
      if (failed.length) setUploadFailures(failed);
      else onClose();
    },
  });
  const busy = create.isPending;
  const blocked = Boolean(selection?.error);

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent showCloseButton={false} aria-describedby={undefined}
      className="flex max-h-(--sz-calc-18) flex-col gap-0 overflow-hidden p-0 shadow-sm sm:max-w-lg"
      onOpenAutoFocus={(event) => { event.preventDefault(); input.current?.focus(); }}>
      {uploadFailures ? <div className="space-y-4 p-5">
        <DialogTitle className="text-lg font-semibold">Project created</DialogTitle>
        <p className="text-sm text-muted-foreground">
          {uploadFailures.length} {uploadFailures.length === 1 ? "file" : "files"} could not be uploaded. Add them again from the project's Files section.
        </p>
        <ul className="max-h-40 overflow-y-auto text-xs text-muted-foreground">
          {uploadFailures.slice(0, 20).map((failure) => <li key={failure.path}>{failure.path}: {failure.error}</li>)}
        </ul>
        <div className="flex justify-end"><Button type="button" onClick={onClose}>Done</Button></div>
      </div> : <form className="flex min-h-0 flex-col overflow-hidden" onSubmit={(event) => { event.preventDefault(); if (name.trim() && !busy && !blocked) create.mutate(); }}>
        <div className="flex shrink-0 flex-col gap-4 px-5 pb-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-lg font-semibold">Create project</DialogTitle>
            <Button type="button" variant="ghost" size="icon-sm" disabled={busy} aria-label="Close new project" onClick={onClose}><X className="size-4" /></Button>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-input px-3 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
            <ProjectTile color={color} size="sm" />
            <input ref={input} aria-label="Project name" value={name} disabled={busy} onChange={(event) => setName(event.target.value)} placeholder="Project name" required
              className="h-10 w-full min-w-0 border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm" />
          </div>
        </div>
        <div className="space-y-2 px-5 pb-1">
          <div className="flex items-baseline gap-2"><span className="text-sm font-medium">{saasMode ? "Project files" : "Project folder"}</span><span className="text-xs text-muted-foreground">optional</span></div>
          <p className="text-xs text-muted-foreground">{saasMode
            ? "Brand assets, briefs or references. Upload individual images, videos, PDFs and documents. Videos up to 100 MB, other files up to 10 MB."
            : "Brand assets, briefs or references. Images, videos, PDFs and documents, up to 100 MB and 500 files."}</p>
          <input ref={folderInput} type="file" multiple hidden {...(saasMode ? { accept: PROJECT_FILES_SAAS_ACCEPT } : FOLDER_INPUT_PROPS)}
            onChange={(event) => { if (event.target.files?.length) setSelection(selectProjectFiles(event.target.files, undefined, saasMode)); event.target.value = ""; }} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => folderInput.current?.click()}>
              <FolderUp className="size-4" aria-hidden />{saasMode ? (selection ? "Choose other files" : "Upload files") : (selection ? "Choose another folder" : "Upload folder")}
            </Button>
            {selection && !busy && <Button type="button" variant="ghost" size="sm" onClick={() => setSelection(null)}>Remove</Button>}
          </div>
          {selection && (
            <p role={selection.error ? "alert" : "status"} className={selection.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {selection.error ?? `${selection.files.length} ${selection.files.length === 1 ? "file" : "files"} · ${formatBytes(selection.totalBytes)}${selection.skipped ? ` · ${selection.skipped} unsupported skipped` : ""}`}
            </p>
          )}
          {progress && <p role="status" className="text-sm text-muted-foreground">Uploading {progress.done} of {progress.total}…</p>}
        </div>
        {create.isError && <p role="alert" className="px-5 pt-3 text-sm text-destructive">{create.error.message}</p>}
        <div className="flex shrink-0 justify-end gap-2 px-5 py-5">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!name.trim() || busy || blocked}>{busy ? (progress ? "Uploading…" : "Creating…") : "Create project"}</Button>
        </div>
      </form>}
    </DialogContent>
  </Dialog>;
}
