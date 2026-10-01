"""
Dataset to MongoDB Import Script
--------------------------------
Pushes all CSV files from the Data_set directory into MongoDB
collections matching the Newspaper Agency schema.

Supports both:
  1. Local MongoDB (mongodb://localhost:27017)
  2. MongoDB Atlas (Cloud connection string)
"""

import os
import sys
import csv
import argparse
from pathlib import Path
from datetime import datetime
import pymongo
from pymongo import MongoClient, UpdateOne

MONTH_MAP = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12,
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12
}

def parse_date(val):
    if not val:
        return None
    val = str(val).strip()
    if not val:
        return None
    for fmt in ('%d/%m/%Y', '%m/%d/%Y', '%Y-%m-%d', '%d-%m-%Y', '%Y/%m/%d', '%d-%b-%Y'):
        try:
            return datetime.strptime(val, fmt)
        except ValueError:
            pass
    return None

def parse_month(val, default_year=2026):
    if not val:
        return None
    s = str(val).strip()
    # Check if already a date string
    d = parse_date(s)
    if d:
        return datetime(d.year, d.month, 1)
    # Check month name
    m_num = MONTH_MAP.get(s.lower())
    if m_num:
        return datetime(default_year, m_num, 1)
    return None

def to_int(val, default=0):
    if val is None or str(val).strip() == '':
        return default
    try:
        return int(float(str(val).replace(',', '')))
    except (ValueError, TypeError):
        return default

def to_float(val, default=0.0):
    if val is None or str(val).strip() == '':
        return default
    try:
        return round(float(str(val).replace(',', '').replace('₹', '').replace('%', '').strip()), 2)
    except (ValueError, TypeError):
        return default

