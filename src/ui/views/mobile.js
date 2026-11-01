import { h, replace } from '../../core/dom.js';
import { toLocalInput } from '../../core/dates.js';
import { fmtInt } from '../../core/format.js';
import { canDetectBarcode, detectFromVideo, parseScannedLocation } from '../../services/qr.js';
import { isOnline } from '../../services/offlineQueue.js';
import { dataTable, field, input, pageHeader, select, tabs } from '../components/common.js';

export function createMobileView(ctx, options = {}) {
  const st0 = ctx.store.getState();
  const user = st0.users.find((u) => u.id === st0.settings.currentUserId);
  const ui = {
    type: 'SALIDA',
    code: '',
    location: null,
    sku: '',
    qty: '',
    departmentId: '',
    responsible: user?.name || '',
    document: '',
    notes: '',
    receiptId: '',
    scanning: false,
    error: '',
    querySig: '',
  };

  function stopScan() {
    ui.scanning = false;
  }

  async function startScan(container, match) {
    if (!canDetectBarcode() || !navigator.mediaDevices?.getUserMedia) {
      ui.error = 'Este navegador no puede leer QR con la cámara. Escriba el código de la ubicación (ejemplo: P01-E02-N03).';
      render(container, match);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      ui.scanning = true;
      ui.error = '';
      render(container, match);
      const video = container.querySelector('video');
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      const loop = async () => {
        if (!ui.scanning) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const value = await detectFromVideo(video);
        const loc = parseScannedLocation(value);
        if (loc) {
          ui.scanning = false;
          stream.getTracks().forEach((t) => t.stop());
          applyLocation(loc);
          render(container, match);
          return;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch {
      ui.error = 'No se pudo abrir la cámara. Escriba el código de la ubicación.';
      ui.scanning = false;
      render(container, match);
    }
  }

  function applyLocation(code) {
    const detail = ctx.inventory.locationDetail(code);
    ui.location = code;
    ui.code = code;
    ui.error = detail ? '' : 'Esa ubicación no existe en el layout de demostración.';
    if (detail && detail.skus[0] && !ui.sku) ui.sku = detail.skus[0].sku;
  }

  function applyQuery(query) {
    if (!query) return;
    if (query.tipo === 'ENTRADA' || query.tipo === 'SALIDA') ui.type = query.tipo;
    const loc = parseScannedLocation(query.u || query.ubicacion || '');
    if (loc) applyLocation(loc);
    if (query.sku) ui.sku = query.sku;
  }

  function submit(container, match) {
    const loc = ui.location;
    if (!loc) {
      ui.error = 'Identifique primero la ubicación.';
      render(container, match);
      return;
    }
    const isExit = ui.type === 'SALIDA';
    const op = {
      type: ui.type,
      at: ctx.now(),
      responsible: ui.responsible,
      document: ui.document || `MOVIL-${Date.now()}`,
      notes: ui.notes,
      departmentId: isExit ? (ui.departmentId || null) : null,
      source: isOnline() ? 'MOVIL' : 'MOVIL_SIN_CONEXION',
      lines: [{
        sku: ui.sku,
        qty: ui.qty === '' ? '' : Number(ui.qty),
        from: isExit ? loc : null,
        to: isExit ? null : loc,
        receiptId: !isExit && ui.receiptId ? ui.receiptId : null,
      }],
    };
    if (!isOnline()) {
      ctx.offline.enqueue(op);
      ui.qty = '';
      ui.error = '';
      ctx.toast(isExit
        ? 'Sin conexión: el retiro quedó en la cola y se validará al sincronizar.'
        : 'Sin conexión: el ingreso quedó en la cola y se validará al sincronizar.', 'ok');
      render(container, match);
      return;
    }
    const result = ctx.movements.register(op);
    if (!result.ok) {
      ui.error = result.errors.map((e) => e.message).join(' ');
      ctx.toast(isExit ? 'No se registró el retiro.' : 'No se registró el ingreso.', 'error');
    } else {
      ui.qty = '';
      ui.receiptId = '';
      ui.error = '';
      ctx.toast(isExit
        ? `Salida registrada (${result.operationId}). El stock de la ubicación y del SKU se actualizó.`
        : `Ingreso registrado (${result.operationId}). El stock de la ubicación y del SKU se actualizó.`, 'ok');
    }
    render(container, match);
  }

  function render(container, match) {
    const q = match?.query || {};
    const sig = `${q.tipo || ''}|${q.u || ''}|${q.ubicacion || ''}|${q.sku || ''}`;
    if (sig !== ui.querySig) {
      ui.querySig = sig;
      applyQuery(q);
    }
    const st = ctx.store.getState();
    const detail = ui.location ? ctx.inventory.locationDetail(ui.location) : null;
    const queue = ctx.offline.list();
    const products = st.products.filter((p) => p.active);
    const selectedStock = detail?.skus.find((s) => s.sku === ui.sku);
    const selectedProduct = products.find((p) => p.sku === ui.sku);
    const isExit = ui.type === 'SALIDA';
    const receipts = ui.sku
      ? st.pendingReceipts.filter((r) => r.sku === ui.sku && r.qtyOrdered - r.qtyReceived > 0)
      : [];

    const body = [
      h('div.mobile-pick',
        h('section.card',
          tabs(
            [
              { id: 'ENTRADA', label: 'Ingreso' },
              { id: 'SALIDA', label: 'Salida' },
            ],
            ui.type,
            (id) => { ui.type = id; ui.error = ''; ui.qty = ''; render(container, match); },
          ),
          h('p.muted.small', isExit
            ? 'Retiro desde esta ubicación. Es el mismo movimiento de salida que el formulario de escritorio.'
            : 'Recepción hacia esta ubicación. Es el mismo movimiento de entrada que el formulario de escritorio.'),
          field({
            label: isExit ? 'Ubicación de origen' : 'Ubicación de destino',
            children: input({
              value: ui.code,
              placeholder: 'P01-E02-N03 o ALIMEX:P01-E02-N03',
              onInput: (e) => { ui.code = e.target.value; },
              onKeydown: (e) => {
                if (e.key === 'Enter') {
                  const loc = parseScannedLocation(ui.code);
                  if (loc) applyLocation(loc);
                  else ui.error = 'No se reconoció un código de ubicación.';
                  render(container, match);
                }
              },
            }),
          }),
          h('div.btn-row',
            h('button.btn', {
              type: 'button',
              onClick: () => {
                const loc = parseScannedLocation(ui.code);
                if (loc) applyLocation(loc);
                else ui.error = 'No se reconoció un código de ubicación.';
                render(container, match);
              },
            }, 'Identificar ubicación'),
            h('button.btn', { type: 'button', onClick: () => startScan(container, match) }, ui.scanning ? 'Escaneando…' : 'Usar cámara'),
          ),
          ui.scanning ? h('video', { autoplay: true, playsinline: true, muted: true, style: { width: '100%', borderRadius: '8px', marginTop: '8px' } }) : null,
          h('p.muted.small', `Conexión: ${isOnline() ? 'en línea' : 'sin conexión'}. ${canDetectBarcode() ? 'Este navegador puede leer QR.' : 'La lectura por cámara no está disponible; use el código impreso.'}`),
        ),
        detail ? h('section.card',
          h('h2', detail.location.code),
          h('p.muted.small', `${detail.skus.length ? `${detail.skus.length} productos en este lugar` : 'Ubicación vacía'}. Capacidad usada: ${fmtInt(detail.usedUnits)} de ${fmtInt(detail.capacityUnits)}.`),
          dataTable({
            selectedKey: ui.sku,
            rowKey: (r) => r.sku,
            onRowClick: (row) => { ui.sku = row.sku; render(container, match); },
            columns: [
              { key: 'sku', label: 'SKU' },
              { key: 'name', label: 'Producto' },
              { key: 'qty', label: 'Aquí', align: 'right', render: (v) => fmtInt(v) },
            ],
            rows: detail.skus,
            empty: isExit ? 'No hay existencias para retirar aquí.' : 'Vacía: puede ingresar un SKU del catálogo.',
          }),
        ) : h('section.card', h('p.muted', 'Identifique una ubicación para ver los SKU almacenados.')),
        h('section.card',
          !isExit ? field({
            label: 'SKU a ingresar',
            children: select({
              value: ui.sku,
              onChange: (e) => { ui.sku = e.target.value; ui.receiptId = ''; render(container, match); },
            }, [{ value: '', label: 'Seleccione' }, ...products.map((p) => ({ value: p.sku, label: `${p.sku} · ${p.name}` }))]),
          }) : null,
          isExit ? field({
            label: 'Departamento solicitante',
            children: select({
              value: ui.departmentId,
              onChange: (e) => { ui.departmentId = e.target.value; },
            }, [{ value: '', label: 'Seleccione' }, ...st.departments.map((d) => ({ value: d.id, label: d.name }))]),
          }) : null,
          field({
            label: 'Responsable',
            children: select({
              value: ui.responsible,
              onChange: (e) => { ui.responsible = e.target.value; },
            }, st.users.map((u) => ({ value: u.name, label: u.name }))),
          }),
          field({
            label: isExit ? 'Cantidad a retirar' : 'Cantidad a ingresar',
            hint: isExit
              ? (selectedStock ? `Hay ${fmtInt(selectedStock.qty)} en ${ui.location}.` : 'Elija un producto de la lista de la ubicación.')
              : (selectedProduct ? `${selectedProduct.name}. Se sumará a ${ui.location || 'la ubicación'}.` : 'Elija el SKU que llega.'),
            children: input({ class: 'qty-input', type: 'number', min: '1', step: '1', value: ui.qty, inputmode: 'numeric', onInput: (e) => { ui.qty = e.target.value; } }),
          }),
          !isExit && receipts.length ? field({
            label: 'Recepción pendiente',
            children: select({
              value: ui.receiptId,
              onChange: (e) => { ui.receiptId = e.target.value; },
            }, [{ value: '', label: 'Ninguna' }, ...receipts.map((r) => ({ value: r.id, label: `${r.id} (${fmtInt(r.qtyOrdered - r.qtyReceived)} por recibir)` }))]),
          }) : null,
          field({ label: 'Documento (opcional)', children: input({ value: ui.document, onInput: (e) => { ui.document = e.target.value; } }) }),
          ui.error ? h('p', { style: { color: 'var(--critico)' } }, ui.error) : null,
          h('button.btn.btn-primary', {
            type: 'button',
            style: { width: '100%', marginTop: '8px' },
            onClick: () => submit(container, match),
          }, isExit ? 'Confirmar salida' : 'Confirmar ingreso'),
          h('p.muted.small', `Hora local del equipo: ${toLocalInput(ctx.now()).replace('T', ' ')}. Si no hay red, el movimiento espera en la cola y se valida contra el stock al volver la conexión.`),
          options.embedded ? null : h('p.muted.small',
            h('button.btn.btn-ghost', {
              type: 'button',
              onClick: () => ctx.navigate('/movimientos', { modo: 'escritorio', tipo: ui.type }),
            }, 'Abrir el formulario completo (traslados y devoluciones)'),
          ),
        ),
        queue.length ? h('section.card',
          h('h2', 'Cola sin conexión'),
          dataTable({
            columns: [
              { key: 'id', label: 'Id' },
              { key: 'status', label: 'Estado' },
              { key: 'sku', label: 'SKU', render: (_, r) => r.operation.lines.map((l) => l.sku).join(', ') },
              { key: 'result', label: 'Detalle', render: (_, r) => (r.resultErrors || []).map((e) => e.message).join(' ') || '—' },
            ],
            rows: queue,
          }),
          h('button.btn', {
            type: 'button',
            onClick: () => {
              const res = ctx.offline.sync();
              ctx.toast(`Sincronizados: ${res.synced}. Rechazados: ${res.rejected}.`, res.rejected ? 'error' : 'ok');
              render(container, match);
            },
          }, 'Sincronizar ahora'),
        ) : null,
      ),
    ];

    if (options.embedded) {
      replace(container, body);
      return;
    }

    replace(container,
      pageHeader(
        'Picking móvil: salidas e ingresos',
        'Escanee el QR de la ubicación. Una salida retira de ese lugar; un ingreso suma stock ahí. Ambos quedan en el mismo historial que el formulario de escritorio.',
      ),
      body,
    );
  }

  return { render, stopScan };
}
