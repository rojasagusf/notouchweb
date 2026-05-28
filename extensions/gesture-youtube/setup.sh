#!/usr/bin/env bash
# Genera los íconos PNG requeridos por Chrome usando Python (sin dependencias)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ICONS_DIR="$SCRIPT_DIR/icons"
mkdir -p "$ICONS_DIR"

python3 - <<'PYEOF'
import struct, zlib, os

def make_png(size, r, g, b, output_path):
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)

    # Raw image data: each row starts with filter byte 0
    raw = b''
    for y in range(size):
        raw += b'\x00'
        for x in range(size):
            # Draw a circle inside the square
            cx = size / 2
            cy = size / 2
            dist = ((x - cx)**2 + (y - cy)**2) ** 0.5
            if dist <= cx * 0.82:
                # Hand icon color
                raw += bytes([r, g, b])
            else:
                # Transparent-ish border (darker)
                raw += bytes([max(0, r-40), max(0, g-40), max(0, b-40)])

    idat_data = zlib.compress(raw, 9)

    data = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr_data)
        + chunk(b'IDAT', idat_data)
        + chunk(b'IEND', b'')
    )

    with open(output_path, 'wb') as f:
        f.write(data)
    print(f"  ✓ {output_path}")

icons_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icons')
os.makedirs(icons_dir, exist_ok=True)

# Teal / verde esmeralda
R, G, B = 0, 212, 170

for size in (16, 48, 128):
    make_png(size, R, G, B, os.path.join(icons_dir, f'icon{size}.png'))

print("Íconos generados.")
PYEOF

echo ""
echo "✅ Setup completo."
echo ""
echo "Para cargar la extensión en Chrome:"
echo "  1. Abrí chrome://extensions"
echo "  2. Activá 'Modo desarrollador' (arriba a la derecha)"
echo "  3. Hacé click en 'Cargar sin empaquetar'"
echo "  4. Seleccioná la carpeta: $SCRIPT_DIR"
echo ""
