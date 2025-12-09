import React, { useEffect, useState } from "react";

export default function QuranSearchApp() {
  const [quran, setQuran] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  // ---- Normalize Arabic Text (VERY IMPORTANT) ----
  const normalize = (str) =>
    str
      .replace(/[\u064B-\u0652]/g, "") // remove tashkeel
      .replace(/ي/g, "ي")
      .replace(/ى/g, "ي")
      .replace(/أ|إ|آ/g, "ا")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/ة/g, "ه")
      .trim();

  // ---- Load Quran from /public/quran.json ----
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/quran.json");
        const data = await res.json();
        setQuran(data);
      } catch (err) {
        console.error("Failed loading Quran JSON", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ---- Handle Search ----
  const handleSearch = () => {
    const q = normalize(query);

    if (!q || q.length < 2) {
      setResults([]);
      return;
    }

    let found = [];

    quran.forEach((surah) => {
      surah.verses.forEach((v) => {
        const textNorm = normalize(v.text);
        if (textNorm.includes(q)) {
          found.push({
            surah: surah.name,
            surahId: surah.id,
            ayah: v.id,
            text: v.text,
          });
        }
      });
    });

    setResults(found);
  };

  // ---- Play Mishary Al-Afasy Audio ----
  const playAudio = (surahId, ayahId) => {
    const s = surahId.toString().padStart(3, "0");
    const a = ayahId.toString().padStart(3, "0");

    const url = `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${s}${a}.mp3`;
    const audio = new Audio(url);
    audio.play();
  };

  if (loading) return <p className="text-center mt-10">Loading Quran…</p>;

  return (
    <div className="p-6 max-w-3xl mx-auto">

      <h1 className="text-3xl text-center mb-4 text-green-600 font-bold drop-shadow-lg">
        🔍 Quran Search
      </h1>

      {/* Search Bar */}
      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 p-2 border rounded shadow"
          placeholder="اكتب كلمة للبحث… مثل: لا ريب"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700"
        >
          Search
        </button>
      </div>

      {/* Search Results */}
      {results.length === 0 && query !== "" && (
        <p className="text-center mt-4 text-gray-500">لا توجد نتائج مطابقة…</p>
      )}

      {results.map((r, idx) => (
        <div
          key={idx}
          className="p-4 mb-3 bg-white rounded shadow border-l-4 border-green-600"
        >
          <p className="text-xl font-semibold text-green-700">
            {r.text}
          </p>

          <p className="text-gray-700 mt-1">
            سورة {r.surah} • آية {r.ayah}
          </p>

          <button
            onClick={() => playAudio(r.surahId, r.ayah)}
            className="mt-2 px-3 py-1 bg-green-500 text-white rounded shadow hover:bg-green-600"
          >
            ▶ استمع (العفاسي)
          </button>
        </div>
      ))}
    </div>
  );
}
