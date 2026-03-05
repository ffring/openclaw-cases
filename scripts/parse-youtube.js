#!/usr/bin/env node
'use strict';

/**
 * Synth YouTube Parser v1.0
 * Парсит RSS-фиды топовых AI YouTube-каналов,
 * генерирует статьи через OpenAI API,
 * сохраняет в data/synth-feed.json
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Paths
const ROOT = path.join(__dirname, '..');
const FEED_PATH = path.join(ROOT, 'data', 'synth-feed.json');
const SEEN_PATH = path.join(ROOT, 'data', 'seen-videos.json');

// Load env: GitHub Actions sets env vars directly; local dev uses ~/.openclaw/.env
const envPath = path.join(process.env.HOME || '', '.openclaw', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-nano';
const MAX_ARTICLES = 50;
const VIDEO_AGE_HOURS = 72;

if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY not set. Set in env or ~/.openclaw/.env');
  process.exit(1);
}

// Top AI YouTube channels
const CHANNELS = [
  { id: 'UCPjNBjflYl0-HQtUvOx0Ibw', name: 'Greg Isenberg', tag: 'startups' },
  { id: 'UChpleBmo18P08aKCIgti38g', name: 'Matt Wolfe', tag: 'ai' },
  { id: 'UCsBjURrPoezykLs9EqgamOA', name: 'Fireship', tag: 'trends' },
  { id: 'UCqcbQf6yw5KzRoDDcZ_wBSw', name: 'Wes Roth', tag: 'trends' },
  { id: 'UCbfYPyITQ-7l4upoX8nvctg', name: 'Two Minute Papers', tag: 'ai' },
  { id: 'UCcefcZRL2oaA_uBNeo5UOWg', name: 'Y Combinator', tag: 'startups' },
];

// HTTP GET
function fetchURL(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': 'SynthMedia/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// HTTP POST JSON
function postJSON(url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, (res) => {
      let resp = '';
      res.on('data', chunk => resp += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(resp)); }
        catch { reject(new Error('Invalid JSON: ' + resp.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Parse YouTube Atom RSS feed
function parseRSS(xml, channel) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const videoId = extract(entry, /<yt:videoId>(.*?)<\/yt:videoId>/);
    const title = extract(entry, /<title>(.*?)<\/title>/);
    const published = extract(entry, /<published>(.*?)<\/published>/);
    const description = extract(entry, /<media:description>([\s\S]*?)<\/media:description>/);
    const thumbnail = extract(entry, /<media:thumbnail url="(.*?)"/);

    if (videoId && title) {
      entries.push({
        videoId,
        title: decodeXML(title),
        description: decodeXML(description || '').slice(0, 2000),
        published,
        thumbnail: thumbnail || 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg',
        channelName: channel.name,
        defaultTag: channel.tag,
        url: 'https://www.youtube.com/watch?v=' + videoId
      });
    }
  }
  return entries;
}

function extract(text, regex) {
  const m = text.match(regex);
  return m ? m[1].trim() : '';
}

function decodeXML(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

// Generate article via OpenAI
async function generateArticle(video) {
  const prompt = 'You are a senior SEO-optimized tech journalist for Synth, a curated AI media platform.\n' +
    'Based on this YouTube video, write a FULL SEO/GEO-optimized article for our platform.\n\n' +
    'VIDEO:\n' +
    'Title: ' + video.title + '\n' +
    'Channel: ' + video.channelName + '\n' +
    'Description: ' + video.description.slice(0, 1500) + '\n\n' +
    'RESPOND IN VALID JSON:\n' +
    '{\n' +
    '  "title_ru": "SEO-заголовок на русском (H1, 50-70 символов, содержит ключевое слово)",\n' +
    '  "title_en": "SEO title in English (H1, 50-70 chars, contains primary keyword)",\n' +
    '  "title_es": "Título SEO en español (H1, 50-70 chars, contiene palabra clave)",\n' +
    '  "desc_ru": "Мета-описание на русском (150-160 символов, с CTA)",\n' +
    '  "desc_en": "Meta description in English (150-160 chars, with CTA)",\n' +
    '  "desc_es": "Meta descripción en español (150-160 chars, con CTA)",\n' +
    '  "body_ru": "Полная статья на русском в HTML (см. правила ниже)",\n' +
    '  "body_en": "Full article in English in HTML (see rules below)",\n' +
    '  "body_es": "Artículo completo en español en HTML (ver reglas abajo)",\n' +
    '  "keywords_ru": "5-7 ключевых слов через запятую на русском",\n' +
    '  "keywords_en": "5-7 keywords comma-separated in English",\n' +
    '  "keywords_es": "5-7 palabras clave separadas por comas en español",\n' +
    '  "slug": "url-friendly-slug-in-english",\n' +
    '  "tag": "one of: ai, startups, cases, prompts, trends",\n' +
    '  "read_time": 3\n' +
    '}\n\n' +
    'ARTICLE BODY HTML RULES (body_ru, body_en, body_es):\n' +
    '- Start with a strong intro paragraph (no H1 — it is the title)\n' +
    '- Use 2-3 <h2> subheadings with keywords\n' +
    '- Use <ul><li> or <ol><li> bullet/numbered lists for key points\n' +
    '- Use <strong> for important terms (good for GEO/AI snippets)\n' +
    '- Use <blockquote> for key insights or quotes\n' +
    '- 300-500 words per language\n' +
    '- End with a conclusion paragraph with a takeaway\n' +
    '- Include semantic HTML only: p, h2, ul, ol, li, strong, em, blockquote\n' +
    '- NO <h1>, <script>, <style>, <div>, <span>, <a> tags\n\n' +
    'SEO/GEO OPTIMIZATION RULES:\n' +
    '- Title (H1): primary keyword in first 3 words when possible\n' +
    '- Meta description: includes primary keyword + call-to-action\n' +
    '- H2 subheadings: contain secondary keywords, structured for featured snippets\n' +
    '- Lists: formatted for Google/AI snippet extraction\n' +
    '- Keywords: mix of head terms and long-tail\n' +
    '- Slug: 3-5 words, lowercase, hyphens only\n' +
    '- read_time: estimated minutes to read (integer)\n\n' +
    'WRITING RULES:\n' +
    '- tag: ai=AI tools/models, startups=startup news/funding, cases=real use cases, prompts=prompts/workflows, trends=industry trends\n' +
    '- Write naturally, no corporate speak\n' +
    '- Russian: без канцелярита, живым языком, по-человечески\n' +
    '- Spanish: natural, conversational tone\n' +
    '- Every article must provide actionable value to the reader';

  const response = await postJSON('https://api.openai.com/v1/chat/completions', {
    model: OPENAI_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 4000,
    temperature: 0.7
  }, {
    'Authorization': 'Bearer ' + OPENAI_API_KEY
  });

  if (response.error) {
    throw new Error('OpenAI: ' + response.error.message);
  }

  const content = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
  if (!content) throw new Error('Empty OpenAI response');

  const parsed = JSON.parse(content);

  // Validate
  var required = ['title_ru', 'title_en', 'desc_ru', 'desc_en', 'body_ru', 'body_en', 'tag'];
  for (var i = 0; i < required.length; i++) {
    if (!parsed[required[i]]) throw new Error('Missing: ' + required[i]);
  }

  var validTags = ['ai', 'startups', 'cases', 'prompts', 'trends'];
  if (validTags.indexOf(parsed.tag) === -1) {
    parsed.tag = video.defaultTag || 'trends';
  }

  // Sanitize HTML bodies — allow only safe tags
  var safeTags = ['p', 'h2', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote'];
  function sanitizeBody(html) {
    if (!html) return '';
    // Remove any tags not in safeTags
    return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, function(match, tagName) {
      if (safeTags.indexOf(tagName.toLowerCase()) !== -1) return match;
      return '';
    });
  }
  parsed.body_ru = sanitizeBody(parsed.body_ru);
  parsed.body_en = sanitizeBody(parsed.body_en);
  parsed.body_es = sanitizeBody(parsed.body_es || '');

  return parsed;
}

// Article page generation (shared module)
var articlePages = require('./article-pages');

// Main
async function main() {
  console.log('Synth YouTube Parser v1.0');
  console.log('Model: ' + OPENAI_MODEL);
  console.log('Channels: ' + CHANNELS.length);
  console.log('Looking back: ' + VIDEO_AGE_HOURS + 'h\n');

  // Load existing data
  var feed = { updated: new Date().toISOString(), articles: [] };
  try { feed = JSON.parse(fs.readFileSync(FEED_PATH, 'utf8')); } catch (e) {}

  var seen = [];
  try { seen = JSON.parse(fs.readFileSync(SEEN_PATH, 'utf8')); } catch (e) {}
  var seenSet = new Set(seen);

  var cutoff = Date.now() - VIDEO_AGE_HOURS * 3600 * 1000;
  var allVideos = [];

  for (var c = 0; c < CHANNELS.length; c++) {
    var channel = CHANNELS[c];
    try {
      console.log('Fetching ' + channel.name + '...');
      var rssUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channel.id;
      var xml = await fetchURL(rssUrl);
      var entries = parseRSS(xml, channel);

      var recent = entries.filter(function(e) {
        var pubTime = new Date(e.published).getTime();
        return pubTime > cutoff && !seenSet.has(e.videoId);
      });

      console.log('  ' + entries.length + ' videos, ' + recent.length + ' new');
      allVideos = allVideos.concat(recent);
    } catch (err) {
      console.error('  Error ' + channel.name + ': ' + err.message);
    }
  }

  if (allVideos.length === 0) {
    console.log('\nNo new videos. Feed is up to date.');
    return;
  }

  // Sort newest first
  allVideos.sort(function(a, b) { return new Date(b.published) - new Date(a.published); });

  // Generate articles
  var newArticles = [];
  console.log('\nGenerating ' + allVideos.length + ' articles via OpenAI...\n');

  for (var v = 0; v < allVideos.length; v++) {
    var video = allVideos[v];
    try {
      var shortTitle = video.title.length > 55 ? video.title.slice(0, 55) + '...' : video.title;
      process.stdout.write('  ' + shortTitle + ' ');

      var article = await generateArticle(video);

      newArticles.push({
        id: video.videoId,
        slug: article.slug || video.videoId,
        title_ru: article.title_ru,
        title_en: article.title_en,
        title_es: article.title_es || article.title_en,
        desc_ru: article.desc_ru,
        desc_en: article.desc_en,
        desc_es: article.desc_es || article.desc_en,
        body_ru: article.body_ru,
        body_en: article.body_en,
        body_es: article.body_es || article.body_en,
        keywords_ru: article.keywords_ru || '',
        keywords_en: article.keywords_en || '',
        keywords_es: article.keywords_es || '',
        tag: article.tag,
        read_time: article.read_time || 3,
        source: 'YouTube',
        source_url: video.url,
        channel: video.channelName,
        thumbnail: video.thumbnail,
        date: new Date(video.published).toISOString().split('T')[0],
        video_id: video.videoId
      });

      seenSet.add(video.videoId);
      console.log('OK');

      await sleep(600);
    } catch (err) {
      console.log('FAIL: ' + err.message);
    }
  }

  // Merge: new first, then existing
  feed.articles = newArticles.concat(feed.articles).slice(0, MAX_ARTICLES);
  feed.updated = new Date().toISOString();

  // Ensure data directory
  var dataDir = path.join(ROOT, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  // Save feed JSON
  fs.writeFileSync(FEED_PATH, JSON.stringify(feed, null, 2));
  fs.writeFileSync(SEEN_PATH, JSON.stringify(Array.from(seenSet), null, 2));

  // Generate individual article HTML pages
  console.log('\nGenerating article pages...');
  var articlesDir = path.join(ROOT, 'playground', 'articles');
  if (!fs.existsSync(articlesDir)) fs.mkdirSync(articlesDir, { recursive: true });

  var pagesGenerated = 0;
  for (var p = 0; p < feed.articles.length; p++) {
    var a = feed.articles[p];
    if (!a.slug || !a.body_en) continue;
    var pageDir = path.join(articlesDir, a.slug);
    if (!fs.existsSync(pageDir)) fs.mkdirSync(pageDir, { recursive: true });
    var html = articlePages.generateArticlePage(a);
    fs.writeFileSync(path.join(pageDir, 'index.html'), html);
    pagesGenerated++;
  }

  // Generate sitemap entries for articles
  articlePages.generateSitemap(feed.articles, ROOT);

  console.log('Generated ' + pagesGenerated + ' article pages');
  console.log('\nDone! +' + newArticles.length + ' articles (' + feed.articles.length + ' total)');
}

main().catch(function(err) {
  console.error('Fatal: ' + err.message);
  process.exit(1);
});
