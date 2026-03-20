const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  phaseTitle: document.getElementById("phaseTitle"),
  messageText: document.getElementById("messageText"),
  playerScore: document.getElementById("playerScore"),
  cpuScore: document.getElementById("cpuScore"),
  goalScore: document.getElementById("goalScore"),
  levelSelect: document.getElementById("levelSelect"),
  levelHint: document.getElementById("levelHint"),
  turnBadge: document.getElementById("turnBadge"),
  triesBadge: document.getElementById("triesBadge"),
  livesBadge: document.getElementById("livesBadge"),
  startBtn: document.getElementById("startBtn"),
  resetBtn: document.getElementById("resetBtn"),
};

const config = {
  width: canvas.width,
  height: canvas.height,
  center: { x: canvas.width / 2, y: canvas.height / 2 + 10 },
  goalScore: 3,
  playerSpeed: 220,
  runnerSpeed: 92,
  cpuThrowInterval: 1.25,
  playerThrowCooldown: 0.95,
  projectileSpeed: 420,
};

const keys = new Set();
const random = (min, max) => Math.random() * (max - min) + min;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const normalize = (x, y) => {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
};

let lastTime = 0;
let mouse = { x: 0, y: 0, down: false };
let dragStart = null;

const state = {
  started: false,
  winner: null,
  phase: "idle",
  playerScore: 0,
  cpuScore: 0,
  level: 1,
  attacker: "player",
  attackThrowsLeft: 3,
  playerLives: 3,
  cpuLives: 3,
  message: "Press Start Match to begin.",
  stonesDown: false,
  floatingText: [],
  projectiles: [],
  obstacles: [],
  cpuThrowTimer: 0,
  playerThrowCooldown: 0,
  defenderSpotIndex: 0,
};

function getLevelModifiers() {
  const level = state.level;
  return {
    playerSpeed: config.playerSpeed + (level - 1) * 24,
    runnerSpeed: config.runnerSpeed + (level - 1) * 20,
    cpuThrowInterval: Math.max(0.55, config.cpuThrowInterval - (level - 1) * 0.11),
    playerThrowCooldown: Math.max(0.4, config.playerThrowCooldown - (level - 1) * 0.08),
    projectileSpeed: config.projectileSpeed + (level - 1) * 45,
    cpuAccuracyBonus: (level - 1) * 0.08,
    bounceChance: Math.min(0.7, Math.max(0, (level - 1) * 0.14)),
  };
}

function updateLevelHint() {
  const modifiers = getLevelModifiers();
  ui.levelHint.textContent = `Player ${Math.round(modifiers.playerSpeed)} | CPU ${Math.round(modifiers.runnerSpeed)} | Obstacles ${Math.max(0, state.level - 1)}`;
}

const player = {
  x: 140,
  y: config.height - 140,
  radius: 18,
  carryingStone: null,
};

const cpuRunner = {
  x: config.width - 130,
  y: 130,
  radius: 18,
  carryingStone: null,
};

const ballStart = { x: 130, y: config.height / 2 };
const defenderSpots = [
  { x: 90, y: 120 },
  { x: config.width - 90, y: 130 },
  { x: 115, y: config.height - 120 },
  { x: config.width - 110, y: config.height - 110 },
];

function createStone(x, y, id) {
  return {
    id,
    x,
    y,
    radius: 10,
    stacked: false,
    collected: false,
    carrier: null,
  };
}

let stones = [];

const obstaclePresets = [
  { x: 280, y: 130, width: 12, height: 180, type: "wall" },
  { x: 660, y: 330, width: 12, height: 180, type: "wall" },
  { x: 430, y: 98, width: 150, height: 12, type: "wall" },
  { x: 390, y: 500, width: 170, height: 12, type: "wall" },
  { x: 190, y: 390, width: 54, height: 54, type: "tree" },
  { x: 735, y: 150, width: 56, height: 56, type: "tree" },
];

