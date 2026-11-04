(() => {
  'use strict';

  const focusableSelector = 'a[href],button,input,select,textarea,[tabindex]';
  const dialogs = ['lb', 'mm'].map(id => document.getElementById(id)).filter(Boolean);
  const dialogState = new Map(dialogs.map(element => [element, {
    open: false,
    opener: null,
    skipRestore: false
  }]));
  const savedInert = new Map();
  let activeDialog = null;
  let lastOutsideFocus = document.activeElement;
  let savedOverflow = null;

  const canFocus = element => element instanceof HTMLElement && element.isConnected &&
    !element.closest('[hidden],[inert]') && !element.matches(':disabled') &&
    element.getClientRects().length > 0;
  const focus = element => {
    if (canFocus(element)) element.focus({ preventScroll: true });
  };
  const dialogControls = element => [...element.querySelectorAll(focusableSelector)]
    .filter(control => canFocus(control) && control.tabIndex >= 0);

  function applyModalBackground() {
    if (!activeDialog) {
      savedInert.forEach((wasInert, element) => { element.inert = wasInert; });
      savedInert.clear();
      if (savedOverflow) {
        document.body.style.overflow = savedOverflow.body;
        document.documentElement.style.overflow = savedOverflow.root;
        savedOverflow = null;
      }
      return;
    }
    if (!savedOverflow) {
      savedOverflow = {
        body: document.body.style.overflow,
        root: document.documentElement.style.overflow
      };
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
    [...document.body.children].forEach(element => {
      if (!savedInert.has(element)) savedInert.set(element, element.inert);
      element.inert = element !== activeDialog;
    });
  }

  function syncDialogs() {
    const closed = [];
    dialogs.forEach(element => {
      const state = dialogState.get(element);
      const open = !element.hidden;
      if (open && !state.open) {
        if (!state.opener || !state.opener.isConnected) state.opener = lastOutsideFocus;
        state.skipRestore = false;
        activeDialog = element;
      } else if (!open && state.open) {
        closed.push(state);
      }
      state.open = open;
    });
    if (activeDialog?.hidden) activeDialog = [...dialogs].reverse().find(element => !element.hidden) || null;
    applyModalBackground();
    if (activeDialog) {
      if (!activeDialog.contains(document.activeElement)) {
        focus(dialogControls(activeDialog)[0]);
      }
    } else {
      const state = closed.find(entry => !entry.skipRestore);
      if (state) focus(state.opener);
    }
    closed.forEach(state => {
      state.opener = null;
      state.skipRestore = false;
    });
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const photoTrigger = target.closest('#shelfGrid .item');
    const merchTrigger = target.closest('#mGrid .m-tile,#mPic .hs');
    const shape = target.closest('#mPic .mp');
    const photo = document.getElementById('lb');
    const merch = document.getElementById('mm');
    if (photoTrigger && photo?.hidden) dialogState.get(photo).opener = photoTrigger;
    if (merch?.hidden && (merchTrigger || shape)) {
      dialogState.get(merch).opener = merchTrigger ||
        document.querySelectorAll('#mPic .hs')[Number(shape.dataset.i)] || lastOutsideFocus;
    }
    if (target.closest('#mmOrder,#mmFind') && merch && !merch.hidden) {
      dialogState.get(merch).skipRestore = true;
    }
  }, true);

  document.addEventListener('focusin', event => {
    if (!activeDialog || activeDialog.hidden) {
      if (!dialogs.some(element => element.contains(event.target))) lastOutsideFocus = event.target;
      return;
    }
    if (!activeDialog.contains(event.target)) focus(dialogControls(activeDialog)[0]);
  }, true);

  document.addEventListener('keydown', event => {
    if (!activeDialog || activeDialog.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      activeDialog.hidden = true;
      syncDialogs();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = dialogControls(activeDialog);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && (document.activeElement === first || !activeDialog.contains(document.activeElement))) {
      event.preventDefault();
      focus(last);
    } else if (!event.shiftKey && (document.activeElement === last || !activeDialog.contains(document.activeElement))) {
      event.preventDefault();
      focus(first);
    }
  }, true);

  dialogs.forEach(element => new MutationObserver(syncDialogs).observe(element, {
    attributes: true,
    attributeFilter: ['hidden']
  }));
  new MutationObserver(() => {
    if (activeDialog) applyModalBackground();
  }).observe(document.body, { childList: true });
  syncDialogs();

  const form = document.getElementById('orderForm');
  if (form) {
    form.noValidate = true;
    const fields = ['fName', 'fContact', 'fIdea'].map(id => document.getElementById(id)).filter(Boolean);
    const output = document.getElementById('formOut');
    const status = document.createElement('p');
    status.className = 'form-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    if (output) output.before(status);
    else form.append(status);

    let heading = null;
    if (output) {
      heading = document.createElement('h3');
      heading.id = 'requestReady';
      heading.tabIndex = -1;
      heading.textContent = 'Your request is ready';
      output.prepend(heading);
      output.setAttribute('role', 'region');
      output.setAttribute('aria-labelledby', heading.id);
    }

    const fieldErrors = new Map();
    fields.forEach(field => {
      const error = document.createElement('p');
      error.id = `${field.id}Error`;
      error.className = 'field-error';
      error.hidden = true;
      field.after(error);
      fieldErrors.set(field, error);
    });

    function errorFor(field) {
      const value = field.value.trim();
      if (!value) {
        if (field.id === 'fName') return 'Enter your name.';
        if (field.id === 'fContact') return 'Enter an email address or phone number so Symz can reach you.';
        return 'Describe what you would like made.';
      }
      if (field.id === 'fContact') {
        const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        const digits = value.replace(/\D/g, '');
        const phone = /^\+?[\d\s().-]+$/.test(value) && digits.length >= 7 && digits.length <= 15;
        if (!email && !phone) return 'Enter a complete email address or phone number, including the area code.';
      }
      return '';
    }

    function validate(field) {
      const message = errorFor(field);
      const error = fieldErrors.get(field);
      field.setCustomValidity(message);
      error.textContent = message;
      error.hidden = !message;
      const descriptions = new Set((field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      if (message) {
        field.setAttribute('aria-invalid', 'true');
        descriptions.add(error.id);
      } else {
        field.removeAttribute('aria-invalid');
        descriptions.delete(error.id);
      }
      if (descriptions.size) field.setAttribute('aria-describedby', [...descriptions].join(' '));
      else field.removeAttribute('aria-describedby');
      return !message;
    }

    fields.forEach(field => {
      field.addEventListener('input', () => {
        if (field.getAttribute('aria-invalid') === 'true') validate(field);
      });
      field.addEventListener('blur', () => {
        if (field.getAttribute('aria-invalid') === 'true') validate(field);
      });
    });

    form.addEventListener('input', () => { status.textContent = ''; });
    form.addEventListener('change', () => { status.textContent = ''; });
    form.addEventListener('submit', event => {
      fields.forEach(field => { field.value = field.value.trim(); validate(field); });
      const invalid = [...form.elements].find(field => field.willValidate && !field.validity.valid);
      if (invalid) {
        event.preventDefault();
        event.stopImmediatePropagation();
        status.textContent = 'Check the marked fields, then prepare your request again.';
        invalid.focus({ preventScroll: true });
        invalid.scrollIntoView({ block: 'center', behavior: 'auto' });
        return;
      }
      queueMicrotask(() => {
        if (!output || output.hidden) return;
        status.textContent = 'Request prepared. Copy it into a text or Instagram message and attach your reference files.';
        heading.focus({ preventScroll: true });
      });
    }, true);

    const copyButton = document.getElementById('copyBtn');
    if (copyButton) new MutationObserver(() => {
      const label = copyButton.textContent.trim();
      if (label === 'Copied') status.textContent = 'Request copied. Open texts or Instagram to send it, and attach your reference files.';
      else if (label === 'Selected, press copy') status.textContent = 'Request text selected. Use your device’s copy command, then paste it into your message.';
    }).observe(copyButton, { childList: true, characterData: true, subtree: true });
  }

  const log = document.getElementById('gLog');
  if (log) {
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    log.setAttribute('aria-relevant', 'additions text');
    log.setAttribute('aria-label', 'Conversation with Symz');
  }

  const merchRail = document.getElementById('customMerchSamples');
  if (merchRail) {
    const slides = [...merchRail.querySelectorAll('.custom-merch-slide')];
    const controls = [...document.querySelectorAll('[data-merch-step]')];
    const position = document.getElementById('customMerchPosition');
    const mobile = matchMedia('(max-width: 760px)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let selected = 0;
    let pending = false;
    function updatePosition() {
      pending = false;
      if (!mobile.matches) return;
      const railBox = merchRail.getBoundingClientRect();
      const center = railBox.left + railBox.width / 2;
      selected = slides.reduce((best, slide, i) => {
        const box = slide.getBoundingClientRect();
        const bestBox = slides[best].getBoundingClientRect();
        return Math.abs(box.left + box.width / 2 - center) < Math.abs(bestBox.left + bestBox.width / 2 - center) ? i : best;
      }, 0);
      if (position) position.textContent = `${selected + 1} / ${slides.length}`;
      controls.forEach(button => {
        button.disabled = Number(button.dataset.merchStep) < 0 ? selected === 0 : selected === slides.length - 1;
      });
    }
    function showSlide(index) {
      if (!mobile.matches) return;
      const target = slides[Math.max(0, Math.min(slides.length - 1, index))];
      const padding = parseFloat(getComputedStyle(merchRail).paddingLeft) || 0;
      const left = merchRail.scrollLeft + target.getBoundingClientRect().left - merchRail.getBoundingClientRect().left - padding;
      merchRail.scrollTo({ left, behavior: reduced.matches ? 'auto' : 'smooth' });
    }
    controls.forEach(button => button.addEventListener('click', () => showSlide(selected + Number(button.dataset.merchStep))));
    merchRail.addEventListener('scroll', () => {
      if (!pending) { pending = true; requestAnimationFrame(updatePosition); }
    }, { passive: true });
    merchRail.addEventListener('keydown', event => {
      if (!mobile.matches || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      showSlide(event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : selected + (event.key === 'ArrowRight' ? 1 : -1));
    });
    merchRail.addEventListener('focusin', event => {
      const slide = event.target.closest('.custom-merch-slide');
      if (slide) showSlide(slides.indexOf(slide));
    });
    mobile.addEventListener('change', updatePosition);
    updatePosition();
  }
})();

(() => {
  const tabs = [...document.querySelectorAll('[data-merch-view]')];
  const panels = { map: document.getElementById('lineupDetails'), browse: document.getElementById('merchBrowsePanel') };
  if (!tabs.length || !panels.map || !panels.browse) return;

  function show(view, focus = false) {
    if (!panels[view]) return;
    tabs.forEach(tab => {
      const selected = tab.dataset.merchView === view;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus({ preventScroll: true });
    });
    Object.entries(panels).forEach(([name, panel]) => { panel.hidden = name !== view; });
    requestAnimationFrame(() => document.getElementById('mGrid').dispatchEvent(new Event('scroll')));
  }
  window.symzSetMerchView = show;
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => show(tab.dataset.merchView));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
        (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      show(tabs[next].dataset.merchView, true);
    });
  });
})();
