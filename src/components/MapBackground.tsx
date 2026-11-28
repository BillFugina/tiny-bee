/**
 * The faint map behind every page from the MagicPath designs: a grid, a few
 * winding roads and two soft glows. Decorative only.
 */
export function MapBackground() {
  return (
    <div className="map-bg" aria-hidden="true">
      <svg className="map-bg__roads" xmlns="http://www.w3.org/2000/svg">
        <path d="M-100 200 C 200 150, 400 400, 1200 300" strokeWidth="2" />
        <path d="M400 -100 L 600 1200" strokeWidth="1" strokeDasharray="10 10" />
        <path d="M-200 800 Q 500 600, 1400 900" strokeWidth="1.5" />
        <path d="M800 -200 C 700 300, 900 600, 600 1300" strokeWidth="2" />
      </svg>
    </div>
  )
}
