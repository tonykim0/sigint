# 백엔드 배포 가이드 (Railway)

Railway 무료 플랜으로 백엔드를 퍼블릭 서버에 올리면
Vercel 프론트가 실데이터로 작동합니다.

---

## 1. Railway 계정 & 프로젝트 생성

1. https://railway.app 접속 → GitHub 계정으로 가입
2. **New Project** → **Deploy from GitHub repo**
3. sigint 레포를 연결 (없으면 먼저 GitHub에 push 필요)
4. Root Directory: `backend` 설정

---

## 2. 환경변수 설정

Railway 프로젝트 → **Variables** 탭에서 추가:

```
KIS_APP_KEY=발급받은_앱키
KIS_APP_SECRET=발급받은_시크릿키
KIS_ACCOUNT_NO=계좌번호8자리-00
KIS_IS_MOCK=false
```

---

## 3. 배포 확인

배포 완료 후 Railway에서 도메인 발급 (예: `sigint-backend.up.railway.app`)

헬스체크 확인:
```
curl https://sigint-backend.up.railway.app/api/health
```

---

## 4. Vercel 환경변수 연결

Vercel 프로젝트 → **Settings → Environment Variables** 에서:

```
VITE_API_BASE=https://sigint-backend.up.railway.app
```

추가 후 **Redeploy** 클릭.

또는 터미널에서:
```bash
cd frontend
npx vercel env add VITE_API_BASE production
# 입력: https://sigint-backend.up.railway.app
npx vercel deploy --prod
```

---

## 대안: Render.com (무료, 더 간단)

1. https://render.com → New Web Service
2. GitHub 연결 → Root Directory: `backend`
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. 환경변수 동일하게 설정

단점: 무료 플랜은 15분 비활성 시 슬립 → 첫 요청 30초 대기.

---

## CLI로 배포 (터미널)

```bash
# Railway CLI 설치
npm install -g @railway/cli

# 로그인 (브라우저 열림)
railway login

# 프로젝트 연결 (backend 폴더에서 실행)
cd backend
railway init

# 환경변수 설정
railway variables set KIS_APP_KEY=... KIS_APP_SECRET=... KIS_ACCOUNT_NO=... KIS_IS_MOCK=false

# 배포
railway up
```
