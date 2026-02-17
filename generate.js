#!/usr/bin/env node
/**
 * OpenClaw Times Site Generator v2.2
 * SEO optimized with OG, Twitter Cards, JSON-LD, sitemap
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'cases.json');
const TEMPLATE_DIR = __dirname;
const SITE_URL = 'https://openclawtimes.com';

// Tag colors and labels
const TAGS = {
  automation: { color: 'green', en: 'Automation', ru: 'Автоматизация' },
  coding: { color: 'blue', en: 'Coding', ru: 'Код' },
  productivity: { color: 'orange', en: 'Productivity', ru: 'Продуктивность' },
  research: { color: 'purple', en: 'Research', ru: 'Ресёрч' },
  devops: { color: 'cyan', en: 'DevOps', ru: 'DevOps' },
  marketing: { color: 'pink', en: 'Marketing', ru: 'Маркетинг' },
  finance: { color: 'yellow', en: 'Finance', ru: 'Финансы' }
};

// Load data
const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// Format date
function formatDate(dateStr, lang) {
  const d = new Date(dateStr);
  const months = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  };
  return `${d.getDate()} ${months[lang][d.getMonth()]} ${d.getFullYear()}`;
}

// Simple markdown to HTML
function markdownToHtml(md) {
  if (!md) return '';
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hpul])/gm, '<p>')
    .replace(/(?<![>])$/gm, '</p>')
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<[hul])/g, '$1')
    .replace(/(<\/[hul][^>]*>)<\/p>/g, '$1');
}

// Generate case card HTML
function generateCaseCard(c, lang) {
  const title = lang === 'en' ? c.title_en : c.title_ru;
  const desc = lang === 'en' ? c.desc_en : c.desc_ru;
  const tag = TAGS[c.tag] || TAGS.automation;
  const tagLabel = lang === 'en' ? tag.en : tag.ru;
  const hasContent = c.content_en || c.content_ru;
  
  return `
    <a href="${lang === 'ru' ? '/ru' : ''}/case/${c.id}.html" class="case ${hasContent ? 'has-content' : ''}">
      <div class="case-header">
        <span class="case-rank">${String(c.rank).padStart(2, '0')}</span>
        <h3 class="case-title">${title}</h3>
      </div>
      <div class="case-meta">
        <span class="case-tag ${c.tag}">${tagLabel}</span>
        <span class="case-source">${c.source}</span>
        ${c.tools && c.tools.length > 0 ? `<span class="case-tools">${c.tools.slice(0, 3).join(' · ')}</span>` : ''}
        <span class="case-points">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          ${c.points}
        </span>
      </div>
      <p class="case-desc">${desc}</p>
      ${hasContent ? `<span class="case-detail-badge">${lang === 'ru' ? 'Подробнее →' : 'Full details →'}</span>` : ''}
    </a>`;
}

// Common styles
const STYLES = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#09090b;--bg-subtle:#18181b;--bg-hover:#27272a;
  --border:#27272a;--text:#fafafa;--text-dim:#a1a1aa;--text-muted:#71717a;
  --accent:#f97316;--accent-dim:rgba(249,115,22,0.15);
  --green:#22c55e;--blue:#3b82f6;--purple:#a855f7;--cyan:#06b6d4;--pink:#ec4899;--yellow:#eab308;
  --font-sans:'Inter',system-ui,sans-serif;--font-mono:'JetBrains Mono',monospace;
}
html{scroll-behavior:smooth;-webkit-font-smoothing:antialiased}
body{font-family:var(--font-sans);background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh}
a{color:inherit;text-decoration:none}
::selection{background:var(--accent);color:#fff}
.container{max-width:720px;margin:0 auto;padding:0 20px}

header{border-bottom:1px solid var(--border);padding:20px 0;position:sticky;top:0;background:rgba(9,9,11,0.9);backdrop-filter:blur(12px);z-index:100}
.header-inner{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}
.logo{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px}
.logo span{color:var(--accent)}
nav{display:flex;align-items:center;gap:6px}
.lang-switch{display:flex;gap:2px;padding:4px;background:var(--bg-subtle);border-radius:8px}
.lang-btn{padding:6px 12px;border-radius:6px;font-size:13px;font-weight:500;color:var(--text-muted);transition:all .15s;border:none;background:none;cursor:pointer}
.lang-btn:hover{color:var(--text-dim)}
.lang-btn.active{background:var(--bg-hover);color:var(--text)}

.hero{padding:60px 0 40px;text-align:center;border-bottom:1px solid var(--border)}
.hero-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--accent-dim);border:1px solid rgba(249,115,22,0.3);border-radius:999px;font-size:12px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:20px}
.hero-badge::before{content:'';width:6px;height:6px;background:var(--accent);border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.hero h1{font-size:clamp(28px,5vw,44px);font-weight:700;letter-spacing:-0.03em;line-height:1.1;margin-bottom:16px}
.hero h1 span{color:var(--accent)}
.hero p{font-size:17px;color:var(--text-dim);max-width:500px;margin:0 auto}

.stats{display:flex;justify-content:center;gap:40px;padding:32px 0;border-bottom:1px solid var(--border)}
.stat{text-align:center}
.stat-value{font-size:32px;font-weight:700;font-family:var(--font-mono);color:var(--accent)}
.stat-label{font-size:13px;color:var(--text-muted);margin-top:4px}

.feed{padding:40px 0}
.feed-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border)}
.feed-title{font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-dim)}
.feed-date{font-size:13px;color:var(--text-muted);font-family:var(--font-mono)}

.case{display:block;padding:20px;border:1px solid var(--border);border-radius:12px;margin-bottom:12px;transition:all .2s;position:relative}
.case:hover{border-color:var(--text-muted);background:var(--bg-subtle)}
.case.has-content::after{content:'';position:absolute;top:12px;right:12px;width:8px;height:8px;background:var(--accent);border-radius:50%}
.case-header{display:flex;align-items:flex-start;gap:12px;margin-bottom:10px}
.case-rank{font-family:var(--font-mono);font-size:13px;color:var(--text-muted);padding:4px 8px;background:var(--bg-subtle);border-radius:6px}
.case-title{font-size:17px;font-weight:600;line-height:1.3}
.case-meta{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:10px}
.case-tag{font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:0.03em}
.case-tag.automation{background:rgba(34,197,94,0.15);color:var(--green)}
.case-tag.coding{background:rgba(59,130,246,0.15);color:var(--blue)}
.case-tag.productivity{background:var(--accent-dim);color:var(--accent)}
.case-tag.research{background:rgba(168,85,247,0.15);color:var(--purple)}
.case-tag.devops{background:rgba(6,182,212,0.15);color:var(--cyan)}
.case-tag.marketing{background:rgba(236,72,153,0.15);color:var(--pink)}
.case-tag.finance{background:rgba(234,179,8,0.15);color:var(--yellow)}
.case-source{font-size:12px;color:var(--text-muted)}
.case-tools{font-size:11px;color:var(--text-dim);font-family:var(--font-mono)}
.case-points{display:flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:13px;color:var(--accent)}
.case-points svg{width:14px;height:14px}
.case-desc{font-size:14px;color:var(--text-dim);line-height:1.5}
.case-detail-badge{display:inline-block;margin-top:12px;font-size:12px;font-weight:500;color:var(--accent)}

footer{border-top:1px solid var(--border);padding:40px 0;text-align:center}
.footer-author{font-size:15px;color:var(--text-dim);margin-bottom:16px}
.footer-author a{color:var(--accent);font-weight:500}
.footer-author a:hover{text-decoration:underline}
.footer-divider{margin:0 8px;color:var(--text-muted)}
.footer-cta{margin-bottom:20px}
.cta-btn{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:var(--accent);color:#fff;font-size:14px;font-weight:600;border-radius:8px;transition:all .2s}
.cta-btn:hover{background:#ea580c;transform:translateY(-1px)}
.footer-links{display:flex;justify-content:center;gap:24px;margin-bottom:16px}
.footer-links a{font-size:14px;color:var(--text-muted);transition:color .15s}
.footer-links a:hover{color:var(--text)}
.footer-copy{font-size:13px;color:var(--text-muted)}
.footer-copy a{color:var(--accent)}
.lang-btn{font-size:18px;padding:6px 10px}

/* Case page specific */
.case-page{padding:40px 0}
.case-page .back{display:inline-flex;align-items:center;gap:6px;font-size:14px;color:var(--text-muted);margin-bottom:24px;transition:color .15s}
.case-page .back:hover{color:var(--text)}
.case-page h1{font-size:clamp(24px,4vw,36px);font-weight:700;letter-spacing:-0.02em;line-height:1.2;margin-bottom:16px}
.case-page .meta{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid var(--border)}

