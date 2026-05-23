// ─── Subsoccer Pro App Multi-Language Dictionary & i18n Logic ───

const TRANSLATIONS = {
    en: {
        my_profile: "MY PROFILE",
        my_games: "MY GAMES",
        register_a_game: "REGISTER A GAME",
        buy_your_own: "BUY YOUR OWN SUBSOCCER",
        log_out: "LOG OUT",
        map_title: "MAP",
        map_tagline: "Find · Play · Connect",
        join_game: "JOIN GAME",
        join_game_desc: "Scan QR code to join or enter table code",
        players_in_countries: "Players in 80+ countries · Join the community",
        select_language: "LANGUAGE",
        physical_games: "PHYSICAL GAMES",
        add_new: "ADD NEW",
        configure: "CONFIGURE",
        digital_assets: "DIGITAL ASSETS",
        digital_pro_card: "Digital Pro Card",
        active_subscription: "Active Subscription",
        digital_card_desc: "Your digital player identity. Grants access to Pro Leagues and ELO rankings.",
        view_card: "VIEW CARD",
        empty_no_games_title: "No Registered Games",
        empty_no_games_desc: "You haven't registered any Subsoccer games yet.",
        register_gear_btn: "REGISTER A GAME",
        loading_assets: "Loading assets...",
        register_your_product: "REGISTER YOUR PRODUCT",
        register_product_desc: "Enter the serial number from your product sticker to activate your warranty and digital features.",
        serial_number_label: "Serial Number",
        found_under_product: "Found on the sticker underneath your product",
        continue_button: "CONTINUE",
        step_enter_code: "1. Enter code",
        step_enter_code_done: "1. Enter code ✓",
        step_details: "2. Your details",
        step_details_done: "2. Your details ✓",
        step_done: "3. Done!",
        pro_leagues: "PRO LEAGUES",
        give_feedback: "GIVE FEEDBACK",
        moderator_tools: "MODERATOR TOOLS",
        register_your_game_btn: "REGISTER YOUR GAME",
        open_app: "OPEN THE APP",
        start_playing: "Start playing now",
        product_registered: "PRODUCT REGISTERED!",
        product_registered_desc: "Your product is now part of the Subsoccer network."
    },
    fr: {
        my_profile: "MON PROFIL",
        my_games: "MES JEUX",
        register_a_game: "ENREGISTRER UN JEU",
        buy_your_own: "ACHETER VOTRE SUBSOCCER",
        log_out: "SE DÉCONNECTER",
        map_title: "CARTE",
        map_tagline: "Trouver · Jouer · Connecter",
        join_game: "REJOINDRE LE JEU",
        join_game_desc: "Scannez le code QR pour rejoindre ou entrez le code de table",
        players_in_countries: "Joueurs dans 80+ pays · Rejoignez la communauté",
        select_language: "LANGUE",
        physical_games: "JEUX PHYSIQUES",
        add_new: "AJOUTER",
        configure: "CONFIGURER",
        digital_assets: "ACTIFS NUMÉRIQUES",
        digital_pro_card: "Carte Pro Numérique",
        active_subscription: "Abonnement Actif",
        digital_card_desc: "Votre identité de joueur numérique. Donne accès aux ligues pro et aux classements ELO.",
        view_card: "VOIR LA CARTE",
        empty_no_games_title: "Aucun jeu enregistré",
        empty_no_games_desc: "Vous n'avez pas encore enregistré de jeux Subsoccer.",
        register_gear_btn: "ENREGISTRER UN JEU",
        loading_assets: "Chargement des actifs...",
        register_your_product: "ENREGISTRER VOTRE PRODUIT",
        register_product_desc: "Entrez le numéro de série figurant sur l'autocollant de votre produit pour activer votre garantie et vos fonctionnalités numériques.",
        serial_number_label: "Numéro de série",
        found_under_product: "Trouvé sur l'autocollant sous votre produit",
        continue_button: "CONTINUER",
        step_enter_code: "1. Entrer le code",
        step_enter_code_done: "1. Entrer le code ✓",
        step_details: "2. Vos coordonnées",
        step_details_done: "2. Vos coordonnées ✓",
        step_done: "3. Terminé!",
        pro_leagues: "LIGUES PRO",
        give_feedback: "DONNER VOTRE AVIS",
        moderator_tools: "OUTILS DE MODÉRATEUR",
        register_your_game_btn: "ENREGISTRER VOTRE JEU",
        open_app: "AVAA SOVELLUS",
        start_playing: "Aloita pelaaminen heti",
        product_registered: "PRODUIT ENREGISTRÉ!",
        product_registered_desc: "Votre produit fait désormais partie du réseau Subsoccer."
    },
    es: {
        my_profile: "MI PERFIL",
        my_games: "MIS JUEGOS",
        register_a_game: "REGISTRAR UN JUEGO",
        buy_your_own: "COMPRA TU PROPIO SUBSOCCER",
        log_out: "CERRAR SESIÓN",
        map_title: "MAPA",
        map_tagline: "Buscar · Jugar · Conectar",
        join_game: "UNIRSE AL JUEGO",
        join_game_desc: "Escanea el código QR para unirte o introduce el código de la mesa",
        players_in_countries: "Jugadores en más de 80 países · Únete a la comunidad",
        select_language: "IDIOMA",
        physical_games: "JUEGOS FÍSICOS",
        add_new: "AÑADIR",
        configure: "CONFIGURAR",
        digital_assets: "ACTIVOS DIGITALES",
        digital_pro_card: "Tarjeta Pro Digital",
        active_subscription: "Suscripción Activa",
        digital_card_desc: "Tu identidad de jugador digital. Da acceso a ligas profesionales y clasificaciones ELO.",
        view_card: "VER TARJETA",
        empty_no_games_title: "No hay juegos registrados",
        empty_no_games_desc: "Aún no has registrado ningún juego de Subsoccer.",
        register_gear_btn: "REGISTRAR UN JUEGO",
        loading_assets: "Cargando activos...",
        register_your_product: "REGISTRA TU PRODUCTO",
        register_product_desc: "Introduce el número de serie de la etiqueta de tu producto para activar la garantía y las funciones digitales.",
        serial_number_label: "Número de serie",
        found_under_product: "Se encuentra en la etiqueta debajo del producto",
        continue_button: "CONTINUAR",
        step_enter_code: "1. Introducir código",
        step_enter_code_done: "1. Introducir código ✓",
        step_details: "2. Tus datos",
        step_details_done: "2. Tus datos ✓",
        step_done: "3. ¡Listo!",
        pro_leagues: "LIGAS PRO",
        give_feedback: "DANOS TU OPINIÓN",
        moderator_tools: "HERRAMIENTAS DE MODERADOR",
        register_your_game_btn: "REGISTRA TU JUEGO",
        open_app: "ABRIR LA APLICACIÓN",
        start_playing: "Comenzar a jugar ahora",
        product_registered: "¡PRODUCTO REGISTRADO!",
        product_registered_desc: "Tu producto ahora forma parte de la red de Subsoccer."
    },
    de: {
        my_profile: "MEIN PROFIL",
        my_games: "MEINE SPIELE",
        register_a_game: "SPIEL REGISTRIEREN",
        buy_your_own: "KAUFE DEIN EIGENES SUBSOCCER",
        log_out: "ABMELDEN",
        map_title: "KARTE",
        map_tagline: "Finden · Spielen · Verbinden",
        join_game: "SPIEL BEITRETEN",
        join_game_desc: "Scanne den QR-Code, um beizutreten, oder gib den Tischcode ein",
        players_in_countries: "Spieler in über 80 Ländern · Tritt der Community bei",
        select_language: "SPRACHE",
        physical_games: "PHYSISCHE SPIELE",
        add_new: "HINZUFÜGEN",
        configure: "KONFIGURIEREN",
        digital_assets: "DIGITALE ASSETS",
        digital_pro_card: "Digitale Pro-Karte",
        active_subscription: "Aktives Abonnement",
        digital_card_desc: "Deine digitale Spieleridentität. Gewährt Zugang zu Pro-Ligen und ELO-Rankings.",
        view_card: "KARTE ANZEIGEN",
        empty_no_games_title: "Keine registrierten Spiele",
        empty_no_games_desc: "Du hast noch keine Subsoccer-Spiele registriert.",
        register_gear_btn: "SPIEL REGISTRIEREN",
        loading_assets: "Lade Assets...",
        register_your_product: "PRODUKT REGISTRIEREN",
        register_product_desc: "Gib die Seriennummer vom Produktaufkleber ein, um deine Garantie und digitalen Funktionen zu aktivieren.",
        serial_number_label: "Seriennummer",
        found_under_product: "Auf dem Aufkleber unter deinem Produkt zu finden",
        continue_button: "WEITER",
        step_enter_code: "1. Code eingeben",
        step_enter_code_done: "1. Code eingeben ✓",
        step_details: "2. Deine Details",
        step_details_done: "2. Deine Details ✓",
        step_done: "3. Fertig!",
        pro_leagues: "PRO-LIGEN",
        give_feedback: "FEEDBACK GEBEN",
        moderator_tools: "MODERATOR-TOOLS",
        register_your_game_btn: "SPIEL REGISTRIEREN",
        open_app: "APP ÖFFNEN",
        start_playing: "Jetzt spielen",
        product_registered: "PRODUKT REGISTRIERT!",
        product_registered_desc: "Dein Produkt ist jetzt Teil des Subsoccer-Netzwerks."
    },
    pt: {
        my_profile: "MEU PERFIL",
        my_games: "MEUS JOGOS",
        register_a_game: "REGISTRAR UM JOGO",
        buy_your_own: "COMPRE SEU PRÓPRIO SUBSOCCER",
        log_out: "SAIR",
        map_title: "MAPA",
        map_tagline: "Encontrar · Jogar · Conectar",
        join_game: "ENTRAR NO JOGO",
        join_game_desc: "Escaneie o código QR para entrar ou insira o código da mesa",
        players_in_countries: "Jogadores em mais de 80 países · Junte-se à comunidade",
        select_language: "IDIOMA",
        physical_games: "JOGOS FÍSICOS",
        add_new: "ADICIONAR",
        configure: "CONFIGURAR",
        digital_assets: "ATIVOS DIGITAIS",
        digital_pro_card: "Cartão Pro Digital",
        active_subscription: "Assinatura Ativa",
        digital_card_desc: "Sua identidade digital de jogador. Dá acesso a ligas profissionais e classificações ELO.",
        view_card: "VER CARTÃO",
        empty_no_games_title: "Nenhum jogo registrado",
        empty_no_games_desc: "Você ainda não registrou nenhum jogo da Subsoccer.",
        register_gear_btn: "REGISTRAR UM JOGO",
        loading_assets: "Carregando ativos...",
        register_your_product: "REGISTRAR SEU PRODUTO",
        register_product_desc: "Insira o número de série do adesivo do produto para ativar a garantia e os recursos digitais.",
        serial_number_label: "Número de série",
        found_under_product: "Encontrado no adesivo embaixo do produto",
        continue_button: "CONTINUAR",
        step_enter_code: "1. Inserir código",
        step_enter_code_done: "1. Inserir koodi ✓",
        step_details: "2. Seus detalhes",
        step_details_done: "2. Seus detalhes ✓",
        step_done: "3. Concluído!",
        pro_leagues: "LIGAS PRO",
        give_feedback: "DAR FEEDBACK",
        moderator_tools: "FERRAMENTAS DO MODERADOR",
        register_your_game_btn: "REGISTRAR SEU JOGO",
        open_app: "ABRIR O APLICATIVO",
        start_playing: "Começar a jogar agora",
        product_registered: "PRODUTO REGISTRADO!",
        product_registered_desc: "Seu produto agora faz parte da rede Subsoccer."
    }
};

