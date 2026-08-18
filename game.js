'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS_RETRO = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const COLORS_NEON = [
  null,
  '#00e5ff', // I - electric cyan
  '#ffee00', // O - electric yellow
  '#e040fb', // T - electric magenta
  '#00e676', // S - electric green
  '#ff1744', // Z - electric red
  '#2979ff', // J - electric blue
  '#ff9100', // L - electric orange
];

const COLORS_PASTEL = [
  null,
  '#a8dadc', // I - pastel cyan
  '#fff3b0', // O - pastel yellow
  '#d8bfd8', // T - pastel lilac
  '#b5e2a3', // S - pastel green
  '#f7b2ad', // Z - pastel red
  '#b8d0eb', // J - pastel blue
  '#ffcf9c', // L - pastel orange
];

// El skin "pixel art" reutiliza la paleta retro; la diferencia visual viene
// del patrón de textura dibujado sobre cada bloque, no del color base.
const COLORS_PIXEL = COLORS_RETRO;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let currentSkin = 'retro';

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function shadeColor(hex, percent) {
  let r = parseInt(hex.substring(1, 3), 16);
  let g = parseInt(hex.substring(3, 5), 16);
  let b = parseInt(hex.substring(5, 7), 16);
  r = Math.max(0, Math.min(255, Math.round(r * (100 + percent) / 100)));
  g = Math.max(0, Math.min(255, Math.round(g * (100 + percent) / 100)));
  b = Math.max(0, Math.min(255, Math.round(b * (100 + percent) / 100)));
  const rr = r.toString(16).padStart(2, '0');
  const gg = g.toString(16).padStart(2, '0');
  const bb = b.toString(16).padStart(2, '0');
  return `#${rr}${gg}${bb}`;
}

function roundedRectPath(context, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, w, h, radius);
    return;
  }
  // Fallback manual con arcTo para navegadores sin roundRect().
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

// ---- Skin: Retro (estilo clásico, bloques planos con highlight superior) ----
function drawBlockRetro(context, x, y, colorIndex, size, alpha) {
  const color = COLORS_RETRO[colorIndex];
  context.save();
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.restore();
}

// ---- Skin: Neon (fondo oscuro, glow con shadowBlur/shadowColor) ----
function drawBlockNeon(context, x, y, colorIndex, size, alpha) {
  const color = COLORS_NEON[colorIndex];
  const px = x * size + 2;
  const py = y * size + 2;
  const s = size - 4;
  context.save();
  context.globalAlpha = alpha ?? 1;
  context.shadowBlur = 12;
  context.shadowColor = color;
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  context.shadowBlur = 0;
  context.strokeStyle = 'rgba(255,255,255,0.5)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
  context.restore();
}

// ---- Skin: Pastel (colores suaves, esquinas redondeadas) ----
function drawBlockPastel(context, x, y, colorIndex, size, alpha) {
  const color = COLORS_PASTEL[colorIndex];
  const px = x * size + 2;
  const py = y * size + 2;
  const s = size - 4;
  const radius = 6;
  context.save();
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  roundedRectPath(context, px, py, s, s, radius);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.35)';
  roundedRectPath(context, px, py, s, Math.max(4, s * 0.3), radius);
  context.fill();
  context.restore();
}

// ---- Skin: Pixel art (textura de sub-píxeles sobre el relleno base) ----
function drawBlockPixel(context, x, y, colorIndex, size, alpha) {
  const color = COLORS_PIXEL[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  const cells = 4;
  const cellSize = s / cells;
  const light = shadeColor(color, 30);
  const dark = shadeColor(color, -30);
  context.save();
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  for (let ry = 0; ry < cells; ry++) {
    for (let rx = 0; rx < cells; rx++) {
      // El patrón varía según colorIndex para que cada tipo de pieza se distinga.
      const on = (rx + ry + colorIndex) % 3 === 0;
      if (!on) continue;
      context.fillStyle = (rx + ry) % 2 === 0 ? light : dark;
      context.fillRect(px + rx * cellSize, py + ry * cellSize, cellSize, cellSize);
    }
  }
  context.strokeStyle = 'rgba(0,0,0,0.3)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
  context.restore();
}

const SKINS = {
  retro: { draw: drawBlockRetro },
  neon: { draw: drawBlockNeon },
  pastel: { draw: drawBlockPastel },
  pixel: { draw: drawBlockPixel },
};

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[currentSkin] || SKINS.retro;
  skin.draw(context, x, y, colorIndex, size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function applyTheme(isLight) {
  document.body.classList.toggle('light-theme', isLight);
  themeToggle.checked = isLight;
  localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => applyTheme(themeToggle.checked));
applyTheme(localStorage.getItem('tetris-theme') === 'light');

function applySkin(skinName) {
  if (!SKINS[skinName]) skinName = 'retro';
  currentSkin = skinName;
  document.body.classList.remove('skin-retro', 'skin-neon', 'skin-pastel', 'skin-pixel');
  document.body.classList.add(`skin-${skinName}`);
  skinSelect.value = skinName;
  localStorage.setItem('tetris-skin', skinName);
  // Redibuja de inmediato si el juego ya está inicializado (board existe).
  if (board) {
    draw();
    drawNext();
  }
}

skinSelect.addEventListener('change', () => applySkin(skinSelect.value));
applySkin(localStorage.getItem('tetris-skin') || 'retro');

init();
