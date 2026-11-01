import { s } from '../core/dom.js';

function svg(path, extra = {}) {
  return s('svg', {
    class: 'nav-ico',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.8',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    ...extra,
  }, s('path', { d: path }));
}

export const icons = {
  dashboard: () => svg('M4 13h6V4H4v9zm10 7h6V4h-6v16zM4 20h6v-5H4v5z'),
  inventory: () => svg('M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4'),
  ranking: () => svg('M4 20V10m8 10V4m8 16v-7'),
  movements: () => svg('M4 7h11M4 12h8M4 17h13M16 7l3 3-3 3'),
  history: () => svg('M4 12a8 8 0 1 0 2.2-5.5M4 4v4h4'),
  reports: () => svg('M6 3h9l5 5v13H6zM15 3v5h5M8 13h8M8 17h5'),
  settings: () => svg('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 12h2m12 0h2M12 4v2m0 12v2'),
  mobile: () => svg('M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm4 16h.01'),
  menu: () => svg('M4 7h16M4 12h16M4 17h16'),
};
