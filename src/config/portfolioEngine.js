// ─────────────────────────────────────────────────────────────────────────────
// Portfolio Review Engine — Master Data
// Core Flow: Industry → Portfolio → Asset → Exposure → Product → Clause → Report
// ─────────────────────────────────────────────────────────────────────────────

export const INDUSTRIES = [
  { code:'IND-APP',    name:'Apparel / Garment Manufacturing',     sector:'Manufacturing',      risk:'High',     typical:'Fire, machinery breakdown, BI, WCI, marine cargo, public liability, cyber' },
  { code:'IND-FOOD',   name:'Food & Beverage Manufacturing',       sector:'Manufacturing',      risk:'High',     typical:'Fire, contamination, product liability, boiler, refrigeration, BI' },
  { code:'IND-PHARMA', name:'Pharmaceutical Manufacturing',        sector:'Manufacturing',      risk:'High',     typical:'Fire, contamination, product liability, cold chain, cyber, BI' },
  { code:'IND-CHEM',   name:'Chemical Manufacturing',              sector:'Manufacturing',      risk:'Critical', typical:'Fire, explosion, pollution, liability, stock contamination, BI' },
  { code:'IND-PLAST',  name:'Plastic / Rubber Manufacturing',      sector:'Manufacturing',      risk:'High',     typical:'Fire load, machinery breakdown, pollution, product liability' },
  { code:'IND-WOOD',   name:'Wood / Furniture Manufacturing',      sector:'Manufacturing',      risk:'Critical', typical:'Fire load, dust explosion, machinery, stock, BI' },
  { code:'IND-METAL',  name:'Metal / Engineering Fabrication',     sector:'Manufacturing',      risk:'Medium',   typical:'Machinery, hot work, fire, liability, WCI' },
  { code:'IND-HOTEL',  name:'Hotels & Hospitality',                sector:'Services',           risk:'High',     typical:'Fire, public liability, food liability, BI, cyber, employee injury' },
  { code:'IND-HOSP',   name:'Hospitals / Healthcare',              sector:'Healthcare',         risk:'High',     typical:'Medical malpractice, fire, cyber, equipment breakdown, BI' },
  { code:'IND-EDU',    name:'Schools / Universities',              sector:'Education',          risk:'Medium',   typical:'Public liability, student accident, property, cyber' },
  { code:'IND-CONST',  name:'Construction Contractors',            sector:'Engineering',        risk:'High',     typical:'CAR, WCI, plant, TPL, design, project delay' },
  { code:'IND-LOG',    name:'Logistics / Warehousing',             sector:'Logistics',          risk:'High',     typical:'Fire, stock, marine, goods in custody, motor fleet, theft' },
  { code:'IND-RETAIL', name:'Retail / Supermarkets',               sector:'Retail',             risk:'Medium',   typical:'Public liability, stock, money, cyber, product liability' },
  { code:'IND-AGRI',   name:'Agriculture / Plantation',            sector:'Agriculture',        risk:'Medium',   typical:'Crop, livestock, machinery, weather, WCI, fire' },
  { code:'IND-BANK',   name:'Banks / Finance / Leasing',           sector:'Financial Services', risk:'High',     typical:'Cyber, crime, PI, D&O, fidelity, cash, property' },
  { code:'IND-IT',     name:'IT / Software / BPO',                 sector:'Technology',         risk:'Medium',   typical:'Cyber, PI/E&O, data privacy, employee, property' },
  { code:'IND-MARINE', name:'Marine / Shipping / Ports',           sector:'Marine',             risk:'High',     typical:'Marine hull, cargo, port liability, pollution, WCI' },
  { code:'IND-POWER',  name:'Energy / Power Generation',           sector:'Energy',             risk:'Critical', typical:'Fire, machinery, BI, boiler/turbine, liability, pollution' },
  { code:'IND-REAL',   name:'Real Estate / Property Owners',       sector:'Real Estate',        risk:'Medium',   typical:'Property, public liability, rent loss, terrorism, natural perils' },
  { code:'IND-BOI',    name:'BOI Export Manufacturing',            sector:'Manufacturing',      risk:'High',     typical:'Fire, BI, WCI, marine, liability, compliance, cyber' },
  { code:'IND-TEXT',   name:'Textile Mills / Dyeing',              sector:'Manufacturing',      risk:'High',     typical:'Fire, boiler, pollution, machinery, stock, BI' },
  { code:'IND-COLD',   name:'Cold Storage / Refrigeration',        sector:'Logistics',          risk:'High',     typical:'Deterioration of stock, machinery breakdown, fire, BI' },
  { code:'IND-AUTO',   name:'Automobile Workshops / Dealers',      sector:'Motor Trade',        risk:'Medium',   typical:'Garage liability, fire, theft, motor trade, public liability' },
  { code:'IND-AIR',    name:'Aviation / Airports',                 sector:'Aviation',           risk:'Critical', typical:'Aviation liability, property, cyber, BI, terrorism' },
];

// ─── PORTFOLIOS ──────────────────────────────────────────────────────────────
export const PORTFOLIOS = [
  // IND-APP Apparel Manufacturing
  { code:'PF-FACTORY',   industryCodes:['IND-APP','IND-FOOD','IND-PHARMA','IND-CHEM','IND-PLAST','IND-WOOD','IND-METAL','IND-BOI','IND-TEXT','IND-POWER'], name:'Factory / Production Facility',      desc:'Main manufacturing premises including production floor and utilities',                      priority:1 },
  { code:'PF-WHOUSE',    industryCodes:['IND-APP','IND-FOOD','IND-LOG','IND-RETAIL','IND-BOI','IND-COLD'],                                                   name:'Warehouse / Stores',                  desc:'Raw material, finished goods, packing material and spare parts storage',                   priority:1 },
  { code:'PF-HQ',        industryCodes:['IND-APP','IND-FOOD','IND-HOTEL','IND-HOSP','IND-BANK','IND-IT','IND-REAL','IND-BOI'],                               name:'Head Office / Admin Office',           desc:'Management, finance, HR and admin location',                                              priority:2 },
  { code:'PF-WORKERS',   industryCodes:['IND-APP','IND-FOOD','IND-PHARMA','IND-CHEM','IND-HOTEL','IND-CONST','IND-LOG','IND-BOI','IND-TEXT','IND-MARINE'],   name:'Employee / Worker Exposure',           desc:'Permanent, temporary, contract and outsourced employees',                                  priority:1 },
  { code:'PF-MARINE',    industryCodes:['IND-APP','IND-FOOD','IND-PHARMA','IND-CHEM','IND-LOG','IND-BOI','IND-TEXT','IND-MARINE'],                           name:'Import / Export Cargo',               desc:'Raw materials imported and finished goods exported',                                       priority:1 },
  { code:'PF-UTIL',      industryCodes:['IND-APP','IND-FOOD','IND-PHARMA','IND-CHEM','IND-HOTEL','IND-HOSP','IND-TEXT','IND-POWER'],                         name:'Utilities & Services',                desc:'Boilers, generators, compressors, chillers, transformers, HVAC',                           priority:1 },
  { code:'PF-IT',        industryCodes:['IND-APP','IND-FOOD','IND-BANK','IND-IT','IND-HOTEL','IND-HOSP','IND-RETAIL','IND-BOI'],                             name:'IT / ERP / Data Systems',             desc:'ERP, payroll, production systems, cloud systems and data',                                 priority:2 },
  { code:'PF-LIAB',      industryCodes:['IND-APP','IND-FOOD','IND-HOTEL','IND-HOSP','IND-CONST','IND-RETAIL','IND-BOI','IND-AUTO'],                          name:'Third Party / Contractual Exposure',  desc:'Visitors, contractors, BOI zone requirements, landlords and principals',                   priority:1 },
  { code:'PF-FLEET',     industryCodes:['IND-APP','IND-LOG','IND-CONST','IND-RETAIL','IND-BOI','IND-AUTO'],                                                  name:'Vehicle / Transport Exposure',        desc:'Company vehicles, staff transport, goods movement',                                        priority:3 },
  { code:'PF-DIRECTORS', industryCodes:['IND-APP','IND-FOOD','IND-BANK','IND-HOTEL','IND-HOSP','IND-BOI'],                                                   name:'Management / Directors',              desc:'Directors, officers and senior management legal exposure',                                 priority:3 },
  { code:'PF-COLD',      industryCodes:['IND-FOOD','IND-PHARMA','IND-COLD'],                                                                                 name:'Cold Storage / Refrigerated Stock',   desc:'Temperature-controlled stock and perishables',                                             priority:1 },
  { code:'PF-PRODUCT',   industryCodes:['IND-FOOD','IND-PHARMA','IND-PLAST','IND-BOI'],                                                                      name:'Products Sold to Market',             desc:'Product liability, recall and contamination exposure',                                     priority:1 },
  { code:'PF-CONST-PROJ',industryCodes:['IND-CONST'],                                                                                                        name:'Construction Project',                desc:'Project works, temporary works and site operations',                                       priority:1 },
  { code:'PF-CONST-PLANT',industryCodes:['IND-CONST'],                                                                                                       name:'Contractor Plant & Machinery',        desc:'Owned and hired construction equipment',                                                   priority:1 },
  { code:'PF-MEDICAL',   industryCodes:['IND-HOSP'],                                                                                                         name:'Medical Equipment & Liability',       desc:'Medical devices, equipment and professional liability exposure',                           priority:1 },
  { code:'PF-CROP',      industryCodes:['IND-AGRI'],                                                                                                         name:'Crops / Livestock',                   desc:'Standing crops, plantation, poultry, livestock and fisheries',                             priority:1 },
  { code:'PF-CASH',      industryCodes:['IND-BANK','IND-RETAIL'],                                                                                            name:'Cash / Money / Valuables',            desc:'Cash in transit, ATMs, vault, safe and currency exposure',                                 priority:1 },
  { code:'PF-VESSEL',    industryCodes:['IND-MARINE'],                                                                                                       name:'Marine Vessels / Hull',               desc:'Owned and chartered vessels, port craft and marine equipment',                             priority:1 },
];

