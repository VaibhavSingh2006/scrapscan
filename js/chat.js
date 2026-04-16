// ── ScrapScan AI Chatbot — OpenRouter ─────────────────────────────────────────
var OPENROUTER_MODEL = 'arcee-ai/trinity-large-preview:free';

var chatIsOpen = false;
var chatHistory = [];
var chatMaterial = null;

var SUGGESTIONS = {
  ferrous: [
    '💰 What is current ferrous scrap price in India?',
    '🏭 Which steel plants buy HMS1 grade scrap?',
    '⬆️ How do I increase grade before selling?',
    '🚛 How to transport heavy scrap legally?',
  ],
  nonferrous: [
    '💰 What is copper wire worth per kg today?',
    '🔧 How to separate copper from brass quickly?',
    '🏙️ Which cities have best non-ferrous buyers?',
    '⚡ How to strip cable insulation efficiently?',
  ],
  ewaste: [
    '🥇 How to recover gold from PCBs?',
    '📋 What are E-Waste Rules 2022 requirements?',
    '🏢 Which certified e-recyclers operate in India?',
    '🧤 What PPE is mandatory for e-waste handling?',
  ],
  plastic: [
    '🔍 How to identify PVC vs HDPE plastic?',
    '💰 Which polymer type has highest resale value?',
    '⚠️ How to prevent furnace contamination from plastic?',
    '♻️ Which plastic recyclers operate in India?',
  ],
};

// ── Toggle panel ──────────────────────────────────────────────────────────────
function toggleChat() {
  var panel = document.getElementById('chatPanel');
  var fab = document.getElementById('chatFab');
  chatIsOpen = !chatIsOpen;
  if (chatIsOpen) {
    panel.classList.add('open');
    fab.style.display = 'none';
    document.getElementById('chatInput').focus();
  } else {
    panel.classList.remove('open');
    fab.style.display = 'flex';
  }
}

// ── Called from render() after every scan ────────────────────────────────────
function initChat(key) {
  chatMaterial = key;
  chatHistory = [];

  var c = SCRAP_DATA[key];
  var fab = document.getElementById('chatFab');

  fab.style.display = 'flex';
  fab.style.background = c.accent;
  fab.style.boxShadow = '0 8px 30px ' + c.glow + ', 0 0 0 1px ' + c.border;

  var avatar = document.getElementById('chatAvatar');
  avatar.style.background = c.dim;
  avatar.style.borderColor = c.border;
  avatar.style.boxShadow = '0 0 16px ' + c.glow;
  avatar.querySelector('svg').style.stroke = c.accent;

  var ctx = document.getElementById('chatContext');
  ctx.style.background = c.dim;
  ctx.style.borderColor = c.border;
  ctx.style.color = c.accent;
  ctx.style.boxShadow = '0 0 12px ' + c.glow;
  ctx.innerHTML =
    '<span class="chat-context-dot" style="background:' +
    c.accent +
    ';"></span>' +
    'Context: <strong>' +
    c.label +
    '</strong> · ' +
    c.sublabel +
    ' · ₹' +
    c.stats[0].value +
    c.stats[0].unit;

  var msgs = document.getElementById('chatMessages');
  msgs.innerHTML =
    '<div class="chat-welcome">' +
    '<div class="chat-welcome-glow" style="background:' +
    c.dim +
    ';border-color:' +
    c.border +
    ';box-shadow:0 0 30px ' +
    c.glow +
    ';">⚗</div>' +
    '<h3>' +
    c.label +
    ' detected</h3>' +
    '<p>Ask me anything — pricing, microstructure, furnace compatibility, contamination risks, regulations, safety or processing methods.</p>' +
    '</div>';

  var suggWrap = document.getElementById('chatSuggWrap');
  var suggList = document.getElementById('chatSuggList');
  suggList.innerHTML = '';
  suggWrap.style.display = 'block';

  (SUGGESTIONS[key] || []).forEach(function (s) {
    var btn = document.createElement('button');
    btn.className = 'chat-sugg';
    btn.textContent = s;
    btn.onclick = function () {
      suggWrap.style.display = 'none';
      sendMsg(s);
    };
    suggList.appendChild(btn);
  });

  document.getElementById('chatSendBtn').style.background = c.accent;
}

