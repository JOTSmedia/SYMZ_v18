(() => {
  const hero = document.getElementById('hero'), texture = document.querySelector('.hero-texture');
  const canvas = document.getElementById('heroPrint'), surface = document.getElementById('heroPaperSurface');
  const headSource = window.symzPrintHead;
  if (!hero || !texture || !canvas || !surface || !headSource) return;
  const ctx = canvas.getContext('2d'), output = surface.getContext('2d');
  if (!ctx || !output) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const paper = new Image(), base = document.createElement('canvas'), mask = document.createElement('canvas');
  const baseCtx = base.getContext('2d'), maskCtx = mask.getContext('2d');
  const printTime = 1250, rows = 24;
  const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
  let width = 0, height = 0, density = 1, loaded = false, visible = false, request = 0;
  let elapsed = 0, last = 0, paperPainted = -Infinity, resizeTimer = 0, awaitingIntro = false, complete = false;

  function paintBackground(time) {
    const progress = Math.max(0, Math.min(1, time / printTime)), finished = progress === 1;
    hero.style.setProperty('--hero-print-bg', finished ? '#fff' : '#000');
    hero.style.setProperty('--hero-print-ink', finished ? '#000' : '#fff');
    hero.toggleAttribute('data-print-complete', finished);
    canvas.dataset.backgroundProgress = progress.toFixed(4);
  }

  function position(time) {
    const progress = Math.max(0, Math.min(1, time / printTime));
    const line = Math.min(rows - 1, Math.floor(progress * rows));
    const edge = Math.min(24, width * .06);
    return { x: edge + (width - 2 * edge) * (.5 + .5 * Math.cos(Math.PI * progress * rows)), y: height * progress, line, progress: progress * rows - line };
  }
  function rebuild() {
    const rect = canvas.getBoundingClientRect(); width = rect.width; height = rect.height;
    if (!width || !height || !loaded) return;
    density = Math.min(devicePixelRatio || 1, 1.25);
    for (const target of [canvas, surface, base, mask]) { target.width = Math.round(width * density); target.height = Math.round(height * density); }
    const scale = Math.max(width / paper.naturalWidth, height / paper.naturalHeight);
    baseCtx.setTransform(density, 0, 0, density, 0, 0); baseCtx.clearRect(0, 0, width, height);
    baseCtx.globalAlpha = .72 * .88;
    baseCtx.drawImage(paper, (width - paper.naturalWidth * scale) / 2, (height - paper.naturalHeight * scale) / 2, paper.naturalWidth * scale, paper.naturalHeight * scale);
    baseCtx.globalAlpha = 1;
    // Keep the lettering on a quieter part of the printed material.
    const wash = width < 761 ? baseCtx.createLinearGradient(0, 0, 0, height) : baseCtx.createLinearGradient(0, 0, width, 0);
    wash.addColorStop(0, 'rgba(255,255,255,.08)');wash.addColorStop(width < 761 ? .38 : .43, 'rgba(255,255,255,.15)');wash.addColorStop(width < 761 ? .68 : .7, '#fff');wash.addColorStop(1, '#fff');
    baseCtx.globalCompositeOperation = 'destination-in';baseCtx.fillStyle = wash;baseCtx.fillRect(0, 0, width, height);baseCtx.globalCompositeOperation = 'source-over';
    // White material and texture share one mask; untouched areas stay transparent over black.
    baseCtx.globalCompositeOperation = 'destination-over';baseCtx.fillStyle = '#fff';baseCtx.fillRect(0, 0, width, height);baseCtx.globalCompositeOperation = 'source-over';
    paperPainted = -Infinity; draw(reduced.matches || complete ? printTime : elapsed, true); start();
  }
  function reveal(time) {
    maskCtx.setTransform(density, 0, 0, density, 0, 0);maskCtx.clearRect(0, 0, width, height);
    maskCtx.fillStyle = '#fff';
    if (time >= printTime) maskCtx.fillRect(0, 0, width, height);
    else {
      const tip = position(time), rowHeight = height / rows, top = tip.line * rowHeight;
      maskCtx.fillRect(0, 0, width, top + .5);
      const edge = Math.min(24, width * .06);
      if (tip.line % 2 === 0) {
        const boundary = Math.max(0, tip.x - edge);
        maskCtx.fillRect(boundary, top, width - boundary, rowHeight + .5);
      } else maskCtx.fillRect(0, top, Math.min(width, tip.x + edge), rowHeight + .5);
    }
    output.setTransform(1, 0, 0, 1, 0, 0);output.clearRect(0, 0, surface.width, surface.height);
    output.drawImage(base, 0, 0);output.globalCompositeOperation = 'destination-in';output.drawImage(mask, 0, 0);output.globalCompositeOperation = 'source-over';
    canvas.dataset.textureProgress = Math.min(1, time / printTime).toFixed(4);
  }
  function draw(time, force = false) {
    if (!loaded || !width || !height) return;
    const duration = reduced.matches || complete ? printTime : Math.min(printTime, time);
    paintBackground(duration);
    const tip = position(duration);
    ctx.setTransform(density, 0, 0, density, 0, 0);ctx.clearRect(0, 0, width, height);
    const head = headSource.heads[50];
    if (head) {
      const [x, y, w, h, anchorX, anchorY] = headSource.level.head, scale = (width < 600 ? 38 : 46) / w;
      window.symzIntro?.heroWriter(head, tip.x + (x - anchorX) * scale, tip.y + (y - anchorY) * scale, w * scale, h * scale, ctx, canvas);
      if (!window.symzIntro || window.symzIntro.finished) {
        const fade = reduced.matches || duration >= printTime ? 0 : 1 - smooth((duration - printTime + 160) / 160);
        if (window.symzIntro) window.symzIntro.writer.style.opacity = String(.6 * fade);
        if (fade > 0) {
          ctx.globalAlpha = .2 * fade;ctx.strokeStyle = '#626970';ctx.lineWidth = 1;
          ctx.beginPath();ctx.moveTo(tip.x + headSource.level.tube[0] * scale, tip.y + headSource.level.tube[1] * scale);
          ctx.bezierCurveTo(tip.x - 18, tip.y - 110, tip.x + 65, -30, width * .8, -30);ctx.stroke();ctx.globalAlpha = 1;
        }
      }
    }
    if (window.symzIntro && !window.symzIntro.finished) return;
    if (force || time - paperPainted >= 1000 / 30 || duration >= printTime) { reveal(duration);paperPainted = time; }
    canvas.classList.add('is-ready');canvas.dataset.printState = reduced.matches ? 'static' : duration >= printTime ? 'complete' : 'printing';
    canvas.dataset.progress = Math.min(1, duration / printTime).toFixed(4);canvas.dataset.nozzleX = tip.x.toFixed(2);canvas.dataset.nozzleY = tip.y.toFixed(2);
    canvas.dataset.duration = String(printTime);canvas.dataset.printedLines = String(Math.min(rows, tip.line + 1));canvas.dataset.totalLines = String(rows);canvas.dataset.totalWriterDuration = '2300';canvas.dataset.textPaths = '0';canvas.dataset.avatarPaths = '0';
  }
  function stop() { cancelAnimationFrame(request);request = 0;last = 0;if (!complete && !reduced.matches) canvas.dataset.printState = 'paused'; }
  function frame(now) {
    request = 0;if (!visible || document.hidden) { last = 0;return; }
    if (last) elapsed += now - last;last = now;draw(elapsed);
    if (elapsed >= printTime) { complete = true;canvas.dataset.printState = 'complete';return; }
    request = requestAnimationFrame(frame);
  }
  function start() {
    stop();if (!visible || !loaded || !width || document.hidden) return;
    draw(reduced.matches || complete ? printTime : elapsed, true);
    if (window.symzIntro && !window.symzIntro.finished) {
      if (!awaitingIntro) { awaitingIntro = true;window.symzIntro.ready.then(() => { awaitingIntro = false;start(); }); }
      return;
    }
    if (reduced.matches || complete) return;
    request = requestAnimationFrame(frame);
  }
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting;start(); }).observe(hero);
  new ResizeObserver(() => { clearTimeout(resizeTimer);resizeTimer = setTimeout(rebuild, 80); }).observe(canvas);
  document.addEventListener('visibilitychange', start);reduced.addEventListener('change', start);
  window.addEventListener('symz-printer-head', () => { if (loaded && visible && reduced.matches) draw(printTime, true); });
  const imageReady = new Promise((resolve, reject) => { paper.onload = resolve;paper.onerror = reject;paper.src = new URL('img/hero-honeycomb-ceiling-v1.jpg', document.baseURI).href; });
  Promise.all([window.symzLoaded || Promise.resolve(), imageReady]).then(() => { loaded = true;rebuild(); }).catch(() => { paintBackground(printTime);canvas.dataset.printState = 'fallback'; });
})();
