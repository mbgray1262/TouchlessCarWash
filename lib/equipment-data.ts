import { slugify } from './constants';

export interface EquipmentBrandData {
  slug: string;
  label: string;
  description: string;
  history?: string;
  features?: string[];
  seoTitle: string;
  seoDescription: string;
  website?: string;
}

export interface EquipmentModelData {
  slug: string;
  name: string;
  brandSlug: string;
  description: string;
  keyFeatures?: string[];
  bestFor?: string;
  seoTitle: string;
  seoDescription: string;
}

export const EQUIPMENT_BRAND_DATA: EquipmentBrandData[] = [
  {
    slug: 'pdq',
    label: 'PDQ (LaserWash)',
    description: 'PDQ Manufacturing is one of the most recognized names in touchless car wash technology, headquartered in De Pere, Wisconsin. Their LaserWash line has become nearly synonymous with touchless car washing in the United States, using high-pressure water jets and precisely formulated detergents to clean vehicles without any physical contact. PDQ systems are trusted by thousands of operators ranging from independent car wash owners to major convenience store and gas station chains.',
    history: 'Founded in 1984, PDQ Manufacturing revolutionized the car wash industry with the introduction of the LaserWash touchless system. The company pioneered the use of profiling technology that maps each vehicle\'s shape to deliver targeted cleaning. Over the decades, PDQ has continuously innovated, introducing the LaserWash 360 rotating arm design, the G5 compact system, and advanced features like the LaserGlow LED light show and FlashDry simultaneous rinse-and-dry technology. Today, PDQ equipment is installed at more car wash locations across North America than any other touchless brand.',
    features: [
      'Vehicle profiling technology that maps each car\'s unique shape for targeted cleaning',
      'High-pressure oscillating wash arms with precision nozzle positioning',
      'Multi-stage chemical application with pre-soak, detergent, and rinse cycles',
      'Optional LaserGlow LED lighting package for an engaging customer experience',
      'FlashDry integrated drying system on Plus models',
      'Remote monitoring and diagnostics via PDQ\'s connected platform',
    ],
    seoTitle: 'PDQ LaserWash Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using PDQ LaserWash equipment. PDQ is the leading manufacturer of touchless automatic car wash systems in North America, with the LaserWash 360 and G5 systems.',
    website: 'https://www.pdqinc.com',
  },
  {
    slug: 'washworld',
    label: 'WashWorld',
    description: 'WashWorld Inc. is a DuBois, Pennsylvania-based manufacturer of touchless and friction automatic car wash systems. Their Razor product line has earned a strong reputation among independent car wash operators for its exceptional reliability, low maintenance costs, and straightforward operation. WashWorld systems are designed to maximize uptime and minimize service calls, making them a popular choice for owners who need dependable equipment that runs day after day.',
    history: 'WashWorld has been manufacturing car wash equipment in Pennsylvania for over two decades. The company built its reputation on the principle that car wash equipment should be simple, reliable, and easy to maintain. Their Razor line evolved through several generations, with each iteration adding improved cleaning capability while maintaining the mechanical simplicity that operators value. The introduction of the Razor Edge brought LED lighting and enhanced wash performance, while the Razor XR extended the system\'s reach to accommodate the growing number of oversized vehicles on the road.',
    features: [
      'Simplified mechanical design for reduced maintenance and fewer breakdowns',
      'Heavy-duty stainless steel construction built for long service life',
      'Advanced chemical delivery system with precise application timing',
      'High-pressure wash system with adjustable nozzle configurations',
      'LED lighting packages available on Edge models for enhanced customer experience',
      'Extended reach options on XR models for trucks and large SUVs',
    ],
    seoTitle: 'WashWorld Razor Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using WashWorld Razor equipment. WashWorld manufactures reliable, low-maintenance touchless wash systems in DuBois, Pennsylvania.',
    website: 'https://www.washworldinc.com',
  },
  {
    slug: 'belanger',
    label: 'Belanger',
    description: 'Belanger, Inc. is a Northville, Michigan-based manufacturer of vehicle wash systems with a legacy spanning over five decades in the car wash industry. Their touchless systems, including the Kondor and FreeStyler lines, are engineered for high performance and consistent cleaning results. Belanger is known for combining robust mechanical engineering with innovative wash chemistry to deliver a thorough clean across a wide range of vehicle sizes and types.',
    history: 'Founded in 1969, Belanger began as a manufacturer of conveyor tunnel wash equipment and expanded into in-bay automatic systems as the touchless market grew. The company has been a consistent innovator, developing systems that balance cleaning power with operational efficiency. Their Kondor touchless system introduced a distinctive V-shaped carriage design that became a recognizable feature in the industry. In recent years, Belanger has focused on integrating smart technology and data-driven maintenance into their equipment, helping operators optimize wash quality and reduce downtime.',
    features: [
      'Distinctive V-shaped carriage design on the Kondor for optimal cleaning angles',
      'Patented chemical delivery systems for precise detergent application',
      'Heavy-duty construction designed for high-volume commercial operations',
      'Integrated diagnostic systems for predictive maintenance',
      'Flexible wash configurations supporting both touchless and hybrid wash modes',
      'Over 50 years of engineering expertise in vehicle wash systems',
    ],
    seoTitle: 'Belanger Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Belanger equipment. Belanger has over 50 years of experience manufacturing high-performance vehicle wash systems from Northville, Michigan.',
    website: 'https://www.belangerinc.com',
  },
  {
    slug: 'ryko',
    label: 'Ryko',
    description: 'Ryko Solutions, headquartered in Grimes, Iowa, is one of the most established names in the North American car wash industry with a comprehensive product portfolio spanning touchless, friction, and tunnel wash systems. Their SoftGloss and Radius touchless lines are engineered for precision water delivery and advanced chemical application, delivering consistent results across a broad range of vehicle types. Ryko is especially well-regarded among petroleum and convenience store operators for their integrated payment and marketing systems that tie directly into wash equipment.',
    history: 'Ryko was founded in 1973 in Grimes, Iowa, and quickly became one of the dominant forces in the automatic car wash equipment market. The company pioneered many features now considered standard in the industry, including computerized wash controls and integrated customer payment systems. Ryko changed ownership several times over the decades, including a period under National Carwash Solutions (NCS), which also brought the Macneil and Cleaning Systems Inc. brands under one umbrella. Despite ownership changes, Ryko equipment remains widely installed at thousands of locations across North America, and their SoftGloss line continues to be a staple in the touchless market.',
    features: [
      'Precision-aimed high-pressure wash nozzles with variable angle positioning',
      'Multi-stage chemical application system with pre-soak, detergent, and clear coat options',
      'Integrated payment and customer interface systems for seamless operation',
      'SoftGloss friction-free cleaning technology for a glossy, spot-free finish',
      'Compact overhead gantry design that fits standard in-bay dimensions',
      'Remote monitoring and diagnostic capabilities for fleet operators',
    ],
    seoTitle: 'Ryko Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Ryko equipment. Ryko offers comprehensive car wash solutions including touchless automatic systems.',
    website: 'https://www.ryko.com',
  },
  {
    slug: 'istobal',
    label: 'Istobal',
    description: 'Istobal is a Spanish multinational corporation headquartered in L\'Alcudia, Valencia, and ranks among the largest vehicle wash equipment manufacturers in the world. Their M\'NEX series of touchless rollover systems combines European engineering precision with innovative water recycling and energy-saving technology, making them a leader in eco-friendly car wash solutions. Istobal operates in over 75 countries and has a particularly strong presence in Europe, Latin America, and a growing footprint in North America.',
    history: 'Founded in 1950 by the Pardo family in Spain, Istobal began as a small workshop producing vehicle wash equipment and has grown into a global operation with manufacturing facilities in Spain and subsidiaries across multiple continents. The company was an early pioneer of water recycling systems in the car wash industry, integrating environmental responsibility into their engineering philosophy decades before it became an industry trend. Istobal expanded into the North American market through acquisitions and partnerships, bringing their European technology to a new audience. Today, the company continues to innovate with smart wash systems, digital fleet management platforms, and increasingly automated touchless and hybrid wash solutions.',
    features: [
      'Advanced water recycling systems that recover and reuse up to 85% of wash water',
      'Energy-efficient operation with optimized pump and motor systems',
      'Patented chemical dosing technology for precise detergent application',
      'Modular system design allowing flexible configuration for different bay sizes',
      'Digital fleet management platform for multi-site operators',
      'European safety and environmental certification standards',
    ],
    seoTitle: 'Istobal Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Istobal equipment. Istobal is a global leader in vehicle wash technology with innovative touchless systems.',
    website: 'https://www.istobal.com',
  },
  {
    slug: 'ds',
    label: 'D&S',
    description: 'D&S Car Wash Equipment is a manufacturer of in-bay automatic car wash systems based in the United States, known for building rugged, dependable touchless equipment that stands up to heavy daily use. Their IQ Touch Free line is widely installed across independent car wash sites, convenience stores, and gas stations, offering intelligent vehicle profiling and precision chemical application. D&S systems are designed with operator simplicity in mind, featuring straightforward controls and components that are easy to service in the field.',
    history: 'D&S has been manufacturing car wash equipment for decades, establishing a reputation for producing no-nonsense, durable systems that prioritize uptime and ease of maintenance. The company developed the IQ series as their flagship touchless platform, incorporating intelligent sensing technology to adapt wash cycles to each vehicle\'s size and shape. Over the years, D&S refined their chemical delivery and high-pressure wash systems to improve cleaning performance while keeping operating costs low. Their focus on building equipment that independent operators can maintain themselves, without requiring specialized technicians, has earned them a loyal following in the car wash industry.',
    features: [
      'Intelligent vehicle profiling system that adjusts wash parameters for each car',
      'Heavy-gauge steel construction designed for years of continuous operation',
      'Simplified mechanical design for easy field maintenance and repair',
      'High-pressure oscillating wash nozzles for thorough touchless cleaning',
      'Multi-step chemical application process with adjustable timing and concentration',
      'Compact footprint that fits standard single-bay installations',
    ],
    seoTitle: 'D&S Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using D&S Car Wash Systems equipment. D&S manufactures durable, high-performance touchless in-bay automatic wash systems.',
  },
  {
    slug: 'petit',
    label: 'Petit AutoWash',
    description: 'Petit AutoWash is a Canadian manufacturer of automatic car wash equipment based in Quebec, specializing in touchless in-bay automatic systems built for the demands of harsh northern climates. Their Accutrac product line features a distinctive track-mounted overhead carriage design that provides full 360-degree cleaning coverage, and is engineered to handle the heavy salt, sand, and road grime common in cold-weather regions. Petit systems are used by operators across Canada and the northern United States who need robust equipment that performs reliably in extreme conditions.',
    history: 'Petit AutoWash was founded in Quebec, Canada, where the harsh winter driving conditions created strong demand for effective touchless car washing. The company developed the Accutrac system around a unique overhead track-mounted dual-arm carriage, differentiating their approach from the more common floor-mounted designs used by competitors. This design allows the wash arms to travel the full length and width of the vehicle for comprehensive coverage. Petit steadily expanded their distribution from the Canadian market into the northern United States, building a reputation for cold-weather durability and straightforward mechanical design that operators can maintain in-house.',
    features: [
      'Track-mounted overhead dual-arm carriage for full 360-degree wash coverage',
      'Cold-weather engineered components designed for reliable operation in extreme temperatures',
      'Heavy-duty stainless steel and corrosion-resistant construction',
      'High-pressure wash system with adjustable nozzle angles for targeted cleaning',
      'Simple, accessible component layout for easy maintenance',
      'Accommodates a wide range of vehicle sizes from sedans to full-size trucks',
    ],
    seoTitle: 'Petit AutoWash Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Petit AutoWash Accutrac equipment. Petit is known for innovative track-mounted touchless wash systems.',
    website: 'https://www.petitautowash.com',
  },
  {
    slug: 'oasis',
    label: 'Oasis',
    description: 'Oasis Car Wash Systems is a manufacturer of touchless automatic car wash equipment focused on delivering powerful cleaning performance with efficient water and chemical usage. Their Typhoon and XR series systems are designed for operators running high-volume locations who need fast cycle times without compromising wash quality. Oasis equipment is known for its horizontal spray bar design, which provides broad, even coverage across the vehicle surface for consistent, streak-free results.',
    history: 'Oasis Car Wash Systems entered the touchless car wash market with a focus on building straightforward, high-performance equipment that prioritized cleaning power and operational efficiency. The company developed the Typhoon as their core touchless platform, featuring a horizontal spray bar approach that distinguished it from the rotating-arm designs of larger competitors. The XR-1000 extended-reach model was introduced to address the growing demand for equipment capable of washing larger trucks and SUVs. Oasis has maintained a steady presence in the independent operator market, with installations concentrated in the United States.',
    features: [
      'Horizontal spray bar design for broad, even water and chemical coverage',
      'High-pressure pump systems delivering powerful touchless cleaning',
      'Fast cycle times optimized for high-volume operations',
      'Extended-reach XR models for trucks, vans, and large SUVs',
      'Efficient water and chemical usage to minimize operating costs',
      'Durable construction with corrosion-resistant materials',
    ],
    seoTitle: 'Oasis Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Oasis equipment. Oasis manufactures efficient touchless wash systems designed for high-volume operations.',
  },
  {
    slug: 'mark_vii',
    label: 'Mark VII',
    description: 'Mark VII Equipment, headquartered in Arvada, Colorado, is a subsidiary of the WashTec Group, the world\'s largest manufacturer of vehicle wash systems. Mark VII serves as WashTec\'s primary brand in the North American market, offering a diverse range of touchless, friction, and hybrid in-bay automatic systems. Their ChoiceWash and AquaJet product lines are especially popular at gas station, convenience store, and petroleum chain locations where high throughput and operational flexibility are critical.',
    history: 'Mark VII has a long history in the North American car wash equipment market, building a reputation for versatile, well-engineered wash systems before being acquired by WashTec AG, the German parent company that is the global leader in car wash technology. The WashTec acquisition gave Mark VII access to advanced European engineering resources and R&D capabilities while maintaining its North American manufacturing and service infrastructure. Under the WashTec umbrella, Mark VII developed the ChoiceWash platform, which allows operators to offer customers a choice between touchless and soft-touch wash modes from a single machine. The company continues to innovate with connected wash technology, data analytics, and systems designed for the growing express car wash segment.',
    features: [
      'ChoiceWash platform offering both touchless and friction modes from one machine',
      'Backed by WashTec, the world\'s largest car wash equipment manufacturer',
      'High-throughput design optimized for gas station and convenience store locations',
      'Advanced vehicle detection and profiling systems for adaptive wash cycles',
      'Connected equipment platform with remote monitoring and performance analytics',
      'Extensive North American service and support network',
    ],
    seoTitle: 'Mark VII Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Mark VII equipment. Mark VII, a WashTec company, offers versatile touchless wash systems for high-throughput locations.',
    website: 'https://www.markvii.net',
  },
  {
    slug: 'karcher',
    label: 'Kärcher',
    description: 'Kärcher is a German family-owned company headquartered in Winnenden, Baden-Württemberg, and is the world\'s leading provider of cleaning technology, with annual revenues exceeding 3 billion euros. Their commercial vehicle wash division offers a full range of rollover, gantry, and tunnel systems that combine precision German engineering with environmentally conscious water reclamation and energy management. Kärcher car wash systems are installed in over 70 countries, with a particularly strong presence in Europe and a growing footprint in North America.',
    history: 'Founded in 1935 by Alfred Kärcher, the company initially produced heating elements before pivoting to cleaning technology in the postwar era. Kärcher introduced its first vehicle wash system in the 1960s and has since grown to become the global market leader in professional cleaning equipment. The company entered the automatic car wash market with gantry-style rollover systems designed to meet stringent European environmental regulations, and later expanded the line to include touchless and hybrid configurations. Kärcher\'s car wash division benefits from the company\'s massive R&D investment across all cleaning technologies, resulting in industry-leading water recycling rates and energy efficiency.',
    features: [
      'Precision-engineered gantry systems with tight manufacturing tolerances',
      'Industry-leading water recycling systems recovering up to 90% of wash water',
      'Energy-efficient drive motors and pump systems reducing operating costs',
      'Modular design allowing customization for different bay sizes and wash configurations',
      'Eco-friendly chemical dosing systems meeting strict European environmental standards',
      'Global service network with factory-trained technicians in over 70 countries',
    ],
    seoTitle: 'Kärcher Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Kärcher equipment. Kärcher is a global leader in cleaning technology with precision-engineered car wash systems.',
    website: 'https://www.kaercher.com',
  },
  {
    slug: 'autec',
    label: 'Autec',
    description: 'Autec, Inc. is a manufacturer of automatic car wash systems based in the United States, specializing in touchless in-bay automatic equipment designed for straightforward operation and long-term reliability. Their Evolution series is a workhorse platform used by independent operators and small chains who value low-maintenance, high-uptime equipment. Autec systems are engineered to deliver consistent cleaning performance with minimal operator intervention, making them well-suited for unattended and 24-hour car wash locations.',
    history: 'Autec has been manufacturing car wash equipment for the North American market for several decades, establishing itself as a dependable choice for operators who prioritize simplicity and durability over flashy features. The company built the Evolution platform as a modular system that could be configured for different bay sizes and wash requirements while keeping the core mechanical design simple and easy to service. Over the years, Autec introduced the EV-1 Evolution and AES-425 variants to address different market segments, from entry-level single-bay installations to higher-volume commercial operations. The company maintains a focus on keeping replacement parts affordable and readily available, recognizing that long-term cost of ownership is a primary concern for independent operators.',
    features: [
      'Modular Evolution platform configurable for various bay sizes and wash needs',
      'Simple mechanical design emphasizing reliability and ease of service',
      'High-pressure touchless wash system with multi-angle nozzle coverage',
      'Designed for unattended and 24-hour operation with minimal intervention',
      'Affordable replacement parts and straightforward maintenance procedures',
      'Durable construction built for years of continuous commercial use',
    ],
    seoTitle: 'Autec Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Autec equipment. Autec manufactures reliable touchless car wash systems for independent operators and chains.',
    website: 'https://www.autecinc.com',
  },
  {
    slug: 'saber',
    label: 'Saber',
    description: 'Saber manufactures touchless automatic car wash equipment aimed at the independent operator market, focusing on delivering dependable cleaning performance at a competitive price point. Their systems are designed with a straightforward mechanical approach that reduces complexity, making them easier to install, operate, and maintain than many competing platforms. Saber equipment appeals to cost-conscious operators who need a reliable touchless system without the premium pricing of the larger national brands.',
    history: 'Saber entered the touchless car wash equipment market with a mission to provide independent operators with a viable alternative to the higher-priced equipment from the industry\'s dominant manufacturers. The company developed their systems around the principle that effective touchless washing does not require the most complex or expensive equipment. By focusing on core touchless wash functionality with durable components and simplified electronics, Saber was able to offer competitive pricing while maintaining the cleaning performance operators need. The brand has built a following among budget-minded car wash owners and operators entering the touchless market for the first time.',
    features: [
      'Cost-effective touchless wash platform with competitive pricing for independent operators',
      'Simplified mechanical design reducing installation time and complexity',
      'High-pressure wash nozzles delivering effective touchless cleaning performance',
      'Durable, serviceable components designed for easy replacement in the field',
      'Multi-step chemical application system with adjustable settings',
      'Compact design suitable for standard single-bay installations',
    ],
    seoTitle: 'Saber Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Saber equipment. Saber manufactures durable, cost-effective touchless wash systems for independent operators.',
  },
  {
    slug: 'broadway',
    label: 'Broadway',
    description: 'Broadway manufactures car wash equipment including their Wonder Bar touchless system, serving the independent car wash operator market with straightforward, reliable wash solutions. Their equipment is designed for operators who want dependable touchless technology without unnecessary complexity, featuring rugged construction and easy-to-service components. Broadway systems are found at independent car wash locations across the United States where simplicity and uptime are the top priorities.',
    history: 'Broadway has been a niche manufacturer in the car wash equipment industry, focusing on producing reliable, no-frills touchless wash systems for the independent operator market. The company developed the Wonder Bar as a simple, effective touchless platform that could compete on reliability and cost of ownership rather than advanced features. Broadway built their reputation through word-of-mouth among operators who valued equipment that ran consistently without requiring frequent service calls. While smaller than the industry\'s major players, Broadway has maintained a loyal customer base of operators who appreciate their practical approach to car wash equipment design.',
    features: [
      'Wonder Bar touchless system with straightforward, reliable operation',
      'Rugged construction built for consistent daily use',
      'Easy-to-service component layout reducing maintenance time',
      'Effective high-pressure touchless cleaning at a competitive price point',
      'Simple control system that minimizes operator training requirements',
    ],
    seoTitle: 'Broadway Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Broadway equipment. Broadway manufactures reliable touchless wash systems including the Wonder Bar.',
  },
  {
    slug: 'hydrospray',
    label: 'Hydro-Spray',
    description: 'Hydro-Spray is a manufacturer of in-bay automatic touchless car wash systems, with a particular focus on equipment designed for self-serve car wash locations that want to add an automated touchless bay. Their systems emphasize water efficiency, compact installation, and ease of maintenance, making them a practical choice for operators adding touchless capability to existing self-serve facilities. Hydro-Spray equipment is designed to operate reliably in the demanding environment of a self-serve wash bay with minimal supervision.',
    history: 'Hydro-Spray carved out a niche in the car wash equipment market by focusing on the self-serve car wash segment, recognizing that many self-serve operators wanted to offer an automated touchless option alongside their traditional wand-wash bays. The company engineered their in-bay automatic systems to fit within the space constraints and infrastructure of typical self-serve facilities, where bay dimensions and utility connections may differ from purpose-built automatic wash buildings. Hydro-Spray built a reputation for producing practical, water-efficient equipment that could operate profitably in the lower-traffic environment typical of many self-serve locations. Their focus on this specific market segment allowed them to address the unique needs of self-serve operators in ways that larger, more generalized manufacturers sometimes overlooked.',
    features: [
      'Designed specifically for integration into self-serve car wash facilities',
      'Compact footprint fitting standard self-serve bay dimensions',
      'Water-efficient operation keeping utility costs manageable for lower-traffic sites',
      'Simple mechanical systems designed for operator-level maintenance',
      'Effective touchless cleaning with high-pressure water and chemical application',
      'Durable components built to withstand the open-bay self-serve environment',
    ],
    seoTitle: 'Hydro-Spray Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Hydro-Spray equipment. Hydro-Spray manufactures in-bay automatic touchless wash systems.',
    website: 'https://www.hydrospray.com',
  },
  {
    slug: 'dencar',
    label: 'Dencar Technology',
    description: 'Dencar Technology manufactures automatic car wash equipment including the Dynawash Express touchless system, focusing on modern control systems and efficient cleaning technology. Their equipment integrates contemporary electronic controls with proven mechanical wash components to deliver user-friendly operation and consistent cleaning results. Dencar systems are designed for operators who want modern, technologically current equipment with intuitive interfaces for both the operator and the end customer.',
    history: 'Dencar Technology entered the car wash equipment market with a focus on bringing modern electronic control and monitoring technology to automatic car wash systems. The company developed the Dynawash Express as a touchless platform that emphasized ease of use, with intuitive touchscreen controls and diagnostic systems that help operators identify and resolve issues quickly. Dencar positioned themselves as a technology-forward manufacturer in an industry where many established players relied on legacy control architectures. Their approach appealed to a new generation of car wash operators comfortable with digital technology and looking for equipment with modern interfaces and connectivity features.',
    features: [
      'Modern touchscreen control interface for intuitive operation and diagnostics',
      'Dynawash Express touchless system with efficient multi-stage cleaning process',
      'Digital diagnostic systems for quick identification of maintenance needs',
      'Efficient water and chemical usage with programmable application settings',
      'Contemporary equipment design with clean aesthetics',
      'User-friendly customer interface for easy wash package selection',
    ],
    seoTitle: 'Dencar Technology Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Dencar Technology equipment including the Dynawash Express touchless wash system.',
  },
  {
    slug: 'ns_corp',
    label: 'NS Corporation',
    description: 'NS Corporation is a Japanese manufacturer of car wash equipment and one of the leading vehicle wash system producers in the Asian market. Their touchless wash technology incorporates precision engineering and compact design principles common to Japanese industrial equipment, and is used by operators seeking reliable, space-efficient automated cleaning solutions. NS Corporation systems are found primarily in Japan and other Asian markets, with some installations in North America through distributor partnerships.',
    history: 'NS Corporation has been manufacturing vehicle wash equipment in Japan for decades, becoming one of the dominant car wash equipment brands in the Japanese domestic market. The company developed touchless wash technology adapted to the specific needs of the Japanese market, where car wash bays are often smaller than their North American counterparts and expectations for wash quality are exceptionally high. NS Corporation expanded beyond Japan into other Asian markets and eventually into limited North American distribution, where their compact, precise equipment found a niche among operators with space constraints. The company continues to manufacture in Japan and is known for the build quality and reliability typical of Japanese industrial equipment.',
    features: [
      'Japanese precision engineering with tight manufacturing tolerances',
      'Compact system design optimized for smaller bay dimensions',
      'High-quality components built for long-term reliability',
      'Efficient water and chemical usage with precise application controls',
      'Quiet operation suitable for noise-sensitive locations',
      'Advanced vehicle sensing technology for adaptive wash cycles',
    ],
    seoTitle: 'NS Corporation Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using NS Corporation equipment and touchless wash systems.',
  },
  {
    slug: 'delta_sonic',
    label: 'Delta Sonic',
    description: 'Delta Sonic is a major car wash chain headquartered in Buffalo, New York, that designs and builds its own proprietary car wash equipment in-house rather than purchasing from third-party manufacturers. Their custom-engineered wash systems are used exclusively across Delta Sonic locations, allowing the company to optimize every aspect of the wash process for their specific operational model. This vertical integration of equipment design and car wash operations gives Delta Sonic a unique position in the industry, as they can iterate on equipment design based on direct operational feedback from their own locations.',
    history: 'Delta Sonic was founded in 1967 in Buffalo, New York, and grew into one of the largest car wash chains in the northeastern United States, with locations spanning New York, Pennsylvania, Ohio, and Illinois. Early in the company\'s growth, Delta Sonic made the unusual decision to design and manufacture their own car wash equipment rather than relying on third-party suppliers. This vertical integration allowed them to develop wash systems specifically tailored to their high-volume express model and to make rapid equipment improvements based on real-world performance data from their own sites. Over the decades, Delta Sonic expanded beyond car washing to offer oil changes, detailing, and other automotive services, but the car wash remains the core business, powered by their proprietary equipment.',
    features: [
      'Proprietary equipment designed and manufactured in-house exclusively for Delta Sonic locations',
      'Vertically integrated design process allowing rapid iteration based on operational data',
      'Custom-engineered systems optimized for Delta Sonic\'s high-volume express wash model',
      'Purpose-built chemical delivery systems tailored to Delta Sonic\'s wash formulations',
      'Consistent wash experience standardized across all Delta Sonic locations',
    ],
    seoTitle: 'Delta Sonic Touchless Car Wash Locations',
    seoDescription: 'Find Delta Sonic touchless car wash locations. Delta Sonic uses proprietary custom-built car wash equipment designed in-house.',
    website: 'https://www.deltasoniccarwash.com',
  },
  {
    slug: 'super_wash',
    label: 'Super Wash',
    description: 'Super Wash is one of the largest touchless car wash chains in the United States, operating unattended, fully automated locations across the Midwest and eastern states. Founded in Morrison, Illinois, the company pioneered the concept of the unmanned, coin-operated touchless car wash and built a franchise and corporate-owned network spanning hundreds of locations. Super Wash locations are known for their 24-hour availability, consistent wash quality, and convenient self-service model that requires no attendant on site.',
    history: 'Super Wash was founded in Morrison, Illinois, and became a pioneer in the unmanned touchless car wash business model. The company recognized early on that automated touchless systems could operate profitably without on-site staff, and built their entire business model around this concept. Super Wash expanded through a combination of corporate-owned and franchised locations, eventually growing to one of the largest car wash chains in the Midwest and eastern United States. The company\'s focus on unattended operation influenced the broader car wash industry\'s move toward automation, and their operational model proved that touchless washes could deliver consistent quality without human oversight at individual locations.',
    features: [
      'Fully unattended, automated operation at all locations',
      '24-hour availability for maximum customer convenience',
      'Consistent touchless wash quality standardized across all sites',
      'Coin, credit card, and mobile payment acceptance',
      'Multiple wash package options at each location',
      'Centralized monitoring and management of all locations',
    ],
    seoTitle: 'Super Wash Touchless Car Wash Locations',
    seoDescription: 'Find Super Wash touchless car wash locations. Super Wash operates touchless automatic car wash locations across the Midwest and eastern US.',
    website: 'https://www.superwash.com',
  },
  {
    slug: 'shinewash',
    label: 'Shinewash',
    description: 'Shinewash manufactures car wash equipment and systems for touchless automatic washing, with a focus on delivering a clean, spot-free finish through precision water application and advanced chemical delivery technology. Their systems are designed for operators who prioritize wash quality and a visibly clean result, incorporating spot-free rinse systems and carefully calibrated chemical application stages. Shinewash equipment serves the independent operator market with systems that aim to deliver premium wash results.',
    history: 'Shinewash entered the car wash equipment market with a focus on wash quality, particularly achieving the spot-free finish that customers associate with a premium car wash experience. The company developed their chemical delivery and rinse systems to work together to minimize water spotting, a common challenge with touchless washing. Shinewash built their product line around the principle that touchless washing can deliver results that rival or exceed soft-touch systems when the chemical application and rinse processes are properly engineered. The company has maintained a focused product line rather than diversifying broadly, concentrating their engineering efforts on perfecting the touchless wash process.',
    features: [
      'Spot-free rinse system designed to minimize water marks and streaking',
      'Precision chemical delivery with calibrated application timing and concentration',
      'Multi-stage wash process engineered for premium finish quality',
      'High-pressure water jets with optimized spray patterns for thorough cleaning',
      'User-friendly customer interface for simple wash selection',
      'Durable construction suitable for daily commercial operation',
    ],
    seoTitle: 'Shinewash Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Shinewash equipment and touchless wash systems.',
  },
  {
    slug: 'futura',
    label: 'Futura',
    description: 'Futura manufactures touchless automatic car wash systems built for reliable, unattended operation. Their equipment uses high-pressure water jets and precisely applied chemistry to clean vehicles without any physical contact, delivering consistent wash quality across a range of vehicle sizes and conditions.',
    features: [
      'Touchless wash process using high-pressure water and staged chemical application',
      'Designed for unattended in-bay automatic operation',
      'Precise vehicle positioning and wash-cycle targeting',
      'Commercial-duty construction built for daily use and straightforward maintenance',
    ],
    seoTitle: 'Futura Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using Futura equipment. Futura manufactures touchless automatic in-bay wash systems.',
  },
];

