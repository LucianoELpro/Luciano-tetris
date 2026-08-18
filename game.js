'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

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
const startBtn = document.getElementById('start-btn');
const themeToggle = document.getElementById('theme-toggle');
const highscorePanel = document.getElementById('highscore-panel');
const highscoreListEl = document.getElementById('highscore-list');
const bestStatsEl = document.getElementById('best-stats');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const resetScoresBtn = document.getElementById('reset-scores-btn');

const HS_KEY = 'tetris-highscores';
const BEST_COMBO_KEY = 'tetris-best-combo';
const BEST_LINES_KEY = 'tetris-best-lines';
const MAX_HIGHSCORES = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, started, comboThisGame;

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
    if (cleared > comboThisGame) comboThisGame = cleared;
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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

// ---- Tabla de records (localStorage) ----

function loadHighscores() {
  try {
    const raw = localStorage.getItem(HS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(e => e && typeof e.name === 'string' && typeof e.score === 'number');
  } catch (e) {
    return [];
  }
}

function saveHighscores(list) {
  localStorage.setItem(HS_KEY, JSON.stringify(list));
}

function loadBestStat(key) {
  const raw = localStorage.getItem(key);
  const n = raw !== null ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

function saveBestStat(key, value) {
  localStorage.setItem(key, String(value));
}

function qualifiesForHighscore(s) {
  const list = loadHighscores();
  if (list.length < MAX_HIGHSCORES) return true;
  return s > Math.min(...list.map(e => e.score));
}

function renderHighscores(highlightIndex) {
  const list = loadHighscores();
  highscoreListEl.innerHTML = '';
  if (list.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Sin records aún';
    li.className = 'highscore-empty';
    highscoreListEl.appendChild(li);
  } else {
    list.forEach((entry, i) => {
      const li = document.createElement('li');
      const entryLines = entry.lines || 0;
      const entryCombo = entry.combo || 0;
      li.textContent = `${i + 1}. ${entry.name} — ${entry.score.toLocaleString()} pts (L${entryLines} / C${entryCombo})`;
      if (i === highlightIndex) li.classList.add('highscore-highlight');
      highscoreListEl.appendChild(li);
    });
  }
  bestStatsEl.textContent = `Mejor combo: ${loadBestStat(BEST_COMBO_KEY)} líneas | Máx. líneas en una partida: ${loadBestStat(BEST_LINES_KEY)}`;
}

function saveNewScore() {
  const raw = (nameInput.value || '').trim().slice(0, 12);
  const name = raw || 'Jugador';
  const list = loadHighscores();
  const entry = { name, score, lines, combo: comboThisGame };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_HIGHSCORES);
  saveHighscores(trimmed);
  nameEntry.classList.add('hidden');
  const idx = trimmed.indexOf(entry);
  renderHighscores(idx);
}

function resetHighscores() {
  localStorage.removeItem(HS_KEY);
  localStorage.removeItem(BEST_COMBO_KEY);
  localStorage.removeItem(BEST_LINES_KEY);
  renderHighscores();
}

let resetConfirmTimeout = null;
function handleResetClick() {
  if (resetScoresBtn.dataset.confirming === 'true') {
    clearTimeout(resetConfirmTimeout);
    resetScoresBtn.dataset.confirming = 'false';
    resetScoresBtn.textContent = 'Resetear records';
    resetHighscores();
  } else {
    resetScoresBtn.dataset.confirming = 'true';
    resetScoresBtn.textContent = '¿Seguro? Click de nuevo';
    resetConfirmTimeout = setTimeout(() => {
      resetScoresBtn.dataset.confirming = 'false';
      resetScoresBtn.textContent = 'Resetear records';
    }, 3000);
  }
}

function showStartScreen() {
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  nameEntry.classList.add('hidden');
  highscorePanel.classList.remove('hidden');
  startBtn.classList.remove('hidden');
  restartBtn.classList.add('hidden');
  renderHighscores();
  overlay.classList.remove('hidden');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  if (comboThisGame > loadBestStat(BEST_COMBO_KEY)) {
    saveBestStat(BEST_COMBO_KEY, comboThisGame);
  }
  if (lines > loadBestStat(BEST_LINES_KEY)) {
    saveBestStat(BEST_LINES_KEY, lines);
  }

  startBtn.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  highscorePanel.classList.remove('hidden');

  if (qualifiesForHighscore(score)) {
    nameEntry.classList.remove('hidden');
    nameInput.value = '';
    renderHighscores();
    overlay.classList.remove('hidden');
    nameInput.focus();
  } else {
    nameEntry.classList.add('hidden');
    renderHighscores();
    overlay.classList.remove('hidden');
  }
}

function togglePause() {
  if (!started || gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    nameEntry.classList.add('hidden');
    highscorePanel.classList.add('hidden');
    startBtn.classList.add('hidden');
    restartBtn.classList.add('hidden');
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
  started = true;
  comboThisGame = 0;
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
  if (!started || paused || gameOver) return;
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
startBtn.addEventListener('click', init);
saveScoreBtn.addEventListener('click', saveNewScore);
nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    saveNewScore();
  }
});
resetScoresBtn.addEventListener('click', handleResetClick);

function applyTheme(isLight) {
  document.body.classList.toggle('light-theme', isLight);
  themeToggle.checked = isLight;
  localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => applyTheme(themeToggle.checked));
applyTheme(localStorage.getItem('tetris-theme') === 'light');

showStartScreen();
