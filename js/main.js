// Main entry point
let myName = '';

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'gameScreen') {
    setTimeout(() => document.getElementById('gc')?.focus(), 100);
  }
}

function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  const colors = {
    good: ['#166534', '#86efac', '#3fb950'],
    bad: ['#7f1d1d', '#fca5a5', '#f85149'],
    info: ['#1c2a3a', '#93c5fd', '#58a6ff']
  };
  const [bg, fg, bdr] = colors[type] || colors.info;
  el.style.cssText = `background:${bg};color:${fg};border:2px solid ${bdr};`;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

function backToMenu() {
  cleanupPeer();
  if (gameTimer) clearInterval(gameTimer);
  if (timerInterval) clearInterval(timerInterval);
  gameRunning = false;
  players = [];
  foods = [];
  showScreen('menuScreen');
}

function startSinglePlayer() {
  myName = document.getElementById('myName').value.trim() || 'Player';
  isMultiplayer = false;
  isHost = false;
  players = [{
    id: 'single',
    name: myName,
    color: P_COLORS[0],
    score: 0,
    body: [],
    dx: 1, dy: 0,
    ndx: 1, ndy: 0,
    alive: true
  }];
  myIndex = 0;
  initGameState();
  showScreen('gameScreen');
  startGameLoop();
}

function showMultiplayerMenu() {
  myName = document.getElementById('myName').value.trim() || 'Player';
  showScreen('multiplayerMenuScreen');
}

function showHost() {
  myName = document.getElementById('myName').value.trim() || 'Player 1';
  isHost = true;
  isMultiplayer = true;
  showScreen('hostScreen');
  document.getElementById('roomCodeDisplay').textContent = '......';
  document.getElementById('hostStatus').textContent = 'Creating room…';
  
  const code = Math.random().toString(36).substr(2, 6).toUpperCase();
  roomCode = code;
  
  initPeer('SNAKE-' + code, pid => {
    document.getElementById('roomCodeDisplay').textContent = code;
    document.getElementById('hostStatus').textContent = 'Waiting for players to join…';
    players = [{
      id: pid, name: myName, color: P_COLORS[0], score: 0, body: [],
      dx: 1, dy: 0, ndx: 1, ndy: 0, alive: true
    }];
    myIndex = 0;
    renderHostLobby();
  });
  
  peer.on('connection', conn => {
    conn.on('open', () => {
      if (gameRunning || players.length >= 2) {
        conn.send({ type: 'full' });
        conn.close();
        return;
      }
      guestConns[conn.peer] = conn;
      conn.on('data', d => handleGuestMsg(conn.peer, d));
      conn.on('close', () => {
        delete guestConns[conn.peer];
        removePeer(conn.peer);
        renderHostLobby();
      });
      conn.send({
        type: 'hello_back',
        yourIndex: players.length,
        colors: P_COLORS,
        allPlayers: players.map(p => ({ id: p.id, name: p.name, color: p.color }))
      });
    });
    conn.on('data', d => {
      if (d.type === 'hello') {
        addGuest(conn.peer, d.name);
        renderHostLobby();
      }
    });
  });
}

function hostStartGame() {
  if (players.length < 2) return;
  initGameState();
  broadcastAll({ type: 'start', gameState: serializeState() });
  showScreen('gameScreen');
  startGameLoop();
}

function showJoin() {
  myName = document.getElementById('myName').value.trim() || ('Player ' + (Math.floor(Math.random() * 900) + 100));
  isHost = false;
  isMultiplayer = true;
  showScreen('joinScreen');
  document.getElementById('joinStatus').textContent = '';
}

function joinGame() {
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (code.length < 4) {
    showToast('Enter valid room code', 'bad');
    return;
  }
  const st = document.getElementById('joinStatus');
  st.textContent = 'Connecting…';
  
  initPeer(null, pid => {
    myPeerId = pid;
    hostConn = peer.connect('SNAKE-' + code, { reliable: true });
    hostConn.on('open', () => {
      hostConn.send({ type: 'hello', name: myName });
      st.textContent = 'Connected! Waiting for host…';
      st.className = 'status-bar ok';
    });
    hostConn.on('data', d => handleHostMsg(d));
    hostConn.on('close', () => {
      showToast('Disconnected from host', 'bad');
      backToMenu();
    });
  });
}

function copyCode() {
  const code = document.getElementById('roomCodeDisplay').textContent;
  navigator.clipboard.writeText(code).then(() => showToast('Code copied! ' + code, 'good'));
}

function playAgain() {
  if (isMultiplayer && !isHost) {
    showToast('Only the host can restart', 'info');
    return;
  }
  document.getElementById('gameOverlay').style.display = 'none';
  initGameState();
  if (isMultiplayer && isHost) {
    broadcastAll({ type: 'start', gameState: serializeState() });
  }
  startGameLoop();
}

// Mobile controls
function setupMobileControls() {
  const btns = document.querySelectorAll('.ctrl-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const dir = btn.getAttribute('data-dir');
      if (dir) sendDirection(dir);
    });
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const dir = btn.getAttribute('data-dir');
      if (dir) sendDirection(dir);
    });
  });
}

// Keyboard controls
document.addEventListener('keydown', (e) => {
  const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  const dir = map[e.key];
  if (dir && gameRunning && players[myIndex]?.alive) {
    e.preventDefault();
    sendDirection(dir);
  }
});

// Event listeners
document.getElementById('singlePlayerBtn').addEventListener('click', startSinglePlayer);
document.getElementById('multiplayerBtn').addEventListener('click', showMultiplayerMenu);
document.getElementById('hostGameBtn').addEventListener('click', showHost);
document.getElementById('joinGameBtn').addEventListener('click', showJoin);
document.getElementById('backFromMultiBtn').addEventListener('click', backToMenu);
document.getElementById('backFromHostBtn').addEventListener('click', backToMenu);
document.getElementById('backFromJoinBtn').addEventListener('click', backToMenu);
document.getElementById('leaveWaitBtn').addEventListener('click', backToMenu);
document.getElementById('hostStartBtn').addEventListener('click', hostStartGame);
document.getElementById('joinRoomBtn').addEventListener('click', joinGame);
document.getElementById('playAgainBtn').addEventListener('click', playAgain);
document.getElementById('menuBtn').addEventListener('click', backToMenu);
document.getElementById('gc')?.addEventListener('click', () => document.getElementById('gc')?.focus());

// Initialize
initGame();
setupMobileControls();
showScreen('menuScreen');