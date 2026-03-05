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
const { getSubtitles } = require('youtube-caption-extractor');

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

// Get YouTube transcript (auto-captions)
async function getTranscript(videoId) {
  try {
    var subs = await getSubtitles({ videoID: videoId, lang: 'en' });
    if (!subs || subs.length === 0) {
      subs = await getSubtitles({ videoID: videoId });
    }
    if (!subs || subs.length === 0) return '';
    return subs.map(function(s) { return s.text; }).join(' ').slice(0, 15000);
  } catch (e) {
    console.log('  No transcript: ' + e.message);
    return '';
  }
}

// Clean broken UTF-8 characters (mojibake fix)
function cleanUTF8(str) {
  if (!str) return '';
  return str
    .replace(/\uFFFD/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

// Generate article via OpenAI
async function generateArticle(video) {
  var hasTranscript = video.transcript && video.transcript.length > 100;
  var sourceBlock = 'VIDEO:\nTitle: ' + video.title + '\nChannel: ' + video.channelName + '\n';
  if (hasTranscript) {
    sourceBlock += 'Transcript (full video text):\n' + video.transcript.slice(0, 12000) + '\n';
  } else {
    sourceBlock += 'Description: ' + video.description.slice(0, 2000) + '\n';
    sourceBlock += '(No transcript available — write based on description, but still aim for depth)\n';
  }

  var prompt = 'You are a senior tech journalist writing in-depth, SEO/GEO-optimized longread articles for Synth, an AI media platform.\n\n' +
    sourceBlock + '\n' +
    'RESPOND IN VALID JSON (UTF-8, no broken characters):\n' +
    '{\n' +
    '  "title_ru": "SEO-заголовок на русском (50-70 символов, ключевое слово в начале)",\n' +
    '  "title_en": "SEO title in English (50-70 chars, keyword first)",\n' +
    '  "title_es": "Título SEO en español (50-70 chars, palabra clave primero)",\n' +
    '  "desc_ru": "Мета-описание 150-160 символов, с CTA",\n' +
    '  "desc_en": "Meta description 150-160 chars, with CTA",\n' +
    '  "desc_es": "Meta descripción 150-160 chars, con CTA",\n' +
    '  "body_ru": "LONGREAD статья на русском в HTML",\n' +
    '  "body_en": "LONGREAD article in English in HTML",\n' +
    '  "body_es": "LONGREAD artículo en español en HTML",\n' +
    '  "keywords_ru": "7-10 ключевых слов через запятую",\n' +
    '  "keywords_en": "7-10 keywords comma-separated",\n' +
    '  "keywords_es": "7-10 palabras clave separadas por comas",\n' +
    '  "slug": "url-friendly-slug-3-5-words",\n' +
    '  "tag": "ai|startups|cases|prompts|trends",\n' +
    '  "read_time": 7\n' +
    '}\n\n' +
    'WORD COUNT — ABSOLUTE REQUIREMENT:\n' +
    '- MINIMUM 1500 words per language. Articles under 1200 words are UNACCEPTABLE.\n' +
    '- Target: 1500-2000 words for each of body_ru, body_en, body_es\n' +
    '- This means each body field should contain AT LEAST 8000 characters of HTML\n' +
    '- DO NOT cut corners. Write FULL, DETAILED paragraphs. Each paragraph should be 3-5 sentences.\n' +
    '- If you feel you\'re running out of things to say, add: analysis, implications, comparisons, context, expert perspective, practical applications\n\n' +
    'ARTICLE STRUCTURE (body_ru, body_en, body_es):\n' +
    '- Intro: 2-3 paragraphs (150-200 words) — hook + context + what reader will learn\n' +
    '- 5-6 H2 sections, each 200-350 words with:\n' +
    '  * 2-3 detailed paragraphs per section\n' +
    '  * Specific details, examples, numbers from the transcript\n' +
    '  * At least 1 list (ul/ol) per 2 sections\n' +
    '  * At least 1 blockquote per article with key insight\n' +
    '- FAQ section: <h2>Часто задаваемые вопросы</h2> (RU) / <h2>Frequently Asked Questions</h2> (EN/ES)\n' +
    '  * 4-5 Q&A pairs using <h3> for questions, <p> for answers\n' +
    '  * Each answer: 2-3 sentences minimum\n' +
    '- Conclusion: 1-2 paragraphs summarizing key takeaways\n\n' +
    'HTML RULES:\n' +
    '- Use ONLY: p, h2, h3, ul, ol, li, strong, em, blockquote\n' +
    '- NO <h1>, <script>, <style>, <div>, <span>, <a>, <table> tags\n' +
    '- Use <strong> on important terms, product names, metrics\n' +
    '- NO invented statistics, fake quotes, or made-up company names\n' +
    '- If transcript mentions specific numbers, tools, companies — include them accurately\n\n' +
    'SEO/GEO RULES:\n' +
    '- H1 (title): primary keyword in first 3 words\n' +
    '- H2s: structured as questions or "How to..." for featured snippets\n' +
    '- Lists: use parallel structure, start items with action verbs\n' +
    '- FAQ section: natural questions people would ask Google/ChatGPT/AI assistants\n' +
    '- Keywords: mix of head terms + long-tail + question-based\n' +
    '- Slug: 3-5 words, lowercase, hyphens\n' +
    '- read_time: calculate as ceil(total_words / 200)\n\n' +
    'WRITING STYLE:\n' +
    '- tag values: ai=AI tools/models, startups=startup/funding, cases=real use cases, prompts=prompts/workflows, trends=industry trends\n' +
    '- Write as an expert journalist, not a summarizer. Add context, analysis, implications, industry perspective.\n' +
    '- Expand on ideas: don\'t just state facts, explain WHY they matter, HOW they compare to alternatives, WHAT users should do\n' +
    '- Russian: живой язык, без канцелярита. НЕ ИСПОЛЬЗУЙ: "следует отметить", "давайте рассмотрим", "в рамках", "необходимо отметить"\n' +
    '- English: clear, direct, engaging. No filler phrases. Concrete and specific.\n' +
    '- Spanish: natural, conversational, informative\n' +
    '- Every article must give the reader actionable insights they can use immediately\n\n' +
    'REMEMBER: MINIMUM 1500 WORDS PER LANGUAGE. This is the #1 priority. Write comprehensive, detailed content.';

  var response = await postJSON('https://api.openai.com/v1/chat/completions', {
    model: OPENAI_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 16000,
    temperature: 0.4
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

  // Clean UTF-8 on all string fields
  var stringFields = ['title_ru', 'title_en', 'title_es', 'desc_ru', 'desc_en', 'desc_es',
    'body_ru', 'body_en', 'body_es', 'keywords_ru', 'keywords_en', 'keywords_es', 'slug'];
  for (var s = 0; s < stringFields.length; s++) {
    if (parsed[stringFields[s]]) parsed[stringFields[s]] = cleanUTF8(parsed[stringFields[s]]);
  }

  // Sanitize HTML bodies — allow only safe tags
  var safeTags = ['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote'];
  function sanitizeBody(html) {
    if (!html) return '';
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

      // Fetch transcript
      video.transcript = await getTranscript(video.videoId);
      if (video.transcript) {
        process.stdout.write('[T:' + Math.round(video.transcript.length / 1000) + 'k] ');
      }

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

      await sleep(1500);
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

// Export for regenerate.js
module.exports = {
  getTranscript: getTranscript,
  generateArticle: generateArticle,
  cleanUTF8: cleanUTF8,
  articlePages: articlePages,
  FEED_PATH: FEED_PATH,
  ROOT: ROOT
};

// Run only when called directly
if (require.main === module) {
  main().catch(function(err) {
    console.error('Fatal: ' + err.message);
    process.exit(1);
  });
}