/* Tools section */
.tools-section{margin:24px 0;padding:20px;background:var(--bg-subtle);border-radius:12px;border:1px solid var(--border)}
.tools-section h4{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-dim);margin-bottom:12px}
.tools-list{display:flex;flex-wrap:wrap;gap:8px}
.tool-tag{padding:6px 12px;background:var(--bg-hover);border-radius:6px;font-size:13px;font-family:var(--font-mono);color:var(--text)}

/* Results section */
.results-section{margin:24px 0;padding:20px;background:var(--accent-dim);border-radius:12px;border:1px solid rgba(249,115,22,0.3)}
.results-section h4{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--accent);margin-bottom:8px}
.results-section p{font-size:15px;color:var(--text);font-weight:500}

/* Content styling */
.content{font-size:15px;line-height:1.7;color:var(--text-dim)}
.content h2{font-size:20px;font-weight:600;color:var(--text);margin:32px 0 16px;padding-top:16px;border-top:1px solid var(--border)}
.content h3{font-size:17px;font-weight:600;color:var(--text);margin:24px 0 12px}
.content p{margin-bottom:16px}
.content ul{margin:16px 0;padding-left:24px}
.content li{margin-bottom:8px}
.content code{font-family:var(--font-mono);font-size:13px;padding:2px 6px;background:var(--bg-subtle);border-radius:4px;color:var(--accent)}
.content strong{color:var(--text);font-weight:600}

