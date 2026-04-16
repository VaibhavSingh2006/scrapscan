let model = null,
  scanN = 0,
  lastPreds = [],
  lastConf = 0,
  lastKey = 'ferrous';

async function loadModel() {
  try {
    model = await mobilenet.load({ version: 2, alpha: 1.0 });
    setStatus('ready', 'MobileNet · Ready');
  } catch (e) {
    setStatus('offline', 'Offline mode');
  }
}
function setStatus(s, t) {
  document.getElementById('modelDot').className = 'dot ' + s;
  document.getElementById('modelLabel').textContent = t;
}

var fileIn = document.getElementById('fileIn');
var dropZone = document.getElementById('dropZone');

dropZone.addEventListener('dragover', function (e) {
  e.preventDefault();
  dropZone.classList.add('over');
});
dropZone.addEventListener('dragleave', function () {
  dropZone.classList.remove('over');
});
dropZone.addEventListener('drop', function (e) {
  e.preventDefault();
  dropZone.classList.remove('over');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileIn.addEventListener('change', function () {
  if (this.files[0]) handleFile(this.files[0]);
});

function handleFile(file) {
  var reader = new FileReader();
  reader.onload = function (ev) {
    document.getElementById('previewImg').src = ev.target.result;
    document.getElementById('previewName').textContent = file.name;
    document.getElementById('previewSize').textContent = fmtBytes(file.size);
    dropZone.classList.add('previewing');
    document.getElementById('resultImg').src = ev.target.result;
    document.getElementById('imgFilename').textContent = file.name;
    startScanAnimation(file.name);
  };
  reader.readAsDataURL(file);
}

function startScanAnimation(fileName) {
  var line = document.getElementById('scanLine');
  var overlay = document.getElementById('scanOverlay');
  var status = document.getElementById('scanStatus');
  var steps = [
    'Initializing scanner...',
    'Detecting material edges...',
    'Extracting feature vectors...',
    'Running MobileNet inference...',
    'Mapping scrap category...',
  ];
  line.classList.add('scanning');
  overlay.classList.add('scanning');
  status.textContent = steps[0];
  var idx = 1;
  var iv = setInterval(function () {
    if (idx < steps.length) {
      status.textContent = steps[idx++];
    }
  }, 900);
  setTimeout(function () {
    clearInterval(iv);
    line.classList.remove('scanning');
    overlay.classList.remove('scanning');
    line.style.top = '0';
    show('analyze');
    analyze();
  }, 5000);
}

function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

var msgs = [
  'Extracting feature vectors...',
  'Running MobileNet inference...',
  'Mapping scrap category...',
  'Building dashboard...',
];

async function analyze() {
  var i = 0;
  var iv = setInterval(function () {
    var el = document.getElementById('analyzeMsg');
    if (el) el.textContent = msgs[Math.min(i++, msgs.length - 1)];
  }, 700);
  var key = 'ferrous',
    preds = [],
    conf = 0;
  if (model) {
    var img = document.getElementById('resultImg');
    preds = await model.classify(img, 8);
    key = detect(preds);
    conf = Math.round(preds[0].probability * 100);
  }
  clearInterval(iv);
  lastPreds = preds;
  lastConf = conf;
  lastKey = key;
  scanN++;
  render(key, preds, conf);
}

function detect(preds) {
  var txt = preds
    .map(function (p) {
      return p.className.toLowerCase();
    })
    .join(' ');
  var scores = {};
  for (var k in SCRAP_DATA) {
    scores[k] = 0;
    var kws = SCRAP_DATA[k].keywords;
    for (var j = 0; j < kws.length; j++) {
      if (txt.indexOf(kws[j]) !== -1) scores[k]++;
    }
  }
  var best = Object.keys(scores).reduce(function (a, b) {
    return scores[a] >= scores[b] ? a : b;
  });
  if (scores[best] > 0) return best;
  try {
    var canvas = document.createElement('canvas'),
      img = document.getElementById('resultImg');
    canvas.width = 60;
    canvas.height = 60;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 60, 60);
    var d = ctx.getImageData(0, 0, 60, 60).data,
      rS = 0,
      gS = 0,
      bS = 0;
    for (var i = 0; i < d.length; i += 4) {
      rS += d[i];
      gS += d[i + 1];
      bS += d[i + 2];
    }
    var px = d.length / 4,
      r = rS / px / 255,
      g = gS / px / 255,
      b = bS / px / 255;
    var max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      delta = max - min,
      hue = 0;
    if (delta > 0) {
      if (max === r) hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else hue = 60 * ((r - g) / delta + 4);
    }
    hue = (hue + 360) % 360;
    var sat = max === 0 ? 0 : delta / max,
      light = (max + min) / 2;
    if (sat > 0.15 && light > 0.12) {
      if (hue >= 15 && hue < 80) return 'nonferrous';
      if (hue >= 80 && hue < 165) return light < 0.35 ? 'ewaste' : 'nonferrous';
      if (hue >= 270 && hue < 330) return 'ewaste';
    }
  } catch (e) {}
  return 'ferrous';
}

function render(key, preds, conf) {
  var c = SCRAP_DATA[key];
  var rs = document.documentElement.style;
  rs.setProperty('--ac', c.accent);
  rs.setProperty('--dim', c.dim);
  rs.setProperty('--bdr', c.border);
  rs.setProperty('--glw', c.glow);

  var bt =
    c.id === 'nonferrous'
      ? 'NON-FERROUS'
      : c.id === 'ewaste'
        ? 'E-WASTE'
        : c.id.toUpperCase();
  var badge = document.getElementById('catBadge');
  badge.textContent = bt + ' — IDENTIFIED';
  badge.style.cssText =
    'background:' +
    c.dim +
    ';color:' +
    c.accent +
    ';border:1px solid ' +
    c.border +
    ';';

  document.getElementById('scanNum').textContent = 'Scan #' + scanN;
  document.getElementById('catTitle').textContent = c.label;
  document.getElementById('catTitle').style.color = c.accent;
  document.getElementById('catSub').textContent = c.sublabel;
  document.getElementById('catDesc').textContent = c.description;
  document.getElementById('imgConf').textContent = conf
    ? conf + '% match'
    : 'Offline';

  var tr = document.getElementById('tags');
  tr.innerHTML = '';
  c.tags.forEach(function (t) {
    tr.innerHTML +=
      '<span class="tag" style="background:' +
      c.dim +
      ';color:' +
      c.accent +
      ';border:1px solid ' +
      c.border +
      ';">' +
      t +
      '</span>';
  });

  var pct = conf || 72,
    offset = 339 - (pct / 100) * 339;
  var gf = document.getElementById('gaugeFill');
  gf.setAttribute('stroke', c.accent);
  gf.style.strokeDashoffset = '339';
  document.getElementById('gaugePct').textContent = pct + '%';
  document.getElementById('gaugePct').style.color = c.accent;
  document.getElementById('gaugeMsg').textContent =
    pct >= 75
      ? 'Strong match'
      : pct >= 45
        ? 'Partial · verify'
        : 'Low · use override';
  setTimeout(function () {
    gf.style.strokeDashoffset = offset;
  }, 150);

  var sg = document.getElementById('statsGrid');
  sg.innerHTML = '';
  c.stats.forEach(function (s) {
    sg.innerHTML +=
      '<div class="stat-card"><div class="stat-bar" style="background:' +
      c.accent +
      ';"></div><div class="stat-label">' +
      s.label +
      '</div><div class="stat-val" style="color:' +
      c.accent +
      ';">' +
      s.value +
      '<span class="stat-unit">' +
      s.unit +
      '</span></div><div class="stat-note">' +
      s.note +
      '</div></div>';
  });

  var hz = document.getElementById('hazard');
  if (c.hazard) {
    hz.style.cssText =
      'display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:9px;background:' +
      c.dim +
      ';border:1px solid ' +
      c.border +
      ';margin-top:10px;';
    hz.innerHTML =
      '<div class="hz-icon" style="background:' +
      c.dim +
      ';border:1px solid ' +
      c.border +
      ';color:' +
      c.accent +
      ';">⚠</div><div><div class="hz-level" style="color:' +
      c.accent +
      ';">Hazard · ' +
      c.hazard.level +
      '</div><div class="hz-msg" style="color:' +
      c.accent +
      ';opacity:0.8;">' +
      c.hazard.message +
      '</div></div>';
  } else {
    hz.style.display = 'none';
    hz.innerHTML = '';
  }

  var ov = document.getElementById('overrideRow');
  ov.innerHTML = '<span class="override-label">CORRECT TO:</span>';
  Object.keys(SCRAP_DATA).forEach(function (kid) {
    var kc = SCRAP_DATA[kid],
      btn = document.createElement('button');
    btn.textContent = kc.label;
    var isActive = kid === key;
    btn.style.cssText =
      'font-size:12px;padding:6px 14px;border-radius:6px;border:1px solid ' +
      (isActive ? kc.border : 'rgba(255,255,255,0.1)') +
      ';background:' +
      (isActive ? kc.dim : 'rgba(255,255,255,0.03)') +
      ';color:' +
      (isActive ? kc.accent : '#6a6a80') +
      ';cursor:pointer;font-family:monospace;font-weight:' +
      (isActive ? 600 : 400) +
      ';transition:all 0.15s;white-space:nowrap;';
    btn.onmouseenter = function () {
      if (kid !== lastKey) {
        this.style.color = kc.accent;
        this.style.borderColor = kc.border;
        this.style.background = kc.dim;
      }
    };
    btn.onmouseleave = function () {
      if (kid !== lastKey) {
        this.style.color = '#6a6a80';
        this.style.borderColor = 'rgba(255,255,255,0.1)';
        this.style.background = 'rgba(255,255,255,0.03)';
      }
    };
    btn.onclick = function () {
      render(kid, lastPreds, lastConf);
    };
    ov.appendChild(btn);
  });

  var pl = document.getElementById('propList');
  pl.innerHTML = '';
  c.properties.forEach(function (p) {
    pl.innerHTML +=
      '<div class="list-item"><span class="li-dot" style="background:' +
      c.accent +
      ';"></span>' +
      p +
      '</div>';
  });

  var sl = document.getElementById('stepList');
  sl.innerHTML = '';
  c.handling.forEach(function (s, i) {
    sl.innerHTML +=
      '<div class="step-item"><span class="step-n" style="color:' +
      c.accent +
      ';">' +
      String(i + 1).padStart(2, '0') +
      '</span>' +
      s +
      '</div>';
  });

  var uc = document.getElementById('useCases');
  uc.innerHTML = '';
  c.useCases.forEach(function (u) {
    uc.innerHTML += '<span class="chip">' + u + '</span>';
  });

  var db = document.getElementById('detBars');
  db.innerHTML = '';
  if (preds.length) {
    preds.slice(0, 5).forEach(function (p) {
      var w = (p.probability * 100).toFixed(1);
      db.innerHTML +=
        '<div class="det-item"><div class="det-row"><span>' +
        p.className.split(',')[0] +
        '</span><span class="det-pct">' +
        w +
        '%</span></div><div class="bar-track"><div class="bar-fill" style="background:' +
        c.accent +
        ';" data-w="' +
        w +
        '"></div></div></div>';
    });
  } else {
    db.innerHTML =
      '<p class="offline-note">Connect internet for AI signals</p>';
  }

  setTimeout(function () {
    drawRadar(key, c);
    drawPriceChart(key);
    drawEnvChart(key, c);
    document.querySelectorAll('.bar-fill[data-w]').forEach(function (el) {
      el.style.width = el.dataset.w + '%';
    });
  }, 200);

  renderMetallurgy(key, c);
  initChat(key);
  show('result');
}

// ── RADAR ─────────────────────────────────────────────────────────────────────
var RADAR_AXES = [
  'Market Value',
  'Recyclability',
  'Availability',
  'Hazard Risk',
  'CO₂ Impact',
];
var RADAR_DATA = {
  ferrous: [35, 100, 100, 10, 60],
  nonferrous: [90, 100, 70, 20, 95],
  ewaste: [65, 60, 50, 90, 40],
  plastic: [20, 50, 80, 70, 45],
};
var CAT_COLORS = {
  ferrous: '#60A5FA',
  nonferrous: '#34d399',
  ewaste: '#F472B6',
  plastic: '#FB923C',
};

function buildRadarSVG(svgEl, activeKey, W, H) {
  svgEl.innerHTML = '';
  var cx = W / 2,
    cy = H / 2,
    R = Math.min(W, H) * 0.36,
    n = 5;
  function pt(val, ai, r) {
    var angle = ((Math.PI * 2) / n) * ai - Math.PI / 2,
      rv = r * (val / 100);
    return { x: cx + rv * Math.cos(angle), y: cy + rv * Math.sin(angle) };
  }
  [20, 40, 60, 80, 100].forEach(function (v) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var p = pt(v, i, R);
      pts.push(p.x + ',' + p.y);
    }
    var poly = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'polygon'
    );
    poly.setAttribute('points', pts.join(' '));
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', 'rgba(255,255,255,0.05)');
    poly.setAttribute('stroke-width', '1');
    svgEl.appendChild(poly);
  });
  for (var i = 0; i < n; i++) {
    var p = pt(100, i, R);
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', cx);
    line.setAttribute('y1', cy);
    line.setAttribute('x2', p.x);
    line.setAttribute('y2', p.y);
    line.setAttribute('stroke', 'rgba(255,255,255,0.08)');
    line.setAttribute('stroke-width', '1');
    svgEl.appendChild(line);
    var tp = pt(118, i, R);
    var txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', tp.x);
    txt.setAttribute('y', tp.y);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'middle');
    txt.setAttribute('font-size', '8');
    txt.setAttribute('fill', 'rgba(255,255,255,0.35)');
    txt.setAttribute('font-family', 'monospace');
    txt.textContent = RADAR_AXES[i];
    svgEl.appendChild(txt);
  }
  Object.keys(RADAR_DATA).forEach(function (k) {
    if (k === activeKey) return;
    var pts = [];
    RADAR_DATA[k].forEach(function (v, i) {
      var p = pt(v, i, R);
      pts.push(p.x + ',' + p.y);
    });
    var poly = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'polygon'
    );
    poly.setAttribute('points', pts.join(' '));
    poly.setAttribute('fill', CAT_COLORS[k] + '15');
    poly.setAttribute('stroke', CAT_COLORS[k] + '35');
    poly.setAttribute('stroke-width', '1');
    svgEl.appendChild(poly);
  });
  var pts = [];
  RADAR_DATA[activeKey].forEach(function (v, i) {
    var p = pt(v, i, R);
    pts.push(p.x + ',' + p.y);
  });
  var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', pts.join(' '));
  poly.setAttribute('fill', CAT_COLORS[activeKey] + '30');
  poly.setAttribute('stroke', CAT_COLORS[activeKey]);
  poly.setAttribute('stroke-width', '2');
  svgEl.appendChild(poly);
  RADAR_DATA[activeKey].forEach(function (v, i) {
    var p = pt(v, i, R);
    var circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circ.setAttribute('cx', p.x);
    circ.setAttribute('cy', p.y);
    circ.setAttribute('r', '3');
    circ.setAttribute('fill', CAT_COLORS[activeKey]);
    svgEl.appendChild(circ);
  });
}

