// VOC 지표 화면 — 데이터는 서버가 lib/v2/metrics.ts 로 계산해 #voc-data 에 넣는다. 화면은 값을 다시 계산하지 않는다.
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('voc-data').textContent);
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ALL = '전체';
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 환경 */ } }
  };

  // ── 경로: 임베드 경로끼리는 ?key= 를 그대로 들고 간다 ──
  var EMBED = location.pathname.indexOf('/embed/') === 0;
  var QS = EMBED ? location.search : '';
  var UNI = (EMBED ? '/embed/v2-universe' : '/v2/universe') + QS;
  $('tab-universe').href = UNI;
  $('tab-metrics').href = (EMBED ? '/embed/v2-metrics' : '/v2/metrics') + QS;
  $('p-uni').href = UNI;

  // ── 형식 ──
  var n0 = function (v) { return v == null || isNaN(v) ? '—' : Math.round(v).toLocaleString('ko-KR'); };
  var pct = function (v, d) { return v == null || isNaN(v) ? '—' : (v * 100).toFixed(d == null ? 1 : d); };
  var N = function (s, cls) { return '<span class="num' + (cls ? ' ' + cls : '') + '">' + esc(s) + '</span>'; };
  var NI = function (s) { return N(s, 'ni'); };
  var md = function (iso) { return iso ? String(iso).slice(5, 10).replace('-', '.') : ''; };
  var ymd = function (iso) { return iso ? String(iso).slice(0, 10).replace(/-/g, '.') : ''; };
  var addDays = function (iso, n) { var p = iso.split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)); return d.toISOString().slice(0, 10); };
  var monthKo = function (m) { return +String(m).slice(5, 7) + '월'; };
  var CH = { Agoda: '아고다', Booking: '부킹닷컴', 'Trip.com': '트립닷컴', Expedia: '익스피디아', Airbnb: '에어비앤비', NOL: '야놀자', '여기어때': '여기어때' };
  var ch = function (c) { return CH[c] || c || '채널 미상'; };
  var OWNER = { X: '운영 밖', x: '운영 밖', OUT: '운영 밖', outside: '운영 밖' };
  var SIG = { E: '감정 고조', R: '재문의', C: '보상 요구', P: '평판 리스크' };
  // 주 라벨(월요일) = 화~월 구간의 끝
  // 은하 이름: 직원서비스 은하는 「응대, 환대, 커뮤니티」로 표시
  var galName = function (g) { return g === '응대/환대/커뮤니티' ? '응대, 환대, 커뮤니티' : g; };
  var weekRange = function (mon) { return md(addDays(mon, -6)) + '~' + md(mon); };

  // ── 색 ──
  function stClass(c) {
    if (!c) return 'c-dust';
    if (c.status === '성운' || c.status === '관찰') return 'c-neb';
    if (c.status === '씨앗') return 'c-dust';
    if (c.polarity === 'pos') return c.status === '흐려짐' ? 'c-dust' : 'c-pos';
    if (c.status === '수행과제 진행') return 'c-amber';
    return 'c-neg';
  }
  var polClass = function (p) { return p === 'pos' ? 'c-pos' : 'c-neg'; };

  // ── 모델 ──
  var CON = {}, STAR = {}, STARS_BY_REVIEW = {};
  D.constellations.forEach(function (c) { CON[c.id] = c; });
  D.stars.forEach(function (s) {
    STAR[s.id] = s;
    if (s.review_id) (STARS_BY_REVIEW[s.review_id] = STARS_BY_REVIEW[s.review_id] || []).push(s);
  });
  var recentFirst = function (a, b) { return (b.recent_4w - a.recent_4w) || (a.last_date < b.last_date ? 1 : a.last_date > b.last_date ? -1 : 0) || a.name.localeCompare(b.name); };

  var S = { branch: ALL, theme: document.documentElement.classList.contains('light') ? 'light' : 'dark', stack: [], tab: 'ko' };
  var savedBr = store.get('voc-metrics-branch');
  if (savedBr && D.scopes[savedBr]) S.branch = savedBr;

  // ── 머리 ──
  function renderHead() {
    var brs = [ALL].concat(D.branches);
    $('seg').innerHTML = brs.map(function (b) {
      return '<button type="button" role="radio" data-br="' + esc(b) + '" aria-checked="' + (b === S.branch) + '"><span>' + esc(b) + '</span></button>';
    }).join('');
    var lw = D.last_week;
    $('period').innerHTML = lw
      ? '<span class="k">마지막 주</span><span class="num">' + esc(ymd(addDays(lw, -6))) + '~' + esc(md(lw)) + '</span><span class="k">· 별자리</span><span class="num">' + esc(ymd(D.as_of)) + '</span>'
      : '<span class="k">별자리</span><span class="num">' + esc(ymd(D.as_of)) + '</span>';
    $('scope-k').innerHTML = '<span>' + esc(S.branch === ALL ? D.branches.join(', ') + ' 합산' : S.branch) + '</span>';
    document.querySelectorAll('.thm').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.theme === S.theme)); });
  }

  // ── 카드 ──
  function bars(series, key) {
    var vals = series.map(function (b) { return b[key || 'value']; });
    var max = Math.max.apply(null, vals.filter(function (v) { return v != null; }).concat([0])) || 1;
    var html = '<span class="bars" aria-hidden="true">' + series.map(function (b, i) {
      var v = b[key || 'value'];
      if (v == null) return '<i class="none" style="height:34px"></i>';
      return '<i class="' + (i === series.length - 1 ? 'last' : '') + '" style="height:' + Math.max(3, Math.round(v / max * 34)) + 'px"></i>';
    }).join('') + '</span>';
    return html;
  }
  function axis(a, b) { return '<span class="axis"><span>' + a + '</span><span>' + b + '</span></span>'; }

  function card(o) {
    var viz = o.series && o.series.length
      ? bars(o.series) + axis(o.axisA, o.axisB)
      : '<span class="fact"><span>' + esc(o.fact || '') + '</span></span>';
    return '<button type="button" class="card" data-open="' + o.key + '" aria-label="' + esc(o.label) + ' 목록 열기">' +
      '<span class="c-grp"><span class="g">' + esc(o.group) + '</span>' + (o.tag ? '<span class="tagx">' + esc(o.tag) + '</span>' : '') + '</span>' +
      '<span class="c-lbl">' + esc(o.label) + '</span>' +
      '<span class="c-val"><span class="v num">' + esc(o.value) + '</span>' + (o.unit ? '<span class="u">' + esc(o.unit) + '</span>' : '') + '</span>' +
      '<span class="c-viz">' + viz + '</span>' +
      '<span class="c-sub">' + o.sub.map(function (s) { return '<span>' + s + '</span>'; }).join('') + '</span>' +
      '</button>';
  }
  var frac = function (o) { return o.den ? pct(o.num / o.den, 0) : '—'; };
  var weekAxis = function (ser) { return ser.length ? [N(md(addDays(ser[0].label, -6))), N(md(ser[ser.length - 1].label))] : ['', '']; };

  function renderCards() {
    var s = D.scopes[S.branch];
    var ns = s.north, ota = s.ota, voc = s.voc;
    var nsAx = ns.series.length ? [monthKo(ns.series[0].label), monthKo(ns.series[ns.series.length - 1].label)] : ['', ''];
    var otaAx = weekAxis(ota.series), vocAx = weekAxis(voc.series);
    var coLabel = D.checkout_source === 'wings' ? 'Wings 체크아웃' : '체크아웃';
    var html = [
      card({ key: 'north', group: '북극성', tag: '추정', label: '불편 없이 끝난 체류 비율', value: pct(ns.value), unit: ns.value == null ? '' : '%',
        series: ns.series, axisA: nsAx[0], axisB: nsAx[1],
        sub: [coLabel + ' ' + NI(n0(ns.checkouts)), '부정 추정 ' + NI(ns.est_neg == null ? '—' : ns.est_neg.toLocaleString('ko-KR'))] }),
      card({ key: 'solved', group: '핵심', label: '구조 해결 수', value: String(s.solved.value), unit: '개',
        fact: '첫 판정 V2 가동 3개월 뒤', sub: ['관찰 중 별자리 ' + NI(s.solved.observing)] }),
      card({ key: 'relapse', group: '핵심', label: '재발률', value: frac(s.relapse), unit: s.relapse.den ? '%' : '',
        fact: '첫 판정 V2 가동 3개월 뒤', sub: ['재발 ' + NI(s.relapse.num) + ' / 대상 ' + NI(s.relapse.den)] }),
      card({ key: 'keep', group: '핵심', label: '성과 유지율', value: frac(s.keep), unit: s.keep.den ? '%' : '',
        fact: '첫 판정 V2 가동 3개월 뒤', sub: ['유지 ' + NI(s.keep.num) + ' / 긍정 별자리 ' + NI(s.keep.den)] }),
      card({ key: 'ota', group: '가드레일', label: 'OTA 평점', value: ota.value == null ? '—' : ota.value.toFixed(2), unit: ota.value == null ? '' : '/ 10',
        series: ota.series, axisA: otaAx[0], axisB: otaAx[1],
        sub: ['9.0 미만 채널 ' + NI(ota.below) + ' / ' + NI(ota.channels.length)] }),
      card({ key: 'voc', group: '가드레일', label: 'VOC 비율', value: pct(voc.ratio), unit: voc.ratio == null ? '' : '%',
        series: voc.series, axisA: vocAx[0], axisB: vocAx[1],
        sub: ['리뷰 증가분 ' + NI(n0(voc.reviews)), '체크아웃 ' + NI(n0(voc.checkouts))] })
    ];
    $('cards').innerHTML = html.join('');
  }

  function renderGalaxies() {
    var s = D.scopes[S.branch];
    var neg = s.galaxies.reduce(function (a, g) { return a + g.neg; }, 0), pos = s.galaxies.reduce(function (a, g) { return a + g.pos; }, 0);
    $('gal-s').innerHTML = '<span>불편 ' + NI(n0(neg)) + ' · 칭찬 ' + NI(n0(pos)) + '</span>';
    $('gals').innerHTML = s.galaxies.map(function (g) {
      var nm = galName(g.name);
      return '<button type="button" class="gal" data-gal="' + esc(g.name) + '" aria-label="' + esc(nm) + ' 불편 별 목록 열기">' +
        '<span class="nm">' + esc(nm) + '</span>' +
        '<span class="v"><b class="num">' + n0(g.neg) + '</b><span>불편</span></span>' +
        '<span class="p">칭찬 ' + NI(n0(g.pos)) + '</span></button>';
    }).join('');
  }

  function renderAll() { renderHead(); renderCards(); renderGalaxies(); if (S.stack.length) renderPanel(); }

  // ── 패널 ──
  var inScope = function (x) { return S.branch === ALL || x.branch === S.branch; };
  var brLabel = function () { return S.branch === ALL ? D.branches.join(', ') + ' 합산' : S.branch; };

  function conRow(c, mark) {
    return '<button type="button" class="row" data-con="' + esc(c.id) + '">' +
      '<span class="dot ' + stClass(c) + (c.status === '관찰' || c.status === '씨앗' ? ' ring' : '') + '"></span>' +
      '<span class="nm">' + esc(c.name) + '<small>' + esc(c.branch) + ' · ' + esc(galName(c.galaxy)) + (c.recent_4w ? ' · 최근 4주 ' + NI(c.recent_4w) : '') + '</small></span>' +
      '<span class="st ' + stClass(c) + '">' + esc(mark || c.status) + '</span><span class="n num">' + c.star_ids.length + '</span></button>';
  }
  function conList(title, cons, emptyText, markFn) {
    return '<div><div class="sect-k"><span class="t">' + esc(title) + '<b class="num">' + cons.length + '</b></span><span>최근 4주 별 수 순</span></div>' +
      '<div class="rows">' + (cons.length ? cons.map(function (c) { return conRow(c, markFn && markFn(c)); }).join('') : '<div class="empty">' + esc(emptyText || '없음') + '</div>') + '</div></div>';
  }
  var cons = function (ids) { return ids.map(function (id) { return CON[id]; }).filter(Boolean).sort(recentFirst); };
  function starRow(s) {
    var rv = D.reviews[s.review_id] || {};
    var sc = rv.rating != null ? N((+rv.rating).toFixed(1)) + '<span> / ' + N(rv.scale || 10) + '</span>' : '<span>—</span>';
    return '<button type="button" class="row star" data-star="' + esc(s.id) + '"><span class="dot ' + polClass(s.polarity) + '"></span>' +
      '<span class="d num">' + esc(md(s.date)) + '</span><span class="ch">' + esc(ch(s.channel)) + ' · ' + esc(s.phenomenon || '') + '</span><span class="sc">' + sc + '</span></button>';
  }
  function head(eyebrow, title, big, unit, line) {
    return '<div><div class="eyebrow"><span>' + eyebrow + '</span></div><h2 class="p-title">' + esc(title) + '</h2>' +
      (big != null ? '<div class="big"><b class="num">' + esc(big) + '</b>' + (unit ? '<span class="u">' + esc(unit) + '</span>' : '') + '</div>' : '') +
      (line ? '<div class="line">' + line + '</div>' : '') + '</div>';
  }
  function table(headers, rows, sum) {
    return '<table class="tbl"><thead><tr>' + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
      (sum ? '<tr class="sum">' + sum.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>' : '') + '</tbody></table>';
  }
  var chName = function (r) { return (S.branch === ALL ? esc(r.branch) + ' · ' : '') + esc(ch(r.channel)); };

  var VIEWS = {
    north: function () {
      var ns = D.scopes[S.branch].north;
      var negC = D.constellations.filter(function (c) { return inScope(c) && c.polarity === 'neg' && c.status !== '씨앗'; }).sort(recentFirst);
      var per = ns.period ? N(ymd(ns.period.from)) + '~' + N(md(ns.period.to)) + ' · ' + N(ns.period.weeks) + '주 · OTA ' + N(ns.channels) + '채널' : '';
      var t = ns.by_channel.reduce(function (a, r) { a.t += r.texts; a.n += r.neg; a.d += r.delta; a.c += r.checkouts; return a; }, { t: 0, n: 0, d: 0, c: 0 });
      return head('북극성 · ' + esc(brLabel()) + ' <span class="tag">추정</span>', '불편 없이 끝난 체류 비율', pct(ns.value), ns.value == null ? '' : '%', per) +
        '<div><div class="sect-k"><span class="t">월별</span><span>주 라벨의 달 기준</span></div>' +
        table(['달', '주 수', '비율'], ns.series.map(function (b) { return [esc(monthKo(b.label)), b.weeks == null ? '—' : N(b.weeks), b.value == null ? '—' : N(pct(b.value)) + '%']; })) + '</div>' +
        '<div><div class="sect-k"><span class="t">채널</span></div>' +
        table(['채널', '원문 리뷰', '부정 리뷰', '리뷰 증가분', '체크아웃'],
          ns.by_channel.map(function (r) { return [chName(r), N(n0(r.texts)), N(n0(r.neg)), N(n0(r.delta)), N(n0(r.checkouts))]; }),
          ['합계', N(n0(t.t)), N(n0(t.n)), N(n0(t.d)), N(n0(t.c))]) + '</div>' +
        conList('불편 별자리', negC, '불편 별자리 없음');
    },
    solved: function () {
      var s = D.scopes[S.branch].solved;
      return head('핵심 · ' + esc(brLabel()), '구조 해결 수', String(s.value), '개', '3개월 재발 0건으로 성운이 된 별자리') +
        conList('성운', cons(s.ids), '성운 별자리 없음') + conList('관찰 중', cons(s.observing_ids), '관찰 중 별자리 없음');
    },
    relapse: function () {
      var r = D.scopes[S.branch].relapse;
      var rel = {}; r.relapsed_ids.forEach(function (id) { rel[id] = 1; });
      return head('핵심 · ' + esc(brLabel()), '재발률', frac(r), r.den ? '%' : '', '재발 ' + NI(r.num) + ' / 관찰에 들어간 별자리 ' + NI(r.den)) +
        conList('관찰에 들어간 별자리', cons(r.ids), '관찰에 들어간 별자리 없음', function (c) { return rel[c.id] ? '재발 ' + (c.relapse_count || 1) + '회' : c.status; });
    },
    keep: function () {
      var k = D.scopes[S.branch].keep;
      return head('핵심 · ' + esc(brLabel()), '성과 유지율', frac(k), k.den ? '%' : '', '유지 ' + NI(k.num) + ' / 긍정 별자리 ' + NI(k.den)) +
        conList('긍정 별자리', cons(k.ids), '긍정 별자리 없음');
    },
    ota: function () {
      var o = D.scopes[S.branch].ota;
      var last = o.series.length ? o.series[o.series.length - 1].label : null;
      return head('가드레일 · ' + esc(brLabel()), 'OTA 평점', o.value == null ? '—' : o.value.toFixed(2), o.value == null ? '' : '/ 10',
        '10점 환산 · 누적 리뷰 수 가중 평균' + (last ? ' · ' + N(ymd(last)) : '')) +
        '<div><div class="sect-k"><span class="t">채널</span><span>기록일 기준 최신</span></div>' +
        table(['채널', '평점', '기록일', '누적 리뷰'], o.channels.map(function (r) {
          return [chName(r), r.score == null ? '—' : N((+r.score).toFixed(2)) + ' / ' + N(r.scale), N(md(r.recorded_at)), N(n0(r.review_count))];
        })) + '</div>' +
        '<div><div class="sect-k"><span class="t">주별</span><span>화~월</span></div>' +
        table(['주', '평점'], o.series.slice().reverse().map(function (b) { return [N(weekRange(b.label)), b.value == null ? '—' : N(b.value.toFixed(2))]; })) + '</div>';
    },
    voc: function () {
      var v = D.scopes[S.branch].voc;
      return head('가드레일 · ' + esc(brLabel()), 'VOC 비율', pct(v.ratio), v.ratio == null ? '' : '%', '리뷰 증가분 ' + NI(n0(v.reviews)) + ' ÷ 체크아웃 ' + NI(n0(v.checkouts))) +
        '<div><div class="sect-k"><span class="t">채널</span></div>' +
        table(['채널', '비율', '리뷰 증가분', '체크아웃'], v.by_channel.map(function (r) {
          return [chName(r), r.ratio == null ? '—' : N(pct(r.ratio)) + '%', N(n0(r.reviews)), N(n0(r.checkouts))];
        })) + '</div>' +
        '<div><div class="sect-k"><span class="t">주별</span><span>화~월</span></div>' +
        table(['주', '비율', '리뷰 증가분', '체크아웃'], v.series.slice().reverse().map(function (b) {
          return [N(weekRange(b.label)), b.value == null ? '—' : N(pct(b.value)) + '%', N(n0(b.reviews)), N(n0(b.checkouts))];
        })) + '</div>';
    },
    gal: function (name) {
      var g = D.scopes[S.branch].galaxies.filter(function (x) { return x.name === name; })[0] || { neg: 0, pos: 0 };
      var negC = D.constellations.filter(function (c) { return inScope(c) && c.galaxy === name && c.polarity === 'neg' && c.status !== '씨앗'; }).sort(recentFirst);
      var seeds = D.constellations.filter(function (c) { return inScope(c) && c.galaxy === name && c.polarity === 'neg' && c.status === '씨앗'; }).sort(recentFirst);
      var singles = D.stars.filter(function (s) { return inScope(s) && s.galaxy === name && s.polarity === 'neg' && !s.constellation_id; })
        .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      var shown = singles.slice(0, S.more ? singles.length : 30);
      return head('은하 · ' + esc(brLabel()), galName(name), n0(g.neg), '불편', '칭찬 ' + NI(n0(g.pos))) +
        conList('불편 별자리', negC, '불편 별자리 없음') +
        (seeds.length ? conList('씨앗', seeds) : '') +
        '<div><div class="sect-k"><span class="t">단발 불편 별<b class="num">' + singles.length + '</b></span><span>최근 순</span></div>' +
        '<div class="rows">' + (shown.length ? shown.map(starRow).join('') : '<div class="empty">없음</div>') + '</div>' +
        (shown.length < singles.length ? '<button type="button" class="more" data-more="1"><span>나머지 ' + NI(singles.length - shown.length) + '개 보기</span></button>' : '') + '</div>';
    },
    con: function (id) {
      var c = CON[id];
      if (!c) return '<div class="empty">별자리 없음</div>';
      var cls = stClass(c);
      var chs = Object.keys(c.channels || {}).sort(function (a, b) { return c.channels[b] - c.channels[a]; }).map(function (k) { return esc(ch(k)) + ' ' + NI(c.channels[k]); }).join(' · ');
      var st = c.star_ids.map(function (sid) { return STAR[sid]; }).filter(Boolean).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      return '<div><div class="eyebrow"><span class="num">' + esc(c.id) + '</span><span>· ' + esc(c.galaxy) + '</span></div><h2 class="p-title">' + esc(c.name) + '</h2>' +
        '<div class="badges"><span class="badge ' + cls + '"><span>' + esc(c.status) + (c.status === '재발' && c.relapse_count ? ' ' + NI(c.relapse_count) + '회' : '') + '</span></span><span class="badge ghost">' + esc(c.branch) + '</span>' + (c.polarity === 'pos' ? '<span class="badge ghost">긍정</span>' : '') + '</div></div>' +
        '<dl class="facts"><dt>별</dt><dd>' + NI(c.star_ids.length) + '개</dd><dt>원천</dt><dd>' + (chs || '—') + '</dd>' +
        '<dt>기간</dt><dd>' + NI(ymd(c.first_date)) + ' ~ ' + NI(ymd(c.last_date)) + '</dd>' +
        (c.observation_start ? '<dt>관찰 시작</dt><dd>' + NI(ymd(c.observation_start)) + '</dd>' : '') +
        '<dt>받는 쪽</dt><dd>' + esc(OWNER[c.owner] || c.owner || '—') + '</dd>' +
        (c.task ? '<dt>수행과제</dt><dd>' + esc(c.task.title) + ' · ' + esc(c.task.status || '') + '</dd>' : '') + '</dl>' +
        (c.summary ? '<p class="summary">' + esc(c.summary) + '</p>' : '') +
        '<div><div class="sect-k"><span class="t">별<b class="num">' + st.length + '</b></span><span>최근 순</span></div><div class="rows">' + st.map(starRow).join('') + '</div></div>';
    },
    star: function (id) {
      var s = STAR[id];
      if (!s) return '<div class="empty">별 없음</div>';
      var rv = D.reviews[s.review_id] || {};
      var c = s.constellation_id ? CON[s.constellation_id] : null;
      var dsTag = s.date_source === 'collected' ? '<span class="tag">수집일</span>' : s.date_source === 'month' ? '<span class="tag">월 기준</span>' : '';
      var dateTxt = s.date_source === 'month' ? s.date.slice(0, 4) + '.' + s.date.slice(5, 7) : ymd(s.date);
      var ko = rv.text_ko || '', orig = rv.text_orig || '';
      var hasOrig = orig && orig.trim() && orig.trim() !== ko.trim();
      var showOrig = S.tab === 'orig' && hasOrig;
      var body = showOrig ? esc(orig) : markQuote(ko, s.quote);
      var pc = polClass(s.polarity);
      var mk = s.polarity === 'pos' ? 'var(--mk-pos)' : 'var(--mk-neg)';
      var sib = (STARS_BY_REVIEW[s.review_id] || []).filter(function (x) { return x.id !== s.id; });
      var sibRows = sib.map(function (x) {
        var xc = x.constellation_id ? CON[x.constellation_id] : null;
        return '<button type="button" class="row" data-star="' + esc(x.id) + '"><span class="dot ' + polClass(x.polarity) + '"></span><span class="nm">' + esc(x.phenomenon || '') + '<small>' + esc(galName(x.galaxy)) + ' · ' + (xc ? esc(xc.status) : '단발') + '</small></span><span class="st ' + polClass(x.polarity) + '">' + (x.polarity === 'pos' ? '칭찬' : '불편') + '</span><span class="n"></span></button>';
      }).join('');
      return '<div><div class="eyebrow"><span>' + esc(s.branch) + ' · ' + esc(ch(s.channel)) + ' ·</span><span class="num">' + esc(dateTxt) + '</span>' + dsTag + '</div>' +
        '<div class="score"><b class="num">' + (rv.rating != null ? esc((+rv.rating).toFixed(1)) : '—') + '</b><span class="num">/ ' + esc(rv.scale || 10) + '</span></div></div>' +
        '<div class="voice ' + pc + '"><div class="vk">' + (s.polarity === 'pos' ? '칭찬' : '불편') + ' · ' + esc(galName(s.galaxy)) + ' · ' + esc(c ? c.name : s.phenomenon || '') + (c ? '' : ' · 단발') + '</div>' +
        '<blockquote>' + esc(s.quote || '') + '</blockquote>' + (s.relation_signal ? '<div class="sig">CR 신호 · ' + esc(SIG[s.relation_signal] || s.relation_signal) + '</div>' : '') + '</div>' +
        '<div class="rev"><div class="sect-k"><span class="t">리뷰 전문</span>' + (hasOrig ? '' : '<span>원문 한국어</span>') + '</div>' +
        (hasOrig ? '<div class="rev-tabs" role="group" aria-label="언어"><button type="button" data-tab="ko" aria-pressed="' + !showOrig + '">번역</button><button type="button" data-tab="orig" aria-pressed="' + showOrig + '">원문</button></div>' : '') +
        '<p class="prose" style="--mk:' + mk + '">' + (body || '<span class="empty">본문 없음</span>') + '</p></div>' +
        (c ? '<div><div class="sect-k"><span class="t">별자리</span></div><div class="rows">' + conRow(c) + '</div></div>' : '') +
        (sib.length ? '<div><div class="sect-k"><span class="t">같은 리뷰의 다른 별<b class="num">' + sib.length + '</b></span></div><div class="rows">' + sibRows + '</div></div>' : '');
    }
  };
  function markQuote(text, quote) {
    var t = esc(text || ''), q = esc(quote || '');
    if (!q || t.indexOf(q) < 0) return t;
    return t.replace(q, function () { return '<mark>' + q + '</mark>'; });
  }

  function renderPanel() {
    var top = S.stack[S.stack.length - 1];
    var p = $('panel');
    $('p-body').innerHTML = VIEWS[top.v](top.arg);
    $('p-back').hidden = S.stack.length < 2;
    if (p.hidden) {
      p.hidden = false; $('scrim').hidden = false; p.classList.add('enter');
      requestAnimationFrame(function () { requestAnimationFrame(function () { p.classList.remove('enter'); }); });
    }
  }
  function open(v, arg, reset) {
    if (reset) S.stack = [];
    S.more = false; S.tab = 'ko';
    S.stack.push({ v: v, arg: arg });
    renderPanel(); $('p-scroll').scrollTop = 0;
  }
  function closePanel() {
    var p = $('panel'); if (p.hidden) return;
    S.stack = []; p.classList.add('enter'); $('scrim').hidden = true;
    setTimeout(function () { if (!S.stack.length) p.hidden = true; }, 260);
  }
  function back() { if (S.stack.length > 1) { S.stack.pop(); S.more = false; renderPanel(); $('p-scroll').scrollTop = 0; } else closePanel(); }

  // ── 조작 ──
  $('cards').addEventListener('click', function (e) { var b = e.target.closest('[data-open]'); if (b) open(b.dataset.open, null, true); });
  $('gals').addEventListener('click', function (e) { var b = e.target.closest('[data-gal]'); if (b) open('gal', b.dataset.gal, true); });
  $('p-body').addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab]'); if (t) { S.tab = t.dataset.tab; renderPanel(); return; }
    var m = e.target.closest('[data-more]'); if (m) { S.more = true; renderPanel(); return; }
    var c = e.target.closest('[data-con]'); if (c) { open('con', c.dataset.con); return; }
    var s = e.target.closest('[data-star]'); if (s) { open('star', s.dataset.star); }
  });
  $('p-back').addEventListener('click', back);
  $('p-close').addEventListener('click', closePanel);
  $('scrim').addEventListener('click', closePanel);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') back(); });
  $('seg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-br]'); if (!b || b.dataset.br === S.branch) return;
    S.branch = b.dataset.br; store.set('voc-metrics-branch', S.branch);
    // 열린 목록은 새 지점 기준으로 다시 그린다(별·별자리 상세는 그대로)
    renderAll();
  });
  document.querySelector('.thm-seg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme]'); if (!b) return;
    S.theme = b.dataset.theme; store.set('voc-metrics-theme', S.theme);
    document.documentElement.className = S.theme;
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = S.theme === 'dark' ? '#121417' : '#ffffff';
    renderHead();
  });

  renderAll();
  window.__vocMetrics = { state: S, data: D };
})();
