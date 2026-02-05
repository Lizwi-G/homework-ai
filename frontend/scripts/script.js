// Navigation
const navButtons = document.querySelectorAll(".nav-item[data-view]");
const views = {
  home: document.getElementById("view-home"),
  resources: document.getElementById("view-resources"),
  saved: document.getElementById("view-saved"),
  calculator: document.getElementById("view-calculator")
};

const pageTitle = document.getElementById("pageTitle");
const pageSub = document.getElementById("pageSub");

function setView(view) {
  Object.values(views).forEach(v => v.classList.remove("active"));
  views[view].classList.add("active");

  navButtons.forEach(b => b.classList.remove("active"));
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add("active");

  if (view === "home") {
    pageTitle.textContent = "Homework";
    pageSub.textContent = "Ask a question and get help instantly.";
  } else if (view === "resources") {
    pageTitle.textContent = "Resources";
    pageSub.textContent = "Curriculum-aligned learning materials.";
  } else if (view === "saved") {
    pageTitle.textContent = "Saved";
    pageSub.textContent = "Your revision list.";
  } else if (view === "calculator") {
    pageTitle.textContent = "Calculator";
    pageSub.textContent = "A fast, accurate calculator with keyboard support.";
  }
}

navButtons.forEach(btn => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

// Elements
const gradeEl = document.getElementById("grade");
const subjectEl = document.getElementById("subject");
const questionEl = document.getElementById("question");
const resultEl = document.getElementById("result");
const answerTitleEl = document.getElementById("answerTitle");
const answerSubEl = document.getElementById("answerSub");
const askBtn = document.getElementById("askBtn");
const clearBtn = document.getElementById("clearBtn");
const saveBtn = document.getElementById("saveBtn");

const videoRow = document.getElementById("videoRow");
const videoLink = document.getElementById("videoLink");

const savedList = document.getElementById("savedList");
const savedEmpty = document.getElementById("savedEmpty");

let lastSavePayload = null;

window.onload = () => {
  renderSaved();
  setView("home");
};

clearBtn.addEventListener("click", () => {
  questionEl.value = "";
  resultEl.textContent = "Ask a question to get started.";
  answerTitleEl.textContent = "Answer";
  answerSubEl.textContent = "Your explanation will appear here.";
  videoRow.style.display = "none";
  saveBtn.disabled = true;
  lastSavePayload = null;
});

askBtn.addEventListener("click", askQuestion);

saveBtn.addEventListener("click", () => {
  if (!lastSavePayload) return;
  saveForRevision(lastSavePayload);
  setView("saved");
});

async function askQuestion() {
  const grade = gradeEl.value;
  const subject = subjectEl.value;
  const question = questionEl.value.trim();

  if (!grade || !subject) return alert("Please select Grade and Subject");
  if (!question) return alert("Please enter a question");

  askBtn.disabled = true;
  saveBtn.disabled = true;
  resultEl.textContent = "Working on it...";

  videoRow.style.display = "none";
  lastSavePayload = null;

  try {
    const response = await fetch("http://localhost:5000/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, grade, subject })
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      resultEl.textContent = data.error || "Something went wrong.";
      answerSubEl.textContent = "Please try again.";
      askBtn.disabled = false;
      return;
    }

    answerTitleEl.textContent = data.title || "Answer";
    answerSubEl.textContent = "Here’s a clear explanation:";
    resultEl.textContent = data.answer || "No answer available.";

    // Video (optional)
    if (data.video) {
      videoRow.style.display = "block";
      videoLink.href = data.video;
    }

    // Allow saving if there is a video or if you want to save answers too
    lastSavePayload = {
      title: data.title || "Saved Answer",
      video: data.video || ""
    };
    saveBtn.disabled = false;

  } catch (e) {
    resultEl.textContent = "Error connecting to server ❌ (check backend is running)";
    answerSubEl.textContent = "Try again after starting the backend.";
  } finally {
    askBtn.disabled = false;
  }
}

// LocalStorage “Saved”
function saveForRevision(payload) {
  const saved = JSON.parse(localStorage.getItem("savedTopics")) || [];

  // avoid duplicates by title + video
  const exists = saved.some(x => x.title === payload.title && x.video === payload.video);
  if (exists) return alert("Already saved ✔️");

  saved.unshift(payload);
  localStorage.setItem("savedTopics", JSON.stringify(saved));
  renderSaved();
}

function renderSaved() {
  const saved = JSON.parse(localStorage.getItem("savedTopics")) || [];
  savedList.innerHTML = "";

  if (saved.length === 0) {
    savedEmpty.style.display = "block";
    return;
  }

  savedEmpty.style.display = "none";

  saved.forEach(item => {
    const li = document.createElement("li");
    li.className = "saved-item";
    li.innerHTML = `
      <div style="font-weight:800; margin-bottom:6px;">${escapeHtml(item.title)}</div>
      ${item.video ? `<a href="${item.video}" target="_blank" rel="noopener">Open video</a>` : `<span class="muted">No video linked</span>`}
    `;
    savedList.appendChild(li);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
// ---------------------------
// ---------------------------
// Scientific Calculator (safe parser)
// ---------------------------
const calcInput = document.getElementById("calcInput");
const calcHistory = document.getElementById("calcHistory");
const calcButtons = document.querySelectorAll(".calc-btn");

let DEG_MODE = true; // degrees by default
let MEMORY = 0;

function normalizeExpr(expr) {
  return expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/%/g, "*0.01")
    .replace(/π/g, String(Math.PI));
}

function degToRad(x) {
  return DEG_MODE ? (x * Math.PI) / 180 : x;
}

function tokenize(expr) {
  const s = expr.replace(/\s+/g, "");
  const tokens = [];
  let num = "";

  const flushNum = () => {
    if (num) {
      tokens.push(num);
      num = "";
    }
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if ("0123456789.".includes(c)) {
      num += c;
      continue;
    }

    flushNum();

    // unary minus
    if (c === "-" && (tokens.length === 0 || ["+", "-", "*", "/", "(", "^"].includes(tokens[tokens.length - 1]))) {
      tokens.push("u-");
      continue;
    }

    if ("+-*/()^".includes(c)) tokens.push(c);
    else throw new Error("Invalid character");
  }

  flushNum();
  return tokens;
}

function toRPN(tokens) {
  const out = [];
  const ops = [];
  const prec = { "u-": 4, "^": 3, "*": 2, "/": 2, "+": 1, "-": 1 };
  const rightAssoc = { "u-": true, "^": true };

  for (const t of tokens) {
    if (!isNaN(t)) out.push(t);
    else if (t in prec) {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (!(top in prec)) break;

        const cond = rightAssoc[t] ? prec[t] < prec[top] : prec[t] <= prec[top];
        if (cond) out.push(ops.pop());
        else break;
      }
      ops.push(t);
    } else if (t === "(") ops.push(t);
    else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop());
      if (ops.pop() !== "(") throw new Error("Mismatched parentheses");
    } else {
      throw new Error("Invalid token");
    }
  }

  while (ops.length) {
    const op = ops.pop();
    if (op === "(" || op === ")") throw new Error("Mismatched parentheses");
    out.push(op);
  }

  return out;
}

