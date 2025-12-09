import React, { useEffect, useMemo, useState, useRef } from "react";
import { Search, Book, Info, Play } from "lucide-react";

/*
QuranSearchApp.jsx
Features:
- Load quran.json (if present in /public or src; expects array of surahs with .name, .number, .ayahs[])
- Auto-suggest words while typing (debounced)
- Multi-word (AND) search + phrase fuzzy match
- Word-level fuzzy matching (Levenshtein) with threshold 0.8
- Show tafsir (via api.quran.com) for Ibn Kathir / Tabari / Saadi
- Play audio (Mishary Alafasy recitation) per ayah
- Display similar words from the Quran (>= 0.8 similarity or prefix)
Notes:
- Add full quran.json to your repo (recommended in public/ or src/) for best results:
  Format: [{ name: "الفاتحة", number: 1, ayahs: [{ numberInSurah: 1, text: "..." }, ... ] }, ...]
- Uses fetch to api.quran.com for tafsir & recitation audio.
*/

const DEMO_QURAN = [
  {
    name: "الفاتحة",
    number: 1,
    ayahs: [
      { numberInSurah: 1, text: "بسم الله الرحمن الرحيم" },
      { numberInSurah: 2, text: "الحمد لله رب العالمين" },
      { numberInSurah: 5, text: "إياك نعبد وإياك نستعين" },
    ],
  },
  {
    name: "البقرة",
    number: 2,
    ayahs: [
      {
        numberInSurah: 1,
        text: "الم",
      },
      {
        numberInSurah: 2,
        text: "ذَٰلِكَ الْكِتَابُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًى لِّلْمُتَّقِينَ",
      },
      {
        numberInSurah: 255,
        text: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ...",
      },
    ],
  },
  {
    name: "الحجر",
    number: 15,
    ayahs: [
      {
        numberInSurah: 22,
        text: "فَأَنْزَلْنَا مِنَ السَّمَاءِ مَاءً فَأَسْقَيْنَاكُمُوهُ",
      },
    ],
  },
  {
    name: "الإخلاص",
    number: 112,
    ayahs: [{ numberInSurah: 1, text: "قُلْ هُوَ اللَّهُ أَحَدٌ" }],
  },
];

function normalizeArabic(text = "") {
  // trim, remove Tashkeel, tatweel, unify alef/hamza/yaa/taa marbuta, remove punctuation
  return text
    .toString()
    .replace(/ـ/g, "") // tatweel
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, "") // tashkeel & control marks
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ؤ]/g, "و")
    .replace(/[ئ]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ء]/g, "")
    .replace(/[^\u0600-\u06FF\s]/g, " ") // keep only arabic letters and spaces
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Levenshtein distance + similarity
function levenshtein(a = "", b = "") {
  const s = a.split("");
  const t = b.split("");
  const n = s.length;
  const m = t.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[n][m];
}
function similarityScore(a = "", b = "") {
  const A = a || "";
  const B = b || "";
  const longer = A.length >= B.length ? A : B;
  const shorter = A.length >= B.length ? B : A;
  if (longer.length === 0) return 1.0;
  const dist = levenshtein(longer, shorter);
  return (longer.length - dist) / longer.length;
}

