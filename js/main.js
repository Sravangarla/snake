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
      conn.on('close', () => {
        delete guestConns[conn.peer];
        removePeer(conn.peer);
        renderHostLobby();
      });
      // hello_back is sent AFTER receiving 'hello' so allPlayers is complete
    });
    conn.on('data', d => {
      if (d.type === 'hello') {
        addGuest(conn.peer, d.name);
        renderHostLobby();
        // Now send hello_back with the fully-populated player list
        const guestIndex = players.findIndex(p => p.id === conn.peer);
        conn.send({
          type: 'hello_back',
          yourIndex: guestIndex,
          colors: P_COLORS,
          allPlayers: players.map(p => ({ id: p.id, name: p.name, color: p.color }))
        });
      } else if (d.type === 'dir') {
        handleGuestMsg(conn.peer, d);
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
  
  // Clear overlay immediately
  const overlay = document.getElementById('gameOverlay');
  overlay.style.display = 'none';
  overlay.innerHTML = '';
  
  // Reset all game state
  foods = [];
  tickCount = 0;
  elapsed = 0;
  gameRunning = false;
  
  // Reinitialize game state
  initGameState();
  
  // Broadcast new game start to guests
  if (isMultiplayer && isHost) {
    broadcastAll({ type: 'start', gameState: serializeState() });
  }
  
  // Start fresh game loop
  startGameLoop();
}

function endGameSession() {
  // Forward to multiplayer module
  if (typeof window.endGameSession === 'function') {
    window.endGameSession();
  }
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

// Initialize game first before attaching listeners
initGame();
setupMobileControls();

// Event listeners - only attach to elements that exist in static HTML
const singlePlayerBtn = document.getElementById('singlePlayerBtn');
const multiplayerBtn = document.getElementById('multiplayerBtn');
const hostGameBtn = document.getElementById('hostGameBtn');
const joinGameBtn = document.getElementById('joinGameBtn');
const backFromMultiBtn = document.getElementById('backFromMultiBtn');
const backFromHostBtn = document.getElementById('backFromHostBtn');
const backFromJoinBtn = document.getElementById('backFromJoinBtn');
const leaveWaitBtn = document.getElementById('leaveWaitBtn');
const hostStartBtn = document.getElementById('hostStartBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const gcCanvas = document.getElementById('gc');

if (singlePlayerBtn) singlePlayerBtn.addEventListener('click', startSinglePlayer);
if (multiplayerBtn) multiplayerBtn.addEventListener('click', showMultiplayerMenu);
if (hostGameBtn) hostGameBtn.addEventListener('click', showHost);
if (joinGameBtn) joinGameBtn.addEventListener('click', showJoin);
if (backFromMultiBtn) backFromMultiBtn.addEventListener('click', backToMenu);
if (backFromHostBtn) backFromHostBtn.addEventListener('click', backToMenu);
if (backFromJoinBtn) backFromJoinBtn.addEventListener('click', backToMenu);
if (leaveWaitBtn) leaveWaitBtn.addEventListener('click', backToMenu);
if (hostStartBtn) hostStartBtn.addEventListener('click', hostStartGame);
if (joinRoomBtn) joinRoomBtn.addEventListener('click', joinGame);
if (gcCanvas) gcCanvas.addEventListener('click', () => document.getElementById('gc')?.focus());

// Note: playAgainBtn and menuBtn are created dynamically in showGameOver()
// so we don't attach listeners to them here

showScreen('menuScreen');