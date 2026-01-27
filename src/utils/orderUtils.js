// src/utils/orderUtils.js

import { Timestamp } from 'firebase/firestore';

/**
 * Get the ending time for a specific pickup spot.
 * Supports both new per-spot structure and legacy single endingTime.
 * @param {object} orderData - The order document data
 * @param {string} [pickupSpot] - Optional pickup spot name
 * @returns {Date|null} - The ending time as a Date, or null if not found
 */
export const getEndingTimeForSpot = (orderData, pickupSpot) => {
  // New structure: endingTimeByPickupSpot
  if (orderData.endingTimeByPickupSpot && pickupSpot) {
    const spotTime = orderData.endingTimeByPickupSpot[pickupSpot];
    if (spotTime) {
      if (spotTime instanceof Timestamp) {
        return spotTime.toDate();
      }
      if (spotTime instanceof Date) {
        return spotTime;
      }
      // Handle string or other formats
      const parsed = new Date(spotTime);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  // Legacy fallback: single endingTime or Ending_Time
  const legacyTime = orderData.endingTime || orderData.Ending_Time;
  if (legacyTime) {
    if (legacyTime instanceof Timestamp) {
      return legacyTime.toDate();
    }
    if (legacyTime instanceof Date) {
      return legacyTime;
    }
    const parsed = new Date(legacyTime);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
};

/**
 * Check if an order is currently active.
 * @param {object} orderData - The order document data
 * @param {string} [pickupSpot] - Optional pickup spot name for per-spot checking
 * @returns {boolean} - True if the order is active
 */
export const isOrderActive = (orderData, pickupSpot) => {
  const currentTime = new Date();

  // Check for one-time orders
  if (orderData.orderType === 'one_time') {
    const endingTime = getEndingTimeForSpot(orderData, pickupSpot);
    if (endingTime && currentTime >= endingTime) {
      return false;
    }
  }

  // Check for recurring orders
  if (orderData.orderType === 'recurring' && orderData.schedule) {
    return isOrderActiveNow(orderData.schedule);
  }

  // If order type is not specified, check if there's an ending time anyway
  if (!orderData.orderType) {
    const endingTime = getEndingTimeForSpot(orderData, pickupSpot);
    if (endingTime && currentTime >= endingTime) {
      return false;
    }
  }

  // If order type is not specified, or no ending time/schedule, assume active
  return true;
};

export const isOrderActiveNow = (schedule) => {
  const now = new Date();
  const currentDayIndex = now.getDay(); // Sunday - Saturday : 0 - 6
  const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes since midnight

  // Map of days to indices (adjusted for Hebrew days)
  const dayIndexMap = {
    0: ['Sunday', 'ראשון'],
    1: ['Monday', 'שני'],
    2: ['Tuesday', 'שלישי'],
    3: ['Wednesday', 'רביעי'],
    4: ['Thursday', 'חמישי'],
    5: ['Friday', 'שישי'],
    6: ['Saturday', 'שבת'],
  };

  const dayNames = dayIndexMap[currentDayIndex];

  const daySchedule = schedule.find((day) => dayNames.includes(day.day));

  if (daySchedule && daySchedule.active) {
    const [startHour, startMinute] = daySchedule.startTime.split(':').map(Number);
    const [endHour, endMinute] = daySchedule.endTime.split(':').map(Number);

    let startTimeInMinutes = startHour * 60 + startMinute;
    let endTimeInMinutes = endHour * 60 + endMinute;

    // Handle cases where end time is past midnight
    if (endTimeInMinutes < startTimeInMinutes) {
      endTimeInMinutes += 24 * 60;
    }

    // Adjust current time if it's past midnight
    let adjustedCurrentTime = currentTime;
    if (currentTime < startTimeInMinutes) {
      adjustedCurrentTime += 24 * 60;
    }

    return adjustedCurrentTime >= startTimeInMinutes && adjustedCurrentTime <= endTimeInMinutes;
  } else {
    return false;
  }
};

/**
 * Calculate the time remaining until an order ends.
 * @param {object} orderData - The order document data
 * @param {string} [pickupSpot] - Optional pickup spot name for per-spot calculation
 * @param {object} [options] - Optional configuration
 * @param {boolean} [options.applyBuffer=false] - If true, applies a 1-hour buffer (shows time until 1hr before actual end)
 * @returns {string} - Human-readable time remaining string
 */
export const calculateTimeRemaining = (orderData, pickupSpot, options = {}) => {
  const { applyBuffer = false } = options;
  const now = new Date();

  if (orderData.orderType === 'one_time' || !orderData.orderType) {
    const endingTime = getEndingTimeForSpot(orderData, pickupSpot);
    if (endingTime) {
      // If buffer is applied, calculate time until 1 hour before actual end
      const targetTime = applyBuffer 
        ? new Date(endingTime.getTime() - 60 * 60 * 1000) 
        : endingTime;
      const diff = targetTime - now;
      
      if (diff <= 0) {
        return 'ההזמנה הסתיימה';
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);

      let timeString = '';
      if (days > 0) timeString += `${days} ימים `;
      if (hours > 0) timeString += `${hours} שעות `;
      if (minutes > 0) timeString += `${minutes} דקות`;

      return timeString || 'פחות מדקה';
    }
  }
  
  if (orderData.orderType === 'recurring' && orderData.schedule) {
    const isActiveNow = isOrderActiveNow(orderData.schedule);
    return isActiveNow ? 'פעיל כעת' : 'לא פעיל כעת';
  }

  return 'מידע לא זמין';
};
