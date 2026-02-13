#!/usr/bin/env python3
"""
Subsoccer Instant Play QR Code Generator
Generates QR codes for instant play mode
"""

import sys
from pathlib import Path

def generate_qr(url, filename="subsoccer_instant_play_qr.png", size=400):
    """
    Generate QR code for Subsoccer Instant Play
    
    Args:
        url: URL to instant-play.html
        filename: Output filename
        size: QR code size in pixels
    """
    print(f"🎮 Generating Subsoccer Instant Play QR Code...")
    print(f"📍 URL: {url}")
    
    # Create QR code
    qr = qrcode.QRCode(
        version=1,  # Auto-adjust
        error_correction=qrcode.constants.ERROR_CORRECT_H,  # High error correction
        box_size=10,
        border=4,
    )
    
    qr.add_data(url)
    qr.make(fit=True)
    
    # Create image
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Resize if needed
    if size != 400:
        img = img.resize((size, size))
    
    # Save
    output_path = Path(filename)
    img.save(output_path)
    
    print(f"✅ QR code saved: {output_path.absolute()}")
    print(f"📐 Size: {size}x{size}px")
    print(f"\n🖨️  Ready to print! Use this for your table stickers.")
    
    return output_path

def main():
    """Main function"""
    print("=" * 60)
    print("⚽ SUBSOCCER INSTANT PLAY - QR CODE GENERATOR")
    print("=" * 60)
    print()
    
    # Base URL (Vaihda tämä tuotanto-osoitteeseen kun julkaiset, esim. https://subsoccer.app/instant-play.html)
    base_url = "http://192.168.1.100:8000/instant-play.html"
    game_id = ""
    size = 400
    
    # Parse arguments intelligently
    if len(sys.argv) > 1:
        arg1 = sys.argv[1]
        
        # Case 1: First argument is URL (starts with http)
        if arg1.startswith("http"):
            base_url = arg1
            if len(sys.argv) > 2:
                game_id = sys.argv[2]
            if len(sys.argv) > 3:
                size = int(sys.argv[3])
        
        # Case 2: First argument is Game ID (shortcut)
        else:
            game_id = arg1
            if len(sys.argv) > 2:
                size = int(sys.argv[2])
    
    # If no game_id provided via args, ask for it (optional)
    if not game_id:
        print("💡 Tip: You can add a unique Table ID/Name.")
        user_input = input("Enter Game ID (press Enter to skip): ").strip()
        if user_input:
            game_id = user_input

    # Construct final URL
    final_url = base_url
    if game_id:
        separator = "&" if "?" in base_url else "?"
        final_url = f"{base_url}{separator}game_id={game_id}"
        print(f"🔗 Linked to Table ID: {game_id}")
    
    # Generate QR code
    filename = f"qr_{game_id}.png" if game_id else "subsoccer_instant_play_qr.png"
    output = generate_qr(final_url, filename=filename, size=size)
    
    print("\n" + "=" * 60)
    print("📋 NEXT STEPS:")
    print("=" * 60)
    print("1. Open the QR code image")
    print("2. Print on sticker paper or laminate")
    print("3. Place on Subsoccer table")
    print("4. Players scan and play instantly! 🚀")
    print()

if __name__ == "__main__":
    try:
        import qrcode
    except ImportError:
        print("❌ Error: qrcode module not installed")
        print("\n📦 Install it with:")
        print("   pip install qrcode[pil]")
        sys.exit(1)
    
    main()
