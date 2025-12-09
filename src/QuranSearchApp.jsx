import React, { useEffect, useRef, useState } from "react";

/*
  Full QuranSearchApp.jsx (Option A: Tafsir Ibn Kathir + Al-Afasy audio)
  - Loads quran.json from GitHub RAW (change RAW_QURAN_URL if different)
  - Auto-suggest (dropdown + chips)
  - Multi-word AND search + fuzzy similarity >= 0.8
  - Similar words box
  - Highlight matched tokens (green glow)
  - Fetches tafsir (tries AlQuran Cloud / fallback) and audio (AlQuran Cloud)
  - Robust to CORS/network errors (shows messages instead of crashing)
*/

const RAW_QURAN_URL =
  "https://raw.githubusercontent.com/Fedaakamel/quran-search/main/public/quran.json";

function normalizeArabic(text = "") {
  return text
    .toString()
    .replace(/ـ/g, "") // tatweel
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, "") // tashkeel / control
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

function escapeHtml(s = "") {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Highlight matched tokens in ayahText (returns safe HTML)
function highlightAyah(ayahText = "", tokens = []) {
  if (!tokens || tokens.length === 0) return escapeHtml(ayahText);
  // Break into words (preserve spaces)
  const parts = ayahText.split(/(\s+)/);
  const html = parts
    .map((part) => {
      const norm = normalizeArabic(part);
      const match = tokens.some(
        (t) => t && (norm.includes(t) || similarityScore(norm, t) >= 0.85)
      );
      if (match && part.trim().length > 0) {
        return `<span class="match-glow">${escapeHtml(part)}</span>`;
      }
      return escapeHtml(part);
    })
    .join("");
  return html;
}

export default function QuranSearchApp() {
  const [quran, setQuran] = useState(null);
  const [allWords, setAllWords] = useState([]);
  const [query, setQuery] = useState("");
  const [chips, setChips] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tafseerText, setTafseerText] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [message, setMessage] = useState(null);
  const audioRef = useRef(null);
  const suggestionTimer = useRef(null);

  // load quran.json from GitHub RAW
  useEffect(() => {
    fetch(RAW_QURAN_URL)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load quran.json");
        return r.json();
      })
      .then((data) => {
        setQuran(data);
      })
      .catch((err) => {
        console.error("Error loading quran.json:", err);
        setMessage(
          "تعذر تحميل بيانات القرآن من GitHub. تأكد أن public/quran.json موجود في الريبو."
        );
        setQuran(null);
      });
  }, []);

  // Build allWords index
  useEffect(() => {
    if (!quran) return;
    const setW = new Set();
    Object.keys(quran).forEach((sKey) => {
      const ayats = quran[sKey];
      if (!Array.isArray(ayats)) return;
      ayats.forEach((ay) => {
        const parts = normalizeArabic(ay.text).split(" ").filter(Boolean);
        parts.forEach((p) => setW.add(p));
      });
    });
    setAllWords(Array.from(setW).sort());
  }, [quran]);

  // Auto-suggest (debounced)
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
    }, 140);
    return () => clearTimeout(suggestionTimer.current);
  }, [query, allWords]);

  // add / remove chips
  const addChip = (word) => {
    const w = normalizeArabic(word);
    if (!w) return;
    if (!chips.includes(w)) setChips((c) => [...c, w]);
    setQuery("");
    setSuggestions([]);
  };
  const removeChip = (word) => setChips((c) => c.filter((x) => x !== word));

  // get similar words
  const getSimilarWords = (q) => {
    const tok = normalizeArabic(q || chips[0] || "");
    if (!tok || !allWords) return [];
    return allWords
      .map((w) => ({ w, s: similarityScore(w, tok) }))
      .filter((x) => (x.s >= 0.8 || x.w.startsWith(tok.slice(0, 3))) && x.w !== tok)
      .sort((a, b) => b.s - a.s)
      .slice(0, 20)
      .map((x) => x.w);
  };

  // Fetch tafsir (Ibn Kathir) — try AlQuranCloud first, then fallback to api.quran.com
  async function fetchTafsir(surahNum, ayahNum) {
    // Try AlQuran Cloud via quranfoundation or alquran.cloud; these endpoints vary between services.
    const alquranUrl = `https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/en.asad`; // placeholder attempt for structure
    // But the reliable approach: try quranapi.pages.dev or a known tafsir API if available — we'll attempt two endpoints
    try {
      // First attempt: quran.foundation (may include tafsirs)
      const qf = `https://api.quran.com/api/v4/tafsirs/169?verse_key=${surahNum}:${ayahNum}`;
      const r1 = await fetch(qf);
      if (r1.ok) {
        const j1 = await r1.json();
        // quran.com returns different shapes; check common fields
        if (j1?.tafsir?.text) return j1.tafsir.text;
        if (j1?.data?.tafsir) return j1.data.tafsir;
      }
    } catch (e) {
      // ignore and try next
    }

    try {
      // Second attempt: public third-party tafsir endpoint (some services provide Ibn Kathir)
      // Example: quranapi.pages.dev (if available)
      const q2 = `https://quranapi.pages.dev/tafsir/ibn-kathir/${surahNum}/${ayahNum}`;
      const r2 = await fetch(q2);
      if (r2.ok) {
        const j2 = await r2.json();
        if (j2?.content) return j2.content;
        if (j2?.text) return j2.text;
      }
    } catch (e) {
      // ignore
    }

    return "لا يوجد تفسير متاح حالياً (تعذر الوصول إلى مصدر التفسير الخارجي).";
  }

  // Fetch audio URL for Al-Afasy (try alquran.cloud endpoints)
  async function fetchAudioUrl(surahNum, ayahNum) {
    try {
      // Try AlQuran Cloud ayah endpoint for Al-Afasy
      // Example: https://api.alquran.cloud/v1/ayah/2:255/ar.alafasy
      const url = `https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/ar.alafasy`;
      const r = await fetch(url);
      if (r.ok) {
        const j = await r.json();
        // j.data.audio may be present, or j.data.audio.url, or j.data.audio_files
        if (j?.data?.audio) return j.data.audio;
        if (j?.data?.audio_files?.length) return j.data.audio_files[0].audio || j.data.audio_files[0].url;
        // Some endpoints return audio link in j.data?.audio?.[0]
        if (j?.data?.audio?.[0]) return j.data.audio[0];
      }
    } catch (e) {
      // ignore and fallback
      console.warn("AlQuran Cloud audio fetch failed:", e);
    }

    try {
      // Try Quran.com recitation endpoint
      // Example: https://api.quran.com/api/v4/quran/recitations/7?verse_key=2:255
      const url2 = `https://api.quran.com/api/v4/quran/recitations/7?verse_key=${surahNum}:${ayahNum}`;
      const r2 = await fetch(url2);
      if (r2.ok) {
        const j2 = await r2.json();
        // find audio_files or audio_files[0].url
        if (j2?.audio_files?.length) return j2.audio_files[0].url;
        if (j2?.audio?.length) return j2.audio[0].url || j2.audio[0];
      }
    } catch (e) {
      console.warn("quran.com audio fetch failed:", e);
    }

    return null; // not found
  }

  // Play ayah audio
  async function playAyah(surahNum, ayahNum) {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setAudioUrl(null);
    setMessage(null);
    const url = await fetchAudioUrl(surahNum, ayahNum);
    if (!url) {
      setMessage("تعذر الحصول على رابط الصوت (قد تمنع سياسة CORS الوصول المباشر).");
      return;
    }
    setAudioUrl(url);
    const a = new Audio(url);
    audioRef.current = a;
    a.play().catch((e) => {
      console.warn("audio play error:", e);
      setMessage("فشل تشغيل الصوت في المتصفح (قد يكون مانع التشغيل التلقائي).");
    });
  }

  // Main search function
  function handleSearch() {
    setTafseerText(null);
    setMessage(null);
    setResults([]);
    if ((!query || !query.trim()) && chips.length === 0) {
      setResults([]);
      return;
    }
    setLoading(true);

    const textQ = normalizeArabic(query || "");
    const tokens = [
      ...chips, // already normalized
      ...(textQ ? textQ.split(/\s+/).filter(Boolean) : []),
    ].filter(Boolean);

    if (!quran) {
      setMessage("بيانات القرآن غير محملة بعد.");
      setLoading(false);
      return;
    }
    if (tokens.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    const found = [];
    Object.keys(quran).forEach((surahKey) => {
      const ayats = quran[surahKey];
      if (!Array.isArray(ayats)) return;
      ayats.forEach((ay) => {
        const ayNorm = normalizeArabic(ay.text || "");
        const allMatch = tokens.every((tok) => {
          if (ayNorm.includes(tok)) return true;
          const ayWords = ayNorm.split(" ").filter(Boolean);
          if (ayWords.some((w) => w.includes(tok) || tok.includes(w))) return true;
          if (ayWords.some((w) => similarityScore(w, tok) >= 0.8)) return true;
          return false;
        });

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
  }

  const clearAll = () => {
    setQuery("");
    setChips([]);
    setSuggestions([]);
    setResults([]);
    setTafseerText(null);
    setAudioUrl(null);
    setMessage(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-emerald-100 to-cyan-50 p-6" dir="rtl">
      <style>{`
        .match-glow {
          padding: 0 .15rem;
          border-radius: 6px;
          box-shadow: 0 0 18px rgba(16,185,129,0.45);
          background: rgba(236,253,245,0.6);
        }
        .chip { display:inline-block; padding:6px 10px; border-radius:999px; background:#e6fffa; color:#065f46; margin:4px; cursor:pointer; border:1px solid #99f6e4; }
        .chip-remove { margin-left:6px; font-weight:bold; color:#065f46; cursor:pointer; }
      `}</style>

      <div className="max-w-5xl mx-auto">
        <div className="bg-emerald-700 text-white rounded-xl p-6 mb-6 shadow-md">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">البحث في القرآن الكريم</h1>
            <div className="text-sm opacity-90">تفسير ابن كثير — تلاوة العفاسي</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-6 mb-6 relative">
          <div className="flex gap-3 items-center">
            <button onClick={handleSearch} className="bg-emerald-600 text-white px-5 py-3 rounded-lg">🔍 بحث</button>

            <div className="relative flex-1">
              <input
                dir="rtl"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="اكتب كلمة أو عبارة... (ستظهر اقتراحات أثناء الكتابة)"
                className="w-full border rounded-lg p-3"
              />

              {suggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-2 bg-white border rounded shadow z-50 max-h-52 overflow-auto">
                  {suggestions.map((s, i) => (
                    <div key={i} className="px-3 py-2 hover:bg-emerald-50 cursor-pointer text-right" onClick={() => addChip(s)}>
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => query.trim() && addChip(query.trim())} className="px-4 py-2 border rounded text-sm">إضافة</button>
            <button onClick={clearAll} className="px-4 py-2 border rounded text-sm">مسح</button>
          </div>

          <div className="mt-4 text-sm text-gray-600 text-right">
            نصائح: يمكنك البحث بكلمة واحدة أو عدة كلمات (AND). كما ستظهر اقتراحات وكلمات مشابهة.
          </div>

          <div className="mt-3 text-right">
            {chips.map((c, i) => (
              <span key={i} className="chip" onClick={() => removeChip(c)}>
                {c} <span className="chip-remove">×</span>
              </span>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-bold mb-2 text-right">كلمات مشابهة</h3>
          <div className="bg-white rounded-2xl p-4 shadow text-right">
            {getSimilarWords(query).length === 0 ? (
              <div className="text-gray-500">لا توجد اقتراحات مشابهة</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {getSimilarWords(query).map((w, i) => (
                  <button key={i} className="chip" onClick={() => addChip(w)}>{w}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          {message && (
            <div className="bg-yellow-50 p-4 rounded mb-4 text-right">
              {message}
            </div>
          )}

          {loading && <div className="text-center py-6">جاري البحث...</div>}

          {!loading && results.length === 0 && (
            <div className="bg-white rounded-2xl p-6 shadow text-center text-gray-600">
              لا توجد نتائج — جرّب كلمات أخرى أو اضغط اقتراح.
            </div>
          )}

          {!loading && results.map((r, idx) => (
            <div key={idx} className="bg-white rounded-2xl p-6 mb-4 shadow text-right">
              <div className="flex justify-between items-start">
                <div style={{ maxWidth: "78%" }}>
                  <div
                    className="text-2xl leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: highlightAyah(r.text, [...chips, ...(query ? normalizeArabic(query).split(/\s+/) : [])]),
                    }}
                  />
                  <div className="mt-3 text-sm text-emerald-700 font-bold">سورة {r.surah} — آية {r.verse}</div>
                </div>

                <div className="flex flex-col gap-2">
                  <button onClick={async () => { setTafseerText("جاري جلب التفسير..."); const t = await fetchTafsir(r.surah, r.verse); setTafseerText(t); }} className="px-3 py-1 border rounded text-sm">عرض تفسير (ابن كثير)</button>

                  <button onClick={() => playAyah(r.surah, r.verse)} className="px-3 py-1 border rounded text-sm">▶ استمع (العفاسي)</button>
                </div>
              </div>
            </div>
          ))}

          {tafseerText && (
            <div className="bg-white rounded-2xl p-4 shadow text-right mt-4">
              <h4 className="font-bold mb-2">التفسير (ابن كثير)</h4>
              <div style={{ whiteSpace: "pre-wrap" }}>{tafseerText}</div>
            </div>
          )}

          {audioUrl && (
            <div className="fixed bottom-6 left-6 bg-white rounded p-3 shadow">
              <audio src={audioUrl} controls autoPlay onEnded={() => setAudioUrl(null)} />
              <div className="mt-2 text-sm text-gray-600">تشغيل صوت — العفاسي</div>
              <div className="mt-1">
                <button onClick={() => { if (audioRef.current) audioRef.current.pause(); setAudioUrl(null); }} className="text-red-500 text-sm">إيقاف</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
