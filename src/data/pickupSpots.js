// A list of pickup locations that can be managed manually
const pickupSpots = [
  "ניצנים",
  "מרכז שפירא",
  "קיבוץ גת",
  "כוכב מיכאל",
  "אור הנר",
];

// Optional - group pickup spots by region if that's helpful for organization
const pickupSpotsByRegion = {
  "צפון": ["מרכז המושב צפון", "בית העם צפון", "תחנת הדלק צפון"],
  "מרכז": ["מרכז המושב מרכז", "בית העם מרכז", "תחנת הדלק מרכז"],
  "דרום": ["מרכז המושב דרום", "בית העם דרום", "תחנת הדלק דרום"],
  "אשקלון אשדוד": ["ניצנים", "מרכז שפירא", "קיבוץ גת", "כוכב מיכאל", "אור הנר"],
};

export { pickupSpots, pickupSpotsByRegion }; 