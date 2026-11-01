import { h, replace } from '../core/dom.js';
import { APP, ROUTES } from '../config.js';
import { icons } from './icons.js';

const ICON_BY_ROUTE = {
  dashboard: icons.dashboard,
  inventario: icons.inventory,
  ranking: icons.ranking,
  movimientos: icons.movements,
  historial: icons.history,
  reportes: icons.reports,
  configuracion: icons.settings,
};

export function createShell() {
  const refs = {
    sidebar: null,
    overlay: null,
    nav: null,
    title: null,
    user: null,
    outlet: null,
    toasts: null,
  };

  function closeMenu() {
    refs.sidebar?.classList.remove('is-open');
    refs.overlay?.classList.remove('is-on');
  }

  function paintNav(routeId) {
    if (!refs.nav) return;
    replace(refs.nav, ROUTES.map((r) => h('a.nav-link', {
      href: `#${r.path}`,
      class: r.id === routeId ? 'is-active' : '',
      onClick: closeMenu,
    }, ICON_BY_ROUTE[r.id]?.(), h('span.nav-text', h('strong', r.label), h('small', r.hint)))));
    if (refs.title) refs.title.textContent = ROUTES.find((r) => r.id === routeId)?.label || APP.name;
  }

  return {
    mount(root, { userLabel } = {}) {
      refs.nav = h('nav.nav', { 'aria-label': 'Módulos' });
      refs.title = h('div.top-title', 'Dashboard');
      refs.user = h('span.user-chip', userLabel || '');
      refs.outlet = h('div.page#contenido');
      refs.toasts = h('div.toast-host', { 'aria-live': 'polite' });
      refs.sidebar = h('aside.sidebar#menu',
        h('div.brand',
          h('div.brand-name', APP.name),
          h('div.brand-sub', APP.subtitle),
          h('span.demo-pill', APP.demoLabel),
        ),
        refs.nav,
        h('div.sidebar-foot', `${APP.version} · ${APP.storageNote}`),
      );
      refs.overlay = h('div.overlay', { onClick: closeMenu });
      replace(root,
        h('div.app',
          refs.sidebar,
          h('div.workspace',
            h('header.topbar',
              h('button.menu-btn', {
                type: 'button',
                'aria-label': 'Abrir menú',
                onClick: () => {
                  refs.sidebar.classList.toggle('is-open');
                  refs.overlay.classList.toggle('is-on');
                },
              }, icons.menu()),
              refs.title,
              h('div.top-meta', h('span', APP.demoShort), refs.user),
            ),
            h('div.banner', h('strong', 'DEMO · '), APP.demoBanner),
            h('main.main', refs.outlet),
          ),
        ),
        refs.overlay,
        refs.toasts,
      );
      paintNav('dashboard');
      return {
        outlet: refs.outlet,
        setRoute(id) {
          paintNav(id);
          closeMenu();
        },
        setUser(text) {
          if (refs.user) refs.user.textContent = text;
        },
      };
    },
    toast(message, kind = 'info') {
      const el = h(`div.toast${kind === 'error' ? '.is-error' : kind === 'ok' ? '.is-ok' : ''}`, message);
      refs.toasts?.append(el);
      setTimeout(() => el.remove(), 4200);
    },
    confirm({ title, message, ok = 'Confirmar', danger = false }) {
      return new Promise((resolve) => {
        const back = h('div.modal-back',
          h('div.modal', { role: 'dialog', 'aria-modal': 'true' },
            h('h2', title),
            h('p', message),
            h('div.btn-row', { style: { marginTop: '14px' } },
              h('button.btn', { type: 'button', onClick: () => { back.remove(); resolve(false); } }, 'Cancelar'),
              h(`button.btn${danger ? '.btn-danger' : '.btn-primary'}`, { type: 'button', onClick: () => { back.remove(); resolve(true); } }, ok),
            ),
          ),
        );
        document.body.append(back);
      });
    },
  };
}
