import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 QuranSearchApp.jsx
 - Loads quran.json from your GitHub repo (raw)
 - Auto-suggest (dropdown + chips)
 - Multi-word AND search + fuzzy similarity >= 0.8
 - Tafsir (Ibn Kathir) via api.quran.com (id 169)
 - Audio (Mishary Al-Afasy, reciter id 7) via api.quran.com
 - Highlight matches with green glow
 - Graceful fallbacks
 IMPORTANT: Replace the RAW_URL if your repo/path differs.
*/

const RAW_URL =
  "https://raw.githubusercontent.com/Fedaakamel/quran-search/main/public/quran.json";

// ----- Utilities -----
function normalizeArabic(text = "") {
  return text
    .toString()
    .replace(/ـ/g, "") // tatweel
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, "") // tashkeel etc
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

// highlight matches in ayahText given tokens (returns safe HTML string)
function highlightAyah(ayahText, queryTokens = []) {
  if (!queryTokens || queryTokens.length === 0) return escapeHtml(ayahText);
  const normAyah = normalizeArabic(ayahText);
  // We'll find positions of tokens in the original text approximately.
  // Simpler approach: split ayah into words, compare normalized words and wrap matches.
  const words = ayahText.split(/(\s+)/); // keep spaces
  const html = words
    .map((word) => {
      const norm = normalizeArabic(word);
      // if any token matches or similar >= 0.85 -> highlight
      const match = queryTokens.some(
        (t) => t && (norm.includes(t) || similarityScore(norm, t) >= 0.85)
      );
      if (match && word.trim().length > 0) {
        return `<span class="match-glow">${escapeHtml(word)}</span>`;
      }
      return escapeHtml(word);
    })
    .join("");
  return html;
}
function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ----- Component -----
export default function QuranSearchApp() {
  const [quran, setQuran] = useState(null); // the object loaded from RAW_URL
  const [allWords, setAllWords] = useState([]);
  const [query, setQuery] = useState("");
  const [chips, setChips] = useState([]); // selected suggestion chips
  const [suggestions, setSuggestions] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tafseerText, setTafseerText] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const audioRef = useRef(null);
  const suggestionTimer = useRef(null);

  // load Quran
  useEffect(() => {
    fetch(RAW_URL)
      .then((r) => r.json())
      .then((data) => {
        setQuran(data);
      })
      .catch((err) => {
        console.error("Failed to load quran.json:", err);
        setQuran(null);
      });
  }, []);

  // build allWords index after quran loaded
  useEffect(() => {
    if (!quran) return;
    const setW = new Set();
    Object.keys(quran).forEach((surahKey) => {
      const ayats = quran[surahKey];
      if (!Array.isArray(ayats)) return;
      ayats.forEach((ay) => {
        const parts = normalizeArabic(ay.text).split(" ").filter(Boolean);
        parts.forEach((p) => setW.add(p));
      });
    });
    setAllWords(Array.from(setW));
  }, [quran]);

  // auto-suggest (debounced)
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    if (!allWords || allWords.length === 0) {
      setSuggestions([]);
      return;
    }
    if (suggestionTimer.current) clearTimeout(suggestionTimer.current);
    suggestionTimer.current = setTimeout(() => {
      const norm = normalizeArabic(query);
      const candidates = allWords
        .map((w) => {
          const s = similarityScore(norm, w);
          const starts = w.startsWith(norm) || w.includes(norm);
          return { w, s, starts };
        })
        .filter((x) => x.starts || x.s >= 0.8)
        .sort((a, b) => {
          if (a.starts && !b.starts) return -1;
          if (!a.starts && b.starts) return 1;
          return b.s - a.s;
        })
        .slice(0, 12)
        .map((x) => x.w);
      setSuggestions(candidates);
    }, 160);
    return () => clearTimeout(suggestionTimer.current);
  }, [query, allWords]);

  // Helpers: add chip / remove chip
  const addChip = (word) => {
    const w = normalizeArabic(word);
    if (!w) return;
    if (!chips.includes(w)) setChips((c) => [...c, w]);
    setQuery("");
    setSuggestions([]);
  };
  const removeChip = (word) =>
    setChips((c) => c.filter((x) => x !== word));

  // Get tafsir (Ibn Kathir id=169)
  async function fetchTafsir(surahNum, ayahNum, tafsirId = 169) {
    try {
      const verse_key = `${surahNum}:${ayahNum}`;
      const url = `https://api.quran.com/api/v4/tafsirs/${tafsirId}?verse_key=${verse_key}`;
      const r = await fetch(url);
      const j = await r.json();
      // api returns j.tafsir.text or similar
      if (j && j.tafsir && j.tafsir.text) return j.tafsir.text;
      // fallback
      return j?.data?.tafsir || "لا يوجد تفسير متاح من المصدر.";
    } catch (e) {
      console.warn("Tafsir fetch failed:", e);
      return "تعذر جلب التفسير (المصدر الخارجي قد لا يسمح بالوصول).";
    }
  }

  // Fetch audio url for a verse (reciter 7 = Al-Afasy)
  async function fetchAudioUrl(surahNum, ayahNum, reciterId = 7) {
    try {
      // endpoint that often works: quran/recitations/<reciter_id>?verse_key=...
      const alt = `https://api.quran.com/api/v4/quran/recitations/${reciterId}?verse_key=${surahNum}:${ayahNum}`;
      const r = await fetch(alt);
      if (!r.ok) throw new Error("audio endpoint failed");
      const j = await r.json();
      // try to extract first audio file url
      const url = j?.audio_files?.[0]?.url || j?.audio?.[0]?.url || null;
      return url;
    } catch (e) {
      console.warn("Audio fetch error:", e);
      return null;
    }
  }

  // play audio
  async function playAyah(surahNum, ayahNum) {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setAudioUrl(null);
    const url = await fetchAudioUrl(surahNum, ayahNum, 7);
    if (!url) {
      alert(
        "تعذر الحصول على رابط الصوت. قد يكون سبب ذلك قيود الـ CORS على مصدر الصوت."
      );
      return;
    }
    setAudioUrl(url);
    const a = new Audio(url);
    audioRef.current = a;
    a.play().catch((e) => console.warn("audio play failed", e));
  }

  // Main search function
  const handleSearch = () => {
    setTafseerText(null);
    setResults([]);
    if ((!query || !query.trim()) && chips.length === 0) return;

    setLoading(true);
    const textQ = normalizeArabic((query || "").trim());
    const tokens = [
      ...chips, // chips already normalized
      ...(textQ ? textQ.split(/\s+/).filter(Boolean) : []),
    ].filter(Boolean);

    // If no tokens after normalization -> nothing
    if (tokens.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    const found = [];
    // iterate surahs
    Object.keys(quran || {}).forEach((surahKey) => {
      const ayats = quran[surahKey];
      if (!Array.isArray(ayats)) return;
      ayats.forEach((ay) => {
        const ayNorm = normalizeArabic(ay.text);
        // all tokens must match (AND) by include or fuzzy word match
        const allMatch = tokens.every((tok) => {
          if (ayNorm.includes(tok)) return true;
          // check per-word similarity within ayah
          const ayWords = ayNorm.split(" ").filter(Boolean);
          if (ayWords.some((w) => w.includes(tok) || tok.includes(w))) return true;
          if (ayWords.some((w) => similarityScore(w, tok) >= 0.8)) return true;
          return false;
        });

        // phrase similarity fallback
        const phraseSim = similarityScore(ayNorm, tokens.join(" "));
        if (allMatch || phraseSim >= 0.82) {
          found.push({
            surah: surahKey,
            verse: ay.verse,
            text: ay.text,
            norm: ayNorm,
          });
        }
      });
    });

    // rank results: phrase sim & #exact matches
    const ranked = found
      .map((f) => {
        const phraseSim = similarityScore(f.norm, tokens.join(" "));
        const exactMatches = tokens.reduce((acc, t) => acc + (f.norm.includes(t) ? 1 : 0), 0);
        const score = phraseSim * 0.7 + exactMatches * 0.3;
        return { ...f, score };
      })
      .sort((a, b) => b.score - a.score);

    setResults(ranked);
    setLoading(false);
  };

  // get similar words for the query (first token)
  const getSimilarWords = (q) => {
    const token = (q || chips[0] || query).split(/\s+/)[0] || "";
    const tok = normalizeArabic(token);
    if (!tok) return [];
    if (!allWords) return [];
    const out = allWords
      .map((w) => ({ w, s: similarityScore(w, tok) }))
      .filter((x) => (x.s >= 0.8 || x.w.startsWith(tok.slice(0, 3))) && x.w !== tok)
      .sort((a, b) => b.s - a.s)
      .slice(0, 20)
      .map((x) => x.w);
    return out;
  };

  // UI helpers
  const clearAll = () => {
    setQuery("");
    setChips([]);
    setSuggestions([]);
    setResults([]);
    setTafseerText(null);
    setAudioUrl(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  };

  // render
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-emerald-100 to-cyan-50 p-6" dir="rtl">
      <style>{`
        .match-glow {
          padding: 0 .15rem;
          border-radius: 4px;
          box-shadow: 0 0 12px rgba(16,185,129,0.45);
          background: rgba(236,253,245,0.6);
        }
        .chip {
          display:inline-block;
          padding:6px 10px;
          border-radius:999px;
          background:#e6fffa;
          color:#0f766e;
          margin:4px;
          cursor:pointer;
          border:1px solid #99f6e4;
        }
        .chip-remove { margin-left:6px; font-weight:bold; color:#0b695f; cursor:pointer; }
      `}</style>

      <div className="max-w-4xl mx-auto">
        <div className="bg-emerald-700 text-white rounded-xl p-6 mb-6 shadow-md">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">البحث في القرآن الكريم</h1>
            <div className="text-sm opacity-90">بحث ذكي — كلمات متشابة ≥ 80%</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-6 mb-6 relative">
          <div className="flex gap-3 items-center">
            <button
              onClick={handleSearch}
              className="bg-emerald-600 text-white px-5 py-3 rounded-lg"
            >
              🔍 بحث
            </button>

            <div className="relative flex-1">
              <input
                dir="rtl"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="اكتب كلمة أو عبارة... (ستظهر اقتراحات أثناء الكتابة)"
                className="w-full border rounded-lg p-3"
              />

              {/* suggestions dropdown */}
              {suggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-2 bg-white border rounded shadow z-50 max-h-52 overflow-auto">
                  {suggestions.map((s, i) => (
                    <div
                      key={i}
                      className="px-3 py-2 hover:bg-emerald-50 cursor-pointer text-right"
                      onClick={() => addChip(s)}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                // quick add typed term as chip
                if (query.trim()) addChip(query.trim());
              }}
              className="px-4 py-2 border rounded text-sm"
            >
              إضافة
            </button>

            <button onClick={clearAll} className="px-4 py-2 border rounded text-sm">
              مسح
            </button>
          </div>

          <div className="mt-4 text-sm text-gray-600 text-right">
            نصائح: يمكنك البحث بكلمة واحدة أو عدة كلمات (AND). كما ستظهر اقتراحات وكلمات مشابهة.
          </div>

          {/* chips */}
          <div className="mt-3 text-right">
            {chips.map((c, i) => (
              <span className="chip" key={i} onClick={() => removeChip(c)}>
                {c}
                <span className="chip-remove">×</span>
              </span>
            ))}
          </div>
        </div>

        {/* similar words box */}
        <div className="mb-6">
          <h3 className="text-lg font-bold mb-2 text-right">كلمات مشابهة</h3>
          <div className="bg-white rounded-2xl p-4 shadow text-right">
            {getSimilarWords(query).length === 0 ? (
              <div className="text-gray-500">لا توجد اقتراحات مشابهة</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {getSimilarWords(query).map((w, i) => (
                  <button key={i} className="chip" onClick={() => addChip(w)}>
                    {w}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* results */}
        <div>
          {loading && <div className="text-center py-6">جاري البحث...</div>}

          {!loading && results.length === 0 && (
            <div className="bg-white rounded-2xl p-6 shadow text-center text-gray-600">
              لا توجد نتائج — جرّب كلمات أخرى أو اضغط اقتراح.
            </div>
          )}

          {!loading &&
            results.map((r, idx) => (
              <div key={idx} className="bg-white rounded-2xl p-6 mb-4 shadow text-right">
                <div className="flex justify-between items-start">
                  <div>
                    <div
                      className="text-2xl leading-relaxed"
                      // highlight
                      dangerouslySetInnerHTML={{
                        __html: highlightAyah(r.text, [...chips, ...(query ? normalizeArabic(query).split(/\s+/) : [])]),
                      }}
                    />
                    <div className="mt-3 text-sm text-emerald-700 font-bold">
                      سورة {r.surah} — آية {r.verse}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={async () => {
                        setTafseerText("جاري جلب التفسير...");
                        const t = await fetchTafsir(r.surah, r.verse, 169);
                        setTafseerText(t);
                      }}
                      className="px-3 py-1 border rounded text-sm"
                    >
                      عرض تفسير (ابن كثير)
                    </button>

                    <button
                      onClick={() => {
                        playAyah(r.surah, r.verse);
                      }}
                      className="px-3 py-1 border rounded text-sm"
                    >
                      ▶ استمع (العفاسي)
                    </button>
                  </div>
                </div>
              </div>
            ))}

          {/* tafsir panel */}
          {tafseerText && (
            <div className="bg-white rounded-2xl p-4 shadow text-right mt-4">
              <h4 className="font-bold mb-2">التفسير (ابن كثير)</h4>
              <div style={{ whiteSpace: "pre-wrap" }}>{tafseerText}</div>
              <div className="mt-2 text-sm text-gray-500">المصدر: api.quran.com</div>
            </div>
          )}

          {/* audio player (if playing) */}
          {audioUrl && (
            <div className="fixed bottom-6 left-6 bg-white rounded p-3 shadow">
              <audio src={audioUrl} controls autoPlay onEnded={() => setAudioUrl(null)} />
              <div className="mt-2 text-sm text-gray-600">تشغيل صوت — العفاسي</div>
              <div className="mt-1">
                <button
                  onClick={() => {
                    if (audioRef.current) audioRef.current.pause();
                    setAudioUrl(null);
                  }}
                  className="text-red-500 text-sm"
                >
                  إيقاف
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
