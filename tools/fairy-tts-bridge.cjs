#!/usr/bin/env node
'use strict';
/*
 * Fairy TTS bridge: a GPT-SoVITS-compatible `/tts` endpoint on 127.0.0.1:9880,
 * backed by Microsoft Edge TTS instead of a local SoVITS model.
 *
 * Why: dsh-fairy-voice hard-codes http://127.0.0.1:9880/tts (+ /docs) and sends
 * a GPT-SoVITS v2 request body, expecting a streaming raw PCM reply at 32 kHz mono.
 * The upstream suite expects the operator to run GPT-SoVITS plus a private
 * reference voice (fairy_ref.wav/.txt), neither of which ships with the repo.
 * This bridge keeps the contract and swaps the engine, so the voice UI works
 * with no model download: Edge TTS (mp3) -> ffmpeg -> s16le 32 kHz mono.
 *
 * Env:
 *   FAIRY_TTS_PORT          default 9880
 *   FAIRY_TTS_VOICE         default zh-CN-XiaoxiaoNeural
 *   FAIRY_TTS_SAMPLE_RATE   default 32000 (must match the client's PCM_SAMPLE_RATE)
 *   FAIRY_TTS_FFMPEG        default "ffmpeg"
 *   FAIRY_TTS_MAX_CHARS     default 1200
 *
 *   GET  /docs      health probe used by the plugin
 *   GET  /health    same shape
 *   POST /tts       GPT-SoVITS body { text, ... } -> audio/octet-stream PCM
 *   POST /tts/stream same
 */
const http = require('node:http');
const { spawn } = require('node:child_process');

const PORT = Number(process.env.FAIRY_TTS_PORT || 9880);
const VOICE = process.env.FAIRY_TTS_VOICE || 'zh-CN-XiaoxiaoNeural';
const PCM_RATE = Number(process.env.FAIRY_TTS_SAMPLE_RATE || 32000);
const FFMPEG = process.env.FAIRY_TTS_FFMPEG || 'ffmpeg';
const MAX_CHARS = Number(process.env.FAIRY_TTS_MAX_CHARS || 1200);
const TTS_MODULE = process.env.FAIRY_TTS_MODULE || 'msedge-tts';

let MsEdgeTTS;
let OUTPUT_FORMAT;
try {
  ({ MsEdgeTTS, OUTPUT_FORMAT } = require(TTS_MODULE));
} catch (error) {
  console.error(`[fairy-tts] cannot load ${TTS_MODULE}: ${error.message}`);
  process.exit(1);
}

function log(...args) { console.log(new Date().toISOString(), '[fairy-tts]', ...args); }

async function synthesizeMp3(text) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text);
  const chunks = [];
  await new Promise((resolve, reject) => {
    audioStream.on('data', (c) => chunks.push(c));
    audioStream.on('end', resolve);
    audioStream.on('error', reject);
  });
  try { tts.close(); } catch { /* already closed */ }
  const mp3 = Buffer.concat(chunks);
  if (!mp3.length) throw new Error('edge-tts returned no audio');
  return mp3;
}

function mp3ToPcm(mp3) {
  return new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG, [
      '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
      '-f', 's16le', '-ac', '1', '-ar', String(PCM_RATE), 'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    ff.stdout.on('data', (c) => out.push(c));
    ff.stderr.on('data', (c) => { err += c.toString('utf8'); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(0, 200)}`));
    });
    ff.stdin.on('error', () => { /* ffmpeg closed early */ });
    ff.stdin.end(mp3);
  });
}

function readBody(req, limitBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) { reject(new Error('request body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function health(res) {
  const body = JSON.stringify({
    ok: true,
    service: 'fairy-tts-bridge',
    backend: 'edge-tts',
    voice: VOICE,
    sampleRate: PCM_RATE,
    format: 's16le mono',
  });
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (req.method === 'GET' && (url === '/docs' || url === '/health' || url === '/')) {
    health(res);
    return;
  }
  if (req.method !== 'POST' || (url !== '/tts' && url !== '/tts/stream')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
    return;
  }

  const started = Date.now();
  let body;
  try { body = JSON.parse(await readBody(req) || '{}'); }
  catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: `bad request: ${error.message}` }));
    return;
  }

  let text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'text required' })); return; }
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);

  try {
    const mp3 = await synthesizeMp3(text);
    const pcm = await mp3ToPcm(mp3);
    log(`synth ${text.length} chars -> ${pcm.length} PCM bytes in ${Date.now() - started} ms`);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': pcm.length,
      'Cache-Control': 'no-store',
      'X-Fairy-Tts-Backend': 'edge-tts',
      'X-Fairy-Tts-Sample-Rate': String(PCM_RATE),
    });
    // Chunked write so playback can start before the whole utterance is sent.
    const CHUNK = 16 * 1024;
    for (let offset = 0; offset < pcm.length; offset += CHUNK) {
      if (res.writableEnded || res.destroyed) return;
      res.write(pcm.subarray(offset, Math.min(offset + CHUNK, pcm.length)));
    }
    res.end();
  } catch (error) {
    log('synth failed:', error.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    } else {
      try { res.end(); } catch { /* already gone */ }
    }
  }
});

server.on('error', (error) => { console.error('[fairy-tts] server error:', error.message); process.exit(1); });
server.listen(PORT, '127.0.0.1', () => log(`listening on http://127.0.0.1:${PORT} (voice=${VOICE}, pcm=${PCM_RATE}Hz s16le mono)`));
