const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const stateLabel = document.getElementById("stateLabel");
const hintLabel = document.getElementById("hintLabel");
const overlay = document.getElementById("overlay");
const overlayKicker = document.getElementById("overlayKicker");
const overlayTitle = document.getElementById("overlayTitle");
const overlayMessage = document.getElementById("overlayMessage");

const VIEWPORT_WIDTH = canvas.width;
const VIEWPORT_HEIGHT = canvas.height;
const TILE_SIZE = 48;
const STAGE_COLUMNS = 144;

const GameState = Object.freeze({
  TITLE: "title",
  PLAYING: "playing",
  GAMEOVER: "gameover",
  CLEARED: "cleared",
});

const keys = new Set();
const justPressed = new Set();

function buildRow(placements = []) {
  const row = Array(STAGE_COLUMNS).fill(".");

  placements.forEach(([start, pattern]) => {
    for (let index = 0; index < pattern.length && start + index < STAGE_COLUMNS; index += 1) {
      row[start + index] = pattern[index];
    }
  });

  return row.join("");
}

const groundRuns = [
  [0, "############"],
  [14, "###########"],
  [27, "############"],
  [41, "#############"],
  [56, "############"],
  [70, "#############"],
  [85, "############"],
  [99, "#############"],
  [114, "##############################"],
];

const levelRows = [
  buildRow(),
  buildRow(),
  buildRow(),
  buildRow([
    [18, "###"],
    [42, "###"],
    [60, "####"],
    [87, "###"],
    [108, "#####"],
    [130, "###"],
  ]),
  buildRow([
    [9, "###"],
    [28, "####"],
    [52, "###"],
    [71, "####"],
    [96, "###"],
    [118, "####"],
  ]),
  buildRow([
    [14, "###"],
    [35, "###"],
    [63, "####"],
    [82, "###"],
    [110, "###"],
    [134, "###"],
  ]),
  buildRow([
    [24, "E"],
    [58, "E"],
    [92, "E"],
    [126, "E"],
  ]),
  buildRow([
    [10, "###"],
    [22, "###"],
    [39, "####"],
    [58, "###"],
    [78, "####"],
    [100, "###"],
    [121, "####"],
  ]),
  buildRow([
    [2, "S"],
    [18, "E"],
    [32, "###"],
    [47, "E"],
    [66, "###"],
    [79, "E"],
    [100, "###"],
    [117, "E"],
    [136, "G"],
  ]),
  buildRow(groundRuns),
  buildRow(groundRuns),
  buildRow(groundRuns),
];

function createLevel(rows) {
  let spawn = null;
  let goal = null;
  const enemies = [];
  const tiles = rows.map((row, y) =>
    row.split("").map((tile, x) => {
      if (tile === "S") {
        spawn = {
          x: x * TILE_SIZE + 8,
          y: y * TILE_SIZE - 8,
        };
        return ".";
      }

      if (tile === "G") {
        const groundY = y * TILE_SIZE;
        goal = {
          x: x * TILE_SIZE + 8,
          y: groundY - TILE_SIZE * 0.75,
          width: TILE_SIZE,
          height: TILE_SIZE * 1.75,
          clearX: x * TILE_SIZE + TILE_SIZE * 0.5,
        };
        return ".";
      }

      if (tile === "E") {
        enemies.push({
          x: x * TILE_SIZE + 6,
          y: y * TILE_SIZE + 10,
          width: 34,
          height: 30,
          vx: 90,
          vy: 0,
          alive: true,
          minX: x * TILE_SIZE - TILE_SIZE * 2,
          maxX: x * TILE_SIZE + TILE_SIZE * 2,
          onGround: false,
        });
        return ".";
      }

      return tile;
    }),
  );

  return {
    tiles,
    rows: rows.length,
    cols: rows[0].length,
    width: rows[0].length * TILE_SIZE,
    height: rows.length * TILE_SIZE,
    spawn,
    goal,
    enemies,
  };
}

const level = createLevel(levelRows);

const camera = { x: 0, y: 0 };

const inputState = {
  left: false,
  right: false,
  jump: false,
  jumpPressed: false,
  startPressed: false,
};

let state = GameState.TITLE;
let elapsed = 0;
let timeStarted = 0;

const player = createPlayer();
let enemies = [];

if (typeof window !== "undefined") {
  window.__skylineSprint = {
    getSnapshot() {
      return {
        state,
        elapsed,
        player: {
          x: player.x,
          y: player.y,
          vx: player.vx,
          vy: player.vy,
          onGround: player.onGround,
        },
        enemies: enemies.map((enemy) => ({
          x: enemy.x,
          y: enemy.y,
          alive: enemy.alive,
        })),
      };
    },
  };
}

