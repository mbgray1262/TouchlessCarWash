import { slugify } from './constants';

export interface EquipmentBrandData {
  slug: string;
  label: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  website?: string;
}

export interface EquipmentModelData {
  slug: string;
  name: string;
  brandSlug: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
}

export const EQUIPMENT_BRAND_DATA: EquipmentBrandData[] = [
  {
    slug: 'pdq',
    label: 'PDQ (LaserWash)',
    description: 'PDQ Manufacturing is one of the most recognized names in touchless car wash technology. Their LaserWash line uses high-pressure water jets and specially formulated detergents to clean vehicles without any physical contact, delivering a safe and effective wash every time.',
    seoTitle: 'PDQ LaserWash Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using PDQ LaserWash equipment. PDQ is one of the leading manufacturers of touchless automatic car wash systems in the United States.',
    website: 'https://www.pdqinc.com',
  },
  {
    slug: 'washworld',
    label: 'WashWorld',
    description: 'WashWorld manufactures the Razor line of touchless car wash systems, known for their reliability and low maintenance requirements. Their equipment features advanced chemical delivery systems and high-pressure wash technology popular with independent operators.',
    seoTitle: 'WashWorld Razor Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using WashWorld Razor equipment. WashWorld is a leading manufacturer of reliable, low-maintenance touchless wash systems.',
    website: 'https://www.washworldinc.com',
  },
  {
    slug: 'belanger',
    label: 'Belanger',
    description: 'Belanger is a leading manufacturer of vehicle wash systems with a history spanning over 50 years. Their touchless systems, including the Kondor and FreeStyler lines, are engineered for high performance and consistent cleaning results across a wide range of vehicle sizes.',
    seoTitle: 'Belanger Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Belanger equipment. Belanger has over 50 years of experience manufacturing high-performance vehicle wash systems.',
    website: 'https://www.belangerinc.com',
  },
  {
    slug: 'ryko',
    label: 'Ryko',
    description: 'Ryko Solutions offers a comprehensive range of car wash equipment including touchless systems. Their SoftGloss and Radius lines provide effective cleaning through precision-engineered water delivery and advanced chemical application systems.',
    seoTitle: 'Ryko Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Ryko equipment. Ryko offers comprehensive car wash solutions including touchless automatic systems.',
    website: 'https://www.ryko.com',
  },
  {
    slug: 'istobal',
    label: 'Istobal',
    description: 'Istobal is a Spanish multinational company and one of the largest vehicle wash equipment manufacturers in the world. Their M\'NEX series of touchless systems combines European engineering with innovative water recycling technology for efficient, eco-friendly washing.',
    seoTitle: 'Istobal Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Istobal equipment. Istobal is a global leader in vehicle wash technology with innovative touchless systems.',
    website: 'https://www.istobal.com',
  },
  {
    slug: 'ds',
    label: 'D&S',
    description: 'D&S Car Wash Systems manufactures touchless in-bay automatic wash equipment designed for durability and consistent performance. Their IQ Touch Free systems are widely used across the United States, offering advanced cleaning capabilities with minimal maintenance.',
    seoTitle: 'D&S Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using D&S Car Wash Systems equipment. D&S manufactures durable, high-performance touchless in-bay automatic wash systems.',
  },
  {
    slug: 'petit',
    label: 'Petit AutoWash',
    description: 'Petit AutoWash specializes in automatic car wash equipment with their Accutrac line of touchless systems. Known for their innovative track-mounted overhead carriage design, Petit systems deliver thorough cleaning while accommodating a wide range of vehicle sizes.',
    seoTitle: 'Petit AutoWash Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Petit AutoWash Accutrac equipment. Petit is known for innovative track-mounted touchless wash systems.',
    website: 'https://www.petitautowash.com',
  },
  {
    slug: 'oasis',
    label: 'Oasis',
    description: 'Oasis Car Wash Systems manufactures touchless automatic wash equipment with a focus on water efficiency and cleaning performance. Their Typhoon and XR series systems are designed for high-volume operations with consistent, streak-free results.',
    seoTitle: 'Oasis Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Oasis equipment. Oasis manufactures efficient touchless wash systems designed for high-volume operations.',
  },
  {
    slug: 'mark_vii',
    label: 'Mark VII',
    description: 'Mark VII Equipment is a WashTec company offering a diverse range of vehicle wash solutions. Their ChoiceWash and AquaJet touchless systems are designed for flexibility and high throughput, making them popular choices for gas station and convenience store locations.',
    seoTitle: 'Mark VII Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Mark VII equipment. Mark VII, a WashTec company, offers versatile touchless wash systems for high-throughput locations.',
    website: 'https://www.markvii.net',
  },
  {
    slug: 'karcher',
    label: 'Kärcher',
    description: 'Kärcher is a German family-owned company and the world\'s leading provider of cleaning technology. Their commercial car wash systems combine precision German engineering with environmentally conscious water and energy management for superior cleaning results.',
    seoTitle: 'Kärcher Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Kärcher equipment. Kärcher is a global leader in cleaning technology with precision-engineered car wash systems.',
    website: 'https://www.kaercher.com',
  },
  {
    slug: 'autec',
    label: 'Autec',
    description: 'Autec manufactures automatic car wash systems with a focus on touchless technology. Their Evolution series systems are designed for ease of use and reliable performance, serving both independent operators and multi-location chains across North America.',
    seoTitle: 'Autec Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Autec equipment. Autec manufactures reliable touchless car wash systems for independent operators and chains.',
    website: 'https://www.autecinc.com',
  },
  {
    slug: 'saber',
    label: 'Saber',
    description: 'Saber manufactures touchless automatic car wash equipment designed for durability and consistent cleaning performance. Their systems are used by independent car wash operators and small chains seeking reliable, cost-effective touchless wash solutions.',
    seoTitle: 'Saber Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Saber equipment. Saber manufactures durable, cost-effective touchless wash systems for independent operators.',
  },
  {
    slug: 'broadway',
    label: 'Broadway',
    description: 'Broadway manufactures car wash equipment including their Wonder Bar touchless system. Known for straightforward, reliable operation, Broadway systems serve independent car wash locations looking for dependable touchless wash technology.',
    seoTitle: 'Broadway Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Broadway equipment. Broadway manufactures reliable touchless wash systems including the Wonder Bar.',
  },
  {
    slug: 'hydrospray',
    label: 'Hydro-Spray',
    description: 'Hydro-Spray manufactures in-bay automatic touchless car wash systems designed for self-serve car wash locations. Their equipment provides effective touchless cleaning with an emphasis on water efficiency and ease of maintenance.',
    seoTitle: 'Hydro-Spray Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Hydro-Spray equipment. Hydro-Spray manufactures in-bay automatic touchless wash systems.',
    website: 'https://www.hydrospray.com',
  },
  {
    slug: 'dencar',
    label: 'Dencar Technology',
    description: 'Dencar Technology manufactures automatic car wash equipment including the Dynawash Express touchless system. Their equipment is designed for efficient, high-quality cleaning with modern control systems and user-friendly operation.',
    seoTitle: 'Dencar Technology Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Dencar Technology equipment including the Dynawash Express touchless wash system.',
  },
  {
    slug: 'ns_corp',
    label: 'NS Corporation',
    description: 'NS Corporation manufactures car wash equipment and systems. Their touchless wash technology is used by operators seeking reliable, automated cleaning solutions for their car wash facilities.',
    seoTitle: 'NS Corporation Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using NS Corporation equipment and touchless wash systems.',
  },
  {
    slug: 'delta_sonic',
    label: 'Delta Sonic',
    description: 'Delta Sonic uses proprietary, custom-built car wash equipment designed and engineered in-house. Their touchless wash technology is exclusively used across Delta Sonic locations, featuring purpose-built systems optimized for their specific wash processes.',
    seoTitle: 'Delta Sonic Touchless Car Wash Locations',
    seoDescription: 'Find Delta Sonic touchless car wash locations. Delta Sonic uses proprietary custom-built car wash equipment designed in-house.',
    website: 'https://www.deltasoniccarwash.com',
  },
  {
    slug: 'super_wash',
    label: 'Super Wash',
    description: 'Super Wash is a car wash chain operating touchless automatic locations across the Midwest and eastern United States. Their locations offer convenient, automated touchless washing with consistent service quality across all sites.',
    seoTitle: 'Super Wash Touchless Car Wash Locations',
    seoDescription: 'Find Super Wash touchless car wash locations. Super Wash operates touchless automatic car wash locations across the Midwest and eastern US.',
    website: 'https://www.superwash.com',
  },
  {
    slug: 'shinewash',
    label: 'Shinewash',
    description: 'Shinewash manufactures car wash equipment and systems for touchless automatic washing. Their technology focuses on delivering a clean, spot-free finish through precision water application and chemical delivery.',
    seoTitle: 'Shinewash Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Shinewash equipment and touchless wash systems.',
  },
];

