(function() {
  'use strict';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  // ═══ State ═══
  const S = {
    all: [],
    quran: [],
    athkar: [],
    currentTab: 'quran',
    filtered: [],
    query: '',
    sortBy: 'num',
    view: 'grid',
    theme: 'auto',
    dirName: '',
    currentIdx: -1,
    isPlaying: false,
    isShuffle: false,
    isRepeat: false,
    isMuted: false,
    miniMode: false,
    currentURL: null,
    queue: [], curPath: null, hist: [],
    favs: new Set((() => { try { return JSON.parse(store.get('quran_favs') || '[]'); } catch (e) { return []; } })()),
    handle: null, metaCache: new Map(), sig: '', resumeAt: 0, sleepAt: 0, sleepEnd: false, ghost: null, ghostDismissed: false,
  };

  let userVol = 1, fadeF = 1, fadeT = 0, fadeRes = null, pausing = false;
  const STAR_SVG = '<svg viewBox="0 0 24 24" stroke-linejoin="round"><path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6 6.2 20.7l1.1-6.5L2.6 9.6l6.5-.9z"/></svg>';

  const AUDIO_EXT = ['mp3','wav','ogg','m4a','aac','flac','opus','webm'];
  const ATHKAR_KW = ['أذكار','اذكار','ذكر','دعاء','أدعية','ادعية','تسبيح','استغفار','أسماء الله','اسماء الله'];

  // ═══ أسماء السور (للتعرّف التلقائي على رقم السورة) ═══
  const SURAHS = 'الفاتحة البقرة عمران النساء المائدة الأنعام الأعراف الأنفال التوبة يونس هود يوسف الرعد إبراهيم الحجر النحل الإسراء الكهف مريم طه الأنبياء الحج المؤمنون النور الفرقان الشعراء النمل القصص العنكبوت الروم لقمان السجدة الأحزاب سبأ فاطر يس الصافات ص الزمر غافر فصلت الشورى الزخرف الدخان الجاثية الأحقاف محمد الفتح الحجرات ق الذاريات الطور النجم القمر الرحمن الواقعة الحديد المجادلة الحشر الممتحنة الصف الجمعة المنافقون التغابن الطلاق التحريم الملك القلم الحاقة المعارج نوح الجن المزمل المدثر القيامة الإنسان المرسلات النبأ النازعات عبس التكوير الانفطار المطففين الانشقاق البروج الطارق الأعلى الغاشية الفجر البلد الشمس الليل الضحى الشرح التين العلق القدر البينة الزلزلة العاديات القارعة التكاثر العصر الهمزة الفيل قريش الماعون الكوثر الكافرون النصر المسد الإخلاص الفلق الناس'.split(' ');

  const SURAHS_EN = "Al-Fatihah|Al-Baqarah|Ali 'Imran|An-Nisa|Al-Ma'idah|Al-An'am|Al-A'raf|Al-Anfal|At-Tawbah|Yunus|Hud|Yusuf|Ar-Ra'd|Ibrahim|Al-Hijr|An-Nahl|Al-Isra|Al-Kahf|Maryam|Taha|Al-Anbiya|Al-Hajj|Al-Mu'minun|An-Nur|Al-Furqan|Ash-Shu'ara|An-Naml|Al-Qasas|Al-Ankabut|Ar-Rum|Luqman|As-Sajdah|Al-Ahzab|Saba|Fatir|Ya-Sin|As-Saffat|Sad|Az-Zumar|Ghafir|Fussilat|Ash-Shura|Az-Zukhruf|Ad-Dukhan|Al-Jathiyah|Al-Ahqaf|Muhammad|Al-Fath|Al-Hujurat|Qaf|Adh-Dhariyat|At-Tur|An-Najm|Al-Qamar|Ar-Rahman|Al-Waqi'ah|Al-Hadid|Al-Mujadila|Al-Hashr|Al-Mumtahanah|As-Saff|Al-Jumu'ah|Al-Munafiqun|At-Taghabun|At-Talaq|At-Tahrim|Al-Mulk|Al-Qalam|Al-Haqqah|Al-Ma'arij|Nuh|Al-Jinn|Al-Muzzammil|Al-Muddaththir|Al-Qiyamah|Al-Insan|Al-Mursalat|An-Naba|An-Nazi'at|Abasa|At-Takwir|Al-Infitar|Al-Mutaffifin|Al-Inshiqaq|Al-Buruj|At-Tariq|Al-A'la|Al-Ghashiyah|Al-Fajr|Al-Balad|Ash-Shams|Al-Layl|Ad-Duha|Ash-Sharh|At-Tin|Al-Alaq|Al-Qadr|Al-Bayyinah|Az-Zalzalah|Al-Adiyat|Al-Qari'ah|At-Takathur|Al-Asr|Al-Humazah|Al-Fil|Quraysh|Al-Ma'un|Al-Kawthar|Al-Kafirun|An-Nasr|Al-Masad|Al-Ikhlas|Al-Falaq|An-Nas".split('|');

  // ═══ IndexedDB ═══
  const DB = 'quran_db_v1', STORE = 'files';

  function openDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB, 1);
      req.onerror = () => rej(req.error);
      req.onsuccess = () => res(req.result);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'path' });
        }
      };
    });
  }

  async function saveToDB(files) {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    await new Promise((res, rej) => {
      const r = store.clear();
      r.onsuccess = res; r.onerror = rej;
    });
    for (const f of files) {
      store.put({
        path: f.path, name: f.name, size: f.size, type: f.type,
        ext: f.ext, lastModified: f.lastModified, title: f.title,
        num: f.num, category: f.category, blob: f.file,
      });
    }
    return new Promise((res, rej) => {
      tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  }

  async function loadFromDB() {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
  }

  // ═══ Helpers ═══
  const $ = id => document.getElementById(id);
  const ext = n => { const p = n.split('.'); return p.length > 1 ? p.pop().toLowerCase() : ''; };
  const isAudio = n => AUDIO_EXT.includes(ext(n));
  const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

  function extractNum(name) {
    const m = name.match(/\d+/g);
    if (!m) return null;
    for (const x of m) {
      const n = parseInt(x, 10);
      if (n >= 1 && n <= 6236) return n;
    }
    return null;
  }

  // ⏱️ تنسيق الوقت — يدعم الساعات
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const t = Math.floor(sec);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return m + ':' + String(s).padStart(2, '0');
  }

  function detectCat(title, name, path) {
    const t = norm((title || '') + ' ' + (name || '') + ' ' + dirOf(path).join(' '));
    for (const kw of ATHKAR_KW) if (t.includes(norm(kw))) return 'athkar';
    return 'quran';
  }

  const displayName = f => f.title || f.name;
  const norm = s => (s || '').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  const stripAl = w => w.replace(/^ال(?=.{2,})/, '');
  const SURAH_MAP = {};
  SURAHS.forEach((n, i) => { SURAH_MAP[stripAl(norm(n))] = i + 1; });
  // "سورة البقرة" / "سورة آل عمران" / أو اسم قصير وحده؛ الأجزاء اللاتينية والأرقام تُتجاهل
  function surahByName(text) {
    const tk = norm(text).split(/[^\u0621-\u064A]+/).filter(Boolean);
    const i = tk.indexOf('سوره');
    if (i >= 0) { let j = i + 1; if (tk[j] === 'ال') j++; return SURAH_MAP[stripAl(tk[j] || '')] || 0; }
    return tk.length <= 2 ? (SURAH_MAP[stripAl(tk[0] || '')] || 0) : 0;
  }
  // أسماء لاتينية: Al-Fatihah / Surah Yasin / Al-Kaafiroon ... (تطبيع بسيط للتهجئات)
  const EN_SKIP = new Set(['al', 'an', 'ar', 'as', 'ash', 'at', 'ath', 'ad', 'adh', 'az', 'ali', 'the', 'surah', 'surat', 'sura']);
  const enTokens = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f'’ʿʾ`]/g, '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const enKey = a => a.join('').replace(/w/g, 'u').replace(/y/g, 'i').replace(/oo/g, 'u').replace(/ee/g, 'i').replace(/(.)h/g, '$1').replace(/(.)\1+/g, '$1');
  const EN_MAP = {};
  SURAHS_EN.forEach((n, i) => { EN_MAP[enKey(enTokens(n).filter(w => !EN_SKIP.has(w)))] = i + 1; });
  function surahByEn(text) {
    const raw = enTokens(text);
    const hasWord = raw.some(w => w === 'surah' || w === 'surat' || w === 'sura');
    const tk = raw.filter(w => !EN_SKIP.has(w));
    if (!hasWord && tk.length > 2) return 0;
    for (let i = 0; i < tk.length; i++) {
      const one = EN_MAP[enKey([tk[i]])];
      if (one) return one;
      const two = tk[i + 1] && EN_MAP[enKey([tk[i], tk[i + 1]])];
      if (two) return two;
    }
    return 0;
  }
  const dirOf = p => (p || '').split('/').slice(0, -1);
  // عرض مرتّب: يحذف بادئة الرقم والجزء الإنجليزي إن وُجد عربي
  function cleanTitle(t) {
    const t0 = (t || '').replace(/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i, '');
    let x = t0.replace(/^\s*\d+\s*[-–—.:_)]*\s*/, '');
    if (/[\u0600-\u06FF]/.test(x) && /[A-Za-z]/.test(x)) {
      const a = x.replace(/\([^)]*[A-Za-z][^)]*\)/g, '').replace(/[A-Za-z][A-Za-z'’\-\s]*/g, '').replace(/^[\s\-–—.:_]+|[\s\-–—.:_]+$/g, '');
      if (a) x = a;
    }
    return x || t0;
  }
  function assignMeta(f) {
    f.category = detectCat(f.title, f.name, f.path);
    const byName = f.category === 'quran' ? (surahByName(f.title) || surahByName(f.name) || surahByName(dirOf(f.path).pop()) || surahByEn(f.title) || surahByEn(f.name)) : 0;
    f.num = byName || (extractNum(f.title || '') ?? extractNum(f.name));
  }
  let toastT;
  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

  // ═══ أيقونات الأذكار ═══
  function athkarIcon(title, name) {
    const t = ((title || '') + ' ' + (name || '')).toLowerCase();
    if (t.includes('صباح')) return { svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>', label: 'أذكار الصباح' };
    if (t.includes('مساء')) return { svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 15A8 8 0 1 1 11 4a7 7 0 0 0 9 11z"/></svg>', label: 'أذكار المساء' };
    if (t.includes('نوم')) return { svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6"/><path d="M3 18h18"/><path d="M7 10V6h10v4"/></svg>', label: 'أذكار النوم' };
    if (t.includes('استيقاظ')) return { svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 7l2.1-2.1"/></svg>', label: 'أذكار الاستيقاظ' };
    if (t.includes('دعاء') || t.includes('أدعية') || t.includes('ادعية')) return { svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v6M12 16v6M8 8a4 4 0 0 0 8 0M8 16a4 4 0 0 1 8 0"/></svg>', label: 'دعاء' };
    if (t.includes('تسبيح')) return { svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/></svg>', label: 'تسبيح' };
    if (t.includes('استغفار')) return { svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>', label: 'استغفار' };
    return { svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l2.5 5 5.5.8-4 4 1 5.5L12 15.8 7 18.3l1-5.5-4-4L9.5 8z"/></svg>', label: 'ذكر' };
  }

  // ═══ DOM refs ═══
  const splash = $('splash');
  const tabs = $('tabs'), tabQuran = $('tabQuran'), tabAthkar = $('tabAthkar');
  const qCount = $('qCount'), aCount = $('aCount');
  const tabFavs = $('tabFavs'), fCount = $('fCount'), permBtn = $('permBtn');
  const speedBtn = $('speedBtn'), sleepBtn = $('sleepBtn'), favBtn = $('favBtn');
  const toolbar = $('toolbar'), search = $('search'), clearBtn = $('clearBtn');
  const empty = $('empty'), grid = $('grid'), noResults = $('noResults'), skel = $('skel');
  const pickBtn = $('pickBtn'), pickBtn2 = $('pickBtn2');
  const viewBtn = $('viewBtn'), viewIcon = $('viewIcon');
  const themeBtn = $('themeBtn'), themeIcon = $('themeIcon');

  const player = $('player'), phTitle = $('phTitle');
  const pNum = $('pNum'), pTitle = $('pTitle'), vinyl = $('vinyl');
  const progress = $('progress'), progressFill = $('progressFill');
  const tCurrent = $('tCurrent'), tTotal = $('tTotal');
  const minimizeBtn = $('minimizeBtn'), closeBtn = $('closeBtn');
  const playBtn = $('playBtn'), playIcon = $('playIcon');
  const prevBtn = $('prevBtn'), nextBtn = $('nextBtn');
  const shuffleBtn = $('shuffleBtn'), repeatBtn = $('repeatBtn');
  const muteBtn = $('muteBtn'), muteIcon = $('muteIcon'), volumeSlider = $('volumeSlider');

  const audio = $('audio');

  const mini = $('mini'), miniVinyl = $('miniVinyl'), miniTitle = $('miniTitle');
  const miniFill = $('miniFill'), miniPlay = $('miniPlay'), miniPlayIcon = $('miniPlayIcon');
  const miniPrev = $('miniPrev'), miniNext = $('miniNext'), miniClose = $('miniClose');

  // ═══ Theme ═══
  function applyTheme(t, save = true) {
    if (!['auto', 'light', 'dark'].includes(t)) t = 'auto';
    S.theme = t;
    const root = document.documentElement;
    if (t === 'dark') root.setAttribute('data-theme', 'dark');
    else if (t === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    themeIcon.innerHTML = dark
      ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'
      : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    if (save) store.set('quran_theme', t);
    const lb = { auto: 'الوضع: تلقائي', light: 'الوضع: فاتح', dark: 'الوضع: داكن' }[t];
    themeBtn.title = lb; themeBtn.setAttribute('aria-label', lb);
  }
  themeBtn.addEventListener('click', () => {
    const o = ['auto','light','dark'], i = o.indexOf(S.theme);
    applyTheme(o[(i+1) % o.length]);
  });
  applyTheme(store.get('quran_theme') || 'auto', false);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.theme === 'auto') applyTheme('auto'); });

  // ═══ View Toggle ═══
  viewBtn.addEventListener('click', () => {
    S.view = S.view === 'grid' ? 'list' : 'grid';
    store.set('quran_view', S.view);
    viewIcon.innerHTML = S.view === 'list'
      ? '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'
      : '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>';
    render();
  });
  const sv = store.get('quran_view');
  if (sv === 'list') { S.view = 'list'; viewIcon.innerHTML = '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'; }

  // ═══ Directory Picker ═══
  async function pickDir() {
    try {
      if (window.showDirectoryPicker) {
        const h = await window.showDirectoryPicker({ mode: 'read' });
        S.dirName = h.name; S.handle = h; S.metaCache = new Map(); showSkel();
        try { await kv('set', 'dir', h); await kv('delete', 'meta'); } catch (e) {}
        await scanHandle();
      } else fallbackPick();
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error(e); finalize(); fallbackPick();
    }
  }

  async function walkDir(handle, arr, path = '') {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        if (!isAudio(entry.name) || entry.name.startsWith('.')) continue;
        try {
          const f = await entry.getFile();
          arr.push({ name: f.name, size: f.size, type: f.type, ext: ext(f.name), file: f, path: path + f.name, lastModified: f.lastModified, title: null });
        } catch (e) {}
      } else if (entry.kind === 'directory') {
        await walkDir(entry, arr, path + entry.name + '/');
      }
    }
  }

  function fallbackPick() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.webkitdirectory = true; inp.multiple = true;
    inp.style.display = 'none';
    inp.addEventListener('change', async () => {
      const files = Array.from(inp.files || []).filter(f => isAudio(f.name) && !f.name.startsWith('.'));
      inp.remove();
      if (files.length === 0) { toast('لم يتم العثور على ملفات صوتية'); return; }
      showSkel();
      S.dirName = (files[0].webkitRelativePath || '').split('/')[0] || 'مجلد صوتيات';
      await processFiles(files.map(f => ({
        name: f.name, size: f.size, type: f.type, ext: ext(f.name),
        file: f, path: (f.webkitRelativePath || '').split('/').slice(1).join('/') || f.name,
        lastModified: f.lastModified, title: null,
      })));
    });
    inp.addEventListener('cancel', () => inp.remove());
    document.body.appendChild(inp);
    inp.click();
  }

  async function processFiles(arr, handleMode) {
    if (!arr.length) { impHide(); finalize(); toast('لا توجد ملفات صوتية في هذا المجلد'); return; }
    await extractTitles(arr, handleMode ? S.metaCache : null);
    arr.forEach(assignMeta);
    const sig = arr.map(f => f.path + '|' + f.size + '|' + f.lastModified).join(';');
    const same = handleMode && sig === S.sig && S.all.length > 0 && S.all[0].file;
    S.sig = sig; S.all = arr;
    if (!handleMode) S.handle = null;
    store.set('quran_folder', S.dirName);
    if (!same) finalize();           // القائمة تظهر فورًا، والحفظ يكمل بالخلفية
    if (handleMode) {
      impHide();
      try { await kv('set', 'meta', arr.map(f => ({ path: f.path, name: f.name, size: f.size, lastModified: f.lastModified, title: f.title }))); } catch (e) {}
    } else await saveCopies(arr);
  }

  // المتصفحات التي تدعم مؤشر المجلد: لا ننسخ الملفات، فقط نقرأ المجلد ونتتبّع التغييرات
  async function scanHandle() {
    const arr = []; await walkDir(S.handle, arr, '');
    await processFiles(arr, true);
  }
  let lastScan = 0;
  async function refreshHandle() {
    if (!S.handle) return;
    lastScan = Date.now(); permBtn.classList.add('hidden');
    try { await scanHandle(); } catch (e) { console.warn(e); impHide(); toast('تعذّر قراءة المجلد'); }
  }
  permBtn.addEventListener('click', async () => {
    try { if (await S.handle.requestPermission({ mode: 'read' }) === 'granted') await refreshHandle(); } catch (e) { toast('تعذّر الحصول على الإذن'); }
  });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !S.handle || Date.now() - lastScan < 15000) return;
    try { if (await S.handle.queryPermission({ mode: 'read' }) === 'granted') await refreshHandle(); } catch (e) {}
  });
  async function ensureFile(f) {
    try { if (S.handle && await S.handle.requestPermission({ mode: 'read' }) === 'granted') { await refreshHandle(); return true; } } catch (e) {}
    toast('اسمح بالوصول للمجلد أولًا'); return false;
  }

  // نسخ احتياطي للملفات داخل المتصفح (جوال / سفاري / فايرفوكس) على دفعات مع شريط تقدّم
  async function saveCopies(arr) {
    try {
      const db = await openDB();
      await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = res; tx.onerror = tx.onabort = () => rej(tx.error); });
      for (let i = 0; i < arr.length; i += 8) {
        const chunk = arr.slice(i, i + 8);
        impShow('حفظ للفتح لاحقًا: ' + chunk[0].name, Math.min(i + 8, arr.length), arr.length);
        await new Promise((res, rej) => {
          const tx = db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
          chunk.forEach(f => st.put({ path: f.path, name: f.name, size: f.size, type: f.type, ext: f.ext, lastModified: f.lastModified, title: f.title, num: f.num, category: f.category, blob: f.file }));
          tx.oncomplete = res; tx.onerror = tx.onabort = () => rej(tx.error);
        });
        await tick();
      }
      navigator.storage && navigator.storage.persist && navigator.storage.persist();
      try { await kv('delete', 'dir'); await kv('delete', 'meta'); } catch (e) {}
      toast('تم تحميل ' + arr.length + ' ملف');
    } catch (e) { console.warn(e); toast('تعذّر حفظ الملفات للفتح لاحقًا (المساحة غير كافية)'); }
    impHide();
  }

  function finalize() {
    hideSkel();
    if (S.all.length === 0) { showEmpty(); return; }
    S.quran = S.all.filter(f => f.category === 'quran');
    S.athkar = S.all.filter(f => f.category === 'athkar');
    qCount.textContent = S.quran.length;
    aCount.textContent = S.athkar.length;
    fCount.textContent = S.all.filter(f => S.favs.has(f.path)).length;
    empty.classList.add('hidden');
    grid.classList.remove('hidden');
    toolbar.classList.remove('hidden');
    tabs.classList.remove('hidden');
    syncPill(false);
    render();
    showResume();
  }

  function showSkel() {
    empty.classList.add('hidden'); noResults.classList.add('hidden');
    grid.classList.add('hidden'); skel.classList.remove('hidden');
    toolbar.classList.add('hidden'); tabs.classList.add('hidden');
  }
  function hideSkel() { skel.classList.add('hidden'); }
  function showEmpty() {
    empty.classList.remove('hidden'); noResults.classList.add('hidden');
    grid.classList.add('hidden'); skel.classList.add('hidden');
    toolbar.classList.add('hidden'); tabs.classList.add('hidden');
  }

  pickBtn.addEventListener('click', pickDir);
  pickBtn2.addEventListener('click', pickDir);

  // ═══ Tabs ═══
  tabQuran.addEventListener('click', () => switchTab('quran'));
  tabAthkar.addEventListener('click', () => switchTab('athkar'));
  tabFavs.addEventListener('click', () => switchTab('favs'));
  // شريط التبويب المنزلق: يُقاس من offsetLeft/offsetWidth (يعمل مع RTL أيضًا)
  const tPill = $('tPill');
  function syncPill(animate) {
    const a = document.querySelector('.t-tab[aria-selected="true"]');
    if (!a || !a.offsetWidth) return;
    if (!animate) tPill.style.transition = 'none';
    tPill.style.transform = `translateX(${a.offsetLeft}px)`;
    tPill.style.width = a.offsetWidth + 'px';
    if (!animate) { void tPill.offsetWidth; tPill.style.transition = ''; }
  }
  window.addEventListener('resize', () => syncPill(false));
  function switchTab(t) {
    S.currentTab = t;
    tabQuran.setAttribute('aria-selected', t === 'quran');
    tabAthkar.setAttribute('aria-selected', t === 'athkar');
    tabFavs.setAttribute('aria-selected', t === 'favs');
    syncPill(true);
    search.value = ''; S.query = ''; clearBtn.classList.remove('visible');
    render();
  }

  // ═══ Restore ═══
  async function restoreHandle(h) {
    S.handle = h; S.dirName = h.name;
    const meta = (await kv('get', 'meta')) || [];
    S.metaCache = new Map(meta.map(m => [m.path, m]));
    if (S.all.length === 0 && meta.length) {   // اعرض المكتبة المحفوظة فورًا
      S.all = meta.map(m => ({ ...m, ext: ext(m.name), type: '', file: null }));
      S.all.forEach(assignMeta); finalize();
    }
    if (await h.queryPermission({ mode: 'read' }) === 'granted') await refreshHandle();
    else permBtn.classList.remove('hidden');
  }

  async function restore() {
    try {
      const h = await kv('get', 'dir');
      if (h && h.kind === 'directory') { await restoreHandle(h); return; }
    } catch (e) { console.warn(e); }
    try {
      const stored = await loadFromDB();
      if (stored.length === 0 || S.all.length > 0) return;
      S.all = stored.map(x => ({ ...x, file: x.blob }));
      S.all.forEach(assignMeta);
      finalize();
    } catch (e) { console.warn(e); }
  }

  // ═══ Search ═══
  let deb;
  search.addEventListener('input', () => {
    clearTimeout(deb);
    const v = search.value.trim();
    clearBtn.classList.toggle('visible', v.length > 0);
    deb = setTimeout(() => { S.query = v; render(); }, 250);
  });
  clearBtn.addEventListener('click', () => {
    search.value = ''; S.query = ''; clearBtn.classList.remove('visible');
    render(); search.focus();
  });

  // ═══ Render ═══
  function currentList() { return S.currentTab === 'quran' ? S.quran : S.currentTab === 'athkar' ? S.athkar : S.all.filter(f => S.favs.has(f.path)); }

  function render() {
    if (S.all.length === 0) return;
    const q = norm(S.query).trim();
    let list = [...currentList()];
    if (q) {
      list = list.filter(f => {
        return norm(displayName(f)).includes(q) || norm(f.name).includes(q) || (f.num && String(f.num).includes(q));
      });
    }
    const byName = (a, b) => displayName(a).localeCompare(displayName(b), 'ar', { numeric: true });
    if (S.sortBy === 'name') list.sort(byName);
    else if (S.sortBy === 'date') list.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0) || byName(a, b));
    else list.sort((a, b) => (a.num || 999999) - (b.num || 999999) || byName(a, b));

    S.filtered = list;
    grid.innerHTML = '';
    grid.className = 'grid' + (S.view === 'list' ? ' list' : '');

    list.forEach((f, idx) => {
      const card = document.createElement('div');
      card.className = 'card';
      if (S.curPath === f.path) card.classList.add('playing');
      card.dataset.path = f.path; card.tabIndex = 0; card.setAttribute('role', 'button');
      card.style.animationDelay = Math.min(idx * 30, 600) + 'ms';
      const dn = displayName(f);

      let badgeHTML;
      if (f.category === 'athkar') {
        const ic = athkarIcon(f.title, f.name + ' ' + dirOf(f.path).join(' '));
        badgeHTML = `<div class="badge" aria-label="${ic.label}">${ic.svg}</div>`;
      } else {
        badgeHTML = `<div class="badge">${f.num || '—'}</div>`;
      }

      card.innerHTML = `${badgeHTML}<div class="card-body"><div class="card-title">${esc(cleanTitle(dn))}</div></div>`;
      const fb = document.createElement('button');
      const on = S.favs.has(f.path);
      fb.className = 'fav' + (on ? ' on' : ''); fb.innerHTML = STAR_SVG;
      fb.setAttribute('aria-label', 'مفضلة'); fb.setAttribute('aria-pressed', on);
      fb.addEventListener('click', e => { e.stopPropagation(); toggleFav(f.path); });
      fb.addEventListener('keydown', e => e.stopPropagation());
      card.appendChild(fb);
      card.addEventListener('click', () => playFile(f));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playFile(f); }
      });
      grid.appendChild(card);
    });

    if (list.length === 0) {
      const none = currentList().length === 0;
      const fv = none && S.currentTab === 'favs';
      $('nrTitle').textContent = fv ? 'لا توجد مفضلة بعد' : none ? 'لا توجد ملفات في هذا القسم' : 'لا توجد نتائج';
      $('nrText').textContent = fv ? 'اضغط على النجمة في أي سورة لإضافتها هنا.' : none ? 'اختر مجلدًا يحتوي على ملفات هذا القسم.' : 'جرّب كلمات بحث أخرى.';
      grid.classList.add('hidden'); noResults.classList.remove('hidden');
    } else {
      noResults.classList.add('hidden'); grid.classList.remove('hidden');
    }
  }

  // ═══ Playback ═══
  async function playFile(f, noOpen) {
    if (!f.file) {
      if (!(await ensureFile(f))) return;
      f = S.all.find(x => x.path === f.path) || f;
      if (!f.file) return;
    }
    S.queue = (S.filtered.length > 0 ? S.filtered : currentList()).slice();
    S.hist = [];
    loadPlay(f);
    if (noOpen) mini.classList.add('visible'); else openPlayer();
  }

  function loadPlay(f) {
    if (!f) return;
    S.curPath = f.path; S.ghost = null; S.ghostDismissed = false; mini.classList.remove('ghost');
    pausing = false; fadeF = 1; applyVol();
    if (S.currentURL) URL.revokeObjectURL(S.currentURL);
    const blob = f.file instanceof Blob ? f.file : new Blob([f.file]);
    S.currentURL = URL.createObjectURL(blob);
    audio.src = S.currentURL;
    audio.load();

    const dn = cleanTitle(displayName(f));
    phTitle.textContent = f.category === 'athkar' ? 'أذكار' : 'قرآن';
    pNum.textContent = f.num || '—';
    pTitle.textContent = dn;
    miniTitle.textContent = dn;
    document.title = dn + ' — القرآن الكريم';
    progressFill.style.width = miniFill.style.width = '0%';
    tCurrent.textContent = tTotal.textContent = '0:00';
    setMedia(f, dn);
    syncFavUI();

    if (document.visibilityState === 'visible') { fadeF = 0; applyVol(); }
    audio.play().then(() => {
      fadeTo(1, 300);
      S.isPlaying = true;
      updatePlayUI();
    }).catch(e => { if (e.name === 'AbortError') return; fadeF = 1; applyVol(); console.warn(e); S.isPlaying = false; updatePlayUI(); });

    highlightCard(f.path);
  }

  function highlightCard(path) {
    document.querySelectorAll('.card').forEach(c => c.classList.toggle('playing', c.dataset.path === path));
  }

  function updatePlayUI() {
    const svg = S.isPlaying
      ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'
      : '<path d="M8 5v14l11-7z"/>';
    playIcon.innerHTML = svg;
    miniPlayIcon.innerHTML = svg;
    playBtn.setAttribute('aria-label', S.isPlaying ? 'إيقاف' : 'تشغيل');
    vinyl.classList.toggle('playing', S.isPlaying);
    miniVinyl.classList.toggle('playing', S.isPlaying);
  }

  function openPlayer() {
    player.classList.add('open');
    document.body.style.overflow = 'hidden';
    S.miniMode = false;
    mini.classList.remove('visible');
  }

  function minimizePlayer() {
    player.classList.remove('open');
    document.body.style.overflow = '';
    S.miniMode = true;
    if (S.curPath) {
      mini.classList.add('visible');
      const c = grid.querySelector('.card.playing');
      if (c) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function closePlayer() {
    closePops(); fadeF = 1; pausing = false; applyVol();
    player.classList.remove('open');
    mini.classList.remove('visible');
    document.body.style.overflow = '';
    saveLast(true);
    audio.pause();
    audio.removeAttribute('src'); audio.load();
    if (S.currentURL) { URL.revokeObjectURL(S.currentURL); S.currentURL = null; }
    S.isPlaying = false; S.miniMode = false; S.curPath = null; S.queue = []; S.hist = [];
    document.title = 'القرآن الكريم — مشغل صوتي';
    progressFill.style.width = miniFill.style.width = '0%';
    updatePlayUI(); highlightCard(null); sleepReset(); syncFavUI(); showResume();
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  }

  function togglePlay() {
    if (!S.curPath) { if (S.ghost) resumeGhost(false); return; }
    if (pausing) { pausing = false; fadeTo(1, 200); return; }   // ضغطة أثناء التلاشي = إلغاء الإيقاف
    if (audio.paused) playSoft(); else pauseSoft();
  }
  playBtn.addEventListener('click', togglePlay);
  miniPlay.addEventListener('click', e => { e.stopPropagation(); togglePlay(); });

  function step(dir) {
    const q = S.queue.length ? S.queue : currentList();
    if (q.length === 0) return;
    let i = q.findIndex(x => x.path === S.curPath);
    if (S.isShuffle && q.length > 1) {
      if (dir < 0 && S.hist.length) { const t = q.find(x => x.path === S.hist.pop()); if (t) { loadPlay(t); return; } }
      if (dir > 0 && S.curPath) S.hist.push(S.curPath);
      let j; do { j = Math.floor(Math.random() * q.length); } while (j === i);
      loadPlay(q[j]); return;
    }
    i = i < 0 ? 0 : (i + dir + q.length) % q.length;
    loadPlay(q[i]);
  }
  function playPrev() { if (audio.currentTime > 3) { audio.currentTime = 0; return; } step(-1); }
  function playNext() { step(1); }

  prevBtn.addEventListener('click', playPrev);
  nextBtn.addEventListener('click', playNext);
  miniPrev.addEventListener('click', e => { e.stopPropagation(); if (!S.ghost) playPrev(); });
  miniNext.addEventListener('click', e => { e.stopPropagation(); if (!S.ghost) playNext(); });

  shuffleBtn.addEventListener('click', () => {
    S.isShuffle = !S.isShuffle;
    shuffleBtn.classList.toggle('active', S.isShuffle);
  });
  repeatBtn.addEventListener('click', () => {
    S.isRepeat = !S.isRepeat;
    repeatBtn.classList.toggle('active', S.isRepeat);
    audio.loop = S.isRepeat;
  });

  // ═══ Volume ═══
  volumeSlider.addEventListener('input', () => {
    const v = volumeSlider.value / 100;
    userVol = v; applyVol();
    volumeSlider.style.setProperty('--v', volumeSlider.value + '%');
    store.set('quran_vol', volumeSlider.value);
    S.isMuted = v === 0;
    audio.muted = false;
    updateMuteIcon();
  });

  muteBtn.addEventListener('click', () => {
    S.isMuted = !S.isMuted;
    if (!S.isMuted && userVol === 0) { volumeSlider.value = 50; volumeSlider.dispatchEvent(new Event('input')); return; }
    audio.muted = S.isMuted;
    updateMuteIcon();
  });

  function updateMuteIcon() {
    muteBtn.classList.toggle('muted', S.isMuted || userVol === 0);
    if (S.isMuted || userVol === 0) {
      muteIcon.innerHTML = '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>';
    } else if (userVol < 0.5) {
      muteIcon.innerHTML = '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    } else {
      muteIcon.innerHTML = '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
    }
  }

  const sVol = store.get('quran_vol');
  if (sVol !== null && sVol !== '' && !isNaN(sVol)) volumeSlider.value = sVol;
  volumeSlider.dispatchEvent(new Event('input'));

  // ═══ Player buttons ═══
  closeBtn.addEventListener('click', closePlayer);
  minimizeBtn.addEventListener('click', minimizePlayer);
  miniClose.addEventListener('click', e => { e.stopPropagation(); if (S.ghost) { S.ghost = null; S.ghostDismissed = true; mini.classList.remove('visible', 'ghost'); return; } closePlayer(); });

  mini.addEventListener('click', () => {
    if (S.ghost) { resumeGhost(true); return; }
    player.classList.add('open');
    document.body.style.overflow = 'hidden';
    S.miniMode = false;
    mini.classList.remove('visible');
  });
  mini.addEventListener('keydown', e => {
    if (e.target !== mini) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (S.ghost) { resumeGhost(true); return; }
      player.classList.add('open');
      document.body.style.overflow = 'hidden';
      S.miniMode = false;
      mini.classList.remove('visible');
    }
  });

  // ═══ Progress Bar (RTL صحيح) ═══
  // الشريط في RTL: البداية من اليمين، النهاية عند اليسار
  // progress-fill مثبّت على right:0 ويتوسع لليسار عبر width
  // عند النقر: النسبة = (rect.right - clientX) / rect.width
  const seekTo = x => {
    if (!isFinite(audio.duration)) return;
    const r = progress.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (r.right - x) / r.width)) * audio.duration;
  };
  let seeking = false;
  progress.addEventListener('pointerdown', e => { seeking = true; progress.setPointerCapture(e.pointerId); seekTo(e.clientX); });
  progress.addEventListener('pointermove', e => { if (seeking) seekTo(e.clientX); });
  progress.addEventListener('pointerup', () => { seeking = false; });
  progress.addEventListener('pointercancel', () => { seeking = false; });
  progress.addEventListener('keydown', e => {
    if (!isFinite(audio.duration)) return;
    const d = e.key === 'ArrowLeft' ? 5 : e.key === 'ArrowRight' ? -5 : 0; // RTL: اليسار = تقديم
    if (d) { e.preventDefault(); audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + d)); }
  });

  audio.addEventListener('timeupdate', () => {
    saveLast(); checkSleep();
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = pct + '%';
    progress.setAttribute('aria-valuenow', Math.round(pct));
    miniFill.style.width = pct + '%';
    tCurrent.textContent = fmtTime(audio.currentTime);
    tTotal.textContent = fmtTime(audio.duration);
  });

  audio.addEventListener('loadedmetadata', () => {
    tTotal.textContent = fmtTime(audio.duration);
    if (S.resumeAt) { audio.currentTime = Math.max(0, Math.min(S.resumeAt, audio.duration - 1)); S.resumeAt = 0; }
    posState();
  });

  audio.addEventListener('ended', () => {
    if (S.isRepeat) return;
    if (S.sleepEnd) { sleepReset(); toast('انتهت السورة — تم الإيقاف'); return; }
    playNext();
  });

  audio.addEventListener('play', () => { S.isPlaying = true; updatePlayUI(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; posState(); });
  audio.addEventListener('pause', () => { S.isPlaying = false; updatePlayUI(); saveLast(true); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });

  let errCount = 0;
  audio.addEventListener('error', () => {
    if (!S.curPath) return;
    toast('تعذّر تشغيل هذا الملف');
    if (S.queue.length > 1 && ++errCount < S.queue.length) playNext();
  });
  audio.addEventListener('playing', () => { errCount = 0; });

  // أزرار قفل الشاشة / الإشعارات
  function setMedia(f, dn) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: dn, artist: f.category === 'athkar' ? 'أذكار' : 'القرآن الكريم', album: S.dirName || 'القرآن الكريم', artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] });
  }
  if ('mediaSession' in navigator) {
    [['play', () => audio.play()], ['pause', () => audio.pause()], ['previoustrack', playPrev], ['nexttrack', playNext],
     ['seekto', d => { if (d.seekTime != null) audio.currentTime = d.seekTime; }],
     ['seekbackward', d => { audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10)); }],
     ['seekforward', d => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (d.seekOffset || 10)); }]]
      .forEach(([a, h]) => { try { navigator.mediaSession.setActionHandler(a, h); } catch (e) {} });
  }

  // ═══ ID3 ═══
  function decodeText(b, enc) {
    try {
      if (enc === 1 || enc === 2) {
        let be = enc === 2, i = 0;
        if (b[0] === 0xFE && b[1] === 0xFF) { be = true; i = 2; } else if (b[0] === 0xFF && b[1] === 0xFE) { be = false; i = 2; }
        return new TextDecoder(be ? 'utf-16be' : 'utf-16le').decode(b.subarray(i));
      }
      try { return new TextDecoder('utf-8', { fatal: true }).decode(b); }
      catch (e) { return new TextDecoder(enc === 0 ? 'windows-1256' : 'utf-8').decode(b); }
    } catch (e) { return ''; }
  }

  async function extractID3(file) {
    try {
      const head = new DataView(await file.slice(0, 10).arrayBuffer());
      if (head.byteLength < 10 || head.getUint8(0) !== 0x49 || head.getUint8(1) !== 0x44 || head.getUint8(2) !== 0x33) return null;
      const ver = head.getUint8(3), flags = head.getUint8(5);
      const size = ((head.getUint8(6) & 0x7f) << 21) | ((head.getUint8(7) & 0x7f) << 14) | ((head.getUint8(8) & 0x7f) << 7) | (head.getUint8(9) & 0x7f);
      const buf = await file.slice(0, Math.min(10 + size, 2 * 1024 * 1024, file.size)).arrayBuffer();
      const v = new DataView(buf), u8 = new Uint8Array(buf);
      const idLen = ver === 2 ? 3 : 4, hLen = ver === 2 ? 6 : 10, want = ver === 2 ? 'TT2' : 'TIT2';
      const ss = o => ((v.getUint8(o) & 0x7f) << 21) | ((v.getUint8(o + 1) & 0x7f) << 14) | ((v.getUint8(o + 2) & 0x7f) << 7) | (v.getUint8(o + 3) & 0x7f);
      let o = 10;
      if (ver >= 3 && (flags & 0x40) && buf.byteLength >= 14) o += ver === 4 ? ss(10) : v.getUint32(10) + 4;
      while (o + hLen < buf.byteLength) {
        let id = '';
        for (let k = 0; k < idLen; k++) id += String.fromCharCode(v.getUint8(o + k));
        const fs = ver === 2 ? ((v.getUint8(o + 3) << 16) | (v.getUint8(o + 4) << 8) | v.getUint8(o + 5)) : ver === 4 ? ss(o + 4) : v.getUint32(o + 4);
        if (fs <= 0 || !/^[A-Z0-9]+$/.test(id)) break;
        if (id === want) {
          const ds = o + hLen + 1, de = Math.min(o + hLen + fs, buf.byteLength);
          if (de <= ds) return null;
          return decodeText(u8.subarray(ds, de), v.getUint8(o + hLen)).replace(/\0/g, '').trim() || null;
        }
        o += hLen + fs;
      }
    } catch (e) {}
    return null;
  }

  async function extractTitles(arr, cache) {
    let done = 0;
    for (let i = 0; i < arr.length; i += 6) {
      await Promise.all(arr.slice(i, i + 6).map(async f => {
        const c = cache && cache.get(f.path);
        if (c && c.size === f.size && c.lastModified === f.lastModified) { f.title = c.title; return; }
        f.title = await extractID3(f.file);
        impShow('قراءة: ' + f.name, ++done, arr.length);
      }));
      await tick();
    }
  }

  // ═══ أدوات مساعدة: تخزين المؤشر + شريط التقدم ═══
  const kvOpen = () => new Promise((res, rej) => { const r = indexedDB.open('quran_kv', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function kv(op, k, v) {
    const db = await kvOpen();
    return new Promise((res, rej) => {
      const st = db.transaction('kv', op === 'get' ? 'readonly' : 'readwrite').objectStore('kv');
      const r = op === 'get' ? st.get(k) : op === 'set' ? st.put(v, k) : st.delete(k);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  const tick = () => new Promise(r => setTimeout(r, 0));
  function impShow(name, done, total) {
    $('imp').classList.remove('hidden'); $('impName').textContent = name;
    $('impCount').textContent = done + ' / ' + total; $('impFill').style.width = (total ? done / total * 100 : 0) + '%';
  }
  function impHide() { $('imp').classList.add('hidden'); }

  // ═══ المفضلة ═══
  function toggleFav(path) {
    S.favs.has(path) ? S.favs.delete(path) : S.favs.add(path);
    if (path === S.curPath) pulse(favBtn);
    store.set('quran_favs', JSON.stringify([...S.favs]));
    fCount.textContent = S.all.filter(f => S.favs.has(f.path)).length;
    if (S.currentTab === 'favs') render(); else syncFavUI();
    syncFavUI();
  }
  function syncFavUI() {
    document.querySelectorAll('.card').forEach(c => {
      const on = S.favs.has(c.dataset.path), b = c.querySelector('.fav');
      if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
    });
    const on = S.favs.has(S.curPath);
    favBtn.classList.toggle('on', on); favBtn.setAttribute('aria-pressed', on); $('favLbl').textContent = on ? 'في المفضلة' : 'المفضلة';
  }
  favBtn.addEventListener('click', () => { if (S.curPath) toggleFav(S.curPath); });

  // ═══ متابعة الاستماع ═══
  let lastSave = 0;
  function saveLast(force) {
    if (!S.curPath || !audio.duration) return;
    const now = Date.now();
    if (!force && now - lastSave < 4000) return;
    lastSave = now;
    store.set('quran_last', JSON.stringify({ path: S.curPath, t: Math.floor(audio.currentTime), d: Math.floor(audio.duration) }));
  }
  // "تابع الاستماع": يظهر في المشغّل المصغّر (مثل تطبيقات الموسيقى)، ضغطة واحدة تكمل من حيث توقفت
  function showResume() {
    let l = null; try { l = JSON.parse(store.get('quran_last') || 'null'); } catch (e) {}
    const f = l && S.all.find(x => x.path === l.path);
    if (!f || S.curPath || S.ghostDismissed) { if (!S.curPath && S.ghost && !f) { S.ghost = null; mini.classList.remove('visible', 'ghost'); } return; }
    S.ghost = { f, t: l.t || 0 };
    miniTitle.textContent = 'تابع: ' + cleanTitle(displayName(f));
    miniFill.style.width = l.d ? Math.min(100, (l.t || 0) / l.d * 100) + '%' : '0%';
    mini.classList.add('visible', 'ghost');
  }
  function resumeGhost(open) {
    const g = S.ghost; if (!g) return;
    S.resumeAt = g.t; playFile(g.f, !open);
  }

  // ═══ تلاشي الصوت عند الإيقاف/التشغيل ═══
  function applyVol() { audio.volume = Math.max(0, Math.min(1, userVol * fadeF)); }
  function fadeTo(to, ms) {
    return new Promise(res => {
      clearInterval(fadeT); if (fadeRes) fadeRes();
      fadeRes = res;
      const from = fadeF, t0 = Date.now();
      fadeT = setInterval(() => {
        const k = Math.min(1, (Date.now() - t0) / ms);
        fadeF = from + (to - from) * k; applyVol();
        if (k >= 1) { clearInterval(fadeT); fadeRes = null; res(); }
      }, 30);
    });
  }
  async function pauseSoft(ms = 450) {
    if (audio.paused) return;
    if (document.visibilityState !== 'visible') { audio.pause(); return; }   // التبويب بالخلفية: المؤقتات تتباطأ
    pausing = true;
    await fadeTo(0, ms);
    if (!pausing) return;
    pausing = false; audio.pause(); fadeF = 1; applyVol();
  }
  function playSoft() {
    if (document.visibilityState === 'visible') { fadeF = 0; applyVol(); }
    audio.play().then(() => fadeTo(1, 350)).catch(() => { fadeF = 1; applyVol(); });
  }

  // ═══ قوائم السرعة والمؤقت ═══
  const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
  const SLEEP = [0, 15, 30, 60, -1];
  function pulse(el) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  function closePops() {
    document.querySelectorAll('.pop.open').forEach(p => p.classList.remove('open'));
    speedBtn.setAttribute('aria-expanded', 'false'); sleepBtn.setAttribute('aria-expanded', 'false');
  }
  function togglePop(btn, pop, items, current, pick) {
    const was = pop.classList.contains('open');
    closePops(); pulse(btn);
    if (was) return;
    pop.innerHTML = '';
    items.forEach(it => {
      const b = document.createElement('button');
      b.className = 'pop-item'; b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', it.v === current);
      b.textContent = it.t;
      b.addEventListener('click', e => { e.stopPropagation(); pick(it.v); closePops(); });
      pop.appendChild(b);
    });
    pop.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    const cur = pop.querySelector('[aria-checked="true"]'); if (cur) cur.focus({ preventScroll: true });
  }
  document.addEventListener('click', e => { if (!e.target.closest('.act-wrap')) closePops(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.querySelector('.pop.open')) { closePops(); e.stopImmediatePropagation(); }
  }, true);

  // السرعة: تبدأ دائمًا 1.0 ولا تُحفظ بين الجلسات
  const rateTxt = r => Number.isInteger(r) ? r.toFixed(1) : String(r);
  function setRate(r) {
    audio.defaultPlaybackRate = audio.playbackRate = r;
    $('speedVal').textContent = rateTxt(r) + '×'; speedBtn.classList.toggle('on', r !== 1);
  }
  speedBtn.addEventListener('click', e => {
    e.stopPropagation();
    togglePop(speedBtn, $('speedPop'), RATES.map(r => ({ v: r, t: rateTxt(r) + '×' + (r === 1 ? ' (عادي)' : '') })), audio.playbackRate, setRate);
  });
  setRate(1);

  // مؤقت النوم: بدون / 15 / 30 / 60 دقيقة / نهاية السورة (مع عدّاد تنازلي)
  let sleepI = 0;
  function sleepUI() {
    const m = SLEEP[sleepI], b = $('sleepBadge');
    sleepBtn.classList.toggle('on', m !== 0); b.classList.toggle('show', m !== 0);
    if (m === -1) b.textContent = 'نهاية';
    else if (m > 0) { const s = Math.max(0, Math.ceil((S.sleepAt - Date.now()) / 1000)); b.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  }
  function sleepSet(m) {
    sleepI = SLEEP.indexOf(m); S.sleepAt = m > 0 ? Date.now() + m * 60000 : 0; S.sleepEnd = m === -1; sleepUI();
    if (m !== 0) toast('سيتوقف التشغيل ' + (m === -1 ? 'عند نهاية السورة' : 'بعد ' + m + ' دقيقة'));
  }
  function sleepReset() { sleepI = 0; S.sleepAt = 0; S.sleepEnd = false; sleepUI(); }
  function checkSleep() {
    if (!S.sleepAt) return;
    if (Date.now() >= S.sleepAt) { sleepReset(); pauseSoft(2500); toast('تم الإيقاف (مؤقت النوم)'); } else sleepUI();
  }
  sleepBtn.addEventListener('click', e => {
    e.stopPropagation();
    togglePop(sleepBtn, $('sleepPop'), SLEEP.map(m => ({ v: m, t: m === 0 ? 'بدون مؤقت' : m === -1 ? 'نهاية السورة' : m + ' دقيقة' })), SLEEP[sleepI], sleepSet);
  });

  // ═══ شاشة القفل: موضع التشغيل ═══
  function posState() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState || !isFinite(audio.duration) || !audio.duration) return;
    try { navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate || 1 }); } catch (e) {}
  }
  audio.addEventListener('seeked', posState);
  audio.addEventListener('ratechange', posState);

  // ═══ Keyboard ═══
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== search && !player.classList.contains('open')) {
      e.preventDefault();
      if (!toolbar.classList.contains('hidden')) search.focus();
    }
    if (e.key === 'Escape') {
      if (player.classList.contains('open')) minimizePlayer();
      else if (document.activeElement === search) search.blur();
    }
    if (e.key === ' ' && player.classList.contains('open') && document.activeElement === document.body) {
      e.preventDefault(); playBtn.click();
    }
  });

  // ═══ Splash + Restore ═══
  function hideSplash() {
    setTimeout(() => {
      splash.classList.add('hide');
      setTimeout(() => splash.remove(), 700);
    }, 1200);
  }
  hideSplash(); restore();
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});

})();
