// src/constants/importPrompts.ts
// Prompts sugeridos para importación masiva con GPT

export const IMPORT_PROMPTS = {
  advocates: `Busca 50 referentes del ecosistema DeFi en México y América Latina. Para cada uno, extrae la siguiente información y genera un archivo JSON con este formato exacto:

[
  {
    "name": "Nombre Completo",
    "email": "email@ejemplo.com",
    "bio": "Biografía detallada de 2-3 párrafos sobre su trayectoria en DeFi, blockchain y crypto. Incluye proyectos en los que ha trabajado, su experiencia y contribuciones al ecosistema.",
    "location": "Ciudad, País",
    "expertise": "Área principal de especialización",
    "track": "developer|lawyer|financial|designer|marketer|other",
    "twitter_url": "https://x.com/usuario o https://twitter.com/usuario",
    "github_url": "https://github.com/usuario",
    "linkedin_url": "https://linkedin.com/in/usuario",
    "website": "https://sitio.com",
    "specializations": ["Skill1", "Skill2", "Skill3"],
    "achievements": ["Logro 1", "Logro 2"],
    "is_featured": false,
    "is_active": true
  }
]

Categorías (track):
- developer: Desarrolladores, programadores blockchain
- lawyer: Abogados especializados en crypto
- financial: Analistas financieros, traders DeFi
- designer: Diseñadores UX/UI Web3
- marketer: Marketing, community managers
- other: Otros roles relevantes`,

  startups: `Busca 50 startups DeFi en México y América Latina. Para cada una, extrae la siguiente información y genera un archivo JSON con este formato exacto:

[
  {
    "name": "Nombre de la Startup",
    "tagline": "Frase corta que describe la startup (máx 100 caracteres)",
    "description": "Descripción detallada de 2-3 párrafos sobre qué hace la startup, su propuesta de valor, problema que resuelve y solución que ofrece.",
    "category": "DeFi|NFT|DAO|DEX|Lending|Staking|Gaming|Infrastructure",
    "stage": "MVP|Grants|Pre-seed|Seed|Series A|Series B|Series C+",
    "location": "Ciudad, País",
    "founded_year": 2023,
    "team_size": 10,
    "website": "https://startup.com",
    "twitter_url": "https://x.com/startup",
    "github_url": "https://github.com/startup",
    "linkedin_url": "https://linkedin.com/company/startup",
    "logo_url": "https://logo.url",
    "tags": ["DeFi", "Ethereum", "Lending"],
    "is_featured": false,
    "status": "draft"
  }
]

Categorías (category):
- DeFi: Protocolos DeFi
- NFT: NFTs, marketplaces
- DAO: Organizaciones descentralizadas
- DEX: Exchanges descentralizados
- Lending: Préstamos DeFi
- Staking: Staking protocols
- Gaming: GameFi, play-to-earn
- Infrastructure: Wallets, nodes, APIs

Etapas (stage) - IMPORTANTE:
- MVP: Proyectos MVP de hackathons (aparecerán en sección MVPs Hackathon)
- Grants: Proyectos con grants
- Pre-seed: Etapa pre-seed
- Seed: Etapa seed
- Series A: Serie A
- Series B: Serie B
- Series C+: Serie C o posterior`,

  communities: `Busca 50 comunidades DeFi/Web3 en México y América Latina. Para cada una, extrae la siguiente información y genera un archivo JSON con este formato exacto:

[
  {
    "name": "Nombre de la Comunidad",
    "description": "Descripción detallada de 2-3 párrafos sobre la comunidad, qué hacen, objetivos, actividades principales y cómo ayudan al ecosistema.",
    "type": "dao|protocol|educational|social|investment|developer|other",
    "location": "Ciudad, País",
    "member_count": 500,
    "founded_year": 2022,
    "website": "https://comunidad.com",
    "twitter_url": "https://x.com/comunidad",
    "discord_url": "https://discord.gg/invite",
    "telegram_url": "https://t.me/comunidad",
    "linkedin_url": "https://linkedin.com/company/comunidad",
    "logo_url": "https://logo.url",
    "tags": ["DeFi", "Community", "Education"],
    "meeting_frequency": "weekly|monthly|quarterly|adhoc",
    "is_active": true,
    "is_verified": false,
    "is_featured": false
  }
]

Tipos (type):
- dao: Organizaciones descentralizadas
- protocol: Comunidades de protocolos
- educational: Educativas, talleres
- social: Networking, eventos sociales
- investment: Inversión, trading
- developer: Desarrolladores
- other: Otros

Meeting frequency: weekly, monthly, quarterly, adhoc`,

  events: `Busca 50 eventos DeFi/Web3 en México y América Latina (pasados, actuales y futuros). Para cada uno, extrae la siguiente información y genera un archivo JSON con este formato exacto:

[
  {
    "title": "Nombre del Evento",
    "description": "Descripción detallada de 2-3 párrafos sobre el evento, agenda, speakers, temas principales y qué pueden esperar los asistentes.",
    "type": "conference|workshop|meetup|hackathon|webinar|other",
    "format": "presential|virtual|hybrid",
    "date": "2024-03-15",
    "end_date": "2024-03-17",
    "time": "09:00",
    "location": "Nombre del Venue, Ciudad, País",
    "address": "Dirección completa",
    "organizer": "Nombre del organizador",
    "website": "https://evento.com",
    "registration_url": "https://registro.com",
    "twitter_url": "https://x.com/evento",
    "image_url": "https://imagen.url",
    "price": 0,
    "currency": "MXN",
    "capacity": 200,
    "tags": ["DeFi", "Conference", "Networking"],
    "is_featured": false,
    "status": "upcoming|ongoing|past|cancelled"
  }
]

Tipos (type):
- conference: Conferencias grandes
- workshop: Talleres prácticos
- meetup: Reuniones casuales
- hackathon: Hackatones
- webinar: Seminarios online
- other: Otros

Format: presential, virtual, hybrid
Status: upcoming, ongoing, past, cancelled
Currency: MXN, USD

IMPORTANTE: Usa formato ISO para fechas (YYYY-MM-DD) y formato 24h para tiempo (HH:MM)`,

  blog: `Busca 50 artículos de blog sobre DeFi, Web3 y blockchain en México y América Latina. Para cada uno, extrae la siguiente información y genera un archivo JSON con este formato exacto:

[
  {
    "title": "Título del Artículo",
    "slug": "titulo-del-articulo",
    "excerpt": "Resumen breve de 1-2 párrafos que captura la esencia del artículo y engancha al lector.",
    "content": "Contenido completo del artículo en formato Markdown. Incluye:\n\n## Introducción\n\nTexto de introducción...\n\n## Sección 1\n\nContenido...\n\n## Sección 2\n\nMás contenido...\n\n## Conclusión\n\nConclusión del artículo.",
    "category": "defi|web3|nft|blockchain|tutorial|news|analysis|other",
    "tags": ["DeFi", "Ethereum", "Tutorial"],
    "image_url": "https://imagen.url",
    "is_published": true,
    "is_featured": false,
    "author_id": null,
    "reading_time": 5,
    "meta_description": "Meta descripción para SEO (máx 160 caracteres)",
    "meta_keywords": ["keyword1", "keyword2", "keyword3"]
  }
]

Categorías (category):
- defi: Artículos sobre DeFi
- web3: Web3 y descentralización
- nft: NFTs y coleccionables
- blockchain: Tecnología blockchain
- tutorial: Tutoriales y guías
- news: Noticias del ecosistema
- analysis: Análisis de mercado
- other: Otros temas

IMPORTANTE:
- El slug debe ser la versión del título en minúsculas, sin acentos, separado por guiones
- El content debe estar en formato Markdown con encabezados ##, listas, enlaces, etc.
- El reading_time es el tiempo estimado de lectura en minutos
- El author_id se dejará null para asignarlo manualmente después
- Incluye meta_description y meta_keywords para SEO`,

  jobs: `Busca 50 ofertas de trabajo Web3/DeFi en México y América Latina. Para cada una, extrae la siguiente información y genera un archivo JSON con este formato exacto:

[
  {
    "title": "Título del Puesto",
    "company": "Nombre de la Empresa",
    "company_logo": "https://logo.url",
    "location": "Ciudad, País o Remoto México",
    "job_type": "remote|hybrid|onsite",
    "category": "Engineering|Product|Marketing|Security|Legal & Compliance|Design|Operations|Finance",
    "salary_min": 50000,
    "salary_max": 80000,
    "salary_currency": "USD",
    "experience_level": "Junior (0-2 años)|Mid (2-4 años)|Senior (5+ años)|Lead/Manager",
    "tags": ["Solidity", "React", "Web3.js", "DeFi"],
    "description": "Descripción detallada del puesto de 2-3 párrafos. Incluye responsabilidades principales, proyectos en los que trabajará y el impacto que tendrá en el equipo.",
    "requirements": "- Requisito 1\\n- Requisito 2\\n- Requisito 3",
    "benefits": "- Beneficio 1\\n- Beneficio 2\\n- Beneficio 3",
    "apply_url": "https://empresa.com/careers/puesto",
    "apply_email": "jobs@empresa.com",
    "is_featured": false,
    "status": "published"
  }
]

Categorías (category):
- Engineering: Desarrollo, DevOps, Smart Contracts
- Product: Product Management, Project Management
- Marketing: Marketing, Growth, Community
- Security: Seguridad, Auditoría
- Legal & Compliance: Legal, Compliance, Regulatorio
- Design: UX/UI, Diseño Gráfico
- Operations: Operaciones, RRHH, Admin
- Finance: Finanzas, Contabilidad, Tesorería

Tipos de trabajo (job_type):
- remote: Trabajo 100% remoto
- hybrid: Híbrido (oficina + remoto)
- onsite: Presencial

Niveles de experiencia:
- Junior (0-2 años)
- Mid (2-4 años)
- Senior (5+ años)
- Lead/Manager

IMPORTANTE:
- El salary_min y salary_max son números enteros (sin comas ni símbolos)
- El salary_currency es "USD" o "MXN"
- Los tags deben incluir tecnologías y habilidades específicas
- El apply_url debe ser un link válido para aplicar
- El status debe ser "published" para que aparezca públicamente`,
};