function createPlayer() {
  return {
    x: 0,
    y: 0,
    width: 30,
    height: 42,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    isDead: false,
    previousX: 0,
    previousY: 0,
  };
}

function resetRun() {
  player.x = level.spawn.x;
  player.y = level.spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.facing = 1;
  player.onGround = false;
  player.isDead = false;
  player.previousX = player.x;
  player.previousY = player.y;
  enemies = level.enemies.map((enemy) => ({ ...enemy }));
  camera.x = 0;
  camera.y = 0;
  elapsed = 0;
  timeStarted = performance.now();
}

function isSolidTile(tileX, tileY) {
  if (tileY < 0 || tileY >= level.rows || tileX < 0 || tileX >= level.cols) {
    return false;
  }

  return level.tiles[tileY][tileX] === "#";
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function resolveWorldCollisions(body, axis) {
  const startX = Math.floor(body.x / TILE_SIZE) - 1;
  const endX = Math.floor((body.x + body.width) / TILE_SIZE) + 1;
  const startY = Math.floor(body.y / TILE_SIZE) - 1;
  const endY = Math.floor((body.y + body.height) / TILE_SIZE) + 1;

  if (axis === "y") {
    body.onGround = false;
  }

  for (let tileY = startY; tileY <= endY; tileY += 1) {
    for (let tileX = startX; tileX <= endX; tileX += 1) {
      if (!isSolidTile(tileX, tileY)) {
        continue;
      }

      const tileRect = {
        x: tileX * TILE_SIZE,
        y: tileY * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE,
      };

      if (!rectsOverlap(body, tileRect)) {
        continue;
      }

      if (axis === "x") {
        if (body.vx > 0) {
          body.x = tileRect.x - body.width;
        } else if (body.vx < 0) {
          body.x = tileRect.x + tileRect.width;
        }
        body.vx = 0;
      } else {
        if (body.vy > 0) {
          body.y = tileRect.y - body.height;
          body.onGround = true;
        } else if (body.vy < 0) {
          body.y = tileRect.y + tileRect.height;
        }
        body.vy = 0;
      }
    }
  }
}

function updateInputFlags() {
  inputState.left = keys.has("ArrowLeft") || keys.has("KeyA");
  inputState.right = keys.has("ArrowRight") || keys.has("KeyD");
  inputState.jump = keys.has("Space") || keys.has("KeyW") || keys.has("ArrowUp");
  inputState.jumpPressed =
    justPressed.has("Space") || justPressed.has("KeyW") || justPressed.has("ArrowUp");
  inputState.startPressed =
    justPressed.has("Enter") ||
    justPressed.has("Space") ||
    justPressed.has("KeyW") ||
    justPressed.has("ArrowUp");
}

function setOverlay(kicker, title, message) {
  overlayKicker.textContent = kicker;
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
}

function changeState(nextState) {
  state = nextState;

  if (state === GameState.TITLE) {
    overlay.hidden = false;
    setOverlay("ONE STAGE RUN", "Skyline Sprint", "Enter か Space でスタート");
    stateLabel.textContent = "TITLE";
    hintLabel.textContent = "Press Enter or Space";
  }

  if (state === GameState.PLAYING) {
    overlay.hidden = true;
    stateLabel.textContent = "RUN";
    hintLabel.textContent = "Reach the flag";
  }

  if (state === GameState.GAMEOVER) {
    overlay.hidden = false;
    setOverlay("TRY AGAIN", "You Took a Fall", "Enter か Space でリスタート");
    stateLabel.textContent = "GAME OVER";
    hintLabel.textContent = "Restart";
  }

  if (state === GameState.CLEARED) {
    overlay.hidden = false;
    setOverlay("CLEAR", "Stage Complete", "Enter か Space でもう一度");
    stateLabel.textContent = "CLEAR";
    hintLabel.textContent = `${elapsed.toFixed(1)}s clear`;
  }
}

function startGame() {
  resetRun();
  changeState(GameState.PLAYING);
}

function defeatPlayer() {
  if (player.isDead) {
    return;
  }

  player.isDead = true;
  changeState(GameState.GAMEOVER);
}

function clearStage() {
  elapsed = (performance.now() - timeStarted) / 1000;
  changeState(GameState.CLEARED);
}

function updatePlayer(dt) {
  const acceleration = 2300;
  const maxSpeed = 310;
  const friction = 2000;
  const airControl = 0.7;
  const gravity = 1900;
  const jumpVelocity = 710;
  const maxFallSpeed = 980;

  player.previousX = player.x;
  player.previousY = player.y;

  const moveDirection = Number(inputState.right) - Number(inputState.left);
  const controlFactor = player.onGround ? 1 : airControl;

  if (moveDirection !== 0) {
    player.vx += moveDirection * acceleration * controlFactor * dt;
    player.facing = moveDirection;
  } else if (player.vx !== 0) {
    const delta = friction * dt;
    if (Math.abs(player.vx) <= delta) {
      player.vx = 0;
    } else {
      player.vx -= Math.sign(player.vx) * delta;
    }
  }

  player.vx = Math.max(-maxSpeed, Math.min(maxSpeed, player.vx));

  if (inputState.jumpPressed && player.onGround) {
    player.vy = -jumpVelocity;
    player.onGround = false;
  }

  player.vy += gravity * dt;
  player.vy = Math.min(player.vy, maxFallSpeed);

  player.x += player.vx * dt;
  resolveWorldCollisions(player, "x");

  player.y += player.vy * dt;
  resolveWorldCollisions(player, "y");

  if (player.y > level.height + 160) {
    defeatPlayer();
  }

  if (rectsOverlap(player, level.goal) || player.x + player.width >= level.goal.clearX) {
    clearStage();
  }
}

function updateEnemies(dt) {
  const gravity = 1700;

  enemies.forEach((enemy) => {
    if (!enemy.alive) {
      return;
    }

    enemy.vy += gravity * dt;

    if (enemy.x <= enemy.minX) {
      enemy.x = enemy.minX;
      enemy.vx = Math.abs(enemy.vx);
    } else if (enemy.x >= enemy.maxX) {
      enemy.x = enemy.maxX;
      enemy.vx = -Math.abs(enemy.vx);
    }

    enemy.x += enemy.vx * dt;
    resolveWorldCollisions(enemy, "x");

    enemy.y += enemy.vy * dt;
    resolveWorldCollisions(enemy, "y");

    if (enemy.vx === 0) {
      enemy.vx = enemy.x <= enemy.minX ? 90 : -90;
    }
  });
}

function handleEnemyCollisions() {
  for (const enemy of enemies) {
    if (!enemy.alive || !rectsOverlap(player, enemy)) {
      continue;
    }

    const previousBottom = player.previousY + player.height;
    const enemyTop = enemy.y + 8;

    if (player.vy > 150 && previousBottom <= enemyTop) {
      enemy.alive = false;
      player.y = enemy.y - player.height;
      player.vy = -420;
      return;
    }

    defeatPlayer();
    return;
  }
}

function updateCamera() {
  const targetX = player.x + player.width * 0.5 - VIEWPORT_WIDTH * 0.5;
  camera.x = Math.max(0, Math.min(level.width - VIEWPORT_WIDTH, targetX));
}

function update(dt) {
  updateInputFlags();

  if (state === GameState.TITLE && inputState.startPressed) {
    startGame();
    justPressed.clear();
    return;
  }

  if ((state === GameState.GAMEOVER || state === GameState.CLEARED) && inputState.startPressed) {
    startGame();
    justPressed.clear();
    return;
  }

  if (state !== GameState.PLAYING) {
    justPressed.clear();
    return;
  }

  elapsed = (performance.now() - timeStarted) / 1000;
  updatePlayer(dt);
  updateEnemies(dt);

  if (!player.isDead && state === GameState.PLAYING) {
    handleEnemyCollisions();
    updateCamera();
    hintLabel.textContent = `${elapsed.toFixed(1)}s`;
  }

  justPressed.clear();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEWPORT_HEIGHT);
  sky.addColorStop(0, "#90d0f2");
  sky.addColorStop(0.72, "#d6f2ff");
  sky.addColorStop(0.72, "#f2d69c");
  sky.addColorStop(1, "#e9c07a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

  ctx.fillStyle = "rgba(255,255,255,0.58)";
  for (let i = 0; i < 5; i += 1) {
    const baseX = ((i * 220) - camera.x * 0.25) % (VIEWPORT_WIDTH + 180);
    const x = baseX < -180 ? baseX + VIEWPORT_WIDTH + 180 : baseX;
    const y = 80 + (i % 3) * 34;
    ctx.beginPath();
    ctx.arc(x + 40, y, 28, Math.PI, 0);
    ctx.arc(x + 68, y - 8, 24, Math.PI, 0);
    ctx.arc(x + 94, y, 22, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "#87b98c";
  for (let i = 0; i < 7; i += 1) {
    const width = 220;
    const x = ((i * 180) - camera.x * 0.45) % (level.width + width);
    const px = x < -width ? x + level.width + width : x;
    ctx.beginPath();
    ctx.moveTo(px, 390);
    ctx.quadraticCurveTo(px + 60, 260, px + 120, 390);
    ctx.quadraticCurveTo(px + 180, 290, px + 220, 390);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTiles() {
  for (let y = 0; y < level.rows; y += 1) {
    for (let x = 0; x < level.cols; x += 1) {
      if (level.tiles[y][x] !== "#") {
        continue;
      }

      const drawX = x * TILE_SIZE - camera.x;
      const drawY = y * TILE_SIZE - camera.y;

      if (drawX + TILE_SIZE < 0 || drawX > VIEWPORT_WIDTH) {
        continue;
      }

      ctx.fillStyle = "#8b5e3c";
      ctx.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = "#b57d4c";
      ctx.fillRect(drawX, drawY, TILE_SIZE, 10);
      ctx.fillStyle = "#d08d54";
      ctx.fillRect(drawX + 6, drawY + 18, TILE_SIZE - 12, 6);
      ctx.fillStyle = "#6d4329";
      ctx.fillRect(drawX, drawY + TILE_SIZE - 8, TILE_SIZE, 8);
    }
  }
}

function drawGoal() {
  const x = level.goal.x - camera.x + 18;
  const y = level.goal.y - camera.y;
  ctx.fillStyle = "#e9eef2";
  ctx.fillRect(x, y, 8, level.goal.height + TILE_SIZE * 0.6);

  ctx.fillStyle = "#db6b39";
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 6);
  ctx.lineTo(x + 58, y + 22);
  ctx.lineTo(x + 8, y + 40);
  ctx.closePath();
  ctx.fill();
}

function drawPlayer() {
  const x = player.x - camera.x;
  const y = player.y - camera.y;

  ctx.fillStyle = "#21315f";
  ctx.fillRect(x + 7, y + 2, 16, 12);
  ctx.fillStyle = "#f6be7b";
  ctx.fillRect(x + 8, y + 12, 14, 12);
  ctx.fillStyle = "#db6b39";
  ctx.fillRect(x + 5, y + 24, 20, 18);
  ctx.fillStyle = "#1a1e35";
  ctx.fillRect(x + 3, y + 40, 10, 2);
  ctx.fillRect(x + 17, y + 40, 10, 2);

  ctx.fillStyle = "#1f2444";
  const eyeX = player.facing > 0 ? x + 18 : x + 10;
  ctx.fillRect(eyeX, y + 15, 3, 3);
}

function drawEnemies() {
  enemies.forEach((enemy) => {
    if (!enemy.alive) {
      return;
    }

    const x = enemy.x - camera.x;
    const y = enemy.y - camera.y;
    ctx.fillStyle = "#5a2d2d";
    ctx.fillRect(x + 2, y + 8, 30, 18);
    ctx.fillStyle = "#b65b4a";
    ctx.fillRect(x + 6, y + 2, 22, 12);
    ctx.fillStyle = "#fff2dd";
    ctx.fillRect(x + 8, y + 11, 5, 5);
    ctx.fillRect(x + 21, y + 11, 5, 5);
    ctx.fillStyle = "#1f2444";
    ctx.fillRect(x + 10, y + 12, 2, 2);
    ctx.fillRect(x + 23, y + 12, 2, 2);
  });
}

function drawForeground() {
  ctx.fillStyle = "rgba(33, 49, 95, 0.12)";
  ctx.fillRect(0, VIEWPORT_HEIGHT - 52, VIEWPORT_WIDTH, 52);

  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.font = '18px "Trebuchet MS", Verdana, sans-serif';
  ctx.textAlign = "left";
  ctx.fillText(`Time ${elapsed.toFixed(1)}s`, 18, 34);
}

function render() {
  ctx.clearRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  drawBackground();
  drawGoal();
  drawTiles();
  drawEnemies();
  drawPlayer();
  drawForeground();
}

let lastFrame = performance.now();

function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, 1 / 30);
  lastFrame = now;

  update(dt);
  render();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  const blockedCodes = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW"]);
  if (blockedCodes.has(event.code)) {
    event.preventDefault();
  }

  if (!keys.has(event.code)) {
    justPressed.add(event.code);
  }
  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

resetRun();
changeState(GameState.TITLE);
requestAnimationFrame(frame);
