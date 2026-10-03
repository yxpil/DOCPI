import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../src/state.js';
import { canEditFolder } from '../src/auth.js';

describe('canEditFolder 权限判定', () => {
  beforeEach(() => {
    state.user = null;
    state.myFolders = { all: false, folder_ids: [] };
  });

  it('未登录一律 false', () => {
    expect(canEditFolder(1)).toBe(false);
  });

  it('管理员放行所有文件夹', () => {
    state.user = { role: 'admin' };
    expect(canEditFolder(999)).toBe(true);
  });

  it('myFolders.all 放行（工程师全库授权）', () => {
    state.user = { role: 'engineer' };
    state.myFolders = { all: true, folder_ids: [] };
    expect(canEditFolder(5)).toBe(true);
  });

  it('按 folder_ids 白名单精确授权', () => {
    state.user = { role: 'engineer' };
    state.myFolders = { all: false, folder_ids: [10, 20] };
    expect(canEditFolder(10)).toBe(true);
    expect(canEditFolder(30)).toBe(false);
  });
});