// ─── ASSETS ──────────────────────────────────────────────────────────────────
export const ASSETS = [
  { code:'AST-BLD',     name:'Buildings',                    category:'Property',            desc:'Factory, warehouse, office and ancillary buildings',             valuationBasis:'Reinstatement value',         dataRequired:'Construction, age, floor area, occupancy, fire protection, exposure' },
  { code:'AST-STOCK',   name:'Stock / Inventory',            category:'Property',            desc:'Raw material, WIP, finished goods, packing material',            valuationBasis:'Cost / selling price',        dataRequired:'Stock value, storage method, combustibility, max stock' },
  { code:'AST-MACH',    name:'Production Machinery',         category:'Engineering',         desc:'Production lines, plant and equipment',                          valuationBasis:'Replacement value',           dataRequired:'Machine type, value, age, maintenance, criticality' },
  { code:'AST-BOILER',  name:'Boilers / Pressure Vessels',   category:'Engineering',         desc:'Steam boilers and pressure vessels',                             valuationBasis:'Replacement value',           dataRequired:'Capacity, inspection certificate, pressure, maintenance' },
  { code:'AST-GEN',     name:'Generators',                   category:'Engineering',         desc:'Backup power generation units',                                  valuationBasis:'Replacement value',           dataRequired:'KVA, fuel type, location, maintenance' },
  { code:'AST-HVAC',    name:'AC / Chillers / Cooling',      category:'Engineering',         desc:'Chillers, coolers, air-conditioning systems',                    valuationBasis:'Replacement value',           dataRequired:'Capacity, criticality, maintenance, stock dependency' },
  { code:'AST-ELEC',    name:'Electrical Installation',      category:'Property/Engineering',desc:'Transformers, panels, wiring, switch gear',                      valuationBasis:'Replacement value',           dataRequired:'Inspection, thermography, load, age' },
  { code:'AST-EMP',     name:'Employees / Workers',          category:'People',              desc:'Permanent, temporary, contract and outsourced employees',        valuationBasis:'Payroll / headcount',         dataRequired:'Wage roll, categories, work nature, PPE' },
  { code:'AST-CARGO',   name:'Cargo / Goods in Transit',     category:'Marine',              desc:'Imports, exports, local transit',                                valuationBasis:'Invoice + freight + uplift',  dataRequired:'Commodity, route, mode, packing, value' },
  { code:'AST-IT',      name:'IT Systems / Data',            category:'Cyber',               desc:'ERP, payroll, finance, customer and supplier data',              valuationBasis:'Restoration cost',            dataRequired:'Records, cloud, MFA, backup, cyber controls' },
  { code:'AST-CASH',    name:'Cash / Money / Securities',    category:'Financial Crime',     desc:'Cash in hand, transit, safe, cashier exposure',                  valuationBasis:'Limit basis',                 dataRequired:'Cash limit, transit route, security controls' },
  { code:'AST-VISITOR', name:'Visitors / Contractors / Public',category:'Liability',         desc:'Third parties entering or affected by operations',               valuationBasis:'Liability limit',             dataRequired:'Public access, contractors, permits, incidents' },
  { code:'AST-VEH',     name:'Vehicles / Fleet',             category:'Motor',               desc:'Own vehicles, staff transport, delivery vehicles',               valuationBasis:'Market value',                dataRequired:'Vehicle schedule, usage, drivers, claims' },
  { code:'AST-DIR',     name:'Directors & Officers',         category:'Management Liability', desc:'Board and management legal exposure',                           valuationBasis:'Limit basis',                 dataRequired:'Company size, governance, financials, litigation' },
];

