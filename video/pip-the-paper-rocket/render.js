// Renders scene.html frame by frame and muxes it with the voiceover.
// Usage: node render.js [--stills t1,t2,...]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FPS = 30;
const ROOT = path.resolve(__dirname, '../..');
const AUDIO = path.join(ROOT, 'audio/pip-the-paper-rocket-voiceover.mp3');
const OUT = path.join(ROOT, 'videos/pip-the-paper-rocket.mp4');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('file://' + path.join(__dirname, 'scene.html'));
  await page.evaluate(() => document.fonts.ready);
  const grab = t => page.evaluate(t => { render(t); return document.getElementById('c').toDataURL('image/jpeg', 0.92); }, t);

  const stillsArg = process.argv.indexOf('--stills');
  if (stillsArg > 0) {
    const dir = process.argv[stillsArg + 2] || '.';
    for (const t of process.argv[stillsArg + 1].split(',').map(Number)) {
      fs.writeFileSync(path.join(dir, `still-${t}.jpg`), Buffer.from((await grab(t)).split(',')[1], 'base64'));
    }
    await browser.close();
    return;
  }

  const duration = 30.04;
  const frames = Math.ceil(duration * FPS);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', AUDIO,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < frames; i++) {
    const buf = Buffer.from((await grab(i / FPS)).split(',')[1], 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', code => code ? rej(new Error('ffmpeg ' + code)) : res()));
  await browser.close();
  console.log('wrote', OUT);
})();
