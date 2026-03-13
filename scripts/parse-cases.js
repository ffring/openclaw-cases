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

// OpenAI: extract & generate detailed cases
async function extractDetailedCases(searchResults, pageContents) {
  if (searchResults.length === 0) return [];

  const context = searchResults.map((r, i) => ({
    ...r,
    pageContent: pageContents[i] || '(page content unavailable)'
  }));

  const prompt = `You are a senior tech journalist at OpenClaw Times — an AI media platform for a GENERAL audience.
Your readers are entrepreneurs, marketers, managers — NOT developers or geeks.

You are analyzing search results about real AI agent use cases (OpenClaw, Claude, GPT agents, AI automation).
For each result that describes a REAL USE CASE (skip tutorials, docs, marketing pages):

RESPOND IN VALID JSON — an array of case objects.

Each case object must have:
{
  "id": "slug-3-5-words",
  "title_en": "Clear English title, max 60 chars, keyword-first for SEO",
  "title_ru": "SEO-заголовок на русском, 50-60 символов, ключевое слово в начале",
  "desc_en": "Meta description 150-160 chars with CTA — what the reader will learn",
  "desc_ru": "Мета-описание 150-160 символов с CTA",
  "tag": "automation|coding|research|devops|productivity|marketing|finance",
  "source_url": "original URL",
  "tools_en": ["Tool1", "Tool2"],
  "tools_ru": ["Инструмент1", "Инструмент2"],
  "results_en": "Key outcome in one line (e.g. 'Saves 15 hours per week on reporting')",
  "results_ru": "Ключевой результат одной строкой (напр. 'Экономит 15 часов в неделю на отчётах')",

  "content_en": "FULL article written ENTIRELY IN ENGLISH, markdown format (see rules below)",
  "content_ru": "ПОЛНАЯ статья написанная ЦЕЛИКОМ НА РУССКОМ ЯЗЫКЕ, markdown формат (см. правила ниже)"
}

CRITICAL LANGUAGE RULES:
- content_ru MUST be written entirely in Russian. Not translated word-by-word, but written naturally in Russian.
- tools_ru — translate tool descriptions to Russian (tool names stay in English if they are product names)
- results_ru — write results in Russian
- desc_ru — write in Russian
- title_ru — write in Russian
- If you write content_ru in English, the article is REJECTED. This is the #1 quality check.

ARTICLE RULES (content_en, content_ru):

LENGTH: 800-1200 words per language. This is critical.

STRUCTURE:
- Opening hook (2-3 sentences) — why this matters to the reader's business/life
- ## What problem this solves — pain point in plain language
- ## How it works — step-by-step, explained like talking to a smart friend (no jargon)
- ## What tools are involved — brief, with context on what each tool does
- ## Real results — specific numbers, time saved, money earned, before/after
- ## Why this matters for you — practical takeaway, who should try this, how to start
- ## FAQ — 3 questions a non-technical reader would ask, with clear answers

WRITING STYLE:
- Write for entrepreneurs and managers, NOT developers
- Explain technical concepts in simple terms (e.g. "AI agent = a program that does tasks for you automatically")
- Use concrete examples and analogies from everyday business
- Every paragraph must give the reader something useful
- NO filler, NO corporate speak, NO "it's worth noting that..."
- Russian: живой разговорный язык, без канцелярита. НЕ используй: "следует отметить", "давайте рассмотрим", "в рамках", "необходимо подчеркнуть"
- English: direct, clear, engaging. Short sentences. Active voice.

SEO/GEO:
- H2s as questions or "How to..." for featured snippets
- Natural keyword usage (don't stuff)
- FAQ section with questions people would ask Google/ChatGPT
- Focus on search intent: "how to automate X", "AI for Y"

Format with markdown: ## headers, **bold**, bullet lists, > blockquotes for key insights.
DO NOT invent statistics or fake quotes — mark uncertain info with [needs verification].

Search results with page content:
${JSON.stringify(context, null, 2)}

Return JSON array. Quality over quantity — skip results without enough substance for a real article.`;

  try {
    const response = await postJSON('https://api.openai.com/v1/chat/completions', {
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 16000,
      temperature: 0.4
    }, {
      'Authorization': 'Bearer ' + OPENAI_API_KEY
    });

    if (response.error) {
      console.log(`  OpenAI error: ${response.error.message}`);
      return [];
    }

    const text = response.choices?.[0]?.message?.content || '';

    // Parse JSON — could be { cases: [...] } or [...]
    const parsed = JSON.parse(text);
    const cases = Array.isArray(parsed) ? parsed : (parsed.cases || parsed.results || []);

    return cases;
  } catch (e) {
    console.log(`  OpenAI extraction error: ${e.message}`);
    return [];
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

  // Batch AI extraction
  console.log('\nGenerating articles via OpenAI...');
  const batches = [];
  for (let i = 0; i < uniqueResults.length; i += 5) {
    batches.push({
      results: uniqueResults.slice(i, i + 5),
      contents: pageContents.slice(i, i + 5)
    });
  }

  let extractedCases = [];
  for (const batch of batches) {
    const cases = await extractDetailedCases(batch.results, batch.contents);
    extractedCases.push(...cases);
    console.log(`   +${cases.length} articles`);
    await delay(2000);
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