// ─── PORTFOLIO → ASSET MAPPING ───────────────────────────────────────────────
export const PORTFOLIO_ASSET_MAP = [
  // Factory
  { id:'PAM-001', industryCode:'IND-APP',  portfolioCode:'PF-FACTORY',    assetCode:'AST-BLD',     mandatory:'Yes',         priority:1 },
  { id:'PAM-002', industryCode:'IND-APP',  portfolioCode:'PF-FACTORY',    assetCode:'AST-MACH',    mandatory:'Yes',         priority:1 },
  { id:'PAM-003', industryCode:'IND-APP',  portfolioCode:'PF-FACTORY',    assetCode:'AST-ELEC',    mandatory:'Yes',         priority:1 },
  { id:'PAM-004', industryCode:'IND-APP',  portfolioCode:'PF-FACTORY',    assetCode:'AST-STOCK',   mandatory:'Yes',         priority:1 },
  { id:'PAM-005', industryCode:'IND-APP',  portfolioCode:'PF-UTIL',       assetCode:'AST-BOILER',  mandatory:'Conditional', priority:1 },
  { id:'PAM-006', industryCode:'IND-APP',  portfolioCode:'PF-UTIL',       assetCode:'AST-GEN',     mandatory:'Conditional', priority:2 },
  { id:'PAM-007', industryCode:'IND-APP',  portfolioCode:'PF-UTIL',       assetCode:'AST-HVAC',    mandatory:'Conditional', priority:2 },
  { id:'PAM-008', industryCode:'IND-APP',  portfolioCode:'PF-WORKERS',    assetCode:'AST-EMP',     mandatory:'Yes',         priority:1 },
  { id:'PAM-009', industryCode:'IND-APP',  portfolioCode:'PF-MARINE',     assetCode:'AST-CARGO',   mandatory:'Conditional', priority:1 },
  { id:'PAM-010', industryCode:'IND-APP',  portfolioCode:'PF-IT',         assetCode:'AST-IT',      mandatory:'Yes',         priority:2 },
  { id:'PAM-011', industryCode:'IND-APP',  portfolioCode:'PF-HQ',         assetCode:'AST-CASH',    mandatory:'Conditional', priority:3 },
  { id:'PAM-012', industryCode:'IND-APP',  portfolioCode:'PF-LIAB',       assetCode:'AST-VISITOR', mandatory:'Yes',         priority:1 },
  { id:'PAM-013', industryCode:'IND-APP',  portfolioCode:'PF-FLEET',      assetCode:'AST-VEH',     mandatory:'Conditional', priority:3 },
  { id:'PAM-014', industryCode:'IND-APP',  portfolioCode:'PF-DIRECTORS',  assetCode:'AST-DIR',     mandatory:'Conditional', priority:3 },
  { id:'PAM-015', industryCode:'IND-FOOD', portfolioCode:'PF-COLD',       assetCode:'AST-HVAC',    mandatory:'Yes',         priority:1 },
  { id:'PAM-016', industryCode:'IND-FOOD', portfolioCode:'PF-COLD',       assetCode:'AST-STOCK',   mandatory:'Yes',         priority:1 },
  { id:'PAM-017', industryCode:'IND-FOOD', portfolioCode:'PF-PRODUCT',    assetCode:'AST-STOCK',   mandatory:'Yes',         priority:1 },
  { id:'PAM-018', industryCode:'IND-CONST',portfolioCode:'PF-CONST-PROJ', assetCode:'AST-BLD',     mandatory:'Yes',         priority:1 },
  { id:'PAM-019', industryCode:'IND-CONST',portfolioCode:'PF-CONST-PROJ', assetCode:'AST-ELEC',    mandatory:'Yes',         priority:1 },
  { id:'PAM-020', industryCode:'IND-CONST',portfolioCode:'PF-CONST-PLANT',assetCode:'AST-MACH',    mandatory:'Yes',         priority:1 },
  // Generic cross-industry mappings
  { id:'PAM-021', industryCode:'*', portfolioCode:'PF-FACTORY',   assetCode:'AST-BLD',     mandatory:'Yes',         priority:1 },
  { id:'PAM-022', industryCode:'*', portfolioCode:'PF-FACTORY',   assetCode:'AST-MACH',    mandatory:'Yes',         priority:1 },
  { id:'PAM-023', industryCode:'*', portfolioCode:'PF-FACTORY',   assetCode:'AST-STOCK',   mandatory:'Yes',         priority:1 },
  { id:'PAM-024', industryCode:'*', portfolioCode:'PF-WHOUSE',    assetCode:'AST-BLD',     mandatory:'Yes',         priority:1 },
  { id:'PAM-025', industryCode:'*', portfolioCode:'PF-WHOUSE',    assetCode:'AST-STOCK',   mandatory:'Yes',         priority:1 },
  { id:'PAM-026', industryCode:'*', portfolioCode:'PF-HQ',        assetCode:'AST-BLD',     mandatory:'Yes',         priority:1 },
  { id:'PAM-027', industryCode:'*', portfolioCode:'PF-HQ',        assetCode:'AST-IT',      mandatory:'Yes',         priority:2 },
  { id:'PAM-028', industryCode:'*', portfolioCode:'PF-WORKERS',   assetCode:'AST-EMP',     mandatory:'Yes',         priority:1 },
  { id:'PAM-029', industryCode:'*', portfolioCode:'PF-MARINE',    assetCode:'AST-CARGO',   mandatory:'Yes',         priority:1 },
  { id:'PAM-030', industryCode:'*', portfolioCode:'PF-IT',        assetCode:'AST-IT',      mandatory:'Yes',         priority:1 },
  { id:'PAM-031', industryCode:'*', portfolioCode:'PF-LIAB',      assetCode:'AST-VISITOR', mandatory:'Yes',         priority:1 },
  { id:'PAM-032', industryCode:'*', portfolioCode:'PF-FLEET',     assetCode:'AST-VEH',     mandatory:'Yes',         priority:1 },
  { id:'PAM-033', industryCode:'*', portfolioCode:'PF-DIRECTORS', assetCode:'AST-DIR',     mandatory:'Yes',         priority:1 },
  { id:'PAM-034', industryCode:'*', portfolioCode:'PF-HQ',        assetCode:'AST-CASH',    mandatory:'Conditional', priority:2 },
  { id:'PAM-035', industryCode:'*', portfolioCode:'PF-UTIL',      assetCode:'AST-BOILER',  mandatory:'Conditional', priority:1 },
  { id:'PAM-036', industryCode:'*', portfolioCode:'PF-UTIL',      assetCode:'AST-GEN',     mandatory:'Conditional', priority:2 },
  { id:'PAM-037', industryCode:'*', portfolioCode:'PF-UTIL',      assetCode:'AST-HVAC',    mandatory:'Conditional', priority:2 },
  { id:'PAM-038', industryCode:'*', portfolioCode:'PF-CASH',      assetCode:'AST-CASH',    mandatory:'Yes',         priority:1 },
];

// ─── EXPOSURES ────────────────────────────────────────────────────────────────
export const EXPOSURES = [
  { code:'EXP-FIRE',   name:'Fire & Lightning',          category:'Property',    desc:'Damage to property by fire or lightning',                               severity:5, frequency:2, insurability:'Insurable' },
  { code:'EXP-NATCAT', name:'Natural Perils',             category:'Property',    desc:'Flood, storm, cyclone, earthquake, landslide, tsunami',                 severity:5, frequency:2, insurability:'Insurable' },
  { code:'EXP-MB',     name:'Machinery Breakdown',        category:'Engineering', desc:'Sudden and unforeseen machinery damage',                                severity:4, frequency:3, insurability:'Insurable' },
  { code:'EXP-BOILER', name:'Boiler Explosion',           category:'Engineering', desc:'Explosion or collapse of boiler / pressure vessel',                    severity:5, frequency:2, insurability:'Insurable' },
  { code:'EXP-BI',     name:'Business Interruption',      category:'Financial',   desc:'Loss of gross profit / revenue after insured damage',                  severity:5, frequency:2, insurability:'Insurable' },
  { code:'EXP-WCI',    name:'Employee Injury',            category:'People',      desc:'Work-related injury, disease or death',                                 severity:4, frequency:3, insurability:'Insurable/Statutory' },
  { code:'EXP-PL',     name:'Public Liability',           category:'Liability',   desc:'Third-party bodily injury or property damage',                          severity:4, frequency:2, insurability:'Insurable' },
  { code:'EXP-PROD',   name:'Product Liability',          category:'Liability',   desc:'Injury / damage caused by products sold',                               severity:5, frequency:2, insurability:'Insurable' },
  { code:'EXP-MAR',    name:'Marine Cargo Transit',       category:'Marine',      desc:'Loss or damage to cargo during transit',                                severity:4, frequency:3, insurability:'Insurable' },
  { code:'EXP-CYBER',  name:'Cyber / Data Breach',        category:'Cyber',       desc:'Data breach, ransomware, cyber BI, privacy liability',                  severity:5, frequency:3, insurability:'Insurable' },
  { code:'EXP-FID',    name:'Employee Dishonesty',        category:'Crime',       desc:'Fraud or dishonesty by employees',                                      severity:4, frequency:2, insurability:'Insurable' },
  { code:'EXP-POLL',   name:'Pollution / Environmental',  category:'Liability',   desc:'Pollution, contamination, environmental damage',                        severity:5, frequency:2, insurability:'Specialist' },
  { code:'EXP-DNO',    name:'Directors & Officers',       category:'Management',  desc:'Claims against directors / officers',                                   severity:4, frequency:2, insurability:'Insurable' },
  { code:'EXP-MONEY',  name:'Money / Cash',               category:'Crime',       desc:'Loss of cash in safe, premises or transit',                             severity:3, frequency:3, insurability:'Insurable' },
];

