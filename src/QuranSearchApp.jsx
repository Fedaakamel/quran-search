import React, { useState, useMemo } from 'react';
import { Search, Book, Info } from 'lucide-react';

const QuranSearchApp = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const quranData = useMemo(() => [
    { surah: 'الفاتحة', ayahNumber: 1, ayah: 'بسم الله الرحمن الرحيم', tafsir: 'البسملة...', story: 'قصة الفاتحة...' },
    { surah: 'الفاتحة', ayahNumber: 2, ayah: 'الحمد لله رب العالمين', tafsir: 'الحمد لله...', story: '...' },
    { surah: 'البقرة', ayahNumber: 255, ayah: 'الله لا إله إلا هو الحي القيوم', tafsir: 'شرح آية الكرسي...', story: '...' },
    { surah: 'الإخلاص', ayahNumber: 1, ayah: 'قل هو الله أحد', tafsir: '...', story: '...' },
    { surah: 'الناس', ayahNumber: 1, ayah: 'قل أعوذ برب الناس', tafsir: '...', story: '...' }
  ], []);

  const normalizeArabic = (txt) =>
    txt
      .replace(/[ً-ْٰ]/g, '')
      .replace(/ـ/g, '')
      .replace(/[إأآا]/g, 'ا')
      .replace(/[ؤ]/g, 'و')
      .replace(/[ئ]/g, 'ي')
      .replace(/[ة]/g, 'ه')
      .replace(/[ى]/g, 'ي')
      .toLowerCase();

  const similarity = (a, b) => {
    const longer = Math.max(a.length, b.length);
    const shorter = Math.min(a.length, b.length);
    const dist = Math.abs(longer - shorter);
    return 1 - dist / longer;
  };

  const search = () => {
    if (!searchTerm.trim()) return setResults([]);
    setLoading(true);
    const q = normalizeArabic(searchTerm);
    const words = q.split(' ');
    const filtered = quranData.filter(({ ayah }) => {
      const normAyah = normalizeArabic(ayah);
      return words.every((w) => normAyah.includes(w) || similarity(normAyah, w) > 0.8);
    });
    setTimeout(() => {
      setResults(filtered);
      setLoading(false);
    }, 300);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto" dir="rtl">
      <h1 className="text-4xl font-bold text-center mb-6">البحث في القرآن الكريم</h1>

      <div className="flex gap-2">
        <input
          className="flex-1 border p-3 rounded"
          placeholder="اكتب كلمة أو جملة..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />

        <button className="bg-green-600 text-white px-6 py-3 rounded" onClick={search}>
          بحث
        </button>
      </div>

      {loading && <p className="text-center mt-6">جاري البحث...</p>}

      {!loading && results.length > 0 && (
        <div className="mt-6 space-y-4">
          {results.map((r, i) => (
            <div key={i} className="border p-4 rounded bg-white shadow">
              <h2 className="text-xl font-bold">سورة {r.surah} — آية {r.ayahNumber}</h2>
              <p className="text-2xl my-4">{r.ayah}</p>
              <p><strong>التفسير:</strong> {r.tafsir}</p>
              <p className="mt-2"><strong>القصة:</strong> {r.story}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default QuranSearchApp;