function circleIntersectsRect(circle, rect) {
  const nearestX = clamp(circle.x, rect.x, rect.x + rect.width);
  const nearestY = clamp(circle.y, rect.y, rect.y + rect.height);
  const dx = circle.x - nearestX;
  const dy = circle.y - nearestY;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

function moveActorWithObstacles(actor, dx, dy) {
  const nextX = clamp(actor.x + dx, 35, config.width - 35);
  const trialX = { x: nextX, y: actor.y, radius: actor.radius };
  if (!state.obstacles.some((obstacle) => circleIntersectsRect(trialX, obstacle))) {
    actor.x = nextX;
  }

  const nextY = clamp(actor.y + dy, 35, config.height - 35);
  const trialY = { x: actor.x, y: nextY, radius: actor.radius };
  if (!state.obstacles.some((obstacle) => circleIntersectsRect(trialY, obstacle))) {
    actor.y = nextY;
  }
}

function rebuildObstacles() {
  const obstacleCount = Math.max(0, state.level - 1);
  state.obstacles = obstaclePresets.slice(0, obstacleCount).map((obstacle, index) => ({
    ...obstacle,
    id: index,
  }));
}

function createStackedStones() {
  stones = Array.from({ length: 7 }, (_, index) =>
    createStone(config.center.x, config.center.y - index * 6, index)
  );
}

function scatterStones() {
  stones.forEach((stone) => {
    const angle = random(0, Math.PI * 2);
    const radius = random(70, 210);
    stone.x = clamp(config.center.x + Math.cos(angle) * radius, 90, config.width - 90);
    stone.y = clamp(config.center.y + Math.sin(angle) * radius, 70, config.height - 70);
    stone.stacked = false;
    stone.collected = false;
    stone.carrier = null;
  });
  state.stonesDown = true;
}

function resetEntities() {
  player.x = 140;
  player.y = config.height - 140;
  player.carryingStone = null;
  cpuRunner.x = config.width - 130;
  cpuRunner.y = 130;
  cpuRunner.carryingStone = null;
  state.projectiles = [];
  rebuildObstacles();
  state.playerLives = 3;
  state.cpuLives = 3;
  state.playerThrowCooldown = 0;
  state.cpuThrowTimer = getLevelModifiers().cpuThrowInterval;
  state.defenderSpotIndex = 0;
  dragStart = null;
}

function setMessage(title, message) {
  ui.phaseTitle.textContent = title;
  ui.messageText.textContent = message;
  state.message = message;
}

function beginRound(attacker) {
  state.attacker = attacker;
  state.phase = attacker === "player" ? "player_attack" : "cpu_attack";
  state.attackThrowsLeft = 3;
  state.stonesDown = false;
  state.winner = null;
  createStackedStones();
  resetEntities();

  if (attacker === "player") {
    setMessage("Your attack", "Drag from the ball on the left and release to knock down the stack.");
  } else {
    setMessage("CPU attack", "The CPU gets three throws. If it succeeds, you defend the rebuild.");
  }
  updateUi();
}

function startMatch() {
  state.level = Number(ui.levelSelect.value);
  state.started = true;
  state.playerScore = 0;
  state.cpuScore = 0;
  ui.goalScore.textContent = String(config.goalScore);
  updateLevelHint();
  beginRound("player");
}

function resetMatch() {
  state.started = false;
  state.phase = "idle";
  state.playerScore = 0;
  state.cpuScore = 0;
  state.level = Number(ui.levelSelect.value);
  state.winner = null;
  createStackedStones();
  resetEntities();
  setMessage("Ready", "Press Start Match to begin.");
  updateLevelHint();
  updateUi();
}

function updateUi() {
  ui.playerScore.textContent = String(state.playerScore);
  ui.cpuScore.textContent = String(state.cpuScore);
  ui.levelSelect.value = String(state.level);
  ui.turnBadge.textContent =
    state.phase === "idle" ? "Turn: none" : `Turn: ${state.attacker === "player" ? "You attack" : "CPU attacks"}`;
  ui.triesBadge.textContent = `Throws left: ${state.attackThrowsLeft}`;
  const lives =
    state.phase === "player_rebuild"
      ? `Your team lives: ${state.playerLives}`
      : state.phase === "cpu_rebuild"
        ? `CPU team lives: ${state.cpuLives}`
        : "Lives: 3";
  ui.livesBadge.textContent = lives;
}

function addFloatingText(text, x, y, color) {
  state.floatingText.push({ text, x, y, color, life: 1.4 });
}

function scorePoint(team) {
  if (team === "player") {
    state.playerScore += 1;
  } else {
    state.cpuScore += 1;
  }

  if (state.playerScore >= config.goalScore || state.cpuScore >= config.goalScore) {
    state.winner = state.playerScore >= config.goalScore ? "player" : "cpu";
    state.phase = "game_over";
    setMessage(
      state.winner === "player" ? "You win the match!" : "CPU wins the match!",
      "Press Reset Match to play again."
    );
  } else {
    const nextAttacker = team === "player" ? "player" : "cpu";
    beginRound(nextAttacker);
  }
  updateUi();
}

function playerAttackThrow(target) {
  if (state.phase !== "player_attack" || state.attackThrowsLeft <= 0) {
    return;
  }

  state.attackThrowsLeft -= 1;
  const hit = distance(target, config.center) < 44;

  if (hit) {
    scatterStones();
    state.phase = "player_rebuild";
    setMessage("Rebuild phase", "Collect all 7 stones and rebuild the pillar before the CPU knocks your team out.");
    addFloatingText("Direct hit!", config.center.x, config.center.y - 60, "#2d6a4f");
  } else if (state.attackThrowsLeft === 0) {
    addFloatingText("Missed", target.x, target.y, "#9d0208");
    beginRound("cpu");
    return;
  } else {
    addFloatingText("Missed", target.x, target.y, "#9d0208");
    setMessage("Your attack", `Missed. You have ${state.attackThrowsLeft} throw(s) left.`);
  }

  updateUi();
}

function cpuAttackSequence() {
  if (state.phase !== "cpu_attack" || state.winner) {
    return;
  }

  const attemptsUsed = 3 - state.attackThrowsLeft;
  const accuracy = 0.4 + attemptsUsed * 0.18 + getLevelModifiers().cpuAccuracyBonus;
  const willHit = Math.random() < accuracy;

  state.attackThrowsLeft -= 1;
  if (willHit) {
    scatterStones();
    state.phase = "cpu_rebuild";
    setMessage("Defend the pile", "Click to throw from the highlighted spot and stop the CPU runners.");
    addFloatingText("CPU hit the stack", config.center.x, config.center.y - 70, "#b08900");
  } else if (state.attackThrowsLeft === 0) {
    setMessage("CPU missed", "The CPU failed in three throws. Your team attacks again.");
    setTimeout(() => beginRound("player"), 900);
  } else {
    setMessage("CPU attack", `CPU missed. ${state.attackThrowsLeft} throw(s) left.`);
  }

  updateUi();
}

function getNearestLooseStone(actor) {
  const available = stones.filter((stone) => !stone.stacked && !stone.collected && !stone.carrier);
  if (!available.length) {
    return null;
  }

  return available.reduce((closest, stone) =>
    distance(actor, stone) < distance(actor, closest) ? stone : closest
  );
}

function deliverStone(actor, stone, carrierName) {
  stone.stacked = true;
  stone.collected = false;
  stone.carrier = null;
  stone.x = config.center.x;
  stone.y = config.center.y - stackedStoneCount() * 6;
  if (carrierName === "player") {
    player.carryingStone = null;
  } else {
    cpuRunner.carryingStone = null;
  }
}

function stackedStoneCount() {
  return stones.filter((stone) => stone.stacked).length;
}

function updatePlayerRebuild(dt) {
  const horizontal = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
  const vertical = (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
  const dir = normalize(horizontal, vertical);
  const modifiers = getLevelModifiers();

  if (horizontal || vertical) {
    moveActorWithObstacles(player, dir.x * modifiers.playerSpeed * dt, dir.y * modifiers.playerSpeed * dt);
  }

  if (!player.carryingStone) {
    for (const stone of stones) {
      if (!stone.stacked && !stone.collected && distance(player, stone) < player.radius + stone.radius + 6) {
        stone.collected = true;
        stone.carrier = "player";
        player.carryingStone = stone;
        addFloatingText("Picked up stone", player.x, player.y - 28, "#2d6a4f");
        break;
      }
    }
  }

  if (player.carryingStone) {
    player.carryingStone.x = player.x + 16;
    player.carryingStone.y = player.y - 18;

    if (distance(player, config.center) < 44) {
      deliverStone(player, player.carryingStone, "player");
      addFloatingText(`${stackedStoneCount()}/7 stacked`, config.center.x, config.center.y - 50, "#2d6a4f");
      if (stackedStoneCount() === 7) {
        setMessage("Pillar rebuilt", "You rebuilt all 7 stones first.");
        scorePoint("player");
        return;
      }
    }
  }

  state.cpuThrowTimer -= dt;
  if (state.cpuThrowTimer <= 0) {
    const source = defenderSpots[Math.floor(Math.random() * defenderSpots.length)];
    const aim = {
      x: player.x + random(-24, 24),
      y: player.y + random(6, 28),
    };
    launchProjectile(source, aim, "cpu");
    state.cpuThrowTimer = modifiers.cpuThrowInterval;
  }

}

function updateCpuRebuild(dt) {
  const modifiers = getLevelModifiers();
  state.playerThrowCooldown = Math.max(0, state.playerThrowCooldown - dt);
  const targetStone = cpuRunner.carryingStone ? null : getNearestLooseStone(cpuRunner);
  const destination = cpuRunner.carryingStone ? config.center : targetStone;

  if (destination) {
    const dir = normalize(destination.x - cpuRunner.x, destination.y - cpuRunner.y);
    moveActorWithObstacles(cpuRunner, dir.x * modifiers.runnerSpeed * dt, dir.y * modifiers.runnerSpeed * dt);
  }

  if (targetStone && !cpuRunner.carryingStone && distance(cpuRunner, targetStone) < cpuRunner.radius + targetStone.radius + 4) {
    targetStone.collected = true;
    targetStone.carrier = "cpu";
    cpuRunner.carryingStone = targetStone;
  }

  if (cpuRunner.carryingStone) {
    cpuRunner.carryingStone.x = cpuRunner.x + 16;
    cpuRunner.carryingStone.y = cpuRunner.y - 18;
    if (distance(cpuRunner, config.center) < 42) {
      deliverStone(cpuRunner, cpuRunner.carryingStone, "cpu");
      addFloatingText(`CPU stacked ${stackedStoneCount()}/7`, config.center.x, config.center.y - 70, "#b08900");
      if (stackedStoneCount() === 7) {
        setMessage("CPU rebuilt the pillar", "The CPU stacked all 7 stones first.");
        scorePoint("cpu");
        return;
      }
    }
  }
}

function launchProjectile(from, to, team) {
  const dir = normalize(to.x - from.x, to.y - from.y);
  const speed = getLevelModifiers().projectileSpeed;
  state.projectiles.push({
    x: from.x,
    y: from.y,
    vx: dir.x * speed,
    vy: dir.y * speed,
    radius: 9,
    owner: team,
    bounced: false,
  });
}

function handleObstacleCollision(projectile) {
  for (const obstacle of state.obstacles) {
    if (!circleIntersectsRect(projectile, obstacle)) {
      continue;
    }

    const nearestX = clamp(projectile.x, obstacle.x, obstacle.x + obstacle.width);
    const nearestY = clamp(projectile.y, obstacle.y, obstacle.y + obstacle.height);
    const dx = projectile.x - nearestX;
    const dy = projectile.y - nearestY;
    const modifiers = getLevelModifiers();

    if (!projectile.bounced && Math.random() < modifiers.bounceChance) {
      if (Math.abs(dx) > Math.abs(dy)) {
        projectile.vx *= -0.92;
      } else {
        projectile.vy *= -0.92;
      }
      projectile.bounced = true;
      projectile.x += projectile.vx * 0.02;
      projectile.y += projectile.vy * 0.02;
      addFloatingText("Ricochet!", obstacle.x + obstacle.width / 2, obstacle.y - 8, "#7b341e");
      return false;
    }

    addFloatingText("Blocked", obstacle.x + obstacle.width / 2, obstacle.y - 8, "#6f6756");
    return true;
  }

  return false;
}

function updateProjectiles(dt) {
  const remaining = [];

  for (const projectile of state.projectiles) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;

    const inBounds =
      projectile.x > -20 &&
      projectile.x < config.width + 20 &&
      projectile.y > -20 &&
      projectile.y < config.height + 20;

    if (!inBounds) {
      continue;
    }

    if (handleObstacleCollision(projectile)) {
      continue;
    }

    if (projectile.owner === "cpu" && state.phase === "player_rebuild") {
      const hit = distance(projectile, player) < projectile.radius + player.radius;
      const belowWaist = projectile.y > player.y + 4;
      if (hit && belowWaist) {
        state.playerLives -= 1;
        addFloatingText("Below-knee hit", player.x, player.y - 40, "#9d0208");
        if (state.playerLives <= 0) {
          scorePoint("cpu");
          return;
        }
        player.x = 140;
        player.y = config.height - 140;
        if (player.carryingStone) {
          player.carryingStone.collected = false;
          player.carryingStone.carrier = null;
          player.carryingStone = null;
        }
        updateUi();
        continue;
      }
    }

    if (projectile.owner === "player" && state.phase === "cpu_rebuild") {
      const hit = distance(projectile, cpuRunner) < projectile.radius + cpuRunner.radius;
      const belowWaist = projectile.y > cpuRunner.y + 4;
      if (hit && belowWaist) {
        state.cpuLives -= 1;
        addFloatingText("Runner hit", cpuRunner.x, cpuRunner.y - 36, "#2d6a4f");
        if (cpuRunner.carryingStone) {
          cpuRunner.carryingStone.collected = false;
          cpuRunner.carryingStone.carrier = null;
          cpuRunner.carryingStone = null;
        }
        cpuRunner.x = config.width - 130;
        cpuRunner.y = 130;
        if (state.cpuLives <= 0) {
          scorePoint("player");
          return;
        }
        updateUi();
        continue;
      }
    }

    remaining.push(projectile);
  }

  state.projectiles = remaining;
}

function updateFloatingText(dt) {
  state.floatingText = state.floatingText
    .map((item) => ({ ...item, y: item.y - 18 * dt, life: item.life - dt }))
    .filter((item) => item.life > 0);
}

function drawField() {
  ctx.clearRect(0, 0, config.width, config.height);

  ctx.fillStyle = "#cfb482";
  ctx.fillRect(0, 0, config.width, config.height);

  ctx.strokeStyle = "rgba(69, 48, 27, 0.22)";
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, config.width - 48, config.height - 48);

  ctx.beginPath();
  ctx.arc(config.center.x, config.center.y, 50, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(30, 42, 32, 0.18)";
  ctx.stroke();

  defenderSpots.forEach((spot, index) => {
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, 18, 0, Math.PI * 2);
    ctx.fillStyle = index === state.defenderSpotIndex && state.phase === "cpu_rebuild" ? "rgba(45, 106, 79, 0.28)" : "rgba(123, 52, 30, 0.12)";
    ctx.fill();
  });
}