// ─── ASSET → EXPOSURE MAPPING ────────────────────────────────────────────────
export const ASSET_EXPOSURE_MAP = [
  { id:'AEM-001', assetCode:'AST-BLD',     exposureCode:'EXP-FIRE',   relevance:'High',   triggerQ:'Construction type, occupancy, protection, fire load, housekeeping',    scoreWeight:5 },
  { id:'AEM-002', assetCode:'AST-BLD',     exposureCode:'EXP-NATCAT', relevance:'Medium', triggerQ:'Flood zone, storm exposure, elevation, drainage, past events',          scoreWeight:4 },
  { id:'AEM-003', assetCode:'AST-BLD',     exposureCode:'EXP-BI',     relevance:'High',   triggerQ:'Single location risk, recovery time, customer dependency',               scoreWeight:4 },
  { id:'AEM-004', assetCode:'AST-STOCK',   exposureCode:'EXP-FIRE',   relevance:'High',   triggerQ:'Combustibility, storage height, max stock value, sprinklers',            scoreWeight:5 },
  { id:'AEM-005', assetCode:'AST-MACH',    exposureCode:'EXP-MB',     relevance:'High',   triggerQ:'Age, maintenance, OEM support, criticality, spares availability',        scoreWeight:5 },
  { id:'AEM-006', assetCode:'AST-MACH',    exposureCode:'EXP-BI',     relevance:'High',   triggerQ:'Critical machine bottleneck, replacement lead time, alternate capacity', scoreWeight:5 },
  { id:'AEM-007', assetCode:'AST-BOILER',  exposureCode:'EXP-BOILER', relevance:'High',   triggerQ:'Inspection certificate, age, pressure, operator training',               scoreWeight:5 },
  { id:'AEM-008', assetCode:'AST-HVAC',    exposureCode:'EXP-MB',     relevance:'High',   triggerQ:'Chiller age, maintenance, critical cooling dependency',                  scoreWeight:4 },
  { id:'AEM-009', assetCode:'AST-HVAC',    exposureCode:'EXP-BI',     relevance:'Medium', triggerQ:'Cold storage dependency, stock deterioration risk',                      scoreWeight:3 },
  { id:'AEM-010', assetCode:'AST-EMP',     exposureCode:'EXP-WCI',    relevance:'High',   triggerQ:'Headcount, job category, hazardous work, PPE, training',                 scoreWeight:5 },
  { id:'AEM-011', assetCode:'AST-CARGO',   exposureCode:'EXP-MAR',    relevance:'High',   triggerQ:'Route, commodity, packing, mode, value, theft risk',                     scoreWeight:5 },
  { id:'AEM-012', assetCode:'AST-IT',      exposureCode:'EXP-CYBER',  relevance:'High',   triggerQ:'MFA, backup, EDR, cloud, data records, prior breach',                    scoreWeight:5 },
  { id:'AEM-013', assetCode:'AST-CASH',    exposureCode:'EXP-FID',    relevance:'Medium', triggerQ:'Segregation, dual authorization, audit, mandatory leave',                scoreWeight:4 },
  { id:'AEM-014', assetCode:'AST-CASH',    exposureCode:'EXP-MONEY',  relevance:'High',   triggerQ:'Cash on premises, transit frequency, safe rating, security',             scoreWeight:4 },
  { id:'AEM-015', assetCode:'AST-VISITOR', exposureCode:'EXP-PL',     relevance:'High',   triggerQ:'Public access, contractors, permits, safety controls',                   scoreWeight:5 },
  { id:'AEM-016', assetCode:'AST-VEH',     exposureCode:'EXP-MB',     relevance:'Medium', triggerQ:'Fleet size, age, maintenance, usage type, accident history',             scoreWeight:3 },
  { id:'AEM-017', assetCode:'AST-DIR',     exposureCode:'EXP-DNO',    relevance:'Medium', triggerQ:'Board structure, litigation, financials, regulatory exposure',           scoreWeight:3 },
  { id:'AEM-018', assetCode:'AST-STOCK',   exposureCode:'EXP-PROD',   relevance:'Medium', triggerQ:'Products sold externally, export markets, recall history',               scoreWeight:4 },
  { id:'AEM-019', assetCode:'AST-ELEC',    exposureCode:'EXP-FIRE',   relevance:'High',   triggerQ:'Age of wiring, inspection records, thermography, load capacity',        scoreWeight:4 },
];

// ─── PRODUCTS ────────────────────────────────────────────────────────────────
export const PRODUCTS = [
  { code:'PRD-FIRE',  name:'Fire & Allied Perils',                        family:'Property',          desc:'Buildings, stock, machinery and contents against fire and allied perils',      priority:1, requiresSI:true },
  { code:'PRD-BI',    name:'Business Interruption',                       family:'Property/Financial', desc:'Loss of gross profit / revenue following insured property damage',            priority:1, requiresSI:true },
  { code:'PRD-MB',    name:'Machinery Breakdown',                         family:'Engineering',        desc:'Sudden unforeseen physical damage to machinery',                              priority:1, requiresSI:true },
  { code:'PRD-BOILER',name:'Boiler & Pressure Vessel Explosion',          family:'Engineering',        desc:'Boiler explosion / collapse and surrounding property damage',                 priority:1, requiresSI:true },
  { code:'PRD-EEI',   name:'Electronic Equipment Insurance',              family:'Engineering',        desc:'Electronic equipment accidental damage and breakdown',                         priority:2, requiresSI:true },
  { code:'PRD-WCI',   name:'Workmen Compensation / Employers Liability',  family:'Liability/People',   desc:'Employee injury liability and statutory compensation',                         priority:1, requiresSI:true },
  { code:'PRD-GPA',   name:'Group Personal Accident',                     family:'People',             desc:'Accidental death / disability benefits to employees',                         priority:2, requiresSI:true },
  { code:'PRD-GMED',  name:'Group Medical / Surgical & Hospitalization',  family:'People',             desc:'Medical and hospitalization benefits',                                        priority:2, requiresSI:true },
  { code:'PRD-PL',    name:'Public Liability',                            family:'Liability',          desc:'Third-party bodily injury / property damage',                                 priority:1, requiresSI:true },
  { code:'PRD-PROD',  name:'Product Liability',                           family:'Liability',          desc:'Liability arising from products sold',                                        priority:2, requiresSI:true },
  { code:'PRD-MAR',   name:'Marine Cargo',                                family:'Marine',             desc:'Import / export / local cargo transit risks',                                 priority:1, requiresSI:true },
  { code:'PRD-CYBER', name:'Cyber Insurance',                             family:'Cyber',              desc:'Data breach, ransomware, cyber BI and privacy liability',                     priority:2, requiresSI:true },
  { code:'PRD-FID',   name:'Fidelity Guarantee / Crime',                  family:'Crime',              desc:'Employee dishonesty, fraud and money risks',                                  priority:3, requiresSI:true },
  { code:'PRD-DNO',   name:'Directors & Officers Liability',              family:'Management',         desc:'Management liability protection',                                             priority:3, requiresSI:true },
  { code:'PRD-MOTOR', name:'Motor Fleet',                                 family:'Motor',              desc:'Company vehicle fleet cover',                                                 priority:3, requiresSI:true },
  { code:'PRD-POLL',  name:'Environmental Liability',                     family:'Liability',          desc:'Pollution, contamination and environmental liabilities',                      priority:3, requiresSI:true },
];

