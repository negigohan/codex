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

const LIFE_INITIAL = 1;
const LIFE_MAX = 2;
const HIT_INVULNERABLE_MS = 1000;

const PLAYER_FORMS = {
  normal: { width: 30, height: 42 },
  large: { width: 42, height: 58 },
};

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
    [8, "I"],
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
  const itemBlocks = [];

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
          previousX: 0,
          previousY: 0,
        });
        return ".";
      }

      if (tile === "I") {
        itemBlocks.push({
          x: x * TILE_SIZE,
          y: y * TILE_SIZE,
          width: TILE_SIZE,
          height: TILE_SIZE,
          used: false,
          bumpTimer: 0,
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
    itemBlocks,
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
let lives = LIFE_INITIAL;

const player = createPlayer();
let enemies = [];
let itemBlocks = [];
let mushrooms = [];
let selfTestResult = null;

if (typeof window !== "undefined") {
  window.__skylineSprint = {
    getSnapshot() {
      return {
        state,
        elapsed,
        lives,
        player: {
          x: player.x,
          y: player.y,
          width: player.width,
          height: player.height,
          vx: player.vx,
          vy: player.vy,
          onGround: player.onGround,
          invulnerableUntil: player.invulnerableUntil,
        },
        enemies: enemies.map((enemy) => ({
          x: enemy.x,
          y: enemy.y,
          alive: enemy.alive,
        })),
        itemBlocks: itemBlocks.map((block) => ({
          x: block.x,
          y: block.y,
          used: block.used,
        })),
        mushrooms: mushrooms.map((mushroom) => ({
          x: mushroom.x,
          y: mushroom.y,
          active: mushroom.active,
        })),
      };
    },
  };
}

function createPlayer() {
  return {
    x: 0,
    y: 0,
    width: PLAYER_FORMS.normal.width,
    height: PLAYER_FORMS.normal.height,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    isDead: false,
    previousX: 0,
    previousY: 0,
    invulnerableUntil: 0,
  };
}

function isLargeForm() {
  return lives >= LIFE_MAX;
}

function applyPlayerForm(keepFeet = true) {
  const form = isLargeForm() ? PLAYER_FORMS.large : PLAYER_FORMS.normal;
  const oldHeight = player.height;
  player.width = form.width;
  player.height = form.height;

  if (keepFeet) {
    player.y -= player.height - oldHeight;
  }
}

function setLives(nextLives) {
  const clamped = Math.max(0, Math.min(LIFE_MAX, nextLives));
  const beforeLarge = isLargeForm();
  lives = clamped;

  if (beforeLarge !== isLargeForm()) {
    applyPlayerForm(true);
  }
}

function resetRun() {
  setLives(LIFE_INITIAL);
  player.x = level.spawn.x;
  player.y = level.spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.facing = 1;
  player.onGround = false;
  player.isDead = false;
  player.previousX = player.x;
  player.previousY = player.y;
  player.invulnerableUntil = 0;
  enemies = level.enemies.map((enemy) => ({ ...enemy }));
  itemBlocks = level.itemBlocks.map((block) => ({ ...block }));
  mushrooms = [];
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

function spawnMushroomFromBlock(block) {
  mushrooms.push({
    x: block.x + (block.width - 28) * 0.5,
    y: block.y - 26,
    width: 28,
    height: 26,
    vx: 155,
    vy: 0,
    onGround: false,
    active: true,
    previousX: 0,
    previousY: 0,
  });
}

function triggerItemBlock(block) {
  if (block.used) {
    return;
  }
  block.used = true;
  block.bumpTimer = 0.18;
  spawnMushroomFromBlock(block);
}

function resolveItemBlockCollisions(body, axis) {
  itemBlocks.forEach((block) => {
    if (!rectsOverlap(body, block)) {
      return;
    }

    if (axis === "x") {
      if (body.vx > 0) {
        body.x = block.x - body.width;
      } else if (body.vx < 0) {
        body.x = block.x + block.width;
      }
      body.vx = 0;
      return;
    }

    if (body.vy > 0) {
      body.y = block.y - body.height;
      body.onGround = true;
      body.vy = 0;
      return;
    }

    if (body.vy < 0) {
      body.y = block.y + block.height;
      body.vy = 0;

      if (body === player && body.previousY >= block.y + block.height - 2) {
        triggerItemBlock(block);
      }
    }
  });
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

  resolveItemBlockCollisions(body, axis);
}

function updateInputFlags() {
  inputState.left = keys.has("left");
  inputState.right = keys.has("right");
  inputState.jump = keys.has("jump");
  inputState.jumpPressed = justPressed.has("jump");
  inputState.startPressed = justPressed.has("start") || justPressed.has("jump");
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
    setOverlay("ONE STAGE RUN", "Skyline Sprint", "Press Enter or Space to start");
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
    setOverlay("TRY AGAIN", "Game Over", "Press Enter or Space to retry");
    stateLabel.textContent = "GAME OVER";
    hintLabel.textContent = "Restart";
  }

  if (state === GameState.CLEARED) {
    overlay.hidden = false;
    setOverlay("CLEAR", "Stage Complete", "Press Enter or Space to play again");
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

function consumeLives(amount, sourceX) {
  if (state !== GameState.PLAYING) {
    return;
  }

  setLives(lives - amount);
  if (lives <= 0) {
    defeatPlayer();
    return;
  }

  player.invulnerableUntil = performance.now() + HIT_INVULNERABLE_MS;
  player.vy = -320;
  if (typeof sourceX === "number") {
    player.vx = player.x < sourceX ? -190 : 190;
  }
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
    consumeLives(LIFE_MAX);
    return;
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

    enemy.previousX = enemy.x;
    enemy.previousY = enemy.y;
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

function updateItemBlocks(dt) {
  itemBlocks.forEach((block) => {
    block.bumpTimer = Math.max(0, block.bumpTimer - dt);
  });
}

function updateMushrooms(dt) {
  const gravity = 1750;
  const maxFallSpeed = 920;

  mushrooms.forEach((mushroom) => {
    if (!mushroom.active) {
      return;
    }

    mushroom.previousX = mushroom.x;
    mushroom.previousY = mushroom.y;
    mushroom.vy += gravity * dt;
    mushroom.vy = Math.min(mushroom.vy, maxFallSpeed);

    mushroom.x += mushroom.vx * dt;
    resolveWorldCollisions(mushroom, "x");

    mushroom.y += mushroom.vy * dt;
    resolveWorldCollisions(mushroom, "y");

    if (mushroom.y > level.height + 180) {
      mushroom.active = false;
    }
  });
}

function handleMushroomCollection() {
  mushrooms.forEach((mushroom) => {
    if (!mushroom.active) {
      return;
    }

    if (!rectsOverlap(player, mushroom)) {
      return;
    }

    mushroom.active = false;
    setLives(lives + 1);
  });
}

function handleEnemyCollisions() {
  const now = performance.now();

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

    if (now < player.invulnerableUntil) {
      return;
    }

    consumeLives(1, enemy.x + enemy.width * 0.5);
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
  if (state !== GameState.PLAYING) {
    justPressed.clear();
    return;
  }

  updateEnemies(dt);
  updateMushrooms(dt);
  updateItemBlocks(dt);
  handleEnemyCollisions();
  handleMushroomCollection();

  if (!player.isDead && state === GameState.PLAYING) {
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

function drawItemBlocks() {
  itemBlocks.forEach((block) => {
    const drawX = block.x - camera.x;
    const liftRatio = block.bumpTimer > 0 ? block.bumpTimer / 0.18 : 0;
    const drawY = block.y - camera.y - Math.sin((1 - liftRatio) * Math.PI) * 8;

    if (drawX + block.width < 0 || drawX > VIEWPORT_WIDTH) {
      return;
    }

    ctx.fillStyle = block.used ? "#9c714d" : "#c98a46";
    ctx.fillRect(drawX, drawY, block.width, block.height);
    ctx.fillStyle = "#784c2d";
    ctx.fillRect(drawX, drawY + block.height - 8, block.width, 8);
    ctx.fillStyle = "#e3b06f";
    ctx.fillRect(drawX + 4, drawY + 4, block.width - 8, 6);

    if (!block.used) {
      ctx.fillStyle = "#fef3dd";
      ctx.font = '30px "Trebuchet MS", Verdana, sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("?", drawX + block.width * 0.5, drawY + 34);
    }
  });
}

function drawMushrooms() {
  mushrooms.forEach((mushroom) => {
    if (!mushroom.active) {
      return;
    }

    const x = mushroom.x - camera.x;
    const y = mushroom.y - camera.y;

    ctx.fillStyle = "#d7443e";
    ctx.beginPath();
    ctx.ellipse(x + 14, y + 11, 14, 11, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffe8d8";
    ctx.fillRect(x + 4, y + 11, 20, 4);
    ctx.fillStyle = "#fff6ea";
    ctx.fillRect(x + 8, y + 15, 12, 9);
    ctx.fillStyle = "#65413d";
    ctx.fillRect(x + 8, y + 24, 4, 2);
    ctx.fillRect(x + 16, y + 24, 4, 2);
    ctx.fillStyle = "#fff2dc";
    ctx.fillRect(x + 7, y + 5, 4, 4);
    ctx.fillRect(x + 17, y + 7, 4, 4);
  });
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
  const now = performance.now();
  if (now < player.invulnerableUntil && Math.floor(now / 90) % 2 === 0) {
    return;
  }

  const x = player.x - camera.x;
  const y = player.y - camera.y;
  const sx = player.width / PLAYER_FORMS.normal.width;
  const sy = player.height / PLAYER_FORMS.normal.height;

  ctx.fillStyle = "#21315f";
  ctx.fillRect(x + 7 * sx, y + 2 * sy, 16 * sx, 12 * sy);
  ctx.fillStyle = "#f6be7b";
  ctx.fillRect(x + 8 * sx, y + 12 * sy, 14 * sx, 12 * sy);
  ctx.fillStyle = "#db6b39";
  ctx.fillRect(x + 5 * sx, y + 24 * sy, 20 * sx, 18 * sy);
  ctx.fillStyle = "#1a1e35";
  ctx.fillRect(x + 3 * sx, y + 40 * sy, 10 * sx, 2 * sy);
  ctx.fillRect(x + 17 * sx, y + 40 * sy, 10 * sx, 2 * sy);

  ctx.fillStyle = "#1f2444";
  const eyeX = player.facing > 0 ? x + 18 * sx : x + 10 * sx;
  ctx.fillRect(eyeX, y + 15 * sy, 3 * sx, 3 * sy);
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

  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.font = '18px "Trebuchet MS", Verdana, sans-serif';
  ctx.textAlign = "left";
  ctx.fillText(`Time ${elapsed.toFixed(1)}s`, 18, 34);
  ctx.fillText(`Life ${lives}/${LIFE_MAX}`, 18, 60);
}

function render() {
  ctx.clearRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
  drawBackground();
  drawGoal();
  drawTiles();
  drawItemBlocks();
  drawMushrooms();
  drawEnemies();
  drawPlayer();
  drawForeground();

  if (selfTestResult) {
    drawSelfTestOverlay();
  }
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
  const inputToken = getInputToken(event);
  if (inputToken !== null) {
    event.preventDefault();
  }

  if (inputToken !== null && !keys.has(inputToken)) {
    justPressed.add(inputToken);
  }
  if (inputToken !== null) {
    keys.add(inputToken);
  }
});

window.addEventListener("keyup", (event) => {
  const inputToken = getInputToken(event);
  if (inputToken !== null) {
    keys.delete(inputToken);
  }
});

function getInputToken(event) {
  const code = typeof event.code === "string" ? event.code : "";
  const key = typeof event.key === "string" ? event.key : "";
  const keyLower = key.toLowerCase();

  if (code === "ArrowLeft" || key === "ArrowLeft" || keyLower === "a") {
    return "left";
  }
  if (code === "ArrowRight" || key === "ArrowRight" || keyLower === "d") {
    return "right";
  }
  if (
    code === "Space" ||
    code === "ArrowUp" ||
    code === "KeyW" ||
    key === " " ||
    key === "Spacebar" ||
    key === "ArrowUp" ||
    keyLower === "w"
  ) {
    return "jump";
  }
  if (code === "Enter" || key === "Enter") {
    return "start";
  }

  return null;
}

function drawSelfTestOverlay() {
  const panelWidth = 520;
  const panelHeight = 210;
  const x = VIEWPORT_WIDTH - panelWidth - 18;
  const y = 18;

  ctx.fillStyle = "rgba(24, 30, 56, 0.82)";
  ctx.fillRect(x, y, panelWidth, panelHeight);
  ctx.strokeStyle = "rgba(255, 236, 178, 0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, panelWidth, panelHeight);

  ctx.fillStyle = "#ffeebd";
  ctx.font = 'bold 18px "Trebuchet MS", Verdana, sans-serif';
  ctx.textAlign = "left";
  ctx.fillText("AUTOTEST RESULT", x + 14, y + 28);

  ctx.font = '16px "Trebuchet MS", Verdana, sans-serif';
  selfTestResult.lines.forEach((line, index) => {
    ctx.fillStyle = line.startsWith("PASS") ? "#8ef0a5" : "#ffb0b0";
    ctx.fillText(line, x + 14, y + 56 + index * 28);
  });
}

function runSelfTest() {
  const lines = [];
  const fail = (label) => lines.push(`FAIL ${label}`);
  const pass = (label) => lines.push(`PASS ${label}`);

  resetRun();
  changeState(GameState.PLAYING);

  const block = itemBlocks[0];
  if (!block) {
    fail("item block exists");
  } else {
    player.x = block.x + (block.width - player.width) * 0.5;
    player.previousY = block.y + block.height + 6;
    player.y = block.y + block.height - 1;
    player.vy = -220;
    resolveItemBlockCollisions(player, "y");

    if (!block.used) {
      fail("block triggers by jump hit");
    } else {
      pass("block triggers by jump hit");
    }

    const mushroom = mushrooms.find((item) => item.active);
    if (!mushroom) {
      fail("mushroom spawns from block");
    } else if (mushroom.y > block.y) {
      fail("mushroom spawns above block");
    } else {
      pass("mushroom spawn position");
    }
  }

  const firstMushroom = mushrooms.find((item) => item.active);
  if (!firstMushroom) {
    fail("mushroom collect test setup");
  } else {
    player.x = firstMushroom.x;
    player.y = firstMushroom.y;
    handleMushroomCollection();
    if (lives === 2 && player.height === PLAYER_FORMS.large.height) {
      pass("collect => life up + large form");
    } else {
      fail("collect => life up + large form");
    }
  }

  const enemy = enemies.find((item) => item.alive);
  if (!enemy) {
    fail("enemy exists for hit test");
  } else {
    player.x = enemy.x;
    player.y = enemy.y;
    player.previousY = player.y;
    player.vy = 0;
    player.invulnerableUntil = 0;
    setLives(2);
    handleEnemyCollisions();

    const lifeAfterFirstHit = lives;
    const invUntil = player.invulnerableUntil;
    handleEnemyCollisions();
    const lifeAfterSecondHit = lives;

    if (lifeAfterFirstHit === 1 && invUntil > performance.now()) {
      pass("enemy hit consumes 1 life");
    } else {
      fail("enemy hit consumes 1 life");
    }

    if (lifeAfterSecondHit === 1) {
      pass("1s invulnerable prevents re-hit");
    } else {
      fail("1s invulnerable prevents re-hit");
    }
  }

  setLives(2);
  consumeLives(LIFE_MAX);
  if (state === GameState.GAMEOVER && lives === 0) {
    pass("fall rule consumes all lives to game over");
  } else {
    fail("fall rule consumes all lives to game over");
  }

  selfTestResult = { lines };
  resetRun();
  changeState(GameState.PLAYING);
  stateLabel.textContent = "AUTOTEST";
  hintLabel.textContent = "See result panel";
}

resetRun();
changeState(GameState.TITLE);
const autoTestBySearch = new URLSearchParams(window.location.search).get("autotest") === "1";
const autoTestByHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("autotest") === "1";
if (autoTestBySearch || autoTestByHash) {
  runSelfTest();
}
requestAnimationFrame(frame);
