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
  "ארז": {
    name: "ארז",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
  },
  "מפלסים": {
    name: "מפלסים",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
  },
  "נתיב העשרה": {
    name: "נתיב העשרה",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
  },
  "גברעם": {
    name: "גברעם",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
  },
  "כרמיה": {
    name: "כרמיה",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
  },
  "ניר עם": {
    name: "ניר עם",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
  },
  "יד נתן": {
    name: "יד נתן",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
  },
  "זיקים": {
    name: "זיקים",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
  },
  "מבקיעים": {
    name: "מבקיעים",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
  },
  "רוחמה": {
    name: "רוחמה",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
  },
  "פרקליטות מחוז דרום באר שבע": {
    name: "פרקליטות מחוז דרום באר שבע",
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
  "חבל תקומה": ["ארז", "מפלסים", "נתיב העשרה", "גברעם", "כרמיה", "ניר עם", "יד נתן", "זיקים", "מבקיעים", "רוחמה"],
};

export { pickupSpots, pickupSpotsByRegion, pickupSpotsData }; 