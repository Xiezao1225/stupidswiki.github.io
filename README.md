# stupidswiki

记录一群傻*。用 [MkDocs](https://www.mkdocs.org/) + [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) 构建的静态 wiki。

线上地址：<https://xiezao1225.github.io/stupidswiki.github.io/>

## 目录结构

```text
.
├── mkdocs.yml            站点配置：导航、主题、Markdown 扩展
├── requirements.txt      Python 依赖
├── docs/                 所有页面，一个 .md 一页
│   ├── index.md          首页
│   ├── stylesheets/      补充样式（顶栏液态玻璃的观感也在这）
│   └── assets/           图片，以及顶栏液态玻璃的脚本
├── hooks/
│   ├── wiki.py           自定义语法的转换钩子
│   └── notices.json      提示条模板库
├── legacy/               迁移前的自研静态站，存档用，不参与构建
└── .github/workflows/    GitHub Pages 自动构建发布
```

## 顶栏液态玻璃

顶栏是一块真的会折射的玻璃，不是单纯的半透明模糊：`docs/assets/liquid-glass.js` 按顶栏尺寸用 canvas 画两张贴图（法线图 + 镜面图），拼成 `feDisplacementMap` 滤镜，再用 `backdrop-filter: url(#id)` 作用在滚动过去的内容上。

- 实现移植自 [Archis Vaze 的 liquid-glass](https://github.com/archisvaze/liquid-glass)（MIT），去掉了他那个可拖动的演示外壳
- **只有 Chromium 支持** `backdrop-filter` 接 `url()` 滤镜；脚本会先探测，不支持就完全不加 `lg-glass` 类，顶栏保持 Material 原样（不会出现「半透明但没模糊」的糟糕状态）
- 玻璃的参数（厚度、折射率、模糊、高光）在脚本顶部的 `CONFIG` 里；配色和边缘高光在 `wiki.css` 的 `.md-header.lg-glass` 里
- 尺寸变化会重算贴图（`ResizeObserver` + 防抖），`prefers-reduced-transparency` 下自动退回实色

## 本地预览

```bash
pip install -r requirements.txt
python -m mkdocs serve
```

打开 <http://127.0.0.1:8000>。改 Markdown 保存后浏览器自动刷新。

只想构建不预览：

```bash
python -m mkdocs build          # 产物在 site/
python -m mkdocs build --strict # 有警告就失败，CI 用的是这个
```

## 新增一页

1. 在 `docs/` 下新建 `people-zhang.md`，第一行写 `# 标题`。
2. 打开 `mkdocs.yml`，在 `nav:` 的对应分组里加一行：

```yaml
nav:
  - 人物志:
      - 示例条目：老王: entry-sample.md
      - 老张: people-zhang.md
```

3. 保存。页面会出现在左侧导航，地址是 `/people-zhang/`。

页面里用 `[[people-zhang]]` 就能链过去，链接文字自动取导航里的名字。

## 提示条模板

页面顶部那些「本页正在施工」之类的横幅，在正文里**单独占一行**写名字就出来了：

````markdown
{{施工中}}
{{施工中|这页写到一半，先别引用。}}
````

十四条预设分四组（编辑状态、内容类型、阅读提醒、页面质量），定义在 `hooks/notices.json`。加一条：

```json
{
  "name": "还没定论",
  "kind": "warning",
  "title": "这事还没有定论",
  "text": "两种说法都有人信，先把两边都记下来。"
}
```

也可以不用模板库，直接在文件顶部写 front matter：

```yaml
---
notice:
  type: warning
  title: 本页还在施工
  text: 内容随时可能变动，看到错漏欢迎直接改。
---
```

站内的「页首模板一览」和「提示条的写法」两页有完整说明。

## 自定义语法

`hooks/wiki.py` 在 Markdown 解析前把三种简写翻译成标准写法，所以代码块里的同样字符不会受影响：

| 写法 | 转换结果 |
| :--- | :--- |
| `{{模板名}}` / `{{模板名\|说明}}` | `!!! 类型 "标题"` 提示块 |
| `[[页面#小节\|文字]]` | `[文字](页面.md#小节)` |
| `> [!note] 标题` | `!!! note "标题"` 提示块 |
| front matter 的 `notice:` | 页面顶部的提示块 |

除此之外就是标准 Markdown + Material 自带的扩展（admonition、任务列表、脚注、代码高亮、表格等），见站内「Markdown 速查」。

## 部署

推送到 `main` 后由 `.github/workflows/pages.yml` 自动构建并发布：装依赖 → `python -m mkdocs build --strict` → 上传 `site/` 作为 Pages 产物。

第一次部署需要在仓库 **Settings → Pages → Source** 里选 **GitHub Actions**（而不是「Deploy from a branch」）。

关于地址：仓库叫 `stupidswiki.github.io`，但归属账号是 `Xiezao1225`，所以它是**项目站**而不是用户站，地址带一级子路径：

```text
https://xiezao1225.github.io/stupidswiki.github.io/
```

这直接影响 `mkdocs.yml` 里的 `site_url`——它决定锚点永久链接、sitemap 和 canonical。以后换账号、改仓库名或者上自定义域名，记得同步改 `site_url`，否则页面里的 `¶` 会指向别的地址。

想手动发布的话，`python -m mkdocs build` 之后把 `site/` 的内容推到 `gh-pages` 分支也行。

## 迁移说明

本站之前是一个零依赖的自研静态 wiki（哈希路由、自写 Markdown 渲染器）。迁移到 MkDocs 之后：

- 内容全部保留，`docs/` 下的 Markdown 与原来一致
- `{{模板}}`、`[[内链]]`、`> [!note]` 三种写法继续可用，由 `hooks/wiki.py` 转换
- 提示条改成 Material 的 admonition，配色和图标跟着主题走；原来的关闭按钮（`dismissible`）和自定义图标（`icon`）字段不再生效，已从模板库移除
- 搜索换成 Material 内置的全文搜索，带中文分词
- 旧站点整套代码在 `legacy/` 里，不参与构建，确认不需要后可以删掉
