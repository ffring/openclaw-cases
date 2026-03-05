#!/usr/bin/env node
'use strict';

// Generates article HTML pages from existing synth-feed.json
var articlePages = require('./article-pages');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var FEED_PATH = path.join(ROOT, 'data', 'synth-feed.json');

var feed = JSON.parse(fs.readFileSync(FEED_PATH, 'utf8'));

var articlesDir = path.join(ROOT, 'playground', 'articles');
if (!fs.existsSync(articlesDir)) fs.mkdirSync(articlesDir, { recursive: true });

var count = 0;
for (var i = 0; i < feed.articles.length; i++) {
  var a = feed.articles[i];
  if (!a.slug || !a.body_en) continue;
  var pageDir = path.join(articlesDir, a.slug);
  if (!fs.existsSync(pageDir)) fs.mkdirSync(pageDir, { recursive: true });
  var html = articlePages.generateArticlePage(a);
  fs.writeFileSync(path.join(pageDir, 'index.html'), html);
  count++;
  console.log('  ' + a.slug);
}

articlePages.generateSitemap(feed.articles, ROOT);
console.log('\nGenerated ' + count + ' article pages');
