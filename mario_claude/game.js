// ===== 定数 =====
const TILE = 32;
const VW = 800; // ビューポート幅
const VH = 400; // ビューポート高さ
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const MOVE_SPEED = 4;
const ENEMY_SPEED = 1.5;
const PW = 24; // プレイヤー幅
const PH = 32; // プレイヤー高さ
const EW = 28; // エネミー幅
const EH = 28; // エネミー高さ
const CW = 20; // コイン幅

// ===== ステージデータ =====
const STAGE = {
  width: 3200,
  playerStart: { x: 64, y: 300 },
  flagpole: { x: 2944, y: 208 },

  platforms: [
    // 地面（穴あり）
    { x: 0, y: 368, w: 12, h: 1, type: 'ground' },
    { x: 416, y: 368, w: 8, h: 1, type: 'ground' },
    { x: 672, y: 368, w: 6, h: 1, type: 'ground' },
    { x: 832, y: 368, w: 10, h: 1, type: 'ground' },
    { x: 1152, y: 368, w: 8, h: 1, type: 'ground' },
    { x: 1408, y: 368, w: 12, h: 1, type: 'ground' },
    { x: 1792, y: 368, w: 8, h: 1, type: 'ground' },
    { x: 2048, y: 368, w: 16, h: 1, type: 'ground' },
    // 浮遊プラットフォーム
    { x: 160, y: 288, w: 3, h: 1, type: 'brick' },
    { x: 352, y: 240, w: 4, h: 1, type: 'brick' },
    { x: 608, y: 272, w: 3, h: 1, type: 'brick' },
    { x: 928, y: 256, w: 5, h: 1, type: 'brick' },
    { x: 1216, y: 288, w: 3, h: 1, type: 'brick' },
    { x: 1472, y: 224, w: 4, h: 1, type: 'brick' },
    { x: 1760, y: 272, w: 3, h: 1, type: 'brick' },
    { x: 2176, y: 288, w: 4, h: 1, type: 'brick' },
  ],

  enemies: [
    { x: 256, y: 340 },
    { x: 544, y: 340 },
    { x: 960, y: 228 },
    { x: 1504, y: 340 },
    { x: 2240, y: 340 },
  ],

  coins: [
    { x: 180, y: 256 },
    { x: 212, y: 256 },
    { x: 400, y: 208 },
    { x: 432, y: 208 },
    { x: 960, y: 224 },
    { x: 1000, y: 224 },
    { x: 1250, y: 256 },
    { x: 1536, y: 192 },
    { x: 1800, y: 240 },
    { x: 2300, y: 256 },
  ],

  clouds: [
    { x: 120, y: 50, r: 30 },
    { x: 400, y: 70, r: 25 },
    { x: 700, y: 40, r: 35 },
    { x: 1100, y: 60, r: 28 },
    { x: 1500, y: 45, r: 32 },
    { x: 1900, y: 55, r: 26 },
    { x: 2300, y: 50, r: 30 },
    { x: 2700, y: 65, r: 24 },
  ],

  bushes: [
    { x: 80, y: 340, w: 60, h: 28 },
    { x: 600, y: 340, w: 50, h: 28 },
    { x: 1300, y: 340, w: 70, h: 28 },
    { x: 2100, y: 340, w: 55, h: 28 },
  ],
};

// ===== AABB 衝突判定 =====
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ===== プラットフォームタイルリスト（衝突判定用） =====
function buildPlatformRects(platforms) {
  const rects = [];
  for (const p of platforms) {
    for (let tx = 0; tx < p.w; tx++) {
      for (let ty = 0; ty < p.h; ty++) {
        rects.push({
          x: p.x + tx * TILE,
          y: p.y + ty * TILE,
          w: TILE,
          h: TILE,
          type: p.type,
        });
      }
    }
  }
  return rects;
}

// ===== プレイヤークラス =====
class Player {
  constructor(x, y) {
    this.startX = x;
    this.startY = y;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.w = PW;
    this.h = PH;
    this.onGround = false;
    this.facingRight = true;
    this.invincible = false;
    this.invTimer = 0;
    this.dead = false;

    this.el = document.createElement('div');
    this.el.className = 'player';
    this.el.innerHTML = '<div class="player-hat"></div><div class="player-face"></div><div class="player-body"></div>';
  }