export const EQUIPMENT_MODEL_DATA: EquipmentModelData[] = [
  // PDQ models
  { slug: 'laserwash-360', name: 'LaserWash 360', brandSlug: 'pdq', description: 'The LaserWash 360 is PDQ\'s flagship touchless car wash system featuring a rotating wash arm that cleans vehicles from every angle. It uses high-pressure water and precision-applied chemicals for a thorough, touch-free clean.', seoTitle: 'PDQ LaserWash 360 Car Wash Locations', seoDescription: 'Find touchless car washes using the PDQ LaserWash 360. The LaserWash 360 is PDQ\'s flagship touchless system with a rotating wash arm for complete coverage.' },
  { slug: 'laserwash-360-plus', name: 'LaserWash 360 Plus', brandSlug: 'pdq', description: 'The LaserWash 360 Plus is an enhanced version of PDQ\'s flagship system, featuring the LaserGlow LED lighting arch and FlashDry integrated drying system for simultaneous rinsing and drying.', seoTitle: 'PDQ LaserWash 360 Plus Car Wash Locations', seoDescription: 'Find touchless car washes using the PDQ LaserWash 360 Plus with LED LaserGlow arch and FlashDry drying system.' },
  { slug: 'laserwash-4000', name: 'LaserWash 4000', brandSlug: 'pdq', description: 'The LaserWash 4000 is a proven touchless in-bay automatic system from PDQ, featuring a T-bar positioning system for precise wash coverage. A reliable workhorse used at thousands of car wash locations.', seoTitle: 'PDQ LaserWash 4000 Car Wash Locations', seoDescription: 'Find touchless car washes using the PDQ LaserWash 4000. A proven touchless system with T-bar positioning for precise wash coverage.' },
  { slug: 'laserwash-g5', name: 'LaserWash G5', brandSlug: 'pdq', description: 'The LaserWash G5 is PDQ\'s next-generation compact touchless wash system, designed for modern car wash operations with advanced cleaning technology in a smaller footprint.', seoTitle: 'PDQ LaserWash G5 Car Wash Locations', seoDescription: 'Find touchless car washes using the PDQ LaserWash G5 next-generation compact touchless wash system.' },
  { slug: 'laserwash-m5', name: 'LaserWash M5', brandSlug: 'pdq', description: 'The LaserWash M5 from PDQ is designed for high-volume car wash operations, delivering fast, efficient touchless cleaning with advanced chemical delivery and rinse systems.', seoTitle: 'PDQ LaserWash M5 Car Wash Locations', seoDescription: 'Find touchless car washes using the PDQ LaserWash M5, designed for high-volume touchless cleaning operations.' },
  { slug: 'laserwash-sentry', name: 'LaserWash Sentry', brandSlug: 'pdq', description: 'The LaserWash Sentry is PDQ\'s entry-level touchless car wash system, offering the core LaserWash cleaning technology in a cost-effective package for smaller operations.', seoTitle: 'PDQ LaserWash Sentry Car Wash Locations', seoDescription: 'Find touchless car washes using the PDQ LaserWash Sentry entry-level touchless wash system.' },
  { slug: 'protouch', name: 'ProTouch', brandSlug: 'pdq', description: 'The PDQ ProTouch is a friction-based automatic car wash system that can also operate in touchless mode. It offers operators flexibility to provide both wash types from a single machine.', seoTitle: 'PDQ ProTouch Car Wash Locations', seoDescription: 'Find car washes using the PDQ ProTouch automatic wash system with both touch and touchless wash capabilities.' },
  { slug: 'tandem-surfline', name: 'Tandem Surfline', brandSlug: 'pdq', description: 'The PDQ Tandem Surfline is a dual-wash system designed for high-throughput car wash operations. It allows two vehicles to be washed simultaneously, significantly increasing wash capacity.', seoTitle: 'PDQ Tandem Surfline Car Wash Locations', seoDescription: 'Find car washes using the PDQ Tandem Surfline dual-wash system for high-throughput operations.' },
  { slug: 'access', name: 'Access', brandSlug: 'pdq', description: 'The PDQ Access is an entry system and payment terminal designed to work with PDQ wash equipment, providing seamless customer payment and wash selection integration.', seoTitle: 'PDQ Access Car Wash Locations', seoDescription: 'Find car washes using PDQ Access payment and entry systems.' },

  // WashWorld models
  { slug: 'razor', name: 'Razor', brandSlug: 'washworld', description: 'The WashWorld Razor is a popular touchless in-bay automatic car wash system known for its reliability and low maintenance costs. It delivers effective cleaning through high-pressure water and chemical application.', seoTitle: 'WashWorld Razor Touchless Car Wash Locations', seoDescription: 'Find touchless car washes using the WashWorld Razor, a reliable and low-maintenance touchless in-bay automatic system.' },
  { slug: 'razor-edge', name: 'Razor Edge', brandSlug: 'washworld', description: 'The WashWorld Razor Edge is an upgraded version of the Razor with enhanced cleaning capabilities and LED lighting features, delivering a premium wash experience.', seoTitle: 'WashWorld Razor Edge Car Wash Locations', seoDescription: 'Find touchless car washes using the WashWorld Razor Edge with enhanced cleaning and LED lighting.' },
  { slug: 'razor-touch', name: 'Razor Touch', brandSlug: 'washworld', description: 'The WashWorld Razor Touch combines touchless and soft-touch wash capabilities in a single machine, giving operators flexibility to offer multiple wash types.', seoTitle: 'WashWorld Razor Touch Car Wash Locations', seoDescription: 'Find car washes using the WashWorld Razor Touch with both touchless and soft-touch capabilities.' },
  { slug: 'razor-xr', name: 'Razor XR', brandSlug: 'washworld', description: 'The WashWorld Razor XR is the extended-reach model in the Razor line, designed to accommodate larger vehicles including trucks and SUVs.', seoTitle: 'WashWorld Razor XR Car Wash Locations', seoDescription: 'Find touchless car washes using the WashWorld Razor XR, designed for larger vehicles.' },
  { slug: 'profile', name: 'Profile', brandSlug: 'washworld', description: 'The WashWorld Profile is a touchless car wash system designed for efficient cleaning with a focus on water and chemical conservation.', seoTitle: 'WashWorld Profile Car Wash Locations', seoDescription: 'Find touchless car washes using the WashWorld Profile automatic wash system.' },

  // Belanger models
  { slug: 'kondor', name: 'Kondor', brandSlug: 'belanger', description: 'The Belanger Kondor is a premium touchless in-bay automatic car wash system featuring a distinctive V-shaped carriage design for optimal cleaning coverage across all vehicle types.', seoTitle: 'Belanger Kondor Touchless Car Wash Locations', seoDescription: 'Find touchless car washes using the Belanger Kondor premium in-bay automatic system.' },
  { slug: 'eclipse', name: 'Eclipse', brandSlug: 'belanger', description: 'The Belanger Eclipse is a versatile car wash system offering both touchless and friction wash modes, providing operators with maximum flexibility.', seoTitle: 'Belanger Eclipse Car Wash Locations', seoDescription: 'Find car washes using the Belanger Eclipse versatile wash system.' },
  { slug: 'freestyler', name: 'FreeStyler', brandSlug: 'belanger', description: 'The Belanger FreeStyler is an automatic car wash system designed for high-volume operations with efficient throughput and consistent wash quality.', seoTitle: 'Belanger FreeStyler Car Wash Locations', seoDescription: 'Find car washes using the Belanger FreeStyler automatic wash system.' },
  { slug: 'spinlite', name: 'SpinLite', brandSlug: 'belanger', description: 'The Belanger SpinLite is a compact automatic car wash system designed for locations with limited space, delivering quality washes in a smaller footprint.', seoTitle: 'Belanger SpinLite Car Wash Locations', seoDescription: 'Find car washes using the Belanger SpinLite compact automatic wash system.' },
  { slug: 'vector', name: 'Vector', brandSlug: 'belanger', description: 'The Belanger Vector is an advanced automatic car wash system featuring modern design and engineering for superior cleaning performance.', seoTitle: 'Belanger Vector Car Wash Locations', seoDescription: 'Find car washes using the Belanger Vector automatic wash system.' },

  // Ryko models
  { slug: 'softgloss', name: 'SoftGloss', brandSlug: 'ryko', description: 'The Ryko SoftGloss is a touchless automatic car wash system designed to deliver a thorough clean with a glossy finish using precision water jets and chemical application.', seoTitle: 'Ryko SoftGloss Touchless Car Wash Locations', seoDescription: 'Find touchless car washes using the Ryko SoftGloss automatic wash system.' },
  { slug: 'softgloss-maxx', name: 'SoftGloss Maxx', brandSlug: 'ryko', description: 'The Ryko SoftGloss Maxx is an enhanced version of the SoftGloss with additional cleaning power and features for a premium touchless wash experience.', seoTitle: 'Ryko SoftGloss Maxx Car Wash Locations', seoDescription: 'Find touchless car washes using the Ryko SoftGloss Maxx enhanced wash system.' },
  { slug: 'radius', name: 'Radius', brandSlug: 'ryko', description: 'The Ryko Radius is a touchless automatic car wash system with an overhead arm design that provides comprehensive cleaning coverage for all vehicle sizes.', seoTitle: 'Ryko Radius Touchless Car Wash Locations', seoDescription: 'Find touchless car washes using the Ryko Radius automatic wash system.' },

  // Istobal models
  { slug: 'mnex-22', name: "M'NEX 22", brandSlug: 'istobal', description: "The Istobal M'NEX 22 is a compact touchless car wash system ideal for locations with limited space, delivering European-engineered cleaning performance.", seoTitle: "Istobal M'NEX 22 Car Wash Locations", seoDescription: "Find touchless car washes using the Istobal M'NEX 22 compact touchless wash system." },
  { slug: 'mnex-25', name: "M'NEX 25", brandSlug: 'istobal', description: "The Istobal M'NEX 25 is a mid-range touchless car wash system offering advanced water recycling and energy-efficient operation.", seoTitle: "Istobal M'NEX 25 Car Wash Locations", seoDescription: "Find touchless car washes using the Istobal M'NEX 25 touchless wash system." },
  { slug: 'mnex-32', name: "M'NEX 32", brandSlug: 'istobal', description: "The Istobal M'NEX 32 is a premium touchless car wash system with advanced features for high-volume commercial car wash operations.", seoTitle: "Istobal M'NEX 32 Car Wash Locations", seoDescription: "Find touchless car washes using the Istobal M'NEX 32 premium touchless wash system." },
  { slug: 'istobal-1900', name: 'ISTOBAL 1900', brandSlug: 'istobal', description: 'The ISTOBAL 1900 is a robust touchless car wash system designed for heavy-duty commercial applications with high throughput requirements.', seoTitle: 'ISTOBAL 1900 Car Wash Locations', seoDescription: 'Find touchless car washes using the ISTOBAL 1900 commercial touchless wash system.' },

  // D&S models
  { slug: 'iq-2-0-touch-free', name: 'IQ 2.0 Touch Free', brandSlug: 'ds', description: 'The D&S IQ 2.0 Touch Free is an advanced touchless in-bay automatic car wash system with intelligent vehicle profiling and precision chemical application for a thorough, contact-free clean.', seoTitle: 'D&S IQ 2.0 Touch Free Car Wash Locations', seoDescription: 'Find touchless car washes using the D&S IQ 2.0 Touch Free in-bay automatic system.' },
  { slug: 'carwash-systems', name: 'Carwash Systems', brandSlug: 'ds', description: 'D&S Carwash Systems offers a range of automatic car wash equipment designed for reliable, high-performance washing in both touchless and friction configurations.', seoTitle: 'D&S Carwash Systems Locations', seoDescription: 'Find car washes using D&S Carwash Systems automatic wash equipment.' },

  // Petit models
  { slug: 'accutrac-360i', name: 'Accutrac 360i', brandSlug: 'petit', description: 'The Petit AutoWash Accutrac 360i is a touchless in-bay automatic with a unique dual-arm overhead carriage that provides 360-degree cleaning coverage for all vehicle sizes.', seoTitle: 'Petit AutoWash Accutrac 360i Car Wash Locations', seoDescription: 'Find touchless car washes using the Petit AutoWash Accutrac 360i dual-arm system.' },
  { slug: 'accutrac-360t', name: 'Accutrac 360t', brandSlug: 'petit', description: 'The Petit AutoWash Accutrac 360t is a touchless car wash system designed for high-throughput operations with fast cycle times and comprehensive cleaning.', seoTitle: 'Petit AutoWash Accutrac 360t Car Wash Locations', seoDescription: 'Find touchless car washes using the Petit AutoWash Accutrac 360t system.' },
  { slug: 'accutrac-mini', name: 'Accutrac Mini', brandSlug: 'petit', description: 'The Petit AutoWash Accutrac Mini is a compact touchless car wash system designed for smaller bays and locations with limited space.', seoTitle: 'Petit AutoWash Accutrac Mini Car Wash Locations', seoDescription: 'Find touchless car washes using the Petit AutoWash Accutrac Mini compact system.' },

  // Oasis models
  { slug: 'typhoon', name: 'Typhoon', brandSlug: 'oasis', description: 'The Oasis Typhoon is a high-performance touchless car wash system featuring a horizontal spray bar design for powerful, efficient cleaning.', seoTitle: 'Oasis Typhoon Touchless Car Wash Locations', seoDescription: 'Find touchless car washes using the Oasis Typhoon high-performance touchless system.' },
  { slug: 'xr-1000', name: 'XR-1000', brandSlug: 'oasis', description: 'The Oasis XR-1000 is an extended-reach touchless car wash system designed to handle larger vehicles including trucks, vans, and SUVs.', seoTitle: 'Oasis XR-1000 Car Wash Locations', seoDescription: 'Find touchless car washes using the Oasis XR-1000 extended-reach wash system.' },

  // Mark VII models
  { slug: 'choicewash-xt', name: 'ChoiceWash XT', brandSlug: 'mark_vii', description: 'The Mark VII ChoiceWash XT is a versatile touchless car wash system designed for convenience store and gas station locations, offering multiple wash packages.', seoTitle: 'Mark VII ChoiceWash XT Car Wash Locations', seoDescription: 'Find touchless car washes using the Mark VII ChoiceWash XT system.' },
  { slug: 'choicewash-ct', name: 'ChoiceWash CT', brandSlug: 'mark_vii', description: 'The Mark VII ChoiceWash CT combines touch and touchless wash capabilities in a single machine for maximum operational flexibility.', seoTitle: 'Mark VII ChoiceWash CT Car Wash Locations', seoDescription: 'Find car washes using the Mark VII ChoiceWash CT combination wash system.' },
  { slug: 'aquajet', name: 'AquaJet', brandSlug: 'mark_vii', description: 'The Mark VII AquaJet is a touchless automatic car wash system featuring high-pressure water jets and advanced chemical delivery for efficient cleaning.', seoTitle: 'Mark VII AquaJet Car Wash Locations', seoDescription: 'Find touchless car washes using the Mark VII AquaJet automatic system.' },
  { slug: 'softline', name: 'SoftLine', brandSlug: 'mark_vii', description: 'The Mark VII SoftLine is a friction-based automatic car wash system using soft foam materials for gentle yet thorough vehicle cleaning.', seoTitle: 'Mark VII SoftLine Car Wash Locations', seoDescription: 'Find car washes using the Mark VII SoftLine soft-touch wash system.' },

  // Kärcher models
  { slug: 'cwb-3', name: 'CWB 3', brandSlug: 'karcher', description: 'The Kärcher CWB 3 is a premium touchless car wash system featuring German-engineered precision water delivery and eco-friendly water management.', seoTitle: 'Kärcher CWB 3 Car Wash Locations', seoDescription: 'Find touchless car washes using the Kärcher CWB 3 premium German-engineered wash system.' },
  { slug: 'cb-1-28', name: 'CB 1/28', brandSlug: 'karcher', description: 'The Kärcher CB 1/28 is an automatic car wash gantry system designed for efficient, high-quality cleaning with minimal water consumption.', seoTitle: 'Kärcher CB 1/28 Car Wash Locations', seoDescription: 'Find car washes using the Kärcher CB 1/28 automatic gantry wash system.' },
  { slug: 'cb-2-28', name: 'CB 2/28', brandSlug: 'karcher', description: 'The Kärcher CB 2/28 is a mid-range automatic car wash system offering reliable performance with Kärcher\'s signature engineering quality.', seoTitle: 'Kärcher CB 2/28 Car Wash Locations', seoDescription: 'Find car washes using the Kärcher CB 2/28 automatic wash system.' },
  { slug: 'cb-3-32', name: 'CB 3/32', brandSlug: 'karcher', description: 'The Kärcher CB 3/32 is a premium commercial car wash system designed for high-volume operations with advanced cleaning technology.', seoTitle: 'Kärcher CB 3/32 Car Wash Locations', seoDescription: 'Find car washes using the Kärcher CB 3/32 premium commercial wash system.' },

  // Autec models
  { slug: 'evolution', name: 'Evolution', brandSlug: 'autec', description: 'The Autec Evolution is a touchless car wash system designed for reliable, automated operation with minimal maintenance requirements.', seoTitle: 'Autec Evolution Car Wash Locations', seoDescription: 'Find touchless car washes using the Autec Evolution automatic wash system.' },
  { slug: 'ev-1-evolution', name: 'EV-1 Evolution', brandSlug: 'autec', description: 'The Autec EV-1 Evolution is an advanced iteration of the Evolution series with enhanced cleaning capabilities and modern control systems.', seoTitle: 'Autec EV-1 Evolution Car Wash Locations', seoDescription: 'Find touchless car washes using the Autec EV-1 Evolution wash system.' },
  { slug: 'aes-425', name: 'AES-425', brandSlug: 'autec', description: 'The Autec AES-425 is a touchless automatic car wash system engineered for consistent performance in high-demand environments.', seoTitle: 'Autec AES-425 Car Wash Locations', seoDescription: 'Find touchless car washes using the Autec AES-425 automatic system.' },
  { slug: 'express-automatic', name: 'Express Automatic', brandSlug: 'autec', description: 'The Autec Express Automatic is designed for fast, efficient touchless car washing with reduced cycle times for high-throughput operations.', seoTitle: 'Autec Express Automatic Car Wash Locations', seoDescription: 'Find touchless car washes using the Autec Express Automatic system.' },

  // Oasis additional
  // Broadway models
  // Hydro-Spray models
  { slug: 'in-bay-automatic-iba', name: 'In Bay Automatic (IBA)', brandSlug: 'hydrospray', description: 'The Hydro-Spray In Bay Automatic is a touchless wash system designed for self-serve car wash locations, providing automated touchless cleaning in a standard wash bay.', seoTitle: 'Hydro-Spray In Bay Automatic Car Wash Locations', seoDescription: 'Find touchless car washes using the Hydro-Spray In Bay Automatic (IBA) system.' },

  // Dencar models
  { slug: 'dynawash-express', name: 'Dynawash Express', brandSlug: 'dencar', description: 'The Dencar Dynawash Express is a touchless automatic car wash system with modern controls and efficient cleaning technology.', seoTitle: 'Dencar Dynawash Express Car Wash Locations', seoDescription: 'Find touchless car washes using the Dencar Dynawash Express automatic system.' },

  // Delta Sonic
  { slug: 'custom-tunnel', name: 'Custom Tunnel', brandSlug: 'delta_sonic', description: 'Delta Sonic uses proprietary custom-built tunnel wash equipment designed and engineered in-house for their exclusive use across all Delta Sonic locations.', seoTitle: 'Delta Sonic Custom Tunnel Car Wash Locations', seoDescription: 'Find Delta Sonic car wash locations using their proprietary custom tunnel wash equipment.' },
];

// --- Helper functions ---

export function slugifyModel(name: string): string {
  return slugify(name);
}

export function getBrandBySlug(slug: string): EquipmentBrandData | undefined {
  return EQUIPMENT_BRAND_DATA.find(b => b.slug === slug);
}

export function getModelBySlug(brandSlug: string, modelSlug: string): EquipmentModelData | undefined {
  return EQUIPMENT_MODEL_DATA.find(m => m.brandSlug === brandSlug && m.slug === modelSlug);
}

export function getModelsByBrand(brandSlug: string): EquipmentModelData[] {
  return EQUIPMENT_MODEL_DATA.filter(m => m.brandSlug === brandSlug);
}

/** Map brand slug to display label (convenience for non-page usage) */
export function getBrandLabel(slug: string): string {
  return EQUIPMENT_BRAND_DATA.find(b => b.slug === slug)?.label ?? slug;
}
