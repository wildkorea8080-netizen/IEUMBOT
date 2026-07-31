from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# 풀 크기는 동기 엔드포인트가 쓰는 anyio 스레드풀(기본 40)에 맞춘다.
# FastAPI의 sync def 라우터는 스레드풀에서 실행되고, 채팅처럼 LLM 응답을 기다리는
# 요청은 그동안 DB 커넥션을 계속 쥐고 있다. 기존 기본값(5+10=15)이면 동시 요청이
# 15개만 넘어도 나머지가 커넥션을 기다리며 멈춘다(기본 대기 30초).
# pool_timeout은 짧게 둬서, 조용히 오래 멈추는 대신 명확한 에러로 드러나게 한다.
_POOL_SIZE = 10
_MAX_OVERFLOW = 30  # 최대 동시 커넥션 40 — Postgres max_connections(기본 100) 내
_POOL_TIMEOUT_SECONDS = 10
_POOL_RECYCLE_SECONDS = 1800  # 30분 — DB/프록시가 끊은 죽은 커넥션 재사용 방지

engine = create_engine(
    settings.api_database_url,
    future=True,
    pool_pre_ping=True,
    pool_size=_POOL_SIZE,
    max_overflow=_MAX_OVERFLOW,
    pool_timeout=_POOL_TIMEOUT_SECONDS,
    pool_recycle=_POOL_RECYCLE_SECONDS,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)


def get_db_session() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
