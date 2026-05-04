# EV.Daily 풀스택 배포 가이드

매일 새벽 6시(KST)에 자동으로 한국·일본·미국 EV 뉴스를 가져와 한국어로 요약·번역하는 웹앱입니다.

## 전체 흐름

```
[Vercel Cron 매일 21:00 UTC]
        ↓
[/api/cron 실행]
        ↓
RSS 가져오기 (Google News + Electrek + InsideEVs)
        ↓
Claude API로 번역 + 2문장 요약 + 카테고리 분류
        ↓
Supabase DB에 저장
        ↓
사용자가 사이트 방문 → /api/news가 DB 읽어 반환 → 화면 표시
```

## 사전 준비 (모두 무료)

각각 가입해두세요. 5분이면 끝나요.

1. **GitHub** → https://github.com (코드 저장소)
2. **Supabase** → https://supabase.com (데이터베이스)
3. **Vercel** → https://vercel.com (호스팅 + 자동 실행)
4. **Anthropic Console** → https://console.anthropic.com (Claude API 키, $5 정도 충전)

---

## STEP 1 — Supabase 프로젝트 만들기

1. Supabase 로그인 후 "New project" 클릭
2. 이름: `ev-daily`, 비밀번호 설정, 리전: `Northeast Asia (Seoul)` 추천
3. 생성 완료까지 1~2분 대기
4. 좌측 메뉴 **SQL Editor → New query** 클릭
5. `supabase-schema.sql` 파일 내용을 복사해서 붙여넣고 **Run** 클릭
6. "Success" 뜨면 OK

### 키 복사하기 (이따 Vercel에 입력해야 함)

좌측 메뉴 **Project Settings → API** 들어가서:
- **Project URL** → 메모 (예: `https://abcdefg.supabase.co`)
- **anon public** key → 메모
- **service_role** key → 메모 (절대 공개 금지)

---

## STEP 2 — Anthropic API 키 만들기

1. https://console.anthropic.com 로그인
2. 좌측 **API Keys → Create Key**
3. 이름: `ev-daily`, 키 복사 (`sk-ant-...`로 시작)
4. **Plans & Billing → Add credits**에서 $5~10 충전 (실제 사용량은 월 $0.10도 안 됨)

---

## STEP 3 — GitHub에 코드 올리기

1. https://github.com 에서 **New repository**
2. 이름: `ev-daily`, **Public** 선택, "Create repository"
3. 새 저장소 페이지에서 **uploading an existing file** 링크 클릭
4. 압축 파일 풀어서 `ev-daily` 폴더 안의 모든 파일·폴더를 드래그
5. "Commit changes" 클릭

> **주의:** `.env.example`은 올려도 되지만 `.env`는 절대 올리면 안 됩니다 (실제 키가 들어가는 파일).

---

## STEP 4 — Vercel에 배포

1. https://vercel.com 에서 GitHub로 로그인
2. **Add New → Project** 클릭
3. 방금 만든 `ev-daily` 저장소 선택, **Import**
4. **Environment Variables** 섹션에서 다음 5개 추가:

   | 이름 | 값 |
   |------|-----|
   | `ANTHROPIC_API_KEY` | `sk-ant-...` (STEP 2에서 받은 키) |
   | `SUPABASE_URL` | `https://...supabase.co` (STEP 1) |
   | `SUPABASE_ANON_KEY` | anon public key (STEP 1) |
   | `SUPABASE_SERVICE_KEY` | service_role key (STEP 1) |
   | `CRON_SECRET` | 아무 긴 랜덤 문자열 (예: `mySecret_2026_xK9pQ`) |

5. **Deploy** 클릭. 1~2분 대기.
6. 완료되면 `ev-daily-xxxx.vercel.app` URL이 나와요.

---

## STEP 5 — 첫 cron 수동 실행