// Determine default language: check storage first, then browser locale, fallback to 'en'
let currentLang = localStorage.getItem('subsoccer-lang');
if (!currentLang) {
    const browserLang = navigator.language ? navigator.language.substring(0, 2).toLowerCase() : 'en';
    currentLang = TRANSLATIONS[browserLang] ? browserLang : 'en';
}

function t(key) {
    return TRANSLATIONS[currentLang][key] || TRANSLATIONS['en'][key] || key;
}

function setLanguage(lang) {
    if (TRANSLATIONS[lang]) {
        currentLang = lang;
        localStorage.setItem('subsoccer-lang', lang);
        document.documentElement.lang = lang;
        translateDOM();
        
        // Dispatch custom event to notify dynamic UI loaders if necessary
        window.dispatchEvent(new CustomEvent('subsoccer-language-changed', { detail: lang }));
    }
}

function translateDOM(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);
        if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'email' || el.type === 'password' || el.placeholder)) {
            el.placeholder = translation;
        } else {
            el.textContent = translation;
        }
    });

    // Auto-update select element value if it exists
    const select = root === document ? document.getElementById('lang-select') : root.querySelector('#lang-select');
    if (select) {
        select.value = currentLang;
    }
}

// Initial auto-translation on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => translateDOM());
} else {
    translateDOM();
}
document.documentElement.lang = currentLang;

// ─── Header Flag Sync Logic ───
const FLAG_MAP = {
    en: '🇬🇧',
    fr: '🇫🇷',
    es: '🇪🇸',
    de: '🇩🇪',
    pt: '🇵🇹'
};

function updateHeaderFlag(lang) {
    const flagEl = document.getElementById('current-flag-emoji');
    if (flagEl && FLAG_MAP[lang]) {
        flagEl.textContent = FLAG_MAP[lang];
    }
    const selectEl = document.getElementById('header-lang-select');
    if (selectEl) {
        selectEl.value = lang;
    }
}

// Listen for changes to keep header flags in sync
window.addEventListener('subsoccer-language-changed', (e) => {
    updateHeaderFlag(e.detail);
});

// Run initially when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => updateHeaderFlag(currentLang));
} else {
    updateHeaderFlag(currentLang);
}
