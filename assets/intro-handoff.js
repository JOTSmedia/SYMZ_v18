(() => {
  const logo = document.getElementById('introLogo');
  const writer = document.createElement('img');
  writer.id = 'introWriter';
  writer.className = 'intro-writer';
  writer.alt = '';
  writer.setAttribute('aria-hidden', 'true');
  writer.draggable = false;
  document.body.appendChild(writer);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const flight = { duration: 850, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' };
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  let begun = false, logoLanded = !logo, writerLanded = false, timedOut = false;
  let sourceRect = null, latestHero = null, spacer = null, timeout = 0;
  let logoAnimation = null, writerAnimation = null, logoGeneration = 0, writerGeneration = 0;
  let logoDeadline = 0;

  function mappedRect(x, y, width, height, ctx, canvas) {
    if (!canvas.width || !canvas.height || ![x, y, width, height].every(Number.isFinite)) return null;
    const transform = ctx.getTransform(), box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const points = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]
      .map(([a, b]) => ({ x: transform.a * a + transform.c * b + transform.e, y: transform.b * a + transform.d * b + transform.f }));
    const xs = points.map(point => point.x), ys = points.map(point => point.y);
    const left = Math.min(...xs), top = Math.min(...ys);
    return {
      left: box.left + left * box.width / canvas.width,
      top: box.top + top * box.height / canvas.height,
      width: (Math.max(...xs) - left) * box.width / canvas.width,
      height: (Math.max(...ys) - top) * box.height / canvas.height
    };
  }

  function box(element) {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function place(element, rect, position = 'fixed') {
    Object.assign(element.style, { position, left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  }

  function source(image) {
    const url = image.currentSrc || image.src;
    if (url && writer.src !== url) writer.src = url;
  }

  function settle() {
    if (api.finished || !logoLanded || !writerLanded) return;
    clearTimeout(timeout);
    api.finished = true;
    resolveReady();
  }

  function landLogo() {
    if (logoLanded) return;
    logoGeneration++;
    logoAnimation?.cancel(); logoAnimation = null;
    const slot = document.getElementById('navBrandSlot');
    if (slot && logo) {
      slot.appendChild(logo);
      logo.style.cssText = '';
      logo.classList.add('is-nav');
      logo.dataset.introState = 'nav';
    }
    spacer?.remove(); spacer = null;
    logoLanded = true;
    settle();
  }

  function flyLogo(from, duration = flight.duration) {
    const slot = document.getElementById('navBrandSlot');
    if (!logo || !slot || !from.width || !from.height) { landLogo(); return; }
    const target = box(slot), generation = ++logoGeneration;
    logoAnimation?.cancel();
    place(logo, target);
    logo.style.zIndex = '250'; logo.style.transformOrigin = '0 0';
    if (reduced.matches || !logo.animate || !target.width || !target.height) { landLogo(); return; }
    logoAnimation = logo.animate([
      { transform: `translate(${from.left - target.left}px,${from.top - target.top}px) scale(${from.width / target.width},${from.height / target.height})` },
      { transform: 'none' }
    ], { ...flight, duration });
    logoAnimation.finished.then(() => { if (generation === logoGeneration) landLogo(); })
      .catch(() => { if (generation === logoGeneration) landLogo(); });
  }

  function landWriter() {
    const texture = document.querySelector('.hero-texture');
    if (!latestHero || !texture) return false;
    writerGeneration++;
    writerAnimation?.cancel(); writerAnimation = null;
    const parent = box(texture), target = latestHero.rect;
    source(latestHero.image);
    if (writer.parentElement !== texture) texture.appendChild(writer);
    writer.classList.add('is-in-hero');
    place(writer, {
      left: 0, top: 0,
      width: target.width, height: target.height
    }, 'absolute');
    Object.assign(writer.style, { zIndex: '2', transform: `translate3d(${target.left - parent.left + texture.scrollLeft - texture.clientLeft}px,${target.top - parent.top + texture.scrollTop - texture.clientTop}px,0)`, opacity: '.65', visibility: 'visible' });
    writer.dataset.introState = 'hero';
    writerLanded = true;
    settle();
    return true;
  }

  function flyWriter() {
    if (!latestHero) return;
    if (reduced.matches || timedOut || !writer.animate) { landWriter(); return; }
    const target = latestHero.rect, from = sourceRect || target, generation = ++writerGeneration;
    source(latestHero.image);
    const texture = document.querySelector('.hero-texture');
    if (texture) {
      const parent = box(texture);
      texture.appendChild(writer); writer.classList.add('is-in-hero');
      place(writer, { left: target.left - parent.left, top: target.top - parent.top, width: target.width, height: target.height }, 'absolute');
    } else { document.body.appendChild(writer); place(writer, target); }
    Object.assign(writer.style, { zIndex: '2', opacity: '.65', visibility: 'visible', transform: 'none' });
    writer.dataset.introState = 'travel';
    writerAnimation = writer.animate([
      { transform: `translate(${from.left - target.left}px,${from.top - target.top}px) scale(${from.width / target.width},${from.height / target.height})`, opacity: 1 },
      { transform: 'none', opacity: .65 }
    ], { ...flight, delay: 200 });
    writerAnimation.finished.then(() => { if (generation === writerGeneration) landWriter(); })
      .catch(() => { if (generation === writerGeneration) landWriter(); });
  }

  const api = {
    logo, writer, ready, finished: false,
    loaderWriter(image, x, y, width, height, ctx, canvas) {
      if (begun) return;
      const rect = mappedRect(x, y, width, height, ctx, canvas);
      if (!rect || !rect.width || !rect.height) return;
      source(image); sourceRect = rect; place(writer, rect);
      Object.assign(writer.style, { opacity: '1', visibility: 'visible' });
      writer.dataset.introState = 'loader';
    },
    begin() {
      if (begun) return ready;
      begun = true;
      writer.dataset.introState = 'awaiting-hero';
      if (logo) {
        const from = box(logo), computed = getComputedStyle(logo);
        spacer = document.createElement('div');
        spacer.setAttribute('aria-hidden', 'true');
        Object.assign(spacer.style, { width: `${from.width}px`, height: `${from.height}px`, flex: 'none', margin: computed.margin });
        logo.before(spacer);
        document.body.appendChild(logo);
        logo.classList.add('is-nav');
        logo.dataset.introState = 'travel';
        logoDeadline = performance.now() + flight.duration;
        flyLogo(from);
      }
      timeout = setTimeout(() => {
        timedOut = true;
        landLogo();
        if (!landWriter()) {
          writerGeneration++; writerAnimation?.cancel(); writerAnimation = null;
          writer.style.visibility = 'hidden'; writer.dataset.introState = 'fallback'; writerLanded = true;
        }
        settle();
      }, 2600);
      if (latestHero) flyWriter();
      return ready;
    },
    heroWriter(image, x, y, width, height, ctx, canvas) {
      const rect = mappedRect(x, y, width, height, ctx, canvas);
      if (!rect || !rect.width || !rect.height) return;
      latestHero = { image, rect };
      if (!begun) return;
      if (writerLanded || timedOut) landWriter();
      else if (!writerAnimation) flyWriter();
    }
  };
  window.symzIntro = api;

  addEventListener('resize', () => {
    if (begun && !logoLanded && logo) flyLogo(box(logo), Math.max(100, logoDeadline - performance.now()));
  });
  reduced.addEventListener('change', () => {
    if (!reduced.matches || !begun) return;
    landLogo();
    if (latestHero) landWriter();
  });
})();
