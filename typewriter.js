const COLUMNS = 48;
const COLUMN_WIDTH = 18;
const LINE_HEIGHT = 42;
const VISIBLE_LINES = 8;
const INK_PER_STRIKE = 0.02;
const MARGIN_BELL_AT = 43;
const WIND_MS = 1500;
const REST_ANGLE = -58;
const HIT_ANGLE = 0;

const SHIFTED_DIGITS = {
  Digit1: "!",
  Digit2: "@",
  Digit3: "#",
  Digit4: "$",
  Digit5: "%",
  Digit6: "^",
  Digit7: "&",
  Digit8: "*",
  Digit9: "(",
  Digit0: ")",
};

const ROWS = [
  ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0"],
  ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP"],
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL"],
  ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM"],
  ["ShiftLeft", "ShiftLock", "Space", "Backspace", "Enter"],
];

const state = {
  lines: [[]],
  col: 0,
  row: 0,
  shift: false,
  shiftLock: false,
  ink: 1,
  ribbonPhase: 0,
  ribbonDirection: 1,
  carriageX: 0,
  busy: false,
  queue: [],
};

let reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let spoolDegrees = 0;
let audioCtx = null;
let wind = null;
let windFrame = 0;
const keyboardShift = new Set();
const pointerShift = new Set();

const carriage = document.getElementById("carriage");
const sheet = document.getElementById("sheet");
const linesEl = document.getElementById("lines");
const ribbon = document.getElementById("ribbon");
const striker = document.getElementById("striker");
const hint = document.getElementById("hint");
const keyboard = document.getElementById("keyboard");
const machine = document.getElementById("machine");
const paperMask = document.getElementById("paper-mask");
const lever = document.getElementById("lever");
const bell = document.getElementById("bell");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function motion(ms) {
  return reduceMotion ? 0 : ms;
}

function mixColor(ink) {
  const t = Math.min(1, Math.max(0, ink));
  const channel = (paper, dark) => Math.round(paper + (dark - paper) * t);
  return `rgb(${channel(0xe3, 0x1a)}, ${channel(0xd0, 0x1a)}, ${channel(0xa8, 0x1a)})`;
}

function labelFor(code) {
  if (code === "Space") return "";
  if (code === "ShiftLeft") return "Shift";
  if (code === "ShiftLock") return "Lock";
  if (code === "Backspace") return "Back";
  if (code === "Enter") return "Return";
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Key")) return code.slice(3);
  return "";
}

function buildKeyboard() {
  ROWS.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "row";
    row.forEach((code) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "key";
      button.dataset.code = code;
      const cap = document.createElement("span");
      cap.className = "keycap";
      cap.textContent = labelFor(code);
      button.appendChild(cap);
      if (code === "Space") {
        button.classList.add("space");
        button.setAttribute("aria-label", "Space");
      }
      if (code === "ShiftLeft" || code === "ShiftLock" || code === "Backspace" || code === "Enter") {
        button.classList.add("word");
      }
      if (code === "ShiftLock") {
        button.setAttribute("aria-pressed", "false");
        button.setAttribute("aria-label", "Shift lock");
      }
      if (code === "ShiftLeft") button.setAttribute("aria-label", "Shift");
      if (code === "Backspace") button.setAttribute("aria-label", "Backspace");
      if (code === "Enter") button.setAttribute("aria-label", "Return");
      button.addEventListener("pointerdown", onKeyPointerDown);
      button.addEventListener("pointerup", onKeyPointerUp);
      button.addEventListener("pointercancel", onKeyPointerUp);
      rowEl.appendChild(button);
    });
    keyboard.appendChild(rowEl);
  });
}

function keyButton(code) {
  const name = code === "ShiftRight" ? "ShiftLeft" : code;
  return keyboard.querySelector(`[data-code="${name}"]`);
}

function paintModifiers() {
  state.shift = keyboardShift.size > 0 || pointerShift.size > 0;
  const shiftBtn = keyButton("ShiftLeft");
  if (shiftBtn) shiftBtn.classList.toggle("held", state.shift);
  const lockBtn = keyButton("ShiftLock");
  if (lockBtn) {
    lockBtn.classList.toggle("held", state.shiftLock);
    lockBtn.setAttribute("aria-pressed", String(state.shiftLock));
  }
}

function depress(code) {
  const button = keyButton(code);
  if (button) button.classList.add("down");
}

function release(code) {
  const button = keyButton(code);
  if (button && code !== "ShiftLeft" && code !== "ShiftRight") {
    button.classList.remove("down");
  }
  paintModifiers();
}