def load_data(data_dir: Path):
    datasets = {}
    csv_files = {
        'Delivery_Persons': data_dir / 'Delivery_persons.csv',
        'Zones': data_dir / 'Zones_data.csv',
        'Customers': data_dir / 'Customers.csv',
        'Publications': data_dir / 'Publications.csv',
        'Customer_Subscriptions': data_dir / 'Customer_Subscriptions.csv',
        'Vacation_Holds': data_dir / 'Vacation_Holds.csv',
        'Daily_Deliveries': data_dir / 'Daily_Deliveries.csv',
        'Monthly_Invoices': data_dir / 'Monthly_Invoices.csv',
        'Invoice_Line_Items': data_dir / 'Invoice_Line_Items.csv',
        'Payments': data_dir / 'Payments.csv',
    }

    # 1. Delivery_Persons
    if csv_files['Delivery_Persons'].exists():
        with open(csv_files['Delivery_Persons'], 'r', encoding='utf-8-sig') as f:
            docs = []
            for r in csv.DictReader(f):
                pid = to_int(r.get('id'))
                rate = to_float(r.get('Comission_rate') or r.get('CommissionRate') or 2.5)
                # If given as fraction 0.025, convert to percent 2.5
                if rate < 1.0:
                    rate = round(rate * 100, 2)
                docs.append({
                    'DeliveryPersonID': pid,
                    'id': pid,
                    'Name': r.get('Delivery_person_name') or r.get('Name', ''),
                    'ContactNumber': r.get('Contact') or r.get('ContactNumber', ''),
                    'CommissionRate': rate
                })
            datasets['Delivery_Persons'] = docs

    # 2. Zones
    if csv_files['Zones'].exists():
        with open(csv_files['Zones'], 'r', encoding='utf-8-sig') as f:
            docs = []
            for r in csv.DictReader(f):
                zid = to_int(r.get('id'))
                dpid = to_int(r.get('Delivery_person_id') or r.get('DeliveryPersonID'))
                docs.append({
                    'ZoneID': zid,
                    'id': zid,
                    'ZoneName': r.get('Zone_name') or r.get('ZoneName', ''),
                    'DeliveryPersonID': dpid
                })
            datasets['Zones'] = docs

    # 3. Customers
    if csv_files['Customers'].exists():
        with open(csv_files['Customers'], 'r', encoding='utf-8-sig') as f:
            docs = []
            for r in csv.DictReader(f):
                cid = to_int(r.get('id'))
                status_raw = str(r.get('Status', 'active')).strip().lower()
                status = 'Active' if status_raw in ('active', '1', 'true') else 'Suspended'
                docs.append({
                    'CustomerID': cid,
                    'id': cid,
                    'Name': r.get('Customer_name') or r.get('Name', ''),
                    'Contact': r.get('Contact', ''),
                    'Address': r.get('Address', ''),
                    'ZoneID': to_int(r.get('Zone_id') or r.get('ZoneID')),
                    'RouteSequence': to_int(r.get('Route_sequence') or r.get('RouteSequence')),
                    'Status': status
                })
            datasets['Customers'] = docs

    # 4. Publications
    if csv_files['Publications'].exists():
        with open(csv_files['Publications'], 'r', encoding='utf-8-sig') as f:
            docs = []
            for r in csv.DictReader(f):
                pid = to_int(r.get('id'))
                ptype = str(r.get('Publication_type') or r.get('Type', 'Newspaper')).capitalize()
                price = to_float(r.get('PricePerIssue') or (30.0 if ptype == 'Magazine' else 7.0))
                docs.append({
                    'PublicationID': pid,
                    'id': pid,
                    'Name': r.get('Publication_name') or r.get('Name', ''),
                    'Type': ptype,
                    'PricePerIssue': price
                })
            datasets['Publications'] = docs

    # 5. Customer_Subscriptions
    if csv_files['Customer_Subscriptions'].exists():
        with open(csv_files['Customer_Subscriptions'], 'r', encoding='utf-8-sig') as f:
            docs = []
            for r in csv.DictReader(f):
                sid = to_int(r.get('id'))
                cid = to_int(r.get('Customer_id') or r.get('CustomerID'))
                pub_id = to_int(r.get('Publication_id') or r.get('PublicationID'))
                qty = to_int(r.get('Quantity'), default=1)
                eff_date = parse_date(r.get('Effective_date') or r.get('EffectiveDate'))
                status_raw = str(r.get('Status', 'Active')).capitalize()
                docs.append({
                    'SubscriptionID': sid,
                    'id': sid,
                    'CustomerID': cid,
                    'PublicationID': pub_id,
                    'Quantity': qty,
                    'EffectiveDate': eff_date,
                    'Status': status_raw
                })
            datasets['Customer_Subscriptions'] = docs

    # 6. Vacation_Holds
    if csv_files['Vacation_Holds'].exists():
        with open(csv_files['Vacation_Holds'], 'r', encoding='utf-8-sig') as f:
            docs = []
            for r in csv.DictReader(f):
                hid = to_int(r.get('id'))
                cid = to_int(r.get('Customer_id') or r.get('CustomerID'))
                s_date = parse_date(r.get('Start_date') or r.get('StartDate'))
                e_date = parse_date(r.get('End_date') or r.get('EndDate'))
                docs.append({
                    'HoldID': hid,
                    'id': hid,
                    'CustomerID': cid,
                    'StartDate': s_date,
                    'EndDate': e_date
                })
            datasets['Vacation_Holds'] = docs

    # 7. Daily_Deliveries
    if csv_files['Daily_Deliveries'].exists():
        with open(csv_files['Daily_Deliveries'], 'r', encoding='utf-8-sig') as f:
            docs = []
            for r in csv.DictReader(f):
                did = to_int(r.get('id'))
                d_date = parse_date(r.get('Date'))
                cid = to_int(r.get('Customer_ID') or r.get('Customer_id') or r.get('CustomerID'))
                pub_id = to_int(r.get('Publication_id') or r.get('PublicationID'))
                dp_id = to_int(r.get('Delivery_person_id') or r.get('DeliveryPersonID'))
                qty = to_int(r.get('Quantity_delivered') or r.get('QuantityDelivered'), default=1)
                price = to_float(r.get('Price_at_delivery') or r.get('PriceAtDelivery'), default=5.0)
                status_raw = str(r.get('Delivery_status') or r.get('DeliveryStatus', 'Delivered')).capitalize()
                docs.append({
                    'DeliveryID': did,
                    'id': did,
                    'Date': d_date,
                    'CustomerID': cid,
                    'PublicationID': pub_id,
                    'DeliveryPersonID': dp_id,
                    'QuantityDelivered': qty,
                    'PriceAtDelivery': price,
                    'DeliveryStatus': status_raw
                })
            datasets['Daily_Deliveries'] = docs

    # 8. Monthly_Invoices
    if csv_files['Monthly_Invoices'].exists():
        with open(csv_files['Monthly_Invoices'], 'r', encoding='utf-8-sig') as f:
            docs = []
            for r in csv.DictReader(f):
                inv_id = to_int(r.get('id'))
                cid = to_int(r.get('Customer_id') or r.get('CustomerID'))
                b_month = parse_month(r.get('Billing_month') or r.get('BillingMonth'))
                total = to_float(r.get('Total_amount') or r.get('TotalAmount'))
                p_status = str(r.get('Payment_status') or r.get('PaymentStatus', 'Unpaid')).capitalize()
                rem = str(r.get('Reminder_sent') or r.get('ReminderSent', 'false')).lower() in ('true', '1', 'yes')
                docs.append({
                    'InvoiceID': inv_id,
                    'id': inv_id,
                    'CustomerID': cid,
                    'BillingMonth': b_month,
                    'TotalAmount': total,
                    'PaymentStatus': p_status,
                    'ReminderSent': rem
                })
            datasets['Monthly_Invoices'] = docs

    # 9. Invoice_Line_Items
    if csv_files['Invoice_Line_Items'].exists():
        with open(csv_files['Invoice_Line_Items'], 'r', encoding='utf-8-sig') as f:
            docs = []
            for r in csv.DictReader(f):
                lid = to_int(r.get('id'))
                inv_id = to_int(r.get('Invoice_id') or r.get('InvoiceID'))
                pub_id = to_int(r.get('Publication_id') or r.get('PublicationID'))
                copies = to_int(r.get('Total_copies') or r.get('TotalCopies'))
                total = to_float(r.get('Line_total') or r.get('LineTotal'))
                docs.append({
                    'LineItemID': lid,
                    'id': lid,
                    'InvoiceID': inv_id,
                    'PublicationID': pub_id,
                    'TotalCopies': copies,
                    'LineTotal': total
                })
            datasets['Invoice_Line_Items'] = docs

    # 10. Payments
    if csv_files['Payments'].exists():
        with open(csv_files['Payments'], 'r', encoding='utf-8-sig') as f:
            docs = []
            for r in csv.DictReader(f):
                pay_id = to_int(r.get('id'))
                cid = to_int(r.get('Customer_id') or r.get('CustomerID'))
                amt = to_float(r.get('Amount_paid') or r.get('AmountPaid'))
                p_date = parse_date(r.get('Payment_date') or r.get('PaymentDate'))
                method = str(r.get('Method', 'Cash')).capitalize()
                ref = str(r.get('Reference_number') or r.get('ReferenceNumber', ''))
                docs.append({
                    'PaymentID': pay_id,
                    'id': pay_id,
                    'CustomerID': cid,
                    'AmountPaid': amt,
                    'PaymentDate': p_date,
                    'Method': method,
                    'ReferenceNumber': ref
                })
            datasets['Payments'] = docs

    return datasets


