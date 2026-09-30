// Branding — override with VITE_AGENCY_NAME / VITE_AGENCY_TAGLINE / VITE_AGENCY_CITY in .env
export const AGENCY_NAME = import.meta.env.VITE_AGENCY_NAME || 'The Newspaper Agency'
export const AGENCY_TAGLINE = import.meta.env.VITE_AGENCY_TAGLINE || 'Circulation · Delivery · Billing'
export const AGENCY_CITY = import.meta.env.VITE_AGENCY_CITY || 'City Edition'

// Business constants from the SRS (mirrored on the backend)
export const DEFAULT_COMMISSION_RATE = 2.5 // percent (schema default 2.50)
export const SUBSCRIPTION_NOTICE_DAYS = 7 // one-week advance notice rule
export const SUSPEND_AFTER_DAYS = 60 // auto-suspension threshold
