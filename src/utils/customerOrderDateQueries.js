import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { format, startOfWeek, subWeeks } from 'date-fns';
import { db } from '../firebase/firebase';

export const buildRecentWeekKeys = (count = 104) => {
  const currentSunday = startOfWeek(new Date(), { weekStartsOn: 0 });
  return Array.from({ length: count }, (_, i) =>
    format(subWeeks(currentSunday, i), 'yyyy-MM-dd')
  );
};

// createdAt is stored as an ISO string by current writers and as a Timestamp in older
// documents; Firestore range filters only match values of the same type, so query both.
export const fetchDocsByCreatedAtRange = async (collectionName, startDate, endDate) => {
  const ref = collection(db, collectionName);
  const [isoSnap, tsSnap] = await Promise.all([
    getDocs(query(
      ref,
      where('createdAt', '>=', startDate.toISOString()),
      where('createdAt', '<=', endDate.toISOString())
    )),
    getDocs(query(
      ref,
      where('createdAt', '>=', Timestamp.fromDate(startDate)),
      where('createdAt', '<=', Timestamp.fromDate(endDate))
    ))
  ]);
  return [...isoSnap.docs, ...tsSnap.docs];
};