.source-link{display:inline-flex;align-items:center;gap:8px;margin-top:32px;padding:12px 20px;background:var(--bg-subtle);border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:500;transition:all .15s}
.source-link:hover{border-color:var(--accent);background:var(--accent-dim)}

@media(max-width:600px){
  .stats{gap:24px}
  .stat-value{font-size:24px}
  .case-meta{gap:8px}
  .tools-list{gap:6px}
}
`;

// Generate index page
function generateIndex(lang) {
  const isRu = lang === 'ru';
  const texts = isRu ? {
    badge: 'Обновляется ежедневно',
    title: 'Реальные кейсы <span>OpenClaw</span>',
    subtitle: 'Как люди используют AI-агентов для автоматизации жизни и бизнеса',
    statTotal: 'Всего кейсов',
    statToday: 'Сегодня',
    statWeek: 'За неделю',
    feedTitle: 'Топ кейсы',
    navSubmit: 'Добавить кейс'
  } : {
    badge: 'Updated Daily',
    title: 'Real <span>OpenClaw</span> Cases',
    subtitle: 'How people use AI agents to automate their lives and businesses',
    statTotal: 'Total Cases',
    statToday: 'Today',
    statWeek: 'This Week',
    feedTitle: 'Top Cases',
    navSubmit: 'Submit Case'
  };
  
  const casesHtml = data.cases.map(c => generateCaseCard(c, lang)).join('');
  
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenClaw Times — ${isRu ? 'Реальные кейсы AI-агентов' : 'Real AI Agent Use Cases'}</title>
<meta name="description" content="${isRu ? 'Подборка реальных кейсов использования OpenClaw. Обновляется ежедневно.' : 'Curated real-world OpenClaw use cases. Updated daily.'}">
<link rel="canonical" href="${SITE_URL}${isRu ? '/ru/' : '/'}">
<link rel="alternate" hreflang="en" href="${SITE_URL}/">
<link rel="alternate" hreflang="ru" href="${SITE_URL}/ru/">
<link rel="alternate" hreflang="x-default" href="${SITE_URL}/">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:title" content="OpenClaw Times — ${isRu ? 'Реальные кейсы AI-агентов' : 'Real AI Agent Use Cases'}">
<meta property="og:description" content="${isRu ? 'Подборка реальных кейсов использования OpenClaw. Обновляется ежедневно.' : 'Curated real-world OpenClaw use cases. Updated daily.'}">
<meta property="og:url" content="${SITE_URL}${isRu ? '/ru/' : '/'}">
<meta property="og:site_name" content="OpenClaw Times">
<meta property="og:locale" content="${isRu ? 'ru_RU' : 'en_US'}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="OpenClaw Times — ${isRu ? 'Реальные кейсы AI-агентов' : 'Real AI Agent Use Cases'}">
<meta name="twitter:description" content="${isRu ? 'Как люди используют AI-агентов. Обновляется ежедневно.' : 'How people use AI agents. Updated daily.'}">

<!-- JSON-LD -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "OpenClaw Times",
  "url": "${SITE_URL}",
  "description": "${isRu ? 'Реальные кейсы использования AI-агента OpenClaw' : 'Real-world OpenClaw AI agent use cases'}",
  "inLanguage": "${isRu ? 'ru' : 'en'}"
}
</script>

<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦞</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${STYLES}</style>
</head>
<body>

<header>
  <div class="container">
    <div class="header-inner">
      <a href="${isRu ? '/ru/' : '/'}" class="logo">🦞 Open<span>Claw</span> Times</a>
      <nav>
        <div class="lang-switch">
          <a href="/" class="lang-btn ${isRu ? '' : 'active'}" title="English" onclick="localStorage.setItem('lang-override','en')">🇬🇧</a>
          <a href="/ru/" class="lang-btn ${isRu ? 'active' : ''}" title="Русский" onclick="localStorage.setItem('lang-override','ru')">🇷🇺</a>
        </div>
      </nav>
    </div>
  </div>
</header>

<section class="hero">
  <div class="container">
    <div class="hero-badge">${texts.badge}</div>
    <h1>${texts.title}</h1>
    <p>${texts.subtitle}</p>
  </div>
</section>

<section class="stats">
  <div class="stat"><div class="stat-value">${data.stats.total}</div><div class="stat-label">${texts.statTotal}</div></div>
  <div class="stat"><div class="stat-value">${data.stats.today}</div><div class="stat-label">${texts.statToday}</div></div>
  <div class="stat"><div class="stat-value">${data.stats.week}</div><div class="stat-label">${texts.statWeek}</div></div>
</section>

<main class="feed">
  <div class="container">
    <div class="feed-header">
      <div class="feed-title">${texts.feedTitle}</div>
      <div class="feed-date">${formatDate(data.updated, lang)}</div>
    </div>
    ${casesHtml}
  </div>
</main>

<footer>
  <div class="container">
    <div class="footer-author">
      <span>${isRu ? 'Проект' : 'A project by'} <a href="https://t.me/aiffring" target="_blank">Denis Ffring</a></span>
      <span class="footer-divider">·</span>
      <a href="https://plaan.ai" target="_blank">Plaan.ai</a>
    </div>
    <div class="footer-cta">
      <a href="https://t.me/ffring" target="_blank" class="cta-btn">
        ${isRu ? '💬 Консультация по внедрению ИИ' : '💬 AI Implementation Consulting'}
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

${!isRu ? `<!-- Auto-detect Russian language -->
<script>
(function(){
  if (localStorage.getItem('lang-override')) return;
  var lang = navigator.language || navigator.userLanguage || '';
  if (lang.toLowerCase().startsWith('ru') && !window.location.pathname.startsWith('/ru')) {
    window.location.href = '/ru/' + window.location.search;
  }
})();
</script>` : ''}

</body>
</html>`;
}

