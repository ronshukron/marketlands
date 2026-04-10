// A list of pickup locations with their delivery options
const pickupSpotsData = {
  "ניצנים ה": {
    name: "ניצנים ה",
    options: ["pickup"],
    deliveryFee: 25, // Fee for home delivery if applicable
  },
  "ניצנים ג": {
    name: "ניצנים ג",
    options: ["pickup", "homeDelivery"],
    deliveryFee: 25,
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
  "כפר סילבר": {
    name: "כפר סילבר",
    options: ["pickup","homeDelivery"],
    deliveryFee: 25,
  },
  "קלחים": {
    name: "קלחים",
    options: ["pickup","homeDelivery"],
    deliveryFee: 25,
  },
  "דורות": {
    name: "דורות",
    options: ["pickup","homeDelivery"],
    deliveryFee: 25,
  },
  "גבים": {
    name: "גבים",
    options: ["pickup","homeDelivery"],
    deliveryFee: 25,
  },
  "אלתא": {
    name: "אלתא",
    options: ["pickup"],
    deliveryFee: 25,
  },
  "בית קמה": {
    name: "בית קמה",
    options: ["pickup"],
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
  "אשקלון אשדוד": ["ניצנים", "מרכז שפירא", "קיבוץ גת", "כוכב מיכאל", "אור הנר", "נגבה", "כפר סילבר", "קלחים", "אלתא"],
  "חבל תקומה": ["ארז", "בית קמה", "דורות", "מפלסים", "נתיב העשרה", "גברעם", "כרמיה", "ניר עם", "יד נתן", "זיקים", "מבקיעים", "רוחמה"],
};

export { pickupSpots, pickupSpotsByRegion, pickupSpotsData }; 