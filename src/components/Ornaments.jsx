// Vintage Victorian ornaments and editorial broadsheet design accents
// Directly inspired by classic broadsheet and vintage newspaper templates.

export function VintageFlourish({ className = '', style = {}, width = 220, height = 28 }) {
  return (
    <svg
      viewBox="0 0 240 32"
      width={width}
      height={height}
      fill="currentColor"
      className={`vintage-flourish ${className}`}
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
      aria-hidden="true"
    >
      {/* Central diamond rosette & floral crest */}
      <circle cx="120" cy="16" r="3" />
      <circle cx="120" cy="7" r="1.5" />
      <circle cx="120" cy="25" r="1.5" />
      <path d="M120 10 C122 13 125 15 128 16 C125 17 122 19 120 22 C118 19 115 17 112 16 C115 15 118 13 120 10 Z" />
      
      {/* Right scrollwork & tendrils */}
      <path d="M128 16 C134 16 139 12 144 9 C150 5 158 5 162 9 C165 12 165 17 161 20 C156 24 148 23 145 19 C143 16 145 13 148 13 C151 13 153 15 152 17 C150 18 148 17 148 16 C148 14 153 10 159 12 C162 13 163 17 160 19 C155 22 148 20 146 16 C143 11 150 7 156 7 C164 7 172 12 178 16 C186 21 195 22 204 19 C212 16 218 16 226 16 L238 16" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <circle cx="238" cy="16" r="2" />
      <path d="M178 16 C183 13 189 13 194 15 C190 17 185 17 178 16 Z" />
      <path d="M140 10 C143 7 148 7 150 9 C146 10 142 11 140 10 Z" />
      <path d="M165 21 C168 23 172 23 175 21 C172 20 168 20 165 21 Z" />
      
      {/* Left scrollwork & tendrils (symmetrical reflection) */}
      <path d="M112 16 C106 16 101 12 96 9 C90 5 82 5 78 9 C75 12 75 17 79 20 C84 24 92 23 95 19 C97 16 95 13 92 13 C89 13 87 15 88 17 C90 18 92 17 92 16 C92 14 87 10 81 12 C78 13 77 17 80 19 C85 22 92 20 94 16 C97 11 90 7 84 7 C76 7 68 12 62 16 C54 21 45 22 36 19 C28 16 22 16 14 16 L2 16" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <circle cx="2" cy="16" r="2" />
      <path d="M62 16 C57 13 51 13 46 15 C50 17 55 17 62 16 Z" />
      <path d="M100 10 C97 7 92 7 90 9 C94 10 98 11 100 10 Z" />
      <path d="M75 21 C72 23 68 23 65 21 C68 20 72 20 75 21 Z" />
    </svg>
  )
}

export function EditorialBoxHeader({ title, subtitle, className = '', align = 'center' }) {
  return (
    <div className={`editorial-box-header ${align} ${className}`}>
      <div className="editorial-box-title">{title}</div>
      <div className="editorial-double-rule" />
      {subtitle && <div className="editorial-box-sub">{subtitle}</div>}
    </div>
  )
}

// Vintage Ticket Badge with notched corners and dashed perforation line
// Identical to the "22 NOV / 8 PM" ticket coupon from the user's template!
export function VintageTicket({
  primaryNumber,
  primaryLabel,
  line1,
  line2,
  bottomHighlight,
  badgeText,
  style = {},
  className = '',
}) {
  return (
    <div className={`vintage-ticket-card ${className}`} style={style}>
      <div className="vt-notch vt-top-left" />
      <div className="vt-notch vt-top-right" />
      <div className="vt-notch vt-bottom-left" />
      <div className="vt-notch vt-bottom-right" />
      
      <div className="vt-inner">
        {badgeText && <span className="vt-badge">{badgeText}</span>}
        <div className="vt-number">{primaryNumber}</div>
        <div className="vt-label">{primaryLabel}</div>
        {line1 && <div className="vt-subline">{line1}</div>}
        {line2 && <div className="vt-subline">{line2}</div>}
        
        <div className="vt-divider" />
        
        {bottomHighlight && <div className="vt-bottom">{bottomHighlight}</div>}
      </div>
    </div>
  )
}