// Generate individual case page with FULL CONTENT
function generateCasePage(c, lang) {
  const isRu = lang === 'ru';
  const title = isRu ? c.title_ru : c.title_en;
  const desc = isRu ? c.desc_ru : c.desc_en;
  const content = isRu ? (c.content_ru || c.content_en) : c.content_en;
  const tag = TAGS[c.tag] || TAGS.automation;
  const tagLabel = isRu ? tag.ru : tag.en;
  const backText = isRu ? '← Все кейсы' : '← All cases';
  const sourceText = isRu ? 'Открыть источник' : 'View source';
  const toolsTitle = isRu ? 'Инструменты' : 'Tools Used';
  const resultsTitle = isRu ? 'Результаты' : 'Results';
  
  // Convert markdown content to HTML
  const contentHtml = content ? markdownToHtml(content) : `<p>${desc}</p>`;
  
  // Tools section
  const toolsHtml = c.tools && c.tools.length > 0 ? `
    <div class="tools-section">
      <h4>${toolsTitle}</h4>
      <div class="tools-list">
        ${c.tools.map(t => `<span class="tool-tag">${t}</span>`).join('')}
      </div>
    </div>
  ` : '';
  
  // Results section
  const resultsHtml = c.results ? `
    <div class="results-section">
      <h4>${resultsTitle}</h4>
      <p>${c.results}</p>
    </div>
  ` : '';
  
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | OpenClaw Times</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${SITE_URL}${isRu ? '/ru' : ''}/case/${c.id}.html">
<link rel="alternate" hreflang="en" href="${SITE_URL}/case/${c.id}.html">
<link rel="alternate" hreflang="ru" href="${SITE_URL}/ru/case/${c.id}.html">

<!-- Open Graph -->
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${SITE_URL}${isRu ? '/ru' : ''}/case/${c.id}.html">
<meta property="og:site_name" content="OpenClaw Times">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">

<!-- JSON-LD Article -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "${title}",
  "description": "${desc}",
  "url": "${SITE_URL}${isRu ? '/ru' : ''}/case/${c.id}.html",
  "datePublished": "${c.date}",
  "publisher": {"@type": "Organization", "name": "OpenClaw Times"}
}
</script>

