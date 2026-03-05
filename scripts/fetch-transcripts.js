#!/usr/bin/env node
'use strict';

/**
 * Fetch YouTube transcripts via yt-dlp, parse VTT to plain text,
 * save to data/transcripts.json for use by regenerate.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FEED_PATH = path.join(ROOT, 'data', 'synth-feed.json');
const TRANSCRIPTS_PATH = path.join(ROOT, 'data', 'transcripts.json');
const TMP_DIR = '/tmp/synth-transcripts';

// Parse VTT file to plain text (deduplicated)
function parseVTT(vttContent) {
  var lines = vttContent.split('\n');
  var texts = [];
  var lastText = '';

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    // Skip headers, timestamps, empty lines
    if (!line || line === 'WEBVTT' || line.startsWith('Kind:') || line.startsWith('Language:') ||
        line.match(/^\d{2}:\d{2}/) || line.match(/^NOTE/)) continue;

    // Remove VTT tags like <00:00:01.234><c> etc
    var clean = line.replace(/<[^>]+>/g, '').trim();
    if (!clean || clean === lastText) continue;

    lastText = clean;
    texts.push(clean);
  }

  return texts.join(' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  // Ensure tmp dir
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  // Load feed
  var feed = JSON.parse(fs.readFileSync(FEED_PATH, 'utf8'));
  console.log('Fetching transcripts for ' + feed.articles.length + ' videos\n');

  // Load existing transcripts
  var transcripts = {};
  try {
    transcripts = JSON.parse(fs.readFileSync(TRANSCRIPTS_PATH, 'utf8'));
  } catch (e) {}

  for (var i = 0; i < feed.articles.length; i++) {
    var article = feed.articles[i];
    var videoId = article.video_id || article.id;
    if (!videoId) continue;

    var shortTitle = (article.title_en || '').slice(0, 50);
    process.stdout.write('[' + (i + 1) + '/' + feed.articles.length + '] ' + shortTitle + '... ');

    // Skip if already have transcript
    if (transcripts[videoId] && transcripts[videoId].length > 100) {
      console.log('cached (' + transcripts[videoId].length + ' chars)');
      continue;
    }

    try {
      // Download subtitles via yt-dlp (using execFileSync to avoid shell injection)
      var vttPath = path.join(TMP_DIR, videoId + '.en.vtt');
      var outTemplate = path.join(TMP_DIR, videoId);

      execFileSync('python3', [
        '-m', 'yt_dlp',
        '--write-auto-sub',
        '--sub-lang', 'en',
        '--skip-download',
        '--sub-format', 'vtt',
        '-o', outTemplate,
        'https://www.youtube.com/watch?v=' + videoId
      ], { timeout: 30000, stdio: 'pipe' });

      if (fs.existsSync(vttPath)) {
        var vttContent = fs.readFileSync(vttPath, 'utf8');
        var text = parseVTT(vttContent);
        transcripts[videoId] = text.slice(0, 15000);
        console.log(text.length + ' chars');
        fs.unlinkSync(vttPath);
      } else {
        // Try without language suffix
        var files = fs.readdirSync(TMP_DIR).filter(function(f) {
          return f.startsWith(videoId) && f.endsWith('.vtt');
        });
        if (files.length > 0) {
          var vttContent = fs.readFileSync(path.join(TMP_DIR, files[0]), 'utf8');
          var text = parseVTT(vttContent);
          transcripts[videoId] = text.slice(0, 15000);
          console.log(text.length + ' chars');
          fs.unlinkSync(path.join(TMP_DIR, files[0]));
        } else {
          transcripts[videoId] = '';
          console.log('no subtitles');
        }
      }
    } catch (e) {
      transcripts[videoId] = '';
      console.log('error: ' + (e.message || '').slice(0, 60));
    }
  }

  // Save
  fs.writeFileSync(TRANSCRIPTS_PATH, JSON.stringify(transcripts, null, 2));
  console.log('\nSaved to ' + TRANSCRIPTS_PATH);

  // Stats
  var withTranscript = Object.values(transcripts).filter(function(t) { return t.length > 100; }).length;
  console.log('With transcript: ' + withTranscript + '/' + Object.keys(transcripts).length);
}

main().catch(function(err) {
  console.error('Fatal: ' + err.message);
  process.exit(1);
});
