import { Work, Testimonial, WebContent } from './types';

export const INITIAL_WORKS: Work[] = [
  {
    id: "work-1",
    title: "Residencia Industrial Vanguardia",
    description: "Vivienda unifamiliar premium desarrollada íntegramente en Steel Frame de perfilería pesada de 150mm. Cuenta con planta abierta, voladizos metálicos imponentes y una envolvente térmica de última generación con barrera de viento y agua exterior.",
    imageUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=1200",
    category: "Viviendas",
    location: "Nordelta, Buenos Aires",
    date: "Enero 2026",
    featured: true,
    createdAt: new Date("2026-01-15T12:00:00Z").toISOString()
  },
  {
    id: "work-2",
    title: "Showroom y Oficinas Steel-Max",
    description: "Estructura comercial de dos plantas construida en tiempo récord de 4 meses. Combina entrepisos secos de chapa prepintada y paneles de yeso reforzado con placa de cemento exterior texturada, optimizando la acústica en oficinas corporativas.",
    imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=1200",
    category: "Comerciales",
    location: "Pilar, Buenos Aires",
    date: "Marzo 2026",
    featured: true,
    createdAt: new Date("2026-03-10T12:00:00Z").toISOString()
  },
  {
    id: "work-3",
    title: "Ampliación de Planta Alta Loft",
    description: "Ampliación de 85m² sobre losa preexistente sin sobrecargar la estructura de la vivienda original, gracias a la ligereza estructural del Steel Frame. Excelente aislamiento con lana de vidrio con foil de aluminio y placas de roca de yeso.",
    imageUrl: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&q=80&w=1200",
    category: "Ampliaciones",
    location: "San Isidro, Buenos Aires",
    date: "Noviembre 2025",
    featured: false,
    createdAt: new Date("2025-11-20T12:00:00Z").toISOString()
  },
  {
    id: "work-4",
    title: "Remodelación Integral Fachada Bronce",
    description: "Revestimiento de fachada usando perfiles estructurales livianos y placas cementicias de alta resistencia. El diseño incorpora acabados de acero cepillado y texturas marrones símil madera cepillada libres de mantenimiento.",
    imageUrl: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&q=80&w=1200",
    category: "Remodelaciones",
    location: "Rosario, Santa Fe",
    date: "Febrero 2026",
    featured: true,
    createdAt: new Date("2026-02-05T12:00:00Z").toISOString()
  },
  {
    id: "work-5",
    title: "Complejo Residencial EcoSteel",
    description: "Tres unidades habitacionales de alta eficiencia energética con paneles Steel Frame multicapa independientes. Logra una reducción del 60% en costos de climatización activa de por vida gracias a aislantes EPS y barreras térmicas continuas.",
    imageUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=1200",
    category: "Viviendas",
    location: "Córdoba Capital, Córdoba",
    date: "Diciembre 2025",
    featured: false,
    createdAt: new Date("2025-12-01T12:00:00Z").toISOString()
  },
  {
    id: "work-6",
    title: "Ampliación Quincho Moderno",
    description: "Estructura semicubierta y cerrada de 50 metros cuadrados. Cuenta con perfiles galvanizados estructurales de 100mm, cielorrasos suspendidos de placa desmontable termoacústica y carpinterías con doble vidriado hermético (DVH).",
    imageUrl: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&q=80&w=1200",
    category: "Ampliaciones",
    location: "Pinamar, Buenos Aires",
    date: "Septiembre 2025",
    featured: false,
    createdAt: new Date("2025-09-18T12:00:00Z").toISOString()
  }
];

export const INITIAL_TESTIMONIALS: Testimonial[] = [
  {
    id: "testimonial-1",
    name: "Arq. Mariano Sforza",
    review: "Como arquitecto, la precisión estructural de TAO-CHI me resultó asombrosa. Plomos perfectos, escuadras milimétricas y un cumplimiento estricto del cronograma establecido. Su equipo está sumamente capacitado técnicamente en sistemas de construcción en seco.",
    rating: 5,
    photoUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=300",
    projectTitle: "Residencia Nordelta",
    createdAt: new Date("2026-02-12T12:00:00Z").toISOString()
  },
  {
    id: "testimonial-2",
    name: "Patricia Gilli",
    review: "Hicimos la ampliación en planta alta con TAO-CHI y la experiencia fue inmejorable. La obra fue limpia, seca y en menos de 60 días ya estábamos viviendo en el nuevo espacio. No sufrimos la típica complicación de la obra tradicional humeda. El aislamiento de frío y calor es excelente.",
    rating: 5,
    photoUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=300",
    projectTitle: "Ampliación Planta Alta",
    createdAt: new Date("2026-03-01T12:00:00Z").toISOString()
  },
  {
    id: "testimonial-3",
    name: "Estudio Ruiz & Asociados",
    review: "Excelente servicio integral clave en mano. Nos resolvieron desde el replanteo fundacional de platea hasta los acabados premium interiores de yesería y pintura. El sistema Steel Frame nos permitió inaugurar las oficinas comerciales mucho antes de lo previsto.",
    rating: 5,
    photoUrl: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=300",
    projectTitle: "Showroom Pilar",
    createdAt: new Date("2026-03-15T12:00:00Z").toISOString()
  }
];

export const INITIAL_WEB_CONTENT: WebContent = {
  heroHeadline: "Construimos el futuro con Steel Frame",
  heroSubheadline: "Sistemas constructivos premium llave en mano. Rapidez, plazos garantizados y máxima eficiencia termoacústica para tus proyectos más exigentes.",
  heroType: "image",
  heroImageUrl: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&q=80&w=1600",
  aboutText: "En TAO-CHI Servicio Integral somos apasionados de la ingeniería civil aplicada a la vivienda. Nos especializamos exclusivamente en el sistema constructivo Steel Frame (Steel Framing), ofreciendo un servicio de excelencia llave en mano. Contamos con ingenieros, técnicos proyectistas y oficiales montadores de primer nivel para brindar construcciones precisas, seguras y de máxima durabilidad. Cuidamos cada detalle constructivo, garantizando un aislamiento térmico y acústico superior, reduciendo tiempos de entrega en un 60% en relación a la obra húmeda convencional.",
  whatsappNumber: "5491122334455",
  whatsappMessage: "Hola, quiero solicitar un presupuesto para una obra en Steel Frame de TAO-CHI.",
  instagramUrl: "https://www.instagram.com/taochiserviciointegral",
  n8nWebhookUrl: "",
  aiSystemInstruction: "Sos el asistente de IA oficial de TAO-CHI Servicio Integral en Argentina. Tu especialidad es asesorar amablemente sobre construcción premium en Steel Frame. Explicá sus increíbles beneficios: ahorro energético del 60%, cálculo milimétrico, reducción de plazos de obra a menos de la mitad, y ligereza estructural ideal para ampliaciones. Saborizá tus respuestas con calidez, jerga técnica comprensible argentina y asistí constructivamente. Siempre invitá al usuario a solicitar un presupuesto técnico en el formulario del sitio o contactarnos por WhatsApp.",
  statsCompletedWorks: "100+",
  statsYearsExperience: "15+",
  statsSatisfiedClients: "100%"
};
