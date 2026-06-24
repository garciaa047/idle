// ui/resonance.js — the drifting, tappable Resonance element + catch feedback.
// PURE UI: it owns the DOM node's lifecycle (spawn, drift, expire, tap) and calls
// back into main.js, which runs the reward LOGIC (resonance.js engine module).
// Functional visuals only — full polish is Phase 8 — but it must be a comfortable
// touch target on mobile and stay clear of the notch / home-indicator safe areas.

import { RESONANCE_LIFETIME } from '../engine/constants.js';

let host = null;
let current = null;     // { el, expireTimer } while a pickup is on screen
let onCatch = null;     // () => void  (main rolls + applies the reward)

export function initResonance(root, handlers) {
  host = root;
  onCatch = handlers.onCatch;
}

// Is a pickup currently on screen? (main only spawns one at a time.)
export function resonanceActive() {
  return current !== null;
}

// Spawn a pickup that drifts across the screen and self-expires after
// RESONANCE_LIFETIME seconds. Tapping it catches it (one reward, then removed).
export function spawnResonance() {
  if (current) return;

  const el = document.createElement('button');
  el.className = 'resonance';
  el.setAttribute('aria-label', 'Catch the Resonance');
  el.innerHTML = '<span class="resonance-core">✦</span>';

  // Random vertical lane within the safe middle band; drift left -> right over the
  // element's lifetime via a CSS transition on `left`.
  const top = 18 + Math.random() * 56; // vh, keeps clear of header + bottom UI
  el.style.top = `${top}vh`;
  el.style.left = '-72px';
  el.style.setProperty('--drift-secs', `${RESONANCE_LIFETIME}s`);

  let caught = false;
  const finish = () => {
    if (!current || current.el !== el) return;
    clearTimeout(current.expireTimer);
    el.remove();
    current = null;
  };

  el.addEventListener('click', (e) => {
    e.preventDefault();
    if (caught) return;
    caught = true;
    popFeedback(el);          // visual ping where it was tapped
    if (onCatch) onCatch();   // main applies the weighted reward
    finish();
  });

  host.appendChild(el);
  // Next frame: flip to the end position so the transition animates the drift.
  requestAnimationFrame(() => { el.style.left = 'calc(100vw + 72px)'; });

  const expireTimer = setTimeout(finish, RESONANCE_LIFETIME * 1000);
  current = { el, expireTimer };
}

// Small floating "+caught" ping at the pickup's location (lightweight feedback).
function popFeedback(srcEl) {
  const rect = srcEl.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'resonance-pop';
  pop.textContent = 'Resonance!';
  pop.style.left = `${rect.left + rect.width / 2}px`;
  pop.style.top = `${rect.top}px`;
  host.appendChild(pop);
  setTimeout(() => pop.remove(), 900);
}
