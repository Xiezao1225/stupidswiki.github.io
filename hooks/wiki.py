"""MkDocs hook：把 stupidswiki 的几种简写翻译成 Material 能渲染的 Markdown。

支持的写法（都在钩子里处理，正文本身仍是普通 Markdown）：

    {{模板名}} / {{模板名|自定义说明}}   独占一行，展开成提示块
    [[页面#小节|链接文字]]              展开成普通站内链接
    > [!note] 标题                      展开成 !!! note "标题" 提示块
    文件顶部 front matter 的 notice:     展开成页面顶部的提示块

钩子在 Markdown 解析之前运行，所以代码块里的这些字符不会被误伤。
"""

from __future__ import annotations

import json
import re
from pathlib import Path

HOOK_DIR = Path(__file__).resolve().parent

# 简写 → pymdownx/Material 的 admonition 类型
KIND_ALIASES = {
    "note": "note",
    "info": "info",
    "tip": "tip",
    "success": "tip",
    "warning": "warning",
    "warn": "warning",
    "caution": "warning",
    "important": "warning",
    "danger": "danger",
    "error": "danger",
    "stop": "danger",
    "default": "note",
}

FENCE_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
TEMPLATE_RE = re.compile(r"^\{\{\s*([^{}|\n]+?)\s*(?:\|\s*([^{}\n]*?)\s*)?\}\}[ \t]*$")
WIKILINK_RE = re.compile(r"\[\[([^\]|\\\n]+?)(?:\\?\|([^\]\n]+?))?\]\]")
CALLOUT_RE = re.compile(r"^\[!(\w+)\][ \t]*(.*)$")
INLINE_CODE_RE = re.compile(r"`[^`\n]*`")

TITLES: dict[str, str] = {}
PATHS: dict[str, str] = {}


def _load_presets() -> dict:
    path = HOOK_DIR / "notices.json"
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    presets: dict[str, dict] = {}
    for category in data.get("categories", []):
        for item in category.get("items", []):
            name = (item.get("name") or "").strip()
            if name:
                presets[name] = item
    return presets


PRESETS = _load_presets()


# --------------------------------------------------------------- 页面索引


def _register(page_id: str, path: str, title: str) -> None:
    PATHS[page_id] = path
    TITLES[page_id] = title


def _walk_nav(items) -> None:
    for item in items or []:
        if isinstance(item, str):
            _register(Path(item).stem, item, Path(item).stem)
            continue
        if not isinstance(item, dict):
            continue
        for title, value in item.items():
            if isinstance(value, str):
                _register(Path(value).stem, value, title)
            elif isinstance(value, list):
                _walk_nav(value)


def on_config(config):
    TITLES.clear()
    PATHS.clear()
    _walk_nav(config.get("nav"))
    # 正文里有 [[home]] 这种指向首页的写法
    PATHS.setdefault("home", "index.md")
    TITLES.setdefault("home", "首页")
    return config


# --------------------------------------------------------------- 小工具


def _indent(text: str) -> str:
    return "\n".join(("    " + line) if line.strip() else "" for line in text.split("\n"))


def _admonition(kind: str, title: str, text: str, live: bool = False) -> str:
    kind = KIND_ALIASES.get(str(kind).lower(), "note")
    heading = f"!!! {kind}"
    title = (title or "").strip()
    if title:
        # 只转义标题自身的引号，LIVE 徽标的标签要原样保留
        title = title.replace('"', "&quot;")
        if live:
            title += ' <span class="wiki-live">LIVE</span>'
        heading += ' "' + title + '"'
    body = (text or "").strip()
    if not body:
        return heading + "\n    "
    return heading + "\n" + _indent(body)


def _walk_lines(markdown: str, fn):
    """逐行处理，跳过围栏代码块。"""
    out: list[str] = []
    fence = None
    for line in markdown.split("\n"):
        match = FENCE_RE.match(line)
        if fence is not None:
            out.append(line)
            if match and match.group(1)[0] == fence[0] and len(match.group(1)) >= len(fence):
                fence = None
            continue
        if match:
            fence = match.group(1)
            out.append(line)
            continue
        out.append(fn(line))
    return "\n".join(out)


# --------------------------------------------------------------- 三种语法


