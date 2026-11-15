# 서브컬처 게임 캘린더

원신 · 붕괴: 스타레일 · 젠레스 존 제로 · 명조의 **버전 업데이트 / 캐릭터 픽업 / 공식 방송 / 콜라보** 일정을
캘린더로 보고, **공식 방송 요약과 리딤코드**를 정리하는 사이트입니다.
**유료 API 없이 전부 무료**로 운영됩니다 (Vercel Hobby + GitHub Actions).

## 기능
| 화면 | 내용 |
|---|---|
| 캘린더 | 게임·종류별 필터, 확정 일정 + 버전 주기로 계산한 예상 일정(점선), `.ics` 내보내기 |
| 방송 요약 | 버전별 요약·캐릭터·콘텐츠·리딤코드·출처 |
| 리딤코드 | 유효/만료 구분, 복사, 공식 교환 페이지 바로가기 (명조는 게임 내 입력) |
| 관리 | 일정·방송 요약 입력, 원문 간단 정리, **무료 AI 채팅용 프롬프트 복사 → 답변 붙여넣기**, JSON 백업 |
| 자동 수집 | GitHub Actions가 6시간마다 아래 출처에서 수집해 `data/auto.json` 갱신 |

### 자동 수집 출처 (모두 무료)
| 게임 | 일정 | 리딤코드 |
|---|---|---|
| 원신 / 스타레일 / 젠존제 | HoYoLAB 공식 공지(한국어): 버전 점검 시각, 기원·워프·채널 기간과 캐릭터, 콜라보, 스타레일 프리뷰 방송일 | hoyo-codes.seria.moe (커뮤니티 API) |
| 명조 | Wuthering Waves Fandom 위키: 공명 이벤트(픽업) 기간 | Fandom 위키 Redemption Code |

> 공식 방송 일정·방송 요약은 공지에 정형화되어 있지 않아 **관리 탭에서 직접 입력**합니다.
> 방송 원문을 붙여넣고 "AI 요약용 프롬프트 복사" → Claude.ai / ChatGPT 등 **무료 채팅**에 붙여넣기 → 답변(JSON)을 다시 붙여넣으면 폼이 채워집니다.

## 데이터 우선순위
`관리 탭에서 직접 입력(브라우저 저장)` > `js/data.js (직접 관리)` > `data/auto.json (자동 수집)`

## 실행 (로컬)
```bash
npm run dev        # http://localhost:8080
npm run collect    # 자동 수집 1회 실행
```

## 배포 (무료)
1. GitHub 저장소에 push → Vercel에서 Import (Framework Preset: **Other**, 빌드 설정 비움) → Deploy
2. 환경변수·시크릿 **필요 없음**
3. GitHub 저장소 **Actions** 탭 → "일정 자동 수집" → *Run workflow* 로 첫 수집
   (이후 6시간마다 자동 실행 → 내용이 바뀌면 커밋 → Vercel 자동 재배포)

## 구조
```
index.html, css/, js/app.js   화면
js/data.js                    직접 관리하는 데이터 (방송 요약·코드·예상 일정 기준값)
data/auto.json                자동 수집 결과
scripts/collect.mjs           무료 자동 수집 스크립트 (의존성 없음)
scripts/dev-server.mjs        로컬 개발 서버
.github/workflows/collect.yml 6시간마다 자동 수집
```
