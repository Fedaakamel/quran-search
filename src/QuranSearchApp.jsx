import React, { useEffect, useState } from "react";

/* ============================================================
   QuranSearchApp.jsx - Final corrected production-ready component
   - Supports nested public/quran.json (structure you confirmed)
   - Strict handling for القرآن-like root and Quranic initial letters
   - Option C: separate stripPrefixes / stripSuffixes / stripAffixes
   ============================================================ */

/* -------------------------
   1) Normalization
   ------------------------- */
function normalizeArabic(text = "") {
  return text
    .toString()
    .replace(/ـ/g, "") // tatweel
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u0670]/g, "") // tashkeel & marks
    .replace(/[إأآٱءؤئ]/g, "ا") // unify hamza/alef
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0600-\u06FF\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* -------------------------
   2) Strip helpers (Option C)
   ------------------------- */
function stripPrefixes(word = "") {
  if (!word) return word;
  if (word.length <= 2) return word;
  const prefixes = ["وال", "فال", "بال", "كال", "لل", "ال", "و", "ف", "ب", "ل", "ك"];
  let w = word;
  let loops = 0;
  let changed = true;
  while (changed && loops < 3) {
    changed = false;
    for (const p of prefixes) {
      if (w.startsWith(p) && w.length > p.length + 1) {
        w = w.slice(p.length);
        changed = true;
        break;
      }
    }
    loops++;
  }
  return w;
}

function stripSuffixes(word = "") {
  if (!word) return word;
  if (word.length <= 2) return word;
  const suffixes = ["هما", "هم", "هن", "كما", "كم", "كن", "نا", "ني", "ها", "ه", "ك", "ت"];
  let w = word;
  let loops = 0;
  let changed = true;
  while (changed && loops < 2) {
    changed = false;
    for (const s of suffixes) {
      if (w.endsWith(s) && w.length > s.length + 1) {
        w = w.slice(0, -s.length);
        changed = true;
        break;
      }
    }
    loops++;
  }
  return w;
}

function stripAffixes(word = "") {
  if (!word) return word;
  if (word.length <= 2) return word;
  const noPref = stripPrefixes(word);
  const noSuf = stripSuffixes(noPref);
  return noSuf;
}

/* -------------------------
   3) Similarity helpers
   ------------------------- */
function levenshteinDistance(a = "", b = "") {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[la][lb];
}

function similarityScore(a = "", b = "") {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.length === 0) return 1;
  const dist = levenshteinDistance(longer, shorter);
  return (longer.length - dist) / longer.length;
}

/* -------------------------
   4) Special tokens / roots
   ------------------------- */
// Quran-like root strict tokens (normalized)
const QURAN_ROOTS_STRICT = new Set(["قران", "قرءان", "قرء", "قرئان", "القران", "القرءان"]);

// Qur'anic muqata'at initial letters normalized (must match whole-word)
const MUQATAT = new Set([
  "الم", "الر", "المر", "كهل", // note: include common ones; normalized input likely "الم","الر","المر","كهيعص" etc.
  "كهيعص", "طه", "يس", "حم", "ص", "ق", "ن", "طس"
].map((s) => normalizeArabic(s)));

/* -------------------------
   5) Token match logic
   ------------------------- */
function doesTokenMatchAyah(token, ayNorm, ayWords, ayWordsStripped) {
  const t = token.raw;
  const tStripped = token.stripped;

  // 1) If token is a Quranic initial-letter (muqatta') - require exact whole-word match
  if (MUQATAT.has(t) || MUQATAT.has(tStripped)) {
    return ayWords.includes(t) || ayWordsStripped.includes(tStripped);
  }

  // 2) Quran-root strict handling (avoid قرون / قارون)
  if (QURAN_ROOTS_STRICT.has(t) || QURAN_ROOTS_STRICT.has(tStripped) || tStripped.startsWith("قران")) {
    // match only exact forms or very close (>= 0.92)
    return ayWords.some((w) => {
      if (["القران", "قران", "قرءان", "القرءان", "قرء"].includes(w)) return true;
      return similarityScore(w, tStripped) >= 0.92;
    }) || ayWordsStripped.some((w) => similarityScore(w, tStripped) >= 0.92);
  }

  // 3) Short tokens (<=2 chars) — require whole-word exact or near-exact (>=0.95) to avoid substring false positives
  if (token.len <= 2) {
    if (ayWords.includes(t)) return true;
    if (ayWordsStripped.includes(tStripped)) return true;
    if (ayWords.some((w) => similarityScore(w, t) >= 0.95)) return true;
    return false;
  }

  // 4) For 3-letter tokens which are non-muqatta' (like "الم" case) - be stricter:
  if (token.len === 3) {
    // require whole-word or phrase; avoid substring-only matches
    if (ayWords.includes(t) || ayWordsStripped.includes(tStripped)) return true;
    if (ayNorm.split(" ").includes(t)) return true;
    // allow high similarity only
    if (ayWords.some((w) => similarityScore(w, t) >= 0.92)) return true;
    return false;
  }

  // 5) Longer tokens: allow several match routes
  if (ayNorm.includes(t)) return true; // phrase substring
  if (ayWords.includes(t) || ayWordsStripped.includes(tStripped)) return true;
  if (ayWords.some((w) => similarityScore(w, t) >= 0.88)) return true;
  if (ayWordsStripped.some((w) => similarityScore(w, tStripped) >= 0.88)) return true;

  return false;
}

/* ============================================================
   Component
   ============================================================ */