// ─── EXPOSURE → PRODUCT MAPPING ──────────────────────────────────────────────
export const EXPOSURE_PRODUCT_MAP = [
  { id:'EPM-001', exposureCode:'EXP-FIRE',   productCode:'PRD-FIRE',  strength:'Mandatory',                    reason:'Core cover for buildings, stock, machinery and contents',           priority:1 },
  { id:'EPM-002', exposureCode:'EXP-NATCAT', productCode:'PRD-FIRE',  strength:'Strong',                       reason:'Natural perils extension under fire / property program',             priority:1 },
  { id:'EPM-003', exposureCode:'EXP-BI',     productCode:'PRD-BI',    strength:'Mandatory if BI exposure',     reason:'Protects revenue / gross profit after insured property damage',     priority:1 },
  { id:'EPM-004', exposureCode:'EXP-MB',     productCode:'PRD-MB',    strength:'Mandatory for production',     reason:'Machinery breakdown can stop production entirely',                  priority:1 },
  { id:'EPM-005', exposureCode:'EXP-BOILER', productCode:'PRD-BOILER',strength:'Mandatory if boiler exists',   reason:'Explosion / collapse exposure requires specialist cover',           priority:1 },
  { id:'EPM-006', exposureCode:'EXP-WCI',    productCode:'PRD-WCI',   strength:'Mandatory',                    reason:'Employee injury and statutory employer liability exposure',          priority:1 },
  { id:'EPM-007', exposureCode:'EXP-WCI',    productCode:'PRD-GPA',   strength:'Recommended',                  reason:'Enhances employee benefits and accident protection',                priority:2 },
  { id:'EPM-008', exposureCode:'EXP-WCI',    productCode:'PRD-GMED',  strength:'Recommended',                  reason:'Improves HR risk management and talent retention',                  priority:2 },
  { id:'EPM-009', exposureCode:'EXP-PL',     productCode:'PRD-PL',    strength:'Mandatory',                    reason:'Public / visitor / contractor liability exposure',                  priority:1 },
  { id:'EPM-010', exposureCode:'EXP-PROD',   productCode:'PRD-PROD',  strength:'Strong',                       reason:'Product liability if products are sold or exported',                priority:2 },
  { id:'EPM-011', exposureCode:'EXP-MAR',    productCode:'PRD-MAR',   strength:'Mandatory if import/export',   reason:'Cargo transit loss exposure requires dedicated cover',              priority:1 },
  { id:'EPM-012', exposureCode:'EXP-CYBER',  productCode:'PRD-CYBER', strength:'Strong',                       reason:'ERP, payroll and data systems create significant cyber risk',       priority:2 },
  { id:'EPM-013', exposureCode:'EXP-FID',    productCode:'PRD-FID',   strength:'Recommended',                  reason:'Finance and cash handling staff dishonesty risk',                   priority:3 },
  { id:'EPM-014', exposureCode:'EXP-MONEY',  productCode:'PRD-FID',   strength:'Recommended',                  reason:'Money and cash in transit / premises risk',                         priority:3 },
  { id:'EPM-015', exposureCode:'EXP-DNO',    productCode:'PRD-DNO',   strength:'Recommended',                  reason:'Directors and management face regulatory and legal exposure',       priority:3 },
  { id:'EPM-016', exposureCode:'EXP-POLL',   productCode:'PRD-POLL',  strength:'Specialist review',            reason:'Pollution exposure requires specialist underwriting assessment',    priority:3 },
];

// ─── CLAUSES ─────────────────────────────────────────────────────────────────
export const CLAUSES = [
  { code:'CL-FIRE-RVC',   name:'Reinstatement Value Clause',         productCode:'PRD-FIRE',  category:'Basis of Settlement',    purpose:'Settlement on replacement / reinstatement basis',                              standard:'Standard for commercial property' },
  { code:'CL-FIRE-CAP',   name:'Capital Addition Clause',            productCode:'PRD-FIRE',  category:'Automatic Cover',         purpose:'Automatically covers newly acquired assets up to defined limit',               standard:'Recommended' },
  { code:'CL-FIRE-ESC',   name:'Escalation Clause',                  productCode:'PRD-FIRE',  category:'Inflation Protection',    purpose:'Protects against inflation / price increase',                                  standard:'Recommended' },
  { code:'CL-FIRE-ARD',   name:'Automatic Reinstatement of SI',      productCode:'PRD-FIRE',  category:'Claims Recovery',         purpose:'Reinstates sum insured after claim subject to premium',                         standard:'Recommended' },
  { code:'CL-FIRE-DEB',   name:'Removal of Debris Clause',           productCode:'PRD-FIRE',  category:'Claims Cost',             purpose:'Covers debris removal after insured event',                                    standard:'Recommended' },
  { code:'CL-FIRE-PF',    name:'Professional Fees Clause',           productCode:'PRD-FIRE',  category:'Claims Cost',             purpose:'Architects / surveyors / consultants fees',                                    standard:'Recommended' },
  { code:'CL-FIRE-LA',    name:'Local Authority Clause',             productCode:'PRD-FIRE',  category:'Compliance',              purpose:'Additional cost to comply with local authority regulations',                    standard:'Recommended' },
  { code:'CL-FIRE-FEE',   name:'Fire Extinguishing Expenses',        productCode:'PRD-FIRE',  category:'Loss Mitigation',         purpose:'Fire brigade / fire extinguishing costs',                                      standard:'Recommended' },
  { code:'CL-FIRE-SEAS',  name:'Seasonal Increase Clause',           productCode:'PRD-FIRE',  category:'Stock Fluctuation',       purpose:'Automatically increases stock limit during peak season',                        standard:'Optional' },
  { code:'CL-FIRE-MORT',  name:'Mortgagee / Bank Clause',            productCode:'PRD-FIRE',  category:'Financial Interest',      purpose:'Protects bank / lender interest',                                              standard:'Required if bank interest exists' },
  { code:'CL-FIRE-WOS',   name:'Waiver of Subrogation Clause',       productCode:'PRD-FIRE',  category:'Contractual',             purpose:'Waives recovery rights against named parties',                                  standard:'Optional/Contractual' },
  { code:'CL-FIRE-JI',    name:'Joint Insured Clause',               productCode:'PRD-FIRE',  category:'Insured Parties',         purpose:'Extends cover to multiple insured parties',                                     standard:'Optional' },
  { code:'CL-MB-AIR',     name:'Air Freight Clause',                 productCode:'PRD-MB',    category:'Claims Cost',             purpose:'Covers air freight for urgent machinery parts',                                 standard:'Recommended for imported machinery' },
  { code:'CL-MB-EXP',     name:'Expediting Expenses Clause',         productCode:'PRD-MB',    category:'Claims Cost',             purpose:'Covers additional expenses to speed up repairs',                               standard:'Recommended' },
  { code:'CL-BOILER-INSP',name:'Statutory Inspection Warranty',      productCode:'PRD-BOILER',category:'Warranty',                purpose:'Requires valid inspection and maintenance of boilers',                          standard:'Standard' },
  { code:'CL-MAR-ICCA',   name:'Institute Cargo Clause A',           productCode:'PRD-MAR',   category:'Marine Cover',            purpose:'All risks cargo basis subject to exclusions',                                  standard:'Recommended' },
  { code:'CL-MAR-WAR',    name:'Institute War Clause',               productCode:'PRD-MAR',   category:'Marine Extension',        purpose:'War risks during transit',                                                     standard:'Optional/Route-based' },
  { code:'CL-MAR-STR',    name:'Institute Strikes Clause',           productCode:'PRD-MAR',   category:'Marine Extension',        purpose:'Strikes / riots / civil commotion in transit',                                 standard:'Recommended' },
  { code:'CL-MAR-WW',     name:'Warehouse to Warehouse Clause',      productCode:'PRD-MAR',   category:'Transit Scope',           purpose:'Extends cargo cover from origin warehouse to final warehouse',                  standard:'Recommended' },
  { code:'CL-PL-PI',      name:"Principal's Indemnity Clause",       productCode:'PRD-PL',    category:'Contractual',             purpose:'Indemnifies principal / landlord / BOI party if required',                     standard:'Recommended' },
  { code:'CL-PL-CL',      name:'Cross Liability Clause',             productCode:'PRD-PL',    category:'Liability',               purpose:'Treats each insured as separately insured',                                    standard:'Recommended' },
  { code:'CL-CYB-CLOUD',  name:'Cloud Service Provider Extension',   productCode:'PRD-CYBER', category:'Cyber Extension',         purpose:'Dependent cloud service provider interruption / security event',                standard:'Recommended if cloud used' },
  { code:'CL-CYB-DR',     name:'Data Restoration Extension',         productCode:'PRD-CYBER', category:'Cyber Cost',              purpose:'Restoration / recreation of data and digital assets',                          standard:'Recommended' },
];