def _convert_callouts(markdown: str) -> str:
    lines = markdown.split("\n")
    out: list[str] = []
    fence = None
    i = 0

    while i < len(lines):
        line = lines[i]
        fence_match = FENCE_RE.match(line)

        if fence is not None:
            out.append(line)
            if fence_match and fence_match.group(1)[0] == fence[0] and len(fence_match.group(1)) >= len(fence):
                fence = None
            i += 1
            continue

        if fence_match:
            fence = fence_match.group(1)
            out.append(line)
            i += 1
            continue

        if re.match(r"^ {0,3}>", line):
            block: list[str] = []
            while i < len(lines) and re.match(r"^ {0,3}>", lines[i]):
                block.append(re.sub(r"^ {0,3}>[ \t]?", "", lines[i]))
                i += 1

            head = block[0] if block else ""
            callout = CALLOUT_RE.match(head)
            if callout:
                body = "\n".join(block[1:]).strip("\n")
                out.append(_admonition(callout.group(1), callout.group(2) or "", body))
                out.append("")
            else:
                out.extend(("> " + b).rstrip() if b.strip() else ">" for b in block)
            continue

        out.append(line)
        i += 1

    return "\n".join(out)


def _convert_wikilinks(markdown: str) -> str:
    def replace(match: re.Match) -> str:
        target = match.group(1).strip()
        label = (match.group(2) or "").strip()
        page_id, _, anchor = target.partition("#")
        page_id = page_id.strip()
        anchor = anchor.strip()

        path = PATHS.get(page_id)
        if not path:
            return match.group(0)

        text = label or TITLES.get(page_id, page_id)
        href = path + (f"#{anchor}" if anchor else "")
        return f"[{text}]({href})"

    def per_line(line: str) -> str:
        if "[[" not in line:
            return line
        slots: list[str] = []

        def grab(match: re.Match) -> str:
            slots.append(match.group(0))
            return f"\x00{len(slots) - 1}\x00"

        masked = INLINE_CODE_RE.sub(grab, line)
        masked = WIKILINK_RE.sub(replace, masked)
        return re.sub(r"\x00(\d+)\x00", lambda m: slots[int(m.group(1))], masked)

    return _walk_lines(markdown, per_line)


def _convert_templates(markdown: str) -> str:
    def per_line(line: str) -> str:
        match = TEMPLATE_RE.match(line)
        if not match:
            return line

        name = match.group(1).strip()
        override = match.group(2)
        preset = PRESETS.get(name)
        if preset is None:
            return (
                '<span class="wiki-unknown" title="模板库里没有这个模板">'
                f"{{{{ {name} }}}}</span>"
            )

        text = preset.get("text", "") if override is None else override
        return _admonition(
            preset.get("kind", "note"),
            preset.get("title") or "",
            text or "",
            preset.get("variant") == "alert",
        )

    return _walk_lines(markdown, per_line)


def _meta_notices(page) -> str:
    meta = getattr(page, "meta", None) or {}
    raw = meta.get("notice")
    if not raw:
        return ""

    entries = raw if isinstance(raw, list) else [raw]
    blocks: list[str] = []

    for entry in entries:
        if isinstance(entry, str):
            name = entry.strip()
            preset = PRESETS.get(name)
            if preset:
                blocks.append(
                    _admonition(
                        preset.get("kind", "note"),
                        preset.get("title") or "",
                        preset.get("text", ""),
                        preset.get("variant") == "alert",
                    )
                )
            elif name:
                blocks.append(_admonition("note", "", name))
            continue

        if not isinstance(entry, dict):
            continue

        if any(key in entry for key in ("type", "title", "text")):
            blocks.append(
                _admonition(
                    entry.get("type", "note"),
                    str(entry.get("title") or ""),
                    str(entry.get("text") or ""),
                    entry.get("variant") == "alert",
                )
            )
            continue

        if len(entry) == 1:
            name, value = next(iter(entry.items()))
            preset = PRESETS.get(str(name).strip())
            if preset:
                text = preset.get("text", "") if value is None else str(value)
                blocks.append(
                    _admonition(
                        preset.get("kind", "note"),
                        preset.get("title") or "",
                        text,
                        preset.get("variant") == "alert",
                    )
                )

    if not blocks:
        return ""
    return "\n\n".join(blocks) + "\n\n"


# --------------------------------------------------------------- 入口


def on_page_markdown(markdown, page, config, files):
    markdown = _convert_callouts(markdown)
    markdown = _convert_templates(markdown)
    markdown = _convert_wikilinks(markdown)

    notices = _meta_notices(page)
    if notices:
        markdown = notices + markdown
    return markdown
