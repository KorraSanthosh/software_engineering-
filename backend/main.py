"""
Newspaper Agency Automation API — FastAPI + MongoDB (Motor)

Run:   uvicorn main:app --reload --port 8000
Docs:  http://localhost:8000/docs

All routes live under /api. The original endpoints are kept at the same paths
(with their bugs fixed) and the CRUD/list endpoints the web app needs are added:

  Original (fixed)                               Added
  POST /api/customers/{id}/subscriptions         CRUD  /api/zones, /api/delivery-persons, /api/customers,
  POST /api/customers/{id}/vacations                   /api/publications, /api/subscriptions,
  GET  /api/deliveries/routes                          /api/vacation-holds, /api/payments
  PUT  /api/deliveries/batch-update              GET   /api/deliveries   POST /api/deliveries/generate
  POST /api/invoices/generate-monthly            GET   /api/invoices, /api/invoices/{id}
  POST /api/payments                             POST  /api/invoices/{id}/reminder
  POST /api/system/process-overdues              GET   /api/reports/dashboard, /api/health
  GET  /api/reports/commissions
  GET  /api/reports/agency-summary

SRS business rules (from the schema diagram):
  1. Consecutive routing  — route = customers ordered by ZoneID then RouteSequence
  2. Commission           — SUM(QuantityDelivered × PriceAtDelivery) × CommissionRate (% → ×0.01)
  3. Vacations            — skip delivery when StartDate ≤ date ≤ EndDate
  4. Auto-suspension      — invoice unpaid > 60 days ⇒ Customers.Status = 'Suspended'
"""
from __future__ import annotations

import datetime as dt
import os
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import List, Literal, Optional

from fastapi import APIRouter, FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import AliasChoices, BaseModel, ConfigDict, Field

import db as store
from db import clean, to_dt

from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_role, seed_users,
)

SUBSCRIPTION_NOTICE_DAYS = int(os.getenv("SUBSCRIPTION_NOTICE_DAYS", "7"))
REMINDER_AFTER_DAYS = int(os.getenv("REMINDER_AFTER_DAYS", "30"))
SUSPEND_AFTER_DAYS = int(os.getenv("SUSPEND_AFTER_DAYS", "60"))
DEFAULT_COMMISSION_PCT = 2.5  # schema: CommissionRate DECIMAL(5,2) default 2.5 (percent)

db = None  # Motor database; set on startup (tests may assign a fake before startup)
_client = None


@asynccontextmanager
async def lifespan(_app):
    global db, _client
    if db is None:
        _client = store.get_client()
        db = _client[store.MONGO_DB]
    await store.ensure_indexes(db)
    await store.sync_counters(db)
    await seed_users(db)
    yield
    if _client is not None:
        _client.close()


