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
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
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
  const prompt = 'You are a tech journalist for Synth, a curated AI media platform.\n' +
    'Based on this YouTube video, write a short article for our news feed.\n\n' +
    'VIDEO:\n' +
    'Title: ' + video.title + '\n' +
    'Channel: ' + video.channelName + '\n' +
    'Description: ' + video.description.slice(0, 1500) + '\n\n' +
    'RESPOND IN VALID JSON:\n' +
    '{\n' +
    '  "title_ru": "Цепляющий заголовок на русском (макс 80 символов)",\n' +
    '  "title_en": "Catchy English title (max 80 chars)",\n' +
    '  "title_es": "Título en español (max 80 chars)",\n' +
    '  "desc_ru": "1-2 предложения на русском (макс 200 символов)",\n' +
    '  "desc_en": "1-2 sentences in English (max 200 chars)",\n' +
    '  "desc_es": "1-2 frases en español (max 200 chars)",\n' +
    '  "tag": "one of: ai, startups, cases, prompts, trends"\n' +
    '}\n\n' +
    'Rules:\n' +
    '- Title: informative and catchy, NO clickbait\n' +
    '- Description: key insight or takeaway\n' +
    '- tag: ai=AI tools/models, startups=startup news/funding, cases=real use cases, prompts=prompts/workflows, trends=industry trends\n' +
    '- Write naturally, no corporate speak\n' +
    '- Russian: без канцелярита, живым языком';

  const response = await postJSON('https://api.openai.com/v1/chat/completions', {
    model: OPENAI_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 500,
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
  var required = ['title_ru', 'title_en', 'desc_ru', 'desc_en', 'tag'];
  for (var i = 0; i < required.length; i++) {
    if (!parsed[required[i]]) throw new Error('Missing: ' + required[i]);
  }

  var validTags = ['ai', 'startups', 'cases', 'prompts', 'trends'];
  if (validTags.indexOf(parsed.tag) === -1) {
    parsed.tag = video.defaultTag || 'trends';
  }

  return parsed;
}

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
        title_ru: article.title_ru,
        title_en: article.title_en,
        title_es: article.title_es || article.title_en,
        desc_ru: article.desc_ru,
        desc_en: article.desc_en,
        desc_es: article.desc_es || article.desc_en,
        tag: article.tag,
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

  // Save
  fs.writeFileSync(FEED_PATH, JSON.stringify(feed, null, 2));
  fs.writeFileSync(SEEN_PATH, JSON.stringify(Array.from(seenSet), null, 2));

  console.log('\nDone! +' + newArticles.length + ' articles (' + feed.articles.length + ' total)');
}

main().catch(function(err) {
  console.error('Fatal: ' + err.message);
  process.exit(1);
});
