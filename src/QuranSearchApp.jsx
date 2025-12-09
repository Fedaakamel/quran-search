import React, { useEffect, useState } from "react";

/* ============================================================
   1. Arabic NORMALIZATION
   ============================================================ */
function normalizeArabic(text = "") {
  return text
    .toString()
    .replace(/ـ/g, "")
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, "")
    .replace(/[إأآٱؤئ]/g, "ا")  // Keep ء separate for قرآن
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0600-\u06FF\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* ============================================================
   2. Prefix Stripping
   ============================================================ */
function stripPrefixes(word = "") {
  const prefixes = ["ال", "و", "ف", "ب", "ل", "س"];
  if (word.length <= 2) return word;

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
   3. Simple Similarity Score
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
   4. Token Match Logic
   ============================================================ */
function doesTokenMatchAyah(token, ayNorm, ayWords, ayWordsStripped) {
  const t = token.raw;
  const tStripped = token.stripped;

  // Special handling for القرآن - check multiple variations
  const isQuranSearch = t.includes("قران") || t.includes("قراءن") || t.includes("قرءان");

  if (isQuranSearch) {
    // Match any of these variations in the ayah
    const quranVariations = ["قران", "قراءن", "قرءان", "القران", "القراءن", "القرءان"];
    return ayWords.some(w => 
      quranVariations.some(qv => w.includes(qv) || qv.includes(w))
    );
  }

  // Short tokens (<=2 letters) need exact match
  if (token.len <= 2) {
    if (ayWords.includes(t)) return true;
    if (ayWords.some((w) => similarityScore(w, t) >= 0.95)) return true;
    return false;
  }

  // Normal search - relaxed matching
  if (ayNorm.includes(t)) return true;
  if (ayWords.includes(t)) return true;
  if (ayWordsStripped.includes(tStripped)) return true;
  
  // Check if any word contains the token or vice versa
  if (ayWords.some((w) => w.includes(t) || t.includes(w))) return true;
  
  // Fuzzy matching
  if (ayWords.some((w) => similarityScore(w, t) >= 0.85)) return true;
  if (ayWordsStripped.some((w) => similarityScore(w, tStripped) >= 0.85)) return true;

  return false;
}

/* ============================================================
   5. MAIN COMPONENT
   ============================================================ */
export default function QuranSearchApp() {
  const [quranData, setQuranData] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ------------------------------------------------------------
     Load Quran from jsDelivr CDN
     ------------------------------------------------------------ */
  useEffect(() => {
    async function load() {
      try {
        // Try jsDelivr first
        let res = await fetch("https://cdn.jsdelivr.net/gh/Fedaakamel/quran-search@main/public/quran.json");
        
        if (!res.ok) {
          // Fallback to local
          res = await fetch("/quran.json");
        }
        
        const data = await res.json();
        console.log("Loaded Quran data:", data);
        setQuranData(data);
        setError(null);
      } catch (e) {
        console.error("Error loading quran.json", e);
        setError("فشل تحميل بيانات القرآن");
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
     SEARCH ENGINE - Works with nested object structure
     ------------------------------------------------------------ */
  const handleSearch = () => {
    const raw = query.trim();
    if (!raw || !quranData) {
      setResults([]);
      return;
    }

    const qNorm = normalizeArabic(raw);
    console.log("Searching for:", raw, "-> normalized:", qNorm);

    // Prepare tokens
    const tokens = qNorm.split(" ").filter(Boolean).map((t) => ({
      raw: t,
      stripped: stripPrefixes(t),
      len: t.length,
    }));

    console.log("Tokens:", tokens);

    const found = [];

    // Iterate through the nested structure
    Object.keys(quranData).forEach((surahKey) => {
      const surahData = quranData[surahKey];
      
      // Each surah contains numbered verse objects
      Object.keys(surahData).forEach((verseKey) => {
        const verseData = surahData[verseKey];
        
        if (verseData && verseData.verse) {
          const ayText = verseData.verse;
          const ayNorm = normalizeArabic(ayText);

          const ayWords = ayNorm.split(" ").filter(Boolean);
          const ayWordsStripped = ayWords.map((w) => stripPrefixes(w));

          // ALL tokens must match
          const ok = tokens.every((t) =>
            doesTokenMatchAyah(t, ayNorm, ayWords, ayWordsStripped)
          );

          if (ok) {
            found.push({
              surahId: verseData.surah,
              surahName: verseData.surah_name,
              ayah: verseData.ayah,
              text: verseData.verse,
            });
          }
        }
      });
    });

    console.log("Search results:", found.length, "verses found");
    setResults(found);
  };

  /* ------------------------------------------------------------
     UI
     ------------------------------------------------------------ */
  if (loading) {
    return (
      <div className="p-6 text-center min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-cyan-50">
        <div className="bg-white p-8 rounded-xl shadow-lg">
          <div className="text-emerald-600 font-semibold text-xl mb-2">جارٍ تحميل القرآن الكريم…</div>
          <div className="text-gray-500">الرجاء الانتظار</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-cyan-50">
        <div className="bg-red-50 p-8 rounded-xl shadow-lg border border-red-200">
          <div className="text-red-600 font-semibold text-xl">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-emerald-100 to-cyan-50 p-6" dir="rtl">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-emerald-700 text-white rounded-xl p-6 mb-6 shadow-lg">
          <h1 className="text-3xl font-bold text-center">بحث في القرآن الكريم</h1>
          <p className="text-center text-emerald-100 mt-2">ابحث بكلمة أو عبارة واستمع للتلاوة</p>
        </div>

        {/* Search Box */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex gap-3">
            <input
              dir="rtl"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 p-4 border-2 border-emerald-200 rounded-lg text-lg focus:border-emerald-500 focus:outline-none"
              placeholder="اكتب كلمة أو عبارة مثل: الله، الصلاة، لا ريب، يس"
            />
            <button
              onClick={handleSearch}
              className="px-8 py-4 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors shadow-md"
            >
              🔍 بحث
            </button>
          </div>
          
          <div className="mt-4 text-sm text-gray-600 text-right">
            💡 نصيحة: يمكنك البحث بكلمة واحدة أو عدة كلمات معاً
          </div>
        </div>

        {/* Results */}
        <div>
          {results.length === 0 && query.trim() !== "" ? (
            <div className="p-8 text-center text-gray-500 bg-white rounded-2xl shadow">
              <div className="text-xl mb-2">لا توجد نتائج مطابقة</div>
              <div className="text-sm">جرّب كلمات أخرى أو تحقق من الإملاء</div>
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-gray-400 bg-white rounded-2xl shadow">
              <div className="text-xl">ابدأ البحث لعرض النتائج</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-emerald-700 font-semibold mb-4 text-lg">
                عُثر على {results.length} نتيجة
              </div>
              
              {results.map((r, i) => (
                <div
                  key={i}
                  className="p-6 bg-white rounded-2xl shadow-lg border-r-4 border-emerald-600 hover:shadow-xl transition-shadow"
                >
                  <div className="text-2xl leading-relaxed mb-4 text-gray-800">
                    {r.text}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm text-emerald-700 font-bold">
                      سورة {r.surahName} — الآية {r.ayah}
                    </div>

                    <button
                      onClick={() => playAudio(r.surahId, r.ayah)}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-md flex items-center gap-2"
                    >
                      <span>▶</span>
                      <span>استمع (العفاسي)</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>جميع الحقوق محفوظة © {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );
}
