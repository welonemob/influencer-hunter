import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { save } from '@tauri-apps/plugin-dialog';
import { strToU8, zipSync } from 'fflate';
import {
  Activity, ArrowDownToLine, ArrowUpRight, BadgeCheck, BarChart3, Bookmark, BriefcaseBusiness,
  Building2, Check, ChevronDown, CircleHelp, Clipboard, Database, ExternalLink, FileSpreadsheet,
  Filter, Globe2, Instagram, Link2, ListFilter, LoaderCircle, Plus, Search, Settings2,
  ShieldCheck, SlidersHorizontal, Sparkles, Target, Trash2, UserRound, Users, Video, X,
  Youtube, MessageCircle, RotateCcw, Save, Pencil, MapPin, CalendarDays, Copy,
} from 'lucide-react';

type Platform = 'ВКонтакте' | 'YouTube' | 'Telegram' | 'TikTok' | 'Instagram';
type ManagerStatus = 'Потенциально без менеджера' | 'Вероятно работает напрямую' | 'Не удалось определить' | 'Вероятно есть менеджер' | 'Подтверждённый менеджер или агентство';
type BloggerStatus = 'Новый' | 'Проверен' | 'Перспективный' | 'Передан партнёру' | 'Не подходит';
type Blogger = {
  id: number; platform: Platform; nickname: string; profileUrl: string; niche: string; followers: number | null;
  city: string; country: string; contacts: string; managerStatus: ManagerStatus; managerReason: string;
  medianViews: number | null; reachPercent: number | null; activity: string; commercialPotential: string;
  notes: string; status: BloggerStatus; sourceUrl: string; checkedAt: string; createdAt: string;
};
type Advertiser = {
  id: number; name: string; website: string; category: string; city: string; country: string;
  contacts: string; marketingContact: string; notes: string; sourceUrl: string; checkedAt: string; createdAt: string;
};
type BloggerDraft = Omit<Blogger, 'id' | 'createdAt'>;
type AdvertiserDraft = Omit<Advertiser, 'id' | 'createdAt'>;
type SearchFilters = {
  platforms: Platform[]; niche: string; minFollowers: string; maxFollowers: string; count: string;
  location: string; managerStrictness: string; activityStrictness: string; minReach: string;
};

const PLATFORMS: Platform[] = ['ВКонтакте', 'YouTube', 'Telegram', 'TikTok', 'Instagram'];
const NICHES = ['Технологии', 'Автомобили', 'Юмор', 'Лайфстайл', 'Бьюти', 'Путешествия', 'Еда', 'Спорт', 'Семья', 'Игры', 'Образование', 'Бизнес', 'Обзоры товаров', 'Новости', 'Развлечения', 'Другое'];
const MANAGER_OPTIONS: ManagerStatus[] = ['Потенциально без менеджера', 'Вероятно работает напрямую', 'Не удалось определить', 'Вероятно есть менеджер', 'Подтверждённый менеджер или агентство'];
const BLOGGER_STATUSES: BloggerStatus[] = ['Новый', 'Проверен', 'Перспективный', 'Передан партнёру', 'Не подходит'];

const emptyBlogger = (): BloggerDraft => ({
  platform: 'ВКонтакте', nickname: '', profileUrl: '', niche: '', followers: null, city: '', country: 'Россия', contacts: '',
  managerStatus: 'Не удалось определить', managerReason: '', medianViews: null, reachPercent: null,
  activity: 'Недостаточно данных', commercialPotential: 'Недостаточно данных', notes: '', status: 'Новый', sourceUrl: '', checkedAt: today(),
});
const emptyAdvertiser = (): AdvertiserDraft => ({ name: '', website: '', category: '', city: '', country: 'Россия', contacts: '', marketingContact: '', notes: '', sourceUrl: '', checkedAt: today() });
const initialFilters: SearchFilters = {
  platforms: ['ВКонтакте'], niche: 'Технологии', minFollowers: '10000', maxFollowers: '30000', count: '30',
  location: 'Тюмень, Москва', managerStrictness: 'Максимально строгая', activityStrictness: 'Строгая', minReach: '10',
};