function drawRadar(key, c) {
  var svg = document.getElementById('radarSvg');
  if (!svg) return;
  buildRadarSVG(svg, key, 260, 240);
  var leg = document.getElementById('radarLegend');
  if (!leg) return;
  leg.innerHTML = '';
  var labels = {
    ferrous: 'Ferrous',
    nonferrous: 'Non-Ferrous',
    ewaste: 'E-Waste',
    plastic: 'Plastic',
  };
  Object.keys(CAT_COLORS).forEach(function (k) {
    leg.innerHTML +=
      '<div class="radar-legend-item"><div class="radar-legend-dot" style="background:' +
      CAT_COLORS[k] +
      ';opacity:' +
      (k === key ? 1 : 0.4) +
      ';"></div><span style="opacity:' +
      (k === key ? 1 : 0.5) +
      ';font-weight:' +
      (k === key ? 600 : 400) +
      ';">' +
      labels[k] +
      '</span></div>';
  });
}

// ── PRICE CHART ───────────────────────────────────────────────────────────────
var PRICE_DATA = {
  ferrous: {
    label: 'Ferrous',
    val: 25,
    max: 400,
    color: '#60A5FA',
    display: '₹18-25/kg',
  },
  nonferrous: {
    label: 'Non-Ferrous',
    val: 250,
    max: 400,
    color: '#34d399',
    display: '₹80-400/kg',
  },
  ewaste: {
    label: 'E-Waste',
    val: 85,
    max: 400,
    color: '#F472B6',
    display: '₹20-150/kg',
  },
  plastic: {
    label: 'Plastic',
    val: 15,
    max: 400,
    color: '#FB923C',
    display: '₹5-25/kg',
  },
};