function characterFor(code) {
  if (code === "Space") return " ";
  if (Object.prototype.hasOwnProperty.call(SHIFTED_DIGITS, code)) {
    return state.shift ? SHIFTED_DIGITS[code] : code.slice("Digit".length);
  }
  if (/^Key[A-Z]$/.test(code)) {
    const letter = code.slice(3);
    return state.shift || state.shiftLock ? letter : letter.toLowerCase();
  }
  return null;
}

function resolveCode(code) {
  if (code === "Enter") return { type: "return", code };
  if (code === "Backspace") return { type: "backspace", code };
  const ch = characterFor(code);
  if (ch == null) return null;
  return { type: "print", code, ch };
}

function enqueue(action) {
  if (!action) return;
  if (state.busy) {
    if (state.queue.length < 3) state.queue.push(action);
    return;
  }
  pump(action);
}

async function pump(action) {
  state.busy = true;
  try {
    let next = action;
    while (next) {
      await perform(next);
      next = state.queue.shift();
    }
  } finally {
    state.busy = false;
  }
}

async function perform(action) {
  if (action.type === "print") {
    if (state.col >= COLUMNS) return;
    await strike(action);
    return;
  }
  if (action.type === "backspace") {
    if (state.col === 0) return;
    depress(action.code);
    state.lines[state.row].pop();
    state.col -= 1;
    if (state.col < MARGIN_BELL_AT) clearBell();
    state.carriageX = -state.col * COLUMN_WIDTH;
    setCarriageSpeed(motion(40));
    renderPaper();
    await wait(Math.max(motion(40), 50));
    release(action.code);
    return;
  }
  if (action.type === "return") {
    depress(action.code);
    swingLever();
    clearBell();
    state.row += 1;
    if (!state.lines[state.row]) state.lines.push([]);
    state.col = 0;
    state.carriageX = 0;
    setCarriageSpeed(motion(240));
    renderPaper();
    await wait(Math.max(motion(240), 50));
    release(action.code);
    lever.classList.remove("swing");
    setCarriageSpeed(motion(40));
  }
}

async function strike(action) {
  depress(action.code);
  setStriker(HIT_ANGLE, motion(90));
  await wait(Math.max(motion(90), 50));

  if (state.ink > 0) {
    state.lines[state.row].push({ ch: action.ch, ink: state.ink });
    state.ink = Math.max(0, Number((state.ink - INK_PER_STRIKE).toFixed(4)));
  }
  playClick();
  state.col += 1;
  if (state.col === MARGIN_BELL_AT) ringBell();
  advanceRibbon();
  state.carriageX = -state.col * COLUMN_WIDTH;
  setStriker(REST_ANGLE, motion(70));
  setCarriageSpeed(motion(40));
  renderPaper();
  await wait(motion(70));
  release(action.code);
}

function setStriker(angle, ms) {
  striker.style.transitionDuration = `${ms}ms`;
  striker.style.transform = `translateX(-50%) rotate(${angle}deg)`;
}

function setCarriageSpeed(ms) {
  carriage.style.transitionDuration = `${ms}ms`;
}

function advanceRibbon() {
  const direction = state.ribbonDirection;
  state.ribbonPhase += 0.04 * direction;
  if (state.ribbonPhase >= 1) {
    state.ribbonPhase = 1;
    state.ribbonDirection = -1;
  } else if (state.ribbonPhase <= 0) {
    state.ribbonPhase = 0;
    state.ribbonDirection = 1;
  }
  spoolDegrees += 22 * direction;
}

function lineWindow() {
  const height = paperMask.clientHeight;
  if (!height) return VISIBLE_LINES;
  return Math.max(4, Math.floor(height / LINE_HEIGHT));
}

function fitLine() {
  const width = paperMask.clientWidth || 800;
  const margin = 64;
  const col = Math.min(COLUMN_WIDTH, Math.max(11, (width - margin - 96) / COLUMNS));
  return { margin, col };
}

function renderPaper() {
  const { margin, col } = fitLine();
  machine.style.setProperty("--margin", `${margin}px`);
  machine.style.setProperty("--col", `${col}px`);
  machine.style.setProperty("--strike", `${margin + state.col * col}px`);
  const fragment = document.createDocumentFragment();
  state.lines.forEach((line, r) => {
    const row = document.createElement("div");
    row.className = "line";
    row.style.top = `${r * LINE_HEIGHT}px`;
    line.forEach((glyph, i) => {
      const span = document.createElement("span");
      span.className = "glyph";
      span.textContent = glyph.ch;
      span.style.left = `${i * col}px`;
      span.style.color = mixColor(glyph.ink);
      row.appendChild(span);
    });
    fragment.appendChild(row);
  });
  linesEl.replaceChildren(fragment);
  const y = (lineWindow() - 1) * LINE_HEIGHT - state.row * LINE_HEIGHT;
  carriage.style.transform = `translate(0px, ${y}px)`;
  sheet.style.height = `${320 + Math.max(state.lines.length, lineWindow()) * LINE_HEIGHT + 180}px`;
  renderRibbon();
}

