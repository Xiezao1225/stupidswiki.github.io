---
notice:
  - type: note
    title: 这是 note
    text: 补充说明用，比如适用范围或前提条件。
  - type: tip
    title: 这是 tip
    text: 小技巧、推荐做法这一类。
  - type: warning
    title: 这是 warning
    text: 有坑、或者内容还没写完。
  - type: danger
    title: 这是 danger
    text: 危险操作、会造成不可逆后果的那类提醒。
  - 施工中: 沙盒永远在施工，别在这页找稳定性。
---
# 沙盒

这一页就是拿来做实验的：想试什么语法，直接在这儿写，写坏了删掉就行。

上面五条是**提示条**：前四条手写了 `type`/`title`/`text`，最后一条是直接调用模板库里的 `施工中` 并换了一句说明。两种写法都见 [[guide-notice]]，全部模板见 [[templates]]。

## 试一试

- 加粗 `**这样**`，斜体 `*这样*`，删除线 `~~这样~~`
- 内链：[[home]]、[[guide-markdown|Markdown 速查]]
- 外链：https://github.com
- 不存在的页：[[a-page-that-does-not-exist]]
- 模板：`{{施工中}}`

## 一段代码

```python
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

print([fib(i) for i in range(10)])
```

## 提示块

原生写法：

!!! danger "小心"
    提示块里的内容也会正常渲染：**加粗**、`代码`、[[home|链接]] 都可以。

GitHub 写法：

> [!danger] 小心
> 这条会被 `hooks/wiki.py` 自动转成上面的样子。

## 一张表

| 试的东西 | 结果 | 备注 |
| :--- | :---: | :--- |
| 表格 | 正常 | 支持对齐 |
| 任务列表 | 正常 | 勾选框点不动 |
| 嵌套列表 | 正常 | 缩进两个空格 |

## 随便写
