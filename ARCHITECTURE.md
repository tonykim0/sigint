# Architecture

## Backend

엔트리포인트는 [backend/main.py](/Users/tonykim/Documents/sigint/backend/main.py:1) 이고, 실제 앱 조립은 [backend/app_factory.py](/Users/tonykim/Documents/sigint/backend/app_factory.py:1) 에 있습니다.

레이어는 다음처럼 나뉩니다.

### Routers

- [backend/routers/market.py](/Users/tonykim/Documents/sigint/backend/routers/market.py:1)
- [backend/routers/chart.py](/Users/tonykim/Documents/sigint/backend/routers/chart.py:1)
- [backend/routers/screener_api.py](/Users/tonykim/Documents/sigint/backend/routers/screener_api.py:1)
- [backend/routers/journal_api.py](/Users/tonykim/Documents/sigint/backend/routers/journal_api.py:1)
- [backend/routers/daily_api.py](/Users/tonykim/Documents/sigint/backend/routers/daily_api.py:1)

라우터는 HTTP 계약만 담당합니다.

### Domain / Services

- [backend/kis_client.py](/Users/tonykim/Documents/sigint/backend/kis_client.py:1): KIS API 클라이언트
- [backend/universe.py](/Users/tonykim/Documents/sigint/backend/universe.py:1): 공통 거래 universe 규칙
- [backend/analyzers.py](/Users/tonykim/Documents/sigint/backend/analyzers.py:1): 차트 분석 순수 함수
- [backend/services/chart_analysis_service.py](/Users/tonykim/Documents/sigint/backend/services/chart_analysis_service.py:1): 현재가 + 차트 + 패턴 조립
- [backend/services/investor_summary_service.py](/Users/tonykim/Documents/sigint/backend/services/investor_summary_service.py:1): 투자자 요약 집계
- [backend/services/warmup.py](/Users/tonykim/Documents/sigint/backend/services/warmup.py:1): 캐시 워밍업

### Persistence

- [backend/db.py](/Users/tonykim/Documents/sigint/backend/db.py:1): SQLite 초기화와 레거시 JSON 마이그레이션
- [backend/journal.py](/Users/tonykim/Documents/sigint/backend/journal.py:1): 매매일지 저장
- [backend/daily_store.py](/Users/tonykim/Documents/sigint/backend/daily_store.py:1): 일일 snapshot 저장

### Shared Infra

- [backend/cache_utils.py](/Users/tonykim/Documents/sigint/backend/cache_utils.py:1): TTL cache

## Frontend

프론트 엔트리포인트는 [frontend/src/App.jsx](/Users/tonykim/Documents/sigint/frontend/src/App.jsx:1) 입니다.

레이어는 다음처럼 나뉩니다.

### API Contract

- [frontend/src/utils/api.js](/Users/tonykim/Documents/sigint/frontend/src/utils/api.js:1)

### Data Hooks

- [frontend/src/hooks/useOverviewData.js](/Users/tonykim/Documents/sigint/frontend/src/hooks/useOverviewData.js:1)
- [frontend/src/hooks/useVolumeRankData.js](/Users/tonykim/Documents/sigint/frontend/src/hooks/useVolumeRankData.js:1)
- [frontend/src/hooks/useScreenerData.js](/Users/tonykim/Documents/sigint/frontend/src/hooks/useScreenerData.js:1)
- [frontend/src/hooks/useChartAnalysisData.js](/Users/tonykim/Documents/sigint/frontend/src/hooks/useChartAnalysisData.js:1)

### Components

- [frontend/src/components/Overview.jsx](/Users/tonykim/Documents/sigint/frontend/src/components/Overview.jsx:1)
- [frontend/src/components/VolumeRank.jsx](/Users/tonykim/Documents/sigint/frontend/src/components/VolumeRank.jsx:1)
- [frontend/src/components/ChartAnalysis.jsx](/Users/tonykim/Documents/sigint/frontend/src/components/ChartAnalysis.jsx:1)
- [frontend/src/components/Screener.jsx](/Users/tonykim/Documents/sigint/frontend/src/components/Screener.jsx:1)
- [frontend/src/components/Journal.jsx](/Users/tonykim/Documents/sigint/frontend/src/components/Journal.jsx:1)

컴포넌트는 표현과 상호작용 중심이고, fetch/aggregation 은 hooks 로 분리했습니다.

## 핵심 규칙

### Trading Universe

공통 종목 집합은 [backend/universe.py](/Users/tonykim/Documents/sigint/backend/universe.py:1) 가 단일 소스입니다.

- ETF 제외
- 우선주 제외
- 거래대금 100억 미만 제외

이 규칙은 `VolumeRank`, `ThemeTrend`, `Screener`, `InvestorSummary`, `DailySnapshot` 에 공통 적용됩니다.

### Storage

SQLite 가 canonical storage 입니다.

- `journal_entries`
- `daily_snapshots`

레거시 JSON 파일은 import 대상일 뿐, 운영 저장소가 아닙니다.

### Caching

[backend/cache_utils.py](/Users/tonykim/Documents/sigint/backend/cache_utils.py:1) 의 TTL cache 를 공통 사용합니다.

- 시세 / 거래대금 / 투자자 요약 / 스크리너 / 테마 트렌드 / 시장 흐름

캐시 정책 변경은 가능하면 각 모듈에서 직접 dict를 만지지 말고 이 레이어를 통해 맞추는 것이 기준입니다.
