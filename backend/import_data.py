"""
Load your datasets into MongoDB (collections named after the schema tables).

    python import_data.py path/to/datasets            # folder of CSV / XLSX files
    python import_data.py path/to/agency.xlsx          # one workbook, one sheet per table
    python import_data.py path/to/datasets --reset     # wipe all tables first

File / sheet names are matched to tables loosely, e.g. any of
  customers.csv · Customers.xlsx · customer_subscriptions.csv · subscriptions.csv
  delivery_persons.csv · deliverypersons.csv · daily_deliveries.csv · deliveries.csv …
Column headers are matched case- and underscore-insensitively to the schema
(CustomerID, customer_id and "Customer Id" all work). ID columns are kept when
present so references line up; if they're missing, IDs are auto-assigned.
Uses MONGO_URL / MONGO_DB from backend/.env.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import datetime as dt
import re
import sys
from pathlib import Path

import db as store

# table -> (aliases, columns in insert order, primary key)
TABLES: list[tuple[str, list[str], list[str], str]] = [
    ("Delivery_Persons", ["deliverypersons", "deliveryperson", "deliveryboys", "staff", "deliverystaff"],
     ["DeliveryPersonID", "Name", "ContactNumber", "CommissionRate"], "DeliveryPersonID"),
    ("Zones", ["zones", "zone", "routes"], ["ZoneID", "ZoneName", "DeliveryPersonID"], "ZoneID"),
    ("Customers", ["customers", "customer"], ["CustomerID", "Name", "Address", "ZoneID", "RouteSequence", "Status"], "CustomerID"),
    ("Publications", ["publications", "publication", "papers", "newspapers"], ["PublicationID", "Name", "Type", "PricePerIssue"], "PublicationID"),
    ("Customer_Subscriptions", ["customersubscriptions", "subscriptions", "subscription"],
     ["SubscriptionID", "CustomerID", "PublicationID", "Quantity", "EffectiveDate", "Status"], "SubscriptionID"),
    ("Vacation_Holds", ["vacationholds", "holds", "vacations"], ["HoldID", "CustomerID", "StartDate", "EndDate"], "HoldID"),
    ("Daily_Deliveries", ["dailydeliveries", "deliveries", "delivery"],
     ["DeliveryID", "Date", "CustomerID", "PublicationID", "DeliveryPersonID", "QuantityDelivered", "PriceAtDelivery", "DeliveryStatus"], "DeliveryID"),
    ("Monthly_Invoices", ["monthlyinvoices", "invoices", "invoice"],
     ["InvoiceID", "CustomerID", "BillingMonth", "TotalAmount", "PaymentStatus", "ReminderSent"], "InvoiceID"),
    ("Invoice_Line_Items", ["invoicelineitems", "lineitems", "invoiceitems"],
     ["LineItemID", "InvoiceID", "PublicationID", "TotalCopies", "LineTotal"], "LineItemID"),
    ("Payments", ["payments", "payment", "receipts"],
     ["PaymentID", "CustomerID", "AmountPaid", "PaymentDate", "Method", "ReferenceNumber"], "PaymentID"),
]
DATE_COLS = {"EffectiveDate", "StartDate", "EndDate", "Date", "BillingMonth", "PaymentDate"}
INT_COLS = {"Quantity", "RouteSequence", "QuantityDelivered", "TotalCopies"}
NUM_COLS = {"CommissionRate", "PricePerIssue", "PriceAtDelivery", "TotalAmount", "LineTotal", "AmountPaid"}
ENUMS = {
    "Status": {"active": "Active", "suspended": "Suspended", "cancelled": "Cancelled", "canceled": "Cancelled", "inactive": "Suspended"},
    "Type": {"newspaper": "Newspaper", "magazine": "Magazine", "paper": "Newspaper"},
    "DeliveryStatus": {"delivered": "Delivered", "failed": "Failed", "yes": "Delivered", "no": "Failed"},
    "PaymentStatus": {"unpaid": "Unpaid", "partial": "Partial", "paid": "Paid"},
    "Method": {"cash": "Cash", "cheque": "Cheque", "check": "Cheque"},
}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def match_table(name: str):
    n = norm(Path(name).stem)
    for t in TABLES:
        if n == norm(t[0]) or n in t[1]:
            return t
    for t in TABLES:  # looser: file name contains an alias
        if any(a in n for a in [norm(t[0])] + t[1]):
            return t
    return None


def parse_date(v):
    if v in (None, ""):
        return None
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d.%m.%Y", "%Y/%m/%d", "%d-%b-%Y", "%d %b %Y", "%b %Y", "%Y-%m"):
        try:
            return dt.datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f"unrecognised date {s!r}")


def coerce(col: str, v):
    if v is None or (isinstance(v, str) and v.strip() == ""):
        return None
    if col in DATE_COLS:
        d = parse_date(v)
        return store.to_dt(d[:8] + "01" if col == "BillingMonth" else d)  # BSON has no date type
    if col.endswith("ID") or col in INT_COLS:
        return int(float(str(v).replace(",", "")))
    if col in NUM_COLS:
        return round(float(str(v).replace(",", "").replace("₹", "").replace("%", "").strip()), 4)
    if col == "ReminderSent":
        return str(v).strip().lower() in ("1", "true", "yes", "y", "t")
    if col in ENUMS:
        return ENUMS[col].get(str(v).strip().lower(), str(v).strip())
    return str(v).strip()


def read_rows(path: Path, sheet=None) -> list[dict]:
    if path.suffix.lower() in (".csv", ".tsv", ".txt"):
        with path.open(newline="", encoding="utf-8-sig") as f:
            sample = f.read(4096)
            f.seek(0)
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|") if sample else csv.excel
            return list(csv.DictReader(f, dialect=dialect))
    import openpyxl  # xlsx support

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet] if sheet else wb.active
    it = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(it, [])]
    return [dict(zip(header, r)) for r in it if any(c not in (None, "") for c in r)]


def collect(src: Path) -> dict[str, list[dict]]:
    found: dict[str, list[dict]] = {}
    if src.is_file() and src.suffix.lower() in (".xlsx", ".xlsm"):
        import openpyxl

        for sheet in openpyxl.load_workbook(src, read_only=True).sheetnames:
            t = match_table(sheet)
            if t:
                found.setdefault(t[0], []).extend(read_rows(src, sheet))
            else:
                print(f"  ! skipped sheet {sheet!r} (no matching table)")
        return found
    files = [src] if src.is_file() else sorted(p for p in src.iterdir() if p.suffix.lower() in (".csv", ".tsv", ".txt", ".xlsx", ".xlsm"))
    for p in files:
        t = match_table(p.name)
        if t:
            found.setdefault(t[0], []).extend(read_rows(p))
            print(f"  · {p.name} → {t[0]}")
        else:
            print(f"  ! skipped {p.name} (no matching table)")
    return found


async def run(src: Path, reset: bool, database=None) -> None:
    import main as api  # reuse the API's counters + invoice-status logic

    client = None
    if database is None:  # create the Motor client inside the running event loop
        client = store.get_client()
        database = client[store.MONGO_DB]
    try:
        await _load(api, src, reset, database)
    finally:
        if client is not None:
            client.close()


async def _load(api, src: Path, reset: bool, database) -> None:
    api.db = database
    print(f"Reading {src} …")
    data = collect(src)
    if not data:
        sys.exit("No files matched any table. Name files after tables, e.g. customers.csv, publications.csv.")
    if reset:
        for name, *_ in TABLES:
            await database[name].delete_many({})
        await database.Counters.delete_many({})
        print("  existing documents cleared")

    for name, _aliases, cols, pk in TABLES:
        rows = data.get(name)
        if not rows:
            continue
        header_map = {}
        for h in rows[0].keys():
            for c in cols:
                if norm(h) == norm(c) or (c == "Name" and norm(h) in ("customername", "publicationname", "personname", "fullname")):
                    header_map[h] = c
        missing = [c for c in cols if c != pk and c not in header_map.values()]
        if missing:
            print(f"  ! {name}: columns not found in file (left empty): {', '.join(missing)}")
        inv = {v: k for k, v in header_map.items()}
        docs = []
        for i, r in enumerate(rows, start=2):
            try:
                docs.append({c: coerce(c, r.get(inv[c])) for c in cols if c in inv})
            except ValueError as e:
                print(f"  ! {name} row {i}: {e} — skipped")
        if name == "Delivery_Persons":
            vals = [d["CommissionRate"] for d in docs if d.get("CommissionRate") is not None]
            if vals and max(vals) < 1:  # given as a fraction (0.025) → schema stores percent (2.5)
                for d in docs:
                    if d.get("CommissionRate") is not None:
                        d["CommissionRate"] = round(d["CommissionRate"] * 100, 2)
                print("  · CommissionRate looked like fractions — converted to percent")
            for d in docs:
                d.setdefault("CommissionRate", 2.5)
        if name == "Monthly_Invoices":
            for d in docs:
                d.setdefault("PaymentStatus", "Unpaid")
                d["ReminderSent"] = bool(d.get("ReminderSent"))
        # assign integer IDs where the file had none
        await store.sync_counters(database)
        need = [d for d in docs if d.get(pk) is None]
        for d, new_id in zip(need, await api.next_ids(name, len(need))):
            d[pk] = new_id
        ok = 0
        for d in docs:
            try:
                await database[name].insert_one(d)
                ok += 1
            except Exception as e:  # e.g. duplicate ID
                print(f"  ! {name} {pk}={d.get(pk)}: {str(e)[:120]} — skipped")
        print(f"  ✓ {name}: {ok}/{len(rows)} documents")

    await store.ensure_indexes(database)
    await store.sync_counters(database)
    await api.refresh_payment_status()  # derive invoice status from payments (oldest first)
    print("Done.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="folder of CSV/XLSX files, or a single workbook/CSV")
    ap.add_argument("--reset", action="store_true", help="delete existing documents in every collection first")
    args = ap.parse_args()
    src = Path(args.source).expanduser()
    if not src.exists():
        sys.exit(f"Not found: {src}")
    asyncio.run(run(src, args.reset))


if __name__ == "__main__":
    main()
