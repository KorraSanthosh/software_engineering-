# Newspaper Agency Automation

This is a full-stack app for a newspaper distribution agency. It tracks customers, subscriptions, vacation holds, daily delivery route sheets, delivery-staff commission, monthly invoices and payments.

- **Frontend:** React 19 + Vite + React Router, styled like a newspaper (masthead, section nav, broadsheet type). It needs no extra npm packages beyond what `package.json` already lists.
- **Backend:** FastAPI + **MongoDB** (Motor), in `backend/main.py`. This is your original API with its bugs fixed (see the table at the end), plus the list/create/edit endpoints the web app needs. Collections mirror the tables in the schema diagram.

```
newspaper-agency-frontend/
├── src/                     React app
│   ├── pages/               Front Page, Customers, Subscriptions, Publications, Vacation Holds,
│   │                        Daily Deliveries, Zones & Staff, Billing, Payments
│   ├── components/          UI kit (tables, modals, drawers, toasts), SVG charts, icons
│   └── lib/api.js           every backend URL in one place (all under /api)
└── backend/
    ├── main.py              REST API + business rules (MongoDB)
    ├── db.py                Mongo connection, integer-ID counters, date handling
    ├── import_data.py       loads your CSV / Excel datasets into MongoDB
    └── requirements.txt
```

## 1. MongoDB

Start a local MongoDB (`brew services start mongodb-community`) or use an Atlas connection string. The database and collections are created automatically.

## 2. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # set MONGO_URL / MONGO_DB if not the defaults
uvicorn main:app --reload --port 8000
```

Interactive API docs are at http://localhost:8000/docs.

## 3. Load your datasets

Put your CSV or Excel files in one folder, named after the tables (for example `customers.csv`, `publications.csv`, `zones.csv`, `delivery_persons.csv`, `subscriptions.csv`, `vacation_holds.csv`, `daily_deliveries.csv`, `invoices.csv`, `invoice_line_items.csv`, `payments.csv`). You can also use one `.xlsx` workbook with one sheet per table.

```bash
cd backend
python import_data.py ~/path/to/datasets          # add --reset to empty the collections first
```

How the importer reads your files:
- Headers can be written in any common style: `CustomerID`, `customer_id` and `Customer Id` all work.
- It accepts dates as `YYYY-MM-DD`, `DD-MM-YYYY` or `DD/MM/YYYY`, and stores them as BSON dates.
- IDs are stored as integers, matching the schema. Missing IDs are assigned automatically.
- If commission rates are written as fractions (`0.025`), it converts them to the schema's percentage form (`2.50`).

## 4. Frontend

```bash
# in the project root (this folder)
cp .env.example .env            # optional: API URL + masthead name/city
npm install                     # already done if node_modules exists
npm run dev                     # http://localhost:5173
```

The "Wire live / Wire down" dot in the top-right of the masthead shows whether the frontend can reach the API.

## How the SRS business rules are implemented

| Rule | Endpoint | Behaviour |
|---|---|---|
| **1. Consecutive routing** | `POST /api/deliveries/generate?date=`, `GET /api/deliveries/routes` | One delivery line per active subscription, ordered by zone and then `RouteSequence`. The zone's delivery person is attached, and `PricePerIssue` is locked into `PriceAtDelivery`. Regenerating keeps statuses already recorded. |
| **2. Commission** | `GET /api/reports/commissions?year=&month=` | `SUM(QuantityDelivered × PriceAtDelivery) × CommissionRate%`, counting delivered lines only. |
| **3. Vacations** | `POST /api/customers/{id}/vacations` | Held dates are skipped when routes are built. Placing a hold also removes today's and future lines it already covers. |
| **4. Auto-suspension** | `POST /api/system/process-overdues` | Invoices unpaid or partly paid 30+ days after the invoice date get a reminder flag. After 60+ days the customer is set to `Suspended`. A payment that clears every overdue invoice sets them back to `Active`. |
| One-week notice | `POST /api/customers/{id}/subscriptions` | A new subscription, or a change to its effective date, must start at least 7 days from today. |
| Monthly invoices | `POST /api/invoices/generate-monthly` `{ "month": "2026-10-01" }` | The invoice is dated the 1st of that month and bills the previous month's delivered copies. Running it again recalculates instead of creating duplicates. |

## Fixes made to the original `main.py`

| # | Problem in the original | Fix |
|---|---|---|
| 1 | No CORS middleware, so the browser blocked every request from the React app | `CORSMiddleware` added, with origins taken from `CORS_ORIGINS` |
| 2 | Nothing ever created `Daily_Deliveries`, so invoices and commissions were always empty and the day's price was never locked in | Added `POST /api/deliveries/generate` |
| 3 | Documents got Mongo ObjectIds (`str(inserted_id)`) instead of the schema's integer IDs. Line items pointed at the invoice ObjectId, and the batch update looked up an integer `DeliveryID` that never existed | Integer auto-increment IDs via a `Counters` collection, plus unique indexes |
| 4 | The route listed every active customer in the zone, even those with no subscription, with no papers per stop. Its `deliveryPersonId` was mandatory | Built from active subscriptions, skipping holds and suspended customers, with the items for each stop. The person filter is optional |
| 5 | Invoice generation created duplicates when run twice. A `month` that wasn't the 1st (e.g. `2026-10-15`) billed the wrong date range | The month is normalised to the 1st, and existing invoices are recalculated in place |
| 6 | A payment only touched the oldest invoice and was compared with its full total. A second partial payment stayed "Partial" forever, overpayments were lost, the date was always `utcnow()`, and a cheque could be recorded without its number | Payments settle invoices oldest-first. Status is recalculated from all of the customer's payments. `PaymentDate` is optional, and the cheque number is required |
| 7 | Overdue processing ignored "Partial" invoices, and the reminder filter missed documents that had no `ReminderSent` field | Both fixed |
| 8 | No check that the customer or publication exists. No list/create/edit/delete endpoints for customers, zones, staff, publications, holds or payments | Validation plus full CRUD added. Deleting a zone that has customers, a person who covers a zone, or a customer with billing history is refused |
| 9 | A vacation `EndDate` stored at 23:59:59.999 and dates as mixed datetimes | Dates are stored at midnight and the API always returns them as `YYYY-MM-DD` |

The original request formats still work: camelCase bodies such as `{"publicationId": 1, "effectiveDate": "…"}` are accepted, and so is the schema's PascalCase (`{"PublicationID": 1, …}`).
