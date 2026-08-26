// 集成测试：覆盖鉴权、验证码、API Token、嵌套文件夹、文档字段、作者追踪、上传、设置、用户资料
// 用法：先启动服务（DOCPI_DISABLE_CAPTCHA=1 node server.js），再 node scripts/test.js
const BASE = process.env.BASE || 'http://localhost:4322';

let pass = 0, fail = 0;
const ok = (name, cond) => { console.log((cond ? '  PASS ' : '  FAIL ') + name); cond ? pass++ : fail++; };

async function raw(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}

function login(username, password) {
  return raw('/api/auth/login', { method: 'POST', body: { username, password } });
}

async function main() {
  console.log(`\n目标服务: ${BASE}\n`);

  // ===== 验证码 =====
  const cap = await raw('/api/auth/captcha');
  ok('验证码签发成功（PNG base64）', cap.status === 200 && cap.json.id && cap.json.image.startsWith('data:image/png;base64,'));

  // ===== 登录（禁用验证码模式） =====
  const adminLogin = await login('admin', 'admin');
  ok('管理员登录成功', adminLogin.status === 200 && adminLogin.json.token && adminLogin.json.user.role === 'admin');
  const adminToken = adminLogin.json.token;

  const badLogin = await login('admin', 'wrong');
  ok('错误密码返回 401', badLogin.status === 401);

  // ===== 设置 =====
  const set1 = await raw('/api/settings');
  ok('站点设置公开可读', set1.status === 200 && set1.json.site_name);
  const putSet = await raw('/api/settings', { method: 'PUT', token: adminToken, body: { site_name: 'TestDocPI', site_desc: 'desc' } });
  ok('管理员可改站点设置', putSet.status === 200);
  const set2 = await raw('/api/settings');
  ok('站点设置已更新', set2.json.site_name === 'TestDocPI');

  // ===== 个人资料 =====
  const meProf = await raw('/api/auth/me', { token: adminToken });
  ok('me 返回资料字段', meProf.json && 'email' in meProf.json && 'qq' in meProf.json);
  const putMe = await raw('/api/auth/me', { method: 'PUT', token: adminToken, body: { display_name: '超级管理员', email: 'a@b.com', phone: '13800000000', qq: '12345678' } });
  ok('修改个人资料成功', putMe.status === 200 && putMe.json.email === 'a@b.com');
  const ava = await raw('/api/auth/me/avatar', { method: 'PUT', token: adminToken, body: { avatar: 'data:image/png;base64,AAAA' } });
  ok('上传 base64 头像成功', ava.status === 200 && ava.json.avatar.startsWith('data:image/'));

  // ===== 未登录限制 =====
  const noAuthProj = await raw('/api/projects', { method: 'POST', body: { name: '越权' } });
  ok('未登录新建项目返回 401', noAuthProj.status === 401);

  // ===== 项目 + 嵌套文件夹 =====
  const p = await raw('/api/projects', { method: 'POST', token: adminToken, body: { name: '测试项目' } });
  ok('管理员创建项目', p.status === 200 && p.json.id);
  const pid = p.json.id;

  const rootF = await raw(`/api/projects/${pid}/folders`, { method: 'POST', token: adminToken, body: { name: '根文件夹' } });
  const subF = await raw(`/api/projects/${pid}/folders`, { method: 'POST', token: adminToken, body: { name: '子文件夹', parent_id: rootF.json.id } });
  const subSubF = await raw(`/api/projects/${pid}/folders`, { method: 'POST', token: adminToken, body: { name: '孙文件夹', parent_id: subF.json.id } });
  ok('三级嵌套文件夹创建成功', rootF.status === 200 && subF.status === 200 && subSubF.status === 200);
  const rootId = rootF.json.id, subId = subF.json.id, subSubId = subSubF.json.id;

  const folders = await raw(`/api/projects/${pid}/folders`);
  ok('文件夹列表含 parent_id', folders.json.some((f) => f.parent_id === rootId) && folders.json.some((f) => f.parent_id === subId));

  // ===== 文档 + 作者追踪 =====
  const d = await raw(`/api/folders/${subId}/documents`, { method: 'POST', token: adminToken, body: { title: '带作者文档', content: '内容ABC', price: '¥88', repo_url: 'https://git.example.com/x.git', link: 'https://example.com' } });
  ok('创建文档(含价格/仓库/链接)', d.status === 200 && d.json.id);
  const docId = d.json.id;

  const docRead = await raw(`/api/documents/${docId}`);
  ok('文档公开可读', docRead.status === 200);
  ok('文档带作者名', docRead.json.author_name === '超级管理员' || docRead.json.author_username === 'admin');
  ok('文档带价格/仓库/链接', docRead.json.price === '¥88' && docRead.json.repo_url.includes('git.example.com') && docRead.json.link.includes('example.com'));
  ok('匿名 editable=false', docRead.json.editable === false);
  const docAdmin = await raw(`/api/documents/${docId}`, { token: adminToken });
  ok('管理员 editable=true', docAdmin.json.editable === true);

  // ===== 搜索 =====
  const s1 = await raw('/api/search?q=' + encodeURIComponent('带作者'));
  ok('搜索命中标题', s1.json.some((x) => x.title === '带作者文档'));
  const s2 = await raw('/api/search?q=' + encodeURIComponent('内容ABC'));
  ok('搜索命中正文', s2.json.some((x) => x.title === '带作者文档'));
  const s3 = await raw('/api/search?q=' + encodeURIComponent('git.example.com/x.git'));
  ok('搜索命中仓库', s3.json.some((x) => x.title === '带作者文档'));
  const s4 = await raw('/api/search?q=' + encodeURIComponent('子文件夹'));
  ok('搜索命中文件夹名', s4.json.some((x) => x.title === '带作者文档'));
  const s5 = await raw('/api/search?q=' + encodeURIComponent('不存在zzz'));
  ok('无结果返回空数组', Array.isArray(s5.json) && s5.json.length === 0);

  // ===== 工程师 + 文件夹授权（含祖先继承） =====
  const eng = await raw('/api/auth/users', { method: 'POST', token: adminToken, body: { username: 'engineer1', password: 'pass12345', display_name: '李工', role: 'engineer', email: 'l@b.com' } });
  ok('管理员创建工程师', eng.status === 200 && eng.json.id);
  const engId = eng.json.id;

  const grant = await raw(`/api/auth/users/${engId}/folders`, { method: 'PUT', token: adminToken, body: { folder_ids: [rootId] } });
  ok('授权工程师根文件夹', grant.status === 200);

  const engLogin = await login('engineer1', 'pass12345');
  ok('工程师登录成功', engLogin.status === 200 && engLogin.json.user.role === 'engineer');
  const engToken = engLogin.json.token;

  // 祖先继承：工程师授权了 rootId，应能编辑其孙文件夹 subSubId
  const engSubDoc = await raw(`/api/folders/${subSubId}/documents`, { method: 'POST', token: engToken, body: { title: '工程师在孙文件夹建文档' } });
  ok('工程师(授权根文件夹)可在孙文件夹建文档', engSubDoc.status === 200);

  // 未授权项目
  const p2 = await raw('/api/projects', { method: 'POST', token: adminToken, body: { name: '另一个项目' } });
  const f2 = await raw(`/api/projects/${p2.json.id}/folders`, { method: 'POST', token: adminToken, body: { name: '他文件夹' } });
  const engOther = await raw(`/api/folders/${f2.json.id}/documents`, { method: 'POST', token: engToken, body: { title: '越权' } });
  ok('工程师在未授权项目建文档返回 403', engOther.status === 403);

  // 工程师不可访问用户管理
  const engUsers = await raw('/api/auth/users', { token: engToken });
  ok('工程师访问用户列表返回 403', engUsers.status === 403);

  // 工程师可改自己资料
  const engMe = await raw('/api/auth/me', { method: 'PUT', token: engToken, body: { qq: '88888' } });
  ok('工程师可改自己资料', engMe.status === 200 && engMe.json.qq === '88888');

  // ===== API Token（AI 调用） =====
  const at = await raw('/api/auth/api-tokens', { method: 'POST', token: adminToken, body: { name: 'AI 自动维护', folder_id: rootId } });
  ok('创建 API Token（返回明文）', at.status === 200 && at.json.token && at.json.token.startsWith('dpi_'));
  const apiToken = at.json.token;

  // 通过 ?token= 参数调用（无 Bearer）
  const aiDoc = await raw(`/api/folders/${subId}/documents?token=${apiToken}`, { method: 'POST', body: { title: 'AI 写的文档' } });
  ok('AI 通过 token 参数创建文档', aiDoc.status === 200);

  // token 绑定 rootId，可编辑其子孙；但访问未授权项目会 403
  const aiDoc2 = await raw(`/api/folders/${f2.json.id}/documents?token=${apiToken}`, { method: 'POST', body: { title: '越权AI' } });
  ok('绑定文件夹的 token 越权返回 403', aiDoc2.status === 403);

  // token 列表
  const atList = await raw('/api/auth/api-tokens', { token: adminToken });
  ok('token 列表含新建 token', atList.json.some((t) => t.name === 'AI 自动维护'));

  // ===== 上传 =====
  const up = await raw('/api/upload', { method: 'POST', token: adminToken, body: { name: 'test.txt', mime: 'text/plain', data: Buffer.from('hello docpi').toString('base64') } });
  ok('上传文件成功', up.status === 200 && up.json.url.startsWith('/uploads/'));
  const upList = await raw('/api/uploads', { token: adminToken });
  ok('上传列表含文件', upList.json.length >= 1 && upList.json[0].url.startsWith('/uploads/'));

  // ===== 用户管理边界 =====
  const users = await raw('/api/auth/users', { token: adminToken });
  const adminRow = users.json.find((u) => u.username === 'admin');
  const delAdmin = await raw(`/api/auth/users/${adminRow.id}`, { method: 'DELETE', token: adminToken });
  ok('不能删除初始管理员', delAdmin.status === 400);

  // ===== 级联删除 =====
  const delProj = await raw(`/api/projects/${pid}`, { method: 'DELETE', token: adminToken });
  ok('删除项目', delProj.status === 200);
  const leftover = await raw(`/api/projects/${pid}/folders`);
  ok('级联删除文件夹', leftover.json.length === 0);

  // ===== 登出 =====
  const logout = await raw('/api/auth/logout', { method: 'POST', token: adminToken });
  ok('登出成功', logout.status === 200);

  console.log(`\n结果: ${pass} 通过, ${fail} 失败\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('测试执行异常:', e); process.exit(1); });