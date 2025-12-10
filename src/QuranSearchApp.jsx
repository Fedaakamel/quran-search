import React, { useEffect, useState } from "react";

/* ============================================================
   QuranSearchApp.jsx
   Final corrected production-ready search component
   - Uses nested quran.json: { "1": { "1": { surah, surah_name, ayah, verse }, ... }, ... }
   - Arabic Uthmani text expected in verse
   - Option C: stripPrefixes, stripSuffixes, stripAffixes
   ============================================================ */

/* ============================================================
   1) Robust Arabic normalization
   - removes tashkeel, tatweel, control marks
   - unifies hamza/aleph forms
   - normalizes taa marbuta and alef maqsura
   ============================================================ */
function normalizeArabic(text = "") {
  return text
    .toString()
    // remove tatweel
    .replace(/ـ/g, "")
    // remove Arabic diacritics and Quran markers
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u0670]/g, "")
    // unify hamza / alef forms and related characters
    .replace(/[إأآٱءؤئ]/g, "ا")
    // alef maqsura -> ya
    .replace(/ى/g, "ي")
    // taa marbuta -> heh
    .replace(/ة/g, "ه")
    // remove non-Arabic characters (keep Arabic block and spaces)
    .replace(/[^\u0600-\u06FF\s]/g, " ")
    // collapse spaces
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* ============================================================
   2) Prefix/Suffix stripping helpers
   - stripPrefixes: remove common leading particles (ال، و، ف، ب، ل، ك، etc.)
   - stripSuffixes: remove common pronoun/tailed suffixes
   - stripAffixes: apply both (but careful for short words)
   ============================================================ */
function stripPrefixes(word = "") {
  if (!word) return word;
  // don't strip very short words
  if (word.length <= 2) return word;

  const prefixes = ["وال", "فال", "بال", "كال", "لل", "ال", "و", "ف", "ب", "ل", "ك"];
  let w = word;
  let changed = true;
  // remove at most several chained prefixes (but avoid over-stripping)
  let loops = 0;
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
  let changed = true;
  let loops = 0;
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
  // combine both strips. keep short words protected.
  if (!word) return word;
  if (word.length <= 2) return word;
  const withoutPrefix = stripPrefixes(word);
  const withoutSuffix = stripSuffixes(withoutPrefix);
  return withoutSuffix;
}

/* ============================================================
   3) Levenshtein distance + similarity ratio
   - used for fuzzy matching when appropriate
   ============================================================ */