function buildPriceChart(container, activeKey) {
  container.innerHTML = '';
  Object.keys(PRICE_DATA).forEach(function (k) {
    var d = PRICE_DATA[k],
      pct = Math.round((d.val / d.max) * 100),
      isActive = k === activeKey;
    var row = document.createElement('div');
    row.className = 'price-row';
    row.innerHTML =
      '<div class="price-label" style="color:' +
      (isActive ? d.color : 'var(--t2)') +
      ';font-weight:' +
      (isActive ? 600 : 400) +
      ';">' +
      d.label +
      '</div>' +
      '<div class="price-bar-wrap"><div class="price-bar" style="background:' +
      (isActive ? d.color : d.color + '55') +
      ';width:0;" data-pw="' +
      pct +
      '"><span class="price-val">' +
      d.display +
      '</span></div></div>';
    container.appendChild(row);
  });
  setTimeout(function () {
    container.querySelectorAll('.price-bar[data-pw]').forEach(function (b) {
      b.style.width = b.dataset.pw + '%';
    });
  }, 300);
}

function drawPriceChart(key) {
  var el = document.getElementById('priceChart');
  if (!el) return;
  buildPriceChart(el, key);
}

// ── ENV CHART ─────────────────────────────────────────────────────────────────
var ENV_DATA = {
  ferrous: [
    { label: 'CO₂ Saved', val: 1.5, max: 10, unit: 'T/tonne' },
    { label: 'Energy Saved', val: 74, max: 100, unit: '%' },
    { label: 'Water Saved', val: 40, max: 100, unit: '%' },
    { label: 'Landfill Diverted', val: 85, max: 100, unit: '%' },
  ],
  nonferrous: [
    { label: 'CO₂ Saved', val: 9.5, max: 10, unit: 'T/tonne' },
    { label: 'Energy Saved', val: 95, max: 100, unit: '%' },
    { label: 'Water Saved', val: 70, max: 100, unit: '%' },
    { label: 'Landfill Diverted', val: 90, max: 100, unit: '%' },
  ],
  ewaste: [
    { label: 'CO₂ Saved', val: 2.0, max: 10, unit: 'T/tonne' },
    { label: 'Precious Metal Recovery', val: 60, max: 100, unit: '%' },
    { label: 'Hazardous Waste Prevented', val: 80, max: 100, unit: '%' },
    { label: 'Landfill Diverted', val: 70, max: 100, unit: '%' },
  ],
  plastic: [
    { label: 'CO₂ Saved', val: 1.8, max: 10, unit: 'T/tonne' },
    { label: 'Energy Saved', val: 65, max: 100, unit: '%' },
    { label: 'Ocean Plastic Prevented', val: 55, max: 100, unit: '%' },
    { label: 'Landfill Diverted', val: 60, max: 100, unit: '%' },
  ],
};

