#!/usr/bin/env node
/**
 * OpenClaw Cases Parser v2.1
 * Multi-source with FULL CONTENT extraction
 * Fetches original pages and extracts detailed case info
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Load env
require('dotenv').config({ path: path.join(process.env.HOME, '.openclaw', '.env') });

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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
      // Handle redirects
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

// Brave Search API
async function braveSearch(query, count = 10) {
  if (!BRAVE_API_KEY) {
    console.log('  ⚠️ No BRAVE_API_KEY');
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
      console.log(`  ⚠️ Brave API ${res.status}`);
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
    console.log(`  ❌ Brave error: ${e.message}`);
    return [];
  }
}

// Fetch full page content
async function fetchFullContent(url) {
  try {
    const res = await httpRequest(url);
    if (!res.ok) return null;
    
    let text = res.data;
    
    // Strip scripts, styles, navigation
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
    
    // Limit to 6KB for API (keep it small to avoid timeouts)
    return text.slice(0, 6000);
  } catch (e) {
    return null;
  }
}

// Claude AI extraction with FULL DETAILS
async function extractDetailedCases(searchResults, pageContents) {
  if (!ANTHROPIC_API_KEY || searchResults.length === 0) return [];
  
  // Build context with page contents
  const context = searchResults.map((r, i) => ({
    ...r,
    pageContent: pageContents[i] || '(page content unavailable)'
  }));
  
  const prompt = `You are extracting OpenClaw (AI agent) use cases from search results WITH FULL DETAILS.

For each result that describes a REAL USE CASE (not tutorials, not general articles):

Extract these fields:
- id: slug (e.g. "tiktok-marketing-agent")
- title_en: clear English title (max 60 chars)
- title_ru: Russian translation
- desc_en: 1-2 sentence summary (max 200 chars)
- desc_ru: Russian translation
- tag: one of [automation, coding, research, devops, productivity, marketing, finance]
- source_url: original URL

DETAILED CONTENT (this is the key part!):
- content_en: Full detailed write-up in English (3-5 paragraphs). Include:
  * What the user built/automated
  * How it works step by step
  * What tools/integrations they used
  * Results/outcomes achieved
  * Any code snippets or configs mentioned
  Format with markdown: ## headers, **bold**, \`code\`, bullet lists

- content_ru: Full Russian translation of content_en

- tools: array of tools mentioned (e.g. ["OpenClaw", "Gmail", "Notion", "Zapier"])
- results: key metrics/outcomes (e.g. "Saved 20 hours/week", "$45k work in 20 min")

Search results with page content:
${JSON.stringify(context, null, 2)}

Return JSON array of detailed cases. Focus on QUALITY over quantity - only extract cases with real substance.
If a result doesn't have enough detail for a full case, skip it.`;

  try {
    const res = await httpRequest('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!res.ok) {
      console.log(`  ⚠️ Claude API ${res.status}`);
      return [];
    }

    const data = res.json();
    const text = data.content?.[0]?.text || '';
    
    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.log(`  ❌ Claude error: ${e.message}`);
    return [];
  }
}

// Search queries
const SEARCH_QUERIES = [
  // Twitter/X - specific use cases
  'OpenClaw "I built" site:x.com',
  'OpenClaw automated my site:x.com',
  'OpenClaw workflow site:x.com',
  'my OpenClaw agent site:x.com',
  
  // Reddit
  'OpenClaw site:reddit.com/r/AI_Agents',
  'OpenClaw workflow site:reddit.com',
  
  // Blogs & Medium
  'OpenClaw use case site:medium.com',
  'OpenClaw tutorial workflow',
  'OpenClaw automation example',
  
  // General
  '"OpenClaw" real example built',
  '"OpenClaw" saved hours automated',
];

// Delay helper
const delay = ms => new Promise(r => setTimeout(r, ms));

// Main
async function main() {
  console.log('🦞 OpenClaw Cases Parser v2.1 (Full Content)');
  console.log('=============================================\n');
  
  const allResults = [];
  
  // Search all sources
  for (const query of SEARCH_QUERIES) {
    console.log(`🔍 "${query}"`);
    
    const results = await braveSearch(query, 8);
    const newResults = results.filter(r => !seenUrls.has(r.url));
    
    if (newResults.length > 0) {
      console.log(`   +${newResults.length} new`);
      allResults.push(...newResults);
      newResults.forEach(r => seenUrls.add(r.url));
    }
    
    await delay(1500);
  }
  
  console.log(`\n📊 Total: ${allResults.length} new results`);
  
  if (allResults.length === 0) {
    console.log('✅ No new results.');
    return;
  }
  
  // Deduplicate
  const uniqueResults = [...new Map(allResults.map(r => [r.url, r])).values()];
  console.log(`📊 Unique: ${uniqueResults.length}`);
  
  // Fetch full page content for each result
  console.log('\n📄 Fetching page contents...');
  const pageContents = [];
  for (const r of uniqueResults) {
    process.stdout.write('.');
    const content = await fetchFullContent(r.url);
    pageContents.push(content);
    await delay(500);
  }
  console.log(' done');
  
  // Batch AI extraction with full content
  console.log('\n🤖 AI extracting detailed cases...');
  const batches = [];
  for (let i = 0; i < uniqueResults.length; i += 5) {
    batches.push({
      results: uniqueResults.slice(i, i + 10),
      contents: pageContents.slice(i, i + 10)
    });
  }
  
  let extractedCases = [];
  for (const batch of batches) {
    const cases = await extractDetailedCases(batch.results, batch.contents);
    extractedCases.push(...cases);
    console.log(`   +${cases.length} detailed cases`);
    await delay(3000);
  }
  
  console.log(`\n📦 Total extracted: ${extractedCases.length} detailed cases`);
  
  if (extractedCases.length === 0) {
    console.log('✅ No valid detailed cases.');
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
    tools: c.tools || [],
    results: c.results || '',
    tag: c.tag || 'productivity',
    source: extractSourceName(c.source_url),
    source_url: c.source_url,
    points: Math.floor(Math.random() * 200) + 100,
    date: today
  }));
  
  // Merge with existing
  const existingIds = new Set(existingData.cases.map(c => c.id));
  const newCases = processedCases.filter(c => !existingIds.has(c.id));
  
  console.log(`📦 New unique: ${newCases.length}`);
  
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
  
  console.log('\n💾 Saved cases.json');
  console.log(`   Total: ${finalCases.length}, New: ${newCases.length}`);
  
  // Regenerate site
  console.log('\n🔨 Regenerating HTML...');
  try {
    require('../generate.js');
    console.log('✅ Site regenerated!');
  } catch (e) {
    console.log('⚠️ Generate error:', e.message);
  }
  
  console.log('\n🎉 Done!');
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
  console.error('❌ Fatal:', e);
  process.exit(1);
});
