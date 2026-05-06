# TeXMark PDF Reader

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/zed-org.texmark-pdf-reader?color=darkblue&logo=visual%20studio%20code&logoColor=007acc)][vsc-marketplace]
[![Open VSX Version](https://img.shields.io/open-vsx/v/zed-org/texmark-pdf-reader?color=darkgreen&label=Open%20VSX)][open-vsx]
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Fast PDF reading with annotations, Auto Save support, and SyncTeX navigation for LaTeX projects in VS Code and Cursor.

TeXMark is built on PDFium WASM and the EmbedPDF viewer stack. It focuses on the workflow of reading generated PDFs, marking them up, and jumping back to the corresponding LaTeX source.

## Features

- Annotate PDFs with highlights, text notes, shapes, ink, stamps, signatures, and form tools.
- Mark PDFs dirty when annotations change, so VS Code and Cursor Auto Save can persist edits normally.
- Save explicitly with `Ctrl+S` or `Cmd+S` when Auto Save is disabled.
- Choose single page, two page, or advanced spread layouts.
- Use `Cmd+click` on macOS or `Ctrl+click` on Windows/Linux in the PDF to reverse SyncTeX back to the matching `.tex` source.
- Run `TeXMark PDF Reader: SyncTeX to TeXMark PDF Reader` from a `.tex` editor to jump from source to PDF.
- Tune initial render behavior with buffer and tile size settings.

## Settings

- `texmarkPdfReader.defaultZoomLevel`: Initial PDF zoom level.
- `texmarkPdfReader.defaultPageLayout`: `single`, `two-page`, or `advanced`.
- `texmarkPdfReader.defaultSpreadMode`: Advanced spread mode used when page layout is `advanced`.
- `texmarkPdfReader.tabBar`: Controls the internal tab bar.
- `texmarkPdfReader.renderBufferSize`: Number of nearby pages kept rendered around the viewport.
- `texmarkPdfReader.renderTileSize`: Tile size for page rendering.

## SyncTeX

Reverse SyncTeX requires a `.synctex.gz` file next to the PDF and the `synctex` command on your PATH. If you use LaTeX Workshop, TeXMark also respects `latex-workshop.synctex.path`.

For reverse navigation, open the generated PDF with TeXMark and `Cmd+click` or `Ctrl+click` the PDF location you want to inspect. TeXMark will ask SyncTeX for the matching source position and open that `.tex` file.

## Development

```sh
npm install
npm run build
npx vsce package
```

The VSIX contains the compiled extension host code in `dist/`, webview runtime assets in `media/`, docs, license, README, and the extension icon.

## Publishing

- VS Code Marketplace: [zed-org.texmark-pdf-reader][vsc-marketplace]
- Open VSX and Cursor: [zed-org/texmark-pdf-reader][open-vsx]

Publishing requires a VS Code Marketplace publisher token for `zed-org` and an Open VSX token for the same namespace.

## Credits

TeXMark started from the MIT licensed Modern PDF Preview extension and keeps its foundation on PDFium WASM and EmbedPDF. Thanks to the EmbedPDF project and PDFium binaries maintainers for the underlying rendering stack.

License: MIT

[vsc-marketplace]: https://marketplace.visualstudio.com/items?itemName=zed-org.texmark-pdf-reader
[open-vsx]: https://open-vsx.org/extension/zed-org/texmark-pdf-reader
