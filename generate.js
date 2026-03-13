#!/usr/bin/env node
/**
 * OpenClaw Times Site Generator v3.0
 * Product Hunt style with categories, search, case of the day
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'cases.json');
const TEMPLATE_DIR = __dirname;
const SITE_URL = 'https://openclawtimes.com';

// Tag colors and labels
const TAGS = {
  automation: { en: 'Automation', ru: 'Автоматизация', emoji: '⚡' },
  coding: { en: 'Coding', ru: 'Код', emoji: '💻' },
  productivity: { en: 'Productivity', ru: 'Продуктивность', emoji: '📈' },
  research: { en: 'Research', ru: 'Ресёрч', emoji: '🔬' },
  devops: { en: 'DevOps', ru: 'DevOps', emoji: '🔧' },
  marketing: { en: 'Marketing', ru: 'Маркетинг', emoji: '📣' },
  finance: { en: 'Finance', ru: 'Финансы', emoji: '💰' }
};

const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

function formatDate(dateStr, lang) {
  const d = new Date(dateStr);
  const months = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  };
  return `${d.getDate()} ${months[lang][d.getMonth()]} ${d.getFullYear()}`;
}

function markdownToHtml(md) {
  if (!md) return '';
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>');
}

function generateCaseCard(c, lang, featured = false) {
  const title = lang === 'en' ? c.title_en : c.title_ru;
  const desc = lang === 'en' ? c.desc_en : c.desc_ru;
  const tag = TAGS[c.tag] || TAGS.automation;
  const tagLabel = lang === 'en' ? tag.en : tag.ru;
  const hasContent = c.content_en || c.content_ru;
  const detailText = lang === 'ru' ? 'Подробнее' : 'Details';
  
  if (featured) {
    return `
    <a href="${lang === 'en' ? '/en' : ''}/case/${c.id}.html" class="featured-case" data-tag="${c.tag}">
      <div class="featured-badge">🏆 ${lang === 'ru' ? 'КЕЙС ДНЯ' : 'CASE OF THE DAY'}</div>
      <div class="featured-content">
        <h2 class="featured-title">${title}</h2>
        <p class="featured-desc">${desc}</p>
        <div class="featured-meta">
          <span class="tag-pill ${c.tag}">${tag.emoji} ${tagLabel}</span>
          <span class="meta-source">${c.source}</span>
          <span class="meta-points">▲ ${c.points}</span>
        </div>
      </div>
    </a>`;
  }
  
  return `
    <a href="${lang === 'en' ? '/en' : ''}/case/${c.id}.html" class="case-card" data-tag="${c.tag}" data-title="${title.toLowerCase()}" data-desc="${desc.toLowerCase()}">
      <div class="case-rank">${String(c.rank).padStart(2, '0')}</div>
      <div class="case-body">
        <h3 class="case-title">${title}</h3>
        <p class="case-desc">${desc}</p>
        <div class="case-footer">
          <span class="tag-pill ${c.tag}">${tag.emoji} ${tagLabel}</span>
          <span class="case-source">${c.source}</span>
          ${c.tools?.length ? `<span class="case-tools">${c.tools.slice(0,2).join(' · ')}</span>` : ''}
        </div>
      </div>
      <div class="case-vote">
        <span class="vote-arrow">▲</span>
        <span class="vote-count">${c.points}</span>
      </div>
    </a>`;
}

const STYLES = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0a0b;--bg-card:#111113;--bg-hover:#1a1a1d;
  --border:#222225;--text:#fafafa;--text-dim:#a0a0a5;--text-muted:#707075;
  --accent:#ff6154;--accent-dim:rgba(255,97,84,0.12);
  --green:#10b981;--blue:#3b82f6;--purple:#8b5cf6;--cyan:#06b6d4;--pink:#ec4899;--yellow:#f59e0b;--orange:#f97316;
  --font-sans:'Inter',system-ui,sans-serif;--font-mono:'JetBrains Mono',monospace;
}
html{scroll-behavior:smooth;-webkit-font-smoothing:antialiased}
body{font-family:var(--font-sans);background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh}
a{color:inherit;text-decoration:none}
::selection{background:var(--accent);color:#fff}
.container{max-width:900px;margin:0 auto;padding:0 20px}

/* Header */
header{border-bottom:1px solid var(--border);padding:16px 0;position:sticky;top:0;background:rgba(10,10,11,0.95);backdrop-filter:blur(12px);z-index:100}
.header-inner{display:flex;align-items:center;justify-content:space-between;gap:16px}
.logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:20px}
.logo span{color:var(--accent)}
.header-right{display:flex;align-items:center;gap:16px}
.lang-switch{display:flex;gap:4px;padding:4px;background:var(--bg-card);border-radius:8px;border:1px solid var(--border)}
.lang-btn{padding:6px 10px;border-radius:6px;font-size:16px;transition:all .15s;cursor:pointer}
.lang-btn:hover{background:var(--bg-hover)}
.lang-btn.active{background:var(--accent-dim)}

