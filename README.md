# 타이어뱅크 위치확인 Dashboard

타이어뱅크 매장별 근무 달성 모니터링 대시보드 prototype.

현재는 더미 데이터로 동작하며, 향후 샤플 위치확인 API와 연동 예정.

## Stack
- Vite + React
- Tailwind CSS v3
- lucide-react, xlsx

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm run build    # dist/ 빌드
npm start        # serve -s dist (정적 서빙, Render에서 사용)
```

## 배포
Render Web Service Starter plan에서 정적 파일 서빙 패턴으로 운영.
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
