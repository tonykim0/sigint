# SIGINT

> Signal Intelligence for the Market.

한국투자증권(KIS) OpenAPI 기반 주식 시그널 분석 플랫폼.
거래대금 스크리너, 수급 분석, 기술적 차트 분석을 하나의 대시보드로 제공.

---

## 기술 스택

- **Backend**: Python 3.12+ / FastAPI / uvicorn
- **Frontend**: React (Vite) / TailwindCSS
  - 차트 라이브러리 (두 가지 병용):
    - **TradingView Lightweight Charts** → 차트분석 탭 (캔들스틱, 이평선, 크로스헤어, 줌/패닝)
      - 패키지: `lightweight-charts` + `lightweight-charts-react-wrapper` (공식 React 래퍼)
      - 문서: https://tradingview.github.io/lightweight-charts/
    - **Recharts** → 종합/수급 탭 (바 차트, 비교 차트)
- **API**: 한국투자증권 KIS Developers REST API
  - 공식 문서: https://apiportal.koreainvestment.com
  - 인증: OAuth2 (App Key + App Secret → Bearer Token)
  - Base URL (실거래): https://openapi.koreainvestment.com:9443
  - Base URL (모의투자): https://openapivts.koreainvestment.com:29443

---

## 프로젝트 구조

```
sigint/
├── backend/
│   ├── main.py              # FastAPI 서버 엔트리포인트
│   ├── kis_client.py         # KIS API 클라이언트
│   ├── analyzers.py          # 기술적 분석 지표 계산
│   ├── requirements.txt
│   └── .env                  # API 키 (gitignore 대상)
├── engine/                   # [Phase 4] 자동매매 엔진 (지금은 빈 폴더)
│   ├── strategies/           # 매매 전략 모듈
│   ├── executor.py           # 주문 실행 (KIS 주문 API)
│   ├── risk.py               # 리스크 관리 (포지션 사이징, 손절)
│   └── scheduler.py          # 스케줄러 (종가배팅, 조건 감시 등)
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Overview.jsx       # 종합 대시보드 + 타임테이블
│   │   │   ├── VolumeRank.jsx     # 거래대금 스크리너 + 테마 그룹핑
│   │   │   ├── SupplyDemand.jsx   # 수급 분석 + 양매수 감지 (Recharts)
│   │   │   ├── ChartAnalysis.jsx  # 차트분석 + 패턴감지 (TradingView LW Charts)
│   │   │   ├── Screener.jsx       # 스크리너: 종가배팅/눌림목/돌파 서브탭 (NEW)
│   │   │   └── Journal.jsx        # 매매일지 + 결과 추적 (NEW)
│   │   └── utils/
│   │       └── format.js
│   ├── package.json
│   └── vite.config.js
├── CLAUDE.md
├── .gitignore
└── README.md
```

---

## UI/UX 디자인 명세

### 폰트 (필수)
- **영문/숫자**: Toss Product Sans
  - CDN: `https://static.toss.im/assets/typography/TossProductSans.css`