function buildEnvChart(container, key, c) {
  container.innerHTML = '';
  ENV_DATA[key].forEach(function (row) {
    var pct = Math.round((row.val / row.max) * 100);
    var div = document.createElement('div');
    div.className = 'env-row';
    div.innerHTML =
      '<div class="env-row-head"><span class="env-metric">' +
      row.label +
      '</span><span class="env-val" style="color:' +
      c.accent +
      ';">' +
      row.val +
      ' ' +
      row.unit +
      '</span></div>' +
      '<div class="env-track"><div class="env-fill" style="background:' +
      c.accent +
      ';" data-ew="' +
      pct +
      '"></div></div>';
    container.appendChild(div);
  });
  setTimeout(function () {
    container.querySelectorAll('.env-fill[data-ew]').forEach(function (f) {
      f.style.width = f.dataset.ew + '%';
    });
  }, 400);
}

function drawEnvChart(key, c) {
  var el = document.getElementById('envChart');
  if (!el) return;
  buildEnvChart(el, key, c);
}

// ── ZOOM MODAL ────────────────────────────────────────────────────────────────
function openModal(cardEl) {
  var overlay = document.getElementById('zoomOverlay');
  var content = document.getElementById('zoomContent');
  var clone = cardEl.cloneNode(true);
  var hint = clone.querySelector('.zoom-hint');
  if (hint) hint.remove();
  clone.removeAttribute('ondblclick');
  clone.style.cssText =
    'background:transparent;border:none;padding:0;border-radius:0;transform:none;box-shadow:none;';
  content.innerHTML = '';
  content.appendChild(clone);
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  setTimeout(function () {
    clone.querySelectorAll('.bar-fill[data-w]').forEach(function (el) {
      el.style.width = '0';
      setTimeout(function () {
        el.style.width = el.dataset.w + '%';
      }, 50);
    });
    clone.querySelectorAll('.price-bar[data-pw]').forEach(function (el) {
      el.style.width = '0';
      setTimeout(function () {
        el.style.width = el.dataset.pw + '%';
      }, 100);
    });
    clone.querySelectorAll('.env-fill[data-ew]').forEach(function (el) {
      el.style.width = '0';
      setTimeout(function () {
        el.style.width = el.dataset.ew + '%';
      }, 150);
    });
    clone.querySelectorAll('.thermal-bar[data-tw]').forEach(function (el) {
      el.style.width = '0';
      setTimeout(function () {
        el.style.width = el.dataset.tw + '%';
      }, 200);
    });
    clone.querySelectorAll('.comp-bar[data-cw]').forEach(function (el) {
      el.style.width = '0';
      setTimeout(function () {
        el.style.width = el.dataset.cw + '%';
      }, 200);
    });
    clone
      .querySelectorAll('.grade-quality-fill[data-gq]')
      .forEach(function (el) {
        el.style.height = '0';
        setTimeout(function () {
          el.style.height = el.dataset.gq + '%';
        }, 200);
      });
    var svgClone = clone.querySelector('svg[id]');
    if (svgClone && svgClone.id === 'radarSvg') {
      svgClone.removeAttribute('id');
      svgClone.setAttribute('width', '100%');
      svgClone.setAttribute('height', '320');
      svgClone.setAttribute('viewBox', '0 0 500 320');
      buildRadarSVG(svgClone, lastKey, 500, 320);
    }
    var priceClone = clone.querySelector('#priceChart');
    if (priceClone) {
      priceClone.removeAttribute('id');
      buildPriceChart(priceClone, lastKey);
    }
    var envClone = clone.querySelector('#envChart');
    if (envClone) {
      envClone.removeAttribute('id');
      buildEnvChart(envClone, lastKey, SCRAP_DATA[lastKey]);
    }
  }, 50);
}

