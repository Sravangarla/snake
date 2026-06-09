// Game Constants
const CELL = 24;
const TICK = 140;
const P_COLORS = ['#3fb950', '#f472b6', '#fbbf24', '#58a6ff'];
const P_HEAD_COL = ['#7ee787', '#f9a8d4', '#fde68a', '#93c5fd'];
const P_STARTS = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

// HEALTHY FOODS (GROW the snake)
const HEALTHY_ITEMS = [
  { e: '🥗', n: 'Salad', p: 15, g: 2 }, { e: '🍎', n: 'Apple', p: 10, g: 1 },
  { e: '🥑', n: 'Avocado', p: 20, g: 2 }, { e: '🍇', n: 'Grapes', p: 8, g: 1 },
  { e: '🥪', n: 'Sandwich', p: 12, g: 1 }, { e: '☕', n: 'Coffee', p: 10, g: 1 },
  { e: '🍌', n: 'Banana', p: 8, g: 1 }, { e: '🥦', n: 'Broccoli', p: 18, g: 2 },
  { e: '🥕', n: 'Carrot', p: 12, g: 1 }, { e: '🥝', n: 'Kiwi', p: 8, g: 1 },
  { e: '🍊', n: 'Orange', p: 9, g: 1 }
];

// JUNK FOODS (SHRINK the snake)
const JUNK_ITEMS = [
  { e: '💩', n: 'Poop', p: -25, g: -3 }, { e: '🍩', n: 'Donut', p: -10, g: -1 },
  { e: '🗑️', n: 'Trash', p: -15, g: -2 }, { e: '🦠', n: 'Virus', p: -30, g: -3 },
  { e: '🔥', n: 'Fire', p: -20, g: -2 }, { e: '📉', n: 'Downtrend', p: -12, g: -1 },
  { e: '🍕', n: 'Cold Pizza', p: -8, g: -1 }, { e: '🍔', n: 'Burger', p: -10, g: -1 },
  { e: '🍟', n: 'Fries', p: -8, g: -1 }, { e: '🥤', n: 'Soda', p: -5, g: -1 }
];

// Game State
let gameRunning = false;
let gameTimer = null;
let elapsed = 0;
let timerInterval = null;
let players = [];
let myIndex = -1;
let foods = [];
let COLS = 30, ROWS = 24;
let invincibleFrames = false;
let invincibleTimer = null;
let lastDirTime = 0;
let pendingDir = null;

// DOM Elements
let canvas, ctx;

function initGame() {
  canvas = document.getElementById('gc');
  ctx = canvas.getContext('2d');
  calcDims();
}

function calcDims() {
  const header = document.querySelector('.game-header');
  const headerHeight = header ? header.offsetHeight : 60;
  const controls = document.querySelector('.mobile-controls');
  const controlsHeight = (controls && window.innerWidth <= 768) ? 90 : 0;
  const maxHeight = window.innerHeight - headerHeight - controlsHeight - 10;
  const maxWidth = window.innerWidth - 20;
  
  let bestCols = 20, bestRows = 16;
  for (let c = 18; c <= 40; c++) {
    for (let r = 14; r <= 28; r++) {
      if (c * CELL <= maxWidth && r * CELL <= maxHeight) {
        bestCols = c;
        bestRows = r;
      }
    }
  }
  COLS = Math.max(16, Math.min(bestCols, 40));
  ROWS = Math.max(12, Math.min(bestRows, 28));
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
}

function initGameState() {
  calcDims();
  
  players.forEach((p, i) => {
    let sx, sy;
    if (players.length === 1) {
      sx = Math.floor(COLS / 2);
      sy = Math.floor(ROWS / 2);
    } else {
      sx = i === 0 ? Math.floor(COLS * 0.25) : Math.floor(COLS * 0.75);
      sy = Math.floor(ROWS / 2);
    }
    
    const body = [];
    for (let j = 0; j < 5; j++) {
      body.push({ x: sx - (P_STARTS[i].dx * j), y: sy - (P_STARTS[i].dy * j) });
    }
    p.body = body;
    p.dx = P_STARTS[i].dx;
    p.dy = P_STARTS[i].dy;
    p.ndx = P_STARTS[i].dx;
    p.ndy = P_STARTS[i].dy;
    p.score = 0;
    p.alive = true;
  });
  
  foods = [];
  for (let i = 0; i < 8; i++) spawnFood(true);
  for (let i = 0; i < 4; i++) spawnFood(false);
  
  elapsed = 0;
  invincibleFrames = true;
  if (invincibleTimer) clearTimeout(invincibleTimer);
  invincibleTimer = setTimeout(() => { invincibleFrames = false; }, 2000);
}

