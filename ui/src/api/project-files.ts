import { api } from "./client";

export interface ProjectFile {
  id: string;
  projectId: string;
  assetId: string;
  path: string;
  contentType: string;
  byteSize: number;
  contentPath: string;
  createdAt: string;
}

export interface ProjectFileList {
  files: ProjectFile[];
  totalBytes: number;
  limits: { maxTotalBytes: number; maxFiles: number };
}

const base = (companyId: string, projectId: string) =>
  `/companies/${encodeURIComponent(companyId)}/projects/${encodeURIComponent(projectId)}/files`;

/** Files uploaded into a project (a folder of brand assets, briefs or references). */
export const projectFilesApi = {
  list: (companyId: string, projectId: string) => api.get<ProjectFileList>(base(companyId, projectId)),
  upload: (companyId: string, projectId: string, file: File, path: string) => {
    const form = new FormData();
    form.append("path", path);
    form.append("file", file, file.name);
    return api.postForm<ProjectFile>(base(companyId, projectId), form);
  },
  remove: (companyId: string, projectId: string, fileId: string) =>
    api.delete<{ ok: true }>(`${base(companyId, projectId)}/${encodeURIComponent(fileId)}`),
};
