---
title: Markdown Feature Test
author: Test Suite
date: 2026-07-17
tags: [markdown, test, review]
---

# Markdown Feature Test

A single-file sweep of the Markdown features the editor should handle. Use it to eyeball headings, inline styles, lists, code, tables, links, images, and embedded HTML. The YAML block above tests frontmatter preservation.

## Headings

### Heading level 3

#### Heading level 4

##### Heading level 5

###### Heading level 6

![](TEST%20copy.assets/image-1.png)

Setext heading level 1
======================

Setext heading level 2
----------------------

## Paragraphs & line breaks

This is a normal paragraph with enough text to wrap across a couple of lines, so you can check line height and soft wrapping in the editor pane. Nothing special here — just prose.

This is a second paragraph. The blank line above separates it from the first.

A hard line break follows this sentence.\
This line should sit directly beneath the previous one (backslash break).

Two trailing spaces also force a break.  
Like this.

## Inline formatting

**Bold text**, *italic text*, and ***bold italic***.

Also _underscore italic_ and __underscore bold__.

~~Strikethrough~~ (GFM).

Inline `code span`, e.g. `const x = 1;`.

Escaped characters: \*not italic\*, \_not underscore\_, and a literal backtick: \`.

Sub / superscript via HTML: H<sub>2</sub>O and E = mc<sup>2</sup>.

Keyboard hint: press <kbd>Ctrl</kbd>+<kbd>S</kbd> to save.

Highlighted <mark>marked text</mark> (HTML).

Mixed nesting: **bold with *nested italic* inside** and *italic with **nested bold** inside*.

## Links

Inline link: [Example](https://example.com).

Link with title: [hover me](https://example.com "A link title").

Autolink: <https://example.com>.

Bare URL in text: visit https://example.com for more.

Reference link: [reference style][ref].

Relative link to a sibling file: [DEV notes](./DEV.md).

Anchor to a heading in this doc: [jump to Tables](#tables).

[ref]: https://example.com/reference

## Images

Inline image with title:

![Placeholder](https://placehold.co/600x160 "600x160 placeholder")

Reference-style image:

![Reference image][img]

[img]: https://placehold.co/320x100

## Lists

Unordered (dash), with nesting:

- First item
- Second item
  - Nested item
  - Another nested
    - Deeper still
- Third item

Alternate bullet markers:

* Star marker
+ Plus marker

Ordered, with nesting:

1. First
2. Second
   1. Nested ordered
   2. Second nested
3. Third

Ordered starting at 5:

5. Five
6. Six

Task list (GFM checkboxes):

- [x] Completed task
- [ ] Incomplete task
- [ ] Another to-do
  - [x] Nested done
  - [ ] Nested pending

Loose list (blank lines between items):

- Item one, in its own paragraph.

- Item two, also spaced out.

## Blockquotes

> A simple blockquote.

> A multi-line blockquote
> that continues on the next line.

> Nested:
>
> > This is nested inside the quote.
>
> Back to the outer level.

> A quote containing **bold**, *italic*, `code`, and a list:
>
> - one
> - two

## Code blocks

Fenced JavaScript:

```js
function greet(name) {
  return `Hello, ${name}!`;
}
console.log(greet("world"));
```

Fenced Python:

```python
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

Fenced with no language:

```
plain preformatted text
  preserves    spacing
```

Indented code block (four spaces):

    const indented = true;
    // still a code block

## Tables

Simple table:

| Name  | Role       | Active |
| ----- | ---------- | ------ |
| Ada   | Author     | Yes    |
| Linus | Maintainer | No     |
| Grace | Reviewer   | Yes    |

Column alignment (left, center, right):

| Left        | Center | Right |
| :---------- | :----: | ----: |
| a           | b      | c     |
| longer cell | middle | 42    |

Inline formatting inside cells:

| Feature | Example                     |
| ------- | --------------------------- |
| Bold    | **bold**                    |
| Code    | `code`                      |
| Link    | [link](https://example.com) |

## Horizontal rules

Three dashes:

---

Three asterisks:

***

Three underscores:

___

## Embedded HTML

A raw HTML block (should pass through untouched):

<div style="padding: 8px; border: 1px solid gray;">
  This is an HTML block with a <strong>bold</strong> child.
</div>

A collapsible section:

<details>
<summary>Click to expand</summary>

Hidden content revealed on expand. Supports **markdown** inside on GitHub.

</details>

## Footnotes (GFM)

Here is a statement with a footnote.[^1] And here is another.[^note]

[^1]: The first footnote definition.
[^note]: A named footnote with a bit more detail.

## Edge cases

Emoji shortcodes (GFM): :rocket: :white_check_mark: :warning:

Unicode emoji directly: 🚀 ✅ ⚠️

A very long inline code span to test wrapping: `this-is-a-really-long-identifier-that-should-not-break-in-the-middle-abcdefghijklmnopqrstuvwxyz`.

Multiple blank lines follow this line (in a source-of-truth editor they are preserved, not collapsed):




End of the multiple-blank-line test.

---

*End of test document.*
