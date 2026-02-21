importScripts('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');

self.onmessage = function (e) {
  const { buffer, neededColumns, keepAllColumns } = e.data;

  try {
    const wb = XLSX.read(buffer, {
      type: 'array',
      cellStyles: false,
      cellHTML: false,
      cellFormula: false,
      bookVBA: false,
      bookFiles: false,
      bookProps: false,
      sheetStubs: false,
      dense: false,
    });

    const ws = wb.Sheets[wb.SheetNames[0]];
    const allRows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });

    let rows;
    if (keepAllColumns) {
      rows = allRows;
    } else {
      const needed = new Set(neededColumns);
      rows = allRows.map(function (row) {
        var slim = {};
        var keys = Object.keys(row);
        for (var i = 0; i < keys.length; i++) {
          if (needed.has(keys[i])) slim[keys[i]] = row[keys[i]];
        }
        return slim;
      });
    }

    self.postMessage({ ok: true, rows: rows });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};
