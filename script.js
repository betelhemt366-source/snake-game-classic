// ==========================================
// 🎬 SPLASH SYSTEM & MENU SYSTEM
// ==========================================

const State = {
  SPLASH: 'SPLASH',
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  GAMEOVER: 'GAMEOVER',
  DESIGN_STUDIO: 'DESIGN_STUDIO'
};

let currentState = State.SPLASH;
let soundEnabled = true;
let currentMode = 'solo'; // 'solo', 'duet', or 'online'
let socket = null;
let roomId = null;
let playerIndex = null;
let opponentName = "";
let matchmakingTimer = null;
let matchmakingSecs = 0;
let botCount = 6;
let activeGame = null;

// --- UI TRANSITIONS ---
function transitionTo(state) {
  currentState = state;
  
  // Remove 'active' class from all screens
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  
  // Add 'active' class to the correct screen
  if (state === State.SPLASH) {
    document.getElementById('splash-screen').classList.add('active');
  } else if (state === State.MENU) {
    document.getElementById('main-menu').classList.add('active');
  } else if (state === State.PLAYING) {
    document.getElementById('game-screen').classList.add('active');
  } else if (state === State.GAMEOVER) {
    document.getElementById('game-over-screen').classList.add('active');
  } else if (state === State.DESIGN_STUDIO) {
    document.getElementById('design-studio-screen').classList.add('active');
    initDesignStudio();
  }
}

// --- SOUND FX MANAGER (8-Bit Synthesizer) ---
class SoundFX {
  constructor() {
    this.ctx = null;
  }
  
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }
  
  playClick() {
    if (!soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.08);
    
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }
  
  playEat() {
    if (!soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.setValueAtTime(390, now + 0.04);
    osc.frequency.setValueAtTime(520, now + 0.08);
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(now + 0.12);
  }

  playCrash() {
    if (!soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);
    
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(now + 0.5);
  }

  playBoost() {
    if (!soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
    
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(now + 0.04);
  }
}

const sfx = new SoundFX();

// --- INITIALIZE & ATTACH EVENTS ---
window.addEventListener('load', () => {
  // 1. Splash Sequence: Fade out splash screen after 2.5 seconds
  setTimeout(() => {
    transitionTo(State.MENU);
  }, 2500);

  // 2. Menu Event Listeners
  const startBtn = document.getElementById('start-btn');
  const soundToggle = document.getElementById('sound-toggle');
  const modeControl = document.getElementById('mode-control');

  // Sound FX Enable checkbox
  soundToggle.addEventListener('change', (e) => {
    soundEnabled = e.target.checked;
    sfx.playClick();
  });

  // Helper to update start button text
  function updateStartButtonText() {
    if (currentMode === 'solo') {
      startBtn.textContent = 'Start VS AI Battle';
    } else if (currentMode === 'duet') {
      startBtn.textContent = 'Start Local PVP Co-op';
    } else if (currentMode === 'online') {
      startBtn.textContent = 'Find Online Opponent';
    }
  }

  // Initialize button text
  updateStartButtonText();

  // Game Mode select
  modeControl.querySelectorAll('.segment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modeControl.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.value;
      sfx.playClick();
      updateStartButtonText();
    });
  });

  // Start button triggers Game State Manager
  startBtn.addEventListener('click', () => {
    sfx.playClick();
    if (currentMode === 'online') {
      startOnlineMatchmaking();
    } else {
      startGameFlow();
    }
  });

  // Design Studio button triggers Design Studio Screen
  document.getElementById('studio-btn').addEventListener('click', () => {
    sfx.playClick();
    transitionTo(State.DESIGN_STUDIO);
  });

  // Cancel matchmaking button
  document.getElementById('cancel-matchmaking-btn').addEventListener('click', () => {
    sfx.playClick();
    cancelMatchmaking();
  });

  // Play vs AI fallback button
  document.getElementById('matchmaking-ai-btn').addEventListener('click', () => {
    sfx.playClick();
    cancelMatchmaking();
    currentMode = 'solo';
    modeControl.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    const soloBtn = modeControl.querySelector('[data-value="solo"]');
    if (soloBtn) soloBtn.classList.add('active');
    updateStartButtonText();
    startGameFlow();
  });

  // 3. Game Over Actions
  document.getElementById('restart-btn').addEventListener('click', () => {
    sfx.playClick();
    if (currentMode === 'online') {
      startOnlineMatchmaking();
    } else {
      startGameFlow();
    }
  });

  document.getElementById('menu-btn').addEventListener('click', () => {
    sfx.playClick();
    transitionTo(State.MENU);
  });
});

// --- ONLINE MULTIPLAYER MATCHMAKING FLOW ---
function startOnlineMatchmaking() {
  const overlay = document.getElementById('matchmaking-overlay');
  const timerSpan = document.getElementById('matchmaking-timer');
  const aiBtn = document.getElementById('matchmaking-ai-btn');
  
  overlay.classList.add('active');
  aiBtn.style.display = 'none';
  
  matchmakingSecs = 0;
  timerSpan.textContent = '0s';
  
  if (matchmakingTimer) clearInterval(matchmakingTimer);
  matchmakingTimer = setInterval(() => {
    matchmakingSecs++;
    timerSpan.textContent = `${matchmakingSecs}s`;
    
    // After 5 seconds, offer fallback to play vs AI Bot
    if (matchmakingSecs >= 5) {
      aiBtn.style.display = 'block';
    }
  }, 1000);

  // Close any existing socket
  if (socket) {
    socket.close();
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  socket = new WebSocket(wsUrl);

  const nicknames = [
    "Neon Cobra ⚡", "Cyber Viper 🎯", "Laser Python 🌐", 
    "Grid Rattler 🐍", "Pixel Anaconda 🧱", "Retro Mamba 🕹️",
    "Digital Basilisk 🐉", "Bit Copperhead 💥"
  ];
  const randomName = nicknames[Math.floor(Math.random() * nicknames.length)];

  socket.onopen = () => {
    socket.send(JSON.stringify({
      type: "join_matchmaking",
      id: 'player_' + Math.floor(Math.random() * 1000000),
      name: randomName
    }));
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case "waiting_for_opponent":
          console.log("Joined queue. Waiting for opponent...");
          break;

        case "match_start": {
          // Opponent found!
          clearInterval(matchmakingTimer);
          overlay.classList.remove('active');
          
          roomId = data.roomId;
          playerIndex = data.playerIndex;
          opponentName = data.opponentName;
          window.onlineInitialFoods = data.foods;
          
          startGameFlow();
          break;
        }

        case "opponent_update":
          if (activeGame && activeGame.updateOpponent) {
            activeGame.updateOpponent(data);
          }
          break;

        case "food_update":
          if (activeGame && activeGame.updateFood) {
            activeGame.updateFood(data.foodIndex, data.newFood);
          }
          break;

        case "food_bulk_added":
          if (activeGame && activeGame.addDroppedFoods) {
            activeGame.addDroppedFoods(data.drops);
          }
          break;

        case "match_over":
          if (activeGame && activeGame.forceGameOver) {
            const won = data.loserIndex !== playerIndex;
            const reason = data.reason;
            activeGame.forceGameOver(won, won ? "Opponent was trapped!" : `You crashed: ${reason}`);
          }
          break;

        case "opponent_disconnected":
          if (activeGame && activeGame.forceGameOver) {
            activeGame.forceGameOver(true, data.message);
          }
          break;
      }
    } catch (err) {
      console.error("Error processing websocket message", err);
    }
  };

  socket.onclose = () => {
    console.log("WebSocket closed");
    clearInterval(matchmakingTimer);
  };

  socket.onerror = (err) => {
    console.error("WebSocket error", err);
  };
}

function cancelMatchmaking() {
  const overlay = document.getElementById('matchmaking-overlay');
  overlay.classList.remove('active');
  clearInterval(matchmakingTimer);
  
  if (socket) {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: "cancel_matchmaking" }));
      } catch (e) {}
    }
    socket.close();
    socket = null;
  }
}

// Starts the game playing state
function startGameFlow() {
  transitionTo(State.PLAYING);
  
  // Clean up existing game if any
  if (activeGame) {
    activeGame.teardown();
  }
  
  // Create and run new game
  activeGame = createGame();
}


// ==========================================
// 🧩 CORE ENGINE RULE (ALL GAMEPLAY HERE)
// ==========================================

