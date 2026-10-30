/* app.js: interfaz, filtros, KPIs, gráficos y tabla. Depende de datos.js */
const $ = id => document.getElementById(id);
const estado = { data: null, orden: { k: 'recaudo', d: -1 }, graf: {} };

const miles = n => Math.round(n).toLocaleString('es-CO');
const pct = n => (n * 100).toFixed(1) + '%';
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const suma = (a, k) => a.reduce((s, x) => s + x[k], 0);

/* ---------- Carga ---------- */
async function cargar(archivo) {
  const msg = $('estado');
  msg.className = 'estado';
  msg.textContent = 'Leyendo ' + archivo.name + '...';
  try {
    estado.data = await Datos.leer(archivo);
    const hojas = Object.keys(estado.data.periodos).length;
    const filas = Object.values(estado.data.periodos).reduce((s, p) => s + p.filas.length, 0);
    msg.innerHTML = `Listo: ${hojas} hojas y ${miles(filas)} registros leídos.` +
      (estado.data.avisos.length ? '<ul>' + estado.data.avisos.map(a => `<li>${a}</li>`).join('') + '</ul>' : '');
    $('subtitulo').textContent = archivo.name;
    iniciarFiltros();
    $('panel').hidden = false;
    pintar();
  } catch (e) {
    msg.className = 'estado error';
    msg.textContent = 'No se pudo leer el archivo. ' + e.message;
  }
}

function iniciarFiltros() {
  const { periodos, orden } = estado.data;
  const claves = orden.filter(k => periodos[k]);
  $('fPeriodo').innerHTML = claves.slice().reverse()
    .map(k => `<option value="${k}">${periodos[k].etiqueta}${periodos[k].fecha ? ' (' + periodos[k].fecha + ')' : ''}</option>`).join('');
  $('fPeriodo').value = periodos['ASIGNACION RANKING'] ? 'ASIGNACION RANKING' : claves[0];
  const todas = claves.flatMap(k => periodos[k].filas);
  const lista = k => [...new Set(todas.map(f => f[k]))].sort((a, b) => a.localeCompare(b));
  $('fEmpresa').innerHTML = '<option value="">Todas</option>' + lista('empresa').map(v => `<option>${v}</option>`).join('');
  $('fEquipo').innerHTML = '<option value="">Todos</option>' + lista('equipo').map(v => `<option>${v}</option>`).join('');
}

/* ---------- Filtrado ---------- */
function filtrar(filas) {
  const e = $('fEmpresa').value, q = $('fEquipo').value;
  const t = $('fBuscar').value.trim().toLowerCase(), act = $('fActivos').checked;
  return filas.filter(f =>
    (!e || f.empresa === e) && (!q || f.equipo === q) &&
    (!t || f.gestor.toLowerCase().includes(t)) && (!act || f.monto > 0));
}

/* ---------- Pintar todo ---------- */
function pintar() {
  if (!estado.data) return;
  const filas = filtrar(estado.data.periodos[$('fPeriodo').value].filas);
  kpis(filas); gTop(filas); gEquipo(filas); gTend(); gNivel(filas); tabla(filas);
}

function kpis(f) {
  const monto = suma(f, 'monto'), rec = suma(f, 'recaudo');
  const datos = [
    ['Gestores', miles(f.length)], ['Cuentas en cartera', miles(suma(f, 'cuentas'))],
    ['Importe en cartera', miles(monto)], ['Importe recibido', miles(rec)],
    ['Recuperación', monto ? pct(rec / monto) : '0%']
  ];
  $('kpis').innerHTML = datos.map(([t, v]) => `<div class="kpi"><span>${t}</span><b>${v}</b></div>`).join('');
}

/* ---------- Gráficos ---------- */
function dibujar(id, cfg) {
  estado.graf[id]?.destroy();
  Chart.defaults.color = css('--suave');
  Chart.defaults.borderColor = css('--linea');
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false }, cfg.options);
  estado.graf[id] = new Chart($(id), cfg);
}

function gTop(f) {
  const top = f.slice().sort((a, b) => b.recaudo - a.recaudo).slice(0, 10);
  dibujar('gTop', {
    type: 'bar',
    data: { labels: top.map(x => x.nombre), datasets: [{ label: 'Importe recibido', data: top.map(x => x.recaudo), backgroundColor: css('--primario'), borderRadius: 4 }] },
    options: {
      indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: c => 'Recuperación: ' + pct(top[c.dataIndex].pct) } } },
      scales: { x: { ticks: { callback: v => miles(v) } } }
    }
  });
}

function agrupar(f, k) {
  const m = {};
  f.forEach(x => { (m[x[k]] ||= { n: x[k], monto: 0, recaudo: 0 }); m[x[k]].monto += x.monto; m[x[k]].recaudo += x.recaudo; });
  return Object.values(m).map(g => ({ ...g, pct: g.monto ? g.recaudo / g.monto : 0 }));
}

