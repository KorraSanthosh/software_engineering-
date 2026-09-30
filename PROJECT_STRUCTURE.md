# 📰 Newspaper Agency Automation — Project Structure & Team Architecture

> **Repository Master Structure**  
> **Lead Architect / Repository Maintainer:** Team Leader  
> **Tech Stack:** React 19, Vite, TailwindCSS / Custom Styles, Python FastAPI, MongoDB Atlas (Motor)

---

## 🏛️ Project Directory Blueprint

```text
newspaper-agency-frontend/
├── 📄 package.json                  # Node.js dependencies & scripts
├── 📄 vite.config.js                # Vite build and dev server config
├── 📄 index.html                    # Frontend entrypoint
├── 📄 eslint.config.js              # Code linting rules
├── 📄 README.md                     # Project overview & running instructions
├── 📄 PROJECT_STRUCTURE.md          # Architecture & team distribution (this file)
├── 📄 .gitignore                    # Environment & credential protection
│
├── 📂 public/                       # Static public assets
│   ├── _redirects                  # SPA client-side routing for Netlify
│   ├── favicon.svg                 # Newspaper agency icon
│   └── icons.svg                   # SVG sprite icon library
│
├── 📂 src/                          # React Frontend Application
│   ├── main.jsx                    # React DOM root render
│   ├── App.jsx                     # Top-level router & masthead layout
│   ├── App.css                     # Newspaper aesthetic styling & typography
│   ├── index.css                   # Global Tailwind / CSS reset
│   ├── config.js                   # Application metadata & environment config
│   │
│   ├── 📂 lib/                     # Frontend Core Utilities
│   │   ├── api.js                  # Centralized REST API client & endpoints
│   │   ├── format.js               # Currency (₹), date, and badge formatters
│   │   └── hooks.js                # Custom React state & network hooks
│   │
│   ├── 📂 components/              # Shared Reusable UI Components
│   │   ├── ui.jsx                  # Modals, Tables, Forms, Badges, Toasts
│   │   ├── Charts.jsx              # SVG bar & trend charts for reports
│   │   └── Icon.jsx                # Dynamic SVG icon loader
│   │
│   └── 📂 pages/                   # Application Functional Modules
│       ├── Dashboard.jsx           # KPI metrics, revenue charts, live status
│       ├── Customers.jsx           # Customer management & status tracking
│       ├── Subscriptions.jsx       # Publication subscription mapping
│       ├── VacationHolds.jsx       # Temporary stop/vacation management
│       ├── Deliveries.jsx          # Daily route sheets & delivery logging
│       ├── RoutesAndStaff.jsx      # Zone route sequencing & delivery staff
│       ├── Billing.jsx             # Monthly invoicing & overdue analysis
│       ├── Payments.jsx            # Payment entry (Cash/Cheque) & history
│       ├── Publications.jsx        # Newspaper & magazine catalog
│       └── NotFound.jsx            # 404 page handler
│
├── 📂 backend/                      # FastAPI Python Backend
│   ├── main.py                     # REST API endpoints & business logic
│   ├── db.py                       # MongoDB async Motor driver & auto-increment counters
│   ├── import_data.py              # CSV/Excel bulk dataset ingestion pipeline
│   ├── requirements.txt            # Python dependencies (FastAPI, Motor, Uvicorn)
│   ├── railway.json                # Container deployment configuration
│   ├── .python-version             # Python 3.12 runtime specification
│   └── schema_mysql.sql / sqlite   # Reference relational schema specs
│
└── 📂 demo_data/                    # Sample Datasets for Agency Ingestion
    ├── customers.csv               # 12 Sample customers across 4 zones
    ├── delivery_persons.csv        # 4 Delivery agents with commission rates
    ├── zones.csv                   # 4 Distribution zones
    ├── publications.csv            # Newspapers (Hindu, Eenadu, etc.) & Magazines
    ├── subscriptions.csv           # 22 Active customer subscriptions
    ├── vacation_holds.csv          # Sample vacation pauses
    ├── daily_deliveries.csv        # Historical delivery records
    ├── invoices.csv                # Generated monthly invoices
    └── payments.csv                # Sample customer payment receipts
```

---

## 👥 Module Distribution & Team Responsibilities

| Module | Team Contributor | Assigned Scope & Files |
| :--- | :--- | :--- |
| **0. Core Architecture & Infra** | **Team Leader** | Project skeleton, routing framework, API client (`src/lib/api.js`), deployment setup, repository governance |
| **1. Backend Core & Database** | **Member 1** | `backend/main.py`, `backend/db.py`, `backend/import_data.py`, `backend/requirements.txt` |
| **2. Customer & Subscription System** | **Member 2** | `src/pages/Customers.jsx`, `src/pages/Subscriptions.jsx`, `src/pages/VacationHolds.jsx`, `demo_data/customers.csv` |
| **3. Delivery Routing & Staff Dispatch** | **Member 3** | `src/pages/Deliveries.jsx`, `src/pages/RoutesAndStaff.jsx`, `demo_data/delivery_persons.csv`, `demo_data/zones.csv` |
| **4. Billing, Invoicing & Payments** | **Member 4** | `src/pages/Billing.jsx`, `src/pages/Payments.jsx`, `demo_data/invoices.csv`, `demo_data/payments.csv` |
| **5. Dashboard Analytics & UI Kit** | **Member 5** | `src/pages/Dashboard.jsx`, `src/pages/Publications.jsx`, `src/components/ui.jsx`, `src/components/Charts.jsx` |

---

## 🚀 Deployment Overview

```
[ React + Vite Frontend ]  ──(HTTPS REST)──▶  [ FastAPI Backend ]  ──(Motor Async)──▶  [ MongoDB Atlas ]
       (Netlify)                                 (Render / Free)                              (Cloud Cluster)
```
