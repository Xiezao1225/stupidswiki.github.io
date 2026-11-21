# 新增一页

三步，都在仓库里完成。

## 1. 建文件

在 `docs/` 下新建一个 `.md` 文件。文件名就是地址，建议用英文小写加连字符，比如 `people-zhang.md` → `/people-zhang/`。

## 2. 加进导航

打开根目录的 `mkdocs.yml`，在 `nav:` 里那个页面该出现的分组下加一行：

```yaml
nav:
  - 入门:
      - 怎么用这个 wiki: guide-start.md
      - 老张: people-zhang.md
```

- 冒号前是**导航里显示的名字**，冒号后是 `docs/` 里的文件名。
- 页面地址由文件名决定（`people-zhang.md` → `/people-zhang/`），改文件名会让旧链接失效。
- 没写进 `nav` 的页面不会被链接到，但依然会被构建出来、也能被搜索到。想让页面不进导航，在 `mkdocs.yml` 顶层写 `not_in_nav: /foo.md`。

## 3. 写内容

文件第一行写一级标题：

```markdown
# 老张

正文……
```

页面里 `[[people-zhang]]` 就能链到它，链接文字自动取导航里的名字。

> [!tip] 本地预览
> 在仓库根目录跑 `python -m mkdocs serve`，改完保存浏览器会自动刷新，不用重启。

## 加图片

图片放在 `docs/assets/` 下，正文里写相对路径：

```markdown
![团建现场](assets/team.jpg)
```

## 引用别的页

```markdown
看看 [[entry-sample]]，或者 [[entry-sample|用这个链接文字]]。
跳到某一节：[[guide-markdown#表格|Markdown 表格写法]]。
```

目标页不存在时不会变成死链——转换器会原样保留 `[[...]]` 文本，页面上看得见，方便你发现写错了。

## 调顺序

导航顺序就是 `nav` 里的顺序，也决定了页面底部的「上一页 / 下一页」。想把某一页提到最前面，剪贴那一行就行。

## 页首加提示

在文件最前面写 front matter，或者正文里独占一行写 `{{模板名}}`，见 [[guide-notice]]。
