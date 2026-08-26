// 全局类型声明：window 上挂载的辅助函数 + vendor 全局对象
interface Window {
  icon: (name: string, cls?: string) => string;
  icons: Record<string, string>;
  __tree: Record<string, unknown>;
}

// vendor/tailwind.js（CDN 版 Tailwind 运行时）
declare const tailwind: {
  config: Record<string, unknown>;
};

// vendor/marked.min.js
declare const marked: {
  parse: (src: string, options?: Record<string, unknown>) => string;
};
