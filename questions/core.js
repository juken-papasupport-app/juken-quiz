// 問題バンクの定義
// 1問の形式: [学年(4|5|6), 難易度(1=基本,2=標準,3=応用), 問題文, 正解, [誤答1,誤答2,誤答3], 解説(省略可)]
// ID はカテゴリ内の並び順から自動で付きます（例: h-edo-001）。
// 学習記録は ID に結びつくので、既存の問題の順番は変えず、新しい問題は末尾に追加してください。
var QB = {
  subjects: {
    history: { label: "歴史", prefix: "h" },
    geography: { label: "地理", prefix: "g" }
  },
  categories: {
    history: [
      { id: "jomon", label: "旧石器・縄文・弥生" },
      { id: "asuka", label: "古墳・飛鳥" },
      { id: "nara", label: "奈良" },
      { id: "heian", label: "平安" },
      { id: "kamakura", label: "鎌倉" },
      { id: "muromachi", label: "室町・戦国" },
      { id: "azuchi", label: "安土桃山" },
      { id: "edo", label: "江戸" },
      { id: "meiji", label: "明治" },
      { id: "taisho", label: "大正" },
      { id: "showa1", label: "昭和（戦前・戦中）" },
      { id: "showa2", label: "昭和（戦後）・平成・令和" }
    ],
    geography: [
      { id: "hokkaido", label: "北海道" },
      { id: "tohoku", label: "東北" },
      { id: "kanto", label: "関東" },
      { id: "chubu", label: "中部" },
      { id: "kinki", label: "近畿" },
      { id: "chugoku", label: "中国・四国" },
      { id: "kyushu", label: "九州・沖縄" },
      { id: "japan", label: "日本全体（国土・気候・地形）" },
      { id: "agri", label: "農業・水産業" },
      { id: "industry", label: "工業" },
      { id: "trade", label: "貿易・交通" },
      { id: "world", label: "世界の国々" }
    ]
  },
  list: [],
  add: function (subject, cat, rows) {
    var prefix = QB.subjects[subject].prefix;
    rows.forEach(function (r, i) {
      QB.list.push({
        id: prefix + "-" + cat + "-" + String(i + 1).padStart(3, "0"),
        subject: subject,
        cat: cat,
        grade: r[0],
        level: r[1],
        q: r[2],
        a: r[3],
        wrong: r[4],
        ex: r[5] || ""
      });
    });
  }
};
