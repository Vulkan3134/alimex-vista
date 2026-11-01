// Puerta de entrada, como el layout de Metalpar: no carga la bodega
// hasta que el código de invitación coincide.
import { ACCESS } from './config.js';
import { accessCard } from './ui/access.js';

const KEY = 'alimex.invite';

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function digest(code) {
  const bytes = new TextEncoder().encode(code);
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

function fail(msg) {
  const err = document.getElementById('inviteErr');
  const input = document.getElementById('inviteCode');
  if (err) err.textContent = msg || 'Ese código no está autorizado.';
  if (input) input.focus();
}

function unlock() {
  document.body.classList.remove('locked');
  return import('./main.js');
}

async function check(code) {
  const res = await fetch('./assets/invite.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('novault');
  const vault = await res.json();
  const hash = await digest(code.trim());
  return hash === String(vault.hash || '').toLowerCase();
}

async function submit(ev) {
  ev.preventDefault();
  const input = document.getElementById('inviteCode');
  const code = (input?.value || '').trim();
  const err = document.getElementById('inviteErr');
  if (err) err.textContent = '';
  if (!code) {
    fail('Escriba el código de invitación.');
    return;
  }
  try {
    if (await check(code)) {
      sessionStorage.setItem(KEY, 'ok');
      await unlock();
    } else fail();
  } catch {
    fail('No se pudo abrir la bodega.');
  }
}

if (sessionStorage.getItem(KEY) === 'ok') {
  unlock();
} else {
  const box = document.getElementById('inviteAccess');
  if (box) box.replaceWith(accessCard());
  const input = document.getElementById('inviteCode');
  if (input && !input.value) input.value = ACCESS.code;
  document.getElementById('inviteForm')?.addEventListener('submit', submit);
  input?.focus();
  input?.select();
}