function createGame() {
  // Only game logic variables & configuration here
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  
  let isPaused = false;
  let gameActive = true;
  let animFrameId = null;
  let lastTime = 0;
  
  // Performance timer to maintain 60 FPS
  const targetFps = 60;
  const frameInterval = 1000 / targetFps;
  
  // Arena Definition
  const arenaWidth = 800;
  const arenaHeight = 800;

  // Layout scaling variables for static arena
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let matchTicks = 0;
  
  // Camera State
  const camera = {
    x: 0,
    y: 0,
    zoom: 1,
    targetZoom: 1
  };
  
  // Game Collections
  let snakes = [];
  let foods = [];
  let particles = [];
  
  // HUD Elements
  const hudScore = document.getElementById('hud-score');
  const leaderboardList = document.getElementById('leaderboard-list');
  const hudPauseBtn = document.getElementById('hud-pause-btn');
  const hudSoundBtn = document.getElementById('hud-sound-btn');
  const pauseModal = document.getElementById('pause-modal');
  const resumeBtn = document.getElementById('resume-btn');
  const pauseQuitBtn = document.getElementById('pause-quit-btn');
  
  // Sound controls on HUD
  const speakerIcon = document.getElementById('speaker-icon');
  
  function updateSoundHudState() {
    if (soundEnabled) {
      speakerIcon.querySelector('.sound-wave').style.display = 'block';
    } else {
      speakerIcon.querySelector('.sound-wave').style.display = 'none';
    }
  }
  updateSoundHudState();
  
  hudSoundBtn.onclick = (e) => {
    e.stopPropagation();
    soundEnabled = !soundEnabled;
    updateSoundHudState();
    sfx.playClick();
  };
  
  // Pause Menu actions
  hudPauseBtn.onclick = (e) => {
    e.stopPropagation();
    togglePause();
  };
  
  resumeBtn.onclick = () => {
    togglePause();
  };
  
  pauseQuitBtn.onclick = () => {
    togglePause();
    teardown();
    transitionTo(State.MENU);
  };
  
  function togglePause() {
    isPaused = !isPaused;
    sfx.playClick();
    if (isPaused) {
      pauseModal.classList.add('active');
    } else {
      pauseModal.classList.remove('active');
      lastTime = performance.now(); // reset delta timer
    }
  }

  // Mobile touch controls container
  const touchControls = document.getElementById('game-touch-controls');
  const boostBtn = document.getElementById('boost-btn');
  
  // Check if touch device or mobile layout to display mobile controls overlay
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (isTouchDevice || window.innerWidth < 1024) {
    touchControls.style.display = 'flex';
  } else {
    touchControls.style.display = 'none';
  }

  // --- BOT NAME REGISTRY ---
  const botNames = [
    "Viper-Bot 🐍", "Cobra-Bot 👑", "Anaconda 🐉", "Copperhead", 
    "Sidewinder", "Black Mamba", "Python AI 🤖", "Naga-Bot", 
    "Basilisk", "Rattler"
  ];
  
  // --- COLOR SCHEMES ---
  const colors = {
    player: {
      head: '#39ff14', // neon green
      body: '#059669', // emerald
      glow: 'rgba(57, 255, 20, 0.4)'
    },
    player2: {
      head: '#00f0ff', // neon blue
      body: '#0284c7', // light blue
      glow: 'rgba(0, 240, 255, 0.4)'
    },
    bots: [
      { head: '#ff007f', body: '#9d174d', glow: 'rgba(255, 0, 127, 0.4)' }, // hot pink
      { head: '#bd00ff', body: '#6b21a8', glow: 'rgba(189, 0, 255, 0.4)' }, // purple
      { head: '#fffb00', body: '#b45309', glow: 'rgba(255, 251, 0, 0.4)' }, // yellow
      { head: '#ff5e00', body: '#c2410c', glow: 'rgba(255, 94, 0, 0.4)' },  // orange
      { head: '#00ffcc', body: '#0f766e', glow: 'rgba(0, 255, 204, 0.4)' }   // cyan
    ]
  };

  // --- INITIALIZATION ---
  
  // Resize handler
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Create Snakes based on the mode
  let p1 = null;
  let p2 = null;

  if (currentMode === 'online') {
    if (playerIndex === 0) {
      p1 = createSnake({
        id: 'p1',
        name: 'You (P1)',
        x: 200,
        y: 400,
        angle: 0,
        colorScheme: colors.player,
        isPlayer: true
      });
      p2 = createSnake({
        id: 'p2',
        name: opponentName || 'Opponent (P2)',
        x: 600,
        y: 400,
        angle: Math.PI,
        colorScheme: colors.player2,
        isPlayer2: true // Opponent snake
      });
    } else {
      p1 = createSnake({
        id: 'p1',
        name: 'You (P2)',
        x: 600,
        y: 400,
        angle: Math.PI,
        colorScheme: colors.player2,
        isPlayer: true
      });
      p2 = createSnake({
        id: 'p2',
        name: opponentName || 'Opponent (P1)',
        x: 200,
        y: 400,
        angle: 0,
        colorScheme: colors.player,
        isPlayer2: true // Opponent snake
      });
    }
    snakes.push(p1);
    snakes.push(p2);
  } else {
    // Create Player 1 (Spawn on left, facing right)
    p1 = createSnake({
      id: 'p1',
      name: 'You (P1)',
      x: arenaWidth * 0.25,
      y: arenaHeight * 0.5,
      angle: 0,
      colorScheme: colors.player,
      isPlayer: true
    });
    snakes.push(p1);

    // If Duet mode, spawn Player 2 (Spawn on right, facing left)
    if (currentMode === 'duet') {
      p2 = createSnake({
        id: 'p2',
        name: 'Player 2 (P2)',
        x: arenaWidth * 0.75,
        y: arenaHeight * 0.5,
        angle: Math.PI,
        colorScheme: colors.player2,
        isPlayer2: true
      });
      snakes.push(p2);
    } else {
      // VS AI: Spawn exactly 1 smart AI Rival Bot (Spawn on right, facing left)
      const scheme = colors.bots[Math.floor(Math.random() * colors.bots.length)];
      const name = "Shadow Viper 🤖";
      snakes.push(createSnake({
        id: 'bot_0',
        name: name,
        x: arenaWidth * 0.75,
        y: arenaHeight * 0.5,
        angle: Math.PI,
        colorScheme: scheme,
        isBot: true
      }));
    }
  }

  // Spawn Initial Food Orbs (Optimized for 2-player arena spacing)
  if (currentMode === 'online' && window.onlineInitialFoods) {
    foods = [...window.onlineInitialFoods];
  } else {
    foods = [];
    const foodCount = 70;
    for (let i = 0; i < foodCount; i++) {
      spawnFood();
    }
  }

  // --- CONTROLLER BINDINGS ---
  
  // 1. Keyboard Controls
  const keys = {};
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  
  function handleKeyDown(e) {
    keys[e.code] = true;
    
    // Space bar activates boost for Player 1
    if (e.code === 'Space') {
      p1.boostActive = true;
    }
    
    // Player 2 Boost key (ShiftLeft or Enter)
    if (p2 && (e.code === 'ShiftRight' || e.code === 'Enter')) {
      p2.boostActive = true;
    }
  }
  
  function handleKeyUp(e) {
    keys[e.code] = false;
    
    if (e.code === 'Space') {
      p1.boostActive = false;
    }
    
    if (p2 && (e.code === 'ShiftRight' || e.code === 'Enter')) {
      p2.boostActive = false;
    }
  }

  // 2. Touch Interaction (Tap/Drag steering)
  let touchActive = false;
  let touchStartPos = { x: 0, y: 0 };
  
  // Touch Drag on Canvas steers snake in that direction
  canvas.addEventListener('touchstart', (e) => {
    if (isPaused || !gameActive) return;
    e.preventDefault();
    touchActive = true;
    const t = e.touches[0];
    touchStartPos = { x: t.clientX, y: t.clientY };
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (isPaused || !gameActive) return;
    e.preventDefault();
    if (!touchActive) return;
    const t = e.touches[0];
    
    // Calculate steer vector relative to drag start
    const dx = t.clientX - touchStartPos.x;
    const dy = t.clientY - touchStartPos.y;
    
    // Set player's angle if drag displacement is meaningful
    if (Math.hypot(dx, dy) > 8) {
      p1.targetAngle = Math.atan2(dy, dx);
      // Continuous re-centering to allow continuous sliding steering
      touchStartPos = { x: t.clientX, y: t.clientY };
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    touchActive = false;
  }, { passive: false });

  // 3. Virtual D-Pad Click steering (Alternative Mobile option)
  const dpadUp = document.getElementById('dpad-up');
  const dpadDown = document.getElementById('dpad-down');
  const dpadLeft = document.getElementById('dpad-left');
  const dpadRight = document.getElementById('dpad-right');

  function triggerDpadDir(angle, btnEl) {
    p1.targetAngle = angle;
    btnEl.classList.add('active');
    setTimeout(() => btnEl.classList.remove('active'), 150);
  }

  dpadUp.addEventListener('touchstart', (e) => { e.stopPropagation(); triggerDpadDir(-Math.PI / 2, dpadUp); }, { passive: true });
  dpadDown.addEventListener('touchstart', (e) => { e.stopPropagation(); triggerDpadDir(Math.PI / 2, dpadDown); }, { passive: true });
  dpadLeft.addEventListener('touchstart', (e) => { e.stopPropagation(); triggerDpadDir(Math.PI, dpadLeft); }, { passive: true });
  dpadRight.addEventListener('touchstart', (e) => { e.stopPropagation(); triggerDpadDir(0, dpadRight); }, { passive: true });

  // 4. Boost Button (Held state for Touch UI)
  boostBtn.addEventListener('touchstart', (e) => {
    e.stopPropagation();
    e.preventDefault();
    p1.boostActive = true;
    sfx.playBoost();
  });
  
  boostBtn.addEventListener('touchend', (e) => {
    e.stopPropagation();
    p1.boostActive = false;
  });

  // Desktop mouse steer (Smooth mouse cursor tracking relative to player screen position)
  window.addEventListener('mousemove', handleMouseMove);
  function handleMouseMove(e) {
    if (isPaused || !gameActive || isTouchDevice) return;
    if (!p1 || !p1.segments || !p1.segments[0]) return;
    
    // Calculate P1's screen coordinates
    const playerHead = p1.segments[0];
    const playerScreenX = playerHead.x * scale + offsetX;
    const playerScreenY = playerHead.y * scale + offsetY;
    
    const dx = e.clientX - playerScreenX;
    const dy = e.clientY - playerScreenY;
    
    p1.targetAngle = Math.atan2(dy, dx);
  }

  // --- FACTORY CREATORS ---

  // Helper to create snake object
  function createSnake(config) {
    const spacing = 6.5; // Distance between segments (smaller for tighter gameplay)
    const initialLength = 18;
    
    const s = {
      id: config.id,
      name: config.name,
      x: config.x,
      y: config.y,
      angle: config.angle,
      targetAngle: config.angle,
      colorScheme: config.colorScheme,
      isPlayer: !!config.isPlayer,
      isPlayer2: !!config.isPlayer2,
      isBot: !!config.isBot,
      speed: 3.2,
      boostActive: false,
      score: 100,
      length: initialLength,
      segments: [],
      eliminations: 0,
      isDead: false,
      turnRate: 0.08, // Radians per frame
      timeAlive: 0,
      lastBoostParticle: 0
    };

    // Populate initial segment chain straight back
    for (let i = 0; i < s.length; i++) {
      s.segments.push({
        x: s.x - Math.cos(s.angle) * i * spacing,
        y: s.y - Math.sin(s.angle) * i * spacing
      });
    }

    return s;
  }

  // Helper to spawn a food item
  function spawnFood(droppedAt = null) {
    let x, y, val, color, radius, isOrb;

    if (droppedAt) {
      // High-value orb dropped by dying rival
      x = droppedAt.x + (Math.random() * 40 - 20);
      y = droppedAt.y + (Math.random() * 40 - 20);
      val = 40;
      radius = 8 + Math.random() * 4;
      isOrb = true;
      
      // Multi-colored flashy orbs
      const colorsPool = ['#39ff14', '#00f0ff', '#ff007f', '#bd00ff', '#fffb00'];
      color = colorsPool[Math.floor(Math.random() * colorsPool.length)];
    } else {
      // Standard naturally spawning food with boundary padding
      x = Math.random() * (arenaWidth - 40) + 20;
      y = Math.random() * (arenaHeight - 40) + 20;
      val = 10;
      radius = 4 + Math.random() * 2;
      isOrb = false;
      
      const colorsPool = ['#ff4da6', '#bd00ff', '#39ff14', '#00f0ff', '#fffb00', '#ff9900'];
      color = colorsPool[Math.floor(Math.random() * colorsPool.length)];
    }

    foods.push({ x, y, val, color, radius, isOrb, pulse: Math.random() * Math.PI });
  }

  // Helper to spawn visual explosion particles
  function spawnExplosion(x, y, color) {
    const numParticles = 12;
    for (let i = 0; i < numParticles; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 2;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: color,
        radius: Math.random() * 4 + 2,
        alpha: 1,
        life: 0,
        maxLife: Math.random() * 20 + 20
      });
    }
  }

  // --- CORE GAME LOOP ---

  function gameLoop(timestamp) {
    if (!gameActive) return;
    
    animFrameId = requestAnimationFrame(gameLoop);
    
    if (isPaused) return;

    // Throttle frames to target speed
    const elapsed = timestamp - lastTime;
    if (elapsed < frameInterval) return;
    
    // Keep timing consistent
    lastTime = timestamp - (elapsed % frameInterval);

    update();
    render();
  }

  // --- CORE UPDATE LOGIC ---

  function update() {
    // 1. Update Keyboard target direction vectors
    updatePlayerKeyboardDirections();

    matchTicks += 1;

    // 2. Physics & Logic updates for all Snakes
    for (let i = 0; i < snakes.length; i++) {
      const s = snakes[i];
      if (s.isDead) continue;

      // In online mode, the opponent's snake (p2) is fully updated via WebSocket messages.
      // So we skip local physics/movement/AI updates for them on our screen.
      if (currentMode === 'online' && s === p2) {
        continue;
      }
      
      s.timeAlive += 1;

      // Bot intelligence steer adjustments
      if (s.isBot) {
        runBotAI(s);
      }

      // Dynamic uniform speed ramping: slow at first, then smoothly becomes a little fast after 3 seconds (180 frames)
      const startSpeed = 1.6;
      const normalSpeed = 3.4;
      let baseSpeed;
      if (matchTicks < 180) {
        // Linear interpolation from startSpeed to normalSpeed over 180 frames (synchronized globally)
        const t = matchTicks / 180;
        baseSpeed = startSpeed + (normalSpeed - startSpeed) * t;
      } else {
        baseSpeed = normalSpeed;
      }

      // Speed boost consumption
      let currentSpeed = baseSpeed;
      if (s.boostActive && s.score > 30) {
        currentSpeed *= 1.85;
        s.score -= 0.15; // consume score during speed boost
        
        // Spawn glowing engine trail particles
        s.lastBoostParticle++;
        if (s.lastBoostParticle % 5 === 0) {
          foods.push({
            x: s.segments[s.segments.length - 1].x + (Math.random() * 10 - 5),
            y: s.segments[s.segments.length - 1].y + (Math.random() * 10 - 5),
            val: 5,
            radius: 3,
            color: s.colorScheme.head,
            isOrb: false,
            pulse: 0
          });
        }
      }

      // Smooth interpolation of angle towards targetAngle
      let diff = s.targetAngle - s.angle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      
      s.angle += Math.sign(diff) * Math.min(Math.abs(diff), s.turnRate);
      
      // Move Head segment
      const head = s.segments[0];
      const prevHeadX = head.x;
      const prevHeadY = head.y;
      
      head.x += Math.cos(s.angle) * currentSpeed;
      head.y += Math.sin(s.angle) * currentSpeed;

      // Handle Arena Boundaries collisions
      if (head.x < 0 || head.x > arenaWidth || head.y < 0 || head.y > arenaHeight) {
        killSnake(s, "Crashed into the energy barrier!");
        continue;
      }

      // Follower segments physics (Smooth spacing)
      const spacing = 6.5;
      for (let j = 1; j < s.segments.length; j++) {
        const seg = s.segments[j];
        const leader = s.segments[j - 1];
        
        const dx = seg.x - leader.x;
        const dy = seg.y - leader.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist > spacing) {
          const ratio = spacing / dist;
          seg.x = leader.x + dx * ratio;
          seg.y = leader.y + dy * ratio;
        }
      }

      // Dynamically adjust physical length of segment array to fit current score
      const targetSegmentsCount = Math.floor(18 + s.score / 15);
      if (s.segments.length < targetSegmentsCount) {
        // Grow tail segment
        const tail = s.segments[s.segments.length - 1];
        s.segments.push({ x: tail.x, y: tail.y });
      } else if (s.segments.length > targetSegmentsCount && s.segments.length > 10) {
        // Shrink tail segment
        s.segments.pop();
      }
      
      s.length = s.segments.length;

      // 3. Check Food collisions
      checkFoodCollisions(s);
    }

    // 4. Snake vs Snake Collision checking
    checkSnakeCollisions();

    // 5. Update background particle elements
    updateParticles();

    // 6. Camera layout: Fixed scale and offset to keep playing box static and centered
    scale = Math.min(canvas.width / arenaWidth, canvas.height / arenaHeight) * 0.95;
    offsetX = (canvas.width - arenaWidth * scale) / 2;
    offsetY = (canvas.height - arenaHeight * scale) / 2;

    camera.zoom = scale;
    camera.x = -offsetX / scale;
    camera.y = -offsetY / scale;

    // 7. Render scoreboard HUD
    hudScore.textContent = String(Math.floor(p1.score)).padStart(4, '0');
    updateLeaderboardHud();

    // In online mode, send local player update to the server
    if (currentMode === 'online' && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "player_update",
        roomId,
        segments: p1.segments,
        angle: p1.angle,
        score: p1.score,
        boostActive: p1.boostActive
      }));
    }
  }

  // Keyboard P1 / P2 directions translator
  function updatePlayerKeyboardDirections() {
    // Player 1 WSAD steers
    let dx = 0;
    let dy = 0;
    if (keys['KeyW']) dy = -1;
    if (keys['KeyS']) dy = 1;
    if (keys['KeyA']) dx = -1;
    if (keys['KeyD']) dx = 1;
    
    if (dx !== 0 || dy !== 0) {
      p1.targetAngle = Math.atan2(dy, dx);
    }

    // Player 2 Arrow keys steers
    if (p2) {
      let dx2 = 0;
      let dy2 = 0;
      if (keys['ArrowUp']) dy2 = -1;
      if (keys['ArrowDown']) dy2 = 1;
      if (keys['ArrowLeft']) dx2 = -1;
      if (keys['ArrowRight']) dx2 = 1;
      
      if (dx2 !== 0 || dy2 !== 0) {
        p2.targetAngle = Math.atan2(dy2, dx2);
      }
    }
  }

  // --- BOT AI MECHANICS ---
  function runBotAI(bot) {
    const head = bot.segments[0];
    
    // Periodically search nearest foods or make decisions
    if (Math.random() < 0.06) {
      // 1. Search for nearest food orb
      let nearestFood = null;
      let minDist = 300; // Search vision radius
      
      for (let i = 0; i < foods.length; i++) {
        const f = foods[i];
        const dist = Math.hypot(f.x - head.x, f.y - head.y);
        if (dist < minDist) {
          minDist = dist;
          nearestFood = f;
        }
      }
      
      if (nearestFood) {
        bot.targetAngle = Math.atan2(nearestFood.y - head.y, nearestFood.x - head.x);
      } else {
        // Wander around randomly
        if (Math.random() < 0.2) {
          bot.targetAngle += (Math.random() * 2 - 1) * 0.8;
        }
      }
    }

    // 2. SENSORS: Collision avoidance system (CRITICAL for realism)
    const sensorDist = 140; // Vision ray distance
    const checkAngles = [0, -Math.PI / 4, Math.PI / 4, -Math.PI / 2, Math.PI / 2];
    let collisionThreat = false;
    let avoidAngle = 0;

    for (const offset of checkAngles) {
      const rayAngle = bot.angle + offset;
      const rx = head.x + Math.cos(rayAngle) * sensorDist;
      const ry = head.y + Math.sin(rayAngle) * sensorDist;

      // Check barrier threat
      if (rx < 80 || rx > arenaWidth - 80 || ry < 80 || ry > arenaHeight - 80) {
        collisionThreat = true;
        avoidAngle = bot.angle + Math.PI + (Math.random() * 0.4 - 0.2); // Turn around
        break;
      }

      // Check other snakes body threat
      for (let s of snakes) {
        if (s.isDead) continue;
        
        // Skip self-collisions on sensor rays
        const startIdx = (s.id === bot.id) ? 10 : 0;
        
        for (let idx = startIdx; idx < s.segments.length; idx += 3) {
          const seg = s.segments[idx];
          const dist = Math.hypot(rx - seg.x, ry - seg.y);
          if (dist < 18) {
            collisionThreat = true;
            // Evade away from the collision direction
            avoidAngle = bot.angle - offset + (Math.random() * 0.5 - 0.25);
            break;
          }
        }
        if (collisionThreat) break;
      }
      if (collisionThreat) break;
    }

    if (collisionThreat) {
      bot.targetAngle = avoidAngle;
    }
  }

  // --- COLLISION SYSTEMS ---

  function checkFoodCollisions(snake) {
    // In online mode, we only check food collisions for our own local player snake,
    // and notify the server to synchronize eating.
    if (currentMode === 'online') {
      if (!snake.isPlayer) return;
      const head = snake.segments[0];
      const headRadius = 8.5;
      
      for (let i = foods.length - 1; i >= 0; i--) {
        const f = foods[i];
        const dist = Math.hypot(f.x - head.x, f.y - head.y);
        
        if (dist < headRadius + f.radius) {
          // Tell server we ate this food index
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              type: "eat_food",
              roomId,
              foodIndex: i
            }));
          }
        }
      }
      return;
    }

    const head = snake.segments[0];
    const headRadius = 8.5;
    
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      const dist = Math.hypot(f.x - head.x, f.y - head.y);
      
      if (dist < headRadius + f.radius) {
        // Consume food item
        snake.score += f.val;
        
        // Audio sound trigger if actual Player eats
        if (snake.isPlayer) {
          sfx.playEat();
        }
        
        foods.splice(i, 1);
        
        // Replace eaten item
        spawnFood();
      }
    }
  }

  function checkSnakeCollisions() {
    for (let i = 0; i < snakes.length; i++) {
      const s1 = snakes[i];
      if (s1.isDead) continue;
      
      const head = s1.segments[0];
      const headRadius = 8;
      
      for (let j = 0; j < snakes.length; j++) {
        const s2 = snakes[j];
        if (s2.isDead) continue;

        // Skip self checks at head indices, but allow colliding into your own body after segment 10
        const startIdx = (s1.id === s2.id) ? 12 : 0;

        for (let idx = startIdx; idx < s2.segments.length; idx++) {
          const seg = s2.segments[idx];
          const dist = Math.hypot(head.x - seg.x, head.y - seg.y);
          
          if (dist < headRadius + 5) {
            // S1 head crashed into S2 body!
            const reason = s1.id === s2.id 
              ? "Crashed into your own tail!" 
              : `Got trapped by ${s2.name}!`;
            
            // Log elimination reward to killer
            if (s1.id !== s2.id) {
              s2.eliminations++;
              s2.score += 150; // Bonus score for trap kill
            }

            killSnake(s1, reason);
            break;
          }
        }
        if (s1.isDead) break;
      }
    }
  }

  function killSnake(snake, reason) {
    snake.isDead = true;
    sfx.playCrash();
    
    // Spawn explosions at head
    const head = snake.segments[0];
    spawnExplosion(head.x, head.y, snake.colorScheme.head);
    
    // Convert body length to high-value glowing food drops
    // Every 3rd body segment drops food
    const drops = [];
    const colorsPool = ['#39ff14', '#00f0ff', '#ff007f', '#bd00ff', '#fffb00'];
    for (let i = 0; i < snake.segments.length; i += 3) {
      const seg = snake.segments[i];
      if (currentMode === 'online') {
        drops.push({
          x: seg.x + (Math.random() * 40 - 20),
          y: seg.y + (Math.random() * 40 - 20),
          val: 40,
          radius: 8 + Math.random() * 4,
          isOrb: true,
          color: colorsPool[Math.floor(Math.random() * colorsPool.length)],
          pulse: Math.random() * Math.PI
        });
      } else {
        spawnFood(seg);
      }
    }

    if (currentMode === 'online') {
      if (snake.isPlayer) {
        // Send game over to server
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "game_over",
            roomId,
            loserIndex: playerIndex,
            reason: reason
          }));
          socket.send(JSON.stringify({
            type: "drop_food_bulk",
            roomId,
            drops
          }));
        }
      }
    } else {
      if (currentMode === 'duet') {
        if (snake.isPlayer) {
          // Player 1 died
          endGame("Player 2 Wins! 👑", `Player 1 (You) was eliminated: ${reason}`);
        } else if (snake.isPlayer2) {
          // Player 2 died
          endGame("Player 1 Wins! 👑", `Player 2 was eliminated: ${reason}`);
        }
      } else {
        if (snake.isPlayer) {
          // Player 1 died in VS AI
          endGame("Defeat! 💀", `You were eliminated: ${reason}`);
        } else if (snake.isBot) {
          // Bot died in VS AI
          endGame("Victory! 👑", `You successfully defeated the Rival Bot!`);
        }
      }
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.95; // friction
      p.vy *= 0.95;
      p.life++;
      p.alpha = 1 - (p.life / p.maxLife);
      
      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
      }
    }
  }

  // --- RENDER FUNCTIONS ---

  function render() {
    // Fill outer background with ultra dark solid tone
    ctx.fillStyle = '#020408';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    // Scale and scroll camera relative to follow subject
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Draw solid inner background of the playing arena box
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, arenaWidth, arenaHeight);

    // 1. Draw glowing outer Arena Borders (high-contrast dual neon border)
    ctx.strokeStyle = '#00f0ff'; // Neon Cyan
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, arenaWidth, arenaHeight);
    
    ctx.strokeStyle = '#ffffff'; // Crisp Inner White Border
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, arenaWidth - 6, arenaHeight - 6);
    
    // Clear shadow styles for performance
    ctx.shadowBlur = 0;

    // 2. Draw subtle tech Grid Pattern
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
    ctx.lineWidth = 1.0;
    const gridStep = 80;
    
    // Optimize: only render grid lines near viewport
    const viewLeft = camera.x;
    const viewRight = camera.x + canvas.width / camera.zoom;
    const viewTop = camera.y;
    const viewBottom = camera.y + canvas.height / camera.zoom;

    const startGridX = Math.max(0, Math.floor(viewLeft / gridStep) * gridStep);
    const endGridX = Math.min(arenaWidth, Math.ceil(viewRight / gridStep) * gridStep);
    const startGridY = Math.max(0, Math.floor(viewTop / gridStep) * gridStep);
    const endGridY = Math.min(arenaHeight, Math.ceil(viewBottom / gridStep) * gridStep);

    for (let x = startGridX; x <= endGridX; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, startGridY);
      ctx.lineTo(x, endGridY);
      ctx.stroke();
    }
    for (let y = startGridY; y <= endGridY; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(startGridX, y);
      ctx.lineTo(endGridX, y);
      ctx.stroke();
    }

    // 3. Draw Background particles
    for (let p of particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0; // reset

    // 4. Draw Food items (pulsing & glowing)
    for (let f of foods) {
      // Viewport culling check
      if (f.x < viewLeft - 20 || f.x > viewRight + 20 || f.y < viewTop - 20 || f.y > viewBottom + 20) {
        continue;
      }

      f.pulse += 0.05;
      const sizeOffset = Math.sin(f.pulse) * (f.isOrb ? 1.5 : 0.6);
      const radius = Math.max(2, f.radius + sizeOffset);

      if (f.isOrb) {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = f.color;
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 5. Draw Snakes from tail to head
    for (let s of snakes) {
      if (s.isDead) continue;

      const segments = s.segments;
      const length = segments.length;
      
      // Draw Body
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      for (let j = length - 1; j >= 1; j--) {
        const seg = segments[j];
        // Optimize viewport culling for body segments
        if (seg.x < viewLeft - 30 || seg.x > viewRight + 30 || seg.y < viewTop - 30 || seg.y > viewBottom + 30) {
          continue;
        }

        // Taper body segment size down towards tail
        const scale = 1.0 - (j / length) * 0.45;
        const radius = 6.5 * scale;
        
        ctx.fillStyle = s.colorScheme.body;
        ctx.beginPath();
        ctx.arc(seg.x, seg.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Striped pattern effect on alternate body parts
        if (j % 3 === 0) {
          ctx.fillStyle = s.colorScheme.head;
          ctx.beginPath();
          ctx.arc(seg.x, seg.y, radius * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw Head
      const head = segments[0];
      ctx.fillStyle = s.colorScheme.head;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 8.5, 0, Math.PI * 2);
      ctx.fill();

      // Eyes Drawing pointing in direction of movement
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(s.angle);

      // Eye whites
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(4.2, -3.6, 2.8, 0, Math.PI * 2);
      ctx.arc(4.2, 3.6, 2.8, 0, Math.PI * 2);
      ctx.fill();

      // Pupils
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(5.4, -3.6, 1.2, 0, Math.PI * 2);
      ctx.arc(5.4, 3.6, 1.2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
      
      // Render Label of Snake Name above head
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.name, head.x, head.y - 14);
      ctx.restore();
    }

    ctx.restore();
  }

  // --- LIVE LEADERBOARD (Classic IO style ranking list) ---
  function updateLeaderboardHud() {
    // Sort snakes descending by score
    const ranked = [...snakes].sort((a, b) => b.score - a.score);
    
    leaderboardList.innerHTML = '';
    
    // Display top 5 active rankings
    for (let i = 0; i < Math.min(5, ranked.length); i++) {
      const s = ranked[i];
      if (s.isDead) continue;
      
      const item = document.createElement('div');
      item.className = 'leaderboard-item';
      if (s.isPlayer) {
        item.classList.add('player');
      }
      
      item.innerHTML = `
        <span class="name">${i+1}. ${s.name}</span>
        <span class="val">${Math.floor(s.score)}</span>
      `;
      leaderboardList.appendChild(item);
    }
  }

  // --- GAME END FLOW ---

  function endGame(title, reason) {
    gameActive = false;
    cancelAnimationFrame(animFrameId);
    
    // Log Statistics to game over panel
    document.getElementById('gameover-title').textContent = title;
    document.getElementById('gameover-reason').textContent = reason;
    document.getElementById('stat-score').textContent = String(Math.floor(p1.score)).padStart(4, '0');
    document.getElementById('stat-length').textContent = p1.length;
    document.getElementById('stat-kills').textContent = p1.eliminations;
    
    // Translate frames to survived MM:SS string
    const secs = Math.floor(p1.timeAlive / 60);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    document.getElementById('stat-time').textContent = `${m}:${String(s).padStart(2, '0')}`;

    // Show Game Over UI overlay screen
    setTimeout(() => {
      transitionTo(State.GAMEOVER);
      teardown();
    }, 1500);
  }

  // --- CLEANUP (Prevent events/loops leak on reload) ---

  function teardown() {
    gameActive = false;
    cancelAnimationFrame(animFrameId);
    
    // Unbind listeners
    window.removeEventListener('resize', resizeCanvas);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('mousemove', handleMouseMove);
  }

  // Auto-boot Game loop thread
  lastTime = performance.now();
  animFrameId = requestAnimationFrame(gameLoop);

  // Return controllers to state manager
  return {
    teardown: teardown,
    updateOpponent: function(data) {
      if (!p2) return;
      p2.segments = data.segments;
      p2.angle = data.angle;
      p2.score = data.score;
      p2.boostActive = data.boostActive;
    },
    updateFood: function(foodIndex, newFood) {
      if (foodIndex >= 0 && foodIndex < foods.length) {
        foods.splice(foodIndex, 1);
      }
      if (newFood) {
        foods.push(newFood);
      }
      sfx.playEat();
    },
    addDroppedFoods: function(drops) {
      foods.push(...drops);
    },
    forceGameOver: function(win, reason) {
      if (win) {
        p1.eliminations++;
        endGame("Victory! 👑", reason);
      } else {
        endGame("Defeat! 💀", reason);
      }
    }
  };
}

// ==========================================
// 🎨 AXUMIT DESIGN STUDIO (GRAPHICS TASK SYSTEM)
// ==========================================

let studioInitialized = false;
let renderPosterFn = null;

function initDesignStudio() {
  const canvas = document.getElementById('poster-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Interactive configurations
  let activeType = 'release'; // 'release' | 'announcement' | 'credit'
  let activeRatio = 'vertical'; // 'vertical' | 'square'
  let activePlatform = 'poster'; // 'poster' | 'instagram' | 'telegram' | 'banner' | 'splash'
  let activeVariant = 'cyber_grid'; // 'cyber_grid' | 'snake_arena' | 'retro_retro' | 'hyper_minimal'

  // Input elements
  const inputTitle = document.getElementById('input-game-title');
  const inputTagline = document.getElementById('input-game-tagline');
  const inputPlatform = document.getElementById('input-game-platform');
  const inputDesigner = document.getElementById('input-designer-tag');
  const selectVariant = document.getElementById('select-visual-variant');

  // Trigger elements
  const toast = document.getElementById('toast');
  const specModal = document.getElementById('spec-modal');
  const helperLines = document.getElementById('grid-helper-lines');

  // Update layout grid container class based on active ratio
  function updateLayoutRatio() {
    const mockupFrame = document.getElementById('mockup-frame-outer');
    if (activeRatio === 'square') {
      canvas.width = 1080;
      canvas.height = 1080;
      mockupFrame.style.aspectRatio = '1 / 1';
      mockupFrame.style.maxWidth = '440px';
      mockupFrame.style.maxHeight = '440px';
    } else {
      canvas.width = 1080;
      canvas.height = 1920;
      mockupFrame.style.aspectRatio = '9 / 16';
      mockupFrame.style.maxWidth = '380px';
      mockupFrame.style.maxHeight = '675px';
    }
    
    // Hide helper lines when social overlay is active to keep mockups clean
    if (activePlatform !== 'poster') {
      helperLines.classList.remove('visible');
    } else {
      helperLines.classList.add('visible');
    }
  }

  // Real-time canvas procedural poster render engine
  function renderPoster() {
    const w = canvas.width;
    const h = canvas.height;
    
    // Reset/Clear canvas with mandatory solid #0A0A0A background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    // Dynamic scale helper
    const sc = w / 1080;

    // --- PROCEDURAL BACKGROUND VISUALS ---
    ctx.save();
    if (activeVariant === 'cyber_grid') {
      // 1. Draw 3D Cyber Perspective Grid
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
      ctx.lineWidth = 2 * sc;
      
      const horizonY = h * 0.55;
      const gridCount = 20;
      
      // Vertical receding lines
      for (let i = 0; i <= gridCount; i++) {
        const startX = (w / gridCount) * i;
        ctx.beginPath();
        ctx.moveTo(startX, h);
        ctx.lineTo(w / 2 + (startX - w / 2) * 0.15, horizonY);
        ctx.stroke();
      }
      
      // Horizontal lines with perspective spacing
      let currentY = h;
      let step = 60 * sc;
      while (currentY > horizonY) {
        ctx.beginPath();
        ctx.moveTo(0, currentY);
        ctx.lineTo(w, currentY);
        ctx.stroke();
        currentY -= step;
        step *= 0.85; // Recede
      }

      // Neon horizon glow
      const grad = ctx.createLinearGradient(0, horizonY - 100 * sc, 0, horizonY + 100 * sc);
      grad.addColorStop(0, 'rgba(189, 0, 255, 0)');
      grad.addColorStop(0.5, 'rgba(189, 0, 255, 0.25)');
      grad.addColorStop(1, 'rgba(0, 240, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, horizonY - 100 * sc, w, 200 * sc);

      // Cyber particle stars
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 40; i++) {
        const starX = (Math.sin(i * 382.2) * 0.5 + 0.5) * w;
        const starY = (Math.cos(i * 928.1) * 0.5 + 0.5) * (horizonY - 20 * sc);
        const starSize = (Math.sin(i * 12.3) * 0.5 + 0.5) * 3 * sc + 1;
        ctx.beginPath();
        ctx.arc(starX, starY, starSize, 0, Math.PI * 2);
        ctx.fill();
      }
    } 
    else if (activeVariant === 'snake_arena') {
      // 2. Draw procedural multiplayer snake arena
      // Draw circular glow in center
      const radGlow = ctx.createRadialGradient(w/2, h/2, 50 * sc, w/2, h/2, 350 * sc);
      radGlow.addColorStop(0, 'rgba(0, 255, 255, 0.08)');
      radGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = radGlow;
      ctx.fillRect(0, 0, w, h);

      // Subtle game grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1 * sc;
      const gSize = 80 * sc;
      for (let x = 0; x < w; x += gSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += gSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // Draw procedural glowing snakes
      // Snake 1: Neon Cyan Player Snake
      ctx.shadowBlur = 15 * sc;
      ctx.shadowColor = '#00ffff';
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 22 * sc;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      ctx.moveTo(w * 0.2, h * 0.65);
      ctx.bezierCurveTo(w * 0.4, h * 0.72, w * 0.5, h * 0.45, w * 0.75, h * 0.5);
      ctx.stroke();

      // Snake 2: Neon Purple Rival Snake
      ctx.shadowColor = '#bd00ff';
      ctx.strokeStyle = '#bd00ff';
      ctx.lineWidth = 18 * sc;
      ctx.beginPath();
      ctx.moveTo(w * 0.8, h * 0.68);
      ctx.bezierCurveTo(w * 0.6, h * 0.78, w * 0.4, h * 0.58, w * 0.25, h * 0.48);
      ctx.stroke();
      
      // Clear shadow
      ctx.shadowBlur = 0;

      // Draw glowing food pellets
      const foods = [
        {x: w * 0.35, y: h * 0.52, color: '#ff007f', r: 12},
        {x: w * 0.62, y: h * 0.42, color: '#fffb00', r: 9},
        {x: w * 0.78, y: h * 0.58, color: '#39ff14', r: 10},
        {x: w * 0.15, y: h * 0.58, color: '#00f0ff', r: 8}
      ];
      foods.forEach(f => {
        ctx.save();
        ctx.shadowBlur = 10 * sc;
        ctx.shadowColor = f.color;
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }
    else if (activeVariant === 'retro_retro') {
      // 3. Draw Synthwave horizontal sun grid
      // Sun
      const sunY = h * 0.5;
      const sunRad = 150 * sc;
      const gradSun = ctx.createLinearGradient(0, sunY - sunRad, 0, sunY + sunRad);
      gradSun.addColorStop(0, '#ff007f');
      gradSun.addColorStop(1, '#fffb00');
      
      ctx.save();
      ctx.shadowBlur = 30 * sc;
      ctx.shadowColor = '#ff007f';
      ctx.fillStyle = gradSun;
      ctx.beginPath();
      ctx.arc(w/2, sunY, sunRad, Math.PI, 0); // Upper half
      ctx.fill();
      ctx.restore();

      // Draw horizontal lines across sun
      ctx.fillStyle = '#0a0a0a';
      let gapY = sunY - sunRad + 40 * sc;
      let gapH = 4 * sc;
      while (gapY < sunY) {
        ctx.fillRect(w/2 - sunRad, gapY, sunRad * 2, gapH);
        gapY += 18 * sc;
        gapH += 2 * sc;
      }

      // Synthwave mountain outlines
      ctx.strokeStyle = '#bd00ff';
      ctx.lineWidth = 3 * sc;
      ctx.fillStyle = 'rgba(10, 10, 10, 0.9)';
      
      // Back hills
      ctx.beginPath();
      ctx.moveTo(0, sunY + 20 * sc);
      ctx.lineTo(w * 0.2, sunY - 40 * sc);
      ctx.lineTo(w * 0.4, sunY + 30 * sc);
      ctx.lineTo(w * 0.65, sunY - 60 * sc);
      ctx.lineTo(w * 0.85, sunY + 10 * sc);
      ctx.lineTo(w, sunY + 20 * sc);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    else if (activeVariant === 'hyper_minimal') {
      // 4. Hyper minimal
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 2 * sc;
      ctx.strokeRect(30 * sc, 30 * sc, w - 60 * sc, h - 60 * sc);
      ctx.strokeRect(45 * sc, 45 * sc, w - 90 * sc, h - 90 * sc);

      // Abstract central geometric wireframe
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
      ctx.lineWidth = 1 * sc;
      ctx.save();
      ctx.translate(w/2, h/2);
      for (let i = 0; i < 8; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.strokeRect(-120 * sc, -120 * sc, 240 * sc, 240 * sc);
      }
      ctx.restore();
    }
    ctx.restore();

    // --- SCANLINES FILTER (Arcade retro vibe) ---
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1.5);
    }

    // --- GOLDEN LAYOUT GRID DRAWING (STRICT SPECS) ---

    // 1. TOP ZONE (15% Height) -> Axumit Brand Logo
    const topZoneH = h * 0.15;
    ctx.save();
    
    // Draw minimalist neon logo emblem
    const logoX = w / 2;
    const logoY = topZoneH * 0.48;
    
    ctx.shadowBlur = 10 * sc;
    ctx.shadowColor = '#00ffff';
    
    // Polygon Emblem
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3 * sc;
    ctx.beginPath();
    ctx.moveTo(logoX - 18 * sc, logoY - 10 * sc);
    ctx.lineTo(logoX, logoY - 22 * sc);
    ctx.lineTo(logoX + 18 * sc, logoY - 10 * sc);
    ctx.lineTo(logoX + 10 * sc, logoY + 12 * sc);
    ctx.lineTo(logoX - 10 * sc, logoY + 12 * sc);
    ctx.closePath();
    ctx.stroke();

    // Small glowing inner dot
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(logoX, logoY - 3 * sc, 4 * sc, 0, Math.PI * 2);
    ctx.fill();
    
    // Clear shadow
    ctx.shadowBlur = 0;

    // Axumit Studios Text
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${15 * sc}px var(--font-sans)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '6px';
    ctx.fillText("AXUMIT STUDIOS", logoX, logoY + 36 * sc);

    // Minor Sub-tag
    ctx.fillStyle = '#bd00ff';
    ctx.font = `bold ${8 * sc}px var(--font-mono)`;
    ctx.letterSpacing = '2px';
    ctx.fillText("CREATIVE LABS", logoX, logoY + 50 * sc);

    ctx.restore();


    // 2. MIDDLE ZONE (60% Height) -> Title & Visual Content
    const midZoneY = topZoneH;
    const midZoneH = h * 0.60;
    
    ctx.save();
    
    if (activeType === 'release') {
      // GAME RELEASE POSTER
      const titleVal = inputTitle.value.trim().toUpperCase() || "AXUMIT SNAKE";
      const taglineVal = inputTagline.value.trim() || "Survive the chaos.";
      
      // Title (BIG, dominant, high contrast)
      ctx.shadowBlur = 20 * sc;
      ctx.shadowColor = '#bd00ff';
      ctx.fillStyle = '#ffffff';
      
      // Support double-stroke neon outline text
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 10 * sc;
      ctx.lineJoin = 'miter';
      ctx.font = `900 ${68 * sc}px var(--font-sans)`;
      ctx.textAlign = 'center';
      
      const titleY = midZoneY + 120 * sc;
      ctx.strokeText(titleVal, w / 2, titleY);
      ctx.fillText(titleVal, w / 2, titleY);

      // Draw secondary glowing inner white text
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * sc;
      ctx.strokeText(titleVal, w / 2, titleY);

      // Short Tagline under Title (1 line max)
      ctx.fillStyle = '#00ffff';
      ctx.font = `600 ${22 * sc}px var(--font-sans)`;
      ctx.letterSpacing = '1px';
      ctx.fillText(`"${taglineVal}"`, w / 2, titleY + 54 * sc);

      // Draw custom gameplay vector illustration
      // Draw neon arcade bounding box frame in center
      const boxW = 440 * sc;
      const boxH = 340 * sc;
      const boxX = w / 2 - boxW / 2;
      const boxY = midZoneY + 240 * sc;

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
      ctx.lineWidth = 2 * sc;
      ctx.strokeRect(boxX, boxY, boxW, boxH);
      
      // Corner brackets
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 4 * sc;
      const bLen = 20 * sc;
      // Top Left
      ctx.beginPath(); ctx.moveTo(boxX, boxY + bLen); ctx.lineTo(boxX, boxY); ctx.lineTo(boxX + bLen, boxY); ctx.stroke();
      // Top Right
      ctx.beginPath(); ctx.moveTo(boxX + boxW, boxY + bLen); ctx.lineTo(boxX + boxW, boxY); ctx.lineTo(boxX + boxW - bLen, boxY); ctx.stroke();
      // Bottom Left
      ctx.beginPath(); ctx.moveTo(boxX, boxY + boxH - bLen); ctx.lineTo(boxX, boxY + boxH); ctx.lineTo(boxX + bLen, boxY + boxH); ctx.stroke();
      // Bottom Right
      ctx.beginPath(); ctx.moveTo(boxX + boxW, boxY + boxH - bLen); ctx.lineTo(boxX + boxW, boxY + boxH); ctx.lineTo(boxX + boxW - bLen, boxY + boxH); ctx.stroke();

      // Draw vector player head in bounding box
      const centerBoxX = boxX + boxW / 2;
      const centerBoxY = boxY + boxH / 2;
      
      ctx.shadowBlur = 15 * sc;
      ctx.shadowColor = '#00ffff';
      ctx.fillStyle = '#0a0a0a';
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 6 * sc;
      ctx.beginPath();
      ctx.arc(centerBoxX, centerBoxY, 40 * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Pixelized dynamic vector grid
      ctx.fillStyle = '#00ffff';
      ctx.beginPath();
      ctx.arc(centerBoxX - 12 * sc, centerBoxY - 8 * sc, 6 * sc, 0, Math.PI * 2);
      ctx.arc(centerBoxX + 12 * sc, centerBoxY - 8 * sc, 6 * sc, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#bd00ff';
      ctx.shadowColor = '#bd00ff';
      ctx.beginPath();
      ctx.arc(centerBoxX - 12 * sc, centerBoxY - 8 * sc, 2.5 * sc, 0, Math.PI * 2);
      ctx.arc(centerBoxX + 12 * sc, centerBoxY - 8 * sc, 2.5 * sc, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
    } 
    else if (activeType === 'announcement') {
      // PLATFORM ANNOUNCEMENT POSTER
      
      // Giant headline "AXUMIT ARCADE IS LIVE"
      const headlineY = midZoneY + 120 * sc;
      ctx.textAlign = 'center';
      
      // Dual layer background text glow
      ctx.shadowBlur = 25 * sc;
      ctx.shadowColor = '#00ffff';
      ctx.fillStyle = '#00ffff';
      ctx.font = `900 ${52 * sc}px var(--font-sans)`;
      ctx.fillText("AXUMIT ARCADE", w / 2, headlineY);
      ctx.fillText("IS LIVE!", w / 2, headlineY + 68 * sc);
      
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillText("AXUMIT ARCADE", w / 2, headlineY);
      ctx.fillText("IS LIVE!", w / 2, headlineY + 68 * sc);

      // Subtext subheader
      ctx.fillStyle = '#e5e7eb';
      ctx.font = `600 ${19 * sc}px var(--font-sans)`;
      ctx.letterSpacing = '0.5px';
      ctx.fillText("20+ Arcade Games. Fast. Simple. Addictive.", w / 2, headlineY + 130 * sc);

      // Grid of mini-game previews representation
      const startGridY = headlineY + 180 * sc;
      const colW = 140 * sc;
      const rowH = 140 * sc;
      const gap = 20 * sc;
      const gridX = w / 2 - (colW * 2 + gap) / 2;

      const games = [
        {name: "SNAKE.IO", icon: "🐍", color: "#00ffff"},
        {name: "BLASTER", icon: "🚀", color: "#ff007f"},
        {name: "TETRA", icon: "🧱", color: "#39ff14"},
        {name: "PAC-RUN", icon: "🍒", color: "#fffb00"}
      ];

      for (let i = 0; i < 4; i++) {
        const c = i % 2;
        const r = Math.floor(i / 2);
        const bx = gridX + c * (colW + gap);
        const by = startGridY + r * (rowH + gap);

        // Draw arcade preview card
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1.5 * sc;
        ctx.fillRect(bx, by, colW, rowH);
        ctx.strokeRect(bx, by, colW, rowH);

        // Inner neon accent bracket
        ctx.strokeStyle = games[i].color;
        ctx.strokeRect(bx + 4 * sc, by + 4 * sc, colW - 8 * sc, rowH - 8 * sc);

        // Icon
        ctx.font = `${38 * sc}px sans-serif`;
        ctx.fillText(games[i].icon, bx + colW/2, by + rowH/2 - 12 * sc);

        // Name
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${10 * sc}px var(--font-mono)`;
        ctx.letterSpacing = '1px';
        ctx.fillText(games[i].name, bx + colW/2, by + rowH/2 + 38 * sc);
      }
    } 
    else if (activeType === 'credit') {
      // DESIGNER CREDIT POSTER
      const designerVal = inputDesigner.value.trim() || "@betelhemt";
      
      const titleY = midZoneY + 130 * sc;
      ctx.textAlign = 'center';
      
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${44 * sc}px var(--font-sans)`;
      ctx.fillText("AXUMIT CREATOR", w / 2, titleY);
      ctx.fillStyle = '#00ffff';
      ctx.font = `900 ${50 * sc}px var(--font-sans)`;
      ctx.fillText("SHOWCASE", w / 2, titleY + 54 * sc);

      // Clean vector circle/emblem for designer avatar preview
      const avX = w / 2;
      const avY = titleY + 240 * sc;
      const avR = 110 * sc;

      ctx.save();
      // Outer neon ring
      ctx.shadowBlur = 20 * sc;
      ctx.shadowColor = '#bd00ff';
      ctx.strokeStyle = '#bd00ff';
      ctx.lineWidth = 4 * sc;
      ctx.beginPath();
      ctx.arc(avX, avY, avR, 0, Math.PI * 2);
      ctx.stroke();

      // Outer cyan dashes
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2 * sc;
      ctx.setLineDash([10 * sc, 15 * sc]);
      ctx.beginPath();
      ctx.arc(avX, avY, avR + 15 * sc, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Center initials
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${68 * sc}px var(--font-sans)`;
      ctx.fillText("CRAFT", avX, avY - 10 * sc);
      ctx.fillStyle = '#00ffff';
      ctx.font = `bold ${18 * sc}px var(--font-mono)`;
      ctx.letterSpacing = '3px';
      ctx.fillText(designerVal.toUpperCase(), avX, avY + 44 * sc);
    }
    
    ctx.restore();


    // 3. BOTTOM ZONE (25% Height) -> CTA & Credits
    const botZoneY = h * 0.75;
    ctx.save();

    const ctaX = w / 2;
    const ctaY = botZoneY + 80 * sc;
    const platformVal = inputPlatform.value.trim() || "Web & Mobile";

    // "Play Now" Glowing CTA Pill Button
    const btnW = 340 * sc;
    const btnH = 68 * sc;
    
    ctx.shadowBlur = 15 * sc;
    ctx.shadowColor = '#00ffff';
    
    // Gradient outline
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3 * sc;
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.roundRect(ctaX - btnW / 2, ctaY - btnH / 2, btnW, btnH, 34 * sc);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;

    // CTA Text inside button
    ctx.fillStyle = '#00ffff';
    ctx.font = `900 ${22 * sc}px var(--font-sans)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '2px';
    ctx.fillText("PLAY INSTANTLY", ctaX, ctaY);

    // Platform Tag text
    ctx.fillStyle = '#e5e7eb';
    ctx.font = `600 ${15 * sc}px var(--font-sans)`;
    ctx.letterSpacing = '1px';
    ctx.fillText(platformVal.toUpperCase(), ctaX, ctaY + 68 * sc);

    // --- MANDATORY DESIGNER CREDIT IN THE CLEAN FOOTER ---
    const creditY = h - 60 * sc;
    const designerVal = inputDesigner.value.trim() || "@betelhemt";
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1 * sc;
    ctx.beginPath();
    ctx.moveTo(w * 0.2, creditY - 20 * sc);
    ctx.lineTo(w * 0.8, creditY - 20 * sc);
    ctx.stroke();

    ctx.fillStyle = '#9ca3af';
    ctx.font = `bold ${11 * sc}px var(--font-mono)`;
    ctx.textAlign = 'center';
    ctx.letterSpacing = '1.5px';
    
    // Perfect, humble developer credit alignment
    ctx.fillText(`DESIGNED BY: ${designerVal.toUpperCase()} | AXUMIT STUDIOS CREATIVE TEAM`, w / 2, creditY + 6 * sc);

    ctx.restore();
  }

  // Bind Poster rendering to global trigger
  renderPosterFn = renderPoster;

  // Change active poster categories
  document.querySelectorAll('.category-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeType = tab.dataset.type;
      
      // Play sound
      sfx.playClick();
      
      // Update form context visibility depending on poster type
      const titleGroup = document.getElementById('field-group-title');
      const taglineGroup = document.getElementById('field-group-tagline');
      const designerGroup = document.getElementById('field-group-designer');
      
      if (activeType === 'release') {
        titleGroup.style.display = 'flex';
        taglineGroup.style.display = 'flex';
      } else if (activeType === 'announcement') {
        titleGroup.style.display = 'none';
        taglineGroup.style.display = 'none';
      } else if (activeType === 'credit') {
        titleGroup.style.display = 'none';
        taglineGroup.style.display = 'none';
      }
      
      renderPoster();
    });
  });

  // Toggle layout aspects ratios
  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRatio = btn.dataset.ratio;
      
      sfx.playClick();
      updateLayoutRatio();
      renderPoster();
    });
  });

  // Toggle platform presets
  document.querySelectorAll('.platform-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.platform-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activePlatform = tab.dataset.platform;
      
      sfx.playClick();

      // Toggle active overlay layouts
      document.querySelectorAll('.social-overlay').forEach(o => o.classList.remove('active'));
      
      const label = document.getElementById('active-preview-label');
      
      if (activePlatform === 'poster') {
        label.textContent = "RAW POSTER VIEW";
        helperLines.classList.add('visible');
      } else if (activePlatform === 'instagram') {
        label.textContent = "INSTAGRAM FEED CONTEXT";
        document.getElementById('instagram-overlay').classList.add('active');
        helperLines.classList.remove('visible');
      } else if (activePlatform === 'telegram') {
        label.textContent = "TELEGRAM CHANNEL NOTIFICATION";
        document.getElementById('telegram-overlay').classList.add('active');
        helperLines.classList.remove('visible');
      } else if (activePlatform === 'banner') {
        label.textContent = "WEBSITE BANNER EMBED";
        document.getElementById('banner-overlay').classList.add('active');
        helperLines.classList.remove('visible');
      } else if (activePlatform === 'splash') {
        label.textContent = "MOBILE APPLICATION SPLASH";
        helperLines.classList.remove('visible');
      }
      
      updateLayoutRatio();
      renderPoster();
    });
  });

  // Inputs listen event to refresh canvas instantly
  [inputTitle, inputTagline, inputPlatform, inputDesigner].forEach(inp => {
    inp.addEventListener('input', () => {
      renderPoster();
    });
  });

  selectVariant.addEventListener('change', (e) => {
    activeVariant = e.target.value;
    sfx.playClick();
    renderPoster();
  });

  // Go Back to main menu
  document.getElementById('studio-back-btn').addEventListener('click', () => {
    sfx.playClick();
    transitionTo(State.MENU);
  });

  // Guide Specs Modal
  const viewSpecBtn = document.getElementById('view-spec-btn');
  const closeSpecBtn = document.getElementById('close-spec-btn');
  const ackSpecBtn = document.getElementById('ack-spec-btn');

  viewSpecBtn.addEventListener('click', () => {
    sfx.playClick();
    specModal.classList.add('active');
  });

  [closeSpecBtn, ackSpecBtn].forEach(btn => {
    btn.addEventListener('click', () => {
      sfx.playClick();
      specModal.classList.remove('active');
    });
  });

  // Download high-resolution PNG image directly from full-scale Canvas state
  document.getElementById('download-poster-btn').addEventListener('click', () => {
    sfx.playClick();
    
    // Dynamic naming based on category
    const filename = `axumit_${activeType}_poster_${activeRatio}.png`;
    
    // Create temporary anchor
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Show toast
    toast.textContent = `Pristine ${activeRatio} poster exported successfully!`;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  });

  // Copy Editable Canva Link
  document.getElementById('copy-canva-btn').addEventListener('click', () => {
    sfx.playClick();
    
    // Simulated design team workspace link
    const mockCanvaUrl = "https://www.canva.com/design/DAF-AXUMIT-STUDIOS/view?utm_content=arcade_task_system";
    
    navigator.clipboard.writeText(mockCanvaUrl).then(() => {
      toast.textContent = "Canva Template Link copied to clipboard!";
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2500);
    }).catch(err => {
      console.warn("Failed to copy clipboard", err);
    });
  });

  // Launch initial render
  updateLayoutRatio();
  renderPoster();
}

