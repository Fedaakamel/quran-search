import React, { useEffect, useState } from "react";

/**
 Improved QuranSearchApp.jsx — Simple search (Option A) with better Arabic handling:
 - Robust normalization
 - Strip common Arabic prefixes (ال، و، ف، ب، ل، س) when matching
 - Short-token (<=2) strict whole-word matching to avoid substring false-positives
 - Phrase fallback and multi-word (AND) search
 - Plays Al-Afasy audio via CDN
 - Works with your JSON structure: array of surah objects, each has .verses array
*/

export default function QuranSearchApp() {
  const [quran, setQuran] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  // ---------- Normalization ----------
  function normalizeArabic(text = "") {
    return text
      .toString()
      .replace(/ـ/g, "") // tatweel
      .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u0670\u06D0]/g, "") // tashkeel & marks
      .replace(/[إأآا]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/[ؤ]/g, "و")
      .replace(/[ئ]/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[^\u0600-\u06FF\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  // Remove common prefixes like "ال", "و", "ف", "ب", "ل", "س"
  function stripPrefixes(word = "") {
    if (!word) return word;
    // several prefixes possibly chained: و + ال  => وال...
    let w = word;
    const prefixes = ["ال", "و", "ف", "ب", "ل", "س"];
    let changed = true;
    // remove repeated prefixes up to one iteration to avoid over-stripping important chars
    while (changed) {
      changed = false;
      for (const p of prefixes) {
        if (w.startsWith(p) && w.length > p.length + 1) {
          w = w.slice(p.length);
          changed = true;
          break;
        }
      }
    }
    return w;
  }

  // Similarity (simple normalized levenshtein ratio)
  function levenshtein(a = "", b = "") {
    const A = a.split("");
    const B = b.split("");
    const n = A.length;
    const m = B.length;
    if (n === 0) return m;
    if (m === 0) return n;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) dp[i][0] = i;
    for (let j = 0; j <= m; j++) dp[0][j] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = A[i - 1] === B[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[n][m];
  }
  function similarityScore(s1 = "", s2 = "") {
    const a = s1 || "";
    const b = s2 || "";
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length >= b.length ? b : a;
    if (longer.length === 0) return 1.0;
    const ed = levenshtein(longer, shorter);
    return (longer.length - ed) / longer.length;
  }

  // ---------- Load Quran JSON (public/quran.json) ----------
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/quran.json");
        if (!res.ok) throw new Error("quran.json not found");
        const data = await res.json();
        setQuran(data || []);
      } catch (err) {
        console.error("Failed to load quran.json:", err);
        setQuran([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ---------- Audio playback (Al-Afasy CDN) ----------
  const playAudio = (surahId, ayahId) => {
    const s = String(surahId).padStart(3, "0");
    const a = String(ayahId).padStart(3, "0");
    const url = `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${s}${a}.mp3`;
    const audio = new Audio(url);
    audio
      .play()
      .catch((e) => {
        console.warn("audio play failed", e);
        alert("تعذر تشغيل الصوت — قد تكون هناك قيود في المتصفح (autoplay/CORS).");
      });
  };

  // ---------- Search logic ----------
  const handleSearch = () => {
    const raw = (query || "").trim();
    if (!raw) {
      setResults([]);
      return;
    }

    const qNorm = normalizeArabic(raw);
    const tokens = qNorm.split(/\s+/).filter(Boolean);

    // prepare tokens: normalized + stripped prefixes
    const tokensPrepared = tokens.map((t) => ({
      raw: t,
      stripped: stripPrefixes(t),
      len: t.length,
    }));

    const found = [];

    // iterate surahs (array)
    quran.forEach((surah) => {
      if (!surah || !Array.isArray(surah.verses)) return;
      surah.verses.forEach((v) => {
        const ayText = v.text || "";
        const ayNorm = normalizeArabic(ayText);
        const ayWords = ayNorm.split(/\s+/).filter(Boolean);

        // prepare ayah words stripped forms for comparison
        const ayWordsStripped = ayWords.map((w) => stripPrefixes(w));

        // token -> check match rules
        const allTokensMatch = tokensPrepared.every((tp) => {
          // short tokens (<=2) -> require strict whole-word equality or high similarity to a whole word
          if (tp.len <= 2) {
            // check exact whole-word equality (either original or stripped)
            const exactWhole =
              ayWords.includes(tp.raw) || ayWordsStripped.includes(tp.stripped);
            if (exactWhole) return true;
            // allow whole-word high similarity
            return ayWords.some((w) => similarityScore(w, tp.raw) >= 0.9) ||
                   ayWordsStripped.some((w) => similarityScore(w, tp.stripped) >= 0.9);
          }

          // for longer tokens:
          // 1) exact substring in ayah normalized
          if (ayNorm.includes(tp.raw)) return true;
          // 2) any ayah word equals token or stripped equals stripped token
          if (ayWords.includes(tp.raw) || ayWordsStripped.includes(tp.stripped))
            return true;
          // 3) word-level similarity (>= 0.82) against any ayah word or stripped word
          if (
            ayWords.some((w) => similarityScore(w, tp.raw) >= 0.82) ||
            ayWordsStripped.some((w) => similarityScore(w, tp.stripped) >= 0.82)
          )
            return true;

          return false;
        });

        // phrase fallback: full normalized phrase inside the ayah
        const phraseMatch = ayNorm.includes(qNorm);

        if (allTokensMatch || phraseMatch) {
          found.push({
            surahId: surah.id,
            surahName: surah.name || surah.transliteration || `سورة ${surah.id}`,
            ayah: v.id,
            text: v.text,
          });
        }
      });
    });

    // simple ranking: prefer exact phrase matches first, then number of exact token hits
    const ranked = found
      .map((f) => {
        const ayNorm = normalizeArabic(f.text || "");
        const phraseSim = ayNorm.includes(qNorm) ? 1 : 0;
        const exactHits = tokensPrepared.reduce(
          (acc, t) =>
            acc +
            (ayNorm.includes(t.raw) || ayNorm.includes(t.stripped) ? 1 : 0),
          0
        );
        const score = phraseSim * 100 + exactHits;
        return { ...f, score };
      })
      .sort((a, b) => b.score - a.score);

    setResults(ranked);
  };

  if (loading) return <div className="p-6 text-center">Loading Quran…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto text-right" dir="rtl">
      <h1 className="text-2xl font-bold mb-4 text-green-700">بحث في القرآن الكريم</h1>

      <div className="flex gap-2 mb-4">
        <input
          dir="rtl"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1 p-3 border rounded"
          placeholder="اكتب كلمة أو عبارة، مثلاً: القرآن أو يس"
        />
        <button onClick={handleSearch} className="px-4 py-2 bg-green-600 text-white rounded">
          بحث
        </button>
      </div>

      <div>
        {results.length === 0 ? (
          <div className="p-6 bg-white rounded shadow text-gray-600">لا توجد نتائج مطابقة…</div>
        ) : (
          results.map((r, i) => (
            <div key={i} className="p-4 mb-3 bg-white rounded shadow border-l-4 border-green-600">
              <div className="text-xl mb-2">{r.text}</div>
              <div className="text-sm text-green-700 font-semibold">
                سورة {r.surahName} — آية {r.ayah}
              </div>
              <button
                onClick={() => playAudio(r.surahId, r.ayah)}
                className="mt-2 px-3 py-1 bg-green-500 text-white rounded"
              >
                ▶ استمع (العفاسي)
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
