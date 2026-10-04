"""Customer history shown on session tiles and the session page, and the
optional date of birth field. In-memory database, no network.

Run:  python -m pytest tests/test_customer_history.py -n 0
"""
import pytest
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

import server


@pytest.fixture
def db(monkeypatch):
    mock = AsyncMongoMockClient()["history_test"]
    monkeypatch.setattr(server, "db", mock)
    return mock


async def add_session(db, sid, start, status="closed", purchased=None, paid=0, cid="c1"):
    await db.sessions.insert_one({"id": sid, "customer_id": cid, "start_time": start, "status": status,
                                  "purchased": purchased, "final_paid": paid})


async def test_history_for_returning_customer(db):
    await db.customers.insert_one({"id": "c1", "dob": {"day": 12, "month": 3, "year": 1990}})
    await add_session(db, "s1", "2026-08-01T10:00:00+00:00", purchased=True, paid=4500)
    await add_session(db, "s2", "2026-09-10T10:00:00+00:00", purchased=False)
    await add_session(db, "s3", "2026-10-04T10:00:00+00:00", status="active")
    sessions = [{"id": "s3", "customer_id": "c1", "start_time": "2026-10-04T10:00:00+00:00"}]
    await server.attach_customer_history(sessions)
    h = sessions[0]["history"]
    assert h["visits"] == 3
    assert h["purchased"] == 1
    assert h["not_purchased"] == 1  # the active visit is not counted as "not purchased"
    assert h["revenue"] == 4500
    assert h["last_visit"] == "2026-09-10T10:00:00+00:00"  # the visit before this one
    assert h["dob"] == {"day": 12, "month": 3, "year": 1990}


async def test_history_for_new_customer(db):
    await db.customers.insert_one({"id": "c2"})
    await add_session(db, "n1", "2026-10-04T10:00:00+00:00", status="active", cid="c2")
    sessions = [{"id": "n1", "customer_id": "c2", "start_time": "2026-10-04T10:00:00+00:00"}]
    await server.attach_customer_history(sessions)
    h = sessions[0]["history"]
    assert h["visits"] == 1 and h["last_visit"] is None and h["revenue"] == 0 and h["dob"] is None


def test_day_month_validation():
    assert server._clean_day({"day": 29, "month": 2}, "DOB") == {"day": 29, "month": 2, "year": None}
    assert server._clean_day({"day": "5", "month": "10", "year": "1988"}, "DOB") == {"day": 5, "month": 10, "year": 1988}
    assert server._clean_day({}, "DOB") is None  # cleared
    for bad in ({"day": 31, "month": 2}, {"day": 5}, {"day": 1, "month": 13}, {"day": 1, "month": 1, "year": 1700}):
        with pytest.raises(HTTPException):
            server._clean_day(bad, "DOB")


def test_export_date_helpers():
    assert server.dob_text({"day": 15, "month": 1, "year": 1990}) == "15 Jan 1990"
    assert server.dob_text({"day": 29, "month": 2, "year": None}) == "29 Feb"
    assert server.dob_text(None) == ""
    assert server.dob_age({"day": 1, "month": 1, "year": None}) is None
    assert server.ist_date_text("2026-10-03T20:00:00+00:00") == "04 Oct 2026"  # already the 4th in India
    assert server.ist_date_text(None) == ""