function closeModal() {
  var overlay = document.getElementById('zoomOverlay');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeModal();
});

// ── SECTIONS ──────────────────────────────────────────────────────────────────
function show(sec) {
  document.getElementById('heroPage').style.display =
    sec === 'hero' ? 'flex' : 'none';
  document.getElementById('analyzePage').style.display =
    sec === 'analyze' ? 'flex' : 'none';
  document.getElementById('resultPage').style.display =
    sec === 'result' ? 'block' : 'none';
  if (sec === 'result') window.scrollTo(0, 0);
}

function goHome() {
  document.documentElement.style.setProperty('--ac', '#60A5FA');
  document.documentElement.style.setProperty('--dim', 'rgba(96,165,250,0.1)');
  document.documentElement.style.setProperty('--bdr', 'rgba(96,165,250,0.3)');
  document.documentElement.style.setProperty('--glw', 'rgba(96,165,250,0.08)');
  dropZone.classList.remove('previewing');
  fileIn.value = '';
  show('hero');
}

// ── METALLURGY PANELS ─────────────────────────────────────────────────────────

function renderMetallurgy(key, c) {
  renderPhase(key, c);
  renderMicrostructure(key, c);
  renderThermal(key, c);
  renderComposition(key, c);
  renderFurnace(key, c);
  renderContamination(key, c);
  renderGrades(key, c);
  renderCarbon(key, c);
  renderStandards(key, c);
}