export default function QuranSearchApp() {
  const [quranData, setQuranData] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // load local public/quran.json (preferred) with optional CDN fallback
  useEffect(() => {
    async function load() {
      try {
        let res = await fetch("/quran.json");
        if (!res.ok) {
          // optional fallback if you published the file to jsDelivr
          res = await fetch("https://cdn.jsdelivr.net/gh/Fedaakamel/quran-search@main/public/quran.json");
        }
        if (!res.ok) throw new Error("quran.json not found");
        const data = await res.json();
        setQuranData(data);
        setError(null);
      } catch (e) {
        console.error("Failed to load quran.json", e);
        setError("فشل تحميل بيانات القرآن. تأكد من وجود public/quran.json");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // audio play
  const playAudio = (surahId, ayahId) => {
    const s = String(surahId).padStart(3, "0");
    const a = String(ayahId).padStart(3, "0");
    const url = `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${s}${a}.mp3`;
    const audio = new Audio(url);
    audio.play().catch(() => {
      console.warn("audio blocked or failed");
    });
  };

  // search handler
  const handleSearch = () => {
    const raw = (query || "").trim();
    if (!raw || !quranData) {
      setResults([]);
      return;
    }

    const qNorm = normalizeArabic(raw);
    const tokens = qNorm.split(/\s+/).filter(Boolean).map((t) => ({
      raw: t,
      stripped: stripAffixes(t),
      len: t.length,
    }));

    const found = [];

    // iterate nested quranData { "1": { "1": {..}, ... }, ... }
    Object.keys(quranData).forEach((sKey) => {
      const sObj = quranData[sKey];
      if (!sObj || typeof sObj !== "object") return;
      Object.keys(sObj).forEach((vKey) => {
        const v = sObj[vKey];
        if (!v || !v.verse) return;
        const ayText = v.verse;
        const ayNorm = normalizeArabic(ayText);
        const ayWords = ayNorm.split(/\s+/).filter(Boolean);
        const ayWordsStripped = ayWords.map((w) => stripAffixes(w));

        const ok = tokens.every((tk) => doesTokenMatchAyah(tk, ayNorm, ayWords, ayWordsStripped));
        if (ok) {
          found.push({
            surah: v.surah,
            surahName: v.surah_name,
            ayah: v.ayah,
            text: v.verse,
          });
        }
      });
    });

    // ranking: phrase matches first
    const ranked = found
      .map((f) => {
        const ayNorm = normalizeArabic(f.text || "");
        const phraseMatch = ayNorm.includes(qNorm) ? 1 : 0;
        const exactHits = tokens.reduce((acc, t) => acc + (ayNorm.includes(t.raw) || ayNorm.includes(t.stripped) ? 1 : 0), 0);
        const score = phraseMatch * 100 + exactHits;
        return { ...f, score };
      })
      .sort((a, b) => b.score - a.score);

    setResults(ranked);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-emerald-50 to-cyan-50">
        <div className="bg-white p-6 rounded-xl shadow text-center">
          <div className="text-emerald-600 font-semibold mb-2">جارٍ تحميل القرآن…</div>
          <div className="text-sm text-gray-500">الرجاء الانتظار</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-emerald-50 to-cyan-50">
        <div className="bg-red-50 p-6 rounded-xl shadow text-center border border-red-200">
          <div className="text-red-600 font-semibold mb-2">{error}</div>
          <div className="text-sm text-gray-600">تأكد من رفع public/quran.json وإعادة النشر.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-emerald-50 via-emerald-100 to-cyan-50" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <header className="bg-emerald-700 text-white rounded-xl p-6 mb-6 shadow-lg">
          <h1 className="text-3xl font-bold text-center">بحث في القرآن الكريم</h1>
          <p className="text-center text-emerald-100 mt-2">اكتب كلمة أو عبارة ثم اضغط بحث أو Enter</p>
        </header>

        <section className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex gap-3">
            <input
              dir="rtl"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="مثال: القرآن ، لا ريب ، فاسقيناكموه ، يس ، ألم"
              className="flex-1 p-4 border-2 border-emerald-200 rounded-lg text-lg focus:border-emerald-500"
            />
            <button onClick={handleSearch} className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700">
              🔍 بحث
            </button>
          </div>
          <div className="mt-3 text-sm text-gray-600 text-right">نصيحة: جرّب كتابة كلمتين لفحص البحث حسب (AND).</div>
        </section>

        <section>
          {results.length === 0 && query.trim() !== "" ? (
            <div className="p-8 bg-white rounded-2xl shadow text-center text-gray-600">
              <div className="text-xl mb-2">لا توجد نتائج مطابقة</div>
              <div className="text-sm">جرّب مصطلحاً آخر أو تأكد من الإملاء.</div>
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 bg-white rounded-2xl shadow text-center text-gray-400">
              <div className="text-xl">ابدأ البحث لعرض النتائج</div>
            </div>
          ) : (
            <>
              <div className="mb-4 text-emerald-700 font-semibold">عُثر على {results.length} نتيجة</div>
              <div className="space-y-4">
                {results.map((r, idx) => (
                  <article key={idx} className="p-6 bg-white rounded-2xl shadow-lg border-r-4 border-emerald-600">
                    <div className="text-2xl leading-relaxed mb-4 text-gray-900">{r.text}</div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-emerald-700 font-bold">سورة {r.surahName} — آية {r.ayah}</div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => playAudio(r.surah, r.ayah)} className="px-3 py-2 bg-emerald-500 text-white rounded-lg">
                          ▶ استمع (العفاسي)
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>

        <footer className="mt-8 text-center text-gray-500 text-sm">
          <p>جميع الحقوق محفوظة © {new Date().getFullYear()}</p>
        </footer>
      </div>
    </div>
  );
}
