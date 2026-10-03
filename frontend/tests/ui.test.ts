import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/ui.js';

describe('escapeHtml XSS 转义', () => {
  it('转义 < > &', () => {
    expect(escapeHtml('<b>hi</b>')).toBe('&lt;b&gt;hi&lt;/b&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('注入防护：script 标签被拆成文本，不形成可执行标签', () => {
    const out = escapeHtml('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('注入防护：属性注入载荷中的尖括号被转义，无法构成真实标签', () => {
    // 真实行为：该 helper 转义 < > &（textContent 语义），引号不转义；
    // 只要 < > 被转义，payload 就无法解析成 <img onerror=...> 活节点。
    const ev = escapeHtml('"><img src=x onerror=alert(1)>');
    expect(ev).not.toContain('<img');
    expect(ev).not.toContain('>alert(1)<');
    expect(ev).toContain('&lt;img');
  });

  it('空值安全', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});