function gEquipo(f) {
  const g = agrupar(f, 'equipo').sort((a, b) => b.pct - a.pct).slice(0, 12);
  dibujar('gEquipo', {
    type: 'bar',
    data: { labels: g.map(x => x.n), datasets: [{ label: '% recuperación', data: g.map(x => +(x.pct * 100).toFixed(2)), backgroundColor: css('--acento'), borderRadius: 4 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: v => v + '%' } } } }
  });
}

function gTend() {
  const { periodos, orden } = estado.data;
  const claves = orden.filter(k => periodos[k] && k !== 'ASIGNACION RANKING');
  const tot = claves.map(k => { const f = filtrar(periodos[k].filas); const m = suma(f, 'monto'), r = suma(f, 'recaudo'); return { r, p: m ? r / m * 100 : 0 }; });
  dibujar('gTend', {
    data: {
      labels: claves.map(k => periodos[k].etiqueta),
      datasets: [
        { type: 'bar', label: 'Importe recibido', data: tot.map(t => t.r), backgroundColor: css('--primario'), borderRadius: 4, yAxisID: 'y' },
        { type: 'line', label: '% recuperación', data: tot.map(t => +t.p.toFixed(2)), borderColor: css('--acento'), backgroundColor: css('--acento'), tension: .3, yAxisID: 'y1' }
      ]
    },
    options: {
      scales: {
        y: { ticks: { callback: v => miles(v) } },
        y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%' } }
      }
    }
  });
}

function gNivel(f) {
  const tramos = [['Menos de 5%', 0, .05], ['5% a 10%', .05, .1], ['10% a 20%', .1, .2], ['20% o más', .2, Infinity]];
  const cont = tramos.map(([, a, b]) => f.filter(x => x.pct >= a && x.pct < b).length);
  dibujar('gNivel', {
    type: 'doughnut',
    data: { labels: tramos.map(t => t[0]), datasets: [{ data: cont, backgroundColor: [css('--malo'), css('--acento'), '#6ba8a0', css('--primario')], borderWidth: 0 }] },
    options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } }
  });
}

/* ---------- Tabla ---------- */
const COLS = [
  ['nombre', 'Gestor', false], ['equipo', 'Equipo', false], ['empresa', 'Empresa', false],
  ['cuentas', 'Cuentas', true], ['monto', 'Cartera', true], ['recaudo', 'Recibido', true], ['pct', 'Recuperación', true]
];

function tabla(f) {
  const { k, d } = estado.orden;
  const ord = f.slice().sort((a, b) => (typeof a[k] === 'string' ? a[k].localeCompare(b[k]) : a[k] - b[k]) * d);
  const max = Math.max(0.0001, ...ord.map(x => x.pct));
  $('conteo').textContent = `${miles(ord.length)} gestores`;
  $('tabla').innerHTML =
    '<thead><tr>' + COLS.map(([c, t, n]) =>
      `<th tabindex="0" data-k="${c}" class="${n ? 'num' : ''}">${t}${c === k ? (d < 0 ? ' ▼' : ' ▲') : ''}</th>`).join('') + '</tr></thead><tbody>' +
    ord.map(x => `<tr title="${x.gestor}"><td>${x.nombre}</td><td>${x.equipo}</td><td>${x.empresa}</td>
      <td class="num">${miles(x.cuentas)}</td><td class="num">${miles(x.monto)}</td><td class="num">${miles(x.recaudo)}</td>
      <td class="num">${pct(x.pct)}<span class="barra"><i style="width:${x.pct / max * 100}%"></i></span></td></tr>`).join('') + '</tbody>';
}

function ordenar(e) {
  const th = e.target.closest('th');
  if (!th || (e.type === 'keydown' && e.key !== 'Enter')) return;
  const k = th.dataset.k;
  estado.orden = { k, d: estado.orden.k === k ? -estado.orden.d : -1 };
  pintar();
}

/* ---------- Eventos ---------- */
$('archivo').addEventListener('change', e => e.target.files[0] && cargar(e.target.files[0]));
['dragenter', 'dragover'].forEach(ev => $('zona').addEventListener(ev, e => { e.preventDefault(); $('zona').classList.add('sobre'); }));
['dragleave', 'drop'].forEach(ev => $('zona').addEventListener(ev, e => { e.preventDefault(); $('zona').classList.remove('sobre'); }));
$('zona').addEventListener('drop', e => e.dataTransfer.files[0] && cargar(e.dataTransfer.files[0]));
['fPeriodo', 'fEmpresa', 'fEquipo', 'fActivos'].forEach(id => $(id).addEventListener('change', pintar));
$('fBuscar').addEventListener('input', pintar);
$('tabla').addEventListener('click', ordenar);
$('tabla').addEventListener('keydown', ordenar);