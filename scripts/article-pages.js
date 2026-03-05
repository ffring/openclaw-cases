#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');

function escAttr(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildKeywordPills(kw) {
  if (!kw) return '';
  return kw.split(',').map(function(k) {
    var t = k.trim();
    return t ? '<span class="kw">' + escAttr(t) + '</span>' : '';
  }).join('');
}

function generateArticlePage(a) {
  var BASE = 'https://openclawtimes.com/playground';
  var url = BASE + '/articles/' + a.slug + '/';
  var tagLabels = {
    ru: { ai: 'AI инструменты', startups: 'Стартапы', cases: 'Кейсы', prompts: 'Промпты', trends: 'Тренды' },
    en: { ai: 'AI Tools', startups: 'Startups', cases: 'Cases', prompts: 'Prompts', trends: 'Trends' },
    es: { ai: 'Herramientas IA', startups: 'Startups', cases: 'Casos', prompts: 'Prompts', trends: 'Tendencias' }
  };
  var langs = ['ru', 'en', 'es'];
  var tag = a.tag || 'trends';

  var hreflangs = '';
  for (var i = 0; i < langs.length; i++) {
    var l = langs[i];
    var suffix = l === 'ru' ? '' : '?lang=' + l;
    hreflangs += '<link rel="alternate" hreflang="' + l + '" href="' + escAttr(url + suffix) + '">\n';
  }
  hreflangs += '<link rel="alternate" hreflang="x-default" href="' + escAttr(url) + '">\n';

  var page = '<!DOCTYPE html>\n' +
    '<html lang="ru" dir="ltr">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>' + escAttr(a.title_ru) + ' | Synth Media</title>\n' +
    '<meta name="description" content="' + escAttr(a.desc_ru) + '">\n' +
    '<meta name="keywords" content="' + escAttr(a.keywords_ru) + '">\n' +
    '<meta name="author" content="Synth Media">\n' +
    '<meta name="robots" content="index, follow, max-image-preview:large">\n' +
    '<link rel="canonical" href="' + escAttr(url) + '">\n' +
    hreflangs +
    '<meta property="og:type" content="article">\n' +
    '<meta property="og:site_name" content="Synth Media">\n' +
    '<meta property="og:title" content="' + escAttr(a.title_ru) + '">\n' +
    '<meta property="og:description" content="' + escAttr(a.desc_ru) + '">\n' +
    '<meta property="og:url" content="' + escAttr(url) + '">\n' +
    '<meta property="og:image" content="' + escAttr(a.thumbnail) + '">\n' +
    '<meta property="og:locale" content="ru_RU">\n' +
    '<meta property="og:locale:alternate" content="en_US">\n' +
    '<meta property="og:locale:alternate" content="es_ES">\n' +
    '<meta property="article:published_time" content="' + a.date + 'T00:00:00Z">\n' +
    '<meta property="article:section" content="' + escAttr(tagLabels.en[tag] || tag) + '">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:title" content="' + escAttr(a.title_ru) + '">\n' +
    '<meta name="twitter:description" content="' + escAttr(a.desc_ru) + '">\n' +
    '<meta name="twitter:image" content="' + escAttr(a.thumbnail) + '">\n' +
    '<meta name="theme-color" content="#1a1128">\n' +
    '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'><rect width=\'32\' height=\'32\' rx=\'6\' fill=\'%237c3aed\'/><text x=\'50%25\' y=\'50%25\' dominant-baseline=\'central\' text-anchor=\'middle\' fill=\'white\' font-family=\'system-ui\' font-size=\'18\' font-weight=\'700\'>S</text></svg>">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Sharp:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet">\n' +
    '<script type="application/ld+json">\n' +
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": a.title_en,
      "description": a.desc_en,
      "image": a.thumbnail,
      "datePublished": a.date + 'T00:00:00Z',
      "author": { "@type": "Organization", "name": "Synth Media" },
      "publisher": { "@type": "Organization", "name": "Synth Media", "logo": { "@type": "ImageObject", "url": "https://openclawtimes.com/assets/og-synth.png" } },
      "mainEntityOfPage": url,
      "articleSection": tagLabels.en[tag] || tag,
      "inLanguage": ["ru", "en", "es"],
      "keywords": (a.keywords_en || '').split(',').map(function(k) { return k.trim(); })
    }) + '\n</script>\n' +
    '<style>\n' +
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}\n' +
    ':root{--bg:#1a1128;--bg-card:#251d38;--border:#352d4a;--primary:#a78bfa;--foreground:#f0eaf8;--muted-fg:#8b82a0;--secondary:#2a2040;--font-sans:\'Geist\',system-ui,sans-serif;--font-mono:\'JetBrains Mono\',monospace}\n' +
    'html{-webkit-font-smoothing:antialiased;scroll-behavior:smooth}\n' +
    'body{font-family:var(--font-sans);background:var(--bg);color:var(--foreground);line-height:1.6;min-height:100vh}\n' +
    'a{color:var(--primary);text-decoration:none}\n' +
    'a:hover{text-decoration:underline}\n' +
    '::selection{background:var(--primary);color:#fff}\n' +
    '.article-page{max-width:760px;margin:0 auto;padding:32px 20px 80px}\n' +
    '.back-link{display:inline-flex;align-items:center;gap:6px;color:var(--muted-fg);font-size:14px;margin-bottom:24px;transition:color .15s}\n' +
    '.back-link:hover{color:var(--primary);text-decoration:none}\n' +
    '.article-hero{width:100%;max-height:400px;object-fit:cover;border-radius:12px;margin-bottom:24px}\n' +
    '.article-tag{display:inline-flex;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:500;margin-bottom:12px}\n' +
    '.article-tag.ai{background:rgba(167,139,250,.13);color:#a78bfa}\n' +
    '.article-tag.startups{background:rgba(96,165,250,.13);color:#60a5fa}\n' +
    '.article-tag.cases{background:rgba(249,115,22,.13);color:#f97316}\n' +
    '.article-tag.prompts{background:rgba(74,222,128,.13);color:#4ade80}\n' +
    '.article-tag.trends{background:rgba(244,54,72,.13);color:#f43648}\n' +
    '.article-title{font-size:32px;font-weight:700;line-height:1.3;margin-bottom:12px}\n' +
    '.article-meta{font-size:13px;color:var(--muted-fg);margin-bottom:24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}\n' +
    '.article-keywords{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:32px}\n' +
    '.kw{padding:3px 10px;border-radius:999px;background:var(--secondary);color:var(--muted-fg);font-size:11px;font-family:var(--font-mono)}\n' +
    '.article-body{font-size:17px;line-height:1.85}\n' +
    '.article-body h2{font-size:22px;font-weight:600;margin:32px 0 14px}\n' +
    '.article-body p{margin-bottom:18px}\n' +
    '.article-body ul,.article-body ol{margin:12px 0 18px 24px}\n' +
    '.article-body li{margin-bottom:10px}\n' +
    '.article-body strong{color:var(--primary)}\n' +
    '.article-body blockquote{border-left:3px solid var(--primary);padding:14px 24px;margin:20px 0;background:rgba(167,139,250,.05);border-radius:0 8px 8px 0;font-style:italic}\n' +
    '.article-source{margin-top:32px;padding-top:20px;border-top:1px solid var(--border);font-size:14px;color:var(--muted-fg)}\n' +
    '.lang-switch{display:flex;gap:4px;padding:3px;border-radius:999px;background:var(--secondary);position:fixed;top:16px;right:16px;z-index:50}\n' +
    '.lang-btn{width:32px;height:28px;border:none;border-radius:999px;cursor:pointer;font-size:16px;background:transparent;transition:all .15s;display:flex;align-items:center;justify-content:center}\n' +
    '.lang-btn:hover{background:rgba(167,139,250,.2)}\n' +
    '.lang-btn.active{background:var(--bg);box-shadow:0 1px 3px rgba(0,0,0,.15)}\n' +
    '.material-symbols-sharp{font-variation-settings:\'FILL\' 0,\'wght\' 100,\'GRAD\' 0,\'opsz\' 24}\n' +
    '@media(max-width:600px){.article-title{font-size:24px}.article-body{font-size:15px}}\n' +
    '</style>\n</head>\n<body>\n' +
    '<div class="lang-switch" role="group" aria-label="Language">\n' +
    '  <button class="lang-btn active" data-lang="ru" aria-label="Русский">🇷🇺</button>\n' +
    '  <button class="lang-btn" data-lang="en" aria-label="English">🇬🇧</button>\n' +
    '  <button class="lang-btn" data-lang="es" aria-label="Español">🇪🇸</button>\n' +
    '</div>\n' +
    '<article class="article-page" itemscope itemtype="https://schema.org/Article">\n' +
    '  <a href="/playground/" class="back-link"><span class="material-symbols-sharp" style="font-size:18px">arrow_back</span> <span data-i18n="back">Назад к ленте</span></a>\n' +
    '  <img class="article-hero" src="' + escAttr(a.thumbnail) + '" alt="' + escAttr(a.title_en) + '" itemprop="image" width="760" height="400">\n' +
    '  <span class="article-tag ' + tag + '" itemprop="articleSection" data-i18n="tag_' + tag + '">' + escAttr((tagLabels.ru[tag] || tag)) + '</span>\n' +
    '  <h1 class="article-title" itemprop="headline" data-i18n="title">' + escAttr(a.title_ru) + '</h1>\n' +
    '  <div class="article-meta">\n' +
    '    <time datetime="' + a.date + '" itemprop="datePublished" data-i18n="date">' + a.date + '</time>\n' +
    '    <span>' + escAttr(a.channel) + '</span>\n' +
    '    <span><span class="material-symbols-sharp" style="font-size:16px;vertical-align:middle">schedule</span> <span data-i18n="read_time">' + (a.read_time || 3) + ' мин чтения</span></span>\n' +
    '  </div>\n' +
    '  <div class="article-keywords" data-i18n-keywords="keywords_ru">' + buildKeywordPills(a.keywords_ru) + '</div>\n' +
    '  <div class="article-body" itemprop="articleBody" data-i18n-body="body_ru">' + (a.body_ru || '') + '</div>\n' +
    '  <div class="article-source"><span data-i18n="source_label">Источник:</span> <a href="' + escAttr(a.source_url) + '" target="_blank" rel="noopener">' + escAttr(a.channel) + ' — YouTube</a></div>\n' +
    '</article>\n' +
    '<script>\n' +
    'var articleData=' + JSON.stringify({
      title_ru: a.title_ru, title_en: a.title_en, title_es: a.title_es,
      desc_ru: a.desc_ru, desc_en: a.desc_en, desc_es: a.desc_es,
      body_ru: a.body_ru, body_en: a.body_en, body_es: a.body_es,
      keywords_ru: a.keywords_ru, keywords_en: a.keywords_en, keywords_es: a.keywords_es,
      tag: a.tag, date: a.date, read_time: a.read_time
    }) + ';\n' +
    'var tagLabels=' + JSON.stringify(tagLabels) + ';\n' +
    'var readLabels={ru:"мин чтения",en:"min read",es:"min lectura"};\n' +
    'var backLabels={ru:"Назад к ленте",en:"Back to feed",es:"Volver al feed"};\n' +
    'var srcLabels={ru:"Источник:",en:"Source:",es:"Fuente:"};\n' +
    'var monthNames={ru:["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"],en:["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],es:["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]};\n' +
    'function formatDate(ds,l){var d=new Date(ds+"T00:00:00");return d.getDate()+" "+(monthNames[l]||monthNames.en)[d.getMonth()]+" "+d.getFullYear()}\n' +
    'function setLang(lang){\n' +
    '  document.documentElement.lang=lang;\n' +
    '  document.title=(articleData["title_"+lang]||articleData.title_en)+" | Synth Media";\n' +
    '  document.querySelector("meta[name=description]").setAttribute("content",articleData["desc_"+lang]||articleData.desc_en);\n' +
    '  document.querySelector("meta[property=\\"og:title\\"]").setAttribute("content",articleData["title_"+lang]||articleData.title_en);\n' +
    '  document.querySelector("meta[property=\\"og:description\\"]").setAttribute("content",articleData["desc_"+lang]||articleData.desc_en);\n' +
    '  document.querySelector("[data-i18n=title]").textContent=articleData["title_"+lang]||articleData.title_en;\n' +
    '  document.querySelector("[data-i18n=back]").textContent=backLabels[lang]||backLabels.en;\n' +
    '  document.querySelector("[data-i18n=source_label]").textContent=srcLabels[lang]||srcLabels.en;\n' +
    '  document.querySelector("[data-i18n=date]").textContent=formatDate(articleData.date,lang);\n' +
    '  document.querySelector("[data-i18n=read_time]").textContent=(articleData.read_time||3)+" "+(readLabels[lang]||readLabels.en);\n' +
    '  var tl=tagLabels[lang]||tagLabels.en;document.querySelector("[data-i18n^=tag_]").textContent=tl[articleData.tag]||articleData.tag;\n' +
    '  var bodyEl=document.querySelector("[data-i18n-body]");\n' +
    '  var bodyHtml=articleData["body_"+lang]||articleData.body_en||"";\n' +
    '  bodyEl.textContent="";\n' +
    '  if(bodyHtml){var p=new DOMParser();var d=p.parseFromString(bodyHtml,"text/html");var n=d.body.childNodes;for(var j=0;j<n.length;j++){bodyEl.appendChild(document.importNode(n[j],true))}}\n' +
    '  var kwEl=document.querySelector("[data-i18n-keywords]");\n' +
    '  var kws=(articleData["keywords_"+lang]||articleData.keywords_en||"").split(",");\n' +
    '  kwEl.textContent="";\n' +
    '  for(var k=0;k<kws.length;k++){if(!kws[k].trim())continue;var s=document.createElement("span");s.className="kw";s.textContent=kws[k].trim();kwEl.appendChild(s)}\n' +
    '  document.querySelectorAll(".lang-btn").forEach(function(b){b.classList.toggle("active",b.dataset.lang===lang)});\n' +
    '  if(history.replaceState){var u=new URL(window.location);if(lang==="ru"){u.searchParams.delete("lang")}else{u.searchParams.set("lang",lang)}history.replaceState(null,"",u)}\n' +
    '  localStorage.setItem("synth-lang",lang);\n' +
    '}\n' +
    'document.querySelectorAll(".lang-btn").forEach(function(b){b.addEventListener("click",function(){setLang(b.dataset.lang)})});\n' +
    'var urlLang=new URLSearchParams(window.location.search).get("lang");\n' +
    'var initLang=urlLang&&["ru","en","es"].indexOf(urlLang)!==-1?urlLang:(localStorage.getItem("synth-lang")||"ru");\n' +
    'if(initLang!=="ru")setLang(initLang);\n' +
    'else{document.querySelector("[data-i18n=date]").textContent=formatDate(articleData.date,"ru")}\n' +
    '</script>\n</body>\n</html>';

  return page;
}

