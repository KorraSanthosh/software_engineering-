"""
MongoDB connection + helpers shared by the API and the importer.

Settings come from backend/.env (or real environment variables):
    MONGO_URL=mongodb://localhost:27017
    MONGO_DB=newspaper_agency

Collections mirror the tables in the schema diagram:
    Zones, Delivery_Persons, Customers, Publications, Customer_Subscriptions,
    Vacation_Holds, Daily_Deliveries, Monthly_Invoices, Invoice_Line_Items, Payments
Every document carries the schema's integer ID (CustomerID, ZoneID, …); the
next value comes from the `Counters` collection, so IDs stay small integers
exactly like the relational schema instead of Mongo ObjectIds.
"""
from __future__ import annotations

import datetime as dt
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load_dotenv() -> None:
    env = HERE / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "newspaper_agency")

# collection name -> integer primary key field
PK = {
    "Delivery_Persons": "DeliveryPersonID",
    "Zones": "ZoneID",
    "Customers": "CustomerID",
    "Publications": "PublicationID",
    "Customer_Subscriptions": "SubscriptionID",
    "Vacation_Holds": "HoldID",
    "Daily_Deliveries": "DeliveryID",
    "Monthly_Invoices": "InvoiceID",
    "Invoice_Line_Items": "LineItemID",
    "Payments": "PaymentID",
}

# fields stored as BSON datetimes (midnight) but exposed as "YYYY-MM-DD"
DATE_FIELDS = {"EffectiveDate", "StartDate", "EndDate", "Date", "BillingMonth", "PaymentDate"}

INDEXES = [
    ("Customers", [("ZoneID", 1), ("RouteSequence", 1)], False),
    ("Customer_Subscriptions", [("CustomerID", 1)], False),
    ("Vacation_Holds", [("CustomerID", 1), ("StartDate", 1)], False),
    ("Daily_Deliveries", [("Date", 1), ("CustomerID", 1), ("PublicationID", 1)], True),
    ("Monthly_Invoices", [("CustomerID", 1), ("BillingMonth", 1)], True),
    ("Invoice_Line_Items", [("InvoiceID", 1)], False),
    ("Payments", [("CustomerID", 1)], False),
    ("Zones", [("ZoneName", 1)], True),
]


def get_client():
    from motor.motor_asyncio import AsyncIOMotorClient  # imported lazily so tests can inject a fake

    return AsyncIOMotorClient(MONGO_URL)


def to_dt(d) -> dt.datetime | None:
    """date / 'YYYY-MM-DD' / datetime -> midnight datetime (what we store)."""
    if d is None:
        return None
    if isinstance(d, dt.datetime):
        return dt.datetime(d.year, d.month, d.day)
    if isinstance(d, dt.date):
        return dt.datetime(d.year, d.month, d.day)
    return to_dt(dt.date.fromisoformat(str(d)[:10]))


def clean(doc: dict | None) -> dict | None:
    """Mongo document -> JSON-friendly dict (drops _id, dates as YYYY-MM-DD)."""
    if doc is None:
        return None
    out = {}
    for k, v in doc.items():
        if k == "_id":
            continue
        if isinstance(v, dt.datetime):
            v = v.date().isoformat() if k in DATE_FIELDS else v.isoformat()
        elif isinstance(v, dt.date):
            v = v.isoformat()
        elif type(v).__name__ == "Decimal128":
            v = float(v.to_decimal())
        out[k] = v
    return out


async def next_id(db, collection: str) -> int:
    """Atomic auto-increment per collection (Counters._id = collection name)."""
    from pymongo import ReturnDocument

    r = await db.Counters.find_one_and_update(
        {"_id": collection}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    return int(r["seq"])


async def sync_counters(db) -> None:
    """Make sure counters are ahead of any IDs already in the data (e.g. after an import)."""
    for coll, pk in PK.items():
        top = await db[coll].find({}, {pk: 1}).sort(pk, -1).limit(1).to_list(1)
        mx = int(top[0][pk]) if top and top[0].get(pk) is not None else 0
        cur = await db.Counters.find_one({"_id": coll})
        if not cur or int(cur.get("seq", 0)) < mx:
            await db.Counters.update_one({"_id": coll}, {"$set": {"seq": mx}}, upsert=True)


async def ensure_indexes(db) -> None:
    for coll, pk in PK.items():
        await db[coll].create_index(pk, unique=True)
    for coll, keys, unique in INDEXES:
        await db[coll].create_index(keys, unique=unique)
