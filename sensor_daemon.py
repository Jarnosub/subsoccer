import time
from pynput.keyboard import Key, Controller
import RPi.GPIO as GPIO

# ==================================================
# SUBSOCCER GO ARCADE - VISION/ULTRASOUND SENSOR DAEMON
# ==================================================

keyboard = Controller()

# Aseta Raspberry Pi:n pinni-numerointi
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

# ==================================================
# 1) Asetukset 
# (Muuta näitä jos kytket anturit eri pinneihin)
# ==================================================
# Pelaaja 1 Anturi (Vasen Maali)
TRIG_P1 = 23
ECHO_P1 = 24

# Pelaaja 2 Anturi (Oikea Maali)
TRIG_P2 = 27
ECHO_P2 = 22

# Virtuaalinen hälytyskynnys (Senttimetreinä)
# LUKITSE TÄMÄ NIIN ETTÄ PALLO JÄÄ KYNNYKSEN SISÄÄN
MIN_DISTANCE_CM = 2.0
MAX_DISTANCE_CM = 15.0

# Debounce: Kuinka monta sekuntia odotetaan ennen uutta maalia?
DEBOUNCE_TIME = 3.0

# ==================================================
# 2) Alustus
# ==================================================
GPIO.setup(TRIG_P1, GPIO.OUT)
GPIO.setup(ECHO_P1, GPIO.IN)
GPIO.setup(TRIG_P2, GPIO.OUT)
GPIO.setup(ECHO_P2, GPIO.IN)

# Varmistetaan tutkien nolla-tila
GPIO.output(TRIG_P1, False)
GPIO.output(TRIG_P2, False)
time.sleep(1)

def get_distance(trig_pin, echo_pin):
    # Lähetetään tutkapulssi
    GPIO.output(trig_pin, True)
    time.sleep(0.00001)
    GPIO.output(trig_pin, False)

    pulse_start = time.time()
    pulse_end = time.time()
    
    # Odotetaan pulssin laukaisua
    timeout_start = time.time()
    while GPIO.input(echo_pin) == 0:
        pulse_start = time.time()
        if time.time() - timeout_start > 0.1:
            return 999.0  # Timeout
            
    # Odotetaan pulssin paluuta (Kaiku)
    timeout_end = time.time()
    while GPIO.input(echo_pin) == 1:
        pulse_end = time.time()
        if time.time() - timeout_end > 0.1:
            return 999.0  # Timeout

    pulse_duration = pulse_end - pulse_start
    # Äänen nopeus = 34300 cm/s
    distance = pulse_duration * 17150
    return round(distance, 2)

# ==================================================
# 3) Pääluuppi 1000 Hz Watchdog
# ==================================================
print("Subsoccer Vision Engine (Ultrasound) Started!")
print(f"Goal Threshold: {MIN_DISTANCE_CM}cm - {MAX_DISTANCE_CM}cm")

last_goal_p1 = 0
last_goal_p2 = 0

try:
    while True:
        # Mittaa etäisyydet millisekunnissa
        dist1 = get_distance(TRIG_P1, ECHO_P1)
        dist2 = get_distance(TRIG_P2, ECHO_P2)

        # Tarkistetaan Pelaaja 1 Maali (Vasen)
        if MIN_DISTANCE_CM <= dist1 <= MAX_DISTANCE_CM:
            if time.time() - last_goal_p1 > DEBOUNCE_TIME:
                print(f"GOAL P1 DETECTED!!! (Distance: {dist1} cm)")
                # Emuloitu näppäimen "1" isku 
                keyboard.press('1')
                keyboard.release('1')
                last_goal_p1 = time.time()

        # Tarkistetaan Pelaaja 2 Maali (Oikea)
        if MIN_DISTANCE_CM <= dist2 <= MAX_DISTANCE_CM:
            if time.time() - last_goal_p2 > DEBOUNCE_TIME:
                print(f"GOAL P2 DETECTED!!! (Distance: {dist2} cm)")
                # Emuloitu näppäimen "2" isku
                keyboard.press('2')
                keyboard.release('2')
                last_goal_p2 = time.time()

        # Lepo 0.05 sekuntia CPU säästämiseksi
        time.sleep(0.05)

except KeyboardInterrupt:
    print("Shutting down Vision Engine")
    GPIO.cleanup()
except Exception as e:
    print(e)
    GPIO.cleanup()
