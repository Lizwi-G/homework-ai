const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

function detectMetaFromFilename(filename) {
  const name = filename.toLowerCase();

  // grade detection like "grade7" or "gr7" or "g7"
  const gradeMatch = name.match(/grade\s*([4-9])|gr\s*([4-9])|\bg\s*([4-9])\b/);
  const grade = gradeMatch ? (gradeMatch[1] || gradeMatch[2] || gradeMatch[3]) : null;

  // subject detection
  let subject = null;

  if (name.includes("_nst") || name.includes("nst")) subject = "Natural Sciences";
else if (name.includes("_maths") || name.includes("maths") || name.includes("math")) subject = "Mathematics";


  // Maths variants
  if (name.includes("math") || name.includes("maths") || name.includes("mathematics")) subject = "Mathematics";

  // NST / Natural Sciences variants
  if (name.includes("nst") || name.includes("natural") || name.includes("science") || name.includes("sciences")) subject = "Natural Sciences";

  return { grade, subject };
}

const STOPWORDS = new Set([
  "what","is","are","was","were","the","a","an","of","to","and","or","for","in","on",
  "with","from","about","explain","define","difference","between","how","do","does",
  "can","you","please","give","me","show","steps","step","calculate","solve"
]);

function extractKeywords(query) {
  const cleaned = cleanText(query).toLowerCase();
  const words = cleaned
    .split(" ")
    .map(w => w.replace(/[^a-z0-9]/g, ""))
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));

  // Keep unique + limit
  const unique = [...new Set(words)].slice(0, 12);

  // Also add 2-word phrases (bigrams) to catch concepts like "cell membrane"
  const bigrams = [];
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i], b = words[i+1];
    if (a.length >= 3 && b.length >= 3) bigrams.push(`${a} ${b}`);
  }
  const uniqueBigrams = [...new Set(bigrams)].slice(0, 6);

  return { keywords: unique, phrases: uniqueBigrams };
}

function splitSentences(text) {
  return cleanText(text)
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 40);
}

function buildBetterAnswer(snippets) {
  // snippets: array of strings (top matches)
  const seen = new Set();
  const picked = [];

  for (const snip of snippets) {
    const sentences = splitSentences(snip);
    for (const s of sentences) {
      const key = s.toLowerCase().slice(0, 80); // rough dedupe key
      if (!seen.has(key)) {
        seen.add(key);
        picked.push(s);
      }
      if (picked.length >= 7) break;
    }
    if (picked.length >= 7) break;
  }

  if (picked.length === 0) {
    return snippets[0] || "I found something relevant, but couldn’t extract a clear section. Try rephrasing your question.";
  }

  // Format as a clean paragraph / bullets
  return picked.map(x => `• ${x}`).join("\n");
}


const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

// Load hardcoded CAPS topics/resources
const topics = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "topics.json"), "utf-8"));
const resources = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "resources.json"), "utf-8"));

// ---------------------------
// PDF Indexing (offline search)
// ---------------------------
const PDF_DIR = path.join(__dirname, "pdfs");
const PDF_INDEX_FILE = path.join(__dirname, "pdf_index.json");

// Very simple text cleaning
function cleanText(t) {
  return (t || "")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001F]/g, "")
    .trim();
}

// Build an index from PDFs (filename -> extracted text)
async function buildPdfIndex() {
  if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

  const files = fs.readdirSync(PDF_DIR).filter(f => f.toLowerCase().endsWith(".pdf"));
  const index = [];

  for (const file of files) {
    const fullPath = path.join(PDF_DIR, file);
    const buffer = fs.readFileSync(fullPath);

    try {
      const data = await pdfParse(buffer);
      const text = cleanText(data.text);
      const meta = detectMetaFromFilename(file);
index.push({ file, text, chars: text.length, meta });
      console.log(`Indexed PDF: ${file} (${text.length} chars)`);
    } catch (e) {
      console.log(`Failed to index ${file}:`, e.message);
    }
  }

  fs.writeFileSync(PDF_INDEX_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), index }, null, 2));
  return { updatedAt: new Date().toISOString(), index };
}

// Load index from disk if exists
function loadPdfIndex() {
  if (!fs.existsSync(PDF_INDEX_FILE)) return { updatedAt: null, index: [] };
  try {
    return JSON.parse(fs.readFileSync(PDF_INDEX_FILE, "utf-8"));
  } catch {
    return { updatedAt: null, index: [] };
  }
}

// Simple relevance scoring: count keyword hits
function scoreText(text, keywords) {
  const lower = text.toLowerCase();
  let score = 0;
  for (const k of keywords) {
    const kw = k.toLowerCase();
    const hits = lower.split(kw).length - 1;
    score += hits;
  }
  return score;
}

// Extract a snippet around the best keyword
function bestSnippet(text, keywords) {
  const lower = text.toLowerCase();
  let bestPos = -1;
  let bestKw = "";

  for (const k of keywords) {
    const pos = lower.indexOf(k.toLowerCase());
    if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
      bestPos = pos;
      bestKw = k;
    }
  }

  if (bestPos === -1) return null;

  const start = Math.max(0, bestPos - 180);
  const end = Math.min(text.length, bestPos + 420);
  return {
    keyword: bestKw,
    snippet: cleanText(text.slice(start, end))
  };
}

// Keep index in memory
let pdfIndex = loadPdfIndex();

