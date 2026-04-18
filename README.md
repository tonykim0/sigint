# SIGINT

> Signal Intelligence for the Market.

한국투자증권(KIS) OpenAPI 기반 주식 시그널 분석 플랫폼.  
거래대금 스크리너, 수급 분석, 기술적 차트 분석, 스윙 스크리너, 매매일지를 하나의 대시보드로 제공.

---

## 빠른 시작

### 1. 백엔드

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# .env 파일 생성
cat > .env << 'EOF'
KIS_APP_KEY=발급받은_앱키
KIS_APP_SECRET=발급받은_시크릿키
KIS_ACCOUNT_NO=계좌번호8자리-00
KIS_IS_MOCK=false
EOF

uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. 프론트엔드

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Backend | Python 3.9+ / FastAPI / uvicorn |
| Frontend | React 19 / Vite / TailwindCSS |
| 차트 (캔들) | TradingView Lightweight Charts v5 |
| 차트 (통계) | Recharts |
| 데이터 | 한국투자증권 KIS Developers REST API |

---

## 탭 구성

### 1. 종합
코스피/코스닥 지수 · 거래대금 TOP 10 · 외국인 순매수 TOP 5 · 매매 타임테이블

### 2. 거래대금
- TOP 60 종목 테이블 (ALL / KOSPI / KOSDAQ 필터)
- **리스트 뷰 ↔ 테마 뷰** 토글
- 테마 뷰: 섹터별 그룹핑 + 합산 거래대금 + **대장주 뱃지**
- 장중(09:00~15:30) **자동 새로고침** (10초/15초/30초/수동)

### 3. 수급
- 거래대금 TOP 10 투자자별 순매수 Recharts 바 차트
- 외국인+기관 동시 순매수 → **양매수 뱃지 하이라이트**

### 4. 차트분석
- TradingView Lightweight Charts 캔들스틱 (MA5/20/60 + 거래량 히스토그램)
- **패턴 배지**: 추세 적격(미너비니) / VCP 감지 / 다바스 박스
- **차트 오버레이**: 다바스 박스 상/하단 가격선 + 기준봉 마커(↑)
- 기술적 지표 패널: RSI · MACD · 볼린저 위치 · 거래량 배율

### 5. 스크리너 (서브탭 3개)
**공통 시황 배너**: 코스피/코스닥 20일선 위/아래 → 시스템 ON/OFF

| 서브탭 | 설명 |
|--------|------|
| 종가배팅 | 6원칙 필터 · 비중 계산기(60/40) · 매매일지 즉시 등록 |
| 눌림목 스윙 | 기준봉·눌림·지지 필터 · 경과일·눌림거래량 표시 |
| 돌파 스윙 | 추세 적격·VCP·다바스 필터 · 전고점 거리 표시 |

### 6. 매매일지
- 매매 기록 CRUD · D+1/3/5/10 자동 추적
- 손절(-5%) / 익절(+5%) 경고 배지
- 기법별 승률 분리 집계
- 월별 수익 곡선 (Recharts)
- 연속 승/패 최대 횟수

---

## 백엔드 API

```
GET  /api/health
GET  /api/volume-rank?market=ALL&top_n=60
GET  /api/price/{code}
GET  /api/chart/{code}?days=180
GET  /api/investor-trend/{code}
GET  /api/minute-chart/{code}?time_unit=30
GET  /api/themes

GET  /api/screener/closing-bet?force=false
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
GET  /api/daily-history?date=20260419
GET  /api/daily-history/compare?d1=20260418&d2=20260419
```

---

## 데이터 저장 구조

```
backend/data/
├── journal.json          # 매매일지
├── themes.json           # 테마/섹터 매핑 (수동 관리)
└── daily/
    ├── 20260419.json     # 일일 거래대금 TOP 60
    └── ...
```

`themes.json`은 수동으로 편집하여 종목 코드 → 테마명 매핑을 관리합니다.

---

## 개발 단계

- **Phase 1** ✅ KIS 인증 · 거래량/차트/수급 API
- **Phase 2** ✅ React 프론트엔드 코어 (차트·수급·거래대금·종합)
- **Phase 3** ✅ 스크리너 · 매매일지 · 테마 그룹핑 · 패턴 감지
- **Phase 4** 🔜 자동매매 엔진 (`engine/`)

---

## 환경변수 (.env)

```
KIS_APP_KEY=...
KIS_APP_SECRET=...
KIS_ACCOUNT_NO=계좌번호-00
KIS_IS_MOCK=false        # true = 모의투자
```
