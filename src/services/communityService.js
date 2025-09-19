import { collection, getDocs, limit, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import axios from 'axios';
import { functionsEndpoint } from '../utils/functionsClient';

export async function searchCommunities(term) {
  const qTerm = (term || '').trim();
  if (!qTerm) {
    // Return top N by name for initial dropdown
    const q = query(collection(db, 'communities'), orderBy('name'), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  // Basic prefix search by name; aliases handled by backend if needed
  const q = query(
    collection(db, 'communities'),
    where('name', '>=', qTerm),
    where('name', '<=', qTerm + '\uf8ff'),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createCommunityIfMissing({ name, region = 'אחר', alias }) {
  const payload = { name: name?.trim(), region, alias: alias?.trim() };
  const url = functionsEndpoint('createCommunityIfMissing');
  const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
  return res.data; // expect { id, name, region }
} 