const state = {
  user: null,
  settings: { site_name: "DocPI", site_desc: "" },
  projects: [],
  currentProjectId: null,
  currentFolderId: null,
  folders: [],
  documents: [],
  openFolderIds: /* @__PURE__ */ new Set(),
  currentDocId: null,
  currentDoc: null,
  myFolders: { all: false, folder_ids: [] },
  searchQuery: ""
};
export {
  state
};
//# sourceMappingURL=state.js.map