function renderPhase(key, c) {
  var d = SCRAP_DATA[key].phase;
  document.getElementById('phaseTitle').textContent = d.title;
  document.getElementById('phaseSystem').textContent = d.system;
  var el = document.getElementById('phaseContent');
  var html = '';
  html += '<div class="meta-kv-row" style="margin-bottom:10px;">';
  html +=
    '<div class="meta-kv"><span class="meta-k">System</span><span class="meta-v" style="color:' +
    c.accent +
    '">' +
    d.system +
    '</span></div>';
  html +=
    '<div class="meta-kv"><span class="meta-k">Region</span><span class="meta-v" style="color:' +
    c.accent +
    '">' +
    d.region +
    '</span></div>';
  html +=
    '<div class="meta-kv"><span class="meta-k">Composition</span><span class="meta-v">' +
    d.carbonRange +
    '</span></div>';
  html +=
    '<div class="meta-kv"><span class="meta-k">Key Point</span><span class="meta-v">' +
    d.eutectoidPoint +
    '</span></div>';
  html += '</div>';
  html +=
    '<div class="meta-section-label" style="color:' +
    c.accent +
    '">Phases Present</div>';
  html += '<div class="meta-phase-list">';
  d.phases.forEach(function (p, i) {
    html +=
      '<div class="meta-phase-item" style="animation-delay:' +
      i * 80 +
      'ms;border-color:' +
      c.border +
      ';background:' +
      c.dim +
      '"><span class="meta-phase-dot" style="background:' +
      c.accent +
      '"></span>' +
      p +
      '</div>';
  });
  html += '</div>';
  html +=
    '<div class="meta-section-label" style="color:' +
    c.accent +
    ';margin-top:10px;">Temperature Lines</div>';
  html += '<div class="phase-temp-list">';
  d.tempLines.forEach(function (t, i) {
    html +=
      '<div class="phase-temp-row" style="animation-delay:' + i * 60 + 'ms">';
    html += '<div class="phase-temp-label">' + t.label + '</div>';
    html +=
      '<div class="phase-temp-val" style="color:' +
      c.accent +
      '">' +
      t.temp +
      '°C</div>';
    html += '<div class="phase-temp-note">' + t.note + '</div>';
    html += '</div>';
  });
  html += '</div>';
  html += '<div class="meta-note">' + d.note + '</div>';
  el.innerHTML = html;
}

function renderMicrostructure(key, c) {
  var d = SCRAP_DATA[key].microstructure;
  document.getElementById('microDominant').textContent = d.dominant;
  var el = document.getElementById('microContent');
  var html = '';
  html += '<div class="meta-kv-row">';
  html +=
    '<div class="meta-kv"><span class="meta-k">Dominant</span><span class="meta-v" style="color:' +
    c.accent +
    '">' +
    d.dominant +
    '</span></div>';
  html +=
    '<div class="meta-kv"><span class="meta-k">Grain Size</span><span class="meta-v">' +
    d.grainSize +
    '</span></div>';
  html +=
    '<div class="meta-kv"><span class="meta-k">Hardness</span><span class="meta-v">' +
    d.hardness +
    '</span></div>';
  html += '</div>';
  html +=
    '<div class="meta-section-label" style="color:' +
    c.accent +
    '">Likely Microstructures</div>';
  d.likely.forEach(function (m, i) {
    html +=
      '<div class="micro-item" style="animation-delay:' +
      i * 70 +
      'ms;border-left-color:' +
      c.accent +
      '">';
    html +=
      '<span class="micro-num" style="background:' +
      c.dim +
      ';border-color:' +
      c.border +
      ';color:' +
      c.accent +
      '">' +
      (i + 1) +
      '</span>';
    html += '<span>' + m + '</span></div>';
  });
  html += '<div class="meta-note">' + d.note + '</div>';
  el.innerHTML = html;
}

function renderThermal(key, c) {
  var d = SCRAP_DATA[key].thermalWindow;
  var maxTemp = d.zones[d.zones.length - 1].temp;
  document.getElementById('thermalSub').textContent =
    'Range: 0 – ' + maxTemp + d.unit;
  var el = document.getElementById('thermalContent');
  var html = '<div class="thermal-chart">';
  d.zones.forEach(function (z, i) {
    html +=
      '<div class="thermal-row" style="animation-delay:' + i * 80 + 'ms">';
    html += '<div class="thermal-label">' + z.label + '</div>';
    html +=
      '<div class="thermal-bar-wrap"><div class="thermal-bar" style="width:0%;background:' +
      z.color +
      ';" data-tw="' +
      z.pct +
      '"></div></div>';
    html +=
      '<div class="thermal-val" style="color:' +
      z.color +
      '">' +
      z.temp +
      '°C</div>';
    html += '</div>';
  });
  html += '</div>';
  html += '<div class="meta-note">' + d.note + '</div>';
  el.innerHTML = html;
  setTimeout(function () {
    el.querySelectorAll('.thermal-bar[data-tw]').forEach(function (b) {
      b.style.width = b.dataset.tw + '%';
    });
  }, 300);
}

