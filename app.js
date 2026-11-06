(function () {
  "use strict";

  var STORE_KEY = "jq-v1";
  // 正解を続けるごとに次の復習までの日数が伸びる（間隔反復）
  var INTERVALS = [0, 1, 3, 7, 14, 30, 60];
  var MASTER_BOX = 4; // この段階以上で「覚えた」
  var LEVEL_LABEL = { 1: "基本", 2: "標準", 3: "応用" };
  var PRAISE = ["すごい！", "その調子！", "よくできました！", "正解！", "ナイス！", "完ぺき！"];

  // ---------- 保存データ ----------
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
        count: 10
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
      s.settings = Object.assign(d.settings, s.settings || {});
      s.progress = s.progress || {};
      s.days = s.days || {};
      s.sessions = s.sessions || [];
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
    else qs = pickNormal(filtered(), n);
    if (!qs.length) return home();
    quiz = { mode: mode, qs: qs, i: 0, results: [], answered: false, revealed: false, choices: null };
    question();
  }

  function question() {
    var q = quiz.qs[quiz.i];
    quiz.answered = false;
    quiz.revealed = false;
    quiz.choices = shuffle([q.a].concat(q.wrong.slice(0, 3)));
    var pct = Math.round((quiz.i / quiz.qs.length) * 100);
    var p = state.progress[q.id];
    var tag = p ? (p.lastResult === 0 ? '<span class="tag bad">前回×</span>' : '<span class="tag">' + p.correct + "/" + p.seen + "</span>") : '<span class="tag new">NEW</span>';

    var body;
    if (state.settings.format === "choice") {
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
      "</section>" + body + '<div id="feedback"></div>'
    );
  }

  function feedback(ok) {
    var q = quiz.qs[quiz.i];
    var msg = ok ? '<div class="fb ok">⭕ ' + PRAISE[Math.floor(Math.random() * PRAISE.length)] + "</div>"
                 : '<div class="fb ng">❌ 正解は「' + esc(q.a) + "」</div>";
    var ex = q.ex ? '<p class="ex">💡 ' + esc(q.ex) + "</p>" : "";
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

  home();
})();
