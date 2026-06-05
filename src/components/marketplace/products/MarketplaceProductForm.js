import React, { useState } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../../firebase/firebase';
import {
  MARKETPLACE_PRODUCT_CATEGORIES,
  MARKETPLACE_PRODUCTS_STORAGE_PREFIX,
} from '../../../constants/marketplaceProducts';

const uploadImages = async (uid, files) => {
  if (!files.length) return [];

  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const storageRef = ref(
            storage,
            `${MARKETPLACE_PRODUCTS_STORAGE_PREFIX}/${uid}/${Date.now()}_${file.name}`
          );
          const uploadTask = uploadBytesResumable(storageRef, file);
          uploadTask.on(
            'state_changed',
            null,
            reject,
            async () => {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadURL);
            }
          );
        })
    )
  );
};

const MarketplaceProductForm = ({
  initialValues = {},
  onSubmit,
  submitLabel = 'שמירה',
  loading = false,
  currentUser,
}) => {
  const [name, setName] = useState(initialValues.name || '');
  const [price, setPrice] = useState(initialValues.price ?? '');
  const [description, setDescription] = useState(initialValues.description || '');
  const [category, setCategory] = useState(initialValues.category || 'אחר');
  const [stockAmount, setStockAmount] = useState(initialValues.stockAmount ?? 0);
  const [showInStore, setShowInStore] = useState(initialValues.showInStore !== false);
  const [options, setOptions] = useState(initialValues.options?.filter((o) => o !== 'ללא אופציות') || []);
  const [currentOption, setCurrentOption] = useState('');
  const [existingImages, setExistingImages] = useState(initialValues.images || []);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAddOption = () => {
    const value = currentOption.trim();
    if (!value) return;
    if (options.some((opt) => opt.toLowerCase() === value.toLowerCase())) {
      setCurrentOption('');
      return;
    }
    setOptions([...options, value]);
    setCurrentOption('');
  };

  const handleOptionKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddOption();
    }
  };

  const handleRemoveOption = (index) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleRemoveExistingImage = (index) => {
    setExistingImages(existingImages.filter((_, i) => i !== index));
  };

  const handleFiles = (files) => {
    setSelectedFiles([...selectedFiles, ...Array.from(files)]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || price === '') return;

    setSubmitting(true);
    try {
      const uploadedUrls = await uploadImages(currentUser.uid, selectedFiles);
      const images = [...existingImages, ...uploadedUrls];
      const productOptions = options.length > 0 ? options : ['ללא אופציות'];

      await onSubmit({
        name: name.trim(),
        price: parseFloat(price),
        description: description.trim(),
        category,
        stockAmount: Number(stockAmount) || 0,
        showInStore,
        options: productOptions,
        images,
        measurementType: 'unit',
        unitSize: 1,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const busy = loading || submitting;

  return (
    <form onSubmit={handleSubmit} className="mp-product-form mp-stack">
      <label className="mp-form-label">
        שם המוצר *
        <input
          className="mp-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>

      <label className="mp-form-label">
        מחיר (₪) *
        <input
          className="mp-input"
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
      </label>

      <label className="mp-form-label">
        קטגוריה
        <select className="mp-input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {MARKETPLACE_PRODUCT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </label>

      <label className="mp-form-label">
        תיאור
        <textarea
          className="mp-input"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <label className="mp-form-label">
        מלאי (יחידות זמינות לרכישה)
        <input
          className="mp-input"
          type="number"
          min="0"
          value={stockAmount}
          onChange={(e) => setStockAmount(e.target.value)}
        />
        <span className="mp-form-hint">
          0 = לא ניתן להוסיף לסל. השאירו ריק רק אם לא מעקבים מלאי (מוצרים ישנים).
        </span>
      </label>

      <label className="mp-form-checkbox">
        <input
          type="checkbox"
          checked={showInStore}
          onChange={(e) => setShowInStore(e.target.checked)}
        />
        הצגה בחנות הקבועה (כיבוי = רק בהזמנה שבועית / קידום)
      </label>

      <fieldset className="mp-options-field">
        <legend className="mp-options-legend">אפשרויות בחירה</legend>
        <p className="mp-options-hint">למשל: גדול, קטן, עם עלים — לחצו Enter או &quot;הוסף אפשרות&quot;</p>
        <div className="mp-options-input-row">
          <input
            type="text"
            className="mp-input mp-options-input"
            value={currentOption}
            onChange={(e) => setCurrentOption(e.target.value)}
            onKeyDown={handleOptionKeyDown}
            placeholder="הקלידו אפשרות חדשה..."
            aria-label="אפשרות חדשה"
          />
          <button
            type="button"
            className="mp-btn mp-btn-outline mp-options-add-btn"
            onClick={handleAddOption}
            disabled={!currentOption.trim()}
          >
            + הוסף אפשרות
          </button>
        </div>
        {options.length > 0 ? (
          <ul className="mp-options-chips" aria-label="אפשרויות שנוספו">
            {options.map((opt, index) => (
              <li key={`${opt}-${index}`} className="mp-option-chip">
                <span>{opt}</span>
                <button
                  type="button"
                  className="mp-option-chip-remove"
                  onClick={() => handleRemoveOption(index)}
                  aria-label={`הסר ${opt}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mp-options-empty">לא הוגדרו אפשרויות — יוצג &quot;ללא אופציות&quot; ללקוח</p>
        )}
      </fieldset>

      <div className="mp-form-label">
        <span>תמונות</span>
        {existingImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {existingImages.map((url, index) => (
              <div key={url} className="relative">
                <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg" />
                <button
                  type="button"
                  className="absolute -top-1 -left-1 bg-red-600 text-white text-xs rounded-full w-5 h-5"
                  onClick={() => handleRemoveExistingImage(index)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div
          className={`mp-dropzone mt-2 ${isDragging ? 'is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            id="mp-product-images"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <label htmlFor="mp-product-images" className="mp-dropzone-label">
            גרור תמונות או לחץ לבחירה
          </label>
        </div>
        {selectedFiles.length > 0 && (
          <p className="mp-form-hint">{selectedFiles.length} תמונות חדשות לעלאה</p>
        )}
      </div>

      <button type="submit" className="mp-btn mp-btn-wood" disabled={busy}>
        {busy ? 'שומר...' : submitLabel}
      </button>
    </form>
  );
};

export default MarketplaceProductForm;