function renderComposition(key, c) {
  var d = SCRAP_DATA[key].composition;
  var el = document.getElementById('compContent');
  var html = '';
  d.forEach(function (item, i) {
    var barW = Math.min(Math.max(item.pct, 3), 100);
    html += '<div class="comp-row" style="animation-delay:' + i * 80 + 'ms">';
    html +=
      '<div class="comp-element" style="background:' +
      item.color +
      '20;border:1px solid ' +
      item.color +
      '50;color:' +
      item.color +
      '">' +
      item.element +
      '</div>';
    html +=
      '<div class="comp-bar-wrap"><div class="comp-bar" style="background:' +
      item.color +
      ';width:0%;" data-cw="' +
      barW +
      '"></div></div>';
    html += '<div class="comp-range">' + item.range + '</div>';
    html += '<div class="comp-note">' + item.note + '</div>';
    html += '</div>';
  });
  el.innerHTML = html;
  setTimeout(function () {
    el.querySelectorAll('.comp-bar[data-cw]').forEach(function (b) {
      b.style.width = b.dataset.cw + '%';
    });
  }, 300);
}

function renderFurnace(key, c) {
  var d = SCRAP_DATA[key].furnaceCompat;
  var el = document.getElementById('furnaceContent');
  var compatColors = {
    excellent: '#34d399',
    good: '#60A5FA',
    limited: '#f59e0b',
    none: '#ef4444',
  };
  var compatIcons = { excellent: '✓✓', good: '✓', limited: '~', none: '✗' };
  var html = '';
  d.forEach(function (f, i) {
    var col = compatColors[f.compat] || '#7a7a90';
    var icon = compatIcons[f.compat] || '?';
    html +=
      '<div class="furnace-row" style="animation-delay:' + i * 70 + 'ms">';
    html +=
      '<div class="furnace-compat" style="background:' +
      col +
      '20;border:1px solid ' +
      col +
      '50;color:' +
      col +
      '">' +
      icon +
      '</div>';
    html +=
      '<div class="furnace-info"><div class="furnace-name">' +
      f.name +
      '</div><div class="furnace-note">' +
      f.note +
      '</div></div>';
    html +=
      '<div class="furnace-badge" style="background:' +
      col +
      '18;border:1px solid ' +
      col +
      '40;color:' +
      col +
      '">' +
      f.compat +
      '</div>';
    html += '</div>';
  });
  el.innerHTML = html;
}

function renderContamination(key, c) {
  var d = SCRAP_DATA[key].contamination;
  var el = document.getElementById('contamContent');
  var html = '';
  d.forEach(function (item, i) {
    html +=
      '<div class="contam-card" style="animation-delay:' +
      i * 80 +
      'ms;border-left-color:' +
      item.color +
      ';background:' +
      item.color +
      '08">';
    html +=
      '<div class="contam-top"><span class="contam-name">' +
      item.contaminant +
      '</span>';
    html +=
      '<span class="contam-risk" style="background:' +
      item.color +
      '20;border:1px solid ' +
      item.color +
      '50;color:' +
      item.color +
      '">' +
      item.risk +
      '</span></div>';
    html += '<div class="contam-effect">' + item.effect + '</div>';
    html += '</div>';
  });
  el.innerHTML = html;
}

function renderGrades(key, c) {
  var d = SCRAP_DATA[key].grades;
  var el = document.getElementById('gradeContent');
  var html = '';
  d.forEach(function (g, i) {
    html += '<div class="grade-row" style="animation-delay:' + i * 70 + 'ms">';
    html +=
      '<div class="grade-bar-col"><div class="grade-quality-bar"><div class="grade-quality-fill" style="height:0%;background:' +
      c.accent +
      ';" data-gq="' +
      g.quality +
      '"></div></div>';
    html +=
      '<div class="grade-quality-pct" style="color:' +
      c.accent +
      '">' +
      g.quality +
      '</div></div>';
    html +=
      '<div class="grade-info"><div class="grade-name" style="color:' +
      c.accent +
      '">' +
      g.grade +
      '</div><div class="grade-desc">' +
      g.desc +
      '</div></div>';
    html +=
      '<div class="grade-value" style="color:' +
      c.accent +
      '">' +
      g.value +
      '</div>';
    html += '</div>';
  });
  el.innerHTML = html;
  setTimeout(function () {
    el.querySelectorAll('.grade-quality-fill[data-gq]').forEach(function (b) {
      b.style.height = b.dataset.gq + '%';
    });
  }, 400);
}

