"""종목명 ↔ 코드 검색.

전략:
1. 최근 volume_rank 결과를 10분 캐시로 유지 (생거래 종목 우선)
2. 정적 well-known 목록으로 fallback
3. 쿼리와 코드/이름 양방향 부분 매치
"""
from __future__ import annotations

import threading
import time
from typing import Any

from kis_client import KISError, volume_rank

_RANK_CACHE: list[dict[str, Any]] = []
_RANK_TS: float = 0.0
_RANK_LOCK = threading.Lock()
_RANK_TTL = 600.0  # 10분

# 자주 등장하는 주요 종목 정적 목록
WELL_KNOWN: list[dict[str, str]] = [
    {"code": "005930", "name": "삼성전자"},
    {"code": "000660", "name": "SK하이닉스"},
    {"code": "373220", "name": "LG에너지솔루션"},
    {"code": "207940", "name": "삼성바이오로직스"},
    {"code": "006400", "name": "삼성SDI"},
    {"code": "051910", "name": "LG화학"},
    {"code": "035420", "name": "NAVER"},
    {"code": "035720", "name": "카카오"},
    {"code": "005380", "name": "현대차"},
    {"code": "000270", "name": "기아"},
    {"code": "068270", "name": "셀트리온"},
    {"code": "012330", "name": "현대모비스"},
    {"code": "028260", "name": "삼성물산"},
    {"code": "066570", "name": "LG전자"},
    {"code": "096770", "name": "SK이노베이션"},
    {"code": "011790", "name": "SKC"},
    {"code": "009150", "name": "삼성전기"},
    {"code": "003550", "name": "LG"},
    {"code": "030200", "name": "KT"},
    {"code": "017670", "name": "SK텔레콤"},
    {"code": "000810", "name": "삼성화재"},
    {"code": "086790", "name": "하나금융지주"},
    {"code": "105560", "name": "KB금융"},
    {"code": "055550", "name": "신한지주"},
    {"code": "316140", "name": "우리금융지주"},
    {"code": "032830", "name": "삼성생명"},
    {"code": "016360", "name": "삼성증권"},
    {"code": "003490", "name": "대한항공"},
    {"code": "020560", "name": "아시아나항공"},
    {"code": "180640", "name": "한진칼"},
    {"code": "011200", "name": "HMM"},
    {"code": "005880", "name": "대한해운"},
    {"code": "009540", "name": "한국조선해양"},
    {"code": "042660", "name": "한화오션"},
    {"code": "010130", "name": "고려아연"},
    {"code": "047040", "name": "대우건설"},
    {"code": "000720", "name": "현대건설"},
    {"code": "093370", "name": "후성"},
    {"code": "010820", "name": "퍼스텍"},
    {"code": "272210", "name": "한화시스템"},
    {"code": "012450", "name": "한화에어로스페이스"},
    {"code": "047560", "name": "이스트소프트"},
    {"code": "326030", "name": "SK바이오팜"},
    {"code": "207940", "name": "삼성바이오로직스"},
    {"code": "096530", "name": "씨젠"},
    {"code": "251270", "name": "넷마블"},
    {"code": "293490", "name": "카카오게임즈"},
    {"code": "263750", "name": "펄어비스"},
    {"code": "036570", "name": "엔씨소프트"},
    {"code": "114800", "name": "KODEX 인버스"},
    {"code": "252670", "name": "KODEX 200선물인버스2X"},
    {"code": "122630", "name": "KODEX 레버리지"},
    {"code": "069500", "name": "KODEX 200"},
    {"code": "102110", "name": "TIGER 200"},
    {"code": "229200", "name": "KODEX 코스닥150"},
    {"code": "251340", "name": "KODEX 코스닥150선물인버스"},
    {"code": "462330", "name": "KODEX 2차전지산업레버리지"},
    {"code": "049080", "name": "기가레인"},
    {"code": "069540", "name": "빛과전자"},
    {"code": "046970", "name": "우리로"},
    {"code": "010170", "name": "대한광통신"},
    {"code": "215790", "name": "이노인스트루먼트"},
    {"code": "203650", "name": "드림시큐리티"},
    {"code": "184230", "name": "SGA솔루션즈"},
    {"code": "430690", "name": "한싹"},
    {"code": "027360", "name": "아주IB투자"},
    {"code": "084650", "name": "랩지노믹스"},
    {"code": "011930", "name": "신성이엔지"},
    {"code": "018880", "name": "한온시스템"},
]

_WK_MAP: dict[str, dict[str, str]] = {r["code"]: r for r in WELL_KNOWN}


def _refresh_rank() -> None:
    global _RANK_CACHE, _RANK_TS
    try:
        items = volume_rank("ALL")[:60]
        with _RANK_LOCK:
            _RANK_CACHE = [{"code": r["code"], "name": r["name"]} for r in items]
            _RANK_TS = time.time()
    except KISError:
        pass


def search(q: str, limit: int = 10) -> list[dict[str, str]]:
    q = q.strip()
    if not q:
        return []
    ql = q.lower()

    # rank 캐시 갱신 (10분 TTL)
    with _RANK_LOCK:
        stale = time.time() - _RANK_TS > _RANK_TTL
        rank_snap = list(_RANK_CACHE)

    if stale:
        import threading as _t
        _t.Thread(target=_refresh_rank, daemon=True).start()

    # 후보 풀: 최근 거래량 상위 + 정적 목록
    pool: dict[str, dict[str, str]] = dict(_WK_MAP)
    for r in rank_snap:
        pool[r["code"]] = r

    results = []
    for item in pool.values():
        code = item["code"]
        name = item["name"]
        # 코드 정확히 일치 → 최우선
        if code == q:
            results.insert(0, item)
        elif q in code or ql in name.lower():
            results.append(item)
        if len(results) >= limit:
            break

    # 코드로 시작하는 항목 먼저
    results.sort(key=lambda x: (0 if x["code"].startswith(q) else 1, x["code"]))
    return results[:limit]
