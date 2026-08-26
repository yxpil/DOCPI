// 全局应用状态 + 核心数据模型类型

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'engineer';
  email: string;
  phone: string;
  qq: string;
  avatar: string;
  created_at?: string;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  created_at?: string;
}

export interface Folder {
  id: number;
  project_id: number;
  parent_id: number | null;
  name: string;
  created_at?: string;
}

export interface DocumentMeta {
  id: number;
  title: string;
  updated_at?: string;
  price: string;
  repo_url: string;
  link: string;
  author_id: number | null;
  author_name?: string | null;
  author_username?: string | null;
}

export interface Document extends DocumentMeta {
  folder_id: number;
  content: string;
  editable: boolean;
  author_name?: string | null;
  author_username?: string | null;
  updated_by?: number | null;
  updater_name?: string | null;
  updater_username?: string | null;
  created_at?: string;
}

export interface Settings {
  site_name: string;
  site_desc: string;
  _isAdmin?: boolean;
  [key: string]: unknown;
}

export interface AppState {
  user: User | null;
  settings: Settings;
  projects: Project[];
  currentProjectId: number | null;
  currentFolderId: number | null;
  folders: Folder[];
  documents: DocumentMeta[];
  openFolderIds: Set<number>;
  currentDocId: number | null;
  currentDoc: Document | null;
  myFolders: { all: boolean; folder_ids: number[] };
  searchQuery: string;
}

export const state: AppState = {
  user: null,
  settings: { site_name: 'DocPI', site_desc: '' },
  projects: [],
  currentProjectId: null,
  currentFolderId: null,
  folders: [],
  documents: [],
  openFolderIds: new Set(),
  currentDocId: null,
  currentDoc: null,
  myFolders: { all: false, folder_ids: [] },
  searchQuery: '',
};