function generateSitemap(articles, rootDir) {
  var BASE = 'https://openclawtimes.com';
  var today = new Date().toISOString().split('T')[0];
  var langs = ['ru', 'en', 'es'];

  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    '  <url>\n    <loc>' + BASE + '/playground/</loc>\n    <lastmod>' + today + '</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n';
  for (var i = 0; i < langs.length; i++) {
    var suffix = langs[i] === 'ru' ? '' : '?lang=' + langs[i];
    xml += '    <xhtml:link rel="alternate" hreflang="' + langs[i] + '" href="' + BASE + '/playground/' + suffix + '"/>\n';
  }
  xml += '    <xhtml:link rel="alternate" hreflang="x-default" href="' + BASE + '/playground/"/>\n  </url>\n';

  for (var j = 0; j < articles.length; j++) {
    var a = articles[j];
    if (!a.slug) continue;
    var aUrl = BASE + '/playground/articles/' + a.slug + '/';
    xml += '  <url>\n    <loc>' + aUrl + '</loc>\n    <lastmod>' + (a.date || today) + '</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n';
    for (var k = 0; k < langs.length; k++) {
      var aSuffix = langs[k] === 'ru' ? '' : '?lang=' + langs[k];
      xml += '    <xhtml:link rel="alternate" hreflang="' + langs[k] + '" href="' + aUrl + aSuffix + '"/>\n';
    }
    xml += '    <xhtml:link rel="alternate" hreflang="x-default" href="' + aUrl + '"/>\n  </url>\n';
  }

  xml += '</urlset>\n';
  fs.writeFileSync(path.join(rootDir, 'sitemap.xml'), xml);
  console.log('Sitemap updated with ' + articles.length + ' article URLs');
}

module.exports = { generateArticlePage: generateArticlePage, generateSitemap: generateSitemap };