- **한글**: Pretendard Variable
  - CDN: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css`
- 전체 적용: `font-family: 'Toss Product Sans', 'Pretendard Variable', Pretendard, -apple-system, sans-serif`
- 숫자 정렬: `font-variant-numeric: tabular-nums`

### 네비게이션 탭
직관적인 한국어 명칭 사용. 군사 용어 사용하지 않음.
- **종합** → 대시보드 (시장 요약 + TOP 10 + 외국인 순매수)
- **거래대금** → 거래대금 상위 종목 스크리너
- **수급** → 투자자별 순매수 분석
- **차트분석** → 기술적 차트 분석

탭 스타일: 밑줄 활성 표시 (active: 하단 2px 그린 보더 + 흰색 텍스트 bold)

### 컬러
- 배경: #06070a (최하단), #0d0f13 (카드), #13161b (카드 내부)
- 보더: #1e2228
- 텍스트: #9ca3af (기본), #e5e7eb (밝은), #f3f4f6 (화이트)
- 주 강조색: #10b981 (에메랄드 그린)
- 상승: #ef4444 (빨강, 한국식)
- 하락: #3b82f6 (파랑, 한국식)
- 경고: #f59e0b (앰버)
- 기관: #a78bfa (퍼플)
- 개인: #fb923c (오렌지)
- 외국인: #3b82f6 (블루)

### 카드 컴포넌트
- border-radius: 12px
- 헤더: 14px fontWeight 700 흰색, 우측에 서브텍스트
- 패딩: 18px

### 숫자 표기
- 한국식: 억, 조 단위 변환
- 등락률: +/-표시 + 소수점 2자리 + % (빨강/파랑 색상)

### 상태 표시
- 서버 연결: 헤더 좌측 초록 dot (pulse 애니메이션)
- DEMO 모드: 앰버 배지
- 시계: 헤더 우측 실시간 (HH:MM:SS, 그린)

---

## 핵심 기능 요구사항

### 탭 구성 (6개)
종합 · 거래대금 · 수급 · 차트분석 · 스크리너 · 매매일지

---

### 1. 종합 탭
- 코스피/코스닥 지수 카드 (현재가, 등락, 등락률)
- 총 거래대금 카드
- 거래대금 TOP 10 그리드 (5열 x 2행, 종목명/현재가/등락률/거래대금)
- 외국인 순매수 TOP 5 (좌측 컬러 보더로 양수/음수 표시)
- **매매 타임테이블 바**:
  - 현재 시간 기준 어떤 구간인지 하이라이트
  - 09:00~09:20 → "수확/투매" (앰버)
  - 09:20~11:00 → "프라임 타임" (그린)
  - 11:00~14:30 → "매매 금지" (빨강)
  - 14:30~15:20 → "종가매매 준비" (블루)
  - 장 마감 후 → "데이터 정리" (퍼플)
- **오늘의 주도 테마** 요약 (거래대금 상위 종목에서 자동 추출)
- **NXT 프리마켓 시그널** (08:00~08:50):
  - 프리마켓 거래대금 상위 5종목 표시
  - 본장 주도주 선행 지표로 활용
- 종목 클릭 → 차트분석 탭 이동

### 2. 거래대금 탭
- KIS API 거래량순위 (tr_id: FHPST01710000)
- **상위 60개 종목** 표시 (상승률 순 정렬 기본)
- ALL / KOSPI / KOSDAQ 필터 버튼
- **장중 자동 새로고침**: 09:00~15:30 동안 15초 간격 자동 조회
  - 새로고침 간격 조절 버튼 (10초/15초/30초/수동)
  - 마지막 갱신 시각 표시
  - 장 마감 후에는 자동 새로고침 중지
- 컬럼: #, 종목명(코드), 현재가, 등락률, 거래량, 거래대금, **NXT비율**, **테마태그**, **대장주 뱃지**
- 모든 컬럼 클릭 정렬 (↑↓ 토글)
- 총 거래대금 합계 우측 표시
- **NXT 편중 감지**:
  - NXT비율 컬럼: 해당 종목의 NXT 거래대금 / 통합 거래대금 (%)
  - NXT비율 60%+ → 빨강 경고 뱃지 "NXT 편중" (본장 약세 가능성)
  - NXT비율 10% 이하 → 본장 중심 종목 (정상)
  - 프리/애프터마켓 시간대에는 NXT 100%가 정상이므로 경고 표시 안 함
- **테마/섹터 그룹핑 뷰**:
  - 토글 버튼으로 "리스트 뷰" ↔ "테마 뷰" 전환
  - 테마 뷰: 동일 섹터/테마 종목끼리 묶어서 표시
  - 각 테마 그룹의 합산 거래대금 표시
  - 그룹 내 등락률 1위 = **대장주** 뱃지 (그린 태그)
- **대장주 판별 로직**:
  - 같은 테마 내 거래대금 1위 + 등락률 1위 → 대장주
  - 거래대금 1위이지만 등락률 1위 아닌 경우 → "거래대금 대장" 별도 표시
- 종목 클릭 → 차트분석 탭 이동
- **일일 저장**: 매 장 마감 후 당일 거래대금 TOP 60 데이터를 날짜별로 로컬 저장 (JSON)
  → 누적 데이터로 "어제 vs 오늘 테마 변화" 추적 가능

### 3. 수급 탭
- 거래대금 TOP 10 종목의 투자자별 매매동향 자동 조회
- 바 차트: 종목별 외국인(블루)/기관(퍼플)/개인(오렌지)
  - 0 기준선(ReferenceLine) 표시
- 수급 상세 테이블: 종목명, 현재가, 등락률, 외국인/기관/개인 순매수
- 순매수 양수=빨강, 음수=파랑
- **양매수 하이라이트**:
  - 외국인 + 기관 동시 순매수 종목 → 행 배경 초록 틴트 + "양매수" 뱃지
  - 종가매매 6원칙 중 핵심 필터이므로 시각적으로 즉시 식별 가능해야 함
- 종목 클릭 → 차트분석 탭 이동

### 4. 차트분석 탭 (TradingView Lightweight Charts 사용)
- 종목코드 입력 → 조회 (Enter + 버튼)
- 현재가 우측 상단 크게 표시
- **메인 차트** (TradingView Lightweight Charts):
  - 캔들스틱 차트 (기본 90일, 줌/패닝으로 확장 가능)
  - 이평선 오버레이: MA5(앰버) + MA20(블루) + MA60(퍼플) — LineSeries로 추가
  - 크로스헤어 내장 (마우스 호버 시 가격/시간 표시)
  - 하단 거래량 히스토그램 (양봉=빨강반투명, 음봉=파랑반투명) — HistogramSeries
  - 다크 테마 적용 (배경 #06070a, 그리드 #1e2228)
- **캔들 패턴 자동 감지**:
  - 장대양봉 + 거래량 폭발 = "재료 반응" 표시
  - 도지, 윗꼬리(Shooting Star), 아랫꼬리(Hammer) 감지
- **차트 위치 판단**:
  - 신고가 부근 여부
  - 전고점 매물대 돌파 여부
  - 이평선 정배열/역배열/혼조
- **TradingView Lightweight Charts 세팅 참고**:
  ```javascript
  import { createChart, ColorType } from 'lightweight-charts';
  // 또는 React 래퍼 사용:
  import { Chart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts-react-wrapper';
  
  // 차트 옵션
  {
    layout: { background: { type: ColorType.Solid, color: '#06070a' }, textColor: '#9ca3af' },
    grid: { vertLines: { color: '#1e2228' }, horzLines: { color: '#1e2228' } },
    crosshair: { mode: 0 },
    timeScale: { borderColor: '#1e2228', timeVisible: false },
    rightPriceScale: { borderColor: '#1e2228' },
  }
  
  // 캔들 데이터 포맷:
  { time: '2026-04-17', open: 82000, high: 83500, low: 81200, close: 82400 }
  
  // 거래량 데이터 포맷:
  { time: '2026-04-17', value: 18432510, color: close >= open ? '#ef444450' : '#3b82f650' }
  ```
- **기술적 지표 패널** (차트 하단, 2열 그리드):
  - 좌: 이평선 배열, RSI(14), MACD, MA5/20/60 수치
  - 우: 거래량 배율(20일 평균 대비), 볼린저 위치, 캔들 패턴
- **종목 분류 태그**: 이 종목이 "추세형" / "단발형" / "눌림형"인지 표시 (매매일지 데이터 기반)
- **패턴 감지 시스템** (자동 스캔):
  - **추세 템플릿 (미너비니)**: 현재가 > MA50 > MA150 > MA200, 200일선 상승중, 52주 저가 대비 30%+, 52주 고가 대비 -25% 이내 → "추세 적격" 뱃지
  - **VCP 패턴**: 추세 적격 종목 중 변동성 축소 감지 (조정폭 순차 축소 + 거래량 감소) → "VCP 감지" 뱃지
  - **다바스 박스**: 신고가 후 3일간 고점 미갱신 → 박스 상단 확정, 3일간 저점 미갱신 → 박스 하단 확정 → 차트 위에 박스 영역 시각화
  - **기준봉 감지**: 거래량 50일 평균 대비 150%+ 동반 장대양봉(몸통비율 70%+) → "기준봉" 마커 표시

### 5. 스크리너 탭 (종가배팅 + 스윙매매 통합)
서브탭 3개로 구성: **종가배팅** · **눌림목 스윙** · **돌파 스윙**

공통 시황 필터 (System ON/OFF):
- 코스피/코스닥 지수가 20일 MA 위 = 시스템 ON (스크리너 정상 작동)
- 20일 MA 하향 이탈 = 시스템 OFF (경고 배너 + 스윙 신규 진입 차단, 종가배팅만 허용)

---

#### 5-1. 종가배팅 스크리너
장 마감 전(14:30~15:20) 종가 진입 후보 자동 필터링.

- **6원칙 필터**:
  1. ✅ 거래대금 Top 50위 이내
  2. ✅ 외국인 + 기관 양매수 (동시 순매수)
  3. ✅ 재료/이슈 존재 (수동 입력 — 종목 옆 "재료 메모" 필드)
  4. ✅ 분봉 우상향 (30분봉 기준 14:00 이후 저점 대비 현재가 위치)
  5. ✅ 지수 대비 상대 강도 양호 (당일 지수 등락률 대비 초과 수익)
  6. ✅ 차트 위치: 신고가 부근 (60일 최고가 대비 95%+ 위치)

- **필터 결과 테이블**:
  - 컬럼: 종목명, 현재가, 등락률, 거래대금, 양매수, 분봉추세, 상대강도, 차트위치, 통과(N/6)
  - 6/6 → 초록 하이라이트, 5/6 → 앰버, 4이하 → 기본

- **비중 계산기**:
  - 매수 금액 입력 → 60%(종가 매수) / 40%(익일 시초 판단) 자동 분할

- **익일 추적**: 진입 종목 자동으로 매매일지 등록 + 익일 시초가 수익률 자동 계산

---

#### 5-2. 눌림목 스윙 스크리너 (확률형, 2~5일)
기준봉(장대양봉) 출현 후 조정 구간에서 눌림 매수 타점을 찾는 스크리너.

- **필터 조건**:
  1. ✅ 대장주: 테마/섹터 내 등락률 1위 또는 첫 상한가 기록 종목
  2. ✅ 유동성: 기준봉 당일 거래대금 상위 30위 이내 (또는 1,000억+)
  3. ✅ 기준봉 존재: 최근 10일 내 거래량 50일 평균 대비 150%+ 동반 장대양봉
  4. ✅ 눌림 진행중: 기준봉 이후 2~3일간 조정, 거래량 기준봉 대비 20% 이하로 감소
  5. ✅ 지지 확인: 현재가가 기준봉 몸통 중간값(50% 되돌림) 또는 5일선 부근
  6. ✅ 재료 연속성: 후속 일정(정책발표/임상/본계약 등) 존재 (수동 메모)

- **눌림목 상태 표시**:
  - 기준봉 대비 현재 조정률 (%)
  - 기준봉 이후 경과일수
  - 거래량 감소율 (기준봉 대비)
  - 5일선/기준봉 중간값 이격도

- **진입 가이드**: 1-2-2 분할 매수 (20% → 40% → 40%)
- **손절**: 매수가 -5% 또는 기준봉 시가 이탈 (둘 중 먼저 도달)
- **익절**: +5% 도달 시 50% 매도, 나머지 5일선 이탈 시 청산
- **타임컷**: 3거래일 횡보 시 본절 부근 청산

---

#### 5-3. 돌파 스윙 스크리너 (수익극대화형, 2~5일)
전고점/박스 상단 돌파 시점을 포착하는 스크리너.

- **필터 조건**:
  1. ✅ 추세 적격 (미너비니 추세 템플릿):
     - 현재가 > MA50 > MA150 > MA200
     - MA200 최소 1개월 이상 상승 추세
     - 52주 저가 대비 30%+, 52주 고가 대비 -25% 이내
  2. ✅ 유동성: 거래대금 상위 30위 이내
  3. ✅ 돌파 임박: 전고점 또는 박스 상단 대비 -3% 이내 위치
  4. ✅ 거래량 수축: 최근 조정 구간 거래량 < 50일 평균 × 0.5 (VCP 수급 마름)
  5. ✅ 돌파 확인: 전고점 돌파 + 거래량 50일 평균 대비 150%+ (돌파일 기준)

- **돌파 상태 표시**:
  - 전고점까지 거리 (%)
  - VCP 수축 횟수 (감지된 경우)
  - 다바스 박스 상단/하단 가격

- **진입 가이드**: 돌파 확인 후 종가 1차 진입 (장중 추격 금지)
- **손절**: 매수가 -5~8% 또는 박스 하단 이탈 (후행 스탑)
- **익절**: 평균 손실의 2~3배 도달 시 분할 매도
- **피라미딩**: 새로운 박스 형성 후 상단 돌파 시 추가 매수 가능

---

### 6. 매매일지 탭 (결과 추적 시스템)
매매 기록과 사후 결과를 추적하여 전략의 유효성을 검증하는 시스템.

- **매매 기록 입력**:
  - 종목코드, 매수가, 매수일
  - 매수 사유 (드롭다운: **종가배팅** / **눌림목 스윙** / **돌파 스윙**)
  - 비중(%), 재료 메모
  - 매도가, 매도일 (청산 시 입력)
  - 수익률 + 수익금 자동 계산

- **결과 추적 (자동)**:
  - 매수 후 1일/3일/5일/10일 차 종가를 KIS API로 자동 기록
  - 각 시점의 수익률 표시
  - 종목 자동 분류:
    - **추세형**: 10일차에도 우상향 지속
    - **단발형**: 1~2일 급등 후 횡보/하락
    - **눌림형**: 초반 조정 후 재반등

- **손절/익절 규칙 준수 모니터**:
  - 매수가 대비 현재 수익률 실시간 표시
  - -5% 도달 시 빨강 경고 ("손절 라인 도달")
  - +5% 도달 시 그린 알림 ("50% 익절 구간")
  - 3거래일 횡보 시 앰버 경고 ("타임컷 검토")

- **통계 대시보드**:
  - 총 매매 횟수, 승률, 평균 수익률, 평균 손실률
  - 손익비 (Profit Factor = 총이익 / 총손실)
  - **기법별 승률**: 종가배팅 vs 눌림목 vs 돌파 (각각 분리 집계)
  - 월별 수익 곡선 (Recharts 라인차트)
  - 연속 손실/연속 이익 최대 횟수

- **데이터 저장**: 로컬 JSON 파일 (backend/data/journal.json)

---

## KIS API 상세 명세

### 인증
```
POST /oauth2/tokenP
Content-Type: application/json
Body: { "grant_type": "client_credentials", "appkey": "{KEY}", "appsecret": "{SECRET}" }
Response: { "access_token": "eyJ...", "token_type": "Bearer", "expires_in": 86400 }
```

### 공통 헤더
```python
headers = {
    "content-type": "application/json; charset=utf-8",
    "authorization": f"Bearer {access_token}",
    "appkey": APP_KEY,
    "appsecret": APP_SECRET,
    "tr_id": "{TR_ID}"
}
```

### 거래량 순위
```
GET /uapi/domestic-stock/v1/quotations/volume-rank
tr_id: FHPST01710000
Params: FID_COND_MRKT_DIV_CODE="J", FID_COND_SCR_DIV_CODE="20171",
        FID_INPUT_ISCD="0000", FID_DIV_CLS_CODE="0", FID_BLNG_CLS_CODE="0",
        FID_TRGT_CLS_CODE="111111111", FID_TRGT_EXLS_CLS_CODE="000000",
        FID_INPUT_PRICE_1="", FID_INPUT_PRICE_2="", FID_VOL_CNT="", FID_INPUT_DATE_1=""
Response output[]: data_rank, mksc_shrn_iscd(코드), hts_kor_isnm(종목명),
  stck_prpr(현재가), prdy_ctrt(등락률), acml_vol(거래량), acml_tr_pbmn(거래대금)
```

### 현재가 조회
```
GET /uapi/domestic-stock/v1/quotations/inquire-price
tr_id: FHKST01010100
Params: FID_COND_MRKT_DIV_CODE="J", FID_INPUT_ISCD="{종목코드}"
Response output: stck_prpr, prdy_vrss, prdy_ctrt, acml_vol, acml_tr_pbmn,
  stck_hgpr, stck_lwpr, stck_oprc, stck_sdpr, hts_avls, per, pbr, hts_frgn_ehrt
```

### 일별 차트
```
GET /uapi/domestic-stock/v1/quotations/inquire-daily-chartprice
tr_id: FHKST03010100
Params: FID_COND_MRKT_DIV_CODE="J", FID_INPUT_ISCD="{종목코드}",
        FID_INPUT_DATE_1="{시작YYYYMMDD}", FID_INPUT_DATE_2="{종료YYYYMMDD}",
        FID_PERIOD_DIV_CODE="D", FID_ORG_ADJ_PRC="0"
Response output2[]: stck_bsop_date, stck_oprc, stck_hgpr, stck_lwpr, stck_clpr,
  acml_vol, acml_tr_pbmn, prdy_ctrt
※ 날짜 내림차순 → 오름차순 정렬 필요
```

### 투자자별 매매동향
```
GET /uapi/domestic-stock/v1/quotations/inquire-investor
tr_id: FHKST01010900
Params: FID_COND_MRKT_DIV_CODE="J", FID_INPUT_ISCD="{종목코드}"
Response output[]: invst_nm, prsn_ntby_qty, prsn_ntsl_qty,
  prsn_ntby_tr_pbmn, prsn_ntsl_tr_pbmn
```

### 분봉 차트
```
GET /uapi/domestic-stock/v1/quotations/inquire-time-chartprice
tr_id: FHKST03010200
Params: FID_COND_MRKT_DIV_CODE="J", FID_INPUT_ISCD="{종목코드}",
        FID_INPUT_HOUR_1="000030", FID_PW_DATA_INCU_YN="N", FID_ETC_CLS_CODE=""
Response output2[]: stck_cntg_hour, stck_oprc, stck_hgpr, stck_lwpr, stck_prpr, cntg_vol
```

### WebSocket 실시간 시세 (KRX / NXT / 통합)
```
접속 URL:
  실거래: ws://ops.koreainvestment.com:21000
  모의투자: ws://ops.koreainvestment.com:31000

KRX 전용:
  H0STCNT0  → 실시간체결가 (KRX)
  H0STASP0  → 실시간호가 (KRX)
  H0STCNI0  → 실시간체결통보
  H0STMSC0  → 실시간회원사 (KRX)
  H0STPGM0  → 실시간프로그램매매 (KRX)

NXT 전용:
  H0NXCNT0  → 실시간체결가 (NXT)
  H0NXASP0  → 실시간호가 (NXT)
  H0NXMSC0  → 실시간회원사 (NXT)
  H0NXPGM0  → 실시간프로그램매매 (NXT)

통합 (KRX + NXT):
  H0UPCNT0  → 실시간체결가 (통합)    ← SIGINT 기본 구독용
  H0UPASP0  → 실시간호가 (통합)
  H0UPMSC0  → 실시간회원사 (통합)
  H0UPPGM0  → 실시간프로그램매매 (통합)

※ TR코드는 API 문서에서 최종 확인 필요 (위 코드는 네이밍 패턴 기반 추정 포함)
※ 통합 구독 = MTS에서 보는 것과 동일한 실시간 체결 데이터
```

### NXT 활용 전략 (SIGINT 전용)
```
1. 기본 시세: 통합(H0UPCNT0) 구독 → KRX+NXT 합산 실시간 체결
2. NXT 분리 감시: NXT(H0NXCNT0) 별도 구독 → NXT 단독 거래량 추적
3. KRX vs NXT 비율 계산:
   - NXT 거래대금 / (KRX + NXT 거래대금) = NXT 비율
   - NXT 비율 > 60% 이면서 본장(09:00~15:30) 거래대금 약한 종목 = "NXT 편중" 경고
4. 프리마켓(08:00~08:50) NXT 거래대금 상위 = 본장 주도주 선행 시그널
5. 애프터마켓(15:40~20:00) NXT 거래 지속 = 재료 연속성 판단 보조 지표
```

---

## 백엔드 자체 API 엔드포인트

KIS API를 가공하여 프론트엔드에 제공하는 FastAPI 엔드포인트.

### 기본 데이터
```
GET /api/volume-rank?market=ALL&top_n=60      # 거래대금 상위
GET /api/price/{code}                          # 현재가
GET /api/chart/{code}?period=D&days=180        # 차트 + 기술적 분석
GET /api/investor-trend/{code}                 # 종목별 수급
GET /api/minute-chart/{code}?time_unit=30      # 분봉
```

### NXT 데이터
```
GET /api/nxt/pre-market                        # 프리마켓(08:00~08:50) 거래대금 상위
GET /api/nxt/after-market                      # 애프터마켓(15:40~20:00) 거래대금 상위
GET /api/nxt/ratio/{code}                      # 종목별 KRX vs NXT 거래대금 비율
GET /api/nxt/alert                             # NXT 편중 경고 종목 (NXT비율 60%+)
WS  /ws/realtime                               # WebSocket: 통합 실시간 체결 스트림
WS  /ws/nxt                                    # WebSocket: NXT 전용 실시간 체결 스트림
```

### 스크리너 (종가배팅 + 스윙)
```
GET /api/screener/closing-bet               # 종가배팅 6원칙 필터
GET /api/screener/pullback-swing             # 눌림목 스윙 필터
GET /api/screener/breakout-swing             # 돌파 스윙 필터
GET /api/screener/market-regime              # 시황 필터 (지수 20MA 위/아래)
GET /api/screener/trend-template/{code}      # 미너비니 추세 템플릿 체크
GET /api/screener/vcp/{code}                 # VCP 패턴 감지
GET /api/screener/darvas-box/{code}          # 다바스 박스 상/하단 계산
GET /api/screener/reference-candle/{code}    # 기준봉 감지 (거래량 폭발 장대양봉)
```

### 매매일지
```
GET    /api/journal                            # 전체 매매 기록 조회
POST   /api/journal                            # 매매 기록 추가
PUT    /api/journal/{id}                       # 매매 기록 수정 (매도 입력 등)
DELETE /api/journal/{id}                       # 매매 기록 삭제
GET    /api/journal/stats                      # 통계 (승률, 손익비 등)
GET    /api/journal/{id}/tracking              # 3/5/10일 결과 추적
```

### 일일 데이터 저장
```
POST   /api/daily-save                         # 당일 거래대금 TOP 60 저장
GET    /api/daily-history?date=20260417         # 특정일 데이터 조회
GET    /api/daily-history/compare?d1=20260416&d2=20260417  # 일자간 비교
```

### 데이터 저장 구조 (backend/data/)
```
backend/data/
├── journal.json          # 매매일지
├── daily/
│   ├── 20260417.json     # 4/17 거래대금 TOP 60
│   ├── 20260418.json     # 4/18
│   └── ...
└── themes.json           # 테마/섹터 태그 매핑 (수동 관리)
```

- Rate limit: 초당 20건, 연속 호출 시 time.sleep(0.1)
- 토큰 24시간 만료 → 자동 재발급
- 에러: 401→재인증, 429→1초 대기 재시도(3회), 500→로그 후 스킵
- 응답 검증: rt_cd=="0" 성공, 아니면 msg1 확인
- 숫자 필드 문자열 → int/float 변환 필수

---

## 환경변수 (.env)

```
KIS_APP_KEY=발급받은_앱키
KIS_APP_SECRET=발급받은_시크릿키
KIS_ACCOUNT_NO=계좌번호8자리-00
KIS_IS_MOCK=false
```

---

## 개발 순서

```
Phase 1: 백엔드
  ├─ 프로젝트 초기화 (venv, pip install, .env, .gitignore)
  ├─ KIS 인증 모듈 (토큰 발급/갱신/캐싱)
  ├─ 거래량 순위 API + FastAPI 엔드포인트
  ├─ 현재가 + 일별 차트 API
  ├─ 기술적 분석 모듈 (MA, RSI, MACD, BB, 캔들패턴)
  └─ 투자자별 매매동향 API

Phase 2: 프론트엔드 코어
  ├─ Vite + React 초기 세팅
  ├─ npm install lightweight-charts lightweight-charts-react-wrapper recharts
  ├─ Toss 폰트 로드 + 다크 테마 + 레이아웃 (6개 탭)
  ├─ 거래대금 테이블 (리스트 뷰)
  ├─ 차트분석 뷰 (TradingView Lightweight Charts 캔들스틱)
  ├─ 수급 분석 뷰 (Recharts 바 차트 + 양매수 하이라이트)
  └─ 종합 대시보드 + 타임테이블 바

Phase 3: 통합 + 핵심 신규 기능
  ├─ 프론트 ↔ 백엔드 연동
  ├─ 거래대금 탭: 테마 그룹핑 뷰 + 대장주 뱃지
  ├─ 종가배팅 탭: 6원칙 스크리너 + 비중 계산기
  ├─ 매매일지 탭: 매매 기록 + 3/5/10일 결과 추적
  ├─ 일일 데이터 저장 (거래대금 TOP 60 날짜별 JSON)
  ├─ 에러/로딩/빈 상태 처리 + 데모 모드
  └─ README

Phase 4: 자동매매 엔진 (향후)
  ├─ engine/ 폴더 구조 세팅
  ├─ KIS 주문 API 연동 (매수/매도/정정/취소)
  ├─ 전략 모듈 인터페이스 설계 (Strategy 베이스 클래스)
  ├─ 리스크 관리 (포지션 사이징, 최대 손절, 일일 손실 한도)
  ├─ 스케줄러 (장 전 세팅, 종가배팅 타이머, 장 마감 청산)
  ├─ WebSocket 실시간 시세 수신
  ├─ 텔레그램/카톡 알림 연동
  └─ 대시보드에 엔진 상태/포지션/손익 모니터링 패널 추가
```

---

## .gitignore

```
.env
__pycache__/
*.pyc
node_modules/
dist/
.vite/
```