// ── Build system prompt — full metallurgical context ─────────────────────────
function buildPrompt(key) {
  var c = SCRAP_DATA[key];
  var comp = c.composition
    .map(function (x) {
      return x.element + '(' + x.range + ', ' + x.note + ')';
    })
    .join(', ');
  var furnace = c.furnaceCompat
    .map(function (x) {
      return x.name + ': ' + x.compat + ' — ' + x.note;
    })
    .join(' | ');
  var contam = c.contamination
    .map(function (x) {
      return x.contaminant + ' [' + x.risk + ']: ' + x.effect;
    })
    .join(' | ');
  var grades = c.grades
    .map(function (x) {
      return x.grade + ' (' + x.desc + ') = ' + x.value;
    })
    .join(' | ');
  var stds = c.standards
    .map(function (x) {
      return x.code + ' (' + x.body + '): ' + x.desc;
    })
    .join(' | ');
  var phases = c.phase.phases.join(', ');
  var tempLines = c.phase.tempLines
    .map(function (t) {
      return t.label + ': ' + t.temp + '°C (' + t.note + ')';
    })
    .join(', ');
  var microList = c.microstructure.likely.join(' | ');

  return (
    'You are an expert industrial scrap material consultant AND metallurgist with 20 years of experience ' +
    'in the Indian recycling, metals and steel industry.\n\n' +
    'The user has just scanned a piece of scrap. Here is the COMPLETE material profile:\n\n' +
    '── BASIC INFO ──\n' +
    'Material: ' +
    c.label +
    ' (' +
    c.sublabel +
    ')\n' +
    'Description: ' +
    c.description +
    '\n' +
    'Tags: ' +
    c.tags.join(', ') +
    '\n' +
    'Properties: ' +
    c.properties.join(' | ') +
    '\n' +
    'Handling Protocol: ' +
    c.handling.join(' → ') +
    '\n' +
    (c.hazard
      ? 'HAZARD (' + c.hazard.level + '): ' + c.hazard.message + '\n'
      : 'No specific hazard.\n') +
    '\n── MARKET DATA ──\n' +
    'Market Value: ' +
    c.stats[0].value +
    ' ' +
    c.stats[0].unit +
    ' (' +
    c.stats[0].note +
    ')\n' +
    'Recyclability: ' +
    c.stats[1].value +
    '\n' +
    'CO2 Saving: ' +
    c.stats[2].value +
    ' ' +
    c.stats[2].unit +
    ' vs virgin production\n' +
    'Carbon Impact: CO2=' +
    c.carbonCalc.co2PerTonne +
    'T/tonne | Energy=' +
    c.carbonCalc.energyPerTonne +
    'kWh/tonne | Water=' +
    c.carbonCalc.waterPerTonne +
    'kL/tonne\n' +
    'Grade Ladder: ' +
    grades +
    '\n' +
    '\n── METALLURGICAL DATA ──\n' +
    'Phase System: ' +
    c.phase.system +
    '\n' +
    'Phase Region: ' +
    c.phase.region +
    '\n' +
    'Composition Range: ' +
    c.phase.carbonRange +
    '\n' +
    'Key Phase Point: ' +
    c.phase.eutectoidPoint +
    '\n' +
    'Phases Present: ' +
    phases +
    '\n' +
    'Temperature Lines: ' +
    tempLines +
    '\n' +
    'Phase Note: ' +
    c.phase.note +
    '\n' +
    '\n── MICROSTRUCTURE ──\n' +
    'Dominant: ' +
    c.microstructure.dominant +
    '\n' +
    'Grain Size: ' +
    c.microstructure.grainSize +
    '\n' +
    'Hardness: ' +
    c.microstructure.hardness +
    '\n' +
    'Likely Microstructures: ' +
    microList +
    '\n' +
    'Note: ' +
    c.microstructure.note +
    '\n' +
    '\n── ALLOY COMPOSITION ──\n' +
    comp +
    '\n' +
    '\n── FURNACE COMPATIBILITY ──\n' +
    furnace +
    '\n' +
    '\n── CONTAMINATION RISKS ──\n' +
    contam +
    '\n' +
    '\n── STANDARDS & REGULATIONS ──\n' +
    stds +
    '\n' +
    '\nYour expertise also covers:\n' +
    '- Current Indian scrap market prices in ₹/kg\n' +
    '- Major buyers: Tata Steel, JSW, SAIL, MSTC, Vedanta, local dealers\n' +
    '- Indian regulations: E-Waste Rules 2022, BIS, Factory Act, CPCB\n' +
    '- Profit margins, cost breakdowns, ROI, state-wise recycling infrastructure\n' +
    '- Safety protocols, PPE requirements, transportation rules\n\n' +
    'Rules:\n' +
    '- Always answer in context of the detected material above\n' +
    '- Use ₹ for all prices. Reference Indian companies, cities and regulations\n' +
    '- Be concise — max 180 words unless detail is specifically requested\n' +
    '- Use **bold** for key figures and numbers\n' +
    '- Use numbered lists for step-by-step answers\n' +
    '- For metallurgy questions, reference the phase/microstructure data above\n' +
    '- Never say "I cannot" — always give a practical answer'
  );
}

