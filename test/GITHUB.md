<div align="center">

# 🧩 Widgets

**A fast, tiny library for building composable UI widgets.**

[![Build](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/acme/widgets/actions)
[![Coverage](https://img.shields.io/badge/coverage-98%25-brightgreen)](https://codecov.io/gh/acme/widgets)
[![Version](https://img.shields.io/badge/version-1.4.0-blue)](https://www.npmjs.com/package/widgets)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

[Documentation](https://example.com/docs) ·
[Getting Started](#getting-started) ·
[Examples](https://example.com/examples) ·
[Changelog](CHANGELOG.md)

</div>

---

## Table of contents

- [Features](#features)
- [Getting started](#getting-started)
- [Usage](#usage)
- [Configuration](#configuration)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Features

- ⚡ **Fast** — under 5&nbsp;kB gzipped, zero dependencies.
- 🧱 **Composable** — build complex UIs from small pieces.
- 🌗 **Themeable** — light, dark, and custom themes out of the box.
- 🔒 **Type-safe** — first-class TypeScript types.
- ~~Bloated~~ Minimal by design.

## Getting started

Install with your package manager of choice:

```bash
npm install widgets
# or
pnpm add widgets
# or
yarn add widgets
```

> [!NOTE]
> Widgets requires Node.js 18 or newer. Older versions are not supported.

## Usage

```ts
import { createWidget, mount } from "widgets";

const counter = createWidget({
  state: { count: 0 },
  view: (s) => `Count: ${s.count}`,
  on: {
    click: (s) => ({ count: s.count + 1 }),
  },
});

mount(counter, document.getElementById("app")!);
```

> [!TIP]
> Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> in the playground to open the command menu.

> [!WARNING]
> `mount()` throws if the target element is missing. Guard it in production code.

## Configuration

Options accepted by `createWidget`:

| Option  | Type       | Default   | Description                                   |
| ------- | ---------- | :-------: | --------------------------------------------- |
| `state` | `object`   | `{}`      | Initial state for the widget.                 |
| `view`  | `function` | required  | Renders state to markup.                      |
| `on`    | `object`   | `{}`      | Event handlers returning partial state.       |
| `theme` | `string`   | `"light"` | One of `light`, `dark`, or a custom theme id. |

A raw HTML table (island), for comparison with the GFM table above:

<table>
  <thead>
    <tr><th>Bundle</th><th>Size (min)</th><th>Size (gzip)</th></tr>
  </thead>
  <tbody>
    <tr><td>core</td><td>12.1 kB</td><td>4.8 kB</td></tr>
    <tr><td>core + themes</td><td>18.4 kB</td><td>6.9 kB</td></tr>
  </tbody>
</table>

## Roadmap

- [x] Core widget model
- [x] Theming
- [x] TypeScript types
- [ ] Server-side rendering
- [ ] Animation primitives
  - [x] Tween engine
  - [ ] Spring physics
- [ ] Plugin API

## FAQ

<details>
<summary>Does it work with React / Vue / Svelte?</summary>

Yes. Widgets is framework-agnostic and ships thin adapters for the major
frameworks. See the [adapters guide](https://example.com/docs/adapters) for
details, including **SSR** notes and hydration caveats.

</details>

<details>
<summary>How big is it, really?</summary>

The core is **4.8&nbsp;kB** gzipped. Themes and adapters are opt-in and tree-shakeable.

</details>

## Formulas and footnotes

The layout solver runs in O(n&nbsp;log&nbsp;n)[^bigO], where n is the widget count. Water is H<sub>2</sub>O; energy is E&nbsp;=&nbsp;mc<sup>2</sup>.

[^bigO]: Amortised across a full layout pass; worst case is O(n²) for pathological nesting.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/my-change`.
3. Commit your changes and open a pull request.

<div align="center">

Made with ❤️ by the Widgets team ·
<a href="https://example.com">example.com</a>

</div>

## License

[MIT](LICENSE) © 2026 Acme, Inc.
