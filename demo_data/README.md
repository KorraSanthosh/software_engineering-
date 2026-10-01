# Demo data — Newspaper Agency (June–September 2026)

Sample data for presentations. Every name, address and phone number is made up.

What's inside:
- 5 delivery staff and 6 Bengaluru zones.
- 73 customers: 62 from June, with 11 more joining later. 2 are currently suspended for unpaid dues.
- 11 publications: 8 newspapers and 3 magazines.
- 119 subscriptions, including 3 that start in early October ("Upcoming").
- 18 vacation holds: 14 completed, 2 ongoing on 30 Sep and 2 upcoming.
- 12,549 daily delivery lines, from 1 Jun to 30 Sep, with a few marked Failed.
- 198 monthly invoices (dated 1 Jul, 1 Aug and 1 Sep), 315 invoice line items and 202 payments.

The history includes a few events worth showing:
- **Price locking:** Deccan Herald went from ₹6 to ₹7 on 1 Aug and The Economic Times from ₹10 to ₹12 on 1 Sep. Older deliveries keep the old price.
- **Auto-suspension:** one customer was suspended for dues and then reactivated after paying in full on 16 Sep.

Magazines have no subscriptions, because the schema has no field for how often a publication comes out, so a weekly magazine would be billed every day.

Load it (backend virtual environment active, MongoDB running):

    cd backend
    python import_data.py ../demo_data --reset

`--reset` empties every collection first, so use it only on a demo database.
To replace the demo with your real data later, run the same command pointing at your own files.

The same data as one Excel workbook, with one sheet per table, is in `excel/newspaper_agency_demo_data.xlsx`. It's useful for showing the raw tables. The importer can read it directly: `python import_data.py ../demo_data/excel/newspaper_agency_demo_data.xlsx --reset`.
