// Utilidades de DOM. Crean nodos reales (nunca usan innerHTML), por lo que el texto
// ingresado por el usuario nunca se interpreta como HTML.

const SVG_NS = 'http://www.w3.org/2000/svg';
const PROPERTY_ATTRS = new Set(['value', 'checked', 'selected', 'disabled', 'indeterminate', 'readOnly']);

/** Normaliza el atributo class (texto, arreglo u objeto) a un string. */
function classToString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(Boolean).join(' ');
  return Object.keys(value).filter((k) => value[k]).join(' ');
}

function applyProps(el, props, isSvg) {
  if (!props) return;
  for (const key of Object.keys(props)) {
    const value = props[key];
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class' || key === 'className') {
      const cls = classToString(value);
      if (cls) el.setAttribute('class', el.getAttribute('class') ? `${el.getAttribute('class')} ${cls}` : cls);
    } else if (key === 'style') {
      if (typeof value === 'string') el.style.cssText = value;
      else {
        for (const prop of Object.keys(value)) {
          if (prop.startsWith('--')) el.style.setProperty(prop, String(value[prop]));
          else el.style[prop] = value[prop];
        }
      }
    } else if (key === 'dataset') {
      for (const d of Object.keys(value)) el.dataset[d] = String(value[d]);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (!isSvg && PROPERTY_ATTRS.has(key)) {
      el[key] = value;
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

function appendChildren(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (Array.isArray(child)) appendChildren(parent, child);
    else if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
}

/**
 * Crea un elemento HTML. El selector admite clases e id: h('div.card.wide#principal', {...}, hijos)
 * @param {string} selector
 * @param {object|null} [props]
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function h(selector, props, ...children) {
  const match = /^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/.exec(selector);
  if (!match) throw new Error(`Selector no válido: ${selector}`);
  const el = document.createElement(match[1] || 'div');
  const rest = match[2];
  if (rest) {
    const classes = [];
    for (const part of rest.match(/[.#][\w-]+/g)) {
      if (part[0] === '.') classes.push(part.slice(1));
      else el.id = part.slice(1);
    }
    if (classes.length) el.setAttribute('class', classes.join(' '));
  }
  if (props && (props instanceof Node || Array.isArray(props) || typeof props !== 'object')) {
    children.unshift(props);
    props = null;
  }
  applyProps(el, props, false);
  appendChildren(el, children);
  return el;
}

/**
 * Crea un elemento SVG (siempre en el espacio de nombres SVG).
 * @param {string} tag
 * @param {object|null} [props]
 * @param {...any} children
 * @returns {SVGElement}
 */
export function s(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  if (props && (props instanceof Node || Array.isArray(props) || typeof props !== 'object')) {
    children.unshift(props);
    props = null;
  }
  applyProps(el, props, true);
  appendChildren(el, children);
  return el;
}

/** Reemplaza el contenido de un contenedor. */
export function replace(container, ...children) {
  container.replaceChildren();
  appendChildren(container, children);
  return container;
}

/** Vacía un contenedor. */
export function clear(container) {
  container.replaceChildren();
  return container;
}

/**
 * Delegación de eventos: escucha en el contenedor y filtra por selector.
 * @returns {() => void} función para quitar el listener
 */
export function delegate(container, eventName, selector, handler) {
  const listener = (event) => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (target && container.contains(target)) handler(event, target);
  };
  container.addEventListener(eventName, listener);
  return () => container.removeEventListener(eventName, listener);
}

/** Retrasa la ejecución hasta que pasen `ms` sin nuevas llamadas. */
export function debounce(fn, ms = 200) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

/** Descarga un Blob como archivo. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
