const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../translations.js');
let content = fs.readFileSync(filePath, 'utf8');

const translations = {
    fr: {
        quote: '"',
        keys: {
            login_tagline: "Suivez les stats · Gravissez les classements · Rejoignez les tournois",
            login_title: "CONNEXION JOUEUR",
            login_username: "Nom d'utilisateur",
            login_password: "Mot de passe",
            login_btn: "SE CONNECTER",
            login_or: "OU",
            login_google: "Continuer avec Google",
            login_create_acc: "CRÉER UN COMPTE",
            login_players_label: "Joueurs",
            login_tournaments_label: "Tournois",
            signup_choose_char: "CHOISISSEZ VOTRE PERSONNAGE",
            signup_or_ai: "OU CRÉEZ UN PORTRAIT IA",
            signup_free_try: "1 ESSAI GRATUIT",
            signup_take_selfie: "PRENDRE UN SELFIE",
            signup_generate: "GÉNÉRER",
            signup_enter_name: "Entrez le nom du joueur...",
            signup_email: "Adresse e-mail",
            signup_create_card: "CRÉER UNE CARTE PRO",
            signup_back_login: "Retour à la connexion"
        }
    },
    es: {
        quote: '"',
        keys: {
            login_tagline: "Sigue estadísticas · Sube posiciones · Únete a torneos",
            login_title: "INICIAR SESIÓN",
            login_username: "Nombre de usuario",
            login_password: "Contraseña",
            login_btn: "INICIAR SESIÓN",
            login_or: "O",
            login_google: "Continuar con Google",
            login_create_acc: "CREAR CUENTA",
            login_players_label: "Jugadores",
            login_tournaments_label: "Torneos",
            signup_choose_char: "ELIGE TU PERSONAJE",
            signup_or_ai: "O CREA UN RETRATO IA",
            signup_free_try: "1 INTENTO GRATIS",
            signup_take_selfie: "TOMAR SELFIE",
            signup_generate: "GENERAR",
            signup_enter_name: "Ingresa el nombre del jugador...",
            signup_email: "Correo electrónico",
            signup_create_card: "CREAR TARJETA PRO",
            signup_back_login: "Volver a Iniciar Sesión"
        }
    },
    de: {
        quote: '"',
        keys: {
            login_tagline: "Statistiken verfolgen · Rangliste klettern · Turnieren beitreten",
            login_title: "SPIELER LOGIN",
            login_username: "Benutzername",
            login_password: "Passwort",
            login_btn: "ANMELDEN",
            login_or: "ODER",
            login_google: "Mit Google fortfahren",
            login_create_acc: "KONTO ERSTELLEN",
            login_players_label: "Spieler",
            login_tournaments_label: "Turniere",
            signup_choose_char: "WÄHLE DEINEN CHARAKTER",
            signup_or_ai: "ODER AI-PORTRÄT ERSTELLEN",
            signup_free_try: "1 GRATISVERSUCH",
            signup_take_selfie: "SELFIE AUFNEHMEN",
            signup_generate: "GENERIEREN",
            signup_enter_name: "Spielernamen eingeben...",
            signup_email: "E-Mail-Adresse",
            signup_create_card: "PRO-KARTE ERSTELLEN",
            signup_back_login: "Zurück zum Login"
        }
    },
    pt: {
        quote: '"',
        keys: {
            login_tagline: "Acompanhe estatísticas · Suba no ranking · Entre em torneios",
            login_title: "LOGIN DO JOGADOR",
            login_username: "Nome de usuário",
            login_password: "Senha",
            login_btn: "ENTRAR",
            login_or: "OU",
            login_google: "Continuar com Google",
            login_create_acc: "CRIAR CONTA",
            login_players_label: "Jogadores",
            login_tournaments_label: "Torneios",
            signup_choose_char: "ESCOLHA SEU PERSONAGEM",
            signup_or_ai: "OU CRIE UM RETRATO IA",
            signup_free_try: "1 TENTATIVA GRÁTIS",
            signup_take_selfie: "TIRAR SELFIE",
            signup_generate: "GERAR",
            signup_enter_name: "Digite o nome do jogador...",
            signup_email: "E-mail",
            signup_create_card: "CRIAR CARTÃO PRO",
            signup_back_login: "Voltar ao Login"
        }
    },
    sv: {
        quote: "'",
        keys: {
            login_tagline: "Följ statistik · Klättra på rankningar · Gå med i turneringar",
            login_title: "SPELARINLOGGNING",
            login_username: "Användarnamn",
            login_password: "Lösenord",
            login_btn: "LOGGA IN",
            login_or: "ELLER",
            login_google: "Fortsätt med Google",
            login_create_acc: "SKAPA KONTO",
            login_players_label: "Spelare",
            login_tournaments_label: "Turneringar",
            signup_choose_char: "VÄLJ DIN KARAKTÄR",
            signup_or_ai: "ELLER SKAPA AI-PORTRÄTT",
            signup_free_try: "1 GRATIS FÖRSÖK",
            signup_take_selfie: "TA SELFIE",
            signup_generate: "GENERERA",
            signup_enter_name: "Ange spelarnamn...",
            signup_email: "E-postadress",
            signup_create_card: "SKAPA PRO-KORT",
            signup_back_login: "Tillbaka till inloggning"
        }
    },
    nb: {
        quote: "'",
        keys: {
            login_tagline: "Følg statistikk · Klatre på rangeringer · Bli med i turneringer",
            login_title: "SPILLERINNLOGGING",
            login_username: "Brukernavn",
            login_password: "Passord",
            login_btn: "LOGG INN",
            login_or: "ELLER",
            login_google: "Fortsett med Google",
            login_create_acc: "OPPRETT KONTO",
            login_players_label: "Spillere",
            login_tournaments_label: "Turneringer",
            signup_choose_char: "VELG DIN KARAKTER",
            signup_or_ai: "ELLER OPPRETT AI-PORTRETT",
            signup_free_try: "1 GRATIS FORSØK",
            signup_take_selfie: "TA SELFIE",
            signup_generate: "GENERER",
            signup_enter_name: "Skriv inn spillernavn...",
            signup_email: "E-postadresse",
            signup_create_card: "OPPRETT PRO-KORT",
            signup_back_login: "Tilbake til innlogging"
        }
    },
    da: {
        quote: "'",
        keys: {
            login_tagline: "Følg statistik · Stig i rangering · Deltag i turneringer",
            login_title: "SPILLERLOGIND",
            login_username: "Brugernavn",
            login_password: "Adgangskode",
            login_btn: "LOG IND",
            login_or: "ELLER",
            login_google: "Fortsæt med Google",
            login_create_acc: "OPRET KONTO",
            login_players_label: "Spillere",
            login_tournaments_label: "Turneringer",
            signup_choose_char: "VÆLG DIN KARAKTER",
            signup_or_ai: "ELLER OPRET AI-PORTRÆT",
            signup_free_try: "1 GRATIS PRØVEVERD",
            signup_take_selfie: "TAG SELFIE",
            signup_generate: "GENERER",
            signup_enter_name: "Indtast spillernavn...",
            signup_email: "E-mailadresse",
            signup_create_card: "OPRET PRO-KORT",
            signup_back_login: "Tilbage til login"
        }
    },
    it: {
        quote: "'",
        keys: {
            login_tagline: "Segui le statistiche · Scala le classifiche · Partecipa ai tornei",
            login_title: "ACCESSO GIOCATORE",
            login_username: "Nome utente",
            login_password: "Password",
            login_btn: "ACCEDI",
            login_or: "O",
            login_google: "Continua con Google",
            login_create_acc: "CREA ACCOUNT",
            login_players_label: "Giocatori",
            login_tournaments_label: "Tornei",
            signup_choose_char: "SCEGLI IL TUO PERSONAGGIO",
            signup_or_ai: "O CREA UN RITRATTO IA",
            signup_free_try: "1 PROVA GRATUITA",
            signup_take_selfie: "SCATTA SELFIE",
            signup_generate: "GENERA",
            signup_enter_name: "Inserisci nome giocatore...",
            signup_email: "Indirizzo e-mail",
            signup_create_card: "CREA CARTA PRO",
            signup_back_login: "Torna al Login"
        }
    },
    nl: {
        quote: "'",
        keys: {
            login_tagline: "Volg statistieken · Stijg op de ranglijst · Doe mee aan toernooien",
            login_title: "SPELER LOGIN",
            login_username: "Gebruikersnaam",
            login_password: "Wachtwoord",
            login_btn: "INLOGGEN",
            login_or: "OF",
            login_google: "Doorgaan met Google",
            login_create_acc: "ACCOUNT AANMAKEN",
            login_players_label: "Spelers",
            login_tournaments_label: "Toernooien",
            signup_choose_char: "KIES JE PERSONAGE",
            signup_or_ai: "OF MAAK AI-PORTRET",
            signup_free_try: "1 GRATIS POGING",
            signup_take_selfie: "NEEM SELFIE",
            signup_generate: "GENEREREN",
            signup_enter_name: "Voer spelersnaam in...",
            signup_email: "E-mailadres",
            signup_create_card: "SPELERSKAART MAKEN",
            signup_back_login: "Terug naar Login"
        }
    },
    cs: {
        quote: "'",
        keys: {
            login_tagline: "Sledujte statistiky · Stoupejte v žebříčcích · Zapojte se do turnajů",
            login_title: "PŘIHLÁŠENÍ HRÁČE",
            login_username: "Uživatelské jméno",
            login_password: "Heslo",
            login_btn: "PŘIHLÁSIT SE",
            login_or: "NEBO",
            login_google: "Pokračovat s Googlem",
            login_create_acc: "VYTVOŘIT ÚČET",
            login_players_label: "Hráči",
            login_tournaments_label: "Turnaje",
            signup_choose_char: "VYBERTE SI POSTAVU",
            signup_or_ai: "NEBO VYTVOŘTE AI PORTRÉT",
            signup_free_try: "1 POKUS ZDARMA",
            signup_take_selfie: "VYFOTIT SELFIE",
            signup_generate: "VYGENEROVAT",
            signup_enter_name: "Zadejte jméno hráče...",
            signup_email: "E-mailová adresa",
            signup_create_card: "VYTVOŘIT PRO KARTU",
            signup_back_login: "Zpět na přihlášení"
        }
    },
    tr: {
        quote: "'",
        keys: {
            login_tagline: "İstatistikleri takip et · Sıralamada yüksel · Turnuvalara katıl",
            login_title: "OYUNCU GİRİŞİ",
            login_username: "Kullanıcı adı",
            login_password: "Şifre",
            login_btn: "GİRİŞ YAP",
            login_or: "VEYA",
            login_google: "Google ile Devam Et",
            login_create_acc: "HESAP OLUŞTUR",
            login_players_label: "Oyuncular",
            login_tournaments_label: "Turnuvalar",
            signup_choose_char: "KARAKTERİNİ SEÇ",
            signup_or_ai: "VEYA YAPAY ZEKA PORTRESİ OLUŞTUR",
            signup_free_try: "1 ÜCRETSİZ DENEME",
            signup_take_selfie: "SELFİE ÇEK",
            signup_generate: "OLUŞTUR",
            signup_enter_name: "Oyuncu Adı Girin...",
            signup_email: "E-posta Adresi",
            signup_create_card: "PRO KART OLUŞTUR",
            signup_back_login: "Girişe Geri Dön"
        }
    },
    hu: {
        quote: "'",
        keys: {
            login_tagline: "Statisztikák követése · Helyezések javítása · Csatlakozás turnékhoz",
            login_title: "JÁTÉKOS BEJELENTKEZÉS",
            login_username: "Felhasználónév",
            login_password: "Jelszó",
            login_btn: "BEJELENTKEZÉS",
            login_or: "VAGY",
            login_google: "Folytatás Google-fiókkal",
            login_create_acc: "FIÓK LÉTREHOZÁSA",
            login_players_label: "Játékosok",
            login_tournaments_label: "Tornák",
            signup_choose_char: "VÁLASZD KI A KARAKTERED",
            signup_or_ai: "VAGY HOZZ LÉTRE AI PORTRÉT",
            signup_free_try: "1 INGYENES PRÓBA",
            signup_take_selfie: "SZELFI KÉSZÍTÉSE",
            signup_generate: "LÉTREHOZÁS",
            signup_enter_name: "Játékos név megadása...",
            signup_email: "E-mail cím",
            signup_create_card: "PRO KÁRTYA LÉTREHOZÁSA",
            signup_back_login: "Vissza a bejelentkezéshez"
        }
    },
    id: {
        quote: "'",
        keys: {
            login_tagline: "Pantau statistik · Naikkan peringkat · Ikuti turnamen",
            login_title: "MASUK PEMAIN",
            login_username: "Nama pengguna",
            login_password: "Kata sandi",
            login_btn: "MASUK",
            login_or: "ATAU",
            login_google: "Lanjutkan dengan Google",
            login_create_acc: "BUAT AKUN",
            login_players_label: "Pemain",
            login_tournaments_label: "Turnamen",
            signup_choose_char: "PILIH KARAKTERMU",
            signup_or_ai: "ATAU BUAT POTRET AI",
            signup_free_try: "1 COBA GRATIS",
            signup_take_selfie: "AMBIL SELFIE",
            signup_generate: "BUAT",
            signup_enter_name: "Masukkan Nama Pemain...",
            signup_email: "Alamat Email",
            signup_create_card: "BUAT KARTU PRO",
            signup_back_login: "Kembali ke Login"
        }
    },
    vi: {
        quote: "'",
        keys: {
            login_tagline: "Theo dõi số liệu · Thăng hạng · Tham gia giải đấu",
            login_title: "ĐĂNG NHẬP CẦU THỦ",
            login_username: "Tên đăng nhập",
            login_password: "Mật khẩu",
            login_btn: "ĐĂNG NHẬP",
            login_or: "HOẶC",
            login_google: "Tiếp tục với Google",
            login_create_acc: "TẠO TÀI KHOẢN",
            login_players_label: "Cầu thủ",
            login_tournaments_label: "Giải đấu",
            signup_choose_char: "CHỌN NHÂN VẬT CỦA BẠN",
            signup_or_ai: "HOẶC TẠO CHÂN DUNG AI",
            signup_free_try: "1 LẦN THỬ MIỄN PHÍ",
            signup_take_selfie: "CHỤP ẢNH SELFIE",
            signup_generate: "TẠO THẺ",
            signup_enter_name: "Nhập tên cầu thủ...",
            signup_email: "Địa chỉ email",
            signup_create_card: "TẠO THẺ PRO",
            signup_back_login: "Quay lại Đăng nhập"
        }
    },
    pl: {
        quote: "'",
        keys: {
            login_tagline: "Śledź statystyki · Awansuj w rankingach · Dołączaj do turniejów",
            login_title: "LOGOWANIE GRACZA",
            login_username: "Nazwa użytkownika",
            login_password: "Hasło",
            login_btn: "ZALOGUJ SIĘ",
            login_or: "LUB",
            login_google: "Kontynuuj z Google",
            login_create_acc: "UTWÓRZ KONTO",
            login_players_label: "Gracze",
            login_tournaments_label: "Turnieje",
            signup_choose_char: "WYBIERZ SWOJĄ POSTAĆ",
            signup_or_ai: "LUB STWÓRZ PORTRET AI",
            signup_free_try: "1 DARMOWA PRÓBA",
            signup_take_selfie: "ZRÓB SELFIE",
            signup_generate: "GENERUJ",
            signup_enter_name: "Wpisz nazwę gracza...",
            signup_email: "Adres e-mail",
            signup_create_card: "UTWÓRZ KARTĘ PRO",
            signup_back_login: "Powrót do logowania"
        }
    }
};

// We will find each language block and add keys after recent_global_activity
for (const lang of Object.keys(translations)) {
    const quote = translations[lang].quote;
    
    // We look for the pattern: lang: { ... recent_global_activity: "..."
    // or: lang: { ... recent_global_activity: '...'
    const targetPattern = new RegExp(`(${lang}:\\s*{[\\s\\S]*?recent_global_activity:\\s*${quote}.*?${quote})`);
    
    const match = content.match(targetPattern);
    if (match) {
        let block = match[1];
        
        // Let's format the new keys to insert
        let newKeysStr = '';
        for (const [key, value] of Object.entries(translations[lang].keys)) {
            // Escape single or double quotes inside value depending on block quote style
            const escapedValue = value.replace(new RegExp(quote, 'g'), '\\' + quote);
            newKeysStr += `,\n        ${key}: ${quote}${escapedValue}${quote}`;
        }
        
        const replacement = block + newKeysStr;
        content = content.replace(block, replacement);
        console.log(`Successfully added login translations for: ${lang}`);
    } else {
        console.error(`Failed to find block for language: ${lang}`);
    }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished updating translations.js');