배포 직후엔 DB가 비어있어서 사이트가 "아직 데이터가 없어요"로 보여요. 매일 새벽 자동 실행이지만, 첫 데이터를 넣으려면 수동 트리거가 필요합니다.

### 방법 A — 브라우저에서 (가장 쉬움)

직접 호출은 인증 때문에 안 됩니다. 대신 Vercel 대시보드에서:

1. 프로젝트 → **Crons** 탭
2. `/api/cron` 줄의 **Run** 버튼 클릭
3. 결과가 표시됨. 성공이면 사이트 새로고침 → 뉴스 표시 ✅

### 방법 B — 명령어로 (선택)

PC 터미널에서:
```bash
curl -X GET "https://ev-daily-xxxx.vercel.app/api/cron" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

응답에 `{ ok: true, results: [...] }` 형태로 결과가 떠야 정상.

---

## STEP 6 — 동작 확인

1. 사이트 열기 → 한국/일본/미국 탭 전환하며 뉴스 보이는지 확인
2. Supabase 대시보드 **Table Editor → news**에서 저장된 행 확인
3. Vercel **Logs** 탭에서 cron 실행 로그 확인

---

## 매일 어떻게 돌아가나

`vercel.json`의 `"schedule": "0 21 * * *"`는 cron 표현식으로 **매일 21:00 UTC = 한국시간 다음날 06:00**에 실행돼요.

원하는 시간으로 바꾸려면:
- `0 22 * * *` → KST 07:00
- `0 23 * * *` → KST 08:00
- `0 13 * * *` → KST 22:00 (저녁 업데이트)

수정 후 GitHub에 push하면 Vercel이 자동 재배포합니다.

---

## 비용 추정 (실제 운영 시)

| 항목 | 무료 한도 | 실 사용 | 초과 비용 |
|------|----------|---------|----------|
| Vercel | 100GB 대역폭 | 적음 | 0원 |
| Supabase | 500MB DB, 50K 행 | 매우 적음 | 0원 |
| Anthropic | 종량제 | 하루 ~$0.005 | 월 $0.15 |

**월 비용 거의 0원**. 친구·가족 몇 명 보여줘도 무료 한도 안에서 충분합니다.

---

## 자주 발생하는 문제

**Q. cron 실행했는데 results에 error가 떠요**
→ Vercel **Logs**에서 자세한 에러 확인. 보통 환경변수 오타거나 Anthropic 잔액 부족.

**Q. RSS 한 개가 빈 결과를 줘요**
→ `api/cron.js`의 `FEEDS` URL을 다른 매체로 교체. Promise.allSettled로 처리되어 일부 실패해도 나머지는 작동합니다.

**Q. Claude가 JSON 형식을 안 지켜요**
→ 거의 안 일어나지만, `cron.js`에서 모델을 더 좋은 거(`claude-opus-4-7`)로 바꾸면 안정성 ↑.

**Q. 카테고리가 이상하게 분류돼요**
→ `api/cron.js`의 `CATEGORIES` 배열과 prompt를 수정해 원하는 카테고리 체계로 변경 가능.

**Q. 직접 cron 트리거하려면?**
→ Authorization 헤더에 CRON_SECRET을 Bearer 토큰으로 보내야 함. Vercel Crons 대시보드의 Run 버튼이 가장 편함.

---

## 다음에 추가하면 좋은 기능들

- **검색 기능**: `/api/news?q=tesla` 같이 keyword 필터
- **RSS 피드 출력**: `/api/feed.xml` 생성해 RSS 리더에서 구독 가능
- **이메일 다이제스트**: Resend로 매일 아침 메일 발송
- **PWA**: manifest.json + service worker로 홈 화면 설치 가능한 앱화
- **북마크 영구 저장**: 현재는 새로고침하면 사라짐 → Supabase에 저장
- **사용자 계정**: Supabase Auth로 개인별 북마크/설정

이건 다음 단계 작업으로 같이 해봐요.