// ─── PRODUCT → CLAUSE MAPPING ────────────────────────────────────────────────
export const PRODUCT_CLAUSE_MAP = [
  { id:'PCM-001', productCode:'PRD-FIRE',  clauseCode:'CL-FIRE-RVC',   level:'Mandatory',    trigger:'Commercial / industrial property selected' },
  { id:'PCM-002', productCode:'PRD-FIRE',  clauseCode:'CL-FIRE-CAP',   level:'Strong',       trigger:'New assets added regularly or expansion plans exist' },
  { id:'PCM-003', productCode:'PRD-FIRE',  clauseCode:'CL-FIRE-ESC',   level:'Strong',       trigger:'Imported machinery OR inflation risk OR construction cost increase' },
  { id:'PCM-004', productCode:'PRD-FIRE',  clauseCode:'CL-FIRE-DEB',   level:'Strong',       trigger:'Large site OR high debris cost OR factory / warehouse' },
  { id:'PCM-005', productCode:'PRD-FIRE',  clauseCode:'CL-FIRE-PF',    level:'Recommended',  trigger:'Rebuilding requires architects / engineers' },
  { id:'PCM-006', productCode:'PRD-FIRE',  clauseCode:'CL-FIRE-LA',    level:'Recommended',  trigger:'Building reinstatement subject to authority approvals' },
  { id:'PCM-007', productCode:'PRD-FIRE',  clauseCode:'CL-FIRE-FEE',   level:'Recommended',  trigger:'High fire exposure OR hydrant / sprinkler / fire brigade costs' },
  { id:'PCM-008', productCode:'PRD-FIRE',  clauseCode:'CL-FIRE-SEAS',  level:'Recommended',  trigger:'Seasonal stock fluctuation' },
  { id:'PCM-009', productCode:'PRD-FIRE',  clauseCode:'CL-FIRE-MORT',  level:'Mandatory',    trigger:'Bank / finance interest exists' },
  { id:'PCM-010', productCode:'PRD-MB',    clauseCode:'CL-MB-AIR',     level:'Strong',       trigger:'Imported machinery or long spare-part lead time' },
  { id:'PCM-011', productCode:'PRD-MB',    clauseCode:'CL-MB-EXP',     level:'Strong',       trigger:'Critical production bottleneck machinery' },
  { id:'PCM-012', productCode:'PRD-BOILER',clauseCode:'CL-BOILER-INSP',level:'Mandatory',    trigger:'Boiler selected' },
  { id:'PCM-013', productCode:'PRD-MAR',   clauseCode:'CL-MAR-ICCA',   level:'Strong',       trigger:'High-value export / import cargo' },
  { id:'PCM-014', productCode:'PRD-MAR',   clauseCode:'CL-MAR-WAR',    level:'Conditional',  trigger:'Route has war / geopolitical exposure' },
  { id:'PCM-015', productCode:'PRD-MAR',   clauseCode:'CL-MAR-STR',    level:'Recommended',  trigger:'Strike / civil commotion exposure in route / ports' },
  { id:'PCM-016', productCode:'PRD-MAR',   clauseCode:'CL-MAR-WW',     level:'Strong',       trigger:'Door-to-door transit required' },
  { id:'PCM-017', productCode:'PRD-PL',    clauseCode:'CL-PL-PI',      level:'Strong',       trigger:'BOI / landlord / principal contract requires indemnity' },
  { id:'PCM-018', productCode:'PRD-PL',    clauseCode:'CL-PL-CL',      level:'Strong',       trigger:'Multiple insured parties / subcontractors / principal' },
  { id:'PCM-019', productCode:'PRD-CYBER', clauseCode:'CL-CYB-CLOUD',  level:'Strong',       trigger:'Cloud systems used' },
  { id:'PCM-020', productCode:'PRD-CYBER', clauseCode:'CL-CYB-DR',     level:'Strong',       trigger:'Critical data exists' },
];

