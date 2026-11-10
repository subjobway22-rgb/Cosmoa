# ✦ 코스모아 (Cosmoa)

코스프레·서브컬처 행사 정보를 모아 보여주고, 사진사 / 코스어 / 관람객 / 부스러 / 기타로 참가 체크, SNS 남기기, 문의·촬영약속 댓글을 할 수 있는 웹 서비스. 외부 의존성 없음(Node 18+).

```bash
npm start        # http://localhost:3000
npm test
```

## 기능
- 행사 카드: 날짜·시간·요금·위치 요약, D-day, 역할별 참가자 수, **공식 정보 버튼**(공식 URL이 없으면 검색 링크)
- 상세: 참가 체크(역할·닉네임·SNS·한줄소개, 수정/취소), 역할별 참가자 목록, 문의·촬영약속 댓글
- 로그인 없음: 브라우저에 저장된 랜덤 토큰으로 본인 글만 수정/삭제 (서버엔 해시만 저장)
- 검색/지역/기간 필터, 다크모드, 모바일 대응

## 행사 정보 자동 수집 (하루 1회)
서버가 켜져 있으면 마지막 수집 후 24시간이 지났을 때 자동 실행됩니다(1시간마다 확인).
- `data/sources.json`의 출처 페이지와 각 행사의 공식 페이지에서 schema.org `Event`(JSON-LD)를 읽어 일정·시간·요금·장소를 갱신/추가합니다.
- JSON-LD를 제공하지 않는 사이트는 자동 수집되지 않으니 `data/seed-events.json`에 직접 추가하거나 `lib/scraper.js`에 출처별 파서를 더하세요. (`"locked": true`면 자동 갱신 제외)
- 수동 실행: `npm run refresh` 또는 `ADMIN_TOKEN=... ` 설정 후 `POST /api/admin/refresh` (헤더 `x-admin-token`)
- 서버리스/슬립 호스팅이면 cron으로 `npm run refresh`를 하루 한 번 돌리세요.

## 주의
- `seed-events.json`은 뉴스 검색 결과 기준의 초기 데이터입니다(시간·요금이 빈 항목은 공식 사이트 확인). 최신 정보는 공식 사이트 기준입니다.
- 데이터는 `data/*.json` 파일에 저장됩니다(영구 디스크 필요). 트래픽이 커지면 DB로 교체하세요.

## 링크 필드
행사 JSON의 `officialUrl`(공식 사이트)과 `links`(`[{"label":"티켓 안내","url":"https://..."}]`, 티켓·인스타·X 등)가 카드와 상세에 버튼으로 표시됩니다.

## 이용자 제보 (관리자 승인제)
- 이용자가 "행사 제보하기" / "정보 수정 제안"으로 제출하면 **즉시 공개되지 않고** `data/suggestions.json`에 대기 상태로 저장됩니다.
- 출처 링크(공식 공지·SNS)가 필수이며, 링크는 http(s)만, 날짜는 YYYY-MM-DD만 허용합니다. 브라우저/IP당 하루 5건, 대기 300건 상한.
- 관리자는 `ADMIN_TOKEN=비밀값 npm start` 후 `/admin.html`에서 토큰을 입력해 승인/거절합니다. 승인된 항목은 `origin: "user"`, `locked: true`가 되어 자동 수집이 덮어쓰지 않으며 "이용자 제보 · 확인됨" 배지가 붙습니다.
- `ADMIN_TOKEN`을 설정하지 않으면 관리자 기능은 모두 잠깁니다(제보는 쌓이지만 승인할 수 없음).

## 배포 (완전 무료, 카드 불필요): Cloudflare Workers + Upstash Redis
사이트·API·하루 1회 자동 수집(cron)을 모두 Cloudflare Workers 무료 플랜에서 처리하고, 데이터는 Upstash Redis(무료)에 저장합니다. 서버가 잠들지 않습니다.
1. [Upstash](https://upstash.com)에서 Redis DB 생성 → REST URL / TOKEN 복사
2. [Cloudflare](https://dash.cloudflare.com) 가입 → Workers & Pages → Create → **Import a repository**로 이 GitHub 저장소 선택 (배포 명령은 기본값 `npx wrangler deploy`)
3. 생성된 Worker → Settings → Variables and Secrets에 아래 3개를 **Secret**으로 추가 후 재배포
   - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ADMIN_TOKEN`(직접 정한 긴 비밀값)
4. 주소 `https://cosmoa.<계정>.workers.dev` 접속. `/admin`에서 `ADMIN_TOKEN`으로 제보 승인
- 하루 1회 수집은 `wrangler.jsonc`의 cron(매일 06:17 KST)으로 실행됩니다.
- 로컬 실행: `npm start` (환경변수가 없으면 `data/` 폴더 파일에 저장)
- 동시 쓰기가 몰리면 드물게 마지막 쓰기만 남을 수 있는 단순 구조입니다(소규모용).
