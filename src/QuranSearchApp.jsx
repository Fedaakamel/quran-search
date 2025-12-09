import React, { useEffect, useState } from "react";

// Normalize Arabic text
function normalizeArabic(str) {
  return str
    .replace(/[ًٌٍَُِّْ]/g, "") // remove harakat
    .replace(/أ/g, "ا")
    .replace(/إ/g, "ا")
    .replace(/آ/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه");
}

export default function QuranSearchApp() {
  const [quran, setQuran] = useState({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  // Load Quran JSON
  useEffect(() => {
    fetch("/quran.json")
      .then((res) => res.json())
      .then((data) => setQuran(data))
      .catch((err) => console.error("Error loading Quran:", err));
  }, []);

  // Search function
  const searchQuran = () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const q = normalizeArabic(query.trim());
    const found = [];

    // Loop through surahs
    Object.keys(quran).forEach((surahNum) => {
      const ayat = quran[surahNum];

      if (!Array.isArray(ayat)) return;

      ayat.forEach((ayah) => {
        const ayahTextNorm = normalizeArabic(ayah.text);

        // Exact + partial word similarity (80% match)
        if (
          ayahTextNorm.includes(q) ||
          similarity(ayahTextNorm, q) >= 0.8
        ) {
          found.push({
            surah: surahNum,
            verse: ayah.verse,
            text: ayah.text,
          });
        }
      });
    });

    setResults(found);
  };

  // Similarity function
  function similarity(a, b) {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;

    return (longerLength - editDistance(longer, shorter)) / longerLength;
  }

  function editDistance(a, b) {
    a = normalizeArabic(a);
    b = normalizeArabic(b);

    const dp = Array(b.length + 1)
      .fill(null)
      .map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= b.length; i++) dp[i][0] = i;
    for (let j = 0; j <= a.length; j++) dp[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[j - 1] === b[i - 1] ? 0 : 1)
        );
      }
    }
    return dp[b.length][a.length];
  }

  return (
    <div className="p-6 max-w-2xl mx-auto text-center">
      <h1 className="text-3xl font-bold mb-4">البحث في القرآن الكريم</h1>

      <input
        type="text"
        placeholder="ابحث بكلمة أو أكثر"
        className="w-full p-3 border rounded text-right"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <button
        onClick={searchQuran}
        className="mt-3 px-6 py-2 bg-green-600 text-white rounded"
      >
        بحث
      </button>

      <div className="mt-6 text-right">
        {results.length === 0 ? (
          <p className="text-gray-500">لا توجد نتائج</p>
        ) : (
          results.map((r, i) => (
            <div
              key={i}
              className="p-4 my-3 border rounded bg-gray-50 leading-loose"
            >
              <p className="text-xl mb-2">{r.text}</p>
              <p className="text-sm text-gray-700">
                السورة رقم {r.surah} — الآية {r.verse}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