// ── Send message ──────────────────────────────────────────────────────────────
async function sendMsg(prefill) {
  var input = document.getElementById('chatInput');
  var text = prefill || input.value.trim();
  if (!text || !chatMaterial) return;

  input.value = '';
  resizeInput(input);

  document.getElementById('chatSuggWrap').style.display = 'none';

  var welcome = document.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  var msgs = document.getElementById('chatMessages');
  var c = SCRAP_DATA[chatMaterial];

  appendMsg(msgs, 'user', text, c);

  var typingId = 't' + Date.now();
  msgs.innerHTML +=
    '<div class="msg-ai" id="' +
    typingId +
    '">' +
    '<div class="msg-ai-icon" style="background:' +
    c.dim +
    ';border-color:' +
    c.border +
    ';color:' +
    c.accent +
    ';box-shadow:0 0 8px ' +
    c.glow +
    ';">AI</div>' +
    '<div class="msg-ai-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>' +
    '</div>';
  scrollMsgs();

  document.getElementById('chatSendBtn').disabled = true;
  chatHistory.push({ role: 'user', content: text });

  try {
    var API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5000/api/chat'
  : 'https://scrapscan-api.onrender.com/api/chat';

var res = await fetch(API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'HTTP-Referer': window.location.origin,
    'X-Title': 'ScrapScan',
  },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: buildPrompt(chatMaterial) },
        ].concat(chatHistory),
      }),
    });

    if (!res.ok) {
      var errData = await res.json();
      throw new Error(
        errData.error ? errData.error.message : 'API error ' + res.status
      );
    }

    var data = await res.json();
console.log('RAW RESPONSE:', JSON.stringify(data));
var reply = 'No response received.';
if (data.choices && data.choices[0]) {
  var msg = data.choices[0].message;
  if (msg && msg.content) {
    reply = msg.content;
  } else if (msg && msg.reasoning) {
    reply = msg.reasoning;
  } else if (data.choices[0].text) {
    reply = data.choices[0].text;
  }
} else if (data.error) {
  reply = 'Error: ' + data.error.message;
}

    chatHistory.push({ role: 'assistant', content: reply });
    var el = document.getElementById(typingId);
    if (el) el.remove();
    appendMsg(msgs, 'ai', reply, c);
  } catch (err) {
    var el2 = document.getElementById(typingId);
    if (el2) el2.remove();
    appendMsg(msgs, 'error', 'Error: ' + err.message, c);
  }

  document.getElementById('chatSendBtn').disabled = false;
  scrollMsgs();
}