function evalRPN(rpn) {
  const st = [];
  for (const t of rpn) {
    if (!isNaN(t)) st.push(parseFloat(t));
    else if (t === "u-") {
      const a = st.pop();
      st.push(-a);
    } else {
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) throw new Error("Bad expression");
      if (t === "+") st.push(a + b);
      if (t === "-") st.push(a - b);
      if (t === "*") st.push(a * b);
      if (t === "/") st.push(a / b);
      if (t === "^") st.push(Math.pow(a, b));
    }
  }
  if (st.length !== 1) throw new Error("Bad expression");
  return st[0];
}

function compute(exprRaw) {
  const expr = normalizeExpr(exprRaw);
  const tokens = tokenize(expr);
  const rpn = toRPN(tokens);
  const result = evalRPN(rpn);
  return Number.isFinite(result) ? parseFloat(result.toFixed(10)) : result;
}

// --- Helpers for inserting functions ---
// We'll apply functions to the "last number" if it exists; otherwise insert fn(.
function applyUnaryToLastNumber(fnName) {
  const s = calcInput.value.trim();
  if (!s) return;

  // find last number chunk
  const m = s.match(/(-?\d+(\.\d+)?)\s*$/);
  if (!m) {
    // if last is ')', we can't safely parse chunk; just wrap whole expression
    calcInput.value = `${fnName}(${s})`;
    return;
  }

  const numStr = m[1];
  const before = s.slice(0, s.length - numStr.length);
  calcInput.value = `${before}${fnName}(${numStr})`;
}