export const EQUIPMENT_MODEL_DATA: EquipmentModelData[] = [
  // PDQ models
  {
    slug: 'laserwash-360',
    name: 'LaserWash 360',
    brandSlug: 'pdq',
    description: 'The LaserWash 360 is PDQ\'s flagship touchless car wash system and the most widely installed touchless in-bay automatic in North America. It features a single rotating wash arm mounted on a bridge that travels the length of the vehicle, using high-pressure water jets and precision-applied chemicals to clean from every angle without any physical contact. The 360-degree rotating arm design provides complete vehicle coverage including the front, rear, sides, and top surfaces in a single pass cycle.',
    keyFeatures: [
      'Single rotating wash arm providing full 360-degree cleaning coverage',
      'Vehicle profiling system that maps each car\'s shape for targeted wash delivery',
      'Multi-step chemical application with pre-soak, high-pressure detergent, and rinse stages',
      'Open-bay design with no doors or guide rails required for vehicle entry',
      'Configurable wash packages allowing operators to offer multiple service tiers',
    ],
    bestFor: 'High-traffic single-bay locations such as gas stations, convenience stores, and standalone car wash sites that need proven, dependable touchless equipment with the widest parts and service availability in the industry.',
    seoTitle: 'PDQ LaserWash 360 Car Wash Locations',
    seoDescription: 'Find touchless car washes using the PDQ LaserWash 360. The LaserWash 360 is PDQ\'s flagship touchless system with a rotating wash arm for complete coverage.',
  },
  {
    slug: 'laserwash-360-plus',
    name: 'LaserWash 360 Plus',
    brandSlug: 'pdq',
    description: 'The LaserWash 360 Plus is the premium version of PDQ\'s flagship touchless system, adding the LaserGlow LED lighting arch and FlashDry integrated drying system to the proven LaserWash 360 platform. The LaserGlow arch creates an engaging, colorful light show during the wash cycle that enhances the customer experience and helps differentiate the location from competitors. The FlashDry system uses powerful blowers integrated into the wash cycle to begin drying the vehicle during the final rinse, reducing total cycle time and delivering a drier vehicle at exit.',
    keyFeatures: [
      'LaserGlow LED lighting arch creating an immersive, colorful wash experience',
      'FlashDry integrated drying system for simultaneous rinsing and drying',
      'All LaserWash 360 core features including rotating arm and vehicle profiling',
      'Reduced total cycle time compared to standard 360 thanks to FlashDry',
      'Premium wash presentation that justifies higher wash pricing',
    ],
    bestFor: 'Operators looking to maximize per-wash revenue by offering a premium, visually impressive touchless wash experience that commands higher prices and builds customer loyalty through the LaserGlow light show.',
    seoTitle: 'PDQ LaserWash 360 Plus Car Wash Locations',
    seoDescription: 'Find touchless car washes using the PDQ LaserWash 360 Plus with LED LaserGlow arch and FlashDry drying system.',
  },
  {
    slug: 'laserwash-4000',
    name: 'LaserWash 4000',
    brandSlug: 'pdq',
    description: 'The LaserWash 4000 is PDQ\'s proven workhorse touchless in-bay automatic system, featuring a T-bar positioning system that delivers precise wash coverage through side-mounted and overhead spray nozzles. While it predates the rotating-arm design of the LaserWash 360, the 4000 remains widely installed at thousands of car wash locations across North America and continues to deliver reliable, effective touchless cleaning. Its straightforward mechanical design makes it one of the most cost-effective touchless systems to maintain over long service life.',
    keyFeatures: [
      'T-bar positioning system with side-mounted and overhead spray nozzles',
      'Proven mechanical design with decades of field-tested reliability',
      'Lower maintenance and parts costs compared to rotating-arm systems',
      'Multi-step chemical application process for effective touchless cleaning',
      'Compact bridge design fitting standard in-bay installations',
    ],
    bestFor: 'Established car wash locations with existing LaserWash 4000 installations, or budget-conscious operators seeking a proven, lower-cost-of-ownership touchless system from the industry\'s most widely supported brand.',
    seoTitle: 'PDQ LaserWash 4000 Car Wash Locations',
    seoDescription: 'Find touchless car washes using the PDQ LaserWash 4000. A proven touchless system with T-bar positioning for precise wash coverage.',
  },
  {
    slug: 'laserwash-g5',
    name: 'LaserWash G5',
    brandSlug: 'pdq',
    description: 'The LaserWash G5 is PDQ\'s next-generation compact touchless wash system, designed to deliver the cleaning performance of the LaserWash 360 platform in a significantly smaller footprint. The G5 uses a streamlined overhead bridge and wash arm assembly that requires less bay height and depth than the full-size LaserWash 360, making it suitable for retrofit installations in existing bays that may not accommodate larger equipment. Despite its compact size, the G5 incorporates PDQ\'s latest vehicle profiling and chemical delivery technology for thorough touchless cleaning.',
    keyFeatures: [
      'Compact overhead bridge design requiring less bay height and depth than the LaserWash 360',
      'PDQ\'s latest vehicle profiling technology for precise wash targeting',
      'Advanced chemical delivery system with optimized application sequences',
      'Ideal for retrofit installations in existing bays with space constraints',
      'Compatible with PDQ\'s connected monitoring and diagnostic platform',
    ],
    bestFor: 'Operators with existing bays that have height or depth constraints, or new installations where a compact footprint is preferred without sacrificing PDQ\'s proven touchless cleaning performance.',
    seoTitle: 'PDQ LaserWash G5 Car Wash Locations',
    seoDescription: 'Find touchless car washes using the PDQ LaserWash G5 next-generation compact touchless wash system.',
  },
  { slug: 'laserwash-m5', name: 'LaserWash M5', brandSlug: 'pdq', description: 'The LaserWash M5 from PDQ is designed for high-volume car wash operations, delivering fast, efficient touchless cleaning with advanced chemical delivery and rinse systems.', seoTitle: 'PDQ LaserWash M5 Car Wash Locations', seoDescription: 'Find touchless car washes using the PDQ LaserWash M5, designed for high-volume touchless cleaning operations.' },
  { slug: 'laserwash-sentry', name: 'LaserWash Sentry', brandSlug: 'pdq', description: 'The LaserWash Sentry is PDQ\'s entry-level touchless car wash system, offering the core LaserWash cleaning technology in a cost-effective package for smaller operations.', seoTitle: 'PDQ LaserWash Sentry Car Wash Locations', seoDescription: 'Find touchless car washes using the PDQ LaserWash Sentry entry-level touchless wash system.' },
  { slug: 'protouch', name: 'ProTouch', brandSlug: 'pdq', description: 'The PDQ ProTouch is a friction-based automatic car wash system that can also operate in touchless mode. It offers operators flexibility to provide both wash types from a single machine.', seoTitle: 'PDQ ProTouch Car Wash Locations', seoDescription: 'Find car washes using the PDQ ProTouch automatic wash system with both touch and touchless wash capabilities.' },
  { slug: 'tandem-surfline', name: 'Tandem Surfline', brandSlug: 'pdq', description: 'The PDQ Tandem Surfline is a dual-wash system designed for high-throughput car wash operations. It allows two vehicles to be washed simultaneously, significantly increasing wash capacity.', seoTitle: 'PDQ Tandem Surfline Car Wash Locations', seoDescription: 'Find car washes using the PDQ Tandem Surfline dual-wash system for high-throughput operations.' },
  { slug: 'access', name: 'Access', brandSlug: 'pdq', description: 'The PDQ Access is an entry system and payment terminal designed to work with PDQ wash equipment, providing seamless customer payment and wash selection integration.', seoTitle: 'PDQ Access Car Wash Locations', seoDescription: 'Find car washes using PDQ Access payment and entry systems.' },

  // WashWorld models
  {
    slug: 'razor',
    name: 'Razor',
    brandSlug: 'washworld',
    description: 'The WashWorld Razor is one of the most popular touchless in-bay automatic car wash systems in the independent operator market, known for its exceptional reliability, low maintenance costs, and simplified mechanical design. The Razor uses a dual-arm overhead bridge system with high-pressure wash nozzles that deliver effective touchless cleaning through a multi-step process of pre-soak, high-pressure detergent application, and clear-coat rinse. Its reputation for running for years with minimal service calls has made it a favorite among operators who manage their own equipment maintenance.',
    keyFeatures: [
      'Dual-arm overhead bridge system with high-pressure wash nozzles',
      'Simplified mechanical design with fewer moving parts than competing systems',
      'Heavy-duty stainless steel construction for extended service life',
      'Multi-step wash process with pre-soak, detergent, and clear-coat stages',
      'Low maintenance requirements reducing long-term cost of ownership',
    ],
    bestFor: 'Independent car wash operators and small chains who prioritize equipment reliability and low maintenance costs, especially those who handle their own equipment service and want a system that minimizes downtime.',
    seoTitle: 'WashWorld Razor Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using the WashWorld Razor, a reliable and low-maintenance touchless in-bay automatic system.',
  },
  {
    slug: 'razor-edge',
    name: 'Razor Edge',
    brandSlug: 'washworld',
    description: 'The WashWorld Razor Edge is the premium version of the Razor platform, adding LED lighting features and enhanced cleaning capabilities to the proven Razor mechanical design. The Edge model incorporates colored LED lighting that creates a visually engaging wash experience for customers, helping operators differentiate their wash and justify premium pricing. It retains the Razor\'s core strengths of reliability and low maintenance while adding the visual appeal and improved wash performance that modern customers expect.',
    keyFeatures: [
      'LED lighting package creating a colorful, engaging customer wash experience',
      'Enhanced wash nozzle configuration for improved cleaning performance',
      'All Razor core features including simplified mechanical design and stainless steel construction',
      'Premium wash presentation supporting higher per-wash pricing',
      'Same low-maintenance philosophy as the standard Razor platform',
    ],
    bestFor: 'Operators upgrading from a standard Razor or competitors who want the Razor\'s proven reliability combined with a modern, visually appealing wash experience that attracts and retains customers.',
    seoTitle: 'WashWorld Razor Edge Car Wash Locations',
    seoDescription: 'Find touchless car washes using the WashWorld Razor Edge with enhanced cleaning and LED lighting.',
  },
  { slug: 'razor-touch', name: 'Razor Touch', brandSlug: 'washworld', description: 'The WashWorld Razor Touch combines touchless and soft-touch wash capabilities in a single machine, giving operators flexibility to offer multiple wash types.', seoTitle: 'WashWorld Razor Touch Car Wash Locations', seoDescription: 'Find car washes using the WashWorld Razor Touch with both touchless and soft-touch capabilities.' },
  { slug: 'razor-xr', name: 'Razor XR', brandSlug: 'washworld', description: 'The WashWorld Razor XR is the extended-reach model in the Razor line, designed to accommodate larger vehicles including trucks and SUVs.', seoTitle: 'WashWorld Razor XR Car Wash Locations', seoDescription: 'Find touchless car washes using the WashWorld Razor XR, designed for larger vehicles.' },
  { slug: 'profile', name: 'Profile', brandSlug: 'washworld', description: 'The WashWorld Profile is a touchless car wash system designed for efficient cleaning with a focus on water and chemical conservation.', seoTitle: 'WashWorld Profile Car Wash Locations', seoDescription: 'Find touchless car washes using the WashWorld Profile automatic wash system.' },
  { slug: 'high-velocity', name: 'High Velocity', brandSlug: 'washworld', description: 'The WashWorld High Velocity is a touchless in-bay automatic system that uses a "virtual attendant" ultrasonic sensing system to map the vehicle\'s position rather than floor-mounted guides. Recognizable by the characteristic blue LED light bar along the top of the gantry and the stainless steel overhead rail system.', seoTitle: 'WashWorld High Velocity Car Wash Locations', seoDescription: 'Find touchless car washes using the WashWorld High Velocity automatic wash system.' },
  { slug: 'profile-max', name: 'Profile Max', brandSlug: 'washworld', description: 'The WashWorld Profile Max is the premium model in the Profile line, offering faster cycle times and enhanced cleaning power for high-volume locations.', seoTitle: 'WashWorld Profile Max Car Wash Locations', seoDescription: 'Find touchless car washes using the WashWorld Profile Max automatic wash system.' },

  // Belanger models
  {
    slug: 'kondor',
    name: 'Kondor',
    brandSlug: 'belanger',
    description: 'The Belanger Kondor is a premium touchless in-bay automatic car wash system featuring a distinctive V-shaped carriage design that positions wash nozzles at optimal angles for thorough cleaning across all vehicle types. The Kondor\'s unique carriage geometry allows it to direct high-pressure water and chemicals at the vehicle from angles that a standard flat bridge cannot achieve, improving cleaning performance on vertical surfaces, wheel wells, and recessed areas. Built with Belanger\'s over 50 years of vehicle wash engineering expertise, the Kondor is designed for high-volume commercial operations where consistent wash quality and equipment uptime are critical.',
    keyFeatures: [
      'Distinctive V-shaped carriage design providing optimal wash nozzle angles for superior cleaning',
      'Patented chemical delivery system with precise application timing and coverage',
      'Heavy-duty commercial construction rated for high-volume daily operation',
      'Integrated diagnostic and monitoring systems for predictive maintenance',
      'Wide vehicle accommodation from compact cars to full-size trucks and SUVs',
    ],
    bestFor: 'High-volume commercial car wash operations and multi-bay facilities where premium cleaning quality, equipment durability, and integrated diagnostics justify the investment in Belanger\'s top-tier touchless platform.',
    seoTitle: 'Belanger Kondor Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using the Belanger Kondor premium in-bay automatic system.',
  },
  { slug: 'eclipse', name: 'Eclipse', brandSlug: 'belanger', description: 'The Belanger Eclipse is a versatile car wash system offering both touchless and friction wash modes, providing operators with maximum flexibility.', seoTitle: 'Belanger Eclipse Car Wash Locations', seoDescription: 'Find car washes using the Belanger Eclipse versatile wash system.' },
  { slug: 'freestyler', name: 'FreeStyler', brandSlug: 'belanger', description: 'The Belanger FreeStyler is an automatic car wash system designed for high-volume operations with efficient throughput and consistent wash quality.', seoTitle: 'Belanger FreeStyler Car Wash Locations', seoDescription: 'Find car washes using the Belanger FreeStyler automatic wash system.' },
  { slug: 'spinlite', name: 'SpinLite', brandSlug: 'belanger', description: 'The Belanger SpinLite is a compact automatic car wash system designed for locations with limited space, delivering quality washes in a smaller footprint.', seoTitle: 'Belanger SpinLite Car Wash Locations', seoDescription: 'Find car washes using the Belanger SpinLite compact automatic wash system.' },
  { slug: 'vector', name: 'Vector', brandSlug: 'belanger', description: 'The Belanger Vector is an advanced automatic car wash system featuring modern design and engineering for superior cleaning performance.', seoTitle: 'Belanger Vector Car Wash Locations', seoDescription: 'Find car washes using the Belanger Vector automatic wash system.' },

  // Ryko models
  {
    slug: 'softgloss',
    name: 'SoftGloss',
    brandSlug: 'ryko',
    description: 'The Ryko SoftGloss is Ryko\'s flagship touchless automatic car wash system, designed to deliver a thorough clean with a glossy, spot-free finish through precision-aimed high-pressure water jets and a carefully sequenced chemical application process. The SoftGloss name reflects the system\'s emphasis on leaving vehicles with a smooth, glossy appearance after the touchless wash cycle. As one of the most widely installed touchless systems in the Ryko product line, the SoftGloss has a proven track record at gas stations, convenience stores, and independent car wash locations across North America.',
    keyFeatures: [
      'Precision-aimed high-pressure wash nozzles with variable angle positioning',
      'Multi-stage chemical process delivering pre-soak, detergent, and gloss-enhancing clear coat',
      'Compact overhead gantry design fitting standard in-bay dimensions',
      'Integrated payment and customer interface system for seamless operation',
      'Spot-free rinse technology for a glossy, streak-free finish',
    ],
    bestFor: 'Gas station and convenience store operators who need a proven, well-supported touchless system from a major manufacturer, particularly at locations with existing Ryko service relationships.',
    seoTitle: 'Ryko SoftGloss Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using the Ryko SoftGloss automatic wash system.',
  },
  { slug: 'softgloss-maxx', name: 'SoftGloss Maxx', brandSlug: 'ryko', description: 'The Ryko SoftGloss Maxx is an enhanced version of the SoftGloss with additional cleaning power and features for a premium touchless wash experience.', seoTitle: 'Ryko SoftGloss Maxx Car Wash Locations', seoDescription: 'Find touchless car washes using the Ryko SoftGloss Maxx enhanced wash system.' },
  { slug: 'radius', name: 'Radius', brandSlug: 'ryko', description: 'The Ryko Radius is a touchless automatic car wash system with an overhead arm design that provides comprehensive cleaning coverage for all vehicle sizes.', seoTitle: 'Ryko Radius Touchless Car Wash Locations', seoDescription: 'Find touchless car washes using the Ryko Radius automatic wash system.' },

  // Istobal models
  { slug: 'mnex-22', name: "M'NEX 22", brandSlug: 'istobal', description: "The Istobal M'NEX 22 is a compact touchless car wash system ideal for locations with limited space, delivering European-engineered cleaning performance.", seoTitle: "Istobal M'NEX 22 Car Wash Locations", seoDescription: "Find touchless car washes using the Istobal M'NEX 22 compact touchless wash system." },
  { slug: 'mnex-25', name: "M'NEX 25", brandSlug: 'istobal', description: "The Istobal M'NEX 25 is a mid-range touchless car wash system offering advanced water recycling and energy-efficient operation.", seoTitle: "Istobal M'NEX 25 Car Wash Locations", seoDescription: "Find touchless car washes using the Istobal M'NEX 25 touchless wash system." },
  { slug: 'mnex-32', name: "M'NEX 32", brandSlug: 'istobal', description: "The Istobal M'NEX 32 is a premium touchless car wash system with advanced features for high-volume commercial car wash operations.", seoTitle: "Istobal M'NEX 32 Car Wash Locations", seoDescription: "Find touchless car washes using the Istobal M'NEX 32 premium touchless wash system." },
  { slug: 'istobal-1900', name: 'ISTOBAL 1900', brandSlug: 'istobal', description: 'The ISTOBAL 1900 is a robust touchless car wash system designed for heavy-duty commercial applications with high throughput requirements.', seoTitle: 'ISTOBAL 1900 Car Wash Locations', seoDescription: 'Find touchless car washes using the ISTOBAL 1900 commercial touchless wash system.' },

  // D&S models
  {
    slug: 'iq-2-0-touch-free',
    name: 'IQ 2.0 Touch Free',
    brandSlug: 'ds',
    description: 'The D&S IQ 2.0 Touch Free is D&S\'s flagship touchless in-bay automatic car wash system, featuring intelligent vehicle profiling that adjusts wash parameters for each car\'s size and shape. The IQ 2.0 uses an overhead bridge with oscillating high-pressure wash arms that deliver targeted cleaning through a multi-step process of pre-soak, high-pressure detergent, and rinse stages. Built with D&S\'s emphasis on durability and field serviceability, the IQ 2.0 is designed for operators who need reliable touchless equipment that can be maintained without specialized technicians.',
    keyFeatures: [
      'Intelligent vehicle profiling system adapting wash parameters to each car\'s dimensions',
      'Oscillating high-pressure wash arms for thorough, targeted cleaning coverage',
      'Heavy-gauge steel construction built for years of continuous commercial operation',
      'Simplified component layout designed for field maintenance without specialized tools',
      'Multi-step chemical application with adjustable timing and concentration settings',
    ],
    bestFor: 'Independent operators and small chains who want dependable touchless equipment with intelligent wash capabilities and straightforward maintenance, particularly at locations where on-site technical support is limited.',
    seoTitle: 'D&S IQ 2.0 Touch Free Car Wash Locations',
    seoDescription: 'Find touchless car washes using the D&S IQ 2.0 Touch Free in-bay automatic system.',
  },
  { slug: 'carwash-systems', name: 'Carwash Systems', brandSlug: 'ds', description: 'D&S Carwash Systems offers a range of automatic car wash equipment designed for reliable, high-performance washing in both touchless and friction configurations.', seoTitle: 'D&S Carwash Systems Locations', seoDescription: 'Find car washes using D&S Carwash Systems automatic wash equipment.' },

  // Petit models
  {
    slug: 'accutrac-360i',
    name: 'Accutrac 360i',
    brandSlug: 'petit',
    description: 'The Petit AutoWash Accutrac 360i is a touchless in-bay automatic car wash system featuring a unique track-mounted overhead dual-arm carriage that provides true 360-degree cleaning coverage for all vehicle sizes. The dual-arm design allows the system to clean from multiple angles simultaneously, while the overhead track guides the carriage along the full length of the vehicle for comprehensive front-to-rear coverage. Engineered in Quebec for harsh northern climates, the Accutrac 360i is built with cold-weather durability and heavy-duty construction that stands up to the demanding conditions of year-round operation in salt-belt regions.',
    keyFeatures: [
      'Track-mounted overhead dual-arm carriage for true 360-degree wash coverage',
      'Cold-weather engineered components rated for reliable operation in extreme temperatures',
      'Heavy-duty stainless steel and corrosion-resistant construction for salt-belt durability',
      'High-pressure wash system with adjustable nozzle angles for targeted cleaning',
      'Wide vehicle accommodation from compact cars to full-size pickup trucks',
    ],
    bestFor: 'Car wash operators in cold-weather and salt-belt regions who need rugged, winter-capable touchless equipment that delivers comprehensive 360-degree cleaning of road salt, sand, and heavy winter grime.',
    seoTitle: 'Petit AutoWash Accutrac 360i Car Wash Locations',
    seoDescription: 'Find touchless car washes using the Petit AutoWash Accutrac 360i dual-arm system.',
  },
  { slug: 'accutrac-360t', name: 'Accutrac 360t', brandSlug: 'petit', description: 'The Petit AutoWash Accutrac 360t is a touchless car wash system designed for high-throughput operations with fast cycle times and comprehensive cleaning.', seoTitle: 'Petit AutoWash Accutrac 360t Car Wash Locations', seoDescription: 'Find touchless car washes using the Petit AutoWash Accutrac 360t system.' },
  { slug: 'accutrac-mini', name: 'Accutrac Mini', brandSlug: 'petit', description: 'The Petit AutoWash Accutrac Mini is a compact touchless car wash system designed for smaller bays and locations with limited space.', seoTitle: 'Petit AutoWash Accutrac Mini Car Wash Locations', seoDescription: 'Find touchless car washes using the Petit AutoWash Accutrac Mini compact system.' },

  // Oasis models
  {
    slug: 'typhoon',
    name: 'Typhoon',
    brandSlug: 'oasis',
    description: 'The Oasis Typhoon is Oasis Car Wash Systems\' flagship touchless in-bay automatic, featuring a distinctive horizontal spray bar design that delivers broad, even coverage of high-pressure water and chemicals across the vehicle surface. Unlike rotating-arm systems that concentrate pressure at a single point, the Typhoon\'s horizontal bars apply cleaning force across a wide swath simultaneously, resulting in fast cycle times and efficient use of water and chemicals. The Typhoon is designed for operators running high-volume locations who need quick turnaround without sacrificing cleaning quality.',
    keyFeatures: [
      'Horizontal spray bar design providing broad, simultaneous coverage across vehicle surfaces',
      'High-pressure pump system delivering powerful touchless cleaning performance',
      'Fast cycle times optimized for high-volume, quick-turnaround operations',
      'Efficient water and chemical usage reducing per-wash operating costs',
      'Durable, corrosion-resistant construction for long service life',
    ],
    bestFor: 'High-volume car wash locations where fast cycle times and efficient operation are priorities, particularly operators looking for a touchless system with a distinct spray bar approach rather than the traditional rotating arm design.',
    seoTitle: 'Oasis Typhoon Touchless Car Wash Locations',
    seoDescription: 'Find touchless car washes using the Oasis Typhoon high-performance touchless system.',
  },
  { slug: 'xr-1000', name: 'XR-1000', brandSlug: 'oasis', description: 'The Oasis XR-1000 is an extended-reach touchless car wash system designed to handle larger vehicles including trucks, vans, and SUVs.', seoTitle: 'Oasis XR-1000 Car Wash Locations', seoDescription: 'Find touchless car washes using the Oasis XR-1000 extended-reach wash system.' },

  // Mark VII models
  {
    slug: 'choicewash-xt',
    name: 'ChoiceWash XT',
    brandSlug: 'mark_vii',
    description: 'The Mark VII ChoiceWash XT is a versatile touchless in-bay automatic car wash system designed specifically for convenience store and gas station locations where high throughput and customer flexibility are essential. The XT designation indicates the touchless-only configuration of the ChoiceWash platform, using high-pressure water and advanced chemical application to deliver a thorough clean without any physical contact. Backed by WashTec\'s global engineering resources, the ChoiceWash XT combines European design precision with North American market requirements for a well-rounded touchless system.',
    keyFeatures: [
      'High-throughput design optimized for gas station and convenience store traffic patterns',
      'Advanced vehicle detection and profiling for adaptive wash cycle configuration',
      'Multiple configurable wash packages for tiered customer pricing options',
      'Backed by WashTec global engineering and North American service infrastructure',
      'Connected equipment platform with remote monitoring and performance analytics',
    ],
    bestFor: 'Petroleum and convenience store chains seeking a versatile, well-supported touchless system from a global manufacturer, particularly multi-site operators who benefit from centralized monitoring and standardized equipment across locations.',
    seoTitle: 'Mark VII ChoiceWash XT Car Wash Locations',
    seoDescription: 'Find touchless car washes using the Mark VII ChoiceWash XT system.',
  },
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

  // Futura models
  { slug: 'revolution', name: 'Revolution', brandSlug: 'futura', description: 'The Futura Revolution is a touchless in-bay automatic car wash system that uses high-pressure water jets and staged chemical application to clean vehicles without any physical contact.', seoTitle: 'Futura Revolution Car Wash Locations', seoDescription: 'Find touchless car washes using the Futura Revolution automatic wash system.' },
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
