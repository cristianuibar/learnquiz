// Authored demo image: a bay location label. Inline so the bundled seed Worker needs no asset loader.
export const LOCATION_LABEL_WIDTH = 640
export const LOCATION_LABEL_HEIGHT = 300
export const LOCATION_LABEL_ALT = 'Warehouse location label A12-04-C-2. Callouts name each part: aisle A12, bay 04, level C, position 2. A boxed check digit pair, 57, sits at the right.'
export const LOCATION_LABEL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="t" viewBox="0 0 ${LOCATION_LABEL_WIDTH} ${LOCATION_LABEL_HEIGHT}" width="${LOCATION_LABEL_WIDTH}" height="${LOCATION_LABEL_HEIGHT}" font-family="Arial, Helvetica, sans-serif">
<title id="t">Warehouse location label A12-04-C-2 with check digits 57</title>
<rect width="640" height="300" fill="#ffffff"/>
<rect x="20" y="90" width="600" height="110" rx="8" fill="#fff8d6" stroke="#222" stroke-width="3"/>
<text x="40" y="168" font-size="64" font-weight="700" fill="#111">A12-04-C-2</text>
<rect x="500" y="110" width="100" height="70" rx="4" fill="#fff" stroke="#222" stroke-width="3"/>
<text x="550" y="158" font-size="44" font-weight="700" text-anchor="middle" fill="#111">57</text>
<g stroke="#555" stroke-width="2" fill="none">
<path d="M98 90V60M213 90V60M293 90V60M355 200V222M550 110V60"/>
</g>
<g font-size="18" fill="#222" text-anchor="middle">
<text x="98" y="50">Aisle A12</text>
<text x="213" y="50">Bay 04</text>
<text x="293" y="50">Level C</text>
<text x="355" y="242">Position 2</text>
<text x="550" y="50">Check digits</text>
</g>
<text x="320" y="285" font-size="16" fill="#444" text-anchor="middle">Aisle, bay, level, position, then the check digits that confirm the scan.</text>
</svg>
`
