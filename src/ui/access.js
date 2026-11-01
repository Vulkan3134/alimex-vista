import { ACCESS } from '../config.js';
import { h } from '../core/dom.js';

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function accessCard({ onCopy, variant = 'light' } = {}) {
  function copyBtn(label, text, okMsg) {
    const btn = h('button.btn.btn-tiny.access-copy', {
      type: 'button',
      onClick: async () => {
        const ok = await copyText(text);
        btn.textContent = ok ? 'Copiado' : 'Error';
        setTimeout(() => { btn.textContent = label; }, 1400);
        onCopy?.(ok ? okMsg : 'No se pudo copiar.', ok ? 'ok' : 'error');
      },
    }, label);
    return btn;
  }

  return h(`div.access-card${variant === 'dark' ? '.is-dark' : ''}`,
    h('strong', 'Enlace de la vista'),
    h('p', 'Este enlace es público. La clave de invitación no se muestra: se entrega aparte.'),
    h('div.access-row',
      h('span.access-k', 'Enlace'),
      h('a.access-v', { href: ACCESS.url, target: '_blank', rel: 'noreferrer', title: ACCESS.url }, ACCESS.label),
      copyBtn('Copiar', ACCESS.url, 'Enlace copiado.'),
    ),
  );
}