def push_to_mongo(mongo_url: str, db_name: str, datasets: dict, reset: bool = True):
    print(f"\n[+] Connecting to MongoDB at: {mongo_url}")
    client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
    db = client[db_name]

    # Verify connection
    client.server_info()
    print(f"[+] Connected! Target Database: '{db_name}'\n")

    pk_map = {
        'Delivery_Persons': 'DeliveryPersonID',
        'Zones': 'ZoneID',
        'Customers': 'CustomerID',
        'Publications': 'PublicationID',
        'Customer_Subscriptions': 'SubscriptionID',
        'Vacation_Holds': 'HoldID',
        'Daily_Deliveries': 'DeliveryID',
        'Monthly_Invoices': 'InvoiceID',
        'Invoice_Line_Items': 'LineItemID',
        'Payments': 'PaymentID'
    }

    counters = {}

    for coll_name, docs in datasets.items():
        if not docs:
            continue
        coll = db[coll_name]
        if reset:
            coll.drop()
            print(f"  [-] Dropped collection '{coll_name}'")

        # Insert docs in batches
        res = coll.insert_many(docs)
        print(f"  [v] Inserted {len(res.inserted_ids)} documents into '{coll_name}'")

        # Update counter
        pk_field = pk_map.get(coll_name)
        if pk_field:
            max_id = max((d.get(pk_field, 0) for d in docs), default=0)
            counters[coll_name] = max_id

    # Sync Counters collection
    counters_coll = db['Counters']
    if reset:
        counters_coll.drop()
    for coll_name, seq in counters.items():
        counters_coll.update_one({'_id': coll_name}, {'$set': {'seq': seq}}, upsert=True)
    print(f"  [v] Synced {len(counters)} counters into 'Counters' collection")

    # Create Indexes
    print("\n[+] Creating indexes...")
    db.Customers.create_index([("ZoneID", 1), ("RouteSequence", 1)])
    db.Customers.create_index([("CustomerID", 1)], unique=True)
    db.Zones.create_index([("ZoneID", 1)], unique=True)
    db.Delivery_Persons.create_index([("DeliveryPersonID", 1)], unique=True)
    db.Publications.create_index([("PublicationID", 1)], unique=True)
    db.Customer_Subscriptions.create_index([("CustomerID", 1)])
    db.Customer_Subscriptions.create_index([("SubscriptionID", 1)], unique=True)
    db.Vacation_Holds.create_index([("CustomerID", 1), ("StartDate", 1), ("EndDate", 1)])
    db.Daily_Deliveries.create_index([("Date", 1)])
    db.Daily_Deliveries.create_index([("DeliveryID", 1)], unique=True)
    db.Monthly_Invoices.create_index([("CustomerID", 1), ("BillingMonth", 1)])
    db.Monthly_Invoices.create_index([("InvoiceID", 1)], unique=True)
    db.Invoice_Line_Items.create_index([("InvoiceID", 1)])
    db.Payments.create_index([("CustomerID", 1)])
    db.Payments.create_index([("PaymentID", 1)], unique=True)
    print("  [v] Indexes created successfully!")

    print("\n=== IMPORT SUMMARY ===")
    for coll_name in sorted(datasets.keys()):
        count = db[coll_name].count_documents({})
        print(f"  {coll_name}: {count} records")
    print("======================\n")


def main():
    parser = argparse.ArgumentParser(description="Push CSV datasets to MongoDB")
    parser.add_argument("--url", default="mongodb://localhost:27017", help="MongoDB connection URL")
    parser.add_argument("--db", default="newspaper_agency", help="Database name")
    parser.add_argument("--reset", action="store_true", default=True, help="Reset/drop collections before inserting")
    parser.add_argument("--path", default=r"C:\Users\pavan\OneDrive\Desktop\swe_project\Data_set", help="Path to CSV folder")
    args = parser.parse_args()

    data_dir = Path(args.path)
    if not data_dir.exists():
        print(f"Error: Path '{data_dir}' does not exist.")
        sys.exit(1)

    print(f"Loading CSV files from: {data_dir}")
    datasets = load_data(data_dir)
    push_to_mongo(args.url, args.db, datasets, reset=args.reset)
    print("All datasets pushed to MongoDB successfully!")

if __name__ == "__main__":
    main()