  update(keys, dt) {
    if (this.dead) {
      // 死亡ジャンプ
      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      return;
    }

    // 水平移動
    this.vx = 0;
    if (keys.ArrowLeft) { this.vx = -MOVE_SPEED; this.facingRight = false; }
    if (keys.ArrowRight) { this.vx = MOVE_SPEED; this.facingRight = true; }

    // ジャンプ
    if ((keys.ArrowUp || keys.Space) && this.onGround) {
      this.vy = JUMP_FORCE;
      this.onGround = false;
    }

    // 重力
    this.vy += GRAVITY * dt;
    if (this.vy > 15) this.vy = 15;

    // 位置更新
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 左端制限
    if (this.x < 0) this.x = 0;

    // 無敵タイマー
    if (this.invincible) {
      this.invTimer -= dt;
      if (this.invTimer <= 0) {
        this.invincible = false;
        this.el.classList.remove('invincible');
      }
    }

    // 走行アニメーション切り替え
    if (this.onGround && Math.abs(this.vx) > 0) {
      this.el.classList.add('running');
    } else {
      this.el.classList.remove('running');
    }
  }

  takeDamage() {
    if (this.invincible || this.dead) return false;
    this.invincible = true;
    this.invTimer = 90;
    this.vy = JUMP_FORCE * 0.6;
    this.vx = this.facingRight ? -3 : 3;
    this.el.classList.add('invincible');
    return true;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.vy = JUMP_FORCE * 0.8;
    this.vx = 0;
  }

  respawn() {
    this.x = this.startX;
    this.y = this.startY;
    this.vx = 0;
    this.vy = 0;
    this.dead = false;
    this.onGround = false;
    this.invincible = true;
    this.invTimer = 120;
    this.el.classList.add('invincible');
  }

  render(cameraX) {
    this.el.style.left = (this.x - cameraX) + 'px';
    this.el.style.top = this.y + 'px';
    if (!this.facingRight) {
      this.el.style.transform = 'scaleX(-1)';
    } else {
      this.el.style.transform = '';
    }
  }
}

// ===== エネミークラス =====
class Enemy {
  constructor(x, y) {
    this.startX = x;
    this.startY = y;
    this.x = x;
    this.y = y;
    this.w = EW;
    this.h = EH;
    this.vx = ENEMY_SPEED;
    this.alive = true;
    this.patrolLeft = x - 80;
    this.patrolRight = x + 80;

    this.el = document.createElement('div');
    this.el.className = 'enemy alive';
    this.el.innerHTML = '<div class="enemy-head"><span></span></div><div class="enemy-feet"></div>';
  }

  update(dt) {
    if (!this.alive) return;
    this.x += this.vx * dt;
    if (this.x <= this.patrolLeft) this.vx = Math.abs(this.vx);
    if (this.x >= this.patrolRight) this.vx = -Math.abs(this.vx);
  }

  defeat() {
    this.alive = false;
    this.el.className = 'enemy defeated';
  }

  respawn() {
    this.alive = true;
    this.x = this.startX;
    this.y = this.startY;
    this.vx = ENEMY_SPEED;
    this.el.className = 'enemy alive';
  }

  render(cameraX) {
    this.el.style.left = (this.x - cameraX) + 'px';
    this.el.style.top = this.y + 'px';
  }
}

// ===== コインクラス =====
class Coin {
  constructor(x, y) {
    this.startX = x;
    this.startY = y;
    this.x = x;
    this.y = y;
    this.w = CW;
    this.h = CW;
    this.collected = false;

    this.el = document.createElement('div');
    this.el.className = 'coin';
  }

  collect() {
    if (this.collected) return;
    this.collected = true;
    this.el.className = 'coin collected';
    setTimeout(() => { if (this.el.parentNode) this.el.remove(); }, 300);
  }

  respawn() {
    this.collected = false;
    this.el = document.createElement('div');
    this.el.className = 'coin';
  }

  render(cameraX) {
    if (this.collected) return;
    this.el.style.left = (this.x - cameraX) + 'px';
    this.el.style.top = this.y + 'px';
  }
}

// ===== ゲームメインクラス =====
class MarioGame {
  constructor() {
    this.worldEl = document.getElementById('game-world');
    this.cameraX = 0;
    this.score = 0;
    this.lives = 3;
    this.gameRunning = false;
    this.keys = {};
    this.platformRects = [];
    this.enemies = [];
    this.coins = [];
    this.player = null;
    this.flagpoleEl = null;
    this.animFrameId = null;
    this.lastTime = 0;
  }

  // 初期化
  init() {
    this.worldEl.style.width = STAGE.width + 'px';
    this.bindInput();
    this.bindButtons();
    this.showScreen('start');
  }

