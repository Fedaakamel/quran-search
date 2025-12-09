import React, { useEffect, useState } from "react";

/**
  Fixed QuranSearchApp.jsx (simple, robust search)
  - Works with your JSON structure (array of surahs, each has .verses array)
  - Robust Arabic normalization (removes tashkeel, tatweel, control marks)
  - Multi-word (AND) search and phrase fallback
  - Plays Al-Afasy audio via CDN (formats surah/ayah with zero padding)
  - Minimal UI for clarity
*/

export default function QuranSearchApp() {
  const [quran, setQuran] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Robust Arabic normalization ---
  function normalizeArabic(text = "") {
    return text
      .toString()
      // remove tatweel, control marks, tashkeel and extra Quran-specific marks
      .replace(/ـ/g, "") // tatweel
      .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u0670\u06D0]/g, "") // tashkeel + marks
      // normalize alef/hamza/yaa/ta marbuta/aleph maqsurah
      .replace(/[إأآا]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/[ؤ]/g, "و")
      .replace(/[ئ]/g, "ي")
      .replace(/ة/g, "ه")
      // remove non-Arabic characters (keep Arabic letters and spaces)
      .replace(/[^\u0600-\u06FF\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  // --- load quran.json from public/ ---
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/quran.json");
        if (!res.ok) throw new Error("quran.json not found");
        const data = await res.json();
        setQuran(data);
      } catch (err) {
        console.error("Failed to load quran.json:", err);
        setQuran([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // --- play Al-Afasy audio via CDN ---
  const playAudio = (surahId, ayahId) => {
    const s = String(surahId).padStart(3, "0");
    const a = String(ayahId).padStart(3, "0");
    const url = `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${s}${a}.mp3`;
    const audio = new Audio(url);
    audio.play().catch((e) => {
      console.warn("audio play failed:", e);
      alert("تعذر تشغيل الصوت في المتصفح (قيود autoplay/CORS).");
    });
  };

  // --- search handler (multi-word AND + phrase fallback) ---
  const handleSearch = () => {
    const raw = (query || "").trim();
    if (!raw || raw.length < 1) {
      setResults([]);
      return;
    }

    const qNorm = normalizeArabic(raw);
    const tokens = qNorm.split(/\s+/).filter(Boolean);

    const found = [];

    // iterate surahs (your data is an array of surah objects)
    quran.forEach((surah) => {
      if (!surah || !Array.isArray(surah.verses)) return;
      surah.verses.forEach((v) => {
        const ayText = v.text || "";
        const ayNorm = normalizeArabic(ayText);

        // phrase exact (normalized) present?
        const phraseMatch = ayNorm.includes(qNorm);

        // all tokens present? (AND)
        const allTokensPresent = tokens.every((t) => ayNorm.includes(t));

        if (phraseMatch || allTokensPresent) {
          found.push({
            surahId: surah.id,
            surahName: surah.name || surah.transliteration || `سورة ${surah.id}`,
            ayah: v.id,
            text: v.text,
          });
        }
      });
    });

    setResults(found);
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
          placeholder="اكتب كلمة أو عبارة، مثلاً: لا ريب"
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