function drawObstacles() {
  for (const obstacle of state.obstacles) {
    if (obstacle.type === "tree") {
      const trunkWidth = Math.max(12, Math.round(obstacle.width * 0.24));
      const trunkHeight = Math.max(18, Math.round(obstacle.height * 0.34));
      const trunkX = obstacle.x + obstacle.width / 2 - trunkWidth / 2;
      const trunkY = obstacle.y + obstacle.height - trunkHeight;

      ctx.fillStyle = "#6f4e37";
      ctx.beginPath();
      ctx.roundRect(trunkX, trunkY, trunkWidth, trunkHeight, 6);
      ctx.fill();

      ctx.fillStyle = "#4f772d";
      ctx.beginPath();
      ctx.arc(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height * 0.42, obstacle.width * 0.38, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#5e8c31";
      ctx.beginPath();
      ctx.arc(obstacle.x + obstacle.width * 0.36, obstacle.y + obstacle.height * 0.48, obstacle.width * 0.23, 0, Math.PI * 2);
      ctx.arc(obstacle.x + obstacle.width * 0.66, obstacle.y + obstacle.height * 0.48, obstacle.width * 0.23, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    ctx.fillStyle = "rgba(93, 74, 52, 0.92)";
    ctx.beginPath();
    ctx.roundRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 8);
    ctx.fill();

    ctx.fillStyle = "rgba(229, 211, 179, 0.25)";
    if (obstacle.width > obstacle.height) {
      ctx.beginPath();
      ctx.roundRect(obstacle.x + 10, obstacle.y + 2, obstacle.width - 20, 4, 4);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.roundRect(obstacle.x + 2, obstacle.y + 10, 4, obstacle.height - 20, 4);
      ctx.fill();
    }
  }
}

function drawStack() {
  if (!state.stonesDown) {
    for (let i = 0; i < 7; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "#91724b" : "#755836";
      ctx.beginPath();
      ctx.roundRect(config.center.x - 22, config.center.y - i * 6 - 6, 44, 10, 4);
      ctx.fill();
    }
  }

  for (const stone of stones) {
    if (state.stonesDown || stone.stacked) {
      ctx.beginPath();
      ctx.fillStyle = stone.stacked ? "#755836" : "#8c6b43";
      ctx.arc(stone.x, stone.y, stone.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCharacters() {
  if (state.phase === "player_attack") {
    ctx.beginPath();
    ctx.arc(ballStart.x, ballStart.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = "#c84630";
    ctx.fill();

    if (dragStart && mouse.down) {
      ctx.beginPath();
      ctx.moveTo(dragStart.x, dragStart.y);
      ctx.lineTo(mouse.x, mouse.y);
      ctx.strokeStyle = "rgba(200, 70, 48, 0.65)";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }

  if (state.phase === "player_rebuild") {
    drawRunner(player.x, player.y, "#1d3557");
  }

  if (state.phase === "cpu_rebuild") {
    const spot = defenderSpots[state.defenderSpotIndex];
    drawThrower(spot.x, spot.y, "#2d6a4f");
    drawRunner(cpuRunner.x, cpuRunner.y, "#9d4edd");
  }
}

function drawRunner(x, y, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y - 20, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 8);
  ctx.lineTo(x, y + 24);
  ctx.moveTo(x, y);
  ctx.lineTo(x - 16, y + 12);
  ctx.moveTo(x, y);
  ctx.lineTo(x + 16, y + 12);
  ctx.moveTo(x, y + 24);
  ctx.lineTo(x - 14, y + 44);
  ctx.moveTo(x, y + 24);
  ctx.lineTo(x + 14, y + 44);
  ctx.stroke();
}

function drawThrower(x, y, color) {
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.22;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawProjectiles() {
  for (const projectile of state.projectiles) {
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
    ctx.fillStyle = projectile.owner === "cpu" ? "#bc4749" : "#2d6a4f";
    ctx.fill();
  }
}

function drawFloatingText() {
  ctx.font = "700 18px Trebuchet MS";
  for (const item of state.floatingText) {
    ctx.globalAlpha = clamp(item.life, 0, 1);
    ctx.fillStyle = item.color;
    ctx.fillText(item.text, item.x - 30, item.y);
  }
  ctx.globalAlpha = 1;
}

function drawHud() {
  ctx.fillStyle = "rgba(255, 249, 238, 0.88)";
  ctx.roundRect(26, 26, 240, 92, 16);
  ctx.fill();
  ctx.fillStyle = "#1e2a20";
  ctx.font = "700 20px Trebuchet MS";
  ctx.fillText(state.phase.replaceAll("_", " "), 40, 58);
  ctx.font = "16px Trebuchet MS";
  ctx.fillText(`Stacked stones: ${stackedStoneCount()}/7`, 40, 84);
  ctx.fillText(`Score: You ${state.playerScore} - ${state.cpuScore} CPU`, 40, 106);
}

function render() {
  drawField();
  drawObstacles();
  drawStack();
  drawCharacters();
  drawProjectiles();
  drawFloatingText();
  drawHud();
}

function update(dt) {
  if (!state.started || state.phase === "game_over" || state.phase === "idle") {
    updateFloatingText(dt);
    render();
    return;
  }

  if (state.phase === "player_rebuild") {
    updatePlayerRebuild(dt);
  } else if (state.phase === "cpu_rebuild") {
    updateCpuRebuild(dt);
  } else if (state.phase === "cpu_attack") {
    state.cpuThrowTimer -= dt;
    if (state.cpuThrowTimer <= 0) {
      cpuAttackSequence();
      state.cpuThrowTimer = getLevelModifiers().cpuThrowInterval;
    }
  }

  updateProjectiles(dt);
  updateFloatingText(dt);
  render();
  updateUi();
}

function loop(timestamp) {
  const dt = Math.min(0.032, (timestamp - lastTime) / 1000 || 0);
  lastTime = timestamp;
  update(dt);
  requestAnimationFrame(loop);
}

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * config.width;
  mouse.y = ((event.clientY - rect.top) / rect.height) * config.height;
});

canvas.addEventListener("mousedown", () => {
  mouse.down = true;
  if (state.phase === "player_attack" && distance(mouse, ballStart) < 28) {
    dragStart = { ...ballStart };
  }
});

canvas.addEventListener("mouseup", () => {
  if (state.phase === "player_attack" && dragStart) {
    playerAttackThrow({ x: mouse.x, y: mouse.y });
  } else if (state.phase === "cpu_rebuild" && state.playerThrowCooldown <= 0) {
    const source = defenderSpots[state.defenderSpotIndex];
    launchProjectile(source, { x: mouse.x, y: mouse.y }, "player");
    state.playerThrowCooldown = getLevelModifiers().playerThrowCooldown;
    state.defenderSpotIndex = (state.defenderSpotIndex + 1) % defenderSpots.length;
    setMessage("Defend the pile", "Throw from marked spots only. Keep the CPU from rebuilding.");
  }
  mouse.down = false;
  dragStart = null;
});

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "W", "A", "S", "D"].includes(event.key)) {
    keys.add(event.key.toLowerCase());
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

ui.startBtn.addEventListener("click", startMatch);
ui.resetBtn.addEventListener("click", resetMatch);
ui.levelSelect.addEventListener("change", () => {
  state.level = Number(ui.levelSelect.value);
  updateLevelHint();
  rebuildObstacles();
  if (state.started && state.phase !== "idle" && state.phase !== "game_over") {
    setMessage("Level updated", `Level ${state.level} speed and obstacles are now active.`);
  } else {
    updateUi();
  }
});

createStackedStones();
resetMatch();
requestAnimationFrame(loop);