function renderCarbon(key, c) {
  var d = SCRAP_DATA[key].carbonCalc;
  var el = document.getElementById('carbonContent');
  el.innerHTML =
    '<div class="carbon-input-row">' +
    '<input class="carbon-input" id="carbonKg" type="number" placeholder="Enter weight (kg)" min="1" oninput="calcCarbon(\'' +
    key +
    '\')"/>' +
    '<span class="carbon-unit" style="color:' +
    c.accent +
    '">kg</span>' +
    '</div>' +
    '<div class="carbon-results" id="carbonResults">' +
    '<div class="carbon-result-card" style="border-color:' +
    c.border +
    ';background:' +
    c.dim +
    '">' +
    '<div class="carbon-result-icon">🌍</div>' +
    '<div class="carbon-result-val" id="cCO2" style="color:' +
    c.accent +
    '">--</div>' +
    '<div class="carbon-result-label">kg CO₂ Saved</div>' +
    '</div>' +
    '<div class="carbon-result-card" style="border-color:' +
    c.border +
    ';background:' +
    c.dim +
    '">' +
    '<div class="carbon-result-icon">⚡</div>' +
    '<div class="carbon-result-val" id="cEnergy" style="color:' +
    c.accent +
    '">--</div>' +
    '<div class="carbon-result-label">kWh Energy Saved</div>' +
    '</div>' +
    '<div class="carbon-result-card" style="border-color:' +
    c.border +
    ';background:' +
    c.dim +
    '">' +
    '<div class="carbon-result-icon">💧</div>' +
    '<div class="carbon-result-val" id="cWater" style="color:' +
    c.accent +
    '">--</div>' +
    '<div class="carbon-result-label">Litres Water Saved</div>' +
    '</div>' +
    '<div class="carbon-result-card" style="border-color:rgba(52,211,153,0.3);background:rgba(52,211,153,0.08)">' +
    '<div class="carbon-result-icon">🌳</div>' +
    '<div class="carbon-result-val" id="cTrees" style="color:#34d399">--</div>' +
    '<div class="carbon-result-label">Trees Equivalent</div>' +
    '</div>' +
    '</div>' +
    '<div class="carbon-note">Based on recycling vs. virgin production lifecycle analysis (LCA).</div>';
}

function calcCarbon(key) {
  var d = SCRAP_DATA[key].carbonCalc;
  var kg = parseFloat(document.getElementById('carbonKg').value) || 0;
  var tonne = kg / 1000;
  document.getElementById('cCO2').textContent = (
    tonne *
    d.co2PerTonne *
    1000
  ).toFixed(1);
  document.getElementById('cEnergy').textContent = (
    tonne * d.energyPerTonne
  ).toFixed(0);
  document.getElementById('cWater').textContent = (
    tonne *
    d.waterPerTonne *
    1000
  ).toFixed(0);
  document.getElementById('cTrees').textContent = Math.round(
    tonne * d.co2PerTonne * d.treesEquiv
  );
}

function renderStandards(key, c) {
  var d = SCRAP_DATA[key].standards;
  var el = document.getElementById('standardsBar');
  var html =
    '<div class="std-label">Standards & Regulations</div><div class="std-list">';
  d.forEach(function (s) {
    html +=
      '<div class="std-chip" style="border-color:' +
      c.border +
      ';background:' +
      c.dim +
      '">';
    html +=
      '<span class="std-code" style="color:' +
      c.accent +
      '">' +
      s.code +
      '</span>';
    html += '<span class="std-body">' + s.body + '</span>';
    html += '<span class="std-desc">' + s.desc + '</span>';
    html += '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

// ── HERO ENHANCEMENTS ─────────────────────────────────────────────────────────

// 1. Animated counters
function startCounters() {
  document.querySelectorAll('.hs-val[data-count]').forEach(function (el) {
    var target = parseInt(el.dataset.count);
    var suffix = el.dataset.suffix || '';
    var start = 0;
    var duration = 1800;
    var step = target / (duration / 16);
    var current = 0;
    var iv = setInterval(function () {
      current = Math.min(current + step, target);
      el.textContent = Math.round(current) + suffix;
      if (current >= target) clearInterval(iv);
    }, 16);
  });
}

// 2. Particle canvas
function initParticles() {
  var canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W,
    H,
    particles = [];

  function resize() {
    W = canvas.width = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (var i = 0; i < 55; i++) {
    particles.push({
      x: Math.random() * 1400,
      y: Math.random() * 900,
      r: Math.random() * 1.5 + 0.4,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.4 - 0.1,
      alpha: Math.random() * 0.5 + 0.1,
      color: ['#60A5FA', '#34d399', '#F472B6', '#FB923C', '#ffffff'][
        Math.floor(Math.random() * 5)
      ],
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -5) {
        p.y = H + 5;
        p.x = Math.random() * W;
      }
      if (p.x < -5) p.x = W + 5;
      if (p.x > W + 5) p.x = -5;
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  draw();
}

// Run on page load
window.addEventListener('load', function () {
  startCounters();
  initParticles();
});

loadModel();
