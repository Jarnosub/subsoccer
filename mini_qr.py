import qrcode

def make_qr(url, filename="subsoccer_instant_play_qr.png"):
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=10, border=4)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    img.save(filename)
    print(f"Saved {filename}")

make_qr("https://subsoccer.pro/instant-play.html", "subsoccer_live_qr.png")
