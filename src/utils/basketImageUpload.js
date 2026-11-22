import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase/firebase';

export const MAX_BASKET_IMAGE_FILE_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Shrink a photo to at most 1600px on its longer side, as JPEG, so a phone
 * photo loads fast on the store. Falls back to the original file if the
 * browser cannot draw it.
 * @param {File} file
 * @return {Promise<Blob>}
 */
export async function resizeImageForUpload(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (typeof bitmap.close === 'function') bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    return blob || file;
  } catch {
    return file;
  }
}

/**
 * Upload a basket photo for an admin and return its public download URL.
 * Stored under the uploader's own products folder, the same place product
 * photos go, so it is covered by the existing Storage rules.
 * @param {File} file
 * @param {string} uid
 * @return {Promise<string>}
 */
export async function uploadBasketImage(file, uid) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('NOT_AN_IMAGE');
  if (file.size > MAX_BASKET_IMAGE_FILE_BYTES) throw new Error('IMAGE_FILE_TOO_LARGE');
  if (!uid) throw new Error('UNAUTHENTICATED');
  const blob = await resizeImageForUpload(file);
  const isJpeg = blob.type === 'image/jpeg';
  const extension = isJpeg ? 'jpg' : (String(file.name || '').split('.').pop() || 'img').toLowerCase();
  const storageRef = ref(storage, `products/${uid}/subscription-basket_${Date.now()}.${extension}`);
  await uploadBytes(storageRef, blob, { contentType: blob.type || file.type });
  return getDownloadURL(storageRef);
}