function renderRibbon() {
  ribbon.style.background = mixColor(state.ink);
  document.querySelectorAll(".spool-rotor").forEach((rotor) => {
    rotor.style.transform = `rotate(${spoolDegrees}deg)`;
  });
  const low = state.ink < 0.25;
  hint.classList.toggle("show", low);
  hint.setAttribute("aria-hidden", String(!low));
}

function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (error) {
    audioCtx = null;
  }
}

function playClick() {
  if (!audioCtx) return;
  const length = Math.floor(audioCtx.sampleRate * 0.03);
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 8;
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 900;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.4;
  source.connect(filter).connect(gain).connect(audioCtx.destination);
  source.start();
}

function swingLever() {
  lever.classList.remove("swing");
  void lever.offsetWidth;
  lever.classList.add("swing");
}

function ringBell() {
  bell.classList.add("ring", "warn");
  bell.dataset.state = "ringing";
  playTick();
  window.setTimeout(() => {
    bell.classList.remove("ring");
    if (bell.classList.contains("warn")) bell.dataset.state = "near-margin";
  }, 480);
}

function clearBell() {
  bell.classList.remove("ring", "warn");
  bell.dataset.state = "idle";
}

function playTick() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = 1480;
  gain.gain.setValueAtTime(0.05, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.06);
}

function onKeyPointerDown(event) {
  event.preventDefault();
  unlockAudio();
  const code = event.currentTarget.dataset.code;
  if (code === "ShiftLeft") {
    pointerShift.add(event.pointerId);
    event.currentTarget.setPointerCapture(event.pointerId);
    paintModifiers();
    return;
  }
  if (code === "ShiftLock") {
    state.shiftLock = !state.shiftLock;
    paintModifiers();
    return;
  }
  enqueue(resolveCode(code));
}

function onKeyPointerUp(event) {
  if (!pointerShift.has(event.pointerId)) return;
  pointerShift.delete(event.pointerId);
  paintModifiers();
}

function onKeyboardDown(event) {
  if (event.key === "Shift" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
    keyboardShift.add(event.code);
    paintModifiers();
    unlockAudio();
    return;
  }
  if (event.repeat) return;
  if (event.code === "CapsLock") {
    event.preventDefault();
    state.shiftLock = !state.shiftLock;
    paintModifiers();
    unlockAudio();
    return;
  }
  const action = resolveCode(event.code);
  if (!action) return;
  event.preventDefault();
  unlockAudio();
  enqueue(action);
}

function onKeyboardUp(event) {
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    keyboardShift.delete(event.code);
    paintModifiers();
  }
}

function startWind(event) {
  event.preventDefault();
  unlockAudio();
  wind = { start: performance.now(), startInk: state.ink };
  event.currentTarget.setPointerCapture(event.pointerId);
  cancelAnimationFrame(windFrame);
  windFrame = requestAnimationFrame(stepWind);
}

function stepWind(now) {
  if (!wind) return;
  const t = Math.min(1, (now - wind.start) / WIND_MS);
  state.ink = wind.startInk + (1 - wind.startInk) * t;
  spoolDegrees += 28;
  renderRibbon();
  if (t < 1 && wind) windFrame = requestAnimationFrame(stepWind);
}

function stopWind() {
  wind = null;
}

function layout() {
  renderPaper();
}

lever.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  unlockAudio();
  enqueue({ type: "return", code: "Enter" });
});

document.querySelectorAll(".spool").forEach((spool) => {
  spool.addEventListener("pointerdown", startWind);
  spool.addEventListener("pointerup", stopWind);
  spool.addEventListener("pointercancel", stopWind);
});

document.addEventListener("keydown", onKeyboardDown);
document.addEventListener("keyup", onKeyboardUp);
window.addEventListener("blur", () => {
  keyboardShift.clear();
  pointerShift.clear();
  stopWind();
  paintModifiers();
});
window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (event) => {
  reduceMotion = event.matches;
});
window.addEventListener("resize", layout);

buildKeyboard();
setCarriageSpeed(motion(40));
renderPaper();
layout();
requestAnimationFrame(layout);