  // ゲーム開始
  start() {
    this.score = 0;
    this.lives = 3;
    this.gameRunning = true;
    this.cameraX = 0;
    this.clearWorld();
    this.createStage();
    this.updateHUD();
    this.showScreen('none');
    this.lastTime = performance.now();
    this.animFrameId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  // ゲームループ
  gameLoop(timestamp) {
    if (!this.gameRunning) return;
    const dt = Math.min((timestamp - this.lastTime) / 16.67, 3);
    this.lastTime = timestamp;

    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.checkCollisions();
    this.updateCamera();
    this.renderAll();

    this.animFrameId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  // ステージ生成
  createStage() {
    // クラウド
    for (const c of STAGE.clouds) {
      const el = document.createElement('div');
      el.className = 'cloud';
      el.style.left = c.x + 'px';
      el.style.top = c.y + 'px';
      el.style.width = (c.r * 2) + 'px';
      el.style.height = (c.r * 1.2) + 'px';
      this.worldEl.appendChild(el);
    }

    // 低木
    for (const b of STAGE.bushes) {
      const el = document.createElement('div');
      el.className = 'bush';
      el.style.left = b.x + 'px';
      el.style.top = b.y + 'px';
      el.style.width = b.w + 'px';
      el.style.height = b.h + 'px';
      this.worldEl.appendChild(el);
    }

    // プラットフォーム
    this.platformRects = buildPlatformRects(STAGE.platforms);
    for (const p of STAGE.platforms) {
      for (let tx = 0; tx < p.w; tx++) {
        for (let ty = 0; ty < p.h; ty++) {
          const tile = document.createElement('div');
          tile.className = 'platform-tile ' + (p.type === 'ground' ? 'ground-tile' : 'brick-tile');
          tile.style.left = (p.x + tx * TILE) + 'px';
          tile.style.top = (p.y + ty * TILE) + 'px';
          this.worldEl.appendChild(tile);
        }
      }
    }

    // プレイヤー
    this.player = new Player(STAGE.playerStart.x, STAGE.playerStart.y);
    this.worldEl.appendChild(this.player.el);

    // エネミー
    this.enemies = STAGE.enemies.map(e => {
      const enemy = new Enemy(e.x, e.y);
      this.worldEl.appendChild(enemy.el);
      return enemy;
    });

    // コイン
    this.coins = STAGE.coins.map(c => {
      const coin = new Coin(c.x, c.y);
      this.worldEl.appendChild(coin.el);
      return coin;
    });

    // フラグポール
    this.flagpoleEl = document.createElement('div');
    this.flagpoleEl.className = 'flagpole';
    this.flagpoleEl.style.left = STAGE.flagpole.x + 'px';
    this.flagpoleEl.style.top = STAGE.flagpole.y + 'px';
    this.flagpoleEl.innerHTML = '<div class="flagpole-top"></div><div class="flag"></div>';
    this.worldEl.appendChild(this.flagpoleEl);
  }

  // ワールドクリア
  clearWorld() {
    while (this.worldEl.firstChild) {
      this.worldEl.removeChild(this.worldEl.firstChild);
    }
  }

  // プレイヤー更新
  updatePlayer(dt) {
    this.player.update(this.keys, dt);

    // 画面下に落ちた
    if (this.player.y > VH + 50) {
      this.handlePlayerFall();
    }
  }

  // エネミー更新
  updateEnemies(dt) {
    for (const enemy of this.enemies) {
      enemy.update(dt);
    }
  }

  // 衝突判定
  checkCollisions() {
    if (this.player.dead) return;

    const p = {
      x: this.player.x,
      y: this.player.y,
      w: this.player.w,
      h: this.player.h,
    };

    // プラットフォーム衝突
    this.resolvePlatformCollision(p);

    // エネミー衝突
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const e = { x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h };
      if (!rectsOverlap(p, e)) continue;

      // 踏破判定：プレイヤーが落下中且つ敵の上部近くにある
      const isStomp = this.player.vy > 0 &&
        (this.player.y + this.player.h) - enemy.y < 12;

      if (isStomp) {
        enemy.defeat();
        this.player.vy = JUMP_FORCE * 0.5;
        this.score += 5;
        this.updateHUD();
      } else {
        if (this.player.takeDamage()) {
          this.lives--;
          this.updateHUD();
          if (this.lives <= 0) {
            this.player.die();
            setTimeout(() => this.handlePlayerDeath(), 800);
          }
        }
      }
    }

    // コイン衝突
    for (const coin of this.coins) {
      if (coin.collected) continue;
      const c = { x: coin.x, y: coin.y, w: coin.w, h: coin.h };
      if (rectsOverlap(p, c)) {
        coin.collect();
        this.score++;
        this.updateHUD();
      }
    }

    // フラグポール衝突
    const fp = {
      x: STAGE.flagpole.x,
      y: STAGE.flagpole.y,
      w: 40,
      h: 160,
    };
    if (rectsOverlap(p, fp)) {
      this.handleStageClear();
    }
  }

  // プラットフォーム衝突解決
  resolvePlatformCollision(p) {
    const player = this.player;

    // 垂直方向の衝突（prevY は水平移動前のyのみを使用）
    const prevY = p.y - player.vy;
    for (const plat of this.platformRects) {
      const vertP = { x: p.x, y: p.y, w: p.w, h: p.h };
      if (!rectsOverlap(vertP, plat)) continue;
      const prevVertP = { x: p.x, y: prevY, w: p.w, h: p.h };
      if (rectsOverlap(prevVertP, plat)) continue;

      if (player.vy > 0) {
        player.y = plat.y - player.h;
        player.vy = 0;
        player.onGround = true;
      } else if (player.vy < 0) {
        player.y = plat.y + plat.h;
        player.vy = 0;
      }
    }

    // 垂直修正後にpオブジェクトを更新
    p.x = player.x;
    p.y = player.y;

    // 垂直修正後の実際の位置で水平衝突をチェック
    const actualY = player.y;
    const prevX = p.x - player.vx;
    for (const plat of this.platformRects) {
      // 前フレームの位置（水平移動前）
      const prevHorizP = { x: prevX, y: actualY, w: p.w, h: p.h };
      // 今フレームの位置（水平移動後）
      const horizP = { x: p.x, y: actualY, w: p.w, h: p.h };

      // 前フレームから今フレームの間にプラットフォームと衝突していない場合はスキップ
      if (!rectsOverlap(horizP, plat)) continue;
      if (rectsOverlap(prevHorizP, plat)) continue;

      // プレイヤーの脚がプラットフォーム上面に接している場合（上に乗っているだけ）→ スキップ
      const onTop = Math.abs((actualY + player.h) - plat.y) < 2;
      if (onTop) continue; // 表面上の水平移動は常に許可

      // 水平方向の衝突解決
      if (player.vx > 0) {
        player.x = plat.x - player.w;
      } else if (player.vx < 0) {
        player.x = plat.x + plat.w;
      }
    }
  }

  // カメラ更新
  updateCamera() {
    const targetX = this.player.x - VW / 2 + PW / 2;
    this.cameraX = Math.max(0, Math.min(targetX, STAGE.width - VW));
    this.worldEl.style.transform = `translateX(${-this.cameraX}px)`;
  }

  // 全エンティティ描画
  renderAll() {
    this.player.render(this.cameraX);
    for (const enemy of this.enemies) {
      enemy.render(this.cameraX);
    }
    for (const coin of this.coins) {
      coin.render(this.cameraX);
    }
  }

  // プレイヤー落下処理
  handlePlayerFall() {
    this.lives--;
    this.updateHUD();
    if (this.lives <= 0) {
      this.handlePlayerDeath();
    } else {
      this.player.respawn();
      this.cameraX = 0;
    }
  }

  // プレイヤー死亡処理
  handlePlayerDeath() {
    this.gameRunning = false;
    cancelAnimationFrame(this.animFrameId);
    document.getElementById('go-score').textContent = this.score;
    this.showScreen('gameover');
  }

  // ステージクリア処理
  handleStageClear() {
    this.gameRunning = false;
    cancelAnimationFrame(this.animFrameId);
    document.getElementById('clear-score').textContent = this.score;
    this.showScreen('clear');
  }

  // HUD更新
  updateHUD() {
    document.getElementById('score-display').textContent = `コイン: ${this.score}`;
    document.getElementById('lives-display').textContent = `ライフ: ${this.lives}`;
  }

  // 画面切り替え
  showScreen(name) {
    const screens = ['start-screen', 'gameover-screen', 'clear-screen'];
    screens.forEach(id => document.getElementById(id).classList.remove('active'));
    if (name !== 'none') {
      document.getElementById(name + '-screen').classList.add('active');
    }
  }

  // キー入力バインド
  bindInput() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.key] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.key] = false;
    });

    // タッチ操作
    const bindTouch = (id, key) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys[key] = true; });
      el.addEventListener('touchend', (e) => { e.preventDefault(); this.keys[key] = false; });
      el.addEventListener('mousedown', (e) => { e.preventDefault(); this.keys[key] = true; });
      el.addEventListener('mouseup', (e) => { e.preventDefault(); this.keys[key] = false; });
    };
    bindTouch('touch-left', 'ArrowLeft');
    bindTouch('touch-right', 'ArrowRight');
    bindTouch('touch-jump', 'Space');
  }

  // ボタンバインド
  bindButtons() {
    document.getElementById('start-btn').addEventListener('click', () => this.start());
    document.getElementById('retry-btn-go').addEventListener('click', () => this.start());
    document.getElementById('retry-btn-clear').addEventListener('click', () => this.start());
  }
}

// ===== ゲーム起動 =====
const game = new MarioGame();
game.init();