function spawnFood(healthy) {
  let pos;
  let attempts = 0;
  
  while (attempts < 200) {
    pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    const occupied = players.some(p => p.alive && p.body.some(b => b.x === pos.x && b.y === pos.y)) ||
                     foods.some(f => f.x === pos.x && f.y === pos.y);
    if (!occupied) break;
    attempts++;
  }
  
  const pool = healthy ? HEALTHY_ITEMS : JUNK_ITEMS;
  const it = pool[Math.floor(Math.random() * pool.length)];
  foods.push({ ...pos, ...it, healthy, pulse: Math.random() * Math.PI * 2 });
}

function tick() {
  players.forEach(p => {
    if (!p.alive) return;
    
    p.dx = p.ndx;
    p.dy = p.ndy;
    const head = { x: p.body[0].x + p.dx, y: p.body[0].y + p.dy };
    
    // Wall collision
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      p.alive = false;
      return;
    }
    
    // Self collision
    if (p.body.slice(1).some(b => b.x === head.x && b.y === head.y)) {
      p.alive = false;
      return;
    }
    
    // Other snakes collision
    for (const other of players) {
      if (other === p || !other.alive) continue;
      if (other.body.some(b => b.x === head.x && b.y === head.y)) {
        if (!invincibleFrames) {
          p.alive = false;
          return;
        }
      }
    }
    
    p.body.unshift(head);
    const fi = foods.findIndex(f => f.x === head.x && f.y === head.y);
    
    if (fi >= 0) {
      const f = foods[fi];
      foods.splice(fi, 1);
      p.score = Math.max(0, p.score + f.p);
      
      if (f.healthy) {
        // GROW: Add segments at tail
        const tail = p.body[p.body.length - 1];
        const growAmount = Math.abs(f.g);
        for (let i = 0; i < growAmount; i++) {
          p.body.push({ ...tail });
        }
        showToast(`+${f.p} pts! 🥗 Grew +${growAmount}!`, 'good');
      } else {
        // SHRINK: Remove segments from tail
        const shrinkAmount = Math.abs(f.g);
        let removed = 0;
        for (let i = 0; i < shrinkAmount; i++) {
          if (p.body.length > 3) {
            p.body.pop();
            removed++;
          }
        }
        showToast(`${f.p} pts! 💩 Shrank -${removed}!`, 'bad');
      }
      
      spawnFood(Math.random() > 0.4);
    } else {
      p.body.pop();
    }
  });
  
  if (foods.length < 6) spawnFood(true);
  if (foods.filter(f => !f.healthy).length < 2) spawnFood(false);
}

function applyDirection(s, dir) {
  if (!s || !s.alive) return false;
  if (dir === 'up' && s.dy !== 1) { s.ndx = 0; s.ndy = -1; return true; }
  if (dir === 'down' && s.dy !== -1) { s.ndx = 0; s.ndy = 1; return true; }
  if (dir === 'left' && s.dx !== 1) { s.ndx = -1; s.ndy = 0; return true; }
  if (dir === 'right' && s.dx !== -1) { s.ndx = 1; s.ndy = 0; return true; }
  return false;
}

function sendDirection(dir) {
  const me = players[myIndex];
  if (!me || !me.alive) return;
  
  const now = Date.now();
  if (now - lastDirTime < 50) {
    pendingDir = dir;
    return;
  }
  
  if (applyDirection(me, dir)) {
    lastDirTime = now;
    pendingDir = null;
    if (window.sendDirectionToHost) window.sendDirectionToHost(dir);
  }
}

// Process pending direction
setInterval(() => {
  if (pendingDir && gameRunning) {
    const now = Date.now();
    if (now - lastDirTime >= 50) {
      const me = players[myIndex];
      if (me && me.alive && applyDirection(me, pendingDir)) {
        lastDirTime = now;
        if (window.sendDirectionToHost) window.sendDirectionToHost(pendingDir);
      }
      pendingDir = null;
    }
  }
}, 30);

function renderGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a1220';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Grid
  ctx.strokeStyle = '#0d1f35';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(canvas.width, y * CELL);
    ctx.stroke();
  }
  
  // Foods
  foods.forEach(f => {
    const cx = f.x * CELL + CELL / 2;
    const cy = f.y * CELL + CELL / 2;
    f.pulse = (f.pulse || 0) + 0.08;
    const pulse = 0.88 + Math.sin(f.pulse) * 0.12;
    
    ctx.save();
    ctx.globalAlpha = 0.5 + Math.sin(f.pulse) * 0.25;
    ctx.strokeStyle = f.healthy ? '#3fb950' : '#f85149';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.55 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    
    ctx.fillStyle = f.healthy ? 'rgba(63,185,80,0.18)' : 'rgba(248,81,73,0.18)';
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.font = `${Math.round(CELL * 0.65)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.e, cx, cy + 1);
    
    ctx.font = `bold ${Math.round(CELL * 0.26)}px Nunito,sans-serif`;
    ctx.fillStyle = f.healthy ? '#3fb950' : '#f85149';
    const effect = f.healthy ? `+${f.g}` : `${f.g}`;
    ctx.fillText(effect, cx, cy + CELL * 0.7);
  });
  
  // Snakes
  players.forEach((p, pi) => {
    if (!p.body) return;
    p.body.forEach((seg, i) => {
      ctx.globalAlpha = i === 0 ? 1 : Math.max(0.2, 1 - i / (p.body.length * 1.1));
      ctx.fillStyle = i === 0 ? P_HEAD_COL[pi] : p.color;
      ctx.beginPath();
      if (i === 0) {
        ctx.roundRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2, 6);
      } else {
        ctx.roundRect(seg.x * CELL + 2, seg.y * CELL + 2, CELL - 4, CELL - 4, 4);
      }
      ctx.fill();
      
      if (i === 0) {
        ctx.font = `${CELL - 7}px serif`;
        ctx.fillStyle = 'white';
        ctx.globalAlpha = 0.9;
        ctx.fillText('👁', seg.x * CELL + CELL / 2, seg.y * CELL + CELL / 2);
      }
    });
    
    ctx.globalAlpha = 1;
    if (p.alive && p.body.length > 0) {
      const hx = p.body[0].x * CELL + CELL / 2;
      const hy = p.body[0].y * CELL - 3;
      ctx.font = `bold ${Math.round(CELL * 0.4)}px Nunito,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = P_HEAD_COL[pi];
      ctx.fillText(`${p.name} (${p.body.length})`, hx, hy);
    }
  });
  
  if (invincibleFrames && players[myIndex] && players[myIndex].alive) {
    ctx.font = 'bold 11px Nunito';
    ctx.fillStyle = '#58a6ff';
    ctx.shadowBlur = 6;
    ctx.fillText('🛡️ INVINCIBLE', 10, 25);
    ctx.shadowBlur = 0;
  }
}

function updateHeader() {
  const hdrScores = document.getElementById('hdrScores');
  hdrScores.innerHTML = players.map((p, i) => `
    <div class="hdr-score">
      <div class="hdr-dot" style="background:${p.color};${!p.alive ? 'opacity:.3' : ''}"></div>
      <span style="color:${p.color};">${p.name}</span>
      <span style="font-family:'Fredoka One',cursive;">${p.score}</span>
      <span class="hdr-len">📏${p.body?.length || 0}</span>
      ${!p.alive ? '💀' : ''}
    </div>
  `).join('');
  
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  document.getElementById('hdrTime').textContent = `${m}:${String(s).padStart(2, '0')}`;
}

function showGameOver() {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  document.getElementById('goTitle').textContent = players.length > 1 ? (sorted[0].name + ' Wins! 🏆') : 'Game Over!';
  document.getElementById('goResults').innerHTML = sorted.map((p, i) => `
    <div class="result-row">
      <div class="result-medal">${medals[i]}</div>
      <div class="result-name" style="color:${p.color};">${p.name}</div>
      <div class="result-score">${p.score} pts</div>
      <div class="result-len">📏${p.body?.length || 0}</div>
    </div>
  `).join('');
  document.getElementById('gameOverlay').style.display = 'flex';
}

function startGameLoop() {
  calcDims();
  renderGame();
  updateHeader();
  
  clearInterval(gameTimer);
  clearInterval(timerInterval);
  gameRunning = true;
  elapsed = 0;
  
  timerInterval = setInterval(() => {
    elapsed++;
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    document.getElementById('hdrTime').textContent = `${m}:${String(s).padStart(2, '0')}`;
  }, 1000);
  
  gameTimer = setInterval(() => {
    if (!gameRunning) return;
    tick();
    foods.forEach(f => f.pulse = (f.pulse || 0) + 0.15);
    const alive = players.filter(p => p.alive).length;
    
    if (alive === 0) {
      gameRunning = false;
      clearInterval(gameTimer);
      clearInterval(timerInterval);
      showGameOver();
    } else {
      renderGame();
      updateHeader();
    }
  }, TICK);
}