(function () {
  "use strict";

  var STORE_KEY = "jq-v1";
  // 正解を続けるごとに次の復習までの日数が伸びる（間隔反復）
  var INTERVALS = [0, 1, 3, 7, 14, 30, 60];
  var MASTER_BOX = 4; // この段階以上で「覚えた」
  var LEVEL_LABEL = { 1: "基本", 2: "標準", 3: "応用" };
  var PRAISE = ["すごい！", "その調子！", "よくできました！", "正解！", "ナイス！", "完ぺき！"];

  // ---------- 保存データ ----------
  function allCatIds() {
    return QB.categories.history.concat(QB.categories.geography).map(function (c) { return c.id; });
  }
  function defaultState() {
    return {
      settings: {
        subject: "history",
        maxGrade: 5,
        levels: [1, 2, 3],
        cats: {
          history: QB.categories.history.map(function (c) { return c.id; }),
          geography: QB.categories.geography.map(function (c) { return c.id; })
        },
        format: "choice",
        count: 10,
        seenCats: allCatIds()
      },
      progress: {},
      days: {},
      sessions: []
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      var s = JSON.parse(raw);
      var d = defaultState();
      var hadSeen = !!(s.settings && s.settings.seenCats);
      s.settings = Object.assign(d.settings, s.settings || {});
      if (!hadSeen) delete s.settings.seenCats;
      s.progress = s.progress || {};
      s.days = s.days || {};
      s.sessions = s.sessions || [];
      // あとから追加された分類は、最初は「選択済み」にする
      var NEW_V2 = ["timeline", "mappref", "mapprod", "mapfeat", "climate"];
      if (!s.settings.seenCats) {
        s.settings.seenCats = allCatIds().filter(function (id) { return NEW_V2.indexOf(id) < 0; });
      }
      ["history", "geography"].forEach(function (subj) {
        QB.categories[subj].forEach(function (c) {
          if (s.settings.seenCats.indexOf(c.id) < 0) {
            s.settings.seenCats.push(c.id);
            if (s.settings.cats[subj].indexOf(c.id) < 0) s.settings.cats[subj].push(c.id);
          }
        });
      });
      return s;
    } catch (e) {
      return defaultState();
    }
  }

  var state = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ---------- 日付 ----------
  function dateStr(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addDays(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return dateStr(d);
  }
  function today() { return dateStr(); }

  // ---------- ユーティリティ ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function catLabel(subject, cat) {
    var c = QB.categories[subject].find(function (x) { return x.id === cat; });
    return c ? c.label : cat;
  }
  var app = document.getElementById("app");
  function render(html) {
    app.innerHTML = html;
    window.scrollTo(0, 0);
  }

  // ---------- 問題の抽出 ----------
  function filtered(opts) {
    var s = state.settings;
    opts = opts || {};
    return QB.list.filter(function (q) {
      if (opts.cat) return q.subject === opts.subject && q.cat === opts.cat;
      if (s.subject !== "both" && q.subject !== s.subject) return false;
      if (q.grade > s.maxGrade) return false;
      if (s.levels.indexOf(q.level) < 0) return false;
      if (s.cats[q.subject].indexOf(q.cat) < 0) return false;
      return true;
    });
  }
  function dueList() {
    var t = today();
    return QB.list.filter(function (q) {
      var p = state.progress[q.id];
      return p && p.due <= t;
    });
  }
  function weakList() {
    return QB.list.filter(function (q) {
      var p = state.progress[q.id];
      return p && p.wrong > 0 && (p.lastResult === 0 || p.box < 2);
    }).sort(function (a, b) {
      return state.progress[b.id].wrong - state.progress[a.id].wrong;
    });
  }
  function pickNormal(pool, n) {
    // まだ解いていない問題 → 復習日が来ている問題 → その他 の順で優先
    var t = today();
    var unseen = [], due = [], rest = [];
    pool.forEach(function (q) {
      var p = state.progress[q.id];
      if (!p) unseen.push(q);
      else if (p.due <= t) due.push(q);
      else rest.push(q);
    });
    return shuffle(unseen).concat(shuffle(due), shuffle(rest)).slice(0, n);
  }

  // ---------- 学習記録 ----------
  function record(q, ok) {
    var t = today();
    var p = state.progress[q.id] || { box: 0, due: t, seen: 0, correct: 0, wrong: 0 };
    p.seen++;
    if (ok) {
      p.correct++;
      p.box = Math.min(p.box + 1, INTERVALS.length - 1);
      p.due = addDays(INTERVALS[p.box]);
    } else {
      p.wrong++;
      p.box = 0;
      p.due = addDays(1);
    }
    p.last = t;
    p.lastResult = ok ? 1 : 0;
    state.progress[q.id] = p;
    var d = state.days[t] || { n: 0, c: 0 };
    d.n++;
    if (ok) d.c++;
    state.days[t] = d;
    save();
  }

  function streak() {
    var n = 0;
    var d = new Date();
    if (!state.days[dateStr(d)]) d.setDate(d.getDate() - 1); // 今日まだでも昨日まで続いていればOK
    while (state.days[dateStr(d)]) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  // ---------- ホーム ----------
  function home() {
    var s = state.settings;
    var due = dueList().length;
    var weak = weakList().length;
    var pool = filtered().length;
    var td = state.days[today()] || { n: 0, c: 0 };
    var st = streak();

    var subjBtn = function (v, label) {
      return '<button class="seg ' + (s.subject === v ? "on" : "") + '" data-subject="' + v + '">' + label + "</button>";
    };
    var gradeBtn = function (g) {
      return '<button class="seg ' + (s.maxGrade === g ? "on" : "") + '" data-grade="' + g + '">小' + g + "まで</button>";
    };
    var levelBtn = function (l) {
      return '<button class="chip ' + (s.levels.indexOf(l) >= 0 ? "on" : "") + '" data-level="' + l + '">' + LEVEL_LABEL[l] + "</button>";
    };
    var fmtBtn = function (v, label) {
      return '<button class="seg ' + (s.format === v ? "on" : "") + '" data-format="' + v + '">' + label + "</button>";
    };
    var countBtn = function (n) {
      return '<button class="seg ' + (s.count === n ? "on" : "") + '" data-count="' + n + '">' + n + "問</button>";
    };

    var catBlocks = "";
    ["history", "geography"].forEach(function (subj) {
      if (s.subject !== "both" && s.subject !== subj) return;
      var all = QB.categories[subj];
      var allOn = s.cats[subj].length === all.length;
      catBlocks +=
        '<div class="cat-head"><span>' + (subj === "history" ? "時代" : "地域・分野") + "</span>" +
        '<button class="link" data-allcats="' + subj + '">' + (allOn ? "すべて外す" : "すべて選ぶ") + "</button></div>" +
        '<div class="chips">' +
        all.map(function (c) {
          var on = s.cats[subj].indexOf(c.id) >= 0;
          return '<button class="chip ' + (on ? "on" : "") + '" data-cat="' + subj + ":" + c.id + '">' + esc(c.label) + "</button>";
        }).join("") +
        "</div>";
    });

    render(
      '<header class="top"><h1>社会 一問一答</h1><button class="icon" data-go="records" aria-label="学習記録">📊</button></header>' +
      '<section class="stats">' +
        '<div><b>' + td.n + '</b><span>今日解いた</span></div>' +
        '<div><b>' + (td.n ? Math.round((td.c / td.n) * 100) : 0) + '%</b><span>今日の正答率</span></div>' +
        '<div><b>' + st + '日</b><span>連続学習</span></div>' +
      "</section>" +
      '<section class="quick">' +
        '<button class="big review" data-start="review" ' + (due ? "" : "disabled") + '>🔁 今日の復習<small>' + due + "問</small></button>" +
        '<button class="big weak" data-start="weak" ' + (weak ? "" : "disabled") + '>💪 苦手克服<small>' + weak + "問</small></button>" +
        '<button class="big mapch" data-start="mapch">🗾 地図チャレンジ<small>地図・雨温図</small></button>' +
        '<button class="big tlch" data-start="tlch">📜 年表チャレンジ<small>並べかえ・年表</small></button>' +
      "</section>" +
      '<section class="card">' +
        '<h2>出題設定</h2>' +
        '<label>教科</label><div class="segs">' + subjBtn("history", "歴史") + subjBtn("geography", "地理") + subjBtn("both", "両方") + "</div>" +
        '<label>学年</label><div class="segs">' + gradeBtn(4) + gradeBtn(5) + gradeBtn(6) + "</div>" +
        '<label>難易度</label><div class="chips">' + levelBtn(1) + levelBtn(2) + levelBtn(3) + "</div>" +
        catBlocks +
        '<label>出題形式</label><div class="segs">' + fmtBtn("choice", "4択") + fmtBtn("self", "答えを考える") + "</div>" +
        '<label>問題数</label><div class="segs">' + countBtn(10) + countBtn(20) + countBtn(30) + "</div>" +
        '<p class="pool">条件に合う問題：<b>' + pool + "</b>問</p>" +
        '<button class="big start" data-start="normal" ' + (pool ? "" : "disabled") + ">スタート ▶</button>" +
      "</section>"
    );
  }

  // ---------- クイズ ----------
  var quiz = null;

  function startQuiz(mode, opts) {
    var qs;
    var n = state.settings.count;
    if (mode === "review") qs = shuffle(dueList()).slice(0, Math.max(n, 20));
    else if (mode === "weak") qs = weakList().slice(0, n);
    else if (mode === "cat") qs = pickNormal(filtered(opts), n);
    else if (mode === "mapch" || mode === "tlch") {
      var cats = QB.challenge[mode === "mapch" ? "map" : "timeline"];
      qs = pickNormal(QB.list.filter(function (q) {
        return cats.indexOf(q.cat) >= 0 && q.grade <= Math.max(state.settings.maxGrade, 5);
      }), n);
    }
    else qs = pickNormal(filtered(), n);
    if (!qs.length) return home();
    quiz = { mode: mode, qs: qs, i: 0, results: [], answered: false, revealed: false, choices: null };
    question();
  }

  // ---------- 地図 ----------
  var M = window.MAPDATA;
  function proj(lon, lat) {
    var P = M.P;
    if (lon < 128.6 && lat < 27.3) {
      var I = P.inset;
      return [I.x + (lon - I.lon0) * P.kx * I.s, I.y + (I.latTop - lat) * P.ky * I.s];
    }
    return [(lon - P.lon0) * P.kx, (P.latTop - lat) * P.ky];
  }
  function regionOf(code) {
    for (var k in M.regions) if (M.regions[k].c.indexOf(code) >= 0) return k;
    return null;
  }
  function regionView(key) {
    var b = M.regions[key].b;
    var w = b[2] - b[0], h = b[3] - b[1];
    var pad = Math.max(w, h) * 0.12 + 10;
    var x = b[0] - pad, y = b[1] - pad;
    w += pad * 2; h += pad * 2;
    // 縦横比を 1:0.85 くらいに整える
    var ratio = 0.85;
    if (h / w < ratio) { var nh = w * ratio; y -= (nh - h) / 2; h = nh; }
    else { var nw = h / ratio; x -= (nw - w) / 2; w = nw; }
    return [x, y, w, h];
  }
  // opts: view, fill{code:class}, ring(code), feat, tap
  function mapSvg(opts) {
    var P = M.P;
    var v = opts.view || [0, 0, P.W, P.H];
    var zoom = P.W / v[2];
    var s = '<svg class="map' + (opts.tap ? " tap" : "") + '" viewBox="' + v.join(" ") + '" xmlns="http://www.w3.org/2000/svg">';
    s += '<rect x="-2000" y="-2000" width="5000" height="5000" class="sea"/>';
    var I = P.inset;
    s += '<rect x="' + I.x + '" y="' + I.y + '" width="' + I.w + '" height="' + I.h + '" class="inset"/>';
    M.prefs.forEach(function (p) {
      var cls = (opts.fill && opts.fill[p.c]) || "land";
      s += '<path d="' + p.d + '" class="' + cls + '" data-pref="' + p.c + '"/>';
    });
    s += '<path d="' + M.lakes + '" class="lake"/>';
    var sw = 1 / zoom;
    if (opts.ring) {
      var rp = M.prefs[opts.ring - 1];
      s += '<circle cx="' + rp.x + '" cy="' + rp.y + '" r="' + (Math.max(26, Math.sqrt(rp.a) * 0.9) / Math.sqrt(zoom)) + '" class="ring" style="stroke-width:' + 4 * sw + '"/>';
    }
    if (opts.feat) s += featSvg(opts.feat, sw);
    return s + "</svg>";
  }
  function featSvg(f, sw) {
    var lines = [];
    if (f.kind === "river" || f.kind === "range") {
      if (f.geo.ne) lines = M.rivers[f.geo.ne];
      else lines = [f.geo.map(function (p) { return proj(p[0], p[1]); })];
      var cls = f.kind === "river" ? "river" : "range";
      return lines.map(function (l) {
        return '<polyline points="' + l.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '" class="' + cls + '" style="stroke-width:' + (f.kind === "river" ? 5 : 9) * sw + '"/>';
      }).join("");
    }
    var c = proj(f.geo[0], f.geo[1]);
    if (f.kind === "mountain") {
      var r = 16 * sw;
      return '<polygon points="' + c[0] + "," + (c[1] - r) + " " + (c[0] - r) + "," + (c[1] + r * 0.8) + " " + (c[0] + r) + "," + (c[1] + r * 0.8) + '" class="mark"/>';
    }
    return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + 14 * sw + '" class="mark"/><circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + 4 * sw + '" class="markdot"/>';
  }

  // ---------- 雨温図 ----------
  function climateSvg(city) {
    var d = QB.climate[city];
    var W = 340, H = 250, L = 38, R = 302, T = 14, B = 214;
    var pmax = Math.max(500, Math.ceil(Math.max.apply(null, d.p) / 100) * 100);
    var tmin = -10, tmax = 30;
    var bw = (R - L) / 12;
    var yP = function (v) { return B - (v / pmax) * (B - T); };
    var yT = function (v) { return B - ((v - tmin) / (tmax - tmin)) * (B - T); };
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" xmlns="http://www.w3.org/2000/svg">';
    for (var t = tmin; t <= tmax; t += 10) {
      s += '<line x1="' + L + '" x2="' + R + '" y1="' + yT(t) + '" y2="' + yT(t) + '" class="grid"/>';
      s += '<text x="' + (L - 4) + '" y="' + (yT(t) + 4) + '" class="ax tl">' + t + "</text>";
    }
    for (var p = 0; p <= pmax; p += 100) s += '<text x="' + (R + 4) + '" y="' + (yP(p) + 4) + '" class="ax pr">' + p + "</text>";
    d.p.forEach(function (v, i) {
      s += '<rect x="' + (L + i * bw + bw * 0.15) + '" y="' + yP(v) + '" width="' + bw * 0.7 + '" height="' + (B - yP(v)) + '" class="pbar"/>';
      s += '<text x="' + (L + i * bw + bw / 2) + '" y="' + (B + 14) + '" class="ax mid">' + (i + 1) + "</text>";
    });
    s += '<polyline points="' + d.t.map(function (v, i) { return (L + i * bw + bw / 2) + "," + yT(v); }).join(" ") + '" class="tline"/>';
    d.t.forEach(function (v, i) { s += '<circle cx="' + (L + i * bw + bw / 2) + '" cy="' + yT(v) + '" r="3" class="tdot"/>'; });
    s += '<line x1="' + L + '" x2="' + R + '" y1="' + B + '" y2="' + B + '" class="axis"/>';
    s += '<text x="' + (L - 4) + '" y="9" class="ax tl unit">℃</text><text x="' + (R + 4) + '" y="9" class="ax pr unit">mm</text>';
    s += '<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="ax mid">（月）</text>';
    s += "</svg>";
    return s + '<div class="chart-note">年平均気温 <b>' + d.yt + "℃</b>　年降水量 <b>" + d.yp + "mm</b></div>" +
      '<div class="legend center"><span><i class="tl"></i>気温（折れ線）</span><span><i class="pr"></i>降水量（ぼう）</span></div>';
  }

  function question() {
    var q = quiz.qs[quiz.i];
    quiz.answered = false;
    quiz.revealed = false;
    quiz.choices = shuffle([q.a].concat(q.wrong.slice(0, 3)));
    var pct = Math.round((quiz.i / quiz.qs.length) * 100);
    var p = state.progress[q.id];
    var tag = p ? (p.lastResult === 0 ? '<span class="tag bad">前回×</span>' : '<span class="tag">' + p.correct + "/" + p.seen + "</span>") : '<span class="tag new">NEW</span>';

    var type = q.type || "text";
    var visual = "";
    if (type === "mapname") visual = mapSvg({ fill: fillOf(q.pref, "hl"), ring: q.pref });
    else if (type === "mapmark") visual = mapSvg({ feat: q.feat });
    else if (type === "climate") visual = climateSvg(q.city);
    else if (type === "maptap") { quiz.mapView = "japan"; visual = tapMapHtml(); }

    var body;
    if (type === "maptap") {
      body = "";
    } else if (type === "order") {
      quiz.evs = shuffle(q.events);
      quiz.sel = [];
      body = '<div id="order">' + orderHtml() + "</div>";
    } else if (type === "timeline") {
      body = '<div id="tl">' + timelineHtml(null) + "</div>";
    } else if (state.settings.format === "choice") {
      body = '<div class="choices">' + quiz.choices.map(function (c, i) {
        return '<button class="choice" data-choice="' + i + '">' + esc(c) + "</button>";
      }).join("") + "</div>";
    } else {
      body = '<div id="reveal"><button class="big start" data-reveal="1">答えを見る</button></div>';
    }

    render(
      '<header class="top"><button class="icon" data-quit="1" aria-label="やめる">✕</button>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<span class="count">' + (quiz.i + 1) + "/" + quiz.qs.length + "</span></header>" +
      '<section class="qcard">' +
        '<div class="meta">' + QB.subjects[q.subject].label + "・" + esc(catLabel(q.subject, q.cat)) +
        '<span class="lv lv' + q.level + '">' + LEVEL_LABEL[q.level] + "</span>" + tag + "</div>" +
        '<p class="q">' + esc(q.q) + "</p>" +
        (visual ? '<div id="visual" class="visual">' + visual + "</div>" : "") +
      "</section>" + body + '<div id="feedback"></div>'
    );
  }

  function fillOf(code, cls) {
    var f = {};
    f[code] = cls;
    return f;
  }

  // 地図タップ：まず全国地図で地方をタップ → 拡大した地図で都道府県をタップ
  function tapMapHtml(fill) {
    var view = quiz.mapView === "japan" ? null : regionView(quiz.mapView);
    var hint = quiz.answered ? "" : quiz.mapView === "japan"
      ? '<p class="maphint">👆 まず、答えがありそうな<b>地方</b>をタップして拡大しよう</p>'
      : '<p class="maphint">👆 答えの都道府県をタップしよう</p>';
    var back = quiz.mapView !== "japan" && !quiz.answered ? '<button class="seg mapback" data-mapback="1">↩ 全国地図にもどる</button>' : "";
    return hint + mapSvg({ view: view, tap: !quiz.answered, fill: fill }) + back;
  }

  function tapPref(code) {
    var q = quiz.qs[quiz.i];
    if (quiz.answered || q.type !== "maptap") return;
    if (quiz.mapView === "japan") {
      quiz.mapView = regionOf(code);
      document.getElementById("visual").innerHTML = tapMapHtml();
      return;
    }
    quiz.answered = true;
    var ok = code === q.pref;
    var fill = fillOf(q.pref, "okfill");
    if (!ok) fill[code] = "ngfill";
    quiz.mapView = regionOf(q.pref);
    document.getElementById("visual").innerHTML = tapMapHtml(fill);
    record(q, ok);
    quiz.results.push({ q: q, ok: ok });
    feedback(ok, ok ? "" : "あなたがタップしたのは「" + PREF.names[code - 1] + "」");
  }

  // 並べかえ
  function orderHtml() {
    var q = quiz.qs[quiz.i];
    var html = '<div class="choices">' + quiz.evs.map(function (id, i) {
      var n = quiz.sel.indexOf(i);
      var cls = "choice ev" + (n >= 0 ? " picked" : "");
      if (quiz.answered) {
        var sorted = q.events.slice().sort(function (a, b) { return QB.events[a][0] - QB.events[b][0]; });
        cls += sorted.indexOf(id) === n ? " right" : " wrong";
      }
      return '<button class="' + cls + '" data-ev="' + i + '"' + (n >= 0 || quiz.answered ? " disabled" : "") + ">" +
        '<span class="num">' + (n >= 0 ? n + 1 : "") + "</span>" + esc(QB.events[id][1]) +
        (quiz.answered ? '<small class="yr">' + QB.events[id][0] + "年</small>" : "") + "</button>";
    }).join("") + "</div>";
    if (!quiz.answered && quiz.sel.length) html += '<button class="link" data-undo="1">↩ 1つもどす</button>';
    return html;
  }
  function pickEvent(i) {
    if (quiz.answered || quiz.sel.indexOf(i) >= 0) return;
    quiz.sel.push(i);
    var q = quiz.qs[quiz.i];
    if (quiz.sel.length === quiz.evs.length) {
      quiz.answered = true;
      var years = quiz.sel.map(function (k) { return QB.events[quiz.evs[k]][0]; });
      var ok = years.every(function (y, k) { return k === 0 || years[k - 1] <= y; });
      document.getElementById("order").innerHTML = orderHtml();
      record(q, ok);
      quiz.results.push({ q: q, ok: ok });
      feedback(ok);
      return;
    }
    document.getElementById("order").innerHTML = orderHtml();
  }

  // 年表のどこに入るか
  function timelineHtml(picked) {
    var q = quiz.qs[quiz.i];
    var L = ["ア", "イ", "ウ", "エ"];
    var slot = function (k) {
      var cls = "slot";
      if (quiz.answered) cls += k === q.slot ? " right" : k === picked ? " wrong" : "";
      return '<button class="' + cls + '" data-slot="' + k + '"' + (quiz.answered ? " disabled" : "") + ">" + L[k] +
        (quiz.answered && k === q.slot ? "　← " + esc(QB.events[q.target][1]) + "（" + QB.events[q.target][0] + "年）" : "") + "</button>";
    };
    var h = '<div class="timeline">' + slot(0);
    q.anchors.forEach(function (a, k) {
      h += '<div class="tl-ev"><b>' + QB.events[a][0] + "年</b>" + esc(QB.events[a][1]) + "</div>" + slot(k + 1);
    });
    return h + "</div>";
  }
  function pickSlot(k) {
    if (quiz.answered) return;
    quiz.answered = true;
    var q = quiz.qs[quiz.i];
    var ok = k === q.slot;
    document.getElementById("tl").innerHTML = timelineHtml(k);
    record(q, ok);
    quiz.results.push({ q: q, ok: ok });
    feedback(ok);
  }

  function feedback(ok, note) {
    var q = quiz.qs[quiz.i];
    var t = q.type || "text";
    var right = t === "order" ? "正しい順番は下のとおり" : t === "timeline" ? "正解は「" + esc(q.a) + "」" : "正解は「" + esc(q.a) + "」";
    var msg = ok ? '<div class="fb ok">⭕ ' + PRAISE[Math.floor(Math.random() * PRAISE.length)] + "</div>"
                 : '<div class="fb ng">❌ ' + right + "</div>";
    var exText = (note ? note + "\n" : "") + (q.ex || "");
    var ex = exText ? '<p class="ex">💡 ' + esc(exText) + "</p>" : "";
    var last = quiz.i + 1 >= quiz.qs.length;
    document.getElementById("feedback").innerHTML =
      msg + ex + '<button class="big start" data-next="1">' + (last ? "結果を見る" : "次の問題 ▶") + "</button>";
    document.querySelector("[data-next]").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function answerChoice(idx) {
    if (quiz.answered) return;
    quiz.answered = true;
    var q = quiz.qs[quiz.i];
    var ok = quiz.choices[idx] === q.a;
    document.querySelectorAll(".choice").forEach(function (b, i) {
      b.disabled = true;
      if (quiz.choices[i] === q.a) b.classList.add("right");
      else if (i === idx) b.classList.add("wrong");
    });
    record(q, ok);
    quiz.results.push({ q: q, ok: ok });
    feedback(ok);
  }

  function reveal() {
    var q = quiz.qs[quiz.i];
    quiz.revealed = true;
    var ex = q.ex ? '<p class="ex">💡 ' + esc(q.ex) + "</p>" : "";
    document.getElementById("reveal").innerHTML =
      '<div class="answer">' + esc(q.a) + "</div>" + ex +
      '<p class="hint">自分の答えは合っていた？</p>' +
      '<div class="judge"><button class="big ok" data-self="1">⭕ 正解</button><button class="big ng" data-self="0">❌ 不正解</button></div>';
  }

  function selfJudge(ok) {
    if (quiz.answered) return;
    quiz.answered = true;
    var q = quiz.qs[quiz.i];
    record(q, ok);
    quiz.results.push({ q: q, ok: ok });
    next();
  }

  function next() {
    quiz.i++;
    if (quiz.i >= quiz.qs.length) return result();
    question();
  }

  function result() {
    var r = quiz.results;
    var c = r.filter(function (x) { return x.ok; }).length;
    var pct = r.length ? Math.round((c / r.length) * 100) : 0;
    state.sessions.unshift({ date: today(), mode: quiz.mode, n: r.length, c: c });
    state.sessions = state.sessions.slice(0, 100);
    save();
    var face = pct === 100 ? "🏆" : pct >= 80 ? "🎉" : pct >= 60 ? "😊" : "📚";
    var msg = pct === 100 ? "全問正解！すばらしい！" : pct >= 80 ? "よくできました！" : pct >= 60 ? "あと少し！" : "復習すれば必ず覚えられるよ！";
    var wrongs = r.filter(function (x) { return !x.ok; });
    var list = wrongs.length
      ? '<section class="card"><h2>まちがえた問題</h2>' + wrongs.map(function (x) {
          return '<div class="wrong-item"><p>' + esc(x.q.q) + '</p><b>→ ' + esc(x.q.a) + "</b></div>";
        }).join("") + "</section>"
      : "";
    render(
      '<section class="result"><div class="face">' + face + '</div><div class="score">' + c + " / " + r.length + "</div>" +
      '<div class="pct">正答率 ' + pct + "%</div><p>" + msg + "</p></section>" +
      (wrongs.length ? '<button class="big weak" data-retry="1">まちがえた問題をもう一度</button>' : "") +
      list +
      '<button class="big start" data-go="home">ホームへ</button>'
    );
  }

  function retryWrong() {
    var qs = quiz.results.filter(function (x) { return !x.ok; }).map(function (x) { return x.q; });
    quiz = { mode: "retry", qs: shuffle(qs), i: 0, results: [], answered: false };
    question();
  }

  // ---------- 学習記録 ----------
  function records() {
    var all = Object.keys(state.progress).map(function (k) { return state.progress[k]; });
    var seen = all.reduce(function (a, p) { return a + p.seen; }, 0);
    var correct = all.reduce(function (a, p) { return a + p.correct; }, 0);
    var mastered = all.filter(function (p) { return p.box >= MASTER_BOX; }).length;

    // 直近14日のグラフ
    var bars = "";
    var max = 1;
    var daysArr = [];
    for (var i = 13; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var key = dateStr(d);
      var v = state.days[key] || { n: 0, c: 0 };
      daysArr.push({ d: d, v: v });
      max = Math.max(max, v.n);
    }
    bars = daysArr.map(function (x) {
      var h = Math.round((x.v.n / max) * 100);
      var hc = x.v.n ? Math.round((x.v.c / max) * 100) : 0;
      return '<div class="col"><div class="stack"><i class="n" style="height:' + h + '%"></i><i class="c" style="height:' + hc + '%"></i></div>' +
        "<small>" + (x.v.n || "") + "</small><span>" + (x.d.getMonth() + 1) + "/" + x.d.getDate() + "</span></div>";
    }).join("");

    var catRows = function (subj) {
      return QB.categories[subj].map(function (c) {
        var qs = QB.list.filter(function (q) { return q.subject === subj && q.cat === c.id; });
        var tried = 0, s = 0, ok = 0, m = 0;
        qs.forEach(function (q) {
          var p = state.progress[q.id];
          if (!p) return;
          tried++; s += p.seen; ok += p.correct;
          if (p.box >= MASTER_BOX) m++;
        });
        var acc = s ? Math.round((ok / s) * 100) + "%" : "-";
        var mp = qs.length ? Math.round((m / qs.length) * 100) : 0;
        var tp = qs.length ? Math.round((tried / qs.length) * 100) : 0;
        return '<button class="cat-row" data-catstart="' + subj + ":" + c.id + '">' +
          '<div class="cr-top"><span>' + esc(c.label) + '</span><span class="acc">正答率 ' + acc + "</span></div>" +
          '<div class="prog"><i class="t" style="width:' + tp + '%"></i><i class="m" style="width:' + mp + '%"></i></div>' +
          '<div class="cr-sub">覚えた ' + m + " ／ 解いた " + tried + " ／ 全 " + qs.length + "問</div></button>";
      }).join("");
    };

    render(
      '<header class="top"><button class="icon" data-go="home" aria-label="戻る">←</button><h1>学習記録</h1><span></span></header>' +
      '<section class="stats">' +
        "<div><b>" + seen + "</b><span>累計解答</span></div>" +
        "<div><b>" + (seen ? Math.round((correct / seen) * 100) : 0) + "%</b><span>累計正答率</span></div>" +
        "<div><b>" + mastered + "</b><span>覚えた問題</span></div>" +
      "</section>" +
      '<section class="card"><h2>最近14日間</h2><div class="chart">' + bars + "</div>" +
      '<div class="legend"><span><i class="n"></i>解いた数</span><span><i class="c"></i>正解数</span></div></section>' +
      '<section class="card"><h2>歴史（時代別）</h2><p class="note">タップするとその分野を出題します</p>' + catRows("history") + "</section>" +
      '<section class="card"><h2>地理（地域・分野別）</h2>' + catRows("geography") + "</section>" +
      '<div class="legend center"><span><i class="t"></i>解いた</span><span><i class="m"></i>覚えた（4回以上連続正解）</span></div>' +
      '<section class="card"><h2>データの保存</h2>' +
        '<p class="note">機種変更などに備えて、記録をコピーしてメモ等に保存できます。</p>' +
        '<div class="segs"><button class="seg" data-backup="1">記録をコピー</button><button class="seg" data-restore="1">記録を復元</button></div>' +
        '<button class="link danger" data-reset="1">記録をすべて消す</button>' +
      "</section>"
    );
  }

  function backup() {
    var text = JSON.stringify({ app: "jq", v: 1, progress: state.progress, days: state.days, sessions: state.sessions });
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        alert("記録をコピーしました。メモアプリなどに貼り付けて保存してください。");
      }, function () { prompt("下の文字をすべてコピーして保存してください", text); });
    } else {
      prompt("下の文字をすべてコピーして保存してください", text);
    }
  }
  function restore() {
    var text = prompt("保存しておいた記録の文字を貼り付けてください");
    if (!text) return;
    try {
      var d = JSON.parse(text);
      if (d.app !== "jq") throw new Error();
      state.progress = d.progress || {};
      state.days = d.days || {};
      state.sessions = d.sessions || [];
      save();
      alert("記録を復元しました。");
      records();
    } catch (e) {
      alert("読み込めませんでした。コピーした文字をそのまま貼り付けてください。");
    }
  }

  // ---------- 操作 ----------
  app.addEventListener("click", function (e) {
    var pr = e.target.closest && e.target.closest("svg.tap [data-pref]");
    if (pr) return tapPref(+pr.getAttribute("data-pref"));
    var b = e.target.closest("button");
    if (!b || b.disabled) return;
    var s = state.settings;
    var ds = b.dataset;

    if (ds.subject) { s.subject = ds.subject; save(); return home(); }
    if (ds.grade) { s.maxGrade = +ds.grade; save(); return home(); }
    if (ds.level) {
      var l = +ds.level;
      var i = s.levels.indexOf(l);
      if (i >= 0) { if (s.levels.length > 1) s.levels.splice(i, 1); } else s.levels.push(l);
      save(); return home();
    }
    if (ds.cat) {
      var parts = ds.cat.split(":");
      var arr = s.cats[parts[0]];
      var j = arr.indexOf(parts[1]);
      if (j >= 0) arr.splice(j, 1); else arr.push(parts[1]);
      save(); return home();
    }
    if (ds.allcats) {
      var subj = ds.allcats;
      var all = QB.categories[subj].map(function (c) { return c.id; });
      s.cats[subj] = s.cats[subj].length === all.length ? [] : all;
      save(); return home();
    }
    if (ds.format) { s.format = ds.format; save(); return home(); }
    if (ds.count) { s.count = +ds.count; save(); return home(); }
    if (ds.start) return startQuiz(ds.start);
    if (ds.catstart) {
      var p = ds.catstart.split(":");
      return startQuiz("cat", { subject: p[0], cat: p[1] });
    }
    if (ds.choice !== undefined) return answerChoice(+ds.choice);
    if (ds.ev !== undefined) return pickEvent(+ds.ev);
    if (ds.undo) { quiz.sel.pop(); document.getElementById("order").innerHTML = orderHtml(); return; }
    if (ds.slot !== undefined) return pickSlot(+ds.slot);
    if (ds.mapback) { quiz.mapView = "japan"; document.getElementById("visual").innerHTML = tapMapHtml(); return; }
    if (ds.reveal) return reveal();
    if (ds.self !== undefined) return selfJudge(ds.self === "1");
    if (ds.next) return next();
    if (ds.retry) return retryWrong();
    if (ds.quit) {
      if (!quiz.results.length || confirm("途中でやめますか？（ここまでの記録は保存されています）")) return home();
      return;
    }
    if (ds.go === "home") return home();
    if (ds.go === "records") return records();
    if (ds.backup) return backup();
    if (ds.restore) return restore();
    if (ds.reset) {
      if (confirm("学習記録をすべて消します。元に戻せません。よろしいですか？")) {
        state.progress = {}; state.days = {}; state.sessions = [];
        save(); records();
      }
    }
  });

  // 確認用：アドレスの末尾に #q=問題ID,問題ID を付けると、その問題だけを出題する（学習記録には影響しない使い方もできる）
  var m = location.hash.match(/q=([\w,-]+)/);
  if (m) {
    var ids = m[1].split(",");
    var qs = QB.list.filter(function (q) { return ids.indexOf(q.id) >= 0; });
    if (qs.length) {
      quiz = { mode: "debug", qs: qs, i: 0, results: [], answered: false };
      question();
      return;
    }
  }
  home();
})();
