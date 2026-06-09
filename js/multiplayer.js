// Multiplayer State
let peer = null;
let hostConn = null;
let guestConns = {};
let isHost = false;
let isMultiplayer = false;
let myPeerId = '';
let roomCode = '';

function cleanupPeer() {
  if (gameTimer) clearInterval(gameTimer);
  if (timerInterval) clearInterval(timerInterval);
  gameRunning = false;
  if (peer) {
    try {
      if (hostConn) hostConn.close();
      Object.values(guestConns).forEach(c => c.close());
      peer.destroy();
    } catch (e) { console.error(e); }
  }
  hostConn = null;
  guestConns = {};
  isMultiplayer = false;
}

function initPeer(id, onOpen) {
  cleanupPeer();
  const opts = { host: '0.peerjs.com', port: 443, path: '/', secure: true, debug: 0 };
  peer = id ? new Peer(id, opts) : new Peer(opts);
  peer.on('open', onOpen);
  peer.on('error', e => { showToast('Connection error: ' + e.type, 'bad'); });
}

function serializeState() {
  return {
    players: players.map(p => ({ ...p, body: [...p.body] })),
    foods: [...foods],
    elapsed,
    COLS,
    ROWS,
    invincibleFrames
  };
}

function deserializeState(s) {
  players = s.players;
  foods = s.foods;
  elapsed = s.elapsed;
  COLS = s.COLS;
  ROWS = s.ROWS;
  invincibleFrames = s.invincibleFrames !== undefined ? s.invincibleFrames : false;
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
}

function broadcastAll(msg) {
  Object.values(guestConns).forEach(c => { try { c.send(msg); } catch (e) { } });
}

window.sendDirectionToHost = function(dir) {
  if (isMultiplayer && !isHost && hostConn) {
    hostConn.send({ type: 'dir', dir });
  }
};

function handleGuestMsg(pid, d) {
  if (d.type === 'dir') {
    const idx = players.findIndex(p => p.id === pid);
    if (idx >= 0 && players[idx].alive) {
      const s = players[idx];
      if (d.dir === 'up' && s.dy !== 1) { s.ndx = 0; s.ndy = -1; }
      else if (d.dir === 'down' && s.dy !== -1) { s.ndx = 0; s.ndy = 1; }
      else if (d.dir === 'left' && s.dx !== 1) { s.ndx = -1; s.ndy = 0; }
      else if (d.dir === 'right' && s.dx !== -1) { s.ndx = 1; s.ndy = 0; }
    }
  }
}

function handleHostMsg(d) {
  if (d.type === 'session_ended') {
    showToast('Game session has ended.', 'info');
    backToMenu();
    return;
  }
  if (d.type === 'full') {
    showToast('Room is full!', 'bad');
    backToMenu();
    return;
  }
  if (d.type === 'hello_back') {
    myIndex = d.yourIndex;
    // allPlayers is now always complete (host sends this after 'hello' is processed)
    players = d.allPlayers.map((p, i) => ({
      ...p, score: 0, body: [],
      dx: P_STARTS[i].dx, dy: P_STARTS[i].dy,
      ndx: P_STARTS[i].dx, ndy: P_STARTS[i].dy,
      alive: true
    }));
    showScreen('waitScreen');
    renderWaitLobby();
  }
    if (d.type === 'lobby_update') {
    players = d.players.map((p, i) => ({
      ...p, score: 0, body: [],
      dx: P_STARTS[i].dx, dy: P_STARTS[i].dy,
      ndx: P_STARTS[i].dx, ndy: P_STARTS[i].dy,
      alive: true
    }));
    renderWaitLobby();
  }
  if (d.type === 'start') {
    deserializeState(d.gameState);
    showScreen('gameScreen');
    startGameLoop();
  }
  if (d.type === 'tick') {
    deserializeState(d.gameState);
    renderGame();
    updateHeader();
  }
  if (d.type === 'game_over') {
    deserializeState(d.gameState);
    renderGame();
    showGameOver();
  }
}

function renderHostLobby() {
  const list = document.getElementById('hostPlayerList');
  list.innerHTML = players.map((p, i) => `
    <div class="player-item">
      <div class="player-dot" style="background:${p.color};"></div>
      <div class="player-item-name" style="color:${p.color};">${p.name}</div>
      <div class="player-item-role">${i === 0 ? 'Host' : 'Player ' + (i + 1)}</div>
    </div>
  `).join('');
  
  const btn = document.getElementById('hostStartBtn');
  if (players.length === 1) {
    btn.disabled = true;
    btn.style.opacity = '0.4';
  } else {
    btn.disabled = false;
    btn.style.opacity = '1';
  }
}

function renderWaitLobby() {
  const list = document.getElementById('waitPlayerList');
  list.innerHTML = players.map((p, i) => `
    <div class="player-item">
      <div class="player-dot" style="background:${p.color || P_COLORS[i]};"></div>
      <div class="player-item-name">${p.name}</div>
      <div class="player-item-role">${i === 0 ? 'Host' : 'Player ' + (i + 1)}</div>
    </div>
  `).join('');
  document.getElementById('waitStatus').textContent = `${players.length} player(s) in room`;
}

function addGuest(pid, name) {
  const idx = players.length;
  players.push({
    id: pid, name, color: P_COLORS[idx], score: 0, body: [],
    dx: P_STARTS[idx].dx, dy: P_STARTS[idx].dy,
    ndx: P_STARTS[idx].dx, ndy: P_STARTS[idx].dy,
    alive: true
  });
  // Notify already-connected guests only; the new guest gets the full list via hello_back
  Object.entries(guestConns).forEach(([peerId, c]) => {
    if (peerId !== pid) {
      try { c.send({ type: 'lobby_update', players: players.map(p => ({ id: p.id, name: p.name, color: p.color })) }); } catch (e) {}
    }
  });
  renderHostLobby();
  showToast(name + ' joined! 👋', 'good');
}

function removePeer(pid) {
  players = players.filter(p => p.id !== pid);
  broadcastAll({ type: 'lobby_update', players: players.map(p => ({ id: p.id, name: p.name, color: p.color })) });
}

function endGameSession() {
  // Close all peer connections and invalidate the game session
  if (isHost) {
    // Notify all guests that session is ending
    broadcastAll({ type: 'session_ended' });
  } else {
    // Guest notifies host
    if (hostConn) {
      try {
        hostConn.send({ type: 'session_ended' });
      } catch (e) { }
    }
  }
  
  // Clean up peer connection completely
  cleanupPeer();
  
  // Force back to menu after cleanup
  showToast('Game session ended. Return to menu to play again.', 'info');
  setTimeout(() => {
    showScreen('menuScreen');
  }, 500);
}