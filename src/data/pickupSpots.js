// A list of pickup locations with their delivery options
const pickupSpotsData = {
  "ניצנים": {
    name: "ניצנים",
    options: ["pickup"],
    deliveryFee: 20, // Fee for home delivery if applicable
  },
  "מרכז שפירא": {
    name: "מרכז שפירא",
    options: ["homeDelivery"], // Only regular pickup available
    deliveryFee: 25,
  },
  "קיבוץ גת": {
    name: "קיבוץ גת",
    options: ["pickup", "homeDelivery"], // Pickup and box collection available
    deliveryFee: 25,
  },
  "כוכב מיכאל": {
    name: "כוכב מיכאל",
    options: ["pickup"],
    deliveryFee: 25,
  },
  "אור הנר": {
    name: "אור הנר",
    options: ["pickup"],
  },
  "נגבה": {
    name: "נגבה",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
  },
  "נחלה": {
    name: "נחלה",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
  },
  "יד מרדכי": {
    name: "יד מרדכי",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
  },
  "שדה יואב": {
    name: "שדה יואב",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
  },
  "כפר מנחם": {
    name: "כפר מנחם",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
  },
  "אלתא": {
    name: "אלתא",
    options: ["pickup"],
    deliveryFee: 25,
  },
};

// For backwards compatibility and simple listing
const pickupSpots = Object.keys(pickupSpotsData);

// Optional - group pickup spots by region if that's helpful for organization
const pickupSpotsByRegion = {
  "צפון": ["מרכז המושב צפון", "בית העם צפון", "תחנת הדלק צפון"],
  "מרכז": ["מרכז המושב מרכז", "בית העם מרכז", "תחנת הדלק מרכז"],
  "דרום": ["מרכז המושב דרום", "בית העם דרום", "תחנת הדלק דרום"],
  "אשקלון אשדוד": ["ניצנים", "מרכז שפירא", "קיבוץ גת", "כוכב מיכאל", "אור הנר", "נגבה", "אלתא"],
};

export { pickupSpots, pickupSpotsByRegion, pickupSpotsData }; 