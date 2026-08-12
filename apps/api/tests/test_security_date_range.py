"""보안 이벤트 기간 필터의 경계.

배경: 보안센터가 '오늘'로 조회하면 항상 0건이었다. 종료일을 그대로 datetime으로
바꿔 `created_at <= 2026-08-12 00:00:00` 으로 비교했기 때문이다. 오늘 발생한
이벤트는 전부 그 시각 이후라 하나도 걸리지 않았다. 날짜 필터를 보내지 않는
대시보드에서는 같은 이벤트가 정상적으로 보여서 원인을 찾기 어려웠다.

경계는 한국시간 기준이어야 한다. UTC로 자르면 한국 오전 0~9시에 '오늘'이
어제를 가리킨다 — 관리자가 아침에 보면 방금 난 사건이 안 보인다.
"""

from datetime import datetime, timedelta, timezone

from app.api.admin.security_events_router import parse_event_day_range

KST = timezone(timedelta(hours=9))


def test_single_day_covers_that_whole_day() -> None:
    start, end = parse_event_day_range("2026-08-12", "2026-08-12")

    assert start == datetime(2026, 8, 12, 0, 0, tzinfo=KST)
    # 종료 경계는 다음 날 0시(미포함) — 그래야 그날 23:59:59까지 들어온다.
    assert end == datetime(2026, 8, 13, 0, 0, tzinfo=KST)


def test_event_made_this_afternoon_is_inside_todays_range() -> None:
    start, end = parse_event_day_range("2026-08-12", "2026-08-12")
    happened_at = datetime(2026, 8, 12, 17, 43, tzinfo=KST)

    assert start <= happened_at < end


def test_korean_early_morning_event_is_inside_todays_range() -> None:
    # UTC 경계로 자르면 이 시각은 '어제'로 밀려 사라진다.
    start, end = parse_event_day_range("2026-08-13", "2026-08-13")
    happened_at = datetime(2026, 8, 13, 3, 4, tzinfo=KST)

    assert start <= happened_at < end


def test_multi_day_range_includes_the_last_day() -> None:
    start, end = parse_event_day_range("2026-08-06", "2026-08-12")
    last_moment = datetime(2026, 8, 12, 23, 59, 59, tzinfo=KST)

    assert start <= last_moment < end


def test_missing_values_are_open_ended() -> None:
    assert parse_event_day_range(None, None) == (None, None)
    assert parse_event_day_range("2026-08-12", None)[1] is None
    assert parse_event_day_range(None, "2026-08-12")[0] is None


def test_malformed_dates_are_ignored_rather_than_erroring() -> None:
    # 잘못된 값 때문에 화면 전체가 죽는 것보다 필터를 무시하는 편이 낫다.
    assert parse_event_day_range("어제", "2026-13-45") == (None, None)
