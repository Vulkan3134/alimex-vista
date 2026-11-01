export function createRouter(defs) {
  let outlet = null;
  let onChange = null;
  let instance = null;
  let currentId = null;

  function parse() {
    const raw = (location.hash || '#/dashboard').replace(/^#/, '') || '/dashboard';
    const [pathPart, queryPart] = raw.split('?');
    const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
    const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
    for (const def of defs) {
      const keys = [];
      const re = new RegExp(`^${def.path.replace(/:([A-Za-z]+)/g, (_, k) => {
        keys.push(k);
        return '([^/]+)';
      })}$`);
      const match = path.match(re);
      if (match) {
        const params = {};
        keys.forEach((k, i) => { params[k] = decodeURIComponent(match[i + 1]); });
        return { id: def.id, def, path, params, query };
      }
    }
    return { id: defs[0].id, def: defs[0], path, params: {}, query };
  }

  function sync() {
    if (!outlet) return;
    const match = parse();
    if (!instance || currentId !== match.id) {
      instance?.destroy?.();
      instance = match.def.factory();
      currentId = match.id;
    }
    instance.render(outlet, match);
    onChange?.(match);
  }

  function navigate(path, query) {
    let next = path.startsWith('#') ? path.slice(1) : path;
    if (!next.startsWith('/')) next = `/${next}`;
    if (query && Object.keys(query).length) {
      const qs = new URLSearchParams(query).toString();
      if (qs) next += `?${qs}`;
    }
    const hash = `#${next}`;
    if (location.hash !== hash) location.hash = hash;
    sync();
  }

  return {
    start(el, cb) {
      outlet = el;
      onChange = cb;
      addEventListener('hashchange', sync);
      if (!location.hash) location.hash = '#/dashboard';
      else sync();
    },
    navigate,
    refresh: sync,
    parse,
  };
}