function platformIcon(platform: Platform, size = 15) {
  if (platform === 'YouTube') return <Youtube size={size} />;
  if (platform === 'Instagram') return <Instagram size={size} />;
  if (platform === 'Telegram') return <MessageCircle size={size} />;
  if (platform === 'TikTok') return <Video size={size} />;
  return <span className="vk-mark">vk</span>;
}
function formatNumber(value: number | null | undefined) { return value == null ? 'Не указано' : new Intl.NumberFormat('ru-RU').format(value); }
function today() { return new Date().toLocaleDateString('ru-RU'); }
function normalizeUrl(value: string) { return /^https?:\/\//i.test(value) ? value : value.trim() ? `https://${value.trim()}` : ''; }

function parsePrompt(prompt: string, current: SearchFilters): SearchFilters {
  const text = prompt.toLowerCase();
  const next = { ...current, platforms: [...current.platforms] };
  const found: Platform[] = [];
  if (/вконтакте|вконтакта|\bвк\b|vk\.com/.test(text)) found.push('ВКонтакте');
  if (/youtube|ютуб|ютьюб/.test(text)) found.push('YouTube');
  if (/telegram|телеграм|телеграмм/.test(text)) found.push('Telegram');
  if (/tiktok|тикток/.test(text)) found.push('TikTok');
  if (/instagram|инстаграм|инста/.test(text)) found.push('Instagram');
  if (found.length) next.platforms = found;
  const niche = NICHES.find((item) => text.includes(item.toLowerCase()));
  if (niche) next.niche = niche;
  const range = text.match(/(?:аудитор\w*|подписчик\w*|фолловер\w*)[^\n]{0,60}?(?:от\s*)?(\d[\d\s]*)\s*(тыс(?:яч)?|к)?\s*(?:до|[-–])\s*(\d[\d\s]*)\s*(тыс(?:яч)?|к)?/i)
    ?? text.match(/от\s*(\d[\d\s]*)\s*(тыс(?:яч)?|к)\s*до\s*(\d[\d\s]*)\s*(тыс(?:яч)?|к)/i);
  if (range) {
    const unit = range[2] || range[4];
    const parse = (v: string, suffix?: string) => Math.round(Number(v.replace(/\s/g, '')) * (suffix ? 1000 : 1));
    next.minFollowers = String(parse(range[1], unit));
    next.maxFollowers = String(parse(range[3], range[4]));
  }
  const count = text.match(/(?:найди|отбери|покажи)\s*(\d{1,3})\s*(?:блогер\w*|инфлюенсер\w*|автор\w*)/i);
  if (count) next.count = count[1];
  const cities = ['Москва', 'Тюмень', 'Санкт-Петербург', 'Екатеринбург', 'Казань', 'Новосибирск', 'Краснодар', 'Омск', 'Пермь'];
  const matchedCities = cities.filter((city) => text.includes(city.toLowerCase()));
  if (matchedCities.length) next.location = [...new Set(matchedCities)].join(', ');
  if (/по всей россии|вся россия|по россии/.test(text)) next.location = 'Вся Россия';
  if (/по всему миру|без географи/.test(text)) next.location = 'Без ограничений';
  if (/менеджер|агентств/.test(text)) next.managerStrictness = /максимально строг/.test(text) ? 'Максимально строгая' : 'Строгая';
  return next;
}

function makeSearchUrl(platform: Platform, filters: SearchFilters) {
  const place = filters.location && filters.location !== 'Без ограничений' ? ` ${filters.location}` : '';
  const niche = filters.niche && filters.niche !== 'Другое' ? filters.niche : '';
  const audience = filters.minFollowers || filters.maxFollowers
    ? ` ${filters.minFollowers ? `от ${filters.minFollowers}` : ''}${filters.maxFollowers ? ` до ${filters.maxFollowers}` : ''} подписчиков` : '';
  const common = `${niche} блогер инфлюенсер${place}${audience}`.trim();
  const platformQueries: Record<Platform, string> = {
    'ВКонтакте': `site:vk.com ${common} (блог OR автор OR сообщество)`,
    'YouTube': `site:youtube.com ${common} канал`,
    'Telegram': `site:t.me ${common} канал`,
    'TikTok': `site:tiktok.com/@ ${common}`,
    'Instagram': `site:instagram.com ${common} блогер`,
  };
  return `https://www.google.com/search?q=${encodeURIComponent(platformQueries[platform])}`;
}

function App() {
  const [page, setPage] = useState<'search' | 'advertisers' | 'database'>('search');
  const [bloggers, setBloggers] = useState<Blogger[]>([]);
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [prompt, setPrompt] = useState('');
  const [filterText, setFilterText] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('Все площадки');
  const [filterStatus, setFilterStatus] = useState('Все статусы');
  const [isBloggerModal, setBloggerModal] = useState(false);
  const [isAdvertiserModal, setAdvertiserModal] = useState(false);
  const [editingBlogger, setEditingBlogger] = useState<Blogger | null>(null);
  const [editingAdvertiser, setEditingAdvertiser] = useState<Advertiser | null>(null);
  const [bloggerDraft, setBloggerDraft] = useState<BloggerDraft>(emptyBlogger());
  const [advertiserDraft, setAdvertiserDraft] = useState<AdvertiserDraft>(emptyAdvertiser());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [dbPath, setDbPath] = useState('');
  const [lastSearch, setLastSearch] = useState('');
  const [companySearch, setCompanySearch] = useState('бренды и компании для рекламы у блогеров');
  const [companyLocation, setCompanyLocation] = useState('Россия');

  const refresh = async () => {
    const [people, brands, path] = await Promise.all([
      invoke<Blogger[]>('get_bloggers'), invoke<Advertiser[]>('get_advertisers'), invoke<string>('database_location'),
    ]);
    setBloggers(people); setAdvertisers(brands); setDbPath(path);
  };
  useEffect(() => { refresh().catch((e) => setNotice(`Не удалось подключиться к локальной базе: ${String(e)}`)); }, []);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(''), 5500); return () => window.clearTimeout(t); }, [notice]);

  const visibleBloggers = useMemo(() => {
    const q = filterText.toLowerCase().trim();
    return bloggers.filter((b) => {
      const matchesText = !q || [b.nickname, b.niche, b.city, b.contacts, b.notes].some((v) => v.toLowerCase().includes(q));
      const matchesPlatform = filterPlatform === 'Все площадки' || b.platform === filterPlatform;
      const matchesStatus = filterStatus === 'Все статусы' || b.status === filterStatus;
      return matchesText && matchesPlatform && matchesStatus;
    });
  }, [bloggers, filterText, filterPlatform, filterStatus]);

  const matchingFromBase = useMemo(() => bloggers.filter((b) => {
    const platformOk = filters.platforms.includes(b.platform);
    const nicheOk = !filters.niche || filters.niche === 'Другое' || b.niche.toLowerCase().includes(filters.niche.toLowerCase());
    const minOk = !filters.minFollowers || (b.followers ?? -1) >= Number(filters.minFollowers);
    const maxOk = !filters.maxFollowers || (b.followers ?? Number.MAX_SAFE_INTEGER) <= Number(filters.maxFollowers);
    const locationOk = !filters.location || filters.location === 'Без ограничений' || filters.location === 'Вся Россия' || filters.location.toLowerCase().split(',').some((city) => b.city.toLowerCase().includes(city.trim()));
    const managerOk = filters.managerStrictness === 'Умеренная' || !['Вероятно есть менеджер', 'Подтверждённый менеджер или агентство'].includes(b.managerStatus);
    const activityOk = filters.activityStrictness === 'Умеренная' ? b.activity !== 'Неактивен' : b.activity === 'Регулярная';
    const reachOk = !filters.minReach || (b.reachPercent ?? 0) >= Number(filters.minReach);
    return platformOk && nicheOk && minOk && maxOk && locationOk && managerOk && activityOk && reachOk;
  }), [bloggers, filters]);

  const openNewBlogger = () => { setEditingBlogger(null); setBloggerDraft(emptyBlogger()); setBloggerModal(true); };
  const openEditBlogger = (b: Blogger) => {
    setEditingBlogger(b); const { id, createdAt, ...draft } = b; setBloggerDraft(draft); setBloggerModal(true);
  };
  const submitBlogger = async () => {
    if (!bloggerDraft.nickname.trim()) { setNotice('Укажи ник или название профиля.'); return; }
    setBusy(true);
    try { await invoke('save_blogger', { input: bloggerDraft, id: editingBlogger?.id ?? null }); await refresh(); setBloggerModal(false); setNotice(editingBlogger ? 'Карточка обновлена.' : 'Блогер сохранён в локальную базу.'); }
    catch (e) { setNotice(String(e)); } finally { setBusy(false); }
  };
  const removeBlogger = async (id: number) => {
    if (!window.confirm('Удалить запись блогера из локальной базы?')) return;
    await invoke('delete_blogger', { id }); await refresh(); setNotice('Запись удалена.');
  };
  const openNewAdvertiser = () => { setEditingAdvertiser(null); setAdvertiserDraft(emptyAdvertiser()); setAdvertiserModal(true); };
  const openEditAdvertiser = (a: Advertiser) => { setEditingAdvertiser(a); const { id, createdAt, ...draft } = a; setAdvertiserDraft(draft); setAdvertiserModal(true); };
  const submitAdvertiser = async () => {
    if (!advertiserDraft.name.trim()) { setNotice('Укажи название компании.'); return; }
    setBusy(true);
    try { await invoke('save_advertiser', { input: advertiserDraft, id: editingAdvertiser?.id ?? null }); await refresh(); setAdvertiserModal(false); setNotice('Компания сохранена.'); }
    catch (e) { setNotice(String(e)); } finally { setBusy(false); }
  };
  const removeAdvertiser = async (id: number) => {
    if (!window.confirm('Удалить компанию из базы?')) return;
    await invoke('delete_advertiser', { id }); await refresh(); setNotice('Компания удалена.');
  };

  const launchSearch = async () => {
    if (!navigator.onLine) { setNotice('Нет подключения к интернету. Локальная база и сохранённые записи продолжают работать офлайн.'); return; }
    if (!filters.platforms.length) { setNotice('Выбери хотя бы одну социальную сеть.'); return; }
    setBusy(true); let opened = 0;
    try {
      for (const platform of filters.platforms) { await openUrl(makeSearchUrl(platform, filters)); opened += 1; }
      setLastSearch(`${filters.platforms.join(', ')} · ${filters.niche} · ${filters.location || 'без географии'}`);
      setNotice(`Открыто поисковых вкладок: ${opened}. Результаты ищутся на выбранных площадках; сохраняй подходящие профили вручную.`);
    } catch (e) { setNotice(`Не удалось открыть веб-поиск: ${String(e)}. Проверь подключение к интернету.`); }
    finally { setBusy(false); }
  };

  const exportBloggerData = async (format: 'csv' | 'xlsx') => {
    const rows = visibleBloggers;
    if (!rows.length) { setNotice('В базе пока нет записей для экспорта.'); return; }
    const destination = await save({ defaultPath: `InfluencerHunter_Bloggers.${format}`, filters: [{ name: format === 'csv' ? 'CSV' : 'Excel Workbook', extensions: [format] }] });
    if (!destination) return;
    if (format === 'csv') {
      const columns: (keyof Blogger)[] = ['platform','nickname','profileUrl','niche','followers','city','country','contacts','managerStatus','managerReason','medianViews','reachPercent','activity','commercialPotential','notes','status','sourceUrl','checkedAt'];
      const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = '\uFEFF' + [columns.join(';'), ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(';'))].join('\r\n');
      await invoke('write_export_file', { destination, bytes: Array.from(new TextEncoder().encode(csv)) });
    } else {
      const columns: (keyof Blogger)[] = ['platform','nickname','profileUrl','niche','followers','city','country','contacts','managerStatus','managerReason','medianViews','reachPercent','activity','commercialPotential','status','notes','sourceUrl','checkedAt'];
      const headers = ['Площадка','Ник','Профиль','Ниша','Подписчики','Город','Страна','Контакты','Менеджер','Обоснование','Медианные просмотры','Охват, %','Активность','Коммерческий потенциал','Статус','Заметки','Источник','Дата проверки'];
      const xmlMap: Record<string, string> = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' };
      const xml = (v: unknown) => String(v ?? '').replace(/[&<>\"]/g, (ch) => xmlMap[ch] ?? ch);
      const colName = (n: number) => { let s = ''; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
      const sheetRows = [headers, ...rows.map((row) => columns.map((key) => row[key] ?? ''))];
      const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${sheetRows.map((values, ri) => `<row r="${ri + 1}">${values.map((value, ci) => `<c r="${colName(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
      const files = {
        '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
        '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
        'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Блогеры" sheetId="1" r:id="rId1"/></sheets></workbook>'),
        'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
        'xl/worksheets/sheet1.xml': strToU8(sheetXml),
      };
      const buffer = zipSync(files, { level: 6 });
      await invoke('write_export_file', { destination, bytes: Array.from(buffer) });
    }
    setNotice(`Экспорт сохранён: ${destination}`);
  };

  const launchAdvertiserSearch = async () => {
    if (!navigator.onLine) { setNotice('Нет интернета. Сохранённая база рекламодателей остаётся доступна офлайн.'); return; }
    if (!companySearch.trim()) { setNotice('Опиши, какие компании ищем.'); return; }
    const q = `${companySearch.trim()} ${companyLocation.trim()} контакты маркетинг PR сотрудничество`;
    try { await openUrl(`https://www.google.com/search?q=${encodeURIComponent(q)}`); setNotice('Открыт веб-поиск рекламодателей. Проверяй, что найденный контакт относится именно к маркетингу или PR.'); }
    catch (e) { setNotice(`Не удалось открыть веб-поиск: ${String(e)}`); }
  };

  const backup = async () => {
    const destination = await save({ defaultPath: 'InfluencerHunter_Backup.sqlite', filters: [{ name: 'SQLite backup', extensions: ['sqlite', 'db'] }] });
    if (!destination) return;
    await invoke('backup_database', { destination }); setNotice(`Резервная копия создана: ${destination}`);
  };

  const updateBloggerDraft = (key: keyof BloggerDraft, value: string | number | null) => setBloggerDraft((old) => ({ ...old, [key]: value }));
  const updateAdvertiserDraft = (key: keyof AdvertiserDraft, value: string) => setAdvertiserDraft((old) => ({ ...old, [key]: value }));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-icon"><Target size={22} /></div><div><div className="brand-name">INFLUENCER<span>HUNTER</span></div><div className="brand-caption">DESKTOP WORKSPACE</div></div></div>
        <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <button className={`nav-item ${page === 'search' ? 'active' : ''}`} onClick={() => setPage('search')}><Search size={18} /><span>Поиск блогеров</span><span className="nav-shortcut">01</span></button>
        <button className={`nav-item ${page === 'advertisers' ? 'active' : ''}`} onClick={() => setPage('advertisers')}><Building2 size={18} /><span>Рекламодатели</span><span className="nav-shortcut">02</span></button>
        <button className={`nav-item ${page === 'database' ? 'active' : ''}`} onClick={() => setPage('database')}><Database size={18} /><span>Моя база</span><span className="nav-count">{bloggers.length}</span></button>
        <div className="sidebar-bottom">
          <div className="local-card"><div className="local-icon"><ShieldCheck size={17} /></div><div><strong>Локальное хранение</strong><span>Данные остаются на этом ПК</span></div><i /></div>
          <button className="backup-button" onClick={backup}><ArrowDownToLine size={16} /> Резервная копия</button>
          <div className="version-row"><span>Influencer Hunter</span><span>v0.1.0</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>WORKSPACE</span><span className="crumb-dot">/</span><strong>{page === 'search' ? 'Поиск блогеров' : page === 'advertisers' ? 'Рекламодатели' : 'Моя база'}</strong></div>
          <div className="topbar-right"><div className="local-indicator"><span className="green-dot" /> ОФЛАЙН-БАЗА АКТИВНА</div><button className="icon-button" title="Показать расположение базы" onClick={() => setNotice(dbPath || 'Путь к базе ещё не получен.')}><Database size={17} /></button><div className="avatar">Р</div></div>
        </header>

        {page === 'search' && <>
          <section className="page-heading"><div><div className="eyebrow"><Sparkles size={14} /> INFLUENCER DISCOVERY</div><h1>Найди тех, кто <span>влияет.</span></h1><p>Поиск авторов с живой аудиторией и потенциалом для прямого сотрудничества.</p></div><div className="heading-metric"><div className="metric-icon"><Users size={18} /></div><div><strong>{bloggers.length}</strong><span>в твоей базе</span></div></div></section>
          <div className="search-layout">
            <section className="panel search-controls">
              <div className="panel-title-row"><div><div className="section-kicker">01 / ЗАПРОС</div><h2>Настройки поиска</h2></div><button className="text-button" onClick={() => { setFilters(initialFilters); setPrompt(''); }}><RotateCcw size={14} /> Сбросить</button></div>
              <label className="field-label">Что будем искать?</label>
              <textarea className="prompt-box" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Опиши задачу обычным языком... Например: найди 30 техноблогеров ВКонтакте из Москвы с 10–30 тысячами подписчиков." />
              <button className="outline-action parse-button" onClick={() => { setFilters(parsePrompt(prompt, filters)); setNotice('Параметры из текста распознаны. Проверь их перед поиском.'); }}><Sparkles size={15} /> Распознать параметры</button>
              <div className="field-divider" />
              <div className="field-label-row"><label className="field-label">Социальные сети</label><button className="mini-link" onClick={() => setFilters((f) => ({ ...f, platforms: f.platforms.length === PLATFORMS.length ? [] : [...PLATFORMS] }))}>{filters.platforms.length === PLATFORMS.length ? 'Снять все' : 'Выбрать все'}</button></div>
              <div className="platform-grid">
                {PLATFORMS.map((p) => <button key={p} className={`platform-chip ${filters.platforms.includes(p) ? 'selected' : ''}`} onClick={() => setFilters((f) => ({ ...f, platforms: f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p] }))}>{platformIcon(p)}<span>{p}</span>{filters.platforms.includes(p) && <Check size={13} className="chip-check" />}</button>)}
              </div>
              <div className="field-divider" />
              <label className="field-label">Тематика / ниша</label>
              <select className="input" value={filters.niche} onChange={(e) => setFilters((f) => ({ ...f, niche: e.target.value }))}>{NICHES.map((n) => <option key={n}>{n}</option>)}</select>
              <div className="two-fields"><div><label className="field-label">От подписчиков</label><input className="input" type="number" min="0" value={filters.minFollowers} onChange={(e) => setFilters((f) => ({ ...f, minFollowers: e.target.value }))} /></div><div><label className="field-label">До подписчиков</label><input className="input" type="number" min="0" value={filters.maxFollowers} onChange={(e) => setFilters((f) => ({ ...f, maxFollowers: e.target.value }))} /></div></div>
              <div className="quick-ranges">{[['5–10 тыс.', '5000', '10000'], ['10–30 тыс.', '10000', '30000'], ['30–50 тыс.', '30000', '50000'], ['50–100 тыс.', '50000', '100000'], ['100 тыс.+', '100000', '']].map(([label, min, max]) => <button key={label} className="range-chip" onClick={() => setFilters((f) => ({ ...f, minFollowers: min, maxFollowers: max }))}>{label}</button>)}</div>
              <div className="two-fields"><div><label className="field-label">Количество кандидатов</label><select className="input" value={filters.count} onChange={(e) => setFilters((f) => ({ ...f, count: e.target.value }))}><option value="10">10</option><option value="20">20</option><option value="30">30</option><option value="50">50</option><option value="100">100</option></select></div><div><label className="field-label">Минимальный охват, %</label><input className="input" type="number" min="0" max="100" value={filters.minReach} onChange={(e) => setFilters((f) => ({ ...f, minReach: e.target.value }))} /></div></div>
              <label className="field-label">Геолокация</label><input className="input" value={filters.location} onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))} placeholder="Москва, Тюмень или вся Россия" />
              <div className="two-fields"><div><label className="field-label">Отбор по менеджеру</label><select className="input" value={filters.managerStrictness} onChange={(e) => setFilters((f) => ({ ...f, managerStrictness: e.target.value }))}><option>Максимально строгая</option><option>Строгая</option><option>Умеренная</option></select></div><div><label className="field-label">Отбор по активности</label><select className="input" value={filters.activityStrictness} onChange={(e) => setFilters((f) => ({ ...f, activityStrictness: e.target.value }))}><option>Строгая</option><option>Максимально строгая</option><option>Умеренная</option></select></div></div>
              <button className="primary-action" onClick={launchSearch} disabled={busy || !filters.platforms.length}>{busy ? <LoaderCircle size={17} className="spin" /> : <Search size={17} />} Начать поиск <ArrowUpRight size={16} /></button>
              <div className="privacy-note"><ShieldCheck size={14} /> Поиск открывается во внешнем браузере. Данные твоей базы туда не передаются.</div>
            </section>

            <section className="results-column">
              <div className="panel result-panel">
                <div className="result-head"><div><div className="section-kicker">02 / КАНДИДАТЫ</div><h2>Подходят из моей базы</h2><p>Локальные записи, совпадающие с текущими фильтрами.</p></div><button className="primary-small" onClick={openNewBlogger}><Plus size={15} /> Добавить профиль</button></div>
                <div className="result-toolbar"><div className="result-count"><strong>{matchingFromBase.length}</strong><span>совпадений в базе</span></div><div className="toolbar-pills"><span><Filter size={13} /> {filters.platforms.length} площадки</span><span><MapPin size={13} /> {filters.location || 'Любая география'}</span></div></div>
                {matchingFromBase.length ? <div className="candidate-list">{matchingFromBase.slice(0, 30).map((b) => <BloggerCard key={b.id} blogger={b} onEdit={() => openEditBlogger(b)} onDelete={() => removeBlogger(b.id)} onNotice={setNotice} onTransfer={async () => { const { id, createdAt, ...input } = b; await invoke('save_blogger', { input: { ...input, status: 'Передан партнёру' }, id }); await refresh(); setNotice('Статус изменён: передан партнёру.'); }} />)}</div> : <div className="empty-state"><div className="empty-graphic"><Search size={26} /></div><h3>Пока нет совпадений</h3><p>Записи из твоей базы появятся здесь, когда совпадут с выбранными фильтрами. Запусти веб-поиск и добавь подходящие профили вручную.</p><button className="outline-action" onClick={openNewBlogger}><Plus size={15} /> Добавить найденного блогера</button></div>}
              </div>
              <div className="notice-card"><div className="notice-icon"><CircleHelp size={18} /></div><div><strong>Как устроен поиск</strong><p>Открываются отдельные запросы для выбранных соцсетей. Программа не подменяет недоступные данные выдуманными цифрами: статистику, контакты и признаки менеджера нужно подтвердить по публичному профилю и сохранить с источником.</p></div></div>
              {lastSearch && <div className="last-search"><span>ПОСЛЕДНИЙ ЗАПРОС</span><strong>{lastSearch}</strong></div>}
            </section>
          </div>
        </>}

        {page === 'database' && <>
          <section className="page-heading compact-heading"><div><div className="eyebrow"><Database size={14} /> LOCAL CONTACTS</div><h1>Твоя <span>база.</span></h1><p>Сохранённые авторы, заметки и история проверки. Всё хранится на этом компьютере.</p></div><div className="heading-actions"><button className="secondary-action" onClick={() => exportBloggerData('csv')}><FileSpreadsheet size={16} /> CSV</button><button className="secondary-action" onClick={() => exportBloggerData('xlsx')}><ArrowDownToLine size={16} /> Excel</button><button className="primary-small" onClick={openNewBlogger}><Plus size={15} /> Добавить</button></div></section>
          <div className="panel database-panel"><div className="database-toolbar"><div className="search-input-wrap"><Search size={16} /><input value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="Поиск по нику, нише, городу, контактам..." /></div><select className="input filter-select" value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}><option>Все площадки</option>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select><select className="input filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}><option>Все статусы</option>{BLOGGER_STATUSES.map((s) => <option key={s}>{s}</option>)}</select><button className="icon-button" title="Резервная копия" onClick={backup}><ArrowDownToLine size={16} /></button></div>
            <div className="table-wrap"><table><thead><tr><th>БЛОГЕР</th><th>ПЛОЩАДКА</th><th>АУДИТОРИЯ</th><th>МЕНЕДЖЕР</th><th>ГОРОД</th><th>СТАТУС</th><th></th></tr></thead><tbody>{visibleBloggers.map((b) => <tr key={b.id}><td><div className="table-person"><div className="person-avatar">{b.nickname.slice(0,1).toUpperCase()}</div><div><strong>{b.nickname}</strong><span>{b.niche || 'Ниша не указана'}</span></div></div></td><td><span className="platform-label">{platformIcon(b.platform, 14)} {b.platform}</span></td><td>{formatNumber(b.followers)}</td><td><ManagerBadge value={b.managerStatus} /></td><td>{b.city || 'Не указано'}</td><td><select className="status-select" value={b.status} onChange={async (e) => { const { id, createdAt, ...input } = b; await invoke('save_blogger', { input: { ...input, status: e.target.value }, id }); await refresh(); }} >{BLOGGER_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td><td><div className="row-actions"><button title="Редактировать" onClick={() => openEditBlogger(b)}><Pencil size={15} /></button><button title="Открыть профиль" onClick={() => b.profileUrl && openUrl(normalizeUrl(b.profileUrl))}><ExternalLink size={15} /></button><button title="Удалить" onClick={() => removeBlogger(b.id)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table>
              {!visibleBloggers.length && <div className="table-empty"><Database size={25} /><strong>Записей пока нет</strong><span>Добавь первого блогера или измени фильтр.</span></div>}
            </div><div className="table-footer"><span>Показано {visibleBloggers.length} из {bloggers.length}</span><span className="data-path" title={dbPath}>SQLite · {dbPath ? dbPath.split(/[\\/]/).slice(-2).join('/') : 'подключение...'}</span></div>
          </div>
        </>}

        {page === 'advertisers' && <>
          <section className="page-heading compact-heading"><div><div className="eyebrow"><BriefcaseBusiness size={14} /> BUSINESS PROSPECTING</div><h1>Потенциальные <span>рекламодатели.</span></h1><p>Компании и бренды, которым могут подойти интеграции у блогеров.</p></div><button className="primary-small" onClick={openNewAdvertiser}><Plus size={15} /> Добавить компанию</button></section>
          <div className="panel company-search-panel"><div><div className="section-kicker">01 / BUSINESS SEARCH</div><h2>Каких рекламодателей ищем?</h2><p>Поиск откроется во внешнем браузере. После проверки добавь компанию в локальную базу.</p></div><input className="input" value={companySearch} onChange={(e) => setCompanySearch(e.target.value)} placeholder="Например: локальные бренды косметики, магазины техники..." /><input className="input company-location" value={companyLocation} onChange={(e) => setCompanyLocation(e.target.value)} placeholder="География" /><button className="primary-small" onClick={launchAdvertiserSearch}><Search size={15} /> Искать компании</button></div>
          <div className="advertiser-grid">{advertisers.map((a) => <article className="advertiser-card" key={a.id}><div className="advertiser-top"><div className="company-mark"><Building2 size={19} /></div><div className="row-actions"><button title="Редактировать" onClick={() => openEditAdvertiser(a)}><Pencil size={15} /></button><button title="Удалить" onClick={() => removeAdvertiser(a.id)}><Trash2 size={15} /></button></div></div><h3>{a.name}</h3><div className="company-category">{a.category || 'Категория не указана'}</div><div className="company-meta"><span><MapPin size={13} /> {a.city || 'Город не указан'}{a.country ? `, ${a.country}` : ''}</span>{a.website && <button onClick={() => openUrl(normalizeUrl(a.website))}><Globe2 size={13} /> Сайт <ExternalLink size={11} /></button>}</div>{a.marketingContact && <div className="company-contact"><span>МАРКЕТИНГ / PR</span><strong>{a.marketingContact}</strong></div>}{a.contacts && <div className="company-contact"><span>ПУБЛИЧНЫЕ КОНТАКТЫ</span><strong>{a.contacts}</strong></div>}{a.notes && <p className="company-notes">{a.notes}</p>}{a.sourceUrl && <button className="source-link" onClick={() => openUrl(normalizeUrl(a.sourceUrl))}><Link2 size={13} /> Источник проверки <ExternalLink size={11} /></button>}</article>)}
            {!advertisers.length && <div className="panel advertiser-empty"><div className="empty-graphic"><Building2 size={26} /></div><h3>База рекламодателей пока пуста</h3><p>Добавляй компании, их сайты и публичные контакты. Данные будут храниться локально.</p><button className="primary-small" onClick={openNewAdvertiser}><Plus size={15} /> Добавить первую компанию</button></div>}
          </div>
        </>}

        <footer className="app-footer"><span>INFLUENCER HUNTER <b>·</b> ЛОКАЛЬНОЕ ПРИЛОЖЕНИЕ</span><span>Твои записи не отправляются в облако</span></footer>
      </main>

      {notice && <div className="toast"><div className="toast-check"><Check size={15} /></div><span>{notice}</span><button onClick={() => setNotice('')}><X size={15} /></button></div>}

      {isBloggerModal && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setBloggerModal(false)}><div className="modal"><div className="modal-head"><div><div className="section-kicker">BLOGGER RECORD</div><h2>{editingBlogger ? 'Редактировать профиль' : 'Добавить блогера'}</h2><p>Сохраняй только проверенные публичные сведения.</p></div><button className="icon-button" onClick={() => setBloggerModal(false)}><X size={18} /></button></div>
        <div className="form-grid"><div><label className="field-label">Площадка *</label><select className="input" value={bloggerDraft.platform} onChange={(e) => updateBloggerDraft('platform', e.target.value as Platform)}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select></div><div><label className="field-label">Ник / имя *</label><input className="input" value={bloggerDraft.nickname} onChange={(e) => updateBloggerDraft('nickname', e.target.value)} placeholder="@username" /></div><div className="span-2"><label className="field-label">Ссылка на профиль</label><input className="input" value={bloggerDraft.profileUrl} onChange={(e) => updateBloggerDraft('profileUrl', e.target.value)} placeholder="https://..." /></div><div><label className="field-label">Ниша</label><input className="input" value={bloggerDraft.niche} onChange={(e) => updateBloggerDraft('niche', e.target.value)} placeholder="Технологии" /></div><div><label className="field-label">Подписчики</label><input className="input" type="number" value={bloggerDraft.followers ?? ''} onChange={(e) => updateBloggerDraft('followers', e.target.value ? Number(e.target.value) : null)} /></div><div><label className="field-label">Город</label><input className="input" value={bloggerDraft.city} onChange={(e) => updateBloggerDraft('city', e.target.value)} /></div><div><label className="field-label">Страна</label><input className="input" value={bloggerDraft.country} onChange={(e) => updateBloggerDraft('country', e.target.value)} /></div><div className="span-2"><label className="field-label">Публичные контакты</label><input className="input" value={bloggerDraft.contacts} onChange={(e) => updateBloggerDraft('contacts', e.target.value)} placeholder="Email, Telegram, личные сообщения..." /></div><div><label className="field-label">Статус менеджера</label><select className="input" value={bloggerDraft.managerStatus} onChange={(e) => updateBloggerDraft('managerStatus', e.target.value as ManagerStatus)}>{MANAGER_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select></div><div><label className="field-label">Медианные просмотры</label><input className="input" type="number" value={bloggerDraft.medianViews ?? ''} onChange={(e) => updateBloggerDraft('medianViews', e.target.value ? Number(e.target.value) : null)} /></div><div><label className="field-label">Охват, %</label><input className="input" type="number" step="0.1" value={bloggerDraft.reachPercent ?? ''} onChange={(e) => updateBloggerDraft('reachPercent', e.target.value ? Number(e.target.value) : null)} /></div><div><label className="field-label">Коммерческий потенциал</label><select className="input" value={bloggerDraft.commercialPotential} onChange={(e) => updateBloggerDraft('commercialPotential', e.target.value)}><option>Недостаточно данных</option><option>Высокий</option><option>Средний</option><option>Низкий</option></select></div><div><label className="field-label">Активность</label><select className="input" value={bloggerDraft.activity} onChange={(e) => updateBloggerDraft('activity', e.target.value)}><option>Недостаточно данных</option><option>Регулярная</option><option>Нерегулярная</option><option>Неактивен</option></select></div><div><label className="field-label">Статус в базе</label><select className="input" value={bloggerDraft.status} onChange={(e) => updateBloggerDraft('status', e.target.value as BloggerStatus)}>{BLOGGER_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div><div><label className="field-label">Дата проверки</label><input className="input" value={bloggerDraft.checkedAt} onChange={(e) => updateBloggerDraft('checkedAt', e.target.value)} placeholder={today()} /></div><div className="span-2"><label className="field-label">Почему такой статус менеджера</label><textarea className="input textarea-small" value={bloggerDraft.managerReason} onChange={(e) => updateBloggerDraft('managerReason', e.target.value)} placeholder="Например: в описании указан личный email; признаков агентства не найдено." /></div><div className="span-2"><label className="field-label">Источник проверки</label><input className="input" value={bloggerDraft.sourceUrl} onChange={(e) => updateBloggerDraft('sourceUrl', e.target.value)} placeholder="Ссылка на пост, описание или страницу с подтверждением" /></div><div className="span-2"><label className="field-label">Заметки</label><textarea className="input textarea-small" value={bloggerDraft.notes} onChange={(e) => updateBloggerDraft('notes', e.target.value)} placeholder="Краткие заметки о профиле и возможном сотрудничестве..." /></div></div>
        <div className="modal-foot"><span>* Обязательное поле</span><div><button className="secondary-action" onClick={() => setBloggerModal(false)}>Отмена</button><button className="primary-small" onClick={submitBlogger} disabled={busy}><Save size={15} /> {busy ? 'Сохранение...' : 'Сохранить'}</button></div></div></div></div>}

      {isAdvertiserModal && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setAdvertiserModal(false)}><div className="modal modal-narrow"><div className="modal-head"><div><div className="section-kicker">ADVERTISER RECORD</div><h2>{editingAdvertiser ? 'Редактировать компанию' : 'Добавить рекламодателя'}</h2><p>Отделяй контакты маркетинга от общей горячей линии.</p></div><button className="icon-button" onClick={() => setAdvertiserModal(false)}><X size={18} /></button></div>
        <div className="form-grid"><div className="span-2"><label className="field-label">Название компании *</label><input className="input" value={advertiserDraft.name} onChange={(e) => updateAdvertiserDraft('name', e.target.value)} /></div><div className="span-2"><label className="field-label">Сайт</label><input className="input" value={advertiserDraft.website} onChange={(e) => updateAdvertiserDraft('website', e.target.value)} placeholder="https://..." /></div><div><label className="field-label">Категория бизнеса</label><input className="input" value={advertiserDraft.category} onChange={(e) => updateAdvertiserDraft('category', e.target.value)} placeholder="Розница, IT, производство..." /></div><div><label className="field-label">Город</label><input className="input" value={advertiserDraft.city} onChange={(e) => updateAdvertiserDraft('city', e.target.value)} /></div><div><label className="field-label">Страна</label><input className="input" value={advertiserDraft.country} onChange={(e) => updateAdvertiserDraft('country', e.target.value)} /></div><div><label className="field-label">Дата проверки</label><input className="input" value={advertiserDraft.checkedAt} onChange={(e) => updateAdvertiserDraft('checkedAt', e.target.value)} placeholder={today()} /></div><div className="span-2"><label className="field-label">Прямой контакт маркетинга / PR</label><input className="input" value={advertiserDraft.marketingContact} onChange={(e) => updateAdvertiserDraft('marketingContact', e.target.value)} placeholder="Публичный email отдела маркетинга, имя PR..." /></div><div className="span-2"><label className="field-label">Другие публичные контакты</label><input className="input" value={advertiserDraft.contacts} onChange={(e) => updateAdvertiserDraft('contacts', e.target.value)} placeholder="Телефон, email, форма обратной связи..." /></div><div className="span-2"><label className="field-label">Источник информации</label><input className="input" value={advertiserDraft.sourceUrl} onChange={(e) => updateAdvertiserDraft('sourceUrl', e.target.value)} placeholder="https://..." /></div><div className="span-2"><label className="field-label">Заметки</label><textarea className="input textarea-small" value={advertiserDraft.notes} onChange={(e) => updateAdvertiserDraft('notes', e.target.value)} /></div></div>
        <div className="modal-foot"><span>* Обязательное поле</span><div><button className="secondary-action" onClick={() => setAdvertiserModal(false)}>Отмена</button><button className="primary-small" onClick={submitAdvertiser} disabled={busy}><Save size={15} /> Сохранить</button></div></div></div></div>}
    </div>
  );
}

function ManagerBadge({ value }: { value: string }) {
  const kind = value.includes('Подтверждён') || value.includes('Вероятно есть') ? 'danger' : value.includes('Потенциально') || value.includes('напрямую') ? 'success' : 'muted';
  return <span className={`manager-badge ${kind}`}>{value}</span>;
}
function BloggerCard({ blogger: b, onEdit, onDelete, onNotice, onTransfer }: { blogger: Blogger; onEdit: () => void; onDelete: () => void; onNotice: (v: string) => void; onTransfer: () => void }) {
  const reach = b.reachPercent == null ? 'Не рассчитан' : `${b.reachPercent.toLocaleString('ru-RU')}%`;
  return <article className="candidate-card"><div className="candidate-main"><div className="candidate-avatar">{b.nickname.slice(0,1).toUpperCase()}</div><div className="candidate-info"><div className="candidate-name-row"><strong>{b.nickname}</strong><span className="platform-label">{platformIcon(b.platform, 13)} {b.platform}</span><span className={`status-dot-label ${b.status === 'Перспективный' ? 'good' : ''}`}>{b.status}</span></div><div className="candidate-subtitle">{b.niche || 'Ниша не указана'} <span>·</span> {b.city || 'Город неизвестен'}</div><div className="candidate-stats"><span><Users size={13} /> {formatNumber(b.followers)}</span><span><Activity size={13} /> {formatNumber(b.medianViews)} просмотров</span><span><BarChart3 size={13} /> {reach}</span></div></div></div><div className="candidate-tags"><ManagerBadge value={b.managerStatus} /><span className="potential-label">Потенциал: {b.commercialPotential}</span></div><div className="candidate-actions"><button onClick={onEdit}><Pencil size={14} /> Изменить</button>{b.profileUrl && <button onClick={() => openUrl(normalizeUrl(b.profileUrl))}><ExternalLink size={14} /> Профиль</button>}{b.sourceUrl && <button onClick={() => openUrl(normalizeUrl(b.sourceUrl))}><Link2 size={14} /> Источник</button>}<button onClick={onTransfer}><ArrowUpRight size={14} /> Передать</button>{b.contacts && <button onClick={() => { navigator.clipboard.writeText(b.contacts); onNotice('Контакты скопированы.'); }}><Copy size={14} /> Контакты</button>}<button className="delete-action" onClick={onDelete}><Trash2 size={14} /></button></div></article>;
}

export default App;
