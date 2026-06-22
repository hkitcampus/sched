# course_cal — Airtable 프록시 (Cloudflare Worker)

Airtable API 키를 **브라우저로 내려보내지 않기 위한** 서버리스 프록시입니다.
키는 Cloudflare에만 보관되고, 정적 사이트(`index.html`)는 이 프록시 주소만 호출합니다.

```
브라우저 ──(키 없음)──▶ Cloudflare Worker ──(키 주입)──▶ Airtable
```

---

## 0. 사전 준비 — 기존 Airtable 토큰 값 확보

토큰은 **재발급하지 않고 기존 것을 그대로** 사용합니다. 단, 토큰 값을 한 번만
Cloudflare에 등록해야 하므로 기존 토큰 문자열을 손에 들고 있어야 합니다.

- 기존 토큰: `patIOSiR1aSitXon5.` 로 시작하는 그 값
- 어디서 확인? 코드에서 방금 제거했으므로 **Git 히스토리**(이전 커밋의
  `course_script.js`)에서 복사하거나, 따로 적어둔 곳에서 가져오세요.
  (Airtable 토큰 페이지는 생성 후 전체 값을 다시 보여주지 않습니다.)

> 이 값은 코드/저장소에 다시 넣지 말고, 아래 3-2 단계의 입력창에만 붙여넣습니다.

---

## 1. 배포 (한 번만)

Node.js가 설치된 상태에서 이 `proxy/` 폴더에서 실행:

```bash
# 1) Cloudflare 로그인 (브라우저 열림, 무료 계정으로 OK)
npx wrangler login

# 2) 기존 Airtable 토큰을 Secret으로 등록 (입력창에 기존 토큰 붙여넣기)
npx wrangler secret put AIRTABLE_TOKEN

# 3) 배포
npx wrangler deploy
```

배포가 끝나면 다음과 같은 주소가 출력됩니다:

```
https://course-cal-proxy.<당신의서브도메인>.workers.dev
```

---

## 2. 프런트엔드에 주소 연결

`course_script.js` 상단의 `API_CONFIG.proxyUrl` 값을 위에서 받은 주소로 교체:

```js
const API_CONFIG = {
    proxyUrl: 'https://course-cal-proxy.<당신의서브도메인>.workers.dev',
    scheduleTable: 'curri_schedule_db',
    holidayTable: 'custom_holidays_db'
};
```

그리고 커밋 → GitHub Pages 재배포.

---

## 3. (권장) 허용 도메인 제한

아무나 이 프록시로 Airtable에 쓰지 못하도록 `wrangler.toml` 의 `ALLOWED_ORIGINS` 를
본인 사이트 주소로 설정 후 다시 `npx wrangler deploy`:

```toml
[vars]
AIRTABLE_BASE_ID = "appBE8hNg4XNtmho8"
ALLOWED_ORIGINS = "https://USERNAME.github.io"
```

> 로컬에서 `file://` 로 열어 테스트할 때는 Origin 이 `null` 이라 차단될 수 있습니다.
> 개발 중에는 `ALLOWED_ORIGINS` 를 비워두거나 `npx wrangler dev` 로 로컬 프록시를 사용하세요.

---

## 동작 요약

| 프런트 호출 | 프록시가 forward |
|---|---|
| `GET  {proxy}/curri_schedule_db` | Airtable 일정 목록 |
| `POST {proxy}/curri_schedule_db` | 일정 생성 |
| `PATCH {proxy}/curri_schedule_db/{id}` | 일정 수정 |
| `DELETE {proxy}/curri_schedule_db/{id}` | 일정 삭제 |
| `GET/POST/PATCH/DELETE {proxy}/custom_holidays_db[/{id}]` | 추가 휴일 CRUD |

허용 테이블(`curri_schedule_db`, `custom_holidays_db`) 외 요청은 거부됩니다.