// ── Append message bubble ─────────────────────────────────────────────────────
function appendMsg(container, type, text, c) {
  if (type === 'user') {
    container.innerHTML +=
      '<div class="msg-user">' +
      '<div class="msg-user-bubble" style="background:' +
      c.accent +
      ';box-shadow:0 4px 20px ' +
      c.glow +
      ';">' +
      escHtml(text) +
      '</div>' +
      '</div>';
  } else {
    var isError = type === 'error';
    var color = isError ? '#F472B6' : c.accent;
    var label = isError
      ? '⚠ ERROR'
      : '⬡ SCRAPSCAN AI · ' + c.label.toUpperCase() + ' EXPERT';
    var words = text.split(' ').length;
    var readTime = Math.max(1, Math.round(words / 200));

    container.innerHTML +=
      '<div class="msg-ai">' +
      '<div class="msg-ai-icon" style="background:' +
      c.dim +
      ';border-color:' +
      c.border +
      ';color:' +
      color +
      ';box-shadow:0 0 10px ' +
      c.glow +
      ';">AI</div>' +
      '<div class="msg-ai-bubble" style="border-color:' +
      c.border +
      ';box-shadow:0 4px 24px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.03);">' +
      '<div class="ai-resp-header" style="background:' +
      c.dim +
      ';border-bottom-color:' +
      c.border +
      ';">' +
      '<span class="ai-resp-dot" style="background:' +
      color +
      ';box-shadow:0 0 6px ' +
      c.glow +
      ';"></span>' +
      '<span style="color:' +
      color +
      ';font-family:var(--mono);font-size:9px;letter-spacing:0.1em;">' +
      label +
      '</span>' +
      '</div>' +
      '<div class="ai-resp-body">' +
      fmtText(text, c) +
      '</div>' +
      (!isError
        ? '<div class="ai-resp-footer" style="border-top-color:' +
          c.border +
          ';">' +
          '<div class="ai-resp-source">' +
          '<span class="ai-resp-source-dot" style="background:#10b981;"></span>' +
          '<span style="color:var(--t3);">OpenRouter · ' +
          c.label +
          ' context</span>' +
          '</div>' +
          '<span style="color:var(--t3);">~' +
          readTime +
          ' min read · ' +
          words +
          ' words</span>' +
          '</div>'
        : '') +
      '</div>' +
      '</div>';
  }
  scrollMsgs();
}

