# Markdown 速查

本站用 MkDocs + Material 构建，写法就是标准 Markdown，外加几个 Material 自带的扩展。下面按用途列，右边是能直接抄的源码。

## 标题

用 1 到 6 个 `#`。页面里会出现右侧目录（只收二级、三级）。

````markdown
# 一级
## 二级
### 三级
````

## 强调

````markdown
**粗体**、*斜体*、~~删除线~~、`行内代码`
````

**粗体**、*斜体*、~~删除线~~、`行内代码`

## 列表

````markdown
- 第一层
  - 第二层
    - 第三层
- 回到第一层

1. 第一步
2. 第二步
````

- 第一层
  - 第二层
    - 第三层
- 回到第一层

1. 第一步
2. 第二步

任务列表（勾选框是装饰，点不动）：

````markdown
- [x] 已经做完的
- [ ] 还没做的
````

- [x] 已经做完的
- [ ] 还没做的

## 提示块

Material 的写法是三个感叹号加类型，标题写在引号里：

````markdown
!!! note "说明"
    这里是要说的话。

!!! warning
    不写标题就用类型的默认名字。
````

!!! note "说明"
    这里是要说的话。

!!! warning
    不写标题就用类型的默认名字。

类型有 `note`、`tip`、`success`、`warning`、`danger`、`info`、`question`、`failure`、`bug`、`example`、`quote`。

要折叠起来，把 `!!!` 换成 `???`：

````markdown
??? note "点开才看"
    折叠的内容放这里。
````

??? note "点开才看"
    折叠的内容放这里。

> [!tip] GitHub 写法也能用
> 从别处抄来的 `> [!note] 标题` 会由 `hooks/wiki.py` 自动转成上面那种提示块，不用手动改。

## 代码块

三个反引号包起来，第一行写语言名。鼠标移到块上会出现复制按钮。

````markdown
```python
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```
````

```python
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```

想高亮某几行，在语言名后面加 `hl_lines`：

````markdown
```python hl_lines="2"
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```
````

```python hl_lines="2"
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```

## 表格

第二行是分隔线，用 `:` 控制对齐。

````markdown
| 左对齐 | 居中 | 右对齐 |
| :--- | :---: | ---: |
| A | B | C |
````

| 左对齐 | 居中 | 右对齐 |
| :--- | :---: | ---: |
| A | B | C |

表格单元格里要写竖线，用 `\|` 转义。

## 链接与图片

````markdown
[链接文字](https://example.com)
![图片说明](assets/pic.jpg)
````

裸链接也会自动变成链接：https://github.com

站内链接可以直接写别的页面的文件名，构建时会自动改成正确的地址：

````markdown
[看看条目模板](template-entry.md)
````

## Wiki 内链

`[[页面文件名]]` 是站内链接的简写，链接文字自动取导航里的标题：

````markdown
[[entry-sample]]
[[entry-sample|换个显示文字]]
[[guide-markdown#表格|跳到表格那一节]]
````

[[entry-sample]]
[[entry-sample|换个显示文字]]
[[guide-markdown#表格|跳到表格那一节]]

## 页首提示

模板库里的提示条，独占一行写名字即可，详见 [[templates]]：

````markdown
{{施工中}}
{{施工中|这页写到一半，先别引用。}}
````

{{施工中|这页写到一半，先别引用。}}

## 脚注

````markdown
这里有个说法[^1]。

[^1]: 出处和补充说明写在这。
````

这里有个说法[^1]。

[^1]: 出处和补充说明写在这。

## 分割线

````markdown
---
````

---

## 原始 HTML

Material 允许直接写 HTML，可以拿来排版或嵌 iframe：

```html
<div style="padding: .6rem 1rem; border-left: 4px solid #ff7043;">
  一段用 HTML 排的说明。
</div>
```

<div style="padding: .6rem 1rem; border-left: 4px solid #ff7043;">
  一段用 HTML 排的说明。
</div>

## 换行与分段

- 空一行 = 新段落。
- 一行末尾敲两个空格，或者写一个 `\`，= 段内换行。