// ─── RISK SCORING RULES ──────────────────────────────────────────────────────
// answerCondition = the answer that triggers the risk score increase.
// options = if provided, show these as choice buttons instead of Yes/No.
export const RISK_SCORING_RULES = [
  // ── FIRE ───────────────────────────────────────────────────────────────────
  { id:'RS-FIRE-001', exposureCode:'EXP-FIRE',
    question:'What is the main construction type of the building?',
    answerCondition:'Combustible / Timber / Sandwich Panel',
    options:['Brick / Concrete / Masonry', 'Steel Frame / Metal Sheet', 'Timber / Wood Frame', 'Combustible / Timber / Sandwich Panel'],
    scoreImpact:2, severityImpact:1, frequencyImpact:1, rmAdvice:'Review construction fire rating and compartmentation' },
  { id:'RS-FIRE-002', exposureCode:'EXP-FIRE',
    question:'Is a fire alarm system installed and maintained?',
    answerCondition:'No',
    scoreImpact:2, severityImpact:2, frequencyImpact:1, rmAdvice:'Install addressable fire alarm and maintain service records' },
  { id:'RS-FIRE-003', exposureCode:'EXP-FIRE',
    question:'Is a sprinkler or hydrant system available?',
    answerCondition:'No',
    scoreImpact:3, severityImpact:2, frequencyImpact:1, rmAdvice:'Consider sprinkler / hydrant system for high-value fire areas' },
  { id:'RS-FIRE-004', exposureCode:'EXP-FIRE',
    question:'How would you rate the overall housekeeping standard?',
    answerCondition:'Poor',
    options:['Good — Clean, organised, no clutter', 'Average — Some issues but manageable', 'Poor — Clutter, waste accumulation, fire hazards'],
    scoreImpact:2, severityImpact:1, frequencyImpact:1, rmAdvice:'Implement 5S housekeeping program and monthly audit' },
  { id:'RS-FIRE-005', exposureCode:'EXP-FIRE',
    question:'When was the last full electrical inspection carried out?',
    answerCondition:'More than 12 months ago',
    options:['Within the last 6 months', 'Within the last 12 months', 'More than 12 months ago', 'Never / Unknown'],
    scoreImpact:2, severityImpact:1, frequencyImpact:2, rmAdvice:'Conduct annual electrical and thermographic inspection' },
  { id:'RS-FIRE-006', exposureCode:'EXP-FIRE',
    question:'Are hazardous or flammable materials stored on the premises?',
    answerCondition:'Yes',
    scoreImpact:2, severityImpact:2, frequencyImpact:1, rmAdvice:'Segregate hazardous stock and maintain MSDS controls' },
  { id:'RS-FIRE-007', exposureCode:'EXP-FIRE',
    question:'How far is the nearest fire brigade station?',
    answerCondition:'More than 10 km',
    options:['Within 5 km', '5 – 10 km', 'More than 10 km'],
    scoreImpact:1, severityImpact:1, frequencyImpact:0, rmAdvice:'Strengthen onsite firefighting equipment and emergency plan' },
  // ── MACHINERY BREAKDOWN ────────────────────────────────────────────────────
  { id:'RS-MB-001', exposureCode:'EXP-MB',
    question:'Is a documented preventive maintenance program in place?',
    answerCondition:'No',
    scoreImpact:3, severityImpact:2, frequencyImpact:1, rmAdvice:'Implement documented preventive maintenance plan' },
  { id:'RS-MB-002', exposureCode:'EXP-MB',
    question:'Are critical spare parts held in stock on-site?',
    answerCondition:'No',
    scoreImpact:2, severityImpact:1, frequencyImpact:1, rmAdvice:'Maintain critical spare-part inventory' },
  { id:'RS-MB-003', exposureCode:'EXP-MB',
    question:'What is the average age of critical production machinery?',
    answerCondition:'More than 10 years',
    options:['Less than 5 years', '5 – 10 years', 'More than 10 years'],
    scoreImpact:2, severityImpact:1, frequencyImpact:1, rmAdvice:'Assess OEM support and replacement plan' },
  // ── BOILER ─────────────────────────────────────────────────────────────────
  { id:'RS-BOILER-001', exposureCode:'EXP-BOILER',
    question:'Is a valid statutory boiler inspection certificate held?',
    answerCondition:'No',
    scoreImpact:5, severityImpact:3, frequencyImpact:2, rmAdvice:'Obtain statutory inspection immediately — this is a legal requirement' },
  // ── EMPLOYEES / WCI ────────────────────────────────────────────────────────
  { id:'RS-WCI-001', exposureCode:'EXP-WCI',
    question:'Is appropriate PPE provided and worn by all workers?',
    answerCondition:'No',
    scoreImpact:3, severityImpact:2, frequencyImpact:2, rmAdvice:'Provide PPE and conduct training records' },
  { id:'RS-WCI-002', exposureCode:'EXP-WCI',
    question:'Does work involve activities at height (scaffolding, roofs, elevated platforms)?',
    answerCondition:'Yes',
    scoreImpact:2, severityImpact:2, frequencyImpact:2, rmAdvice:'Implement permit-to-work and fall protection system' },
  // ── PUBLIC LIABILITY ───────────────────────────────────────────────────────
  { id:'RS-PL-001', exposureCode:'EXP-PL',
    question:'Do contractors or sub-contractors regularly work on the premises?',
    answerCondition:'Yes',
    scoreImpact:2, severityImpact:1, frequencyImpact:1, rmAdvice:'Use contractor induction and permit-to-work system' },
  { id:'RS-PL-002', exposureCode:'EXP-PL',
    question:'Is visitor or public access to the site uncontrolled or unrestricted?',
    answerCondition:'Yes',
    scoreImpact:2, severityImpact:1, frequencyImpact:1, rmAdvice:'Implement visitor registration and escort policy' },
  // ── MARINE ─────────────────────────────────────────────────────────────────
  { id:'RS-MAR-001', exposureCode:'EXP-MAR',
    question:'Does the cargo include high-value or theft-prone goods?',
    answerCondition:'Yes',
    scoreImpact:2, severityImpact:2, frequencyImpact:2, rmAdvice:'Use approved carriers and GPS shipment tracking' },
  { id:'RS-MAR-002', exposureCode:'EXP-MAR',
    question:'Is any cargo temperature-sensitive or perishable?',
    answerCondition:'Yes',
    scoreImpact:3, severityImpact:2, frequencyImpact:2, rmAdvice:'Use cold chain controls and temperature logs throughout transit' },
  // ── CYBER ──────────────────────────────────────────────────────────────────
  { id:'RS-CYBER-001', exposureCode:'EXP-CYBER',
    question:'Is Multi-Factor Authentication (MFA) enabled on email and key systems?',
    answerCondition:'No',
    scoreImpact:3, severityImpact:2, frequencyImpact:2, rmAdvice:'Enable MFA for email, ERP and all privileged access accounts' },
  { id:'RS-CYBER-002', exposureCode:'EXP-CYBER',
    question:'Are data backups taken regularly and tested for restoration?',
    answerCondition:'No',
    scoreImpact:3, severityImpact:2, frequencyImpact:1, rmAdvice:'Implement tested offline / immutable backup with documented recovery procedure' },
  { id:'RS-CYBER-003', exposureCode:'EXP-CYBER',
    question:'Is a formal cyber incident response plan documented and practiced?',
    answerCondition:'No',
    scoreImpact:2, severityImpact:1, frequencyImpact:1, rmAdvice:'Prepare and test cyber incident response plan with key stakeholders' },
];

