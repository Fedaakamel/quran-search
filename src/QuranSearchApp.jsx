// Normalize Arabic text (remove diacritics, unify forms)
function normalize(text) {
  return text
    .replace(/[\u064B-\u065F]/g, "")         // remove tashkeel
    .replace(/[إأآا]/g, "ا")                 // normalize alif
    .replace(/ى/g, "ي")                      // normalize yaa
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

// Fuzzy similarity (returns % match)
function similarity(a, b) {
  let matches = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) matches++;
  }
  return matches / Math.max(a.length, b.length);
}

function searchQuran(quranData, query) {
  const normQuery = normalize(query);
  const queryWords = normQuery.split(" ").filter(w => w.length > 0);

  const results = [];

  for (const surah of quranData) {
    for (const ayah of surah.ayahs) {
      const normAyah = normalize(ayah.text);

      // Check if ALL words exist in ayah
      const allWordsMatch = queryWords.every(word =>
        normAyah.includes(word) || similarity(normAyah, word) >= 0.8
      );

      if (allWordsMatch) {
        results.push({
          surah: surah.name,
          numberInSurah: ayah.numberInSurah,
          text: ayah.text
        });
      }
    }
  }
  return results;
}

