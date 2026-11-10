'use strict';
const $ = (s) => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let token = store.get('cosmoa.token', null);
if (!token) { token = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, '') + 'xxxxxxxx'; store.set('cosmoa.token', token); }
const profile = () => store.get('cosmoa.profile', { nickname: '', snsPlatform: 'X', sns: '' });

let state = { events: [], roles: [], meta: {} };
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

async function call(method, path, body) {
  const r = await fetch('/api/' + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify({ token, ...body }) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || '요청에 실패했습니다');
  return j;
}
function toast(msg) { const t = h('div', { class: 'toast' }, msg); document.body.append(t); setTimeout(() => t.remove(), 2200); }

const fmtDate = (e) => {
  const f = (d) => { const [y, m, dd] = d.split('-'); return `${y}.${m}.${dd}`; };
  return e.endDate && e.endDate !== e.startDate ? `${f(e.startDate)} ~ ${f(e.endDate)}` : f(e.startDate);
};
const dday = (e) => {
  const t = today();
  if (e.endDate < t) return '종료';
  if (e.startDate <= t) return '진행중';
  const d = Math.round((Date.parse(e.startDate) - Date.parse(t)) / 864e5);
  return 'D-' + d;
};
const officialHref = (e) => e.officialUrl || 'https://www.google.com/search?q=' + encodeURIComponent(e.name + ' 공식');