<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦞</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${STYLES}</style>
</head>
<body>

<header>
  <div class="container">
    <div class="header-inner">
      <a href="${isRu ? '/ru/' : '/'}" class="logo">🦞 Open<span>Claw</span> Cases</a>
      <nav>
        <div class="lang-switch">
          <a href="/case/${c.id}.html" class="lang-btn ${isRu ? '' : 'active'}" title="English" onclick="localStorage.setItem('lang-override','en')">🇬🇧</a>
          <a href="/ru/case/${c.id}.html" class="lang-btn ${isRu ? 'active' : ''}" title="Русский" onclick="localStorage.setItem('lang-override','ru')">🇷🇺</a>
        </div>
      </nav>
    </div>
  </div>
</header>

<main class="case-page">
  <div class="container">
    <a href="${isRu ? '/ru/' : '/'}" class="back">${backText}</a>
    <h1>${title}</h1>
    <div class="meta">
      <span class="case-tag ${c.tag}">${tagLabel}</span>
      <span style="color:var(--text-muted)">${c.source}</span>
      <span style="color:var(--text-muted);font-family:var(--font-mono)">${formatDate(c.date, lang)}</span>
      <span style="display:flex;align-items:center;gap:4px;color:var(--accent);font-family:var(--font-mono)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        ${c.points}
      </span>
    </div>
    
    ${toolsHtml}
    ${resultsHtml}
    
    <div class="content">
      ${contentHtml}
    </div>
    
    <a href="${c.source_url}" target="_blank" class="source-link">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
      ${sourceText}
    </a>
  </div>
</main>

<footer>
  <div class="container">
    <div class="footer-author">
      <span>${isRu ? 'Проект' : 'A project by'} <a href="https://t.me/aiffring" target="_blank">Denis Ffring</a></span>
      <span class="footer-divider">·</span>
      <a href="https://plaan.ai" target="_blank">Plaan.ai</a>
    </div>
    <div class="footer-cta">
      <a href="https://t.me/ffring" target="_blank" class="cta-btn">
        ${isRu ? '💬 Консультация по внедрению ИИ' : '💬 AI Implementation Consulting'}
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

</body>
</html>`;
}

// Ensure directories exist
fs.mkdirSync(path.join(TEMPLATE_DIR, 'en'), { recursive: true });
fs.mkdirSync(path.join(TEMPLATE_DIR, 'ru'), { recursive: true });
fs.mkdirSync(path.join(TEMPLATE_DIR, 'case'), { recursive: true });
fs.mkdirSync(path.join(TEMPLATE_DIR, 'ru', 'case'), { recursive: true });

// Write files
console.log('Generating OpenClaw Times site...');

// EN index
fs.writeFileSync(path.join(TEMPLATE_DIR, 'index.html'), generateIndex('en'));
fs.writeFileSync(path.join(TEMPLATE_DIR, 'en', 'index.html'), generateIndex('en'));
console.log('✓ EN index');

// RU index
fs.writeFileSync(path.join(TEMPLATE_DIR, 'ru', 'index.html'), generateIndex('ru'));
console.log('✓ RU index');

// Case pages
for (const c of data.cases) {
  fs.writeFileSync(path.join(TEMPLATE_DIR, 'case', `${c.id}.html`), generateCasePage(c, 'en'));
  fs.writeFileSync(path.join(TEMPLATE_DIR, 'ru', 'case', `${c.id}.html`), generateCasePage(c, 'ru'));
}
console.log(`✓ ${data.cases.length} case pages (EN + RU)`);

// Generate sitemap.xml
const today = new Date().toISOString().split('T')[0];
const sitemapUrls = [
  { loc: `${SITE_URL}/`, priority: '1.0', changefreq: 'daily' },
  { loc: `${SITE_URL}/ru/`, priority: '1.0', changefreq: 'daily' },
  ...data.cases.map(c => ({
    loc: `${SITE_URL}/case/${c.id}.html`,
    lastmod: c.date,
    priority: '0.8',
    changefreq: 'weekly'
  })),
  ...data.cases.map(c => ({
    loc: `${SITE_URL}/ru/case/${c.id}.html`,
    lastmod: c.date,
    priority: '0.7',
    changefreq: 'weekly'
  }))
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : `<lastmod>${today}</lastmod>`}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

fs.writeFileSync(path.join(TEMPLATE_DIR, 'sitemap.xml'), sitemap);
console.log('✓ sitemap.xml');

console.log('\nDone! Site generated.');
