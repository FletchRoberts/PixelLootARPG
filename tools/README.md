# tools

- `pixel-forge.html` — seeded procedural sprite generator exposing `window.PixelGen`.
  Open it in a browser to browse seeds/themes. The game also loads its
  `<script id="core">` block at runtime (`src/client/art/sprites.ts`), so keep that
  block dependency-free and keep its id.