// Root
app.get("/", (req, res) => {
  res.send("Homework Assistant API (NO AI) running ✅");
});

// Resources
app.get("/resources", (req, res) => {
  res.json(resources);
});

// CAPS hardcoded question answering
app.post("/ask", (req, res) => {
  const { question, grade, subject } = req.body;

  if (!question) return res.status(400).json({ error: "Question is required" });
  if (!grade || !subject) return res.status(400).json({ error: "Grade and subject are required" });

  const q = question.toLowerCase();

  const match = topics.find(t =>
    String(t.grade) === String(grade) &&
    String(t.subject) === String(subject) &&
    t.keywords.some(kw => q.includes(kw.toLowerCase()))
  );

  if (!match) {
    return res.json({
      found: false,
      message: "No CAPS match found yet. Try 'Search Textbooks' below."
    });
  }

  res.json({
    found: true,
    topic: match.topic,
    explanation: match.explanation,
    video: match.video
  });
});

// Build/rebuild PDF index (run after adding PDFs)
app.post("/pdf/reindex", async (req, res) => {
  const result = await buildPdfIndex();
  pdfIndex = result;
  res.json({ ok: true, updatedAt: result.updatedAt, pdfCount: result.index.length });
});

// Search PDFs for an answer (offline retrieval)
app.post("/pdf/search", (req, res) => {
  const { query } = req.body;

  if (!query) return res.status(400).json({ error: "query is required" });
  if (!pdfIndex.index || pdfIndex.index.length === 0) {
    return res.json({
      ok: false,
      message: "No PDFs indexed yet. Put PDFs in backend/pdfs and call /pdf/reindex."
    });
  }

  // turn query into keywords
  const keywords = cleanText(query)
    .toLowerCase()
    .split(" ")
    .filter(w => w.length >= 4)
    .slice(0, 8);

  if (keywords.length === 0) {
    return res.json({ ok: false, message: "Query too short. Use a longer question or keywords." });
  }

  // score each pdf
  const scored = pdfIndex.index
    .map(doc => ({
      file: doc.file,
      score: scoreText(doc.text, keywords),
      text: doc.text
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0) {
    return res.json({ ok: true, results: [], message: "No matches found in your indexed PDFs." });
  }

  const results = scored.map(s => {
    const snip = bestSnippet(s.text, keywords);
    return {
      file: s.file,
      score: s.score,
      snippet: snip ? snip.snippet : "(match found but snippet not generated)"
    };
  });

  res.json({
    ok: true,
    updatedAt: pdfIndex.updatedAt,
    keywords,
    results
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
app.post("/answer", (req, res) => {
  const { question, grade, subject } = req.body;

  if (!question) return res.status(400).json({ error: "Question is required" });

  const q = question.toLowerCase();

  // 1) Try CAPS hardcoded first (silent)
  const match = topics.find(t =>
    String(t.grade) === String(grade) &&
    String(t.subject) === String(subject) &&
    t.keywords.some(kw => q.includes(kw.toLowerCase()))
  );

  if (match) {
    return res.json({
      ok: true,
      answer: match.explanation,
      video: match.video || null,
      title: match.topic || "Answer"
    });
  }


 // 2) If no CAPS match, try PDF search (silent)
if (!pdfIndex.index || pdfIndex.index.length === 0) {
  return res.json({
    ok: true,
    title: "Answer",
    video: null,
    answer:
      "I couldn’t find a match in saved lessons yet. Please add textbooks (PDFs) and reindex them, or try rephrasing your question."
  });
}

// ✅ Better keyword extraction
const { keywords, phrases } = extractKeywords(question);
const allTerms = [...keywords, ...phrases];

if (allTerms.length === 0) {
  return res.json({
    ok: true,
    title: "Answer",
    video: null,
    answer: "Please ask with more detail (include key topic words)."
  });
}

// ✅ Filter by grade + subject automatically
const filteredDocs = pdfIndex.index.filter(doc => {
  // ✅ only allow docs that MATCH grade AND subject
  const gOk = String(doc.meta?.grade || "") === String(grade);
  const sOk = String(doc.meta?.subject || "") === String(subject);
  return gOk && sOk;
});


// If filtering gives nothing, fallback to all docs
// ✅ No fallback to all PDFs (prevents NST pulling Maths text)
const docsToSearch = filteredDocs;

if (!docsToSearch || docsToSearch.length === 0) {
  return res.json({
    ok: true,
    title: "Answer",
    video: null,
    answer:
      "I don't have a textbook loaded for this Grade + Subject yet. Please ensure the correct PDF exists and reindex."
  });
}


// ✅ Score each PDF and keep top 3
const scored = docsToSearch
  .map(doc => ({
    file: doc.file,
    score: scoreText(doc.text, allTerms),
    text: doc.text
  }))
  .filter(x => x.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 3);

if (scored.length === 0) {
  return res.json({
    ok: true,
    title: "Answer",
    video: null,
    answer: "I couldn’t find this in your saved textbooks. Try different keywords or a simpler version of the question."
  });
}

// ✅ Extract top snippets (from top 3 PDFs)
const snippets = scored
  .map(s => {
    const snip = bestSnippet(s.text, allTerms);
    return snip?.snippet || "";
  })
  .filter(Boolean);

// ✅ Build a cleaner combined answer
const better = buildBetterAnswer(snippets);

return res.json({
  ok: true,
  title: "Answer",
  video: null,
  answer: better
});

});

