-- Jobs pt_BR — ordem Untitled-2 (118 trabalhos)
-- Posição 1 = order 118; posição 118 = order 1 (sort DESC no frontend)
-- Idempotente: pode rodar mais de uma vez

-- Duplicata legada fora da grade
UPDATE edp_posts SET status = 'draft', meta_values = json_set(meta_values, '$.order', 0)
WHERE slug = 'devs-de-impacto-open-ai-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';

-- 118 | pos   1 | NEM TE CONTO - LUANA PIOVANI E A FOFOCA | AUDIBLE
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 118) WHERE slug = 'nem-te-conto-luana-piovani-e-a-fofoca-audible-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 117 | pos   2 | TRUCO MASTERS
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 117) WHERE slug = 'truco-masters-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 116 | pos   3 | ABERTO AO PÚBLICO | GLOBO
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 116) WHERE slug = 'aberto-ao-publico-globo-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 115 | pos   4 | PÍLULA DE FARINHA - O ESCÂNDALO QUE GEROU VIDAS
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 115) WHERE slug = 'pilula-de-farinha-o-escandalo-que-gerou-vidas-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 114 | pos   5 | NO RITMO DA LORE | TEMPORADA 4
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 114) WHERE slug = 'no-ritmo-da-lore-temporada-4-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 113 | pos   6 | MARKETING DAY - NEM TE CONTO COM LUANA PIOVANI | AUDIBLE
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 113) WHERE slug = 'marketing-day-nem-te-conto-com-luana-piovani-audible-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 112 | pos   7 | HAPPY HOUR FORA DA CASA COM VALEN BANDEIRA | DISNEY +
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 112) WHERE slug = 'happy-hour-fora-da-casa-com-valen-bandeira-disney-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 111 | pos   8 | DO QUE RIEM? | PARAMOUNT+
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 111) WHERE slug = 'do-que-riem-paramount-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 110 | pos   9 | DEVDAY EXCHANGE | OPEN AI
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 110) WHERE slug = 'devday-exchange-open-ai-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 109 | pos  10 | NO RITMO DA LORE
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 109) WHERE slug = 'no-ritmo-da-lore-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 108 | pos  11 | ORGANIZAÇÃO PURA - NOVELA VERTICAL | BV FINANCEIRA
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 108) WHERE slug = 'organizacao-pura-novela-vertical-bv-financeira-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 107 | pos  12 | FAMILHÃO | DOMINGÃO DO HUCK
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 107) WHERE slug = 'familhao-domingao-do-huck-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 106 | pos  13 | LANÇAMENTO LIGHTYEAR | DISNEY
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 106) WHERE slug = 'lancamento-lightyear-disney-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 105 | pos  14 | TOCA REVELA - O REALITY | UOL
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 105) WHERE slug = 'toca-revela-o-reality-uol-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 104 | pos  15 | CONTROLE DE QUALIDADE COM REGINA VOLPATO | PARAMOUNT +
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 104) WHERE slug = 'controle-de-qualidade-com-regina-volpato-paramount-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 103 | pos  16 | RAFI
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 103) WHERE slug = 'rafi-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 102 | pos  17 | CAMPANHA DIGITAL - PÍLULA DE FARINHA | HBO MAX
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 102) WHERE slug = 'campanha-digital-pilula-de-farinha-hbo-max-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 101 | pos  18 | DIAS DAS MÃES DUDALINA COM MARIA FERNANDA CÂNDIDO
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 101) WHERE slug = 'dias-das-maes-dudalina-com-maria-fernanda-candido-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
-- 100 | pos  19 | CORRIDA DE SÃO SYLVESTER | PARAMOUNT+
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 100) WHERE slug = 'corrida-de-sao-sylvester-paramount-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  99 | pos  20 | O PODER DA ESCOLHA | RENNOVA
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 99) WHERE slug = 'o-poder-da-escolha-rennova-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  98 | pos  21 | TATI FOLIA 2025
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 98) WHERE slug = 'tati-folia-2025-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  97 | pos  22 | POSSO MANDAR ÁUDIO? | GLOBOPLAY
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 97) WHERE slug = 'posso-mandar-audio-globoplay-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  96 | pos  23 | EXPEDIÇÃO ULTRAVIOLETA | NUBANK
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 96) WHERE slug = 'expedicao-ultravioleta-nubank-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  95 | pos  24 | CURSO LIVELO | LIVELO
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 95) WHERE slug = 'curso-livelo-livelo-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  94 | pos  25 | CAMPANHA DIGITAL: ABERTO AO PÚBLICO TEMPORADA 1 E 2 | TVGLOBO
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 94) WHERE slug = 'campanha-digital-aberto-ao-publico-temporada-1-e-2-tvglobo-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  93 | pos  26 | KNUCKLES | PARAMOUNT +
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 93) WHERE slug = 'knuckles-paramount-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  92 | pos  27 | NATAL | DUDALINA
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 92) WHERE slug = 'natal-dudalina-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  91 | pos  28 | PIX | ITAÚ
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 91) WHERE slug = 'pix-itau-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  90 | pos  29 | SUPER LIVE BLACK FRIDAY | SHOPTIME
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 90) WHERE slug = 'super-live-black-friday-shoptime-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  89 | pos  30 | ROCK IN RIO | TIM
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 89) WHERE slug = 'rock-in-rio-tim-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  88 | pos  31 | DIA DOS PAIS | FARFETCH
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 88) WHERE slug = 'dia-dos-pais-farfetch-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  87 | pos  32 | PROJETO UPLOAD | CNN BRASIL
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 87) WHERE slug = 'projeto-upload-cnn-brasil-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  86 | pos  33 | LANÇAMENTO LUCA | DISNEY+
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 86) WHERE slug = 'lancamento-luca-disney-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  85 | pos  34 | DIA DAS MÃES | DUDALINA
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 85) WHERE slug = 'dia-das-maes-dudalina-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  84 | pos  35 | JÁ FUI VOCÊ | NATURA + MIBR
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 84) WHERE slug = 'ja-fui-voce-natura-mibr-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  83 | pos  36 | GASTRONOMIA PERIFÉRICA | CONTINENTAL
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 83) WHERE slug = 'gastronomia-periferica-continental-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  82 | pos  37 | DIA DOS PAIS | DUDALINA
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 82) WHERE slug = 'dia-dos-pais-dudalina-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  81 | pos  38 | DIA DAS MÃES | SHEIN
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 81) WHERE slug = 'dia-das-maes-shein-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  80 | pos  39 | BOCA A BOCA | LIVE
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 80) WHERE slug = 'boca-a-boca-live-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  79 | pos  40 | ESPECIAL LUCA | DISNEY
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 79) WHERE slug = 'especial-luca-disney-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  78 | pos  41 | PALCO PARAMOUNT CCXP23 | PARAMOUNT+
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 78) WHERE slug = 'palco-paramount-ccxp23-paramount-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  77 | pos  42 | LIVE OSCAR | OMELETE
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 77) WHERE slug = 'live-oscar-omelete-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  76 | pos  43 | MÁS BUENO. MÁS BREYERS | BREYERS
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 76) WHERE slug = 'mas-bueno-mas-breyers-breyers-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  75 | pos  44 | ENERGIA VERDE | HEINEKEN
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 75) WHERE slug = 'energia-verde-heineken-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  74 | pos  45 | CCXP WORLDS 2021 – ROAD TO ARTISTS’ VALLEY | SANTANDER
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 74) WHERE slug = 'ccxp-worlds-2021-road-to-artists-valley-santander-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  73 | pos  46 | FOI MAU | REDETV!
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 73) WHERE slug = 'foi-mau-redetv-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  72 | pos  47 | LANÇAMENTO UM CAVALEIRO EM MOSCOU | PARAMOUNT +
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 72) WHERE slug = 'lancamento-um-cavaleiro-em-moscou-paramount-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  71 | pos  48 | FOCA EM 2023 | FOQUINHA
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 71) WHERE slug = 'foca-em-2023-foquinha-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  70 | pos  49 | SUPOSITÓRIO | SPOTIFY
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 70) WHERE slug = 'supositorio-spotify-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  69 | pos  50 | OTALAB | UOL
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 69) WHERE slug = 'otalab-uol-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  68 | pos  51 | REDES SOCIAIS ÚLTIMAS FÉRIAS | STAR+
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 68) WHERE slug = 'redes-sociais-ultimas-ferias-star-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  67 | pos  52 | VIDENTE POR ACIDENTE | CINEMA
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 67) WHERE slug = 'vidente-por-acidente-cinema-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  66 | pos  53 | CCXP WORLDS 2020 | OMELETE
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 66) WHERE slug = 'ccxp-worlds-2020-omelete-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  65 | pos  54 | DESEJOS S.A. | STAR+
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 65) WHERE slug = 'desejos-sa-star-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  64 | pos  55 | QUADROS ORIGINAIS REDES | LUCIANO HUCK
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 64) WHERE slug = 'quadros-originais-redes-luciano-huck-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  63 | pos  56 | ART ATTACK – MODO DESAFIO | DISNEY
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 63) WHERE slug = 'art-attack-modo-desafio-disney-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  62 | pos  57 | FOQUINHA ENTREVISTA | VIDEOCAST
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 62) WHERE slug = 'foquinha-entrevista-videocast-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  61 | pos  58 | CTRL SER + CTRL VER | UNIVERSA UOL
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 61) WHERE slug = 'ctrl-ser-ctrl-ver-universa-uol-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  60 | pos  59 | TÁ VOANDO | ITAÚ
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 60) WHERE slug = 'ta-voando-itau-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  59 | pos  60 | #LEGADO | CANNABIS THINKING
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 59) WHERE slug = 'legado-cannabis-thinking-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  58 | pos  61 | LADY LESTE | GLÓRIA GROOVE
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 58) WHERE slug = 'lady-leste-gloria-groove-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  57 | pos  62 | GATO GALÁCTICO E O FEITIÇO DO TEMPO | CINEMA
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 57) WHERE slug = 'gato-galactico-e-o-feitico-do-tempo-cinema-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  56 | pos  63 | À MODA DA ISA | UOL
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 56) WHERE slug = 'a-moda-da-isa-uol-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  55 | pos  64 | À MODA DA ISA – VERÃO | UOL
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 55) WHERE slug = 'a-moda-da-isa-verao-uol-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  54 | pos  65 | FOCA EM 2021 | TIK TOK
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 54) WHERE slug = 'foca-em-2021-tik-tok-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  53 | pos  66 | PODCASTS PORTA DOS FUNDOS | DEEZER
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 53) WHERE slug = 'podcasts-porta-dos-fundos-deezer-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  52 | pos  67 | PLANTÃO | LIQUIDA SHOPTIME
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 52) WHERE slug = 'plantao-liquida-shoptime-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  51 | pos  68 | RECEITAS DE FIM DE SEMANA | NESTLÉ
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 51) WHERE slug = 'receitas-de-fim-de-semana-nestle-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  50 | pos  69 | MAIS VIVIDAS | MOLICO
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 50) WHERE slug = 'mais-vividas-molico-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  49 | pos  70 | PÕE CREMOSIDADE NISSO | NESTLÉ
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 49) WHERE slug = 'poe-cremosidade-nisso-nestle-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  48 | pos  71 | DEU RUIM | RECEITAS NESTLÉ
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 48) WHERE slug = 'deu-ruim-receitas-nestle-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  47 | pos  72 | NUTRI AJUDA | NUTREN
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 47) WHERE slug = 'nutri-ajuda-nutren-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  46 | pos  73 | CHOCOLATERIA | GAROTO
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 46) WHERE slug = 'chocolateria-garoto-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  45 | pos  74 | ESCOLHAS CERTAS | MAGGI
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 45) WHERE slug = 'escolhas-certas-maggi-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  44 | pos  75 | BRASIL SABORES MIL | RECEITAS NESTLÉ
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 44) WHERE slug = 'brasil-sabores-mil-receitas-nestle-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  43 | pos  76 | DONOS DA RAZÃO | PODCAST
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 43) WHERE slug = 'donos-da-razao-podcast-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  42 | pos  77 | KIUNE TALKS | KIUNE
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 42) WHERE slug = 'kiune-talks-kiune-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  41 | pos  78 | BATALHA DOS ELIMINADOS | SPLASH UOL
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 41) WHERE slug = 'batalha-dos-eliminados-splash-uol-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  40 | pos  79 | #LOGITECHNABGS | LOGITECH
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 40) WHERE slug = 'logitechnabgs-logitech-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  39 | pos  80 | COMPRO LIKES | STAR+
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 39) WHERE slug = 'compro-likes-star-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  38 | pos  81 | ACUVUE | REDES OTAVIANO E FLÁVIA ALESSANDRA
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 38) WHERE slug = 'acuvue-redes-otaviano-e-flavia-alessandra-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  37 | pos  82 | TODDY | REDES OTAVIANO COSTA
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 37) WHERE slug = 'toddy-redes-otaviano-costa-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  36 | pos  83 | A ÚLTIMA PEÇA | CINEMA
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 36) WHERE slug = 'a-ultima-peca-cinema-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  35 | pos  84 | CREATORS | KWAI
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 35) WHERE slug = 'creators-kwai-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  34 | pos  85 | CAFÉ COM LATE SHOW | NESCAFÉ
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 34) WHERE slug = 'cafe-com-late-show-nescafe-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  33 | pos  86 | DE VOLTA PARA UM FUTURO MELHOR | NESTLÉ
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 33) WHERE slug = 'de-volta-para-um-futuro-melhor-nestle-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  32 | pos  87 | NESTATUETA DE OURO | NESCAU
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 32) WHERE slug = 'nestatueta-de-ouro-nescau-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  31 | pos  88 | NESTON CHEF | NESTON
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 31) WHERE slug = 'neston-chef-neston-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  30 | pos  89 | CONVENÇÃO COMERCIAL | NESTLÉ
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 30) WHERE slug = 'convencao-comercial-nestle-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  29 | pos  90 | ABERTURA CONVENÇÃO | NESTLÉ
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 29) WHERE slug = 'abertura-convencao-nestle-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  28 | pos  91 | CONVENÇÃO | STARBUCKS
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 28) WHERE slug = 'convencao-starbucks-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  27 | pos  92 | LANÇAMENTO | STAR+
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 27) WHERE slug = 'lancamento-star-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  26 | pos  93 | MIL E UMA TRETAS | VIDEOCAST
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 26) WHERE slug = 'mil-e-uma-tretas-videocast-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  25 | pos  94 | TERAPIA COM EX | HISTÓRIAS DE TERAPIA
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 25) WHERE slug = 'terapia-com-ex-historias-de-terapia-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  24 | pos  95 | MONSTER MANSION | FANTA
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 24) WHERE slug = 'monster-mansion-fanta-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  23 | pos  96 | PLANTA FAZ ISSO? | VIDEOCAST
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 23) WHERE slug = 'planta-faz-isso-videocast-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  22 | pos  97 | POSSO EXPLICAR COM MIÁ MELLO | NATGEO
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 22) WHERE slug = 'posso-explicar-com-mia-mello-natgeo-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  21 | pos  98 | COACH NADA | LADDY NADA
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 21) WHERE slug = 'coach-nada-laddy-nada-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  20 | pos  99 | MEME DA COMÉDIA | TNT
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 20) WHERE slug = 'meme-da-comedia-tnt-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  19 | pos 100 | FOCA EM 2020 | LIVE
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 19) WHERE slug = 'foca-em-2020-live-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  18 | pos 101 | PREPARE SEU CORAÇÃO | SPOTIFY
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 18) WHERE slug = 'prepare-seu-coracao-spotify-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  17 | pos 102 | ASCENDENTE EM MÚSICA | SPOTIFY
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 17) WHERE slug = 'ascendente-em-musica-spotify-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  16 | pos 103 | ROMA | NETFLIX
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 16) WHERE slug = 'roma-netflix-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  15 | pos 104 | CONSELHO FORA DE CLASSE | VIDEOCAST
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 15) WHERE slug = 'conselho-fora-de-classe-videocast-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  14 | pos 105 | THE CROWN COM ELZA SOARES | NETFLIX
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 14) WHERE slug = 'the-crown-com-elza-soares-netflix-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  13 | pos 106 | DIÁRIO DO OLIVIER | GNT
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 13) WHERE slug = 'diario-do-olivier-gnt-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  12 | pos 107 | INTERROGATÓRIO COM KEVIN - ELITE | NETFLIX
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 12) WHERE slug = 'interrogatorio-com-kevin-elite-netflix-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  11 | pos 108 | RESOLVI ESPERAR COM SANDY - LA CASA DE PAPEL | NETFLIX
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 11) WHERE slug = 'resolvi-esperar-com-sandy-la-casa-de-papel-netflix-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--  10 | pos 109 | MATILHA | FRANCISCO EL HOMBRE
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 10) WHERE slug = 'matilha-francisco-el-hombre-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--   9 | pos 110 | EL CAMINO COM MAURICIO MEIRELLES | NETFLIX
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 9) WHERE slug = 'el-camino-com-mauricio-meirelles-netflix-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--   8 | pos 111 | SEUS MOMENTOS SUA VIDA | CANON
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 8) WHERE slug = 'seus-momentos-sua-vida-canon-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--   7 | pos 112 | O MAIOR RÓTULO DO MUNDO | HEINZ
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 7) WHERE slug = 'o-maior-rotulo-do-mundo-heinz-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--   6 | pos 113 | QUEM VIVER, VERÃO | SKOL
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 6) WHERE slug = 'quem-viver-verao-skol-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--   5 | pos 114 | #CHEGADEESTIGMA | INTIMUS / KOTEX
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 5) WHERE slug = 'chegadeestigma-intimus-kotex-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--   4 | pos 115 | #RECEITASDEUMAPANELASÓ | ROCHEDO
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 4) WHERE slug = 'receitasdeumapanelaso-rochedo-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--   3 | pos 116 | LANÇAMENTOS | NETFLIX
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 3) WHERE slug = 'lancamentos-netflix-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--   2 | pos 117 | CONVENÇÃO | NESTLÉ
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 2) WHERE slug = 'convencao-nestle-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
--   1 | pos 118 | RECEITAS NESTLÉ | NESTLÉ
UPDATE edp_posts SET meta_values = json_set(meta_values, '$.order', 1) WHERE slug = 'receitas-nestle-nestle-pt-br' AND json_extract(meta_values, '$.posttype') = 'jobs';