function evaluateFunctionCall(fnName, x) {
  if (fnName === "sqrt") return Math.sqrt(x);
  if (fnName === "square") return x * x;
  if (fnName === "inv") return 1 / x;

  if (fnName === "sin") return Math.sin(degToRad(x));
  if (fnName === "cos") return Math.cos(degToRad(x));
  if (fnName === "tan") return Math.tan(degToRad(x));

  if (fnName === "log") return Math.log10(x);
  if (fnName === "ln") return Math.log(x);

  throw new Error("Unknown function");
}

// Replace simple fn(number) patterns before compute
function resolveFunctions(expr) {
  // handles nested one level repeatedly until stable
  let prev = null;
  let cur = expr;

  const fnList = ["sqrt","square","inv","sin","cos","tan","log","ln"];

  while (cur !== prev) {
    prev = cur;
    for (const fn of fnList) {
      // match fn(123.45) or fn(-12.3)
      const re = new RegExp(`${fn}\\(([-]?\\d+(?:\\.\\d+)?)\\)`, "g");
      cur = cur.replace(re, (_, num) => {
        const x = parseFloat(num);
        const y = evaluateFunctionCall(fn, x);
        return String(y);
      });
    }
  }

  return cur;
}

function insertValue(v) {
  if (v === ".") {
    const parts = calcInput.value.split(/[\+\-\*\/\(\)\^]/);
    const last = parts[parts.length - 1];
    if (last.includes(".")) return;
  }
  calcInput.value += v;
  calcInput.focus();
}

function backspace() {
  calcInput.value = calcInput.value.slice(0, -1);
  calcInput.focus();
}

function clearAll() {
  calcInput.value = "";
  calcHistory.textContent = "";
  calcInput.focus();
}

function equals() {
  const raw = calcInput.value.trim();
  if (!raw) return;

  try {
    const expr = resolveFunctions(raw);
    const result = compute(expr);
    calcHistory.textContent = raw;
    calcInput.value = String(result);
  } catch {
    calcHistory.textContent = "";
    calcInput.value = "Error";
    setTimeout(() => (calcInput.value = ""), 900);
  }
  calcInput.focus();
}

// --- Memory functions ---
function currentValue() {
  const v = parseFloat(calcInput.value);
  return Number.isFinite(v) ? v : 0;
}
function mc(){ MEMORY = 0; }
function mr(){ calcInput.value = String(MEMORY); }
function mplus(){ MEMORY += currentValue(); }
function mminus(){ MEMORY -= currentValue(); }

// Buttons
calcButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const act = btn.dataset.act;
    const val = btn.dataset.val;

    if (act === "clear") return clearAll();
    if (act === "back") return backspace();
    if (act === "equals") return equals();

    if (act === "toggleDeg") {
      DEG_MODE = !DEG_MODE;
      btn.textContent = DEG_MODE ? "DEG" : "RAD";
      return;
    }

    if (act === "mc") return mc();
    if (act === "mr") return mr();
    if (act === "mplus") return mplus();
    if (act === "mminus") return mminus();

    if (act === "const") {
      const c = btn.dataset.const;
      if (c === "pi") insertValue("π");
      return;
    }

    if (act === "pow") return insertValue("^");

    if (act === "unary") {
      const u = btn.dataset.unary; // sqrt, square, inv
      return applyUnaryToLastNumber(u);
    }

    if (act === "fn") {
      const f = btn.dataset.fn; // sin, cos, tan, log, ln
      return applyUnaryToLastNumber(f);
    }

    if (val) return insertValue(val);
  });
});

// Keyboard support
document.addEventListener("keydown", (e) => {
  if (!views.calculator?.classList.contains("active")) return;

  const k = e.key;

  if ((k >= "0" && k <= "9") || k === "." || k === "(" || k === ")") {
    insertValue(k);
    return;
  }

  if (k === "+" || k === "-" || k === "*" || k === "/" || k === "^") {
    if (k === "*") insertValue("×");
    else if (k === "/") insertValue("÷");
    else insertValue(k);
    return;
  }

  if (k === "Enter") { e.preventDefault(); equals(); return; }
  if (k === "Backspace") { backspace(); return; }
  if (k === "Escape") { clearAll(); return; }
});


