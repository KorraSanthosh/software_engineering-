-- Newspaper Agency Automation — MySQL schema (matches the database schema diagram)
-- Usage:  mysql -u root -p < schema_mysql.sql

CREATE DATABASE IF NOT EXISTS newspaper_agency
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE newspaper_agency;

CREATE TABLE IF NOT EXISTS Delivery_Persons (
  DeliveryPersonID INT AUTO_INCREMENT PRIMARY KEY,
  Name             VARCHAR(100) NOT NULL,
  ContactNumber    VARCHAR(20)  NOT NULL,
  CommissionRate   DECIMAL(5,2) NOT NULL DEFAULT 2.50     -- percent: 2.50 = 2.5%
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Zones (
  ZoneID           INT AUTO_INCREMENT PRIMARY KEY,
  ZoneName         VARCHAR(100) NOT NULL UNIQUE,
  DeliveryPersonID INT NULL,
  CONSTRAINT fk_zone_person FOREIGN KEY (DeliveryPersonID)
    REFERENCES Delivery_Persons(DeliveryPersonID) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Customers (
  CustomerID    INT AUTO_INCREMENT PRIMARY KEY,
  Name          VARCHAR(100) NOT NULL,
  Address       TEXT NOT NULL,
  ZoneID        INT NOT NULL,
  RouteSequence INT NOT NULL,
  Status        ENUM('Active','Suspended') NOT NULL DEFAULT 'Active',
  CONSTRAINT fk_cust_zone FOREIGN KEY (ZoneID) REFERENCES Zones(ZoneID) ON DELETE RESTRICT,
  INDEX idx_cust_route (ZoneID, RouteSequence)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Publications (
  PublicationID INT AUTO_INCREMENT PRIMARY KEY,
  Name          VARCHAR(100) NOT NULL,
  Type          ENUM('Newspaper','Magazine') NOT NULL,
  PricePerIssue DECIMAL(6,2) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Customer_Subscriptions (
  SubscriptionID INT AUTO_INCREMENT PRIMARY KEY,
  CustomerID     INT NOT NULL,
  PublicationID  INT NOT NULL,
  Quantity       INT NOT NULL DEFAULT 1,
  EffectiveDate  DATE NOT NULL,
  Status         ENUM('Active','Cancelled') NOT NULL DEFAULT 'Active',
  CONSTRAINT fk_sub_cust FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID) ON DELETE CASCADE,
  CONSTRAINT fk_sub_pub  FOREIGN KEY (PublicationID) REFERENCES Publications(PublicationID) ON DELETE RESTRICT,
  INDEX idx_sub_cust (CustomerID)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Vacation_Holds (
  HoldID     INT AUTO_INCREMENT PRIMARY KEY,
  CustomerID INT NOT NULL,
  StartDate  DATE NOT NULL,
  EndDate    DATE NOT NULL,
  CONSTRAINT fk_hold_cust FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID) ON DELETE CASCADE,
  INDEX idx_hold_dates (CustomerID, StartDate, EndDate)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Daily_Deliveries (
  DeliveryID        BIGINT AUTO_INCREMENT PRIMARY KEY,
  Date              DATE NOT NULL,
  CustomerID        INT NOT NULL,
  PublicationID     INT NOT NULL,
  DeliveryPersonID  INT NULL,
  QuantityDelivered INT NOT NULL,
  PriceAtDelivery   DECIMAL(6,2) NOT NULL,           -- price locked at delivery time
  DeliveryStatus    ENUM('Delivered','Failed') NOT NULL DEFAULT 'Delivered',
  CONSTRAINT fk_del_cust   FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID) ON DELETE RESTRICT,
  CONSTRAINT fk_del_pub    FOREIGN KEY (PublicationID) REFERENCES Publications(PublicationID) ON DELETE RESTRICT,
  CONSTRAINT fk_del_person FOREIGN KEY (DeliveryPersonID) REFERENCES Delivery_Persons(DeliveryPersonID) ON DELETE SET NULL,
  UNIQUE KEY uq_del_day (Date, CustomerID, PublicationID),
  INDEX idx_del_date (Date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Monthly_Invoices (
  InvoiceID     INT AUTO_INCREMENT PRIMARY KEY,
  CustomerID    INT NOT NULL,
  BillingMonth  DATE NOT NULL,                        -- first day of the month billed, e.g. 2023-10-01
  TotalAmount   DECIMAL(10,2) NOT NULL DEFAULT 0,
  PaymentStatus ENUM('Unpaid','Partial','Paid') NOT NULL DEFAULT 'Unpaid',
  ReminderSent  BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_inv_cust FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID) ON DELETE RESTRICT,
  UNIQUE KEY uq_inv_month (CustomerID, BillingMonth)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Invoice_Line_Items (
  LineItemID    INT AUTO_INCREMENT PRIMARY KEY,
  InvoiceID     INT NOT NULL,
  PublicationID INT NOT NULL,
  TotalCopies   INT NOT NULL,
  LineTotal     DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_line_inv FOREIGN KEY (InvoiceID) REFERENCES Monthly_Invoices(InvoiceID) ON DELETE CASCADE,
  CONSTRAINT fk_line_pub FOREIGN KEY (PublicationID) REFERENCES Publications(PublicationID) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Payments (
  PaymentID       INT AUTO_INCREMENT PRIMARY KEY,
  CustomerID      INT NOT NULL,
  AmountPaid      DECIMAL(10,2) NOT NULL,
  PaymentDate     DATE NOT NULL,
  Method          ENUM('Cash','Cheque') NOT NULL,
  ReferenceNumber VARCHAR(50) NULL,
  CONSTRAINT fk_pay_cust FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID) ON DELETE RESTRICT,
  INDEX idx_pay_cust (CustomerID)
) ENGINE=InnoDB;