// ── Format response text ──────────────────────────────────────────────────────
function fmtText(t, c) {
  var accent = c ? c.accent : 'var(--ac)';
  var dim = c ? c.dim : 'var(--dim)';
  var border = c ? c.border : 'var(--bdr)';
  var glow = c ? c.glow : 'var(--glw)';

  var lines = t.split('\n');
  var html = '';
  var i = 0;

  var facts = [];
  lines.forEach(function (l) {
    var m = l.match(
      /[₹\$][\d,\-\+\.]+[\/\w]*|[\d\.]+\s*%|[\d\.]+\s*(kg|tonne|T\/tonne|kWh|MW|°C|HB|MPa)/g
    );
    if (m) facts = facts.concat(m);
  });

  if (facts.length > 0) {
    html += '<div class="ai-facts-row">';
    facts.slice(0, 5).forEach(function (f, idx) {
      html +=
        '<span class="ai-fact-pill" style="background:' +
        dim +
        ';border-color:' +
        border +
        ';color:' +
        accent +
        ';animation-delay:' +
        idx * 80 +
        'ms">' +
        escHtml(f) +
        '</span>';
    });
    html += '</div>';
  }

  while (i < lines.length) {
    var line = lines[i].trim();
    if (!line) {
      html += '<div style="height:6px;"></div>';
      i++;
      continue;
    }

    var numMatch = line.match(/^(\d+)[\.\)]\s+(.+)$/);
    if (numMatch) {
      html +=
        '<div class="ai-inner-card" style="border-color:' +
        border +
        ';animation-delay:' +
        i * 60 +
        'ms">' +
        '<div class="ai-inner-num" style="background:' +
        dim +
        ';border-color:' +
        border +
        ';color:' +
        accent +
        ';">' +
        numMatch[1] +
        '</div>' +
        '<div class="ai-inner-text">' +
        formatInline(numMatch[2], accent, dim, border) +
        '</div>' +
        '</div>';
      i++;
      continue;
    }

    var bulletMatch = line.match(/^[-•]\s+(.+)$/);
    if (bulletMatch) {
      html +=
        '<div class="ai-bullet-item" style="animation-delay:' +
        i * 50 +
        'ms">' +
        '<span class="ai-bullet-dot" style="background:' +
        accent +
        ';box-shadow:0 0 6px ' +
        glow +
        ';"></span>' +
        '<span>' +
        formatInline(bulletMatch[1], accent, dim, border) +
        '</span>' +
        '</div>';
      i++;
      continue;
    }

    if (line.endsWith(':') && line.length < 60 && !line.startsWith('-')) {
      html +=
        '<div class="ai-section-head" style="color:' +
        accent +
        ';border-color:' +
        border +
        ';text-shadow:0 0 12px ' +
        glow +
        ';">' +
        escHtml(line) +
        '</div>';
      i++;
      continue;
    }

    if (/pro tip|tip:|note:|important:/i.test(line)) {
      html +=
        '<div class="ai-tip-card" style="animation-delay:' +
        i * 50 +
        'ms">' +
        '<span class="ai-tip-icon">💡</span>' +
        '<span>' +
        formatInline(
          line.replace(/^(pro tip|tip|note|important)\s*[:\-]\s*/i, ''),
          accent,
          dim,
          border
        ) +
        '</span>' +
        '</div>';
      i++;
      continue;
    }

    if (/warning|caution|hazard|danger|never|do not/i.test(line)) {
      html +=
        '<div class="ai-warn-card" style="animation-delay:' +
        i * 50 +
        'ms">' +
        '<span class="ai-warn-icon">⚠</span>' +
        '<span>' +
        formatInline(line, accent, dim, border) +
        '</span>' +
        '</div>';
      i++;
      continue;
    }

    if (line.includes('₹') && line.length < 80) {
      html +=
        '<div class="ai-price-card" style="border-color:' +
        border +
        ';background:' +
        dim +
        ';animation-delay:' +
        i * 50 +
        'ms">' +
        '<span class="ai-price-icon" style="color:' +
        accent +
        ';">₹</span>' +
        '<span class="ai-price-text" style="color:' +
        accent +
        ';">' +
        formatInline(line, accent, dim, border) +
        '</span>' +
        '</div>';
      i++;
      continue;
    }

    html +=
      '<p class="ai-para">' + formatInline(line, accent, dim, border) + '</p>';
    i++;
  }

  return html;
}

function formatInline(t, accent, dim, border) {
  return escHtml(t)
    .replace(
      /\*\*(.*?)\*\*/g,
      '<strong style="color:' + accent + ';font-weight:600;">$1</strong>'
    )
    .replace(
      /\*(.*?)\*/g,
      '<em style="color:var(--t2);font-style:normal;">$1</em>'
    )
    .replace(
      /`(.*?)`/g,
      '<span class="ai-code-pill" style="background:' +
        dim +
        ';border-color:' +
        border +
        ';color:' +
        accent +
        ';">$1</span>'
    );
}

function escHtml(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function scrollMsgs() {
  var el = document.getElementById('chatMessages');
  if (el)
    setTimeout(function () {
      el.scrollTop = el.scrollHeight;
    }, 50);
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMsg();
  }
}

function resizeInput(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}
