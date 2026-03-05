#!/usr/bin/env node
'use strict';

/**
 * Regenerate all existing articles with new longread prompt + YouTube transcriptions.
 * Reads synth-feed.json, fetches transcripts, calls OpenAI, overwrites articles.
 */

const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(process.env.HOME || '', '.openclaw', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY not set');
  process.exit(1);
}

// Import shared functions from parse-youtube
const parser = require('./parse-youtube');
const articlePages = parser.articlePages;

const FEED_PATH = parser.FEED_PATH;
const ROOT = parser.ROOT;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('Synth Article Regenerator');
  console.log('Model: ' + (process.env.OPENAI_MODEL || 'gpt-4.1-nano'));

  // Load feed
  var feed;
  try {
    feed = JSON.parse(fs.readFileSync(FEED_PATH, 'utf8'));
  } catch (e) {
    console.error('Cannot read ' + FEED_PATH);
    process.exit(1);
  }

  console.log('Articles to regenerate: ' + feed.articles.length + '\n');

  var regenerated = 0;
  var failed = 0;

  for (var i = 0; i < feed.articles.length; i++) {
    var article = feed.articles[i];
    var videoId = article.video_id || article.id;

    if (!videoId) {
      console.log('  SKIP: no video_id for ' + (article.slug || 'unknown'));
      continue;
    }

    var shortTitle = (article.title_en || article.title_ru || '').slice(0, 55);
    process.stdout.write('  [' + (i + 1) + '/' + feed.articles.length + '] ' + shortTitle + ' ');

    try {
      // Fetch transcript
      var transcript = await parser.getTranscript(videoId);
      if (transcript) {
        process.stdout.write('[T:' + Math.round(transcript.length / 1000) + 'k] ');
      } else {
        process.stdout.write('[no-transcript] ');
      }

      // Build video object for generateArticle
      var video = {
        videoId: videoId,
        title: article.title_en || article.title_ru || '',
        description: article.desc_en || article.desc_ru || '',
        channelName: article.channel || 'Unknown',
        defaultTag: article.tag || 'trends',
        transcript: transcript,
        url: article.source_url || 'https://www.youtube.com/watch?v=' + videoId
      };

      var result = await parser.generateArticle(video);

      // Update article in-place, preserving metadata
      article.title_ru = result.title_ru;
      article.title_en = result.title_en;
      article.title_es = result.title_es || result.title_en;
      article.desc_ru = result.desc_ru;
      article.desc_en = result.desc_en;
      article.desc_es = result.desc_es || result.desc_en;
      article.body_ru = result.body_ru;
      article.body_en = result.body_en;
      article.body_es = result.body_es || result.body_en;
      article.keywords_ru = result.keywords_ru || '';
      article.keywords_en = result.keywords_en || '';
      article.keywords_es = result.keywords_es || '';
      article.tag = result.tag;
      article.read_time = result.read_time || 7;
      article.slug = result.slug || article.slug;

      regenerated++;
      console.log('OK');

      // Save after each article (in case of crash)
      feed.updated = new Date().toISOString();
      fs.writeFileSync(FEED_PATH, JSON.stringify(feed, null, 2));

      await sleep(2000); // Longer pause for rate limits
    } catch (err) {
      failed++;
      console.log('FAIL: ' + err.message);
    }
  }

  // Regenerate HTML pages
  console.log('\nRegenerating article pages...');
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

  // Regenerate sitemap
  articlePages.generateSitemap(feed.articles, ROOT);

  console.log('Generated ' + pagesGenerated + ' article pages');
  console.log('\nDone! Regenerated: ' + regenerated + ', Failed: ' + failed);
}

main().catch(function(err) {
  console.error('Fatal: ' + err.message);
  process.exit(1);
});
