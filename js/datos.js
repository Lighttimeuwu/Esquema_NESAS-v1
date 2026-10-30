/* datos.js: lee el Excel, limpia y entrega filas homogéneas por periodo.
   Las hojas de reporte (COMISION STAFF, RANKING, etc.) usan fórmulas sin valores guardados,
   por eso se recalcula todo desde las hojas base. */
const Datos = (() => {
  // Hojas base, en orden cronológico (RANKING es acumulado y no entra en la evolución)
  const HOJAS = {
    'FESTIVO 1': 'Festivo 1',
    'DOMINGO 1': 'Domingo 1',
    'DOMINGO 2': 'Domingo 2',
    'DOMINGO 3': 'Domingo 3',
    'ASIGNACION': 'Asignación del día',
    'ASIGNACION RANKING': 'Ranking acumulado'
  };

  const num = v => {
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v ?? '').replace(/[%\s,]/g, ''));
    return isNaN(n) ? 0 : n;
  };
  const texto = v => String(v ?? '').trim();
  const fecha = v => (v instanceof Date ? v.toISOString().slice(0, 10) : texto(v));
  const nombre = s => (/\((.*)\)/.exec(s) || [, s])[1].trim();
  const codigo = s => s.split('(')[0].trim();

  function leerHoja(ws) {
    const m = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const h = m.findIndex(r => r.some(c => texto(c) === 'Gestor de cobranza'));
    if (h < 0) return null;
    const col = n => m[h].findIndex(c => texto(c) === n);
    const ix = {
      emp: col('Empresa de cobranza'), ges: col('Gestor de cobranza'), eq: col('Equipo'),
      cue: col('N.º de pedidos en cartera'), mon: col('Importe de pedidos en cartera'),
      rec: col('Importe efectivamente recibido (total)')
    };
    const filas = [];
    let f = '';
    for (const r of m.slice(h + 1)) {
      const g = texto(r[ix.ges]);
      if (!g || g === 'Gestor de cobranza') continue; // vacías o encabezados repetidos
      if (!f) f = fecha(r[0]);
      const monto = num(r[ix.mon]), recaudo = num(r[ix.rec]);
      filas.push({
        gestor: g, nombre: nombre(g), codigo: codigo(g),
        equipo: nombre(texto(r[ix.eq])) || 'Sin equipo',
        empresa: texto(r[ix.emp]).replace(/_/g, ' ') || 'Sin empresa',
        cuentas: num(r[ix.cue]), monto, recaudo,
        pct: monto > 0 ? recaudo / monto : 0
      });
    }
    return { fecha: f, filas };
  }

  async function leer(archivo) {
    const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: true });
    const periodos = {}, avisos = [];
    for (const clave in HOJAS) {
      const hoja = wb.SheetNames.find(n => n.trim().toUpperCase() === clave);
      if (!hoja) { avisos.push(`No se encontró la hoja ${clave}.`); continue; }
      const d = leerHoja(wb.Sheets[hoja]);
      if (!d || !d.filas.length) { avisos.push(`La hoja ${clave} no tiene datos y se omitió.`); continue; }
      periodos[clave] = { clave, etiqueta: HOJAS[clave], fecha: d.fecha, filas: d.filas };
    }
    if (!Object.keys(periodos).length) throw new Error('No se encontraron hojas con la columna "Gestor de cobranza".');
    return { periodos, avisos, orden: Object.keys(HOJAS) };
  }

  return { leer };
})();