// ─── RECOMMENDATION RULES ────────────────────────────────────────────────────
export const RECOMMENDATION_RULES = [
  { ruleId:'RULE-001', industryCode:'IND-APP', portfolioCode:'PF-FACTORY',   assetCode:'AST-BLD',     exposureCode:'EXP-FIRE',   condition:'Building exists',                             product:'PRD-FIRE',  clauses:['CL-FIRE-RVC','CL-FIRE-DEB','CL-FIRE-PF','CL-FIRE-LA'], riskMgmtAdvice:'Maintain fire alarm, extinguishers, hydrants, electrical inspection and housekeeping audit' },
  { ruleId:'RULE-002', industryCode:'IND-APP', portfolioCode:'PF-FACTORY',   assetCode:'AST-STOCK',   exposureCode:'EXP-FIRE',   condition:'Stock exists',                                product:'PRD-FIRE',  clauses:['CL-FIRE-SEAS','CL-FIRE-DEB','CL-FIRE-FEE'],            riskMgmtAdvice:'Control storage height, maintain stock segregation and max stock declarations' },
  { ruleId:'RULE-003', industryCode:'IND-APP', portfolioCode:'PF-FACTORY',   assetCode:'AST-MACH',    exposureCode:'EXP-MB',     condition:'Machinery exists',                            product:'PRD-MB',    clauses:['CL-MB-AIR','CL-MB-EXP'],                               riskMgmtAdvice:'Implement preventive maintenance schedule, maintain spare parts and machine breakdown logs' },
  { ruleId:'RULE-004', industryCode:'IND-APP', portfolioCode:'PF-UTIL',      assetCode:'AST-BOILER',  exposureCode:'EXP-BOILER', condition:'Boiler exists',                               product:'PRD-BOILER',clauses:['CL-BOILER-INSP'],                                       riskMgmtAdvice:'Maintain valid inspection certificate and operator training records' },
  { ruleId:'RULE-005', industryCode:'IND-APP', portfolioCode:'PF-FACTORY',   assetCode:'AST-MACH',    exposureCode:'EXP-BI',     condition:'Critical production bottleneck exists',       product:'PRD-BI',    clauses:[],                                                       riskMgmtAdvice:'Prepare business continuity plan and alternate production arrangements' },
  { ruleId:'RULE-006', industryCode:'IND-APP', portfolioCode:'PF-WORKERS',   assetCode:'AST-EMP',     exposureCode:'EXP-WCI',    condition:'Employees exist',                             product:'PRD-WCI',   clauses:[],                                                       riskMgmtAdvice:'PPE, safety training, accident register, permit-to-work system' },
  { ruleId:'RULE-007', industryCode:'IND-APP', portfolioCode:'PF-MARINE',    assetCode:'AST-CARGO',   exposureCode:'EXP-MAR',    condition:'Imports or exports exist',                    product:'PRD-MAR',   clauses:['CL-MAR-ICCA','CL-MAR-STR','CL-MAR-WW'],               riskMgmtAdvice:'Approved packing, carrier selection, shipment tracking and claims procedure' },
  { ruleId:'RULE-008', industryCode:'IND-APP', portfolioCode:'PF-LIAB',      assetCode:'AST-VISITOR', exposureCode:'EXP-PL',     condition:'Visitors / contractors / BOI obligation',     product:'PRD-PL',    clauses:['CL-PL-PI','CL-PL-CL'],                                 riskMgmtAdvice:'Visitor permits, contractor induction, safety notices, incident reporting' },
  { ruleId:'RULE-009', industryCode:'IND-APP', portfolioCode:'PF-IT',        assetCode:'AST-IT',      exposureCode:'EXP-CYBER',  condition:'ERP / payroll / data systems exist',          product:'PRD-CYBER', clauses:['CL-CYB-CLOUD','CL-CYB-DR'],                             riskMgmtAdvice:'MFA, backups, EDR, incident response and access reviews' },
  { ruleId:'RULE-010', industryCode:'IND-APP', portfolioCode:'PF-HQ',        assetCode:'AST-CASH',    exposureCode:'EXP-FID',    condition:'Finance / cash handling staff exist',         product:'PRD-FID',   clauses:[],                                                       riskMgmtAdvice:'Segregation of duties, dual authorization, audit and mandatory leave' },
  { ruleId:'RULE-011', industryCode:'IND-APP', portfolioCode:'PF-DIRECTORS', assetCode:'AST-DIR',     exposureCode:'EXP-DNO',    condition:'Board / management exposure exists',          product:'PRD-DNO',   clauses:[],                                                       riskMgmtAdvice:'D&O employment practices, corporate governance and claims notification process' },
  { ruleId:'RULE-012', industryCode:'IND-FOOD',portfolioCode:'PF-PRODUCT',   assetCode:'AST-STOCK',   exposureCode:'EXP-PROD',   condition:'Food products sold to market',                product:'PRD-PROD',  clauses:[],                                                       riskMgmtAdvice:'Batch tracking, QA records, recall procedure and complaint register' },
  { ruleId:'RULE-013', industryCode:'IND-FOOD',portfolioCode:'PF-COLD',      assetCode:'AST-HVAC',    exposureCode:'EXP-BI',     condition:'Cold storage dependency exists',               product:'PRD-BI',    clauses:[],                                                       riskMgmtAdvice:'Temperature monitoring, alarm escalation and backup power' },
  { ruleId:'RULE-014', industryCode:'IND-CONST',portfolioCode:'PF-CONST-PROJ',assetCode:'AST-BLD',   exposureCode:'EXP-PL',     condition:'Construction project exists',                 product:'PRD-PL',    clauses:['CL-PL-PI','CL-PL-CL'],                                 riskMgmtAdvice:'Method statement, site safety plan and contractor controls' },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Returns portfolios relevant to a given industry code */
export function getPortfoliosForIndustry(industryCode) {
  return PORTFOLIOS.filter(p =>
    p.industryCodes.includes(industryCode) || p.industryCodes.includes('*')
  );
}

/** Returns assets for a portfolio + industry combination */
export function getAssetsForPortfolio(industryCode, portfolioCode) {
  const specific = PORTFOLIO_ASSET_MAP.filter(
    m => m.industryCode === industryCode && m.portfolioCode === portfolioCode
  );
  const generic = PORTFOLIO_ASSET_MAP.filter(
    m => m.industryCode === '*' && m.portfolioCode === portfolioCode &&
         !specific.some(s => s.assetCode === m.assetCode)
  );
  return [...specific, ...generic].map(m => ({
    ...m,
    asset: ASSETS.find(a => a.code === m.assetCode),
  }));
}

/** Compute full recommendation output from confirmed assets */
export function computeRecommendations(industryCode, selectedPortfolios, confirmedAssets) {
  // 1 — Gather exposures
  const exposureMap = new Map();
  confirmedAssets.forEach(assetCode => {
    ASSET_EXPOSURE_MAP.filter(m => m.assetCode === assetCode).forEach(m => {
      const exp = EXPOSURES.find(e => e.code === m.exposureCode);
      if (exp && !exposureMap.has(exp.code)) {
        exposureMap.set(exp.code, { ...exp, relevance: m.relevance, triggerQ: m.triggerQ });
      }
    });
  });

  // 2 — Map to products (highest strength wins if duplicate)
  const productMap = new Map();
  const strengthOrder = { 'Mandatory':1,'Mandatory if BI exposure':1,'Mandatory for production':1,'Mandatory if boiler exists':1,'Mandatory if import/export':1,'Strong':2,'Recommended':3,'Specialist review':4 };
  exposureMap.forEach((_, expCode) => {
    EXPOSURE_PRODUCT_MAP.filter(m => m.exposureCode === expCode).forEach(m => {
      const prod = PRODUCTS.find(p => p.code === m.productCode);
      if (!prod) return;
      if (!productMap.has(m.productCode) || (strengthOrder[m.strength] || 5) < (strengthOrder[productMap.get(m.productCode).strength] || 5)) {
        productMap.set(m.productCode, { product: prod, strength: m.strength, reason: m.reason, priority: m.priority, clauses: [] });
      }
    });
  });

  // 3 — Add clauses
  productMap.forEach((data, productCode) => {
    PRODUCT_CLAUSE_MAP.filter(m => m.productCode === productCode).forEach(m => {
      const clause = CLAUSES.find(c => c.code === m.clauseCode);
      if (clause) data.clauses.push({ ...clause, level: m.level, trigger: m.trigger });
    });
  });

  // 4 — Risk management advice from rules
  const ruleAdvice = RECOMMENDATION_RULES.filter(r =>
    (r.industryCode === industryCode || r.industryCode === '*') &&
    selectedPortfolios.includes(r.portfolioCode) &&
    confirmedAssets.includes(r.assetCode)
  );

  // 5 — Sort products by priority
  const products = Array.from(productMap.values()).sort((a, b) => a.priority - b.priority);

  // 6 — Risk scoring rules for confirmed exposures
  const scoringRules = RISK_SCORING_RULES.filter(r => exposureMap.has(r.exposureCode));

  return {
    exposures:    Array.from(exposureMap.values()),
    products,
    ruleAdvice,
    scoringRules,
  };
}

export const STRENGTH_COLORS = {
  'Mandatory':                   { bg:'rgba(239,68,68,0.10)',   color:'#dc2626', label:'Mandatory'  },
  'Mandatory if BI exposure':    { bg:'rgba(239,68,68,0.10)',   color:'#dc2626', label:'Mandatory'  },
  'Mandatory for production':    { bg:'rgba(239,68,68,0.10)',   color:'#dc2626', label:'Mandatory'  },
  'Mandatory if boiler exists':  { bg:'rgba(239,68,68,0.10)',   color:'#dc2626', label:'Mandatory'  },
  'Mandatory if import/export':  { bg:'rgba(239,68,68,0.10)',   color:'#dc2626', label:'Mandatory'  },
  'Strong':                      { bg:'rgba(245,158,11,0.12)',  color:'#d97706', label:'Strong'     },
  'Recommended':                 { bg:'rgba(16,185,129,0.10)',  color:'#059669', label:'Recommended'},
  'Specialist review':           { bg:'rgba(99,102,241,0.10)',  color:'#6366f1', label:'Specialist' },
};