function extraLinks(e) {
  return (e.links || []).filter(l => /^https?:\/\//.test(l.url)).map(l => h('a', { class: 'btn ghost', href: l.url, target: '_blank', rel: 'noopener noreferrer', onclick: (ev) => ev.stopPropagation() }, l.label + ' ↗'));
}
function officialBtn(e, cls = 'btn ghost') {
  return h('a', { class: cls, href: officialHref(e), target: '_blank', rel: 'noopener noreferrer', onclick: (ev) => ev.stopPropagation() }, e.officialUrl ? '공식 정보 보기 ↗' : '공식 정보 검색 ↗');
}

function originBadge(e) {
  return e.origin ? [' ', h('span', { class: 'tag', title: '이용자가 제보하고 관리자가 출처를 확인한 정보입니다' }, '이용자 제보 · 확인됨')] : null;
}

const FIELD_DEFS = [['name', '행사명', '예: 2026 ○○ 페스티벌'], ['startDate', '시작일', 'YYYY-MM-DD'], ['endDate', '종료일', 'YYYY-MM-DD (하루면 비워두세요)'], ['time', '시간', '예: 11:00 ~ 21:00'], ['fee', '요금', '예: 무료 / 1일권 24,000원'], ['location', '장소', '예: 일산 킨텍스 제1전시장'], ['region', '지역', '예: 서울, 경기, 부산'], ['officialUrl', '공식 사이트/SNS 링크', 'https://']];
function openSuggest(ev) {
  const isEdit = !!ev;
  $('#s-title').textContent = isEdit ? `정보 수정 제안 · ${ev.name}` : '새 행사 제보';
  const inputs = {};
  const rows = FIELD_DEFS.filter(([k]) => !(isEdit && k === 'name')).map(([k, label, ph]) => {
    inputs[k] = h('input', { placeholder: ph, maxlength: 160, type: (k === 'startDate' || k === 'endDate') ? 'date' : 'text', value: isEdit ? (ev[k] || '') : '' });
    return h('label', { class: 'fld' }, h('span', { class: 'mute' }, label + (!isEdit && (k === 'name' || k === 'startDate') ? ' *' : '')), inputs[k]);
  });
  const src = h('input', { placeholder: '근거 링크 (공식 공지·SNS 게시글) *', maxlength: 200 });
  const note = h('textarea', { rows: 2, maxlength: 300, placeholder: '관리자에게 전할 메모 (선택)' });
  const nick = h('input', { placeholder: '닉네임 (선택)', maxlength: 20, value: profile().nickname });
  $('#s-body').replaceChildren(
    h('p', { class: 'mute' }, '제보한 내용은 바로 공개되지 않고, 관리자가 출처를 확인한 뒤 반영됩니다. ' + (isEdit ? '바꿀 항목만 고쳐주세요.' : '')),
    ...rows, src, note, nick,
    h('button', { class: 'btn', onclick: async (e2) => {
      const fields = {}; for (const [k, i] of Object.entries(inputs)) if (i.value.trim() && (!isEdit || i.value.trim() !== (ev[k] || ''))) fields[k] = i.value.trim();
      e2.target.disabled = true;
      try {
        await call('POST', 'suggestions', { type: isEdit ? 'edit' : 'new', eventId: isEdit ? ev.id : undefined, fields, sourceUrl: src.value, note: note.value, nickname: nick.value });
        toast('제보 완료! 관리자 확인 후 반영돼요'); $('#sdlg').close();
      } catch (er) { toast(er.message); e2.target.disabled = false; }
    } }, '제출'));
  $('#sdlg').showModal();
}
$('#suggest-new').onclick = () => openSuggest(null);
$('#s-close').onclick = () => $('#sdlg').close();

const WD = ['일', '월', '화', '수', '목', '금', '토'];
function dateBlock(e) {
  const [y, m, d] = e.startDate.split('-').map(Number);
  const multi = e.endDate && e.endDate !== e.startDate;
  const wd = WD[new Date(y, m - 1, d).getDay()];
  const end = multi ? ' ~ ' + Number(e.endDate.split('-')[2]) + '일' : '';
  return h('div', { class: 'date' }, h('small', {}, `${y}.${String(m).padStart(2, '0')}`), h('b', {}, String(d)), h('em', {}, wd + end));
}
function infoList(e, compact) {
  const rows = [['📅', fmtDate(e)], ['⏰', e.time], ['💰', e.fee], ['📍', e.location]].slice(compact ? 1 : 0);
  return h('dl', { class: 'info' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', v ? {} : { class: 'na' }, v || '공식 사이트 확인')]));
}
const CATS = [['전체', '', '✨'], ['코스프레', '코스프레|코스', '👗'], ['게임', '게임', '🎮'], ['애니메이션', '애니', '🎬'], ['만화·웹툰', '만화|웹툰|코믹|일러', '📚'], ['서브컬처', '서브컬처', '💜'], ['굿즈·마켓', '굿즈|마켓', '🛍️'], ['대회·이벤트', '대회|이벤트|콘테스트', '🏆']];
let cat = 0;
const catMatch = (e, i) => !CATS[i][1] || new RegExp(CATS[i][1]).test((e.category || '') + ' ' + e.name);
const upcoming = () => state.events.filter(e => e.endDate >= today());
const pillCls = (d) => d === '진행중' ? 'live' : (d.startsWith('D-') && Number(d.slice(2)) <= 7 ? 'hot' : '');

function renderTop() {
  const ups = upcoming(), f = ups[0], box = $('#featured');
  box.replaceChildren();
  if (f) {
    box.append(h('span', { class: 'stars', 'aria-hidden': 'true' }, '✦'),
      h('span', { class: 'tag' }, (dday(f) === '진행중' ? '🔴 진행중' : '⭐ 추천 행사') + ' · ' + dday(f)),
      h('h3', {}, f.name),
      h('div', { class: 'fmeta' }, h('span', {}, '📅 ' + fmtDate(f)), f.location ? h('span', {}, '📍 ' + f.location) : null, f.fee ? h('span', {}, '💰 ' + f.fee) : null),
      h('div', { class: 'actions' }, h('button', { class: 'btn light', onclick: () => openEvent(f.id) }, '참가 체크 · 문의'), h('a', { class: 'btn ghost', style: 'background:rgba(255,255,255,.2);color:#fff', href: officialHref(f), target: '_blank', rel: 'noopener noreferrer' }, f.officialUrl ? '공식 정보 ↗' : '공식 정보 검색 ↗')));
  } else {
    box.append(h('h3', {}, '곧 열리는 행사를 기다리고 있어요'), h('div', { class: 'fmeta' }, '행사 제보로 정보를 더해주세요!'));
  }
  const ul = $('#upnext-list'); ul.replaceChildren();
  ups.slice(0, 4).forEach(e => {
    const [, m, d] = e.startDate.split('-'), dd = dday(e);
    ul.append(h('li', { onclick: () => openEvent(e.id) }, h('div', { class: 'un-d' }, h('b', {}, `${m}.${d}`), h('small', {}, e.endDate !== e.startDate ? '~' + e.endDate.slice(5).replace('-', '.') : '당일')),
      h('div', { class: 'un-i' }, h('div', { class: 'un-t' }, e.name), h('div', { class: 'un-p' }, e.location || '장소 확인 필요')), h('span', { class: 'pill ' + pillCls(dd) }, dd)));
  });
  if (!ups.length) ul.append(h('li', { class: 'mute' }, '예정된 행사가 없어요'));
  const cl = $('#cat-list'); cl.replaceChildren();
  CATS.forEach(([name, , icon], i) => {
    const n = state.events.filter(e => catMatch(e, i)).length;
    cl.append(h('button', { class: 'cat' + (i === cat ? ' on' : ''), onclick: () => { cat = i; renderTop(); render(); $('#events').scrollIntoView({ behavior: 'smooth' }); } }, h('i', {}, icon), name, h('small', {}, n + '개')));
  });
}

function render() {
  const q = $('#q').value.trim().toLowerCase(), region = $('#region').value, period = $('#period').value, t = today();
  const list = state.events.filter(e =>
    (!q || (e.name + ' ' + e.location).toLowerCase().includes(q)) &&
    (!region || e.region === region) && catMatch(e, cat) &&
    (period === 'all' || (period === 'upcoming' ? e.endDate >= t : e.endDate < t)));
  if (period === 'past') list.reverse();
  const box = $('#list'); box.replaceChildren();
  $('#empty').hidden = list.length > 0;
  $('#count').textContent = list.length ? `${list.length}개` : '';
  for (const e of list) {
    const dd = dday(e), cls = dd === '종료' ? 'end' : dd === '진행중' ? 'live' : 'dday';
    box.append(h('article', { class: 'card' + (dd === '종료' ? ' past' : ''), tabindex: 0, onclick: () => openEvent(e.id), onkeydown: (k) => k.key === 'Enter' && openEvent(e.id) },
      h('div', { class: 'head' }, dateBlock(e), h('div', {},
        h('div', { class: 'tags' }, h('span', { class: 'tag ' + cls }, dd), h('span', { class: 'tag' }, e.category || '기타'), e.sample ? h('span', { class: 'tag sample' }, '샘플') : null, originBadge(e)),
        h('h3', {}, e.name))),
      infoList(e, true),
      h('div', { class: 'counts' }, state.roles.map(r => h('span', { class: e.counts[r] ? 'has' : '' }, `${r} ${e.counts[r] || 0}`)), h('span', {}, `💬 ${e.commentCount}`)),
      h('div', { class: 'actions' }, officialBtn(e), extraLinks(e), h('button', { class: 'btn', onclick: (ev) => { ev.stopPropagation(); openEvent(e.id); } }, '참가 체크 · 문의'))));
  }
}

async function load() {
  const j = await (await fetch('/api/events')).json();
  state = j;
  const regs = [...new Set(j.events.map(e => e.region).filter(Boolean))];
  const sel = $('#region'), cur = sel.value;
  sel.replaceChildren(h('option', { value: '' }, '전체 지역'), ...regs.map(r => h('option', { value: r }, r)));
  sel.value = cur;
  const lr = j.meta && j.meta.lastRun;
  $('#meta').textContent = lr ? `행사 정보 마지막 자동 수집: ${new Date(lr).toLocaleString('ko-KR')} (하루 1회 갱신)` : '행사 정보 자동 수집 대기 중';
  renderTop();
  render();
}

let cur = null;
async function openEvent(id) {
  cur = id;
  const e = state.events.find(x => x.id === id);
  $('#d-title').textContent = e.name;
  $('#dlg').showModal();
  await renderDetail(e);
}
async function renderDetail(e) {
  const body = $('#d-body');
  const data = await (await fetch('/api/events/' + encodeURIComponent(e.id))).json();
  const pr = profile();
  const myServer = store.get('cosmoa.joined', {})[e.id];
  let role = myServer ? myServer.role : '';
  let filter = '전체';

  const form = h('section', {},
    h('img', { class: 'sec-mascot', src: '/img/chibi-hi.webp', alt: '', width: 70 }),
    h('h4', {}, myServer ? '✅ 내 참가 정보 (수정 가능)' : '🙋 참가 체크'),
    h('div', { class: 'roles' }, state.roles.map(r => h('label', {}, h('input', { type: 'radio', name: 'role', value: r, checked: r === role, onchange: () => (role = r) }), h('span', {}, r)))),
    h('div', { class: 'row' }, h('input', { id: 'f-nick', maxlength: 20, placeholder: '닉네임 (필수)', value: (myServer && myServer.nickname) || pr.nickname })),
    h('div', { class: 'row' },
      h('select', { id: 'f-plat' }, ['X', '인스타그램', '기타(URL)'].map(p => h('option', { value: p, selected: p === ((myServer && myServer.snsPlatform) || pr.snsPlatform) }, p))),
      h('input', { id: 'f-sns', maxlength: 100, placeholder: '@아이디 또는 URL (선택)', value: (myServer && myServer.sns) || pr.sns })),
    h('div', { class: 'row' }, h('input', { id: 'f-memo', maxlength: 120, placeholder: '한줄 소개 (예: 원신 · 클레 코스 / 인물 촬영 가능)', value: (myServer && myServer.memo) || '' })),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: async (ev) => {
        if (!role) return toast('분류를 선택해주세요');
        const p = { eventId: e.id, role, nickname: $('#f-nick').value, snsPlatform: $('#f-plat').value, sns: $('#f-sns').value, memo: $('#f-memo').value };
        ev.target.disabled = true;
        try {
          await call('POST', 'participate', p);
          store.set('cosmoa.profile', { nickname: p.nickname, snsPlatform: p.snsPlatform, sns: p.sns });
          const j = store.get('cosmoa.joined', {}); j[e.id] = p; store.set('cosmoa.joined', j);
          toast('참가 체크 완료!'); await load(); await renderDetail(e);
        } catch (er) { toast(er.message); ev.target.disabled = false; }
      } }, myServer ? '수정 저장' : '참가할래요'),
      myServer && h('button', { class: 'btn danger', onclick: async () => {
        await call('DELETE', 'participate', { eventId: e.id });
        const j = store.get('cosmoa.joined', {}); delete j[e.id]; store.set('cosmoa.joined', j);
        toast('참가를 취소했어요'); await load(); await renderDetail(e);
      } }, '참가 취소')));

  const plist = h('ul', { class: 'plist' });
  const tabs = h('div', { class: 'tabs' });
  const drawP = () => {
    tabs.replaceChildren(...['전체', ...state.roles].map(r => h('button', { class: r === filter ? 'on' : '', onclick: () => { filter = r; drawP(); } }, r)));
    const ps = data.participants.filter(p => filter === '전체' || p.role === filter);
    plist.replaceChildren(...(ps.length ? ps.map(p => h('li', {},
      h('span', { class: 'who' }, p.nickname), ' ', h('span', { class: 'tag' }, p.role), ' ',
      p.snsUrl ? h('a', { href: p.snsUrl, target: '_blank', rel: 'noopener noreferrer nofollow' }, (p.snsPlatform || 'SNS') + ' ' + p.sns) : (p.sns ? h('span', { class: 'mute' }, p.sns) : null),
      p.memo ? h('div', { class: 'mute' }, p.memo) : null)) : [h('li', { class: 'mute' }, '아직 참가자가 없어요. 첫 번째로 체크해보세요!')]));
  };
  drawP();

  const mineIds = new Set(store.get('cosmoa.myComments', []));
  const clist = h('ul', { class: 'clist' });
  const drawC = () => clist.replaceChildren(...(data.comments.length ? data.comments.map(c => h('li', {},
    h('span', { class: 'who' }, c.nickname), ' ', c.role ? h('span', { class: 'tag' }, c.role) : null, ' ', c.inquiry ? h('span', { class: 'tag dday' }, '문의·촬영') : null,
    ' ', h('span', { class: 'mute' }, new Date(c.createdAt).toLocaleString('ko-KR')),
    mineIds.has(c.id) ? [' ', h('a', { href: '#', class: 'mute', onclick: async (ev) => { ev.preventDefault(); try { await call('DELETE', 'comments', { id: c.id }); toast('삭제했어요'); await load(); await renderDetail(e); } catch (er) { toast(er.message); } } }, '삭제')] : null,
    h('div', {}, c.text))) : [h('li', { class: 'mute' }, '첫 댓글을 남겨보세요. 촬영 약속이나 문의도 환영!')]));
  drawC();
  const cform = h('div', {},
    h('div', { class: 'row' }, h('input', { id: 'c-nick', maxlength: 20, placeholder: '닉네임', value: pr.nickname })),
    h('textarea', { id: 'c-text', rows: 3, maxlength: 500, placeholder: '문의가 있거나 촬영 약속을 잡고 싶다면 댓글로 남겨주세요 (SNS 계정/DM 안내 포함 가능)' }),
    h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'c-inq', checked: true }), '문의/촬영 약속 댓글로 표시'),
    h('button', { class: 'btn', onclick: async (ev) => {
      ev.target.disabled = true;
      try {
        const c = await call('POST', 'comments', { eventId: e.id, nickname: $('#c-nick').value, text: $('#c-text').value, inquiry: $('#c-inq').checked, role: role || (myServer && myServer.role) || '' });
        store.set('cosmoa.myComments', [...mineIds, c.id]);
        const p = profile(); store.set('cosmoa.profile', { ...p, nickname: $('#c-nick').value });
        await load(); await renderDetail(e);
      } catch (er) { toast(er.message); ev.target.disabled = false; }
    } }, '댓글 등록'));

  body.replaceChildren(
    h('section', {}, h('span', { class: 'tag dday' }, dday(e)), ' ', h('span', { class: 'tag' }, e.category || '기타'), e.sample ? [' ', h('span', { class: 'tag sample' }, '샘플 데이터')] : null, originBadge(e),
      h('div', { style: 'height:8px' }), infoList(e),
      e.description ? h('p', { class: 'mute' }, e.description) : null,
      h('div', { class: 'actions' }, officialBtn(e, 'btn'), extraLinks(e), h('button', { class: 'btn ghost', onclick: () => openSuggest(e) }, '✏️ 정보 수정 제안')),
      e.sourceUrl ? h('p', { class: 'mute' }, '제보 출처: ', h('a', { href: e.sourceUrl, target: '_blank', rel: 'noopener noreferrer nofollow' }, e.sourceUrl)) : null),
    form,
    h('section', {}, h('h4', {}, `👥 참가자 (${data.participants.length})`), tabs, plist),
    h('section', {}, h('h4', {}, `💬 문의 · 촬영약속 (${data.comments.length})`), clist, h('div', { style: 'height:10px' }), cform));
}

