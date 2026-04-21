# SIGINT

한국투자증권(KIS) OpenAPI 기반 주식 시그널 분석 대시보드입니다.

- 거래대금 기반 `trading universe`
- 종합 탭의 지수/시장흐름/테마 트렌드 집계
- 차트분석 통합 조회
- 스크리너 3종
- 매매일지 + 일일 스냅샷 저장

구조 설명은 [ARCHITECTURE.md](/Users/tonykim/Documents/sigint/ARCHITECTURE.md) 를 기준으로 보세요.

## 빠른 시작

### 1. 백엔드

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cat > .env << 'EOF'
KIS_APP_KEY=발급받은_앱키
KIS_APP_SECRET=발급받은_시크릿키
KIS_ACCOUNT_NO=계좌번호8자리-00
KIS_IS_MOCK=false
CORS_ORIGINS=http://localhost:5173
ENABLE_KIS_WARMUP=0
EOF

uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

실계좌 기준으로는 `ENABLE_KIS_WARMUP=0` 을 유지하는 편이 안전합니다. `--reload` 는 저장할 때마다 백엔드를 재시작하므로, 토큰 캐시가 없거나 다른 런타임과 동시에 돌면 접근 토큰이 여러 번 발급될 수 있습니다.

### 2. 프론트엔드

```bash
cd frontend
npm install
npm run dev
```

## 현재 탭 구성

### 1. 종합
- KOSPI / KOSDAQ 지수
- 거래대금 대표 종목 기반 현물 수급 근사치
- 최근 1주일 테마 거래대금 차트
- 오늘의 주도 테마 목록

### 2. 거래대금
- 백엔드 공통 universe 기반 TOP 60
- 공통 필터: ETF 제외 / 우선주 제외 / 100억 미만 제외
- 리스트 뷰 / 테마 뷰
- 외인 / 기관 / 개인 순매수 컬럼

### 3. 차트분석
- 현재가 + 일봉 + 분봉
- 패턴 배지: 추세 적격 / VCP / 다바스 / 기준봉
- 기술적 지표 요약

### 4. 스크리너
- 종가배팅
- 눌림목 스윙
- 돌파 스윙
- 시황 ON/OFF 배너

### 5. 매매일지
- CRUD
- D+1 / 3 / 5 / 10 추적
- 통계 요약

## 주요 API

```text
GET  /api/health
GET  /api/index
GET  /api/market-flow
GET  /api/volume-rank
GET  /api/trading-universe
GET  /api/investor-summary
GET  /api/theme-trend
GET  /api/themes
GET  /api/search

GET  /api/price/{code}
GET  /api/chart/{code}
GET  /api/chart-analysis/{code}
GET  /api/investor-trend/{code}
GET  /api/minute-chart/{code}

GET  /api/screener/closing-bet
GET  /api/screener/market-regime
GET  /api/screener/pullback-swing
GET  /api/screener/breakout-swing
GET  /api/screener/trend-template/{code}
GET  /api/screener/vcp/{code}
GET  /api/screener/darvas-box/{code}
GET  /api/screener/reference-candle/{code}

GET    /api/journal
POST   /api/journal
PUT    /api/journal/{id}
DELETE /api/journal/{id}
GET    /api/journal/stats
GET    /api/journal/{id}/tracking

POST /api/daily-save
GET  /api/daily-history
GET  /api/daily-history/compare
```

## 저장 구조

현재 canonical storage 는 SQLite 입니다.

```text
backend/data/sigint.db
```

테이블:

- `journal_entries`
- `daily_snapshots`

기존 `backend/data/journal.json`, `backend/data/daily/*.json` 이 있으면 첫 실행 시 SQLite 로 가져옵니다.

## 테스트 / 점검

```bash
cd backend
./.venv/bin/python -m unittest discover -s tests

cd ../frontend
npm run lint
```

## 환경변수

```text
KIS_APP_KEY=...
KIS_APP_SECRET=...
KIS_ACCOUNT_NO=계좌번호-00
KIS_IS_MOCK=false
CORS_ORIGINS=http://localhost:5173
SIGINT_DB_PATH=/optional/custom/path/sigint.db
DISABLE_WARMUP=1
```
