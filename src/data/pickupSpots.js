// A list of pickup locations that can be managed manually
const pickupSpots = [
  "מרכז המושב",
  "בית העם",
  "סופר מרקט",
  "בית הספר",
  "תחנת הדלק",
  "מרכז מסחרי",
  "בית התרבות",
  "מזכירות",
  "נקודת הסעה מרכזית",
  "חניון ציבורי",
  "מרכז הספורט",
  "פארק המושב",
  "גן המשחקים",
  "ביתן השומר"
];

// Optional - group pickup spots by region if that's helpful for organization
const pickupSpotsByRegion = {
  "צפון": ["מרכז המושב צפון", "בית העם צפון", "תחנת הדלק צפון"],
  "מרכז": ["מרכז המושב מרכז", "בית העם מרכז", "תחנת הדלק מרכז"],
  "דרום": ["מרכז המושב דרום", "בית העם דרום", "תחנת הדלק דרום"],
};

export { pickupSpots, pickupSpotsByRegion }; 