$('#d-close').onclick = () => $('#dlg').close();
$('#dlg').addEventListener('click', (ev) => { if (ev.target === $('#dlg')) $('#dlg').close(); });
['q', 'region'].forEach(id => $('#' + id).addEventListener('input', render));
$('#hero-search').addEventListener('submit', (ev) => { ev.preventDefault(); render(); $('#events').scrollIntoView({ behavior: 'smooth' }); });
$('#nav-suggest').addEventListener('click', (ev) => { ev.preventDefault(); openSuggest(null); });
$('#reset').onclick = () => { $('#q').value = ''; $('#region').value = ''; cat = 0; $('#period').value = 'all'; document.querySelectorAll('#period-seg button').forEach(x => x.classList.toggle('on', x.dataset.v === 'all')); renderTop(); render(); };
// 마스코트 말풍선 (닫으면 기억)
try { if (!localStorage.getItem('cosmoa.mascotClosed')) $('#mascot').hidden = false; } catch { $('#mascot').hidden = false; }
// 히어로를 지나 스크롤하면 나타나고, 말풍선은 몇 초 뒤 사라진다
const mascot = $('#mascot'); mascot.classList.add('away');
addEventListener('scroll', () => mascot.classList.toggle('away', scrollY < 520), { passive: true });
setTimeout(() => { const b = mascot.querySelector('.bubble'); if (b) b.style.display = 'none'; }, 9000);
$('#mascot-x').onclick = () => { $('#mascot').hidden = true; try { localStorage.setItem('cosmoa.mascotClosed', '1'); } catch {} };
$('#period-seg').addEventListener('click', (ev) => {
  const b = ev.target.closest('button'); if (!b) return;
  $('#period').value = b.dataset.v;
  document.querySelectorAll('#period-seg button').forEach(x => x.classList.toggle('on', x === b));
  render();
});
load();
