#!/usr/bin/env node
/**
 * OpenClaw Cases Parser v3.0
 * Multi-source search → OpenAI article generation
 * SEO/GEO optimized, written for regular people
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Load env: GitHub Actions sets env vars directly; local dev uses ~/.openclaw/.env
const envPath = path.join(process.env.HOME || '', '.openclaw', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-nano';

if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY not set. Set in env or ~/.openclaw/.env');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'cases.json');
const SEEN_FILE = path.join(DATA_DIR, 'seen-urls.json');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Load existing data
let existingData = { cases: [], updated: null, stats: {} };
let seenUrls = new Set();

try {
  existingData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch (e) {}

try {
  seenUrls = new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')));
} catch (e) {}

// HTTP helper with redirects
function httpRequest(url, options = {}, redirects = 3) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;

    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': options.headers?.Accept || 'text/html,application/json',
        ...options.headers
      },
      timeout: 90000
    };

    const req = lib.request(opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        const newUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : `${urlObj.protocol}//${urlObj.host}${res.headers.location}`;
        return resolve(httpRequest(newUrl, options, redirects - 1));
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({
        ok: res.statusCode < 400,
        status: res.statusCode,
        data,
        json: () => JSON.parse(data)
      }));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// HTTP POST JSON (for OpenAI)
function postJSON(url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = Buffer.from(JSON.stringify(body), 'utf8');
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': data.length,
        ...headers
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const resp = Buffer.concat(chunks).toString('utf8');
        try { resolve(JSON.parse(resp)); }
        catch { reject(new Error('Invalid JSON: ' + resp.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Brave Search API
async function braveSearch(query, count = 10) {
  if (!BRAVE_API_KEY) {
    console.log('  No BRAVE_API_KEY — skipping search');
    return [];
  }

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;

  try {
    const res = await httpRequest(url, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY
      }
    });

    if (!res.ok) {
      console.log(`  Brave API ${res.status}`);
      return [];
    }

    const data = res.json();
    return (data.web?.results || []).map(r => ({
      title: r.title,
      url: r.url,
      description: r.description,
      source: new URL(r.url).hostname
    }));
  } catch (e) {
    console.log(`  Brave error: ${e.message}`);
    return [];
  }
}

// Fetch full page content
async function fetchFullContent(url) {
  try {
    const res = await httpRequest(url);
    if (!res.ok) return null;

    let text = res.data;

    text = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

    return text.slice(0, 8000);
  } catch (e) {
    return null;
  }
}

// OpenAI: generate ONE detailed article per source
async function generateArticle(source, pageContent) {
  const prompt = `You are a senior tech journalist writing an in-depth longread article for OpenClaw Times.
Your audience: entrepreneurs, marketers, business owners in Russia/CIS. NOT developers.

Analyze this source about a real AI agent use case. If it's NOT a real use case (just a tutorial, docs, or marketing page), return {"skip": true}.

Source: ${source.title}
URL: ${source.url}
Description: ${source.description}

Page content:
${(pageContent || '(unavailable)').slice(0, 6000)}

RESPOND IN VALID JSON (UTF-8). Return a single case object:
{
  "id": "slug-3-5-words",
  "title_en": "SEO title in English (50-70 chars, keyword first)",
  "title_ru": "SEO-заголовок на русском (50-70 символов, ключевое слово в начале)",
  "desc_en": "Meta description 150-160 chars with CTA",
  "desc_ru": "Мета-описание 150-160 символов с CTA на русском",
  "tag": "automation|coding|research|devops|productivity|marketing|finance",
  "source_url": "${source.url}",
  "tools_en": ["Tool1", "Tool2"],
  "tools_ru": ["Описание инструмента1 на русском", "Описание инструмента2 на русском"],
  "results_en": "Key outcome (e.g. 'Saves 15 hours/week on reporting')",
  "results_ru": "Ключевой результат на русском (напр. 'Экономит 15 часов в неделю')",
  "content_en": "FULL longread article in ENGLISH (see structure below)",
  "content_ru": "ПОЛНАЯ статья-лонгрид ЦЕЛИКОМ НА РУССКОМ ЯЗЫКЕ (см. структуру ниже)"
}

=== ARTICLE STRUCTURE (both content_en and content_ru) ===

Write a COMPLETE article. Aim for 1500+ words per language. This is a SINGLE article — give it your full attention and depth.

1. INTRO (2-3 paragraphs, 150-200 words):
   - Hook: why this matters for the reader's business RIGHT NOW
   - Context: what problem exists, what pain point
   - Promise: what the reader will learn

2. Five to seven ## H2 sections (200-350 words each):
   - Each section: 2-3 detailed paragraphs
   - Specific details, numbers, examples from the source
   - At least 1 bullet list per 2 sections
   - At least 1 blockquote (>) per article with a key insight
   - H2s phrased as questions or "How to..." for SEO

3. ## Frequently Asked Questions (FAQ):
   - 4-5 Q&A pairs
   - Questions a non-technical person would ask
   - Each answer: 2-3 sentences minimum

4. CONCLUSION (1-2 paragraphs):
   - Summary of key takeaways
   - Concrete next step the reader can take TODAY

=== WRITING STYLE ===

FOR content_ru (CRITICAL — PRIMARY language):
- Write ENTIRELY in Russian. Every word must be Russian (except product names).
- Живой, разговорный язык. Как будто объясняешь другу за кофе.
- ЗАПРЕЩЕНО: "следует отметить", "давайте рассмотрим", "в рамках", "необходимо подчеркнуть", "данный", "является", "осуществлять"
- Объясняй технические термины простым языком
- Конкретные примеры и аналогии из бизнеса
- Каждый абзац — что-то полезное для читателя

FOR content_en:
- Direct, clear, engaging. Short sentences. Active voice.
- No corporate speak, no filler.

=== SEO/GEO ===
- Primary keyword in title (first 3 words)
- H2s as questions for featured snippets
- FAQ with natural questions people ask AI assistants

=== QUALITY ===
- If content_ru contains English sentences — REWRITE in Russian
- DO NOT invent statistics or quotes — use only what's in the source
- Make it LONG and DETAILED. Short articles are useless.

Format: ## headers, **bold**, - bullet lists, > blockquotes`;

  try {
    const response = await postJSON('https://api.openai.com/v1/chat/completions', {
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 16000,
      temperature: 0.5
    }, {
      'Authorization': 'Bearer ' + OPENAI_API_KEY
    });

    if (response.error) {
      console.log(`  OpenAI error: ${response.error.message}`);
      return null;
    }

    const text = response.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(text);

    if (parsed.skip) return null;
    if (!parsed.content_ru || parsed.content_ru.length < 500) return null;

    return parsed;
  } catch (e) {
    console.log(`  Article generation error: ${e.message}`);
    return null;
  }
}

// Search queries — broadened beyond just "OpenClaw"
const SEARCH_QUERIES = [
  // OpenClaw specific
  'OpenClaw "I built" OR "I automated" site:x.com',
  'OpenClaw workflow automation site:reddit.com',

  // AI agents general — real use cases
  'AI agent automated my business 2025 2026',
  'Claude agent workflow real results',
  'GPT agent saved hours automation case study',
  '"AI agent" "use case" business results 2025',

  // Platform-specific
  '"AI agent" automation site:reddit.com/r/AI_Agents',
  '"AI agent" "saved me" OR "saved hours" site:x.com',
  'AI automation case study small business',

  // Industry specific
  'AI agent marketing automation real example',
  'AI agent customer support automated results',
];

const delay = ms => new Promise(r => setTimeout(r, ms));

// Main
async function main() {
  console.log('OpenClaw Cases Parser v3.0 (OpenAI + SEO/GEO)');
  console.log('Model: ' + OPENAI_MODEL);
  console.log('='.repeat(50) + '\n');

  const allResults = [];

  for (const query of SEARCH_QUERIES) {
    console.log(`Search: "${query}"`);

    const results = await braveSearch(query, 8);
    const newResults = results.filter(r => !seenUrls.has(r.url));

    if (newResults.length > 0) {
      console.log(`   +${newResults.length} new`);
      allResults.push(...newResults);
      newResults.forEach(r => seenUrls.add(r.url));
    }

    await delay(1500);
  }

  console.log(`\nTotal: ${allResults.length} new results`);

  if (allResults.length === 0) {
    console.log('No new results. Saving seen URLs.');
    fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenUrls], null, 2));
    return;
  }

  // Deduplicate
  const uniqueResults = [...new Map(allResults.map(r => [r.url, r])).values()];
  console.log(`Unique: ${uniqueResults.length}`);

  // Fetch full page content
  console.log('\nFetching page contents...');
  const pageContents = [];
  for (const r of uniqueResults) {
    process.stdout.write('.');
    const content = await fetchFullContent(r.url);
    pageContents.push(content);
    await delay(500);
  }
  console.log(' done');

  // Generate ONE article per source (max quality)
  console.log('\nGenerating articles via OpenAI (one per source)...');
  let extractedCases = [];
  for (let i = 0; i < uniqueResults.length; i++) {
    const r = uniqueResults[i];
    process.stdout.write(`  [${i + 1}/${uniqueResults.length}] ${r.title.slice(0, 50)}... `);
    const article = await generateArticle(r, pageContents[i]);
    if (article) {
      extractedCases.push(article);
      const words = (article.content_ru || '').split(/\s+/).length;
      console.log(`OK (${words} words RU)`);
    } else {
      console.log('skipped');
    }
    await delay(1000);
  }

  console.log(`\nTotal extracted: ${extractedCases.length} articles`);

  if (extractedCases.length === 0) {
    console.log('No valid cases extracted.');
    fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenUrls], null, 2));
    return;
  }

  // Process cases
  const today = new Date().toISOString().split('T')[0];
  const processedCases = extractedCases.map((c, i) => ({
    id: c.id || `case-${Date.now()}-${i}`,
    rank: i + 1,
    title_en: c.title_en || 'Untitled',
    title_ru: c.title_ru || c.title_en || 'Без названия',
    desc_en: (c.desc_en || '').slice(0, 200),
    desc_ru: (c.desc_ru || c.desc_en || '').slice(0, 200),
    content_en: c.content_en || '',
    content_ru: c.content_ru || c.content_en || '',
    tools_en: c.tools_en || c.tools || [],
    tools_ru: c.tools_ru || c.tools || [],
    results_en: c.results_en || c.results || '',
    results_ru: c.results_ru || c.results || '',
    tag: c.tag || 'productivity',
    source: extractSourceName(c.source_url),
    source_url: c.source_url,
    points: Math.floor(Math.random() * 200) + 100,
    date: today
  }));

  // Merge with existing
  const existingIds = new Set(existingData.cases.map(c => c.id));
  const newCases = processedCases.filter(c => !existingIds.has(c.id));

  console.log(`New unique: ${newCases.length}`);

  const allCases = [...newCases, ...existingData.cases];
  allCases.forEach((c, i) => c.rank = i + 1);
  const finalCases = allCases.slice(0, 100);

  // Stats
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const newData = {
    updated: new Date().toISOString(),
    stats: {
      total: finalCases.length,
      today: finalCases.filter(c => c.date === today).length,
      week: finalCases.filter(c => c.date >= weekAgo).length
    },
    cases: finalCases
  };

  // Save
  fs.writeFileSync(DATA_FILE, JSON.stringify(newData, null, 2));
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenUrls], null, 2));

  console.log('\nSaved cases.json');
  console.log(`   Total: ${finalCases.length}, New: ${newCases.length}`);

  // Regenerate site HTML
  console.log('\nRegenerating HTML...');
  try {
    require('../generate.js');
    console.log('Site regenerated!');
  } catch (e) {
    console.log('Generate error:', e.message);
  }

  console.log('\nDone!');
}

function extractSourceName(url) {
  if (!url) return 'Web';
  if (url.includes('x.com') || url.includes('twitter.com')) return 'Twitter';
  if (url.includes('reddit.com')) return 'Reddit';
  if (url.includes('youtube.com')) return 'YouTube';
  if (url.includes('medium.com')) return 'Medium';
  if (url.includes('github.com')) return 'GitHub';
  return 'Web';
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
