'use strict';
// 욕설·링크 필터. 띄어쓰기/특수문자/숫자 끼워넣기로 우회하는 것을 줄이기 위해 정규화한 텍스트도 함께 검사한다.
const ZW = /[\u200b-\u200f\u2028-\u202f\u2060\ufeff]/g;

// 욕설/비하/성적·자해 유도 표현. "시발점", "시발역"처럼 정상 단어는 예외 처리.
const BAD = [
  /씨발|씨빨|시발(?!점|역|자|지|선|거)|ㅅㅂ|ㅆㅂ|씹[새쌔]|씹알|씹년|씹놈|ㅅ1ㅂ|시1발|슈발|쉬발|씨바|시바(?!견|이누|스)/,
  /병신|븅신|ㅂㅅ|ㅄ|벼엉신|등신(?!대)|머저리|찐따|[장정]애(?:새|놈|년)/,
  /지랄|염병|옘병|ㅈㄹ|좆|조까|ㅈ까|존나|졸라게|존내|개[새세쌔]끼|개[새세쌔]기|[이저그니][새쌔]끼|새끼야|애미|느금|니미|엠창|패드립|니애비|네애미/,
  /미친(?:놈|년|새)|또라이|돌아이|꺼져|닥쳐|뒤질|죽어버|죽여|죽일|죽을래|자살|자해|따먹|강간|성폭|섹스|야동|딸딸|창녀|걸레년|한남충|김치녀|메갈|짱깨|쪽바리|틀딱|맘충/,
  /fuck|f\*ck|shit|bitch|asshole|dick|pussy|cunt|nigg|whore|slut|retard/,
];
// 링크: 주소, 도메인, 메신저 초대 등
const LINK = [
  /https?:?\/\/|ftp:\/\/|www\./,
  /[a-z0-9][a-z0-9-]*\.(?:com|net|org|kr|co|io|me|gg|ly|tv|xyz|link|app|site|shop|top|info|biz|cc|to|vip|club|online|store|page|dev|ai)(?![a-z])/,
  /open\.kakao|kakao\.com|t\.me|discord\.gg|discord\.com|bit\.ly|linktr\.ee|openchat/,
];

function check(text, { allowLinks = false } = {}) {
  const t = String(text || '');
  const strip = (x) => x.toLowerCase().replace(ZW, '');
  // NFKC는 호환 자모(ㅅㅂ)를 다른 코드로 바꿔 버리므로 변환 전·후를 모두 검사한다
  const rawA = strip(t), rawB = strip(t.normalize('NFKC'));
  const squash = (x) => x.replace(/[\s.\-_*~`'"!?,;:|\\/^()[\]{}<>+=]/g, '');
  const forms = [...new Set([rawA, rawB, squash(rawA), squash(rawB)])];
  if (BAD.some(re => forms.some(f => re.test(f)))) return '욕설이나 부적절한 표현은 올릴 수 없어요';
  if (!allowLinks) {
    const dots = (x) => x.replace(/\(dot\)|\[dot\]|\{dot\}/g, '.').replace(/\s*\.\s*/g, '.').replace(/\s*\/\s*/g, '/');
    const lf = [...new Set([rawA, rawB, dots(rawA), dots(rawB)])];
    if (LINK.some(re => lf.some(f => re.test(f)))) return '링크는 올릴 수 없어요 (SNS는 아이디로 남겨주세요)';
  }
  return '';
}
// 여러 필드를 한 번에 검사 → 첫 번째 오류 메시지 또는 ''
function checkAll(values, opts) {
  for (const v of values) { const e = check(v, opts); if (e) return e; }
  return '';
}
module.exports = { check, checkAll };
