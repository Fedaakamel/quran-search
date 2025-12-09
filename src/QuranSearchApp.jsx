import React, { useEffect, useState } from "react";

/* ============================================================
   1. Arabic NORMALIZATION (strongest version)
   ============================================================ */
function normalizeArabic(text = "") {
  return text
    .toString()
    .replace(/ـ/g, "") // tatweel
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, "") // Quran marks & tashkeel
    .replace(/[إأآٱءؤئ]/g, "ا") // unify all hamza/alef forms
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0600-\u06FF\s]/g, " ") // remove non-Arabic chars
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* ============================================================
   2. Prefix Stripping (only for words longer than 2 letters!)
   ============================================================ */
function stripPrefixes(word = "") {
  const prefixes = ["ال", "و", "ف", "ب", "ل", "س"];

  if (word.length <= 2) return word; // <-- IMPORTANT FIX

  let w = word;
  let changed = true;

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

/* ============================================================
   3. Simple Similarity Score (for fuzzy match)
   ============================================================ */
function similarityScore(a, b) {
  if (!a || !b) return 0;
  let matches = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] === b[i]) matches++;
  }
  return matches / Math.max(a.length, b.length);
}

/* ============================================================
   4. Evaluate whether a token matches an ayah
   ============================================================ */
function doesTokenMatchAyah(token, ayNorm, ayWords, ayWordsStripped) {
  const t = token.raw;
  const tStripped = token.stripped;

  /* ============================================================
     SPECIAL RULE: القرآن / قرآن
     ============================================================ */

  const quranRoots = ["قران", "قرءان", "قرء", "قران", "قرائن"];
  const tokenIsQuran =
    quranRoots.includes(tStripped) || tStripped.startsWith("قران");

  if (tokenIsQuran) {
    // Only match exact (or close) Quran words
    return ayWords.some(
      (w) =>
        w === "القران" ||
        w === "قران" ||
        w === "قرءان" ||
        w === "القرءان" ||
        similarityScore(w, tStripped) >= 0.90
    );
  }

  /* ============================================================
     SHORT TOKENS (<=2 letters)
     ============================================================ */
  if (token.len <= 2) {
    if (ayWords.includes(t)) return true;
    if (ayWords.some((w) => similarityScore(w, t) >= 0.95)) return true;
    return false;
  }

  /* ============================================================
     NORMAL SEARCH
     ============================================================ */

  // phrase match
  if (ayNorm.includes(t)) return true;

  // whole-word match
  if (ayWords.includes(t)) return true;

  // stripped-word match
  if (ayWordsStripped.includes(tStripped)) return true;

  // fuzzy match (tightened from 0.82 → 0.88)
  if (ayWords.some((w) => similarityScore(w, t) >= 0.88)) return true;
  if (ayWordsStripped.some((w) => similarityScore(w, tStripped) >= 0.88))
    return true;

  return false;
}


/* ============================================================
   5. MAIN COMPONENT
   ============================================================ */
export default function QuranSearchApp() {
  const [quran, setQuran] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ------------------------------------------------------------
     Load Quran from /public/quran.json
     ------------------------------------------------------------ */
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/quran.json");
        const data = await res.json();
        setQuran(data);
      } catch (e) {
        console.error("Error loading quran.json", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  /* ------------------------------------------------------------
     Play Quran Audio (Al-Afasy)
     ------------------------------------------------------------ */
  const playAudio = (surahId, ayahId) => {
    const s = String(surahId).padStart(3, "0");
    const a = String(ayahId).padStart(3, "0");
    const url = `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${s}${a}.mp3`;

    const audio = new Audio(url);
    audio.play().catch(() => {
      alert("تعذر تشغيل الصوت (قيود المتصفح).");
    });
  };

  /* ------------------------------------------------------------
     SEARCH ENGINE
     ------------------------------------------------------------ */
  const handleSearch = () => {
    const raw = query.trim();
    if (!raw) return setResults([]);

    const qNorm = normalizeArabic(raw);

    // prepare tokens
    const tokens = qNorm.split(" ").filter(Boolean).map((t) => ({
      raw: t,
      stripped: stripPrefixes(t),
      len: t.length,
    }));

    const found = [];

    quran.forEach((surah) => {
      surah.verses.forEach((v) => {
        const ayText = v.text;
        const ayNorm = normalizeArabic(ayText);

        const ayWords = ayNorm.split(" ").filter(Boolean);
        const ayWordsStripped = ayWords.map((w) => stripPrefixes(w));

        // ALL tokens must match
        const ok = tokens.every((t) =>
          doesTokenMatchAyah(t, ayNorm, ayWords, ayWordsStripped)
        );

        if (ok) {
          found.push({
            surahId: surah.id,
            surahName: surah.name,
            ayah: v.id,
            text: v.text,
          });
        }
      });
    });

    setResults(found);
  };

  /* ------------------------------------------------------------
     UI
     ------------------------------------------------------------ */
  if (loading) return <div className="p-6 text-center">جارٍ تحميل القرآن…</div>;

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
          placeholder="اكتب كلمة أو عبارة مثل: القرآن ، لا ريب ، يس"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-green-600 text-white rounded"
        >
          بحث
        </button>
      </div>

      {results.length === 0 ? (
        <div className="p-6 text-gray-500 bg-white rounded shadow">
          لا توجد نتائج مطابقة…
        </div>
      ) : (
        results.map((r, i) => (
          <div
            key={i}
            className="p-4 mb-3 bg-white rounded shadow border-l-4 border-green-600"
          >
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
  );
}