function levenshteinDistance(a = "", b = "") {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const dp = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) dp[i][0] = i;
  for (let j = 0; j <= bl; j++) dp[0][j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[al][bl];
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

/* ============================================================
   4) Token match logic
   - strict rules for very short tokens (<=2)
   - special strict handling for "قران" / "القران" roots
   - controlled fuzzy matching for longer tokens
   ============================================================ */
function doesTokenMatchAyah(token, ayNorm, ayWords, ayWordsStripped) {
  const t = token.raw;
  const tStripped = token.stripped;

  // SPECIAL: Quran-like root — extremely strict (avoid "قرون" false positives)
  const quranRoots = ["قران", "قرءان", "قرء", "قرئان", "القران", "القرءان"];
  const normalizedTStripped = tStripped || "";
  if (quranRoots.includes(normalizedTStripped) || normalizedTStripped.startsWith("قران")) {
    // match only the Quran words or very close similarity
    return ayWords.some((w) => {
      const wClean = w;
      if (["القران", "قران", "قرءان", "القرءان", "قرء"].includes(wClean)) return true;
      return similarityScore(wClean, normalizedTStripped) >= 0.92;
    });
  }

  // SHORT TOKENS: require whole-word exact or near-exact (very high threshold)
  if (token.len <= 2) {
    // exact whole word match
    if (ayWords.includes(t)) return true;
    // very high similarity against whole words (catch small diacritic variations)
    if (ayWords.some((w) => similarityScore(w, t) >= 0.95)) return true;
    return false;
  }

  // LONGER TOKENS: allow phrase, whole-word, stripped, or fuzzy matches
  // 1) phrase match (normalized)
  if (ayNorm.includes(t)) return true;

  // 2) exact whole word
  if (ayWords.includes(t)) return true;

  // 3) stripped word match (prefix/suffix removed)
  if (ayWordsStripped.includes(tStripped)) return true;

  // 4) fuzzy similarity (moderate threshold)
  if (ayWords.some((w) => similarityScore(w, t) >= 0.88)) return true;
  if (ayWordsStripped.some((w) => similarityScore(w, tStripped) >= 0.88)) return true;

  return false;
}

/* ============================================================
   5) Main component
   ============================================================ */
export default function QuranSearchApp() {
  const [quranData, setQuranData] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load quran.json from public or fallback CDN (if you kept the CDN path)
  useEffect(() => {
    async function load() {
      try {
        // try local public first
        let res = await fetch("/quran.json");
        if (!res.ok) {
          // optional fallback (jsdelivr) - only if you published the file there
          res = await fetch(
            "https://cdn.jsdelivr.net/gh/Fedaakamel/quran-search@main/public/quran.json"
          );
        }

        if (!res.ok) throw new Error("quran.json not found (check public/quran.json)");

        const data = await res.json();
        setQuranData(data);
        setError(null);
      } catch (e) {
        console.error("Error loading quran.json", e);
        setError("فشل تحميل بيانات القرآن. تأكد من وجود public/quran.json");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Play Al-Afasy audio
  const playAudio = (surahId, ayahId) => {
    const s = String(surahId).padStart(3, "0");
    const a = String(ayahId).padStart(3, "0");
    const url = `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${s}${a}.mp3`;
    const audio = new Audio(url);
    audio.play().catch(() => {
      // autoplay/CORS may block; inform the user gently
      console.warn("Audio play failed (autoplay/CORS).");
    });
  };

  // Search handler
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

    // iterate surahs in nested object
    Object.keys(quranData).forEach((surahKey) => {
      const surahObj = quranData[surahKey];
      if (!surahObj || typeof surahObj !== "object") return;

      Object.keys(surahObj).forEach((verseKey) => {
        const verseData = surahObj[verseKey];
        if (!verseData || !verseData.verse) return;

        const ayText = verseData.verse;
        const ayNorm = normalizeArabic(ayText);
        const ayWords = ayNorm.split(/\s+/).filter(Boolean);
        const ayWordsStripped = ayWords.map((w) => stripAffixes(w));

        // require every token to match (AND logic)
        const ok = tokens.every((tk) => doesTokenMatchAyah(tk, ayNorm, ayWords, ayWordsStripped));
        if (ok) {
          found.push({
            surah: verseData.surah,
            surahName: verseData.surah_name,
            ayah: verseData.ayah,
            text: verseData.verse,
          });
        }
      });
    });

    // simple ranking: phrase matches first, then by number of token hits (approx)
    const ranked = found
      .map((f) => {
        const ayNorm = normalizeArabic(f.text || "");
        const phraseMatch = ayNorm.includes(qNorm) ? 1 : 0;
        // count exact hits
        const exactHits = tokens.reduce(
          (acc, t) => acc + (ayNorm.includes(t.raw) || ayNorm.includes(t.stripped) ? 1 : 0),
          0
        );
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
          <div className="text-emerald-600 font-semibold mb-2">جارٍ تحميل بيانات القرآن…</div>
          <div className="text-sm text-gray-500">الرجاء الانتظار قليلاً</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-emerald-50 to-cyan-50">
        <div className="bg-red-50 p-6 rounded-xl shadow text-center border border-red-200">
          <div className="text-red-600 font-semibold mb-2">{error}</div>
          <div className="text-sm text-gray-600">تأكد من رفع ملف public/quran.json ثم أعد النشر.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-emerald-50 via-emerald-100 to-cyan-50" dir="rtl">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="bg-emerald-700 text-white rounded-xl p-6 mb-6 shadow-lg">
          <h1 className="text-3xl font-bold text-center">بحث في القرآن الكريم</h1>
          <p className="text-center text-emerald-100 mt-2">اكتب كلمة أو عبارة ثم اضغط بحث أو Enter</p>
        </header>

        {/* Search */}
        <section className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex gap-3">
            <input
              dir="rtl"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="مثال: القرآن ، لا ريب ، فاسقيناكموه ، يس"
              className="flex-1 p-4 border-2 border-emerald-200 rounded-lg text-lg focus:border-emerald-500 focus:outline-none"
            />
            <button
              onClick={handleSearch}
              className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition"
            >
              🔍 بحث
            </button>
          </div>
          <div className="mt-3 text-sm text-gray-600 text-right">نصيحة: جرّب كتابة كلمتين لفحص البحث حسب (AND).</div>
        </section>

        {/* Results */}
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
                        <button
                          onClick={() => playAudio(r.surah, r.ayah)}
                          className="px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition"
                        >
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

        {/* Footer */}
        <footer className="mt-8 text-center text-gray-500 text-sm">
          <p>جميع الحقوق محفوظة © {new Date().getFullYear()}</p>
        </footer>
      </div>
    </div>
  );
}
