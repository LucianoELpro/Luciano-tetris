# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A playable Tetris implementation in vanilla JavaScript, HTML5 Canvas, and CSS. No dependencies, no build step, no package.json.

## Running the game

Open `index.html` directly in a browser, or serve it statically:

```bash
python3 -m http.server 8000
# or
npx serve .
```

There is no build, lint, or test tooling in this repo — changes to `game.js`/`index.html`/`style.css` are effective immediately on reload.

## Architecture

Three files, all logic lives in `game.js` (~300 lines, no modules):

- **`index.html`** — DOM shell: `#board` canvas (300×600, 10×20 cells at `BLOCK=30`px), `#next-canvas` for the piece preview, HUD spans (`#score`, `#lines`, `#level`), and the pause/game-over `#overlay`.
- **`style.css`** — dark/retro arcade visual theme.
- **`game.js`** — entire game model and loop:
  - Board is a `ROWS × COLS` matrix where each cell is `0` (empty) or a color index `1–7` identifying which piece locked there. `COLORS[]` and `PIECES[]` are parallel arrays indexed by piece type.
  - Pieces rotate via `rotateCW` (transpose + reverse). `tryRotate` applies wall kicks by testing offsets `[0, -1, 1, -2, 2]` before giving up on the rotation.
  - `collide(shape, ox, oy)` is the single collision check used for movement, rotation, and ghost-piece projection.
  - The game loop (`loop`, driven by `requestAnimationFrame`) accumulates elapsed time and advances the piece one row once `dropAccum >= dropInterval`.
  - `lockPiece()` → `merge()` (writes the piece into `board`) → `clearLines()` (scans bottom-up, splices full rows, unshifts empty ones, updates score/level/`dropInterval`) → `spawn()` (promotes `next` to `current`, generates a new `next`, and calls `endGame()` if the new piece immediately collides).
  - Scoring uses `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop adds 2 pts/row dropped, soft drop 1 pt/row. Level increments every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)`.
  - All rendering (board, ghost piece at `globalAlpha=0.2`, current piece, next-piece preview) happens in `draw()`/`drawNext()` via the shared `drawBlock()` helper.
  - Input is a single `keydown` listener switching on `e.code` (arrows + `KeyX` rotate + `Space` hard drop + `KeyP` pause).

There are no ES modules — all state (`board`, `current`, `next`, `score`, etc.) is module-level `let`/`const` shared across functions.

## Tunable constants (in `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS×BLOCK` by `ROWS×BLOCK`).
