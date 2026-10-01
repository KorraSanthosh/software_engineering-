-- SQLite version of the same schema (used when DB_ENGINE=sqlite, e.g. for local demos without MySQL)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS Delivery_Persons (
  DeliveryPersonID INTEGER PRIMARY KEY AUTOINCREMENT,
  Name             TEXT NOT NULL,
  ContactNumber    TEXT NOT NULL,
  CommissionRate   NUMERIC NOT NULL DEFAULT 2.50
);

CREATE TABLE IF NOT EXISTS Zones (
  ZoneID           INTEGER PRIMARY KEY AUTOINCREMENT,
  ZoneName         TEXT NOT NULL UNIQUE,
  DeliveryPersonID INTEGER REFERENCES Delivery_Persons(DeliveryPersonID) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS Customers (
  CustomerID    INTEGER PRIMARY KEY AUTOINCREMENT,
  Name          TEXT NOT NULL,
  Address       TEXT NOT NULL,
  ZoneID        INTEGER NOT NULL REFERENCES Zones(ZoneID) ON DELETE RESTRICT,
  RouteSequence INTEGER NOT NULL,
  Status        TEXT NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active','Suspended'))
);
CREATE INDEX IF NOT EXISTS idx_cust_route ON Customers(ZoneID, RouteSequence);

CREATE TABLE IF NOT EXISTS Publications (
  PublicationID INTEGER PRIMARY KEY AUTOINCREMENT,
  Name          TEXT NOT NULL,
  Type          TEXT NOT NULL CHECK (Type IN ('Newspaper','Magazine')),
  PricePerIssue NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS Customer_Subscriptions (
  SubscriptionID INTEGER PRIMARY KEY AUTOINCREMENT,
  CustomerID     INTEGER NOT NULL REFERENCES Customers(CustomerID) ON DELETE CASCADE,
  PublicationID  INTEGER NOT NULL REFERENCES Publications(PublicationID) ON DELETE RESTRICT,
  Quantity       INTEGER NOT NULL DEFAULT 1,
  EffectiveDate  TEXT NOT NULL,
  Status         TEXT NOT NULL DEFAULT 'Active' CHECK (Status IN ('Active','Cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_sub_cust ON Customer_Subscriptions(CustomerID);

CREATE TABLE IF NOT EXISTS Vacation_Holds (
  HoldID     INTEGER PRIMARY KEY AUTOINCREMENT,
  CustomerID INTEGER NOT NULL REFERENCES Customers(CustomerID) ON DELETE CASCADE,
  StartDate  TEXT NOT NULL,
  EndDate    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hold_dates ON Vacation_Holds(CustomerID, StartDate, EndDate);

CREATE TABLE IF NOT EXISTS Daily_Deliveries (
  DeliveryID        INTEGER PRIMARY KEY AUTOINCREMENT,
  Date              TEXT NOT NULL,
  CustomerID        INTEGER NOT NULL REFERENCES Customers(CustomerID) ON DELETE RESTRICT,
  PublicationID     INTEGER NOT NULL REFERENCES Publications(PublicationID) ON DELETE RESTRICT,
  DeliveryPersonID  INTEGER REFERENCES Delivery_Persons(DeliveryPersonID) ON DELETE SET NULL,
  QuantityDelivered INTEGER NOT NULL,
  PriceAtDelivery   NUMERIC NOT NULL,
  DeliveryStatus    TEXT NOT NULL DEFAULT 'Delivered' CHECK (DeliveryStatus IN ('Delivered','Failed')),
  UNIQUE (Date, CustomerID, PublicationID)
);
CREATE INDEX IF NOT EXISTS idx_del_date ON Daily_Deliveries(Date);

CREATE TABLE IF NOT EXISTS Monthly_Invoices (
  InvoiceID     INTEGER PRIMARY KEY AUTOINCREMENT,
  CustomerID    INTEGER NOT NULL REFERENCES Customers(CustomerID) ON DELETE RESTRICT,
  BillingMonth  TEXT NOT NULL,
  TotalAmount   NUMERIC NOT NULL DEFAULT 0,
  PaymentStatus TEXT NOT NULL DEFAULT 'Unpaid' CHECK (PaymentStatus IN ('Unpaid','Partial','Paid')),
  ReminderSent  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (CustomerID, BillingMonth)
);

CREATE TABLE IF NOT EXISTS Invoice_Line_Items (
  LineItemID    INTEGER PRIMARY KEY AUTOINCREMENT,
  InvoiceID     INTEGER NOT NULL REFERENCES Monthly_Invoices(InvoiceID) ON DELETE CASCADE,
  PublicationID INTEGER NOT NULL REFERENCES Publications(PublicationID) ON DELETE RESTRICT,
  TotalCopies   INTEGER NOT NULL,
  LineTotal     NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS Payments (
  PaymentID       INTEGER PRIMARY KEY AUTOINCREMENT,
  CustomerID      INTEGER NOT NULL REFERENCES Customers(CustomerID) ON DELETE RESTRICT,
  AmountPaid      NUMERIC NOT NULL,
  PaymentDate     TEXT NOT NULL,
  Method          TEXT NOT NULL CHECK (Method IN ('Cash','Cheque')),
  ReferenceNumber TEXT
);
CREATE INDEX IF NOT EXISTS idx_pay_cust ON Payments(CustomerID);