/* Search */
.search-box{position:relative}
.search-input{width:240px;padding:10px 16px 10px 40px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:14px;transition:all .2s}
.search-input:focus{outline:none;border-color:var(--accent);width:300px}
.search-input::placeholder{color:var(--text-muted)}
.search-icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:14px}

/* Hero */
.hero{padding:48px 0 32px;text-align:center}
.hero h1{font-size:clamp(28px,5vw,40px);font-weight:700;letter-spacing:-0.03em;margin-bottom:12px}
.hero h1 span{color:var(--accent)}
.hero p{font-size:16px;color:var(--text-dim);max-width:500px;margin:0 auto}

/* Stats Bar */
.stats-bar{display:flex;justify-content:center;gap:32px;padding:20px 0;margin-bottom:24px;border-bottom:1px solid var(--border)}
.stat{text-align:center}
.stat-value{font-size:24px;font-weight:700;font-family:var(--font-mono);color:var(--accent)}
.stat-label{font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em}

/* Categories */
.categories{display:flex;gap:8px;padding:16px 0;overflow-x:auto;border-bottom:1px solid var(--border);margin-bottom:24px}
.categories::-webkit-scrollbar{display:none}
.cat-btn{padding:8px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:20px;font-size:13px;font-weight:500;color:var(--text-dim);cursor:pointer;transition:all .2s;white-space:nowrap}
.cat-btn:hover{border-color:var(--text-muted);color:var(--text)}
.cat-btn.active{background:var(--accent);border-color:var(--accent);color:#fff}

/* Featured Case */
.featured-case{display:block;background:linear-gradient(135deg,var(--accent-dim),transparent);border:1px solid var(--accent);border-radius:16px;padding:24px;margin-bottom:32px;transition:all .2s}
.featured-case:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(255,97,84,0.15)}
.featured-badge{display:inline-block;padding:4px 12px;background:var(--accent);color:#fff;font-size:11px;font-weight:700;border-radius:20px;margin-bottom:16px;letter-spacing:0.05em}
.featured-title{font-size:24px;font-weight:700;margin-bottom:12px}
.featured-desc{font-size:15px;color:var(--text-dim);margin-bottom:16px;line-height:1.6}
.featured-meta{display:flex;flex-wrap:wrap;gap:12px;align-items:center}

/* Case Cards */
.cases-list{display:flex;flex-direction:column;gap:12px}
.case-card{display:flex;align-items:center;gap:16px;padding:16px 20px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;transition:all .2s}
.case-card:hover{border-color:var(--text-muted);background:var(--bg-hover);transform:translateX(4px)}
.case-card.hidden{display:none}
.case-rank{font-family:var(--font-mono);font-size:14px;color:var(--text-muted);min-width:28px}
.case-body{flex:1;min-width:0}
.case-title{font-size:16px;font-weight:600;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.case-desc{font-size:13px;color:var(--text-dim);margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.case-footer{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.case-source{font-size:11px;color:var(--text-muted)}
.case-tools{font-size:11px;color:var(--text-dim);font-family:var(--font-mono)}
.case-vote{display:flex;flex-direction:column;align-items:center;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;min-width:50px}
.vote-arrow{color:var(--accent);font-size:12px}
.vote-count{font-family:var(--font-mono);font-size:14px;font-weight:600}

/* Tag Pills */
.tag-pill{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.02em}
.tag-pill.automation{background:rgba(16,185,129,0.15);color:var(--green)}
.tag-pill.coding{background:rgba(59,130,246,0.15);color:var(--blue)}
.tag-pill.productivity{background:rgba(249,115,22,0.15);color:var(--orange)}
.tag-pill.research{background:rgba(139,92,246,0.15);color:var(--purple)}
.tag-pill.devops{background:rgba(6,182,212,0.15);color:var(--cyan)}
.tag-pill.marketing{background:rgba(236,72,153,0.15);color:var(--pink)}
.tag-pill.finance{background:rgba(245,158,11,0.15);color:var(--yellow)}
.meta-source{font-size:12px;color:var(--text-muted)}
.meta-points{font-family:var(--font-mono);font-size:13px;color:var(--accent)}

/* Footer */
footer{border-top:1px solid var(--border);padding:48px 0;margin-top:48px;text-align:center}
.footer-author{font-size:15px;color:var(--text-dim);margin-bottom:20px}
.footer-author a{color:var(--accent);font-weight:500}
.footer-author a:hover{text-decoration:underline}
.footer-divider{margin:0 8px;color:var(--text-muted)}
.footer-cta{margin-bottom:24px}
.cta-btn{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;background:var(--accent);color:#fff;font-size:14px;font-weight:600;border-radius:10px;transition:all .2s}
.cta-btn:hover{filter:brightness(1.1);transform:translateY(-2px)}
.footer-links{display:flex;justify-content:center;gap:24px;margin-bottom:16px}
.footer-links a{font-size:14px;color:var(--text-muted);transition:color .15s}
.footer-links a:hover{color:var(--text)}
.footer-copy{font-size:13px;color:var(--text-muted)}
.footer-copy a{color:var(--accent)}

/* Case Page */
.case-page{padding:40px 0}
.case-page .back{display:inline-flex;align-items:center;gap:6px;font-size:14px;color:var(--text-muted);margin-bottom:24px;transition:color .15s}
.case-page .back:hover{color:var(--text)}
.case-page h1{font-size:clamp(24px,4vw,32px);font-weight:700;margin-bottom:16px}
.case-page .meta{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid var(--border)}
.tools-section{margin:24px 0;padding:20px;background:var(--bg-card);border-radius:12px;border:1px solid var(--border)}
.tools-section h4{font-size:13px;font-weight:600;text-transform:uppercase;color:var(--text-dim);margin-bottom:12px}
.tools-list{display:flex;flex-wrap:wrap;gap:8px}
.tool-tag{padding:6px 12px;background:var(--bg-hover);border-radius:6px;font-size:13px;font-family:var(--font-mono)}
.results-section{margin:24px 0;padding:20px;background:var(--accent-dim);border-radius:12px;border:1px solid rgba(255,97,84,0.3)}
.results-section h4{font-size:13px;font-weight:600;text-transform:uppercase;color:var(--accent);margin-bottom:8px}
.results-section p{font-size:15px;font-weight:500}
.content{font-size:15px;line-height:1.7;color:var(--text-dim)}
.content h2{font-size:20px;font-weight:600;color:var(--text);margin:32px 0 16px}
.content h3{font-size:17px;font-weight:600;color:var(--text);margin:24px 0 12px}
.content p{margin-bottom:16px}
.content code{font-family:var(--font-mono);font-size:13px;padding:2px 6px;background:var(--bg-card);border-radius:4px;color:var(--accent)}
.source-link{display:inline-flex;align-items:center;gap:8px;margin-top:32px;padding:12px 20px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:500;transition:all .15s}
.source-link:hover{border-color:var(--accent);background:var(--accent-dim)}

/* No Results */
.no-results{text-align:center;padding:48px 20px;color:var(--text-muted)}
.no-results-icon{font-size:48px;margin-bottom:16px}

@media(max-width:640px){
  .header-inner{flex-wrap:wrap}
  .search-input{width:100%}
  .search-input:focus{width:100%}
  .case-card{flex-wrap:wrap}
  .case-vote{width:100%;flex-direction:row;justify-content:center;gap:8px}
  .stats-bar{gap:20px}
  .categories{gap:6px}
}
`;

function generateIndex(lang) {
  const isRu = lang === 'ru';
  const texts = isRu ? {
    title: 'OpenClaw <span>Times</span>',
    subtitle: 'Лучшие кейсы использования AI-агентов. Обновляется ежедневно.',
    search: 'Поиск кейсов...',
    all: 'Все',
    statTotal: 'Кейсов',
    statToday: 'Сегодня',
    statWeek: 'За неделю',
    noResults: 'Ничего не найдено',
    noResultsHint: 'Попробуйте другой запрос или категорию'
  } : {
    title: 'OpenClaw <span>Times</span>',
    subtitle: 'Best AI agent use cases. Updated daily.',
    search: 'Search cases...',
    all: 'All',
    statTotal: 'Cases',
    statToday: 'Today',
    statWeek: 'This Week',
    noResults: 'No results found',
    noResultsHint: 'Try a different search or category'
  };
  
  // Get featured case (highest points from today)
  const todayCases = data.cases.filter(c => c.date === new Date().toISOString().split('T')[0]);
  const featured = todayCases.length > 0 
    ? todayCases.reduce((a, b) => a.points > b.points ? a : b)
    : data.cases[0];
  
  const otherCases = data.cases.filter(c => c.id !== featured.id);
  const casesHtml = otherCases.map(c => generateCaseCard(c, lang)).join('');
  
  // Category buttons
  const categories = Object.entries(TAGS).map(([key, val]) => 
    `<button class="cat-btn" data-cat="${key}">${val.emoji} ${isRu ? val.ru : val.en}</button>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenClaw Times — ${isRu ? 'Лучшие кейсы AI-агентов' : 'Best AI Agent Use Cases'}</title>
<meta name="description" content="${isRu ? 'Ежедневная подборка лучших кейсов использования OpenClaw и AI-агентов.' : 'Daily curated best OpenClaw and AI agent use cases.'}">
<link rel="canonical" href="${SITE_URL}${isRu ? '/' : '/en/'}">
<link rel="alternate" hreflang="en" href="${SITE_URL}/en/">
<link rel="alternate" hreflang="ru" href="${SITE_URL}/">
<meta property="og:title" content="OpenClaw Times">
<meta property="og:description" content="${texts.subtitle}">
<meta property="og:url" content="${SITE_URL}${isRu ? '/' : '/en/'}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦞</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${STYLES}</style>
</head>
<body>

<header>
  <div class="container">
    <div class="header-inner">
      <a href="${isRu ? '/' : '/en/'}" class="logo">🦞 OpenClaw <span>Times</span></a>
      <div class="header-right">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" class="search-input" id="search" placeholder="${texts.search}">
        </div>
        <div class="lang-switch">
          <a href="/en/" class="lang-btn ${isRu ? '' : 'active'}">🇬🇧</a>
          <a href="/" class="lang-btn ${isRu ? 'active' : ''}">🇷🇺</a>
        </div>
      </div>
    </div>
  </div>
</header>

<main>
  <div class="container">
    <section class="hero">
      <h1>${texts.title}</h1>
      <p>${texts.subtitle}</p>
    </section>
    
    <div class="stats-bar">
      <div class="stat"><div class="stat-value">${data.stats.total}</div><div class="stat-label">${texts.statTotal}</div></div>
      <div class="stat"><div class="stat-value">${data.stats.today}</div><div class="stat-label">${texts.statToday}</div></div>
      <div class="stat"><div class="stat-value">${data.stats.week}</div><div class="stat-label">${texts.statWeek}</div></div>
    </div>
    
    <nav class="categories">
      <button class="cat-btn active" data-cat="all">${texts.all}</button>
      ${categories}
    </nav>
    
    ${generateCaseCard(featured, lang, true)}
    
    <div class="cases-list" id="cases-list">
      ${casesHtml}
    </div>
    
    <div class="no-results" id="no-results" style="display:none">
      <div class="no-results-icon">🔍</div>
      <h3>${texts.noResults}</h3>
      <p>${texts.noResultsHint}</p>
    </div>
  </div>
</main>

<footer>
  <div class="container">
    <div class="footer-author">
      ${isRu ? 'Проект' : 'A project by'} <a href="https://t.me/aiffring" target="_blank">Denis Ffring</a>
      <span class="footer-divider">·</span>
      <a href="https://plaan.ai" target="_blank">Plaan.ai</a>
    </div>
    <div class="footer-cta">
      <a href="https://t.me/ffring" target="_blank" class="cta-btn">
        💬 ${isRu ? 'Консультация по внедрению ИИ' : 'AI Implementation Consulting'}
      </a>
    </div>
    <div class="footer-links">
      <a href="https://github.com/openclaw/openclaw" target="_blank">GitHub</a>
      <a href="https://discord.com/invite/clawd" target="_blank">Discord</a>
      <a href="https://docs.openclaw.ai" target="_blank">Docs</a>
    </div>
    <div class="footer-copy">${isRu ? 'Собрано с помощью' : 'Built with'} <a href="https://openclaw.ai" target="_blank">OpenClaw</a></div>
  </div>
</footer>

<script>
// Category filter
document.querySelectorAll('.cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterCases();
  });
});

// Search
document.getElementById('search').addEventListener('input', filterCases);

function filterCases() {
  const cat = document.querySelector('.cat-btn.active').dataset.cat;
  const query = document.getElementById('search').value.toLowerCase().trim();
  const cards = document.querySelectorAll('.case-card');
  const featured = document.querySelector('.featured-case');
  let visible = 0;
  
  cards.forEach(card => {
    const matchCat = cat === 'all' || card.dataset.tag === cat;
    const matchQuery = !query || 
      card.dataset.title.includes(query) || 
      card.dataset.desc.includes(query);
    
    if (matchCat && matchQuery) {
      card.classList.remove('hidden');
      visible++;
    } else {
      card.classList.add('hidden');
    }
  });
  
  // Hide featured if filtered by category
  if (featured) {
    const featuredMatch = cat === 'all' || featured.dataset.tag === cat;
    featured.style.display = featuredMatch ? 'block' : 'none';
    if (featuredMatch) visible++;
  }
  
  document.getElementById('no-results').style.display = visible === 0 ? 'block' : 'none';
}

// No auto-redirect — RU is default for everyone
</script>

</body>
</html>`;
}

function generateCasePage(c, lang) {
  const isRu = lang === 'ru';
  const title = isRu ? c.title_ru : c.title_en;
  const desc = isRu ? c.desc_ru : c.desc_en;
  const content = isRu ? (c.content_ru || c.content_en) : c.content_en;
  const tag = TAGS[c.tag] || TAGS.automation;
  const tagLabel = isRu ? tag.ru : tag.en;
  const backText = isRu ? '← Все кейсы' : '← All cases';
  const sourceText = isRu ? 'Открыть источник' : 'View source';
  
  const contentHtml = content ? markdownToHtml(content) : `<p>${desc}</p>`;
  
  const toolsHtml = c.tools?.length ? `
    <div class="tools-section">
      <h4>${isRu ? 'Инструменты' : 'Tools Used'}</h4>
      <div class="tools-list">${c.tools.map(t => `<span class="tool-tag">${t}</span>`).join('')}</div>
    </div>` : '';
  
  const resultsHtml = c.results ? `
    <div class="results-section">
      <h4>${isRu ? 'Результаты' : 'Results'}</h4>
      <p>${c.results}</p>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | OpenClaw Times</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${SITE_URL}${isRu ? '' : '/en'}/case/${c.id}.html">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="article">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦞</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${STYLES}</style>
</head>
<body>

<header>
  <div class="container">
    <div class="header-inner">
      <a href="${isRu ? '/' : '/en/'}" class="logo">🦞 OpenClaw <span>Times</span></a>
      <div class="lang-switch">
        <a href="/en/case/${c.id}.html" class="lang-btn ${isRu ? '' : 'active'}">🇬🇧</a>
        <a href="/case/${c.id}.html" class="lang-btn ${isRu ? 'active' : ''}">🇷🇺</a>
      </div>
    </div>
  </div>
</header>

<main class="case-page">
  <div class="container">
    <a href="${isRu ? '/' : '/en/'}" class="back">${backText}</a>
    <h1>${title}</h1>
    <div class="meta">
      <span class="tag-pill ${c.tag}">${tag.emoji} ${tagLabel}</span>
      <span style="color:var(--text-muted)">${c.source}</span>
      <span style="color:var(--text-muted);font-family:var(--font-mono)">${formatDate(c.date, lang)}</span>
      <span style="color:var(--accent);font-family:var(--font-mono)">▲ ${c.points}</span>
    </div>
    
    ${toolsHtml}
    ${resultsHtml}
    
    <div class="content">${contentHtml}</div>
    
    <a href="${c.source_url}" target="_blank" class="source-link">
      🔗 ${sourceText}
    </a>
  </div>
</main>

<footer>
  <div class="container">
    <div class="footer-author">
      ${isRu ? 'Проект' : 'A project by'} <a href="https://t.me/aiffring" target="_blank">Denis Ffring</a>
      <span class="footer-divider">·</span>
      <a href="https://plaan.ai" target="_blank">Plaan.ai</a>
    </div>
    <div class="footer-cta">
      <a href="https://t.me/ffring" target="_blank" class="cta-btn">
        💬 ${isRu ? 'Консультация по внедрению ИИ' : 'AI Implementation Consulting'}
      </a>
    </div>
    <div class="footer-links">
      <a href="https://github.com/openclaw/openclaw" target="_blank">GitHub</a>
      <a href="https://discord.com/invite/clawd" target="_blank">Discord</a>
    </div>
    <div class="footer-copy">${isRu ? 'Собрано с помощью' : 'Built with'} <a href="https://openclaw.ai" target="_blank">OpenClaw</a></div>
  </div>
</footer>

</body>
</html>`;
}

// Ensure directories
fs.mkdirSync(path.join(TEMPLATE_DIR, 'en'), { recursive: true });
fs.mkdirSync(path.join(TEMPLATE_DIR, 'ru'), { recursive: true });
fs.mkdirSync(path.join(TEMPLATE_DIR, 'case'), { recursive: true });
fs.mkdirSync(path.join(TEMPLATE_DIR, 'ru', 'case'), { recursive: true });

console.log('Generating OpenClaw Times v3.0...');

// RU = default (root), EN = /en/
fs.writeFileSync(path.join(TEMPLATE_DIR, 'index.html'), generateIndex('ru'));
fs.writeFileSync(path.join(TEMPLATE_DIR, 'ru', 'index.html'), generateIndex('ru'));
console.log('✓ RU index (root + /ru/)');

fs.writeFileSync(path.join(TEMPLATE_DIR, 'en', 'index.html'), generateIndex('en'));
console.log('✓ EN index (/en/)');

for (const c of data.cases) {
  // RU case pages in root /case/ and /ru/case/
  fs.writeFileSync(path.join(TEMPLATE_DIR, 'case', `${c.id}.html`), generateCasePage(c, 'ru'));
  fs.writeFileSync(path.join(TEMPLATE_DIR, 'ru', 'case', `${c.id}.html`), generateCasePage(c, 'ru'));
  // EN case pages in /en/case/
  fs.mkdirSync(path.join(TEMPLATE_DIR, 'en', 'case'), { recursive: true });
  fs.writeFileSync(path.join(TEMPLATE_DIR, 'en', 'case', `${c.id}.html`), generateCasePage(c, 'en'));
}
console.log(`✓ ${data.cases.length} case pages`);

// Sitemap
const today = new Date().toISOString().split('T')[0];
const sitemapUrls = [
  { loc: `${SITE_URL}/`, priority: '1.0' },
  { loc: `${SITE_URL}/en/`, priority: '0.9' },
  ...data.cases.flatMap(c => [
    { loc: `${SITE_URL}/case/${c.id}.html`, lastmod: c.date, priority: '0.8' },
    { loc: `${SITE_URL}/en/case/${c.id}.html`, lastmod: c.date, priority: '0.7' }
  ])
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod || today}</lastmod><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>`;
fs.writeFileSync(path.join(TEMPLATE_DIR, 'sitemap.xml'), sitemap);
console.log('✓ sitemap.xml');

console.log('\n🎉 Done!');
