// src/utils/orderUtils.js

import { Timestamp } from 'firebase/firestore';

export const isOrderActive = (orderData) => {
  const currentTime = new Date();

  // Check for one-time orders
  if (orderData.orderType === 'one_time' && orderData.endingTime) {
    const endingTime = orderData.endingTime instanceof Timestamp ? orderData.endingTime.toDate() : orderData.endingTime;
    if (currentTime >= endingTime) {
      return false;
    }
  }

  // Check for recurring orders
  if (orderData.orderType === 'recurring' && orderData.schedule) {
    return isOrderActiveNow(orderData.schedule);
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

export const calculateTimeRemaining = (orderData) => {
  const now = new Date();

  if (orderData.orderType === 'one_time' && orderData.endingTime) {
    const end = orderData.endingTime instanceof Timestamp ? orderData.endingTime.toDate() : orderData.endingTime;
    const diff = end - now;
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
  } else if (orderData.orderType === 'recurring' && orderData.schedule) {
    const isActiveNow = isOrderActiveNow(orderData.schedule);
    return isActiveNow ? 'פעיל כעת' : 'לא פעיל כעת';
  } else {
    return 'מידע לא זמין';
  }
};