app = FastAPI(title="Newspaper Agency Automation API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


api = APIRouter(prefix="/api")


# ===========================================================================
# Helpers
# ===========================================================================
def today() -> dt.date:
    return dt.date.today()


def month_start(d) -> dt.date:
    d = d.date() if isinstance(d, dt.datetime) else d
    return d.replace(day=1)


def add_months(d: dt.date, n: int) -> dt.date:
    y, m = divmod(d.month - 1 + n, 12)
    return dt.date(d.year + y, m + 1, 1)


def as_date(v) -> dt.date:
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    return dt.date.fromisoformat(str(v)[:10])


def money(v) -> float:
    return round(float(v or 0) + 1e-9, 2)


def A(*names):
    """Accept camelCase, PascalCase and snake_case for the same field."""
    return AliasChoices(*names)


async def find(coll: str, filt: dict | None = None, sort: list | None = None) -> list[dict]:
    cur = db[coll].find(filt or {})
    if sort:
        cur = cur.sort(sort)
    return [clean(d) for d in await cur.to_list(length=None)]


async def find_one(coll: str, filt: dict) -> dict | None:
    return clean(await db[coll].find_one(filt))


async def get_or_404(coll: str, id_: int, what: str) -> dict:
    doc = await find_one(coll, {store.PK[coll]: id_})
    if not doc:
        raise HTTPException(404, f"{what} #{id_} not found")
    return doc


async def require(coll: str, id_: Optional[int], what: str) -> dict:
    doc = await find_one(coll, {store.PK[coll]: id_}) if id_ is not None else None
    if not doc:
        raise HTTPException(422, f"{what} #{id_} does not exist")
    return doc


async def insert(coll: str, doc: dict) -> dict:
    pk = store.PK[coll]
    doc = {pk: await store.next_id(db, coll), **doc}
    await db[coll].insert_one(doc)
    return clean(doc)


async def next_ids(coll: str, n: int) -> list[int]:
    if n <= 0:
        return []
    from pymongo import ReturnDocument

    r = await db.Counters.find_one_and_update({"_id": coll}, {"$inc": {"seq": n}}, upsert=True, return_document=ReturnDocument.AFTER)
    last = int(r["seq"])
    return list(range(last - n + 1, last + 1))


async def index(coll: str, filt: dict | None = None) -> dict:
    pk = store.PK[coll]
    return {d[pk]: d for d in await find(coll, filt)}


# ===========================================================================
# Models  (accept camelCase like the original API *and* the schema's PascalCase)
# ===========================================================================
class _In(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class DeliveryPersonIn(_In):
    name: str = Field(min_length=1, max_length=100, validation_alias=A("Name", "name"))
    contact_number: str = Field(pattern=r'^\d{10}$', validation_alias=A("ContactNumber", "contactNumber", "contact_number"))
    commission_rate: float = Field(DEFAULT_COMMISSION_PCT, ge=0, le=100, validation_alias=A("CommissionRate", "commissionRate", "commission_rate"))


class ZoneIn(_In):
    zone_name: str = Field(min_length=1, max_length=100, validation_alias=A("ZoneName", "zoneName", "zone_name"))
    delivery_person_id: Optional[int] = Field(None, validation_alias=A("DeliveryPersonID", "deliveryPersonId", "delivery_person_id"))


class CustomerIn(_In):
    name: str = Field(min_length=1, max_length=100, validation_alias=A("Name", "name"))
    address: str = Field(min_length=1, validation_alias=A("Address", "address"))
    zone_id: int = Field(validation_alias=A("ZoneID", "zoneId", "zone_id"))
    route_sequence: int = Field(ge=1, validation_alias=A("RouteSequence", "routeSequence", "route_sequence"))
    status: Literal["Active", "Suspended"] = Field("Active", validation_alias=A("Status", "status"))


class PublicationIn(_In):
    name: str = Field(min_length=1, max_length=100, validation_alias=A("Name", "name"))
    type: Literal["Newspaper", "Magazine"] = Field(validation_alias=A("Type", "type"))
    price_per_issue: float = Field(ge=0, validation_alias=A("PricePerIssue", "pricePerIssue", "price_per_issue"))


class CustomerSubscriptionRequest(_In):
    customer_id: Optional[int] = Field(None, validation_alias=A("CustomerID", "customerId", "customer_id"))
    publication_id: int = Field(validation_alias=A("PublicationID", "publicationId", "publication_id"))
    quantity: int = Field(1, gt=0, validation_alias=A("Quantity", "quantity"))
    effective_date: dt.date = Field(validation_alias=A("EffectiveDate", "effectiveDate", "effective_date"))
    status: Literal["Active", "Cancelled"] = Field("Active", validation_alias=A("Status", "status"))


class VacationHoldRequest(_In):
    customer_id: Optional[int] = Field(None, validation_alias=A("CustomerID", "customerId", "customer_id"))
    start_date: dt.date = Field(validation_alias=A("StartDate", "startDate", "start_date"))
    end_date: dt.date = Field(validation_alias=A("EndDate", "endDate", "end_date"))


class DeliveryStatusUpdate(_In):
    delivery_id: int = Field(validation_alias=A("DeliveryID", "deliveryId", "delivery_id"))
    status: Literal["Delivered", "Failed"] = Field(validation_alias=A("DeliveryStatus", "status"))


class BatchDeliveryUpdateRequest(_In):
    updates: List[DeliveryStatusUpdate]


class DeliveryUpdate(_In):
    status: Optional[Literal["Delivered", "Failed"]] = Field(None, validation_alias=A("DeliveryStatus", "status"))
    quantity: Optional[int] = Field(None, ge=0, validation_alias=A("QuantityDelivered", "quantityDelivered", "quantity"))


class GenerateInvoicesRequest(_In):
    month: Optional[dt.date] = Field(None, validation_alias=A("month", "Month", "BillingMonth", "billingMonth"))


class PaymentRequest(_In):
    customer_id: int = Field(validation_alias=A("CustomerID", "customerId", "customer_id"))
    amount: float = Field(gt=0, validation_alias=A("AmountPaid", "amount", "amountPaid"))
    method: Literal["Cash", "Cheque"] = Field(validation_alias=A("Method", "method"))
    reference: Optional[str] = Field("", max_length=50, validation_alias=A("ReferenceNumber", "reference", "referenceNumber"))
    payment_date: Optional[dt.date] = Field(None, validation_alias=A("PaymentDate", "paymentDate", "payment_date"))

class LoginRequest(_In):
    username: str = Field(min_length=1, validation_alias=A("Username", "username"))
    password: str = Field(min_length=1, validation_alias=A("Password", "password"))

class RegisterUserRequest(_In):
    username: str = Field(min_length=3, max_length=50, validation_alias=A("Username", "username"))
    password: str = Field(min_length=6, validation_alias=A("Password", "password"))
    role: Literal["manager", "delivery_staff", "customer"] = Field(validation_alias=A("Role", "role"))
    linked_id: Optional[int] = Field(None, validation_alias=A("LinkedID", "linkedId", "linked_id"))
    display_name: str = Field(min_length=1, max_length=100, validation_alias=A("DisplayName", "displayName", "display_name"))

class PaymentVerificationRequest(_In):
    customer_id: int = Field(validation_alias=A("CustomerID", "customerId", "customer_id"))
    amount: float = Field(gt=0, validation_alias=A("Amount", "amount"))
    reference_number: str = Field(min_length=1, max_length=100, validation_alias=A("ReferenceNumber", "referenceNumber", "reference_number"))

class PaymentVerificationAction(_In):
    status: Literal["accepted", "rejected"] = Field(validation_alias=A("Status", "status"))
    note: Optional[str] = Field("", max_length=500, validation_alias=A("Note", "note", "ManagerNote", "managerNote"))


# ===========================================================================
# Health
# ===========================================================================
@api.get("/health")
async def health():
    await db.command("ping")
    return {"status": "ok", "database": store.MONGO_DB}


# ===========================================================================
# Authentication
# ===========================================================================
@api.post("/auth/login")
async def login(creds: LoginRequest):
    user = await db.Users.find_one({"Username": creds.username})
    if not user or not verify_password(creds.password, user["PasswordHash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    token = create_access_token({
        "sub": user["Username"],
        "role": user["Role"],
        "user_id": user["UserID"],
    })
    
    user_data = clean(user)
    del user_data["PasswordHash"]
    
    # Attach linked entity name
    if user["Role"] == "customer" and user.get("LinkedID"):
        cust = await find_one("Customers", {"CustomerID": user["LinkedID"]})
        if cust:
            user_data["CustomerName"] = cust["Name"]
    elif user["Role"] == "delivery_staff" and user.get("LinkedID"):
        dp = await find_one("Delivery_Persons", {"DeliveryPersonID": user["LinkedID"]})
        if dp:
            user_data["DeliveryPersonName"] = dp["Name"]
    
    return {"access_token": token, "token_type": "bearer", "user": user_data}


@api.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    out = {k: v for k, v in user.items() if k != "PasswordHash"}
    if user["Role"] == "customer" and user.get("LinkedID"):
        cust = await find_one("Customers", {"CustomerID": user["LinkedID"]})
        if cust:
            out["CustomerName"] = cust["Name"]
    elif user["Role"] == "delivery_staff" and user.get("LinkedID"):
        dp = await find_one("Delivery_Persons", {"DeliveryPersonID": user["LinkedID"]})
        if dp:
            out["DeliveryPersonName"] = dp["Name"]
    return out


@api.post("/auth/register", status_code=201)
async def register_user(req: RegisterUserRequest, user: dict = Depends(require_role("manager"))):
    existing = await db.Users.find_one({"Username": req.username})
    if existing:
        raise HTTPException(409, f"Username '{req.username}' is already taken.")
    
    if req.role == "customer" and req.linked_id:
        await require("Customers", req.linked_id, "Customer")
    elif req.role == "delivery_staff" and req.linked_id:
        await require("Delivery_Persons", req.linked_id, "Delivery person")
    
    doc = await insert("Users", {
        "Username": req.username,
        "PasswordHash": hash_password(req.password),
        "Role": req.role,
        "LinkedID": req.linked_id,
        "DisplayName": req.display_name.strip(),
        "CreatedAt": dt.datetime.utcnow(),
    })
    del doc["PasswordHash"]
    return {"message": "User created", **doc}


# ===========================================================================
# Delivery persons
# ===========================================================================
@api.get("/delivery-persons")
async def list_persons():
    return await find("Delivery_Persons", sort=[("Name", 1)])


@api.get("/delivery-persons/{pid}")
async def get_person(pid: int):
    return await get_or_404("Delivery_Persons", pid, "Delivery person")


def _person_doc(p: DeliveryPersonIn) -> dict:
    return {"Name": p.name.strip(), "ContactNumber": p.contact_number.strip(), "CommissionRate": round(p.commission_rate, 2)}


@api.post("/delivery-persons", status_code=201)
async def create_person(p: DeliveryPersonIn):
    return await insert("Delivery_Persons", _person_doc(p))


@api.put("/delivery-persons/{pid}")
async def update_person(pid: int, p: DeliveryPersonIn):
    await get_or_404("Delivery_Persons", pid, "Delivery person")
    await db.Delivery_Persons.update_one({"DeliveryPersonID": pid}, {"$set": _person_doc(p)})
    return await get_person(pid)


@api.delete("/delivery-persons/{pid}", status_code=204)
async def delete_person(pid: int):
    await get_or_404("Delivery_Persons", pid, "Delivery person")
    if await db.Zones.count_documents({"DeliveryPersonID": pid}):
        raise HTTPException(409, "This person still covers a zone. Reassign the zone first.")
    if await db.Daily_Deliveries.count_documents({"DeliveryPersonID": pid}):
        raise HTTPException(409, "This person has delivery history (needed for commission records) and can't be deleted.")
    await db.Delivery_Persons.delete_one({"DeliveryPersonID": pid})


# ===========================================================================
# Zones
# ===========================================================================
@api.get("/zones")
async def list_zones():
    return await find("Zones", sort=[("ZoneName", 1)])


@api.get("/zones/{zid}")
async def get_zone(zid: int):
    return await get_or_404("Zones", zid, "Zone")


async def _zone_doc(z: ZoneIn, zid: Optional[int] = None) -> dict:
    if z.delivery_person_id is not None:
        await require("Delivery_Persons", z.delivery_person_id, "Delivery person")
    dup = await db.Zones.find_one({"ZoneName": z.zone_name.strip(), "ZoneID": {"$ne": zid}})
    if dup:
        raise HTTPException(409, f"A zone named “{z.zone_name.strip()}” already exists.")
    return {"ZoneName": z.zone_name.strip(), "DeliveryPersonID": z.delivery_person_id}


@api.post("/zones", status_code=201)
async def create_zone(z: ZoneIn):
    return await insert("Zones", await _zone_doc(z))


@api.put("/zones/{zid}")
async def update_zone(zid: int, z: ZoneIn):
    await get_or_404("Zones", zid, "Zone")
    await db.Zones.update_one({"ZoneID": zid}, {"$set": await _zone_doc(z, zid)})
    return await get_zone(zid)


@api.delete("/zones/{zid}", status_code=204)
async def delete_zone(zid: int):
    await get_or_404("Zones", zid, "Zone")
    if await db.Customers.count_documents({"ZoneID": zid}):
        raise HTTPException(409, "This zone still has customers. Move them to another zone first.")
    await db.Zones.delete_one({"ZoneID": zid})


# ===========================================================================
# Customers
# ===========================================================================
@api.get("/customers")
async def list_customers(zone_id: Optional[int] = None, status: Optional[str] = None):
    f = {}
    if zone_id is not None:
        f["ZoneID"] = zone_id
    if status:
        f["Status"] = status
    return await find("Customers", f, sort=[("ZoneID", 1), ("RouteSequence", 1)])


@api.get("/customers/{cid}")
async def get_customer(cid: int):
    return await get_or_404("Customers", cid, "Customer")


async def _customer_doc(c: CustomerIn) -> dict:
    await require("Zones", c.zone_id, "Zone")
    return {"Name": c.name.strip(), "Address": c.address.strip(), "ZoneID": c.zone_id, "RouteSequence": c.route_sequence, "Status": c.status}


@api.post("/customers", status_code=201)
async def create_customer(c: CustomerIn):
    return await insert("Customers", await _customer_doc(c))


@api.put("/customers/{cid}")
async def update_customer(cid: int, c: CustomerIn):
    await get_or_404("Customers", cid, "Customer")
    await db.Customers.update_one({"CustomerID": cid}, {"$set": await _customer_doc(c)})
    return await get_customer(cid)


@api.delete("/customers/{cid}", status_code=204)
async def delete_customer(cid: int):
    await get_or_404("Customers", cid, "Customer")
    for coll in ("Daily_Deliveries", "Monthly_Invoices", "Payments"):
        if await db[coll].count_documents({"CustomerID": cid}):
            raise HTTPException(409, "This customer has deliveries, invoices or payments on record. Set them to Suspended instead of deleting.")
    await db.Customer_Subscriptions.delete_many({"CustomerID": cid})
    await db.Vacation_Holds.delete_many({"CustomerID": cid})
    await db.Customers.delete_one({"CustomerID": cid})


# ===========================================================================
# Publications
# ===========================================================================
@api.get("/publications")
async def list_publications():
    return await find("Publications", sort=[("Name", 1)])


@api.get("/publications/{pid}")
async def get_publication(pid: int):
    return await get_or_404("Publications", pid, "Publication")


def _pub_doc(p: PublicationIn) -> dict:
    return {"Name": p.name.strip(), "Type": p.type, "PricePerIssue": round(p.price_per_issue, 2)}


@api.post("/publications", status_code=201)
async def create_publication(p: PublicationIn):
    return await insert("Publications", _pub_doc(p))


@api.put("/publications/{pid}")
async def update_publication(pid: int, p: PublicationIn):
    await get_or_404("Publications", pid, "Publication")
    # Price changes never rewrite history — Daily_Deliveries keeps PriceAtDelivery.
    await db.Publications.update_one({"PublicationID": pid}, {"$set": _pub_doc(p)})
    return await get_publication(pid)


@api.delete("/publications/{pid}", status_code=204)
async def delete_publication(pid: int):
    await get_or_404("Publications", pid, "Publication")
    for coll in ("Customer_Subscriptions", "Daily_Deliveries", "Invoice_Line_Items"):
        if await db[coll].count_documents({"PublicationID": pid}):
            raise HTTPException(409, "This publication has subscriptions or delivery history and can't be deleted.")
    await db.Publications.delete_one({"PublicationID": pid})


# ===========================================================================
# Subscriptions  (one-week advance notice)
# ===========================================================================
def _check_notice(eff: dt.date) -> None:
    earliest = today() + dt.timedelta(days=SUBSCRIPTION_NOTICE_DAYS)
    if eff < earliest:
        raise HTTPException(400, f"Effective date must be at least {SUBSCRIPTION_NOTICE_DAYS} days in advance (earliest {earliest.isoformat()}).")


@api.get("/subscriptions")
async def list_subscriptions(customer_id: Optional[int] = None, status: Optional[str] = None):
    f = {}
    if customer_id is not None:
        f["CustomerID"] = customer_id
    if status:
        f["Status"] = status
    return await find("Customer_Subscriptions", f, sort=[("CustomerID", 1), ("PublicationID", 1), ("EffectiveDate", 1)])


@api.get("/subscriptions/{sid}")
async def get_subscription(sid: int):
    return await get_or_404("Customer_Subscriptions", sid, "Subscription")


async def _create_subscription(cid: int, s: CustomerSubscriptionRequest) -> dict:
    await require("Customers", cid, "Customer")
    await require("Publications", s.publication_id, "Publication")
    _check_notice(s.effective_date)
    doc = await insert(
        "Customer_Subscriptions",
        {"CustomerID": cid, "PublicationID": s.publication_id, "Quantity": s.quantity, "EffectiveDate": to_dt(s.effective_date), "Status": s.status},
    )
    return {"message": "Subscription created", **doc}


@api.post("/customers/{id}/subscriptions", status_code=201)
async def create_subscription(subscription: CustomerSubscriptionRequest, id: int = Path(...)):
    """Original endpoint. Handles many-to-many between customers and publications."""
    return await _create_subscription(id, subscription)


@api.post("/subscriptions", status_code=201)
async def create_subscription_flat(subscription: CustomerSubscriptionRequest):
    if subscription.customer_id is None:
        raise HTTPException(422, "CustomerID is required")
    return await _create_subscription(subscription.customer_id, subscription)


@api.put("/subscriptions/{sid}")
async def update_subscription(sid: int, s: CustomerSubscriptionRequest):
    cur = await get_or_404("Customer_Subscriptions", sid, "Subscription")
    await require("Publications", s.publication_id, "Publication")
    if as_date(cur["EffectiveDate"]) != s.effective_date:
        _check_notice(s.effective_date)
    await db.Customer_Subscriptions.update_one(
        {"SubscriptionID": sid},
        {"$set": {"PublicationID": s.publication_id, "Quantity": s.quantity, "EffectiveDate": to_dt(s.effective_date), "Status": s.status}},
    )
    return await get_subscription(sid)


@api.delete("/subscriptions/{sid}", status_code=204)
async def delete_subscription(sid: int):
    await get_or_404("Customer_Subscriptions", sid, "Subscription")
    await db.Customer_Subscriptions.delete_one({"SubscriptionID": sid})


# ===========================================================================
# Vacation holds
# ===========================================================================
@api.get("/vacation-holds")
async def list_holds(customer_id: Optional[int] = None, active_on: Optional[dt.date] = None):
    f = {}
    if customer_id is not None:
        f["CustomerID"] = customer_id
    if active_on is not None:
        d = to_dt(active_on)
        f["StartDate"] = {"$lte": d}
        f["EndDate"] = {"$gte": d}
    return await find("Vacation_Holds", f, sort=[("StartDate", -1)])


@api.get("/vacation-holds/{hid}")
async def get_hold(hid: int):
    return await get_or_404("Vacation_Holds", hid, "Vacation hold")


async def _drop_held_deliveries(cid: int, start: dt.date, end: dt.date) -> None:
    """A hold placed after a route sheet was prepared removes the (today/future) lines it covers."""
    lo = max(start, today())
    if lo <= end:
        await db.Daily_Deliveries.delete_many({"CustomerID": cid, "Date": {"$gte": to_dt(lo), "$lte": to_dt(end)}})


async def _create_hold(cid: int, v: VacationHoldRequest) -> dict:
    await require("Customers", cid, "Customer")
    if v.start_date > v.end_date:
        raise HTTPException(400, "Invalid vacation dates: end date is before start date.")
    if v.start_date < today():
        raise HTTPException(400, "Invalid vacation dates: a hold can't start in the past.")
    doc = await insert("Vacation_Holds", {"CustomerID": cid, "StartDate": to_dt(v.start_date), "EndDate": to_dt(v.end_date)})
    await _drop_held_deliveries(cid, v.start_date, v.end_date)
    return {"message": "Vacation hold created", **doc}


@api.post("/customers/{id}/vacations", status_code=201)
async def create_vacation_hold(vacation: VacationHoldRequest, id: int = Path(...)):
    """Original endpoint. Handles the 'out of station' requirement."""
    return await _create_hold(id, vacation)


@api.post("/vacation-holds", status_code=201)
async def create_vacation_hold_flat(vacation: VacationHoldRequest):
    if vacation.customer_id is None:
        raise HTTPException(422, "CustomerID is required")
    return await _create_hold(vacation.customer_id, vacation)


@api.put("/vacation-holds/{hid}")
async def update_hold(hid: int, v: VacationHoldRequest):
    cur = await get_or_404("Vacation_Holds", hid, "Vacation hold")
    cid = v.customer_id or cur["CustomerID"]
    await require("Customers", cid, "Customer")
    if v.start_date > v.end_date:
        raise HTTPException(400, "Invalid vacation dates: end date is before start date.")
    if v.start_date != as_date(cur["StartDate"]) and v.start_date < today():
        raise HTTPException(400, "Invalid vacation dates: a hold can't be moved to start in the past.")
    await db.Vacation_Holds.update_one({"HoldID": hid}, {"$set": {"CustomerID": cid, "StartDate": to_dt(v.start_date), "EndDate": to_dt(v.end_date)}})
    await _drop_held_deliveries(cid, v.start_date, v.end_date)
    return await get_hold(hid)


@api.delete("/vacation-holds/{hid}", status_code=204)
async def delete_hold(hid: int):
    await get_or_404("Vacation_Holds", hid, "Vacation hold")
    await db.Vacation_Holds.delete_one({"HoldID": hid})


# ===========================================================================
# Deliveries  (rules 1 + 3)
# ===========================================================================
async def _due_lines(day: dt.date) -> tuple[list[dict], int]:
    """What should be delivered on `day`: one line per (customer, publication)."""
    d = to_dt(day)
    subs = await find("Customer_Subscriptions", {"EffectiveDate": {"$lte": d}})
    # the latest subscription effective on `day` wins (a later change supersedes an earlier one)
    latest: dict[tuple, dict] = {}
    for s in subs:
        k = (s["CustomerID"], s["PublicationID"])
        if k not in latest or (s["EffectiveDate"], s["SubscriptionID"]) > (latest[k]["EffectiveDate"], latest[k]["SubscriptionID"]):
            latest[k] = s
    customers = await index("Customers")
    zones = await index("Zones")
    pubs = await index("Publications")
    held = {h["CustomerID"] for h in await find("Vacation_Holds", {"StartDate": {"$lte": d}, "EndDate": {"$gte": d}})}

    lines, skipped = [], set()
    for (cid, pid), s in latest.items():
        c = customers.get(cid)
        if s["Status"] != "Active" or not c or c.get("Status") != "Active" or pid not in pubs:
            continue  # cancelled / suspended (rule 4) / dangling reference
        if cid in held:  # rule 3
            skipped.add(cid)
            continue
        z = zones.get(c.get("ZoneID"), {})
        lines.append({
            "CustomerID": cid,
            "PublicationID": pid,
            "Quantity": int(s["Quantity"]),
            "DeliveryPersonID": z.get("DeliveryPersonID"),
            "PricePerIssue": money(pubs[pid]["PricePerIssue"]),
            "_zone": z.get("ZoneName", ""),
            "_zid": c.get("ZoneID") or 0,
            "_seq": c.get("RouteSequence") or 0,
        })
    lines.sort(key=lambda l: (l["_zid"], l["_seq"], l["PublicationID"]))  # rule 1
    return lines, len(skipped)


async def _billed_periods() -> set[tuple]:
    out = set()
    for i in await find("Monthly_Invoices"):
        covers = i.get("CoversMonth") or add_months(as_date(i["BillingMonth"]), -1).isoformat()
        out.add((i["CustomerID"], str(covers)[:10]))
    return out


@api.get("/deliveries")
async def list_deliveries(
    date: Optional[dt.date] = None,
    start: Optional[dt.date] = None,
    end: Optional[dt.date] = None,
    customer_id: Optional[int] = None,
    delivery_person_id: Optional[int] = None,
):
    f: dict = {}
    if date:
        f["Date"] = to_dt(date)
    elif start or end or customer_id is None:
        rng = {}
        rng["$gte"] = to_dt(start or (today() - dt.timedelta(days=31)))
        if end:
            rng["$lte"] = to_dt(end)
        f["Date"] = rng
    if customer_id is not None:
        f["CustomerID"] = customer_id
    if delivery_person_id is not None:
        f["DeliveryPersonID"] = delivery_person_id
    rows = await find("Daily_Deliveries", f)
    customers, zones, pubs = await index("Customers"), await index("Zones"), await index("Publications")
    for r in rows:
        c = customers.get(r["CustomerID"], {})
        z = zones.get(c.get("ZoneID"), {})
        r.update(
            CustomerName=c.get("Name"), Address=c.get("Address"), ZoneID=c.get("ZoneID"), RouteSequence=c.get("RouteSequence"),
            ZoneName=z.get("ZoneName"), PublicationName=pubs.get(r["PublicationID"], {}).get("Name"),
        )
    rows.sort(key=lambda r: (r["Date"], r.get("ZoneName") or "", r.get("RouteSequence") or 0, r.get("PublicationName") or ""))
    return rows


@api.post("/deliveries/generate")
async def generate_deliveries(date: Optional[dt.date] = None):
    """Build (or refresh) the day's Daily_Deliveries ledger, locking today's price into PriceAtDelivery."""
    day = date or today()
    d = to_dt(day)
    due, skipped = await _due_lines(day)
    existing = {(r["CustomerID"], r["PublicationID"]): r for r in await find("Daily_Deliveries", {"Date": d})}
    wanted = {(l["CustomerID"], l["PublicationID"]): l for l in due}

    new = [l for k, l in wanted.items() if k not in existing]
    ids = await next_ids("Daily_Deliveries", len(new))
    if new:
        await db.Daily_Deliveries.insert_many([
            {
                "DeliveryID": i, "Date": d, "CustomerID": l["CustomerID"], "PublicationID": l["PublicationID"],
                "DeliveryPersonID": l["DeliveryPersonID"], "QuantityDelivered": l["Quantity"],
                "PriceAtDelivery": l["PricePerIssue"], "DeliveryStatus": "Delivered",
            }
            for i, l in zip(ids, new)
        ])
    updated = 0
    for k, l in wanted.items():
        e = existing.get(k)
        if e and (int(e["QuantityDelivered"]) != l["Quantity"] or e.get("DeliveryPersonID") != l["DeliveryPersonID"]):
            # keep recorded status and locked price; refresh planned quantity / person
            await db.Daily_Deliveries.update_one({"DeliveryID": e["DeliveryID"]}, {"$set": {"QuantityDelivered": l["Quantity"], "DeliveryPersonID": l["DeliveryPersonID"]}})
            updated += 1
    removed = 0
    billed = await _billed_periods()
    for k, e in existing.items():
        if k not in wanted and (e["CustomerID"], month_start(day).isoformat()) not in billed:
            await db.Daily_Deliveries.delete_one({"DeliveryID": e["DeliveryID"]})
            removed += 1
    total = await db.Daily_Deliveries.count_documents({"Date": d})
    return {"date": day.isoformat(), "created": len(new), "updated": updated, "removed": removed, "skipped_on_hold": skipped, "total": total}


@api.get("/deliveries/routes")
async def get_delivery_route(
    delivery_person_id: Optional[int] = Query(None, alias="deliveryPersonId"),
    delivery_date: Optional[dt.date] = Query(None, alias="date"),
):
    """Original endpoint (fixed): the day's route in stop order, with what to drop at each door.
    Only customers with an active subscription are listed; suspended customers and vacation holds are skipped."""
    delivery_date = delivery_date or today()
    due, skipped = await _due_lines(delivery_date)
    if delivery_person_id is not None:
        due = [l for l in due if l["DeliveryPersonID"] == delivery_person_id]
    customers, pubs = await index("Customers"), await index("Publications")
    stops: dict[int, dict] = {}
    for l in due:
        c = customers[l["CustomerID"]]
        s = stops.setdefault(l["CustomerID"], {
            "CustomerID": c["CustomerID"], "Name": c["Name"], "Address": c["Address"], "ZoneID": c["ZoneID"],
            "ZoneName": l["_zone"], "RouteSequence": c["RouteSequence"], "DeliveryPersonID": l["DeliveryPersonID"], "Items": [],
        })
        s["Items"].append({"PublicationID": l["PublicationID"], "Name": pubs[l["PublicationID"]]["Name"], "Quantity": l["Quantity"]})
    return {"date": delivery_date.isoformat(), "route": list(stops.values()), "skipped_on_hold": skipped}


@api.put("/deliveries/batch-update")
async def batch_update_deliveries(payload: BatchDeliveryUpdateRequest):
    """Original endpoint. Updates delivery statuses in one call."""
    if not payload.updates:
        raise HTTPException(400, "No updates provided.")
    from pymongo import UpdateOne

    ids = [u.delivery_id for u in payload.updates]
    found = {d["DeliveryID"] for d in await find("Daily_Deliveries", {"DeliveryID": {"$in": ids}})}
    missing = [i for i in ids if i not in found]
    ops = [UpdateOne({"DeliveryID": u.delivery_id}, {"$set": {"DeliveryStatus": u.status}}) for u in payload.updates if u.delivery_id in found]
    modified = (await db.Daily_Deliveries.bulk_write(ops)).modified_count if ops else 0
    if missing and not ops:
        raise HTTPException(404, f"Delivery #{', #'.join(map(str, missing))} not found")
    return {"message": "Batch update successful", "modified_count": modified, "missing": missing}


@api.put("/deliveries/{did}")
async def update_delivery(did: int, u: DeliveryUpdate):
    await get_or_404("Daily_Deliveries", did, "Delivery")
    upd = {}
    if u.status:
        upd["DeliveryStatus"] = u.status
    if u.quantity is not None:
        upd["QuantityDelivered"] = u.quantity
    if upd:
        await db.Daily_Deliveries.update_one({"DeliveryID": did}, {"$set": upd})
    return await find_one("Daily_Deliveries", {"DeliveryID": did})


# ===========================================================================
# Invoices & payments
# ===========================================================================
def _allocate(invoices: list[dict], paid_total: float) -> dict[int, float]:
    """Apply a customer's payments to invoices oldest-first."""
    left, out = paid_total, {}
    for inv in sorted(invoices, key=lambda i: (str(i["BillingMonth"]), i["InvoiceID"])):
        take = min(money(inv["TotalAmount"]), max(0.0, left))
        out[inv["InvoiceID"]] = money(take)
        left -= take
    return out


def _status_for(total: float, paid: float) -> str:
    if total <= 0.004 or paid >= total - 0.004:
        return "Paid"
    return "Partial" if paid > 0.004 else "Unpaid"


async def _payments_by_customer(cids: list[int] | None = None) -> dict[int, float]:
    f = {"CustomerID": {"$in": cids}} if cids is not None else {}
    tot: dict[int, float] = defaultdict(float)
    for p in await find("Payments", f):
        tot[p["CustomerID"]] += float(p["AmountPaid"] or 0)
    return tot


async def refresh_payment_status(cids: list[int] | None = None) -> None:
    f = {"CustomerID": {"$in": cids}} if cids is not None else {}
    invs = await find("Monthly_Invoices", f)
    pays = await _payments_by_customer(cids)
    by_c = defaultdict(list)
    for i in invs:
        by_c[i["CustomerID"]].append(i)
    for cid, lst in by_c.items():
        alloc = _allocate(lst, pays.get(cid, 0.0))
        for i in lst:
            st = _status_for(money(i["TotalAmount"]), alloc[i["InvoiceID"]])
            if st != i["PaymentStatus"]:
                await db.Monthly_Invoices.update_one({"InvoiceID": i["InvoiceID"]}, {"$set": {"PaymentStatus": st}})


async def _decorate(invs: list[dict]) -> list[dict]:
    """Add AmountPaid / Balance / DaysOutstanding / CoversMonth (computed, not stored)."""
    if not invs:
        return invs
    cids = sorted({i["CustomerID"] for i in invs})
    every = await find("Monthly_Invoices", {"CustomerID": {"$in": cids}})
    pays = await _payments_by_customer(cids)
    by_c = defaultdict(list)
    for i in every:
        by_c[i["CustomerID"]].append(i)
    alloc = {}
    for cid, lst in by_c.items():
        alloc.update(_allocate(lst, pays.get(cid, 0.0)))
    t = today()
    for i in invs:
        paid = alloc.get(i["InvoiceID"], 0.0)
        issued = as_date(i["BillingMonth"])
        i["AmountPaid"] = paid
        i["Balance"] = money(money(i["TotalAmount"]) - paid)
        i["CoversMonth"] = i.get("CoversMonth") or add_months(issued, -1).isoformat()
        i["DaysOutstanding"] = max(0, (t - issued).days) if i["PaymentStatus"] != "Paid" else 0
        i["ReminderSent"] = bool(i.get("ReminderSent"))
    return invs


@api.get("/invoices")
async def list_invoices(month: Optional[dt.date] = None, status: Optional[str] = None, customer_id: Optional[int] = None):
    f: dict = {}
    if month:
        f["BillingMonth"] = to_dt(month_start(month))
    if status:
        f["PaymentStatus"] = status
    if customer_id is not None:
        f["CustomerID"] = customer_id
    return await _decorate(await find("Monthly_Invoices", f, sort=[("BillingMonth", -1), ("CustomerID", 1)]))


@api.get("/invoices/{iid}")
async def get_invoice(iid: int):
    inv = (await _decorate([await get_or_404("Monthly_Invoices", iid, "Invoice")]))[0]
    pubs = await index("Publications")
    items = await find("Invoice_Line_Items", {"InvoiceID": iid})
    for li in items:
        p = pubs.get(li["PublicationID"], {})
        li["PublicationName"], li["Type"] = p.get("Name"), p.get("Type")
    inv["LineItems"] = sorted(items, key=lambda x: x.get("PublicationName") or "")
    return inv


@api.post("/invoices/generate-monthly", status_code=201)
async def generate_monthly_invoices(payload: GenerateInvoicesRequest):
    """Original endpoint (fixed). Invoices dated the 1st of `month` bill the previous month's delivered copies.
    Safe to re-run: an existing invoice for the same customer + month is recalculated, not duplicated."""
    billing_month = month_start(payload.month or today())
    period_start = add_months(billing_month, -1)
    rows = await find("Daily_Deliveries", {
        "DeliveryStatus": "Delivered",
        "Date": {"$gte": to_dt(period_start), "$lt": to_dt(billing_month)},
    })
    per_c: dict[int, dict[int, dict]] = defaultdict(lambda: defaultdict(lambda: {"copies": 0, "total": 0.0}))
    for r in rows:
        li = per_c[r["CustomerID"]][r["PublicationID"]]
        li["copies"] += int(r["QuantityDelivered"])
        li["total"] += int(r["QuantityDelivered"]) * float(r["PriceAtDelivery"])

    created = updated = 0
    for cid, lines in per_c.items():
        total = money(sum(l["total"] for l in lines.values()))
        existing = await db.Monthly_Invoices.find_one({"CustomerID": cid, "BillingMonth": to_dt(billing_month)})
        if existing:
            iid = existing["InvoiceID"]
            await db.Monthly_Invoices.update_one({"InvoiceID": iid}, {"$set": {"TotalAmount": total, "CoversMonth": period_start.isoformat()}})
            await db.Invoice_Line_Items.delete_many({"InvoiceID": iid})
            updated += 1
        else:
            iid = (await insert("Monthly_Invoices", {
                "CustomerID": cid, "BillingMonth": to_dt(billing_month), "CoversMonth": period_start.isoformat(),
                "TotalAmount": total, "PaymentStatus": "Unpaid", "ReminderSent": False,
            }))["InvoiceID"]
            created += 1
        line_ids = await next_ids("Invoice_Line_Items", len(lines))
        await db.Invoice_Line_Items.insert_many([
            {"LineItemID": lid, "InvoiceID": iid, "PublicationID": pid, "TotalCopies": l["copies"], "LineTotal": money(l["total"])}
            for lid, (pid, l) in zip(line_ids, lines.items())
        ])
    await refresh_payment_status(list(per_c.keys()))
    return {
        "message": f"Successfully generated {created} invoices." + (f" Recalculated {updated}." if updated else ""),
        "month": billing_month.isoformat(), "covers": period_start.isoformat(),
        "created": created, "updated": updated, "count": created + updated,
    }


@api.post("/invoices/{iid}/reminder")
async def mark_reminder(iid: int):
    await get_or_404("Monthly_Invoices", iid, "Invoice")
    await db.Monthly_Invoices.update_one({"InvoiceID": iid}, {"$set": {"ReminderSent": True}})
    return await get_invoice(iid)


@api.get("/payments")
async def list_payments(customer_id: Optional[int] = None):
    f = {"CustomerID": customer_id} if customer_id is not None else {}
    return await find("Payments", f, sort=[("PaymentDate", -1), ("PaymentID", -1)])


@api.get("/payments/{pid}")
async def get_payment(pid: int):
    return await get_or_404("Payments", pid, "Payment")


async def _reactivate_if_cleared(cid: int) -> bool:
    """A customer suspended for dues goes back to Active once nothing is overdue any more."""
    c = await find_one("Customers", {"CustomerID": cid})
    if not c or c.get("Status") != "Suspended":
        return False
    limit = to_dt(today() - dt.timedelta(days=SUSPEND_AFTER_DAYS))
    if await db.Monthly_Invoices.count_documents({"CustomerID": cid, "PaymentStatus": {"$in": ["Unpaid", "Partial"]}, "BillingMonth": {"$lt": limit}}):
        return False
    await db.Customers.update_one({"CustomerID": cid}, {"$set": {"Status": "Active"}})
    return True


@api.post("/payments", status_code=201)
async def record_payment(payment: PaymentRequest):
    """Original endpoint (fixed). Records a receipt and settles invoices oldest-first."""
    await require("Customers", payment.customer_id, "Customer")
    pay_date = payment.payment_date or today()
    if pay_date > today():
        raise HTTPException(400, "Payment date can't be in the future.")
    ref = (payment.reference or "").strip()
    if payment.method == "Cheque" and not ref:
        raise HTTPException(400, "Cheque payments need the cheque number as the reference.")

    # Guard: reject if payment amount exceeds the customer's total outstanding dues
    all_invs = await find("Monthly_Invoices", {"CustomerID": payment.customer_id})
    open_invs = [i for i in all_invs if i.get("PaymentStatus") in ("Unpaid", "Partial")]
    already_paid = await _payments_by_customer([payment.customer_id])
    alloc_so_far = _allocate(all_invs, already_paid.get(payment.customer_id, 0.0))
    total_outstanding = money(sum(
        money(i["TotalAmount"]) - alloc_so_far.get(i["InvoiceID"], 0.0)
        for i in open_invs
    ))
    if total_outstanding <= 0.004:
        raise HTTPException(400, "This customer has no outstanding dues to record a payment against.")
    if money(payment.amount) > total_outstanding + 0.004:
        raise HTTPException(
            400,
            f"Payment of ₹{payment.amount:.2f} exceeds the outstanding due of ₹{total_outstanding:.2f}. "
            "Only record the amount actually owed."
        )

    before = {i["InvoiceID"]: i["PaymentStatus"] for i in all_invs}
    doc = await insert("Payments", {
        "CustomerID": payment.customer_id, "AmountPaid": money(payment.amount), "PaymentDate": to_dt(pay_date),
        "Method": payment.method, "ReferenceNumber": ref or None,
    })
    await refresh_payment_status([payment.customer_id])
    after = await find("Monthly_Invoices", {"CustomerID": payment.customer_id})
    applied = [{"InvoiceID": i["InvoiceID"], "PaymentStatus": i["PaymentStatus"]} for i in after if before.get(i["InvoiceID"]) != i["PaymentStatus"]]
    reactivated = await _reactivate_if_cleared(payment.customer_id)
    return {"message": "Payment recorded", **doc, "AppliedToInvoices": applied, "CustomerReactivated": reactivated}


@api.delete("/payments/{pid}", status_code=204)
async def delete_payment(pid: int):
    p = await get_or_404("Payments", pid, "Payment")
    await db.Payments.delete_one({"PaymentID": pid})
    await refresh_payment_status([p["CustomerID"]])


# ===========================================================================
# System: overdue processing  (rule 4)
# ===========================================================================
@api.post("/system/process-overdues")
async def process_overdues():
    """Original endpoint (fixed).
    > 30 days unpaid/partial: ReminderSent = True
    > 60 days unpaid/partial: Customers.Status = 'Suspended'"""
    t = today()
    open_ = {"$in": ["Unpaid", "Partial"]}
    reminder = await db.Monthly_Invoices.update_many(
        {"BillingMonth": {"$lte": to_dt(t - dt.timedelta(days=REMINDER_AFTER_DAYS))}, "PaymentStatus": open_, "ReminderSent": {"$ne": True}},
        {"$set": {"ReminderSent": True}},
    )
    overdue = await find("Monthly_Invoices", {"BillingMonth": {"$lt": to_dt(t - dt.timedelta(days=SUSPEND_AFTER_DAYS))}, "PaymentStatus": open_})
    ids = sorted({i["CustomerID"] for i in overdue})
    suspended = await find("Customers", {"CustomerID": {"$in": ids}, "Status": "Active"})
    if suspended:
        await db.Customers.update_many({"CustomerID": {"$in": [c["CustomerID"] for c in suspended]}}, {"$set": {"Status": "Suspended"}})
    return {
        "message": "Overdues processed successfully.",
        "reminders_flagged": reminder.modified_count,
        "accounts_suspended": len(suspended),
        "customers": [{"CustomerID": c["CustomerID"], "Name": c["Name"]} for c in suspended],
    }


# ===========================================================================
# Customer self-service  (/api/me/*)
# ===========================================================================
@api.get("/me/overdue")
async def my_overdue(user: dict = Depends(require_role("customer"))):
    cid = user.get("LinkedID")
    if not cid:
        raise HTTPException(400, "Your account is not linked to a customer record.")
    
    customer = await find_one("Customers", {"CustomerID": cid})
    all_invs = await find("Monthly_Invoices", {"CustomerID": cid})
    decorated = await _decorate(all_invs)
    open_invs = [i for i in decorated if i["PaymentStatus"] != "Paid"]
    total_overdue = money(sum(i["Balance"] for i in open_invs))
    
    return {
        "customer": customer,
        "invoices": sorted(open_invs, key=lambda i: i["BillingMonth"]),
        "total_overdue": total_overdue,
    }


@api.get("/me/subscriptions")
async def my_subscriptions(user: dict = Depends(require_role("customer"))):
    cid = user.get("LinkedID")
    if not cid:
        raise HTTPException(400, "Your account is not linked to a customer record.")
    pubs = await index("Publications")
    subs = await find("Customer_Subscriptions", {"CustomerID": cid})
    for s in subs:
        p = pubs.get(s["PublicationID"], {})
        s["PublicationName"] = p.get("Name")
        s["PublicationType"] = p.get("Type")
        s["PricePerIssue"] = p.get("PricePerIssue")
    return subs


@api.get("/me/vacation-holds")
async def my_vacation_holds(user: dict = Depends(require_role("customer"))):
    cid = user.get("LinkedID")
    if not cid:
        raise HTTPException(400, "Your account is not linked to a customer record.")
    return await find("Vacation_Holds", {"CustomerID": cid}, sort=[("StartDate", -1)])


@api.post("/me/vacation-holds", status_code=201)
async def my_create_vacation_hold(v: VacationHoldRequest, user: dict = Depends(require_role("customer"))):
    cid = user.get("LinkedID")
    if not cid:
        raise HTTPException(400, "Your account is not linked to a customer record.")
    v.customer_id = cid
    return await _create_hold(cid, v)


# ===========================================================================
# Payment Requests  (customer submits → manager verifies)
# ===========================================================================
@api.get("/me/payment-requests")
async def my_payment_requests(user: dict = Depends(require_role("customer"))):
    cid = user.get("LinkedID")
    if not cid:
        raise HTTPException(400, "Your account is not linked to a customer record.")
    reqs = await find("Payment_Requests", {"CustomerID": cid}, sort=[("CreatedAt", -1)])
    return reqs


@api.post("/me/payment-requests", status_code=201)
async def create_payment_request(req: PaymentVerificationRequest, user: dict = Depends(require_role("customer"))):
    cid = user.get("LinkedID")
    if not cid:
        raise HTTPException(400, "Your account is not linked to a customer record.")
    if req.customer_id != cid:
        raise HTTPException(403, "You can only submit payment requests for your own account.")
    
    # Check total overdue
    all_invs = await find("Monthly_Invoices", {"CustomerID": cid})
    decorated = await _decorate(all_invs)
    open_invs = [i for i in decorated if i["PaymentStatus"] != "Paid"]
    total_overdue = money(sum(i["Balance"] for i in open_invs))
    
    if total_overdue <= 0.004:
        raise HTTPException(400, "You have no outstanding dues.")
    if money(req.amount) > total_overdue + 0.004:
        raise HTTPException(
            400,
            f"Payment amount ₹{req.amount:.2f} exceeds your total overdue of ₹{total_overdue:.2f}. "
            "You can only submit a request within your outstanding balance."
        )
    
    # Check for existing pending request
    pending = await db.Payment_Requests.find_one({"CustomerID": cid, "Status": "pending"})
    if pending:
        raise HTTPException(400, "You already have a pending payment request. Please wait for the manager to review it.")
    
    doc = await insert("Payment_Requests", {
        "CustomerID": cid,
        "Amount": money(req.amount),
        "ReferenceNumber": req.reference_number.strip(),
        "Status": "pending",
        "ManagerNote": "",
        "CreatedAt": dt.datetime.utcnow(),
        "UpdatedAt": dt.datetime.utcnow(),
    })
    return {"message": "Payment request submitted. The manager will verify your reference number.", **doc}


@api.get("/payment-requests")
async def list_payment_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    user: dict = Depends(require_role("manager")),
):
    f = {}
    if status_filter:
        f["Status"] = status_filter
    reqs = await find("Payment_Requests", f, sort=[("CreatedAt", -1)])
    # Attach customer names
    customers = await index("Customers")
    for r in reqs:
        c = customers.get(r["CustomerID"], {})
        r["CustomerName"] = c.get("Name", f"#{r['CustomerID']}")
    return reqs


@api.put("/payment-requests/{rid}")
async def review_payment_request(rid: int, action: PaymentVerificationAction, user: dict = Depends(require_role("manager"))):
    req = await find_one("Payment_Requests", {"RequestID": rid})
    if not req:
        raise HTTPException(404, f"Payment request #{rid} not found")
    if req["Status"] != "pending":
        raise HTTPException(400, f"This request has already been {req['Status']}.")
    
    now = dt.datetime.utcnow()
    
    if action.status == "accepted":
        # Create actual payment record and allocate to invoices
        cid = req["CustomerID"]
        pay_date = dt.date.today()
        
        # Double-check overdue hasn't changed
        all_invs = await find("Monthly_Invoices", {"CustomerID": cid})
        open_invs = [i for i in all_invs if i.get("PaymentStatus") in ("Unpaid", "Partial")]
        already_paid = await _payments_by_customer([cid])
        alloc_so_far = _allocate(all_invs, already_paid.get(cid, 0.0))
        total_outstanding = money(sum(
            money(i["TotalAmount"]) - alloc_so_far.get(i["InvoiceID"], 0.0)
            for i in open_invs
        ))
        
        amount = min(money(req["Amount"]), total_outstanding)
        if amount <= 0.004:
            # Customer no longer has dues
            await db.Payment_Requests.update_one(
                {"RequestID": rid},
                {"$set": {"Status": "rejected", "ManagerNote": "Customer has no outstanding dues.", "UpdatedAt": now}}
            )
            return {"message": "Rejected — customer has no outstanding dues.", "status": "rejected"}
        
        # Record the payment (method = Online since it's an inline payment reference)
        payment_doc = await insert("Payments", {
            "CustomerID": cid,
            "AmountPaid": amount,
            "PaymentDate": to_dt(pay_date),
            "Method": "Online",
            "ReferenceNumber": req["ReferenceNumber"],
        })
        await refresh_payment_status([cid])
        reactivated = await _reactivate_if_cleared(cid)
        
        await db.Payment_Requests.update_one(
            {"RequestID": rid},
            {"$set": {
                "Status": "accepted",
                "ManagerNote": (action.note or "Payment verified and accepted.").strip(),
                "UpdatedAt": now,
                "PaymentID": payment_doc["PaymentID"],
            }}
        )
        return {
            "message": "Payment request accepted. Payment recorded and allocated to invoices.",
            "status": "accepted",
            "PaymentID": payment_doc["PaymentID"],
            "CustomerReactivated": reactivated,
        }
    else:
        # Rejected
        await db.Payment_Requests.update_one(
            {"RequestID": rid},
            {"$set": {
                "Status": "rejected",
                "ManagerNote": (action.note or "Payment reference could not be verified.").strip(),
                "UpdatedAt": now,
            }}
        )
        return {"message": "Payment request rejected.", "status": "rejected"}


# ===========================================================================
# Delivery staff self-service  (/api/my-deliveries)
# ===========================================================================
@api.get("/my-deliveries")
async def my_deliveries(
    delivery_date: Optional[dt.date] = Query(None, alias="date"),
    user: dict = Depends(require_role("delivery_staff")),
):
    dpid = user.get("LinkedID")
    if not dpid:
        raise HTTPException(400, "Your account is not linked to a delivery person record.")
    
    day = delivery_date or today()
    d = to_dt(day)
    rows = await find("Daily_Deliveries", {"Date": d, "DeliveryPersonID": dpid})
    customers = await index("Customers")
    zones = await index("Zones")
    pubs = await index("Publications")
    
    for r in rows:
        c = customers.get(r["CustomerID"], {})
        z = zones.get(c.get("ZoneID"), {})
        r.update(
            CustomerName=c.get("Name"),
            Address=c.get("Address"),
            ZoneID=c.get("ZoneID"),
            RouteSequence=c.get("RouteSequence"),
            ZoneName=z.get("ZoneName"),
            PublicationName=pubs.get(r["PublicationID"], {}).get("Name"),
        )
    rows.sort(key=lambda r: (r.get("ZoneName") or "", r.get("RouteSequence") or 0, r.get("PublicationName") or ""))
    
    # Get delivery person info
    person = await find_one("Delivery_Persons", {"DeliveryPersonID": dpid})
    
    return {
        "date": day.isoformat(),
        "delivery_person": person,
        "deliveries": rows,
        "total": len(rows),
        "delivered": sum(1 for r in rows if r.get("DeliveryStatus") == "Delivered"),
        "failed": sum(1 for r in rows if r.get("DeliveryStatus") == "Failed"),
    }


@api.put("/my-deliveries/batch-update")
async def my_batch_update(payload: BatchDeliveryUpdateRequest, user: dict = Depends(require_role("delivery_staff"))):
    dpid = user.get("LinkedID")
    if not dpid:
        raise HTTPException(400, "Your account is not linked to a delivery person record.")
    
    if not payload.updates:
        raise HTTPException(400, "No updates provided.")
    
    from pymongo import UpdateOne
    ids = [u.delivery_id for u in payload.updates]
    # Only allow updating deliveries assigned to this person
    found = {d["DeliveryID"] for d in await find("Daily_Deliveries", {"DeliveryID": {"$in": ids}, "DeliveryPersonID": dpid})}
    unauthorized = [i for i in ids if i not in found]
    if unauthorized:
        raise HTTPException(403, f"Delivery #{', #'.join(map(str, unauthorized))} is not assigned to you.")
    
    ops = [UpdateOne({"DeliveryID": u.delivery_id}, {"$set": {"DeliveryStatus": u.status}}) for u in payload.updates if u.delivery_id in found]
    modified = (await db.Daily_Deliveries.bulk_write(ops)).modified_count if ops else 0
    return {"message": "Batch update successful", "modified_count": modified}



# ===========================================================================
# Reports
# ===========================================================================
def _month_range(year: int, month: int) -> tuple[dt.datetime, dt.datetime]:
    if not 1 <= month <= 12:
        raise HTTPException(422, "month must be 1–12")
    start = dt.date(year, month, 1)
    return to_dt(start), to_dt(add_months(start, 1))


@api.get("/reports/commissions")
async def get_commissions(year: int = Query(...), month: int = Query(...)):
    """Original endpoint (fixed). Commission = SUM(QuantityDelivered × PriceAtDelivery) × CommissionRate%."""
    lo, hi = _month_range(year, month)
    rows = await find("Daily_Deliveries", {"DeliveryStatus": "Delivered", "Date": {"$gte": lo, "$lt": hi}})
    persons = await index("Delivery_Persons")
    agg: dict = defaultdict(lambda: {"value": 0.0, "copies": 0, "stops": set()})
    for r in rows:
        a = agg[r.get("DeliveryPersonID")]
        a["value"] += int(r["QuantityDelivered"]) * float(r["PriceAtDelivery"])
        a["copies"] += int(r["QuantityDelivered"])
        a["stops"].add((r["Date"], r["CustomerID"]))
    out = []
    for pid, a in agg.items():
        p = persons.get(pid)
        if not p:
            continue
        rate = float(p.get("CommissionRate") or 0)
        value = money(a["value"])
        commission = money(value * rate * 0.01)
        out.append({
            "DeliveryPersonID": pid, "Name": p["Name"], "CommissionRate": rate,
            "Deliveries": len(a["stops"]), "Copies": a["copies"],
            "GrossValue": value, "Commission": commission,
            "TotalDeliveryValue": value, "CommissionEarned": commission,  # original field names
        })
    out.sort(key=lambda r: r["Name"])
    return {"month": f"{year}-{month:02d}", "commissions": out}


@api.get("/reports/agency-summary")
async def get_agency_summary(year: int = Query(...), month: int = Query(...)):
    """Original endpoint. Monthly operations and financial statistics."""
    lo, hi = _month_range(year, month)
    delivered = await find("Daily_Deliveries", {"Date": {"$gte": lo, "$lt": hi}, "DeliveryStatus": "Delivered"})
    billed = await find("Monthly_Invoices", {"BillingMonth": {"$gte": lo, "$lt": hi}})
    paid = await find("Payments", {"PaymentDate": {"$gte": lo, "$lt": hi}})
    return {
        "period": f"{year}-{month:02d}",
        "metrics": {
            "total_successful_deliveries": len(delivered),
            "total_copies_delivered": sum(int(r["QuantityDelivered"]) for r in delivered),
            "total_delivery_value": money(sum(int(r["QuantityDelivered"]) * float(r["PriceAtDelivery"]) for r in delivered)),
            "total_amount_billed": money(sum(float(i["TotalAmount"]) for i in billed)),
            "total_payments_collected": money(sum(float(p["AmountPaid"]) for p in paid)),
            "current_active_customers": await db.Customers.count_documents({"Status": "Active"}),
        },
    }


@api.get("/reports/dashboard")
async def dashboard():
    t = today()
    td = to_dt(t)
    customers = await find("Customers")
    due, _ = await _due_lines(t)
    today_rows = await find("Daily_Deliveries", {"Date": td})
    mtd = await find("Daily_Deliveries", {"Date": {"$gte": to_dt(month_start(t)), "$lte": td}, "DeliveryStatus": "Delivered"})

    invs = await _decorate(await find("Monthly_Invoices"))
    by_m = defaultdict(lambda: {"billed": 0.0, "collected": 0.0})
    for i in invs:
        k = str(i["BillingMonth"])[:10]
        by_m[k]["billed"] += money(i["TotalAmount"])
        by_m[k]["collected"] += i["AmountPaid"]
    open_invs = [i for i in invs if i["PaymentStatus"] != "Paid"]
    overdue = sorted([i for i in open_invs if i["DaysOutstanding"] > SUSPEND_AFTER_DAYS], key=lambda i: -i["DaysOutstanding"])
    cmap = {c["CustomerID"]: c for c in customers}

    start14 = t - dt.timedelta(days=13)
    log = defaultdict(lambda: {"copies": 0, "failed": 0})
    for r in await find("Daily_Deliveries", {"Date": {"$gte": to_dt(start14), "$lte": td}}):
        if r["DeliveryStatus"] == "Delivered":
            log[r["Date"]]["copies"] += int(r["QuantityDelivered"])
        else:
            log[r["Date"]]["failed"] += 1

    pubs = await index("Publications")
    mix = defaultdict(int)
    for l in due:
        mix[l["PublicationID"]] += l["Quantity"]
    zones = await find("Zones")
    active_per_zone = defaultdict(int)
    for c in customers:
        if c.get("Status") == "Active":
            active_per_zone[c.get("ZoneID")] += 1
    on_hold = {h["CustomerID"] for h in await find("Vacation_Holds", {"StartDate": {"$lte": td}, "EndDate": {"$gte": td}})}

    return {
        "date": t.isoformat(),
        "customers": {
            "total": len(customers),
            "active": sum(1 for c in customers if c.get("Status") == "Active"),
            "suspended": sum(1 for c in customers if c.get("Status") == "Suspended"),
        },
        "zones": len(zones),
        "subscriptions_active": await db.Customer_Subscriptions.count_documents({"Status": "Active"}),
        "copies_per_day": sum(l["Quantity"] for l in due),
        "on_hold_today": len(on_hold),
        "today": {
            "generated": bool(today_rows),
            "stops": len({r["CustomerID"] for r in today_rows}),
            "copies": sum(int(r["QuantityDelivered"]) for r in today_rows if r["DeliveryStatus"] == "Delivered"),
            "failed": sum(1 for r in today_rows if r["DeliveryStatus"] == "Failed"),
        },
        "month_to_date_value": money(sum(int(r["QuantityDelivered"]) * float(r["PriceAtDelivery"]) for r in mtd)),
        "outstanding": money(sum(i["Balance"] for i in open_invs)),
        "overdue_count": len(overdue),
        "overdue": [
            {
                "InvoiceID": i["InvoiceID"], "CustomerID": i["CustomerID"],
                "Name": cmap.get(i["CustomerID"], {}).get("Name", f"#{i['CustomerID']}"),
                "Status": cmap.get(i["CustomerID"], {}).get("Status"),
                "BillingMonth": i["BillingMonth"], "balance": i["Balance"], "days": i["DaysOutstanding"],
            }
            for i in overdue[:8]
        ],
        "revenue_by_month": [{"month": k, "billed": money(v["billed"]), "collected": money(v["collected"])} for k, v in sorted(by_m.items())][-12:],
        "deliveries_by_day": [
            {"date": (start14 + dt.timedelta(days=n)).isoformat(), **log[(start14 + dt.timedelta(days=n)).isoformat()]} for n in range(14)
        ],
        "publication_mix": sorted(
            [{"PublicationID": k, "Name": pubs.get(k, {}).get("Name", f"#{k}"), "copies": v} for k, v in mix.items()], key=lambda x: -x["copies"]
        ),
        "zone_load": sorted(
            [{"ZoneID": z["ZoneID"], "ZoneName": z["ZoneName"], "stops": active_per_zone.get(z["ZoneID"], 0)} for z in zones], key=lambda z: -z["stops"]
        ),
    }


app.include_router(api)
