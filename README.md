# 서브컬처 게임 캘린더

원신 · 붕괴: 스타레일 · 젠레스 존 제로 · 명조의 버전 업데이트 / 캐릭터 픽업 / 공식 방송 / 콜라보 일정과
공식 방송 요약 · 리딤코드를 정리하는 정적 웹사이트입니다. (빌드 과정 없음, HTML/CSS/JS)

## 실행
```bash
python3 -m http.server 8080   # → http://localhost:8080
```
GitHub Pages, Vercel, Netlify 등에 폴더 그대로 올리면 배포됩니다.

## 구조
- `js/data.js` — 기본 데이터(게임 정보, 확정 일정, 방송 요약, 예상 일정 기준값). **현재 값은 예시이므로 실제 공지로 교체 필요.**
- `js/app.js` — 캘린더 / 방송 요약 / 리딤코드 / 관리 화면
- `css/style.css` — 스타일

## 데이터 흐름
1. 관리 탭에서 일정·방송 요약 입력 → 브라우저 localStorage 저장
2. "JSON 내보내기" → 내용을 `js/data.js`의 `EVENTS` / `BROADCASTS`에 반영 → 모든 방문자에게 공개
