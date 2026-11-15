# 서브컬처 게임 캘린더

원신 · 붕괴: 스타레일 · 젠레스 존 제로 · 명조의 **버전 업데이트 / 캐릭터 픽업 / 공식 방송 / 콜라보** 일정을
캘린더로 보고, **공식 방송 요약과 리딤코드**를 정리하는 사이트입니다.

## 기능
| 화면 | 내용 |
|---|---|
| 캘린더 | 게임·종류별 필터, 확정 일정 + 버전 주기로 계산한 예상 일정(점선), `.ics` 내보내기 |
| 방송 요약 | 버전별 요약·캐릭터·콘텐츠·리딤코드·출처 |
| 리딤코드 | 유효/만료 구분, 복사, 공식 교환 페이지 바로가기 (명조는 게임 내 입력) |
| 관리 | 일정·방송 요약 입력, **🤖 AI 요약(Claude)**, 예상 일정 기준값, JSON 백업 |
| 자동 수집 | GitHub Actions가 매일 Claude 웹 검색으로 최신 일정·코드를 조사해 `data/auto.json` 갱신 |

## 데이터 우선순위
`관리 탭에서 직접 입력(브라우저 저장)` > `js/data.js (검수한 데이터)` > `data/auto.json (자동 수집)`

같은 게임·종류·시작일의 일정이 이미 있으면 자동 수집 일정은 숨겨집니다. 자동 수집 결과는 🤖 표시가 붙습니다.

## 실행 (로컬)
```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm run dev     # http://localhost:8080  (AI 요약 포함)
```
API 키 없이도 사이트는 동작합니다 (AI 요약 버튼만 비활성).

## 배포 (Vercel + GitHub)
1. 이 폴더를 GitHub 저장소에 push
2. Vercel → **Add New Project** → 저장소 선택 → Framework Preset **Other**, 빌드 명령 없음 → Deploy
3. Vercel 프로젝트 **Settings → Environment Variables**
   - `ANTHROPIC_API_KEY` : Anthropic API 키 (AI 요약용)
   - `ADMIN_TOKEN` : 아무 비밀 문자열 (AI 요약 버튼 남용 방지 — 관리 탭의 "관리자 토큰" 칸에 입력)
4. GitHub 저장소 **Settings → Secrets and variables → Actions** 에 `ANTHROPIC_API_KEY` 추가
5. **Actions** 탭 → "일정 자동 수집" → *Run workflow* 로 첫 수집 실행
   (이후 매일 06:17 KST 자동 실행 → `data/auto.json` 커밋 → Vercel 자동 재배포)

## 비용 (참고)
- AI 요약: 요청 1회당 원문 길이에 따라 대략 수십 원 수준
- 자동 수집: 게임당 웹 검색 최대 8회 + Claude 호출 2회 → 하루 4게임 기준 대략 $0.5~1 내외
  (`.github/workflows/collect.yml` 의 cron 주기를 늘리면 줄어듭니다)

## 구조
```
index.html, css/, js/app.js   화면
js/data.js                    검수한 기본 데이터 (일정·방송·코드·예상 일정 기준값)
data/auto.json                자동 수집 결과
lib/claude.js                 Claude API 호출 (요약 스키마, 웹 검색 리서치)
api/summarize.js              Vercel 함수: POST /api/summarize
scripts/collect.mjs           자동 수집 스크립트
scripts/dev-server.mjs        로컬 개발 서버
.github/workflows/collect.yml 매일 자동 수집
```
