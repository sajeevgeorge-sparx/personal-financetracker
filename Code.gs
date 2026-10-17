// ══════════════════════════════════════════════════════════════════
// Finance Tracker — Google Apps Script Backend
// ══════════════════════════════════════════════════════════════════
// SETUP:
//   1. Open Google Sheets → Extensions → Apps Script → paste this file
//   2. Deploy → New deployment → Type: Web app
//      Execute as: Me  |  Who has access: Anyone
//   3. Copy the Web App URL → paste in the Finance Tracker Sync modal
// ══════════════════════════════════════════════════════════════════

const SHEET_HEADERS = {
  Expenses:  ['month_key','id','name','amount','due','status','paidAmount','notes'],
  Templates: ['id','code','name','defaultAmount','dueDay','active'],
  RSU:       ['id','date','company','shares','price','proceeds','notes'],
  Assets:    ['id','category','name','value','sumAssured','unvestedRSU','commitment','commitFreq','status','notes'],
  TakeHome:  ['month_key','amount'],
};

// ── HTTP entry points ──────────────────────────────────────────────

function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || 'load';
    const cb     = e.parameter && e.parameter.callback; // JSONP support
    let result;
    if (action === 'load') result = readDB();
    else result = { error: 'Unknown action: ' + action };
    if (cb) {
      return ContentService
        .createTextOutput(cb + '(' + JSON.stringify(result) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonOut(result);
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'save') {
      writeDB(body.data);
      return jsonOut({ ok: true, ts: new Date().toISOString() });
    }
    return jsonOut({ error: 'Unknown action: ' + body.action });
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function jsonOut(obj) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

// ── Sheet helpers ──────────────────────────────────────────────────

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || createSheet(ss, name);
}

function createSheet(ss, name) {
  const sheet = ss.insertSheet(name);
  const headers = SHEET_HEADERS[name];
  if (headers) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    styleHeader(sheet, headers.length);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function styleHeader(sheet, cols) {
  sheet.getRange(1, 1, 1, cols)
    .setBackground('#1e3a5f')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
}

function writeSheet(name, rows) {
  const sheet = getSheet(name);
  sheet.clearContents();
  if (rows.length > 0) {
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    styleHeader(sheet, rows[0].length);
    sheet.setFrozenRows(1);
  }
}

// ── Read: Sheets → DB JSON ─────────────────────────────────────────

function readDB() {
  // Expenses (grouped by month_key)
  const expRows = getSheet('Expenses').getDataRange().getValues().slice(1);
  const expenses = {};
  expRows.forEach(([mk, id, name, amount, due, status, paidAmount, notes]) => {
    if (!mk) return;
    if (!expenses[mk]) expenses[mk] = [];
    expenses[mk].push({
      id:         String(id),
      name:       String(name),
      amount:     Number(amount)     || 0,
      due:        fmtDate(due),
      status:     String(status     || ''),
      paidAmount: Number(paidAmount) || 0,
      notes:      String(notes      || ''),
    });
  });

  // Templates
  const tplRows = getSheet('Templates').getDataRange().getValues().slice(1);
  const templates = tplRows
    .filter(r => r[0])
    .map(([id, code, name, defaultAmount, dueDay, active]) => ({
      id:            String(id),
      code:          String(code || ''),
      name:          String(name),
      defaultAmount: Number(defaultAmount) || 0,
      dueDay:        Number(dueDay)        || 1,
      active:        active === true || String(active).toUpperCase() === 'TRUE',
    }));

  // RSU
  const rsuRows = getSheet('RSU').getDataRange().getValues().slice(1);
  const rsu = rsuRows
    .filter(r => r[0])
    .map(([id, date, company, shares, price, proceeds, notes]) => ({
      id:       String(id),
      date:     fmtDate(date),
      company:  String(company || ''),
      shares:   Number(shares)   || 0,
      price:    Number(price)    || 0,
      proceeds: Number(proceeds) || 0,
      notes:    String(notes     || ''),
    }));

  // Assets
  const astRows = getSheet('Assets').getDataRange().getValues().slice(1);
  const assets = astRows
    .filter(r => r[0])
    .map(([id, category, name, value, sumAssured, unvestedRSU, commitment, commitFreq, status, notes]) => ({
      id:          String(id),
      category:    String(category    || ''),
      name:        String(name),
      value:       Number(value)       || 0,
      sumAssured:  Number(sumAssured)  || 0,
      unvestedRSU: Number(unvestedRSU) || 0,
      commitment:  Number(commitment)  || 0,
      commitFreq:  String(commitFreq   || ''),
      status:      String(status       || 'active'),
      notes:       String(notes        || ''),
    }));

  // TakeHome
  const thRows = getSheet('TakeHome').getDataRange().getValues().slice(1);
  const takeHome = {};
  thRows.filter(r => r[0]).forEach(([mk, amount]) => {
    takeHome[String(mk)] = Number(amount) || 0;
  });

  return { expenses, templates, rsu, assets, takeHome, _dataVersion: 4 };
}

// ── Write: DB JSON → Sheets ────────────────────────────────────────

function writeDB(data) {
  // Expenses
  const expRows = [SHEET_HEADERS.Expenses];
  Object.entries(data.expenses || {}).forEach(([mk, items]) => {
    (items || []).forEach(it =>
      expRows.push([mk, it.id, it.name, it.amount||0, it.due, it.status||'', it.paidAmount||0, it.notes||''])
    );
  });
  writeSheet('Expenses', expRows);

  // Templates
  const tplRows = [SHEET_HEADERS.Templates];
  (data.templates || []).forEach(t =>
    tplRows.push([t.id, t.code||'', t.name, t.defaultAmount||0, t.dueDay||1, t.active])
  );
  writeSheet('Templates', tplRows);

  // RSU
  const rsuRows = [SHEET_HEADERS.RSU];
  (data.rsu || []).forEach(r =>
    rsuRows.push([r.id, r.date, r.company||'', r.shares||0, r.price||0, r.proceeds||0, r.notes||''])
  );
  writeSheet('RSU', rsuRows);

  // Assets
  const astRows = [SHEET_HEADERS.Assets];
  (data.assets || []).forEach(a =>
    astRows.push([a.id, a.category, a.name, a.value||0, a.sumAssured||0, a.unvestedRSU||0, a.commitment||0, a.commitFreq||'', a.status||'active', a.notes||''])
  );
  writeSheet('Assets', astRows);

  // TakeHome
  const thRows = [SHEET_HEADERS.TakeHome];
  Object.entries(data.takeHome || {}).forEach(([mk, amt]) =>
    thRows.push([mk, amt||0])
  );
  writeSheet('TakeHome', thRows);
}

// ── Date formatter ─────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '';
  if (d instanceof Date) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(d);
}