export default function QuranSearchApp() {
  const [quran, setQuran] = useState(null); // full dataset
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [similarWords, setSimilarWords] = useState([]);
  const [selectedTafsir, setSelectedTafsir] = useState(null);
  const [playingAudioUrl, setPlayingAudioUrl] = useState(null);

  const [allWords, setAllWords] = useState([]); // built from quran
  const audioRef = useRef(null);
  const debounceTimer = useRef(null);

  // Load quran.json from public or fallback to demo
  useEffect(() => {
    async function load() {
      try {
        // Try public path first (if you place quran.json in public/)
        const res = await fetch("/quran.json");
        if (!res.ok) throw new Error("no quran.json in public");
        const data = await res.json();
        setQuran(data);
      } catch (err) {
        // fallback to demo dataset
        setQuran(DEMO_QURAN);
      }
    }
    load();
  }, []);

  // Build allWords index when quran is loaded
  useEffect(() => {
    if (!quran) return;
    const setWords = new Set();
    for (const surah of quran) {
      if (!surah.ayahs) continue;
      for (const ay of surah.ayahs) {
        const norm = normalizeArabic(ay.text);
        norm.split(" ").forEach((w) => {
          if (w && w.length > 0) setWords.add(w);
        });
      }
    }
    const list = Array.from(setWords).sort((a, b) => (a > b ? 1 : -1));
    setAllWords(list);
  }, [quran]);

  // Debounced autosuggest
  useEffect(() => {
    if (!searchText || searchText.trim().length === 0) {
      setSuggestions([]);
      return;
    }
    if (!allWords || allWords.length === 0) {
      setSuggestions([]);
      return;
    }
    // debounce
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const norm = normalizeArabic(searchText);
      // filter: includes or prefix or similarity >= 0.8
      const filtered = allWords
        .map((w) => {
          const score = similarityScore(norm, w);
          return { w, score, starts: w.startsWith(norm) || w.includes(norm) };
        })
        .filter((x) => x.starts || x.score >= 0.8)
        .sort((a, b) => {
          // prefer starts/includes first, then similarity
          if (a.starts && !b.starts) return -1;
          if (!a.starts && b.starts) return 1;
          return b.score - a.score;
        })
        .slice(0, 12)
        .map((x) => x.w);
      setSuggestions(filtered);
    }, 180);
    // cleanup
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchText, allWords]);

  // Main search handler
  const handleSearch = (overrideText = null) => {
    const q = normalizeArabic(overrideText !== null ? overrideText : searchText).trim();
    if (!q || q.length === 0) {
      setResults([]);
      setSimilarWords([]);
      return;
    }
    setLoading(true);

    // split words by space (AND search), also keep phrase for phrase-similarity
    const queryWords = q.split(" ").filter(Boolean);

    const found = [];
    for (const surah of quran || []) {
      if (!surah.ayahs) continue;
      for (const ay of surah.ayahs) {
        const normAy = normalizeArabic(ay.text);

        // Check multi-word AND: each word must match somewhere in ayah (includes or fuzzy)
        const allMatch = queryWords.every((qw) => {
          if (!qw) return false;
          if (normAy.includes(qw)) return true;
          // check each ayah word
          const ayWords = normAy.split(" ").filter(Boolean);
          if (ayWords.some((aw) => aw.includes(qw) || qw.includes(aw))) return true;
          // fuzzy similarity with any ayah word
          if (ayWords.some((aw) => similarityScore(qw, aw) >= 0.8)) return true;
          // fallback phrase similarity with entire ayah
          if (similarityScore(q, normAy) >= 0.85) return true;
          return false;
        });

        if (allMatch) {
          found.push({
            surah: surah.name,
            surahNumber: surah.number,
            ayahNumber: ay.numberInSurah,
            ayahText: ay.text,
            normAy,
          });
        }
      }
    }

    // rank by simple metric: phrase similarity then number of exact matches
    const ranked = found
      .map((f) => {
        const phraseSim = similarityScore(q, f.normAy);
        const exactMatches = queryWords.reduce((acc, w) => acc + (f.normAy.includes(w) ? 1 : 0), 0);
        const score = phraseSim * 0.7 + exactMatches * 0.3;
        return { ...f, score };
      })
      .sort((a, b) => b.score - a.score);

    setResults(ranked);
    setLoading(false);

    // compute similar words box
    const simWords = getSimilarWords(q, allWords).slice(0, 20);
    setSimilarWords(simWords);
  };

  // Get similar words (>= 0.8 or prefix match)
  function getSimilarWords(query, wordList = []) {
    const q = normalizeArabic(query).split(" ").filter(Boolean)[0] || normalizeArabic(query); // take first token for suggestions
    if (!q || q.length === 0) return [];
    const candidates = [];
    for (const w of wordList) {
      const s = similarityScore(q, w);
      if (s >= 0.80 && w !== q) candidates.push({ w, s });
      // prefix heuristic: same first 2-3 letters
      if (w.startsWith(q.slice(0, 3)) && !candidates.some((c) => c.w === w)) candidates.push({ w, s: Math.max(s, 0.7) });
    }
    // sort by similarity descending
    candidates.sort((a, b) => b.s - a.s);
    return candidates.map((c) => c.w);
  }

  // fetch tafsir from api.quran.com (Ibn Kathir = 169, Tabari = 172, Saadi=171)
  async function fetchTafsir(surahNum, ayahNum, tafsirId = 169) {
    try {
      // construct verse_key e.g., "2:255"
      const verse_key = `${surahNum}:${ayahNum}`;
      const url = `https://api.quran.com/api/v4/tafsirs/${tafsirId}?verse_key=${verse_key}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error("No tafsir");
      const j = await r.json();
      if (j && j.tafsir && j.tafsir.text) return j.tafsir.text;
      // fallback: sometimes data structure differs
      return j?.data?.tafsir || "لا يوجد تفسير متاح";
    } catch (e) {
      return "تعذر جلب التفسير من المصدر الخارجي.";
    }
  }

  // fetch audio for a verse (reciter ID 7 = Mishary Alafasy)
  async function fetchAudioUrl(surahNum, ayahNum, reciterId = 7) {
    try {
      const verse_key = `${surahNum}:${ayahNum}`;
      const url = `https://api.quran.com/api/v4/recitations/${reciterId}/by_ayah/verse_audio?verse_key=${verse_key}`;
      // NOTE: api.quran.com has multiple endpoints; sometimes simpler to use audio_files endpoint:
      const alt = `https://api.quran.com/api/v4/quran/recitations/${reciterId}?verse_key=${verse_key}`;
      // Try alt first
      const r = await fetch(alt);
      if (!r.ok) throw new Error("audio not found");
      const j = await r.json();
      // try to find audio_files -> url
      const urlCandidate = j?.audio_files?.[0]?.url || j?.audio?.[0]?.url;
      if (urlCandidate) return urlCandidate;
      // fallback: try first endpoint
      const r2 = await fetch(url);
      if (!r2.ok) throw new Error("audio not found");
      const j2 = await r2.json();
      return j2?.audio_files?.[0]?.url || null;
    } catch (e) {
      // Some endpoints may not allow CORS — then audio will fail. Return null
      return null;
    }
  }

  // play audio helper
  async function playAyah(surahNum, ayahNum) {
    // stop existing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const url = await fetchAudioUrl(surahNum, ayahNum, 7);
    if (!url) {
      alert("تعذر الحصول على رابط الصوت (CORS أو خدمة غير متاحة).");
      return;
    }
    setPlayingAudioUrl(url);
    const a = new Audio(url);
    audioRef.current = a;
    a.play().catch((e) => {
      console.warn("audio play failed", e);
    });
  }

  // handy helper: click a similar word to set it as the search and run search
  function chooseSuggestion(word) {
    setSearchText(word);
    setSuggestions([]);
    setTimeout(() => handleSearch(word), 80);
  }

  // UI render
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 p-6" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-6 rounded-xl shadow mb-6">
          <div className="px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Book className="w-10 h-10" />
                <h1 className="text-3xl font-bold">البحث في القرآن الكريم</h1>
              </div>
              <div className="text-sm opacity-90">بحث ذكي — كلمات متشابهة ≥ 80%</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-6 relative">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <input
                dir="rtl"
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSearch();
                    setSuggestions([]);
                  }
                }}
                placeholder="اكتب كلمة أو عبارة للبحث... مثل: لا ريب أو فاسقيناكموه"
                className="w-full border rounded-lg px-4 py-3 text-lg focus:outline-none"
              />
              {/* suggestions dropdown */}
              {suggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 bg-white border mt-2 rounded shadow z-50 max-h-64 overflow-auto">
                  {suggestions.map((s, i) => (
                    <div
                      key={i}
                      className="px-3 py-2 hover:bg-emerald-50 cursor-pointer"
                      onClick={() => chooseSuggestion(s)}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => handleSearch()}
              className="bg-emerald-600 text-white px-6 py-3 rounded-lg flex items-center gap-2 hover:from-emerald-700"
            >
              <Search className="w-5 h-5" />
              بحث
            </button>
          </div>

          <div className="mt-3 text-sm text-gray-600">
            <span className="font-semibold">نصائح: </span>
            يمكنك البحث بكلمة واحدة أو عدة كلمات (AND). كما ستظهر كلمات مشابهة أو اقتراحات وأقصى شبه 80%.
          </div>
        </div>

        {/* results */}
        <div className="mt-6">
          {loading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent"></div>
              <div className="mt-3 text-gray-600">جاري البحث...</div>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">النتائج ({results.length})</h2>
              {results.map((r, idx) => (
                <div key={idx} className="bg-white rounded-2xl shadow p-4 border-l-4 border-emerald-600">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold">سورة {r.surah} — آية {r.ayahNumber}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="px-3 py-1 border rounded text-sm hover:bg-emerald-50"
                        onClick={async () => {
                          setSelectedTafsir("جاري جلب التفسير...");
                          const tafsir = await fetchTafsir(r.surahNumber, r.ayahNumber, 169); // Ibn Kathir
                          setSelectedTafsir(tafsir);
                        }}
                      >
                        عرض تفسير (ابن كثير)
                      </button>

                      <button
                        className="px-3 py-1 border rounded text-sm hover:bg-emerald-50"
                        onClick={async () => {
                          setSelectedTafsir("جاري جلب التفسير...");
                          const tafsir = await fetchTafsir(r.surahNumber, r.ayahNumber, 172); // Tabari
                          setSelectedTafsir(tafsir);
                        }}
                      >
                        عرض تفسير (الطبري)
                      </button>

                      <button
                        className="px-3 py-1 border rounded text-sm hover:bg-emerald-50"
                        onClick={() => playAyah(r.surahNumber, r.ayahNumber)}
                      >
                        <Play className="w-4 h-4 inline-block" /> استمع
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 text-3xl text-center leading-relaxed">{r.ayahText}</div>

                  <div className="mt-4 text-gray-700">
                    <strong>رابط أقوى التطابق: </strong>
                    <span className="text-sm text-gray-600">نسبة مطابقة داخلية: {(r.score || 0).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && results.length === 0 && searchText.trim().length > 0 && (
            <div className="text-center p-8 bg-white rounded-2xl shadow">
              <div className="text-xl mb-2">لا توجد نتائج</div>
              <div className="text-gray-600">جرب كلمات مشابهة أو اضغط اقتراح من أسفل</div>
            </div>
          )}

          {!loading && (!searchText || searchText.trim().length === 0) && (
            <div className="text-center p-8 bg-white rounded-2xl shadow">
              <div className="text-xl mb-2">ابدأ البحث</div>
              <div className="text-gray-600">اكتب كلمة من القرآن لتظهر النتائج والتفاسير والصوت</div>
            </div>
          )}
        </div>

        {/* similar words */}
        {!loading && similarWords && similarWords.length > 0 && (
          <div className="mt-6 bg-yellow-50 border rounded p-4">
            <h3 className="font-bold mb-2">كلمات مشابهة في القرآن</h3>
            <div className="flex flex-wrap gap-2">
              {similarWords.map((w, i) => (
                <button
                  key={i}
                  onClick={() => chooseSuggestion(w)}
                  className="bg-white px-3 py-1 rounded shadow text-gray-700"
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* playing audio status */}
        {playingAudioUrl && (
          <div className="fixed bottom-6 left-6 bg-white p-3 rounded shadow flex items-center gap-3">
            <div>تشغيل صوت: </div>
            <audio src={playingAudioUrl} controls autoPlay onEnded={() => setPlayingAudioUrl(null)} />
            <button
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.pause();
                  audioRef.current = null;
                }
                setPlayingAudioUrl(null);
              }}
              className="text-red-500 text-sm"
            >
              إيقاف
            </button>
          </div>
        )}

        {/* show selected tafsir */}
        {selectedTafsir && (
          <div className="mt-6 bg-white rounded p-4 shadow">
            <h3 className="font-bold">التفسير</h3>
            <div className="mt-2 text-right leading-relaxed" style={{ whiteSpace: "pre-wrap" }}>
              {selectedTafsir}
            </div>
            <div className="mt-2 text-sm text-gray-500">المصدر: api.quran.com</div>

            <div className="mt-3">
              <button
                className="text-sm underline text-blue-600"
                onClick={() => {
                  setSelectedTafsir(null);
                }}
              >
                إغلاق
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
