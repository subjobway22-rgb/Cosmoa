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

function infoList(e) {
  const rows = [['📅 날짜', fmtDate(e)], ['⏰ 시간', e.time || '공식 사이트 확인'], ['💰 요금', e.fee || '공식 사이트 확인'], ['📍 위치', e.location || '공식 사이트 확인']];
  return h('dl', { class: 'info' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}
function officialBtn(e, cls = 'btn ghost') {
  return h('a', { class: cls, href: officialHref(e), target: '_blank', rel: 'noopener noreferrer', onclick: (ev) => ev.stopPropagation() }, e.officialUrl ? '공식 정보 보기 ↗' : '공식 정보 검색 ↗');
}

function render() {
  const q = $('#q').value.trim().toLowerCase(), region = $('#region').value, period = $('#period').value, t = today();
  const list = state.events.filter(e =>
    (!q || (e.name + ' ' + e.location).toLowerCase().includes(q)) &&
    (!region || e.region === region) &&
    (period === 'all' || (period === 'upcoming' ? e.endDate >= t : e.endDate < t)));
  const box = $('#list'); box.replaceChildren();
  $('#empty').hidden = list.length > 0;
  for (const e of list) {
    box.append(h('article', { class: 'card', tabindex: 0, onclick: () => openEvent(e.id), onkeydown: (k) => k.key === 'Enter' && openEvent(e.id) },
      h('div', {}, h('span', { class: 'tag dday' }, dday(e)), ' ', h('span', { class: 'tag' }, e.category || '기타'), e.sample ? [' ', h('span', { class: 'tag sample' }, '샘플')] : null),
      h('h3', {}, e.name), infoList(e),
      h('div', { class: 'counts' }, state.roles.map(r => h('span', {}, `${r} ${e.counts[r] || 0}`)), h('span', {}, `💬 ${e.commentCount}`)),
      h('div', { class: 'actions' }, officialBtn(e), h('button', { class: 'btn', onclick: (ev) => { ev.stopPropagation(); openEvent(e.id); } }, '참가 체크 · 문의'))));
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
    h('section', {}, h('span', { class: 'tag dday' }, dday(e)), ' ', h('span', { class: 'tag' }, e.category || '기타'), e.sample ? [' ', h('span', { class: 'tag sample' }, '샘플 데이터')] : null,
      h('div', { style: 'height:8px' }), infoList(e),
      e.description ? h('p', { class: 'mute' }, e.description) : null,
      h('div', { class: 'actions' }, officialBtn(e, 'btn'))),
    form,
    h('section', {}, h('h4', {}, `👥 참가자 (${data.participants.length})`), tabs, plist),
    h('section', {}, h('h4', {}, `💬 문의 · 촬영약속 (${data.comments.length})`), clist, h('div', { style: 'height:10px' }), cform));
}

$('#d-close').onclick = () => $('#dlg').close();
$('#dlg').addEventListener('click', (ev) => { if (ev.target === $('#dlg')) $('#dlg').close(); });
['q', 'region', 'period'].forEach(id => $('#' + id).addEventListener('input', render));
load();
