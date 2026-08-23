import React, { useState, useMemo } from 'react';
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import Swal from 'sweetalert2';
import { useCart } from '../../contexts/CartContext';
import {
  attachGroupPromotionFields,
  getEffectiveUnitPrice,
  getGroupPromotionLabel,
  getQuantityDiscountLabel,
  normalizeQuantityDiscount,
} from '../../utils/pricing';
import { isNewProduct } from '../../utils/productFreshness';

const CATEGORY_CARD_IMAGE_LIMIT = 1;

const ProductImage = ({ src, alt, className, width, height }) => (
  <img
    src={src}
    alt={alt}
    className={className}
    loading="lazy"
    decoding="async"
    width={width}
    height={height}
  />
);

const QuantityDiscountBadge = ({ product, quantityDiscount, groupPromotion }) => {
  const groupLabel = groupPromotion ? getGroupPromotionLabel(groupPromotion) : '';
  const label = groupLabel || (quantityDiscount ? getQuantityDiscountLabel(product) : '');
  if (!label) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-1/2">
      <span className="inline-block whitespace-nowrap rounded-full bg-[#fef9c3] px-2 py-0.5 text-[9px] font-bold leading-tight text-green-900 shadow-md md:px-3 md:py-1 md:text-xs">
        {label}
      </span>
    </div>
  );
};

const ProductImageBadges = ({ product, compact = false }) => {
  const sizeClass = compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5';
  const badges = [];

  if (isNewProduct(product.createdAt)) {
    badges.push({ key: 'new', label: 'חדש', className: 'bg-blue-100 text-blue-800' });
  }
  if (product.isOrganic) {
    badges.push({ key: 'organic', label: 'אורגני', className: 'bg-green-100 text-green-800' });
  }
  if (product.isRecommended) {
    badges.push({ key: 'recommended', label: 'מומלץ', className: 'bg-amber-100 text-amber-800' });
  }

  if (badges.length === 0) return null;

  return (
    <div className="pointer-events-none absolute top-1.5 right-1.5 z-10 flex max-w-[88%] flex-col items-end gap-1">
      {badges.map((badge) => (
        <span
          key={badge.key}
          className={`${sizeClass} rounded-full font-bold shadow-sm ${badge.className}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
};

const InCartBadge = ({ quantityLabel, compact = false }) => (
  <div
    className={`absolute bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-green-500 text-white shadow-md ${
      compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
    }`}
  >
    <svg xmlns="http://www.w3.org/2000/svg" className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
    {compact ? `${quantityLabel} בסל` : `בסל: ${quantityLabel}`}
  </div>
);

const ProductCard = ({ product, calculateTimeRemaining, selectedCommunity }) => {
  const measurementType = product.measurementType || 'kg';
  const unitSize = product.unitSize || 1;
  const averageWeightKg = Number(product.averageWeightKg) > 0 ? Number(product.averageWeightKg) : 1;
  const isKgItem = measurementType === 'kg';
  const isUnitItem = measurementType === 'unit';
  const isPackageItem = measurementType === 'package';
  const isSoldByWeight = isKgItem || isUnitItem;
  const pricePer100g = isSoldByWeight ? (product.price / 10).toFixed(2) : null;
  const quantityDiscount = normalizeQuantityDiscount(
    product.quantityDiscountThreshold,
    product.quantityDiscountPrice,
  );
  const groupPromotion = product.groupPromotion || null;

  const [quantity, setQuantity] = useState(isKgItem ? unitSize : 1);
  const [selectedOption] = useState(
    product.options && product.options.length > 0 ? product.options[0] : ""
  );
  const { addItem, cartItems } = useCart();
  const selectedUnitPrice = getEffectiveUnitPrice(product, quantity);
  const selectedDiscountApplied = Boolean(
    quantityDiscount && quantity >= quantityDiscount.quantityDiscountThreshold,
  );

  const quantityInCart = useMemo(() => {
    return cartItems
      .filter(item => item.id === product.id)
      .reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems, product.id]);

  const cardImages = useMemo(
    () => (Array.isArray(product.images) ? product.images.filter(Boolean).slice(0, CATEGORY_CARD_IMAGE_LIMIT) : []),
    [product.images]
  );

  const formatQuantity = (qty) => {
    if (isKgItem) {
      return qty % 1 === 0 ? qty.toString() : qty.toFixed(1);
    }
    return Math.round(qty).toString();
  };

  const formatQuantityWithUnit = (qty) => {
    if (isKgItem) {
      return `${formatQuantity(qty)} ק"ג`;
    }
    if (isUnitItem) {
      return `${Math.round(qty)} יח'`;
    }
    return `${Math.round(qty)} מארז`;
  };

  const handleQuantityChange = (increment) => {
    const step = isKgItem ? unitSize : 1;

    if (increment) {
      const nextQuantity = Math.round((quantity + step) * 1000) / 1000;

      if (product.stockAmount && nextQuantity > product.stockAmount) {
        const stockText = isKgItem
          ? `יש רק ${product.stockAmount} ק"ג זמינים במלאי`
          : isUnitItem
          ? `יש רק ${product.stockAmount} יחידות זמינות במלאי`
          : `יש רק ${product.stockAmount} מארזים זמינים במלאי`;
        Swal.fire({
          title: 'הגעת למלאי המקסימלי',
          text: stockText,
          icon: 'info',
          confirmButtonText: 'הבנתי',
          confirmButtonColor: '#3b82f6'
        });
        return;
      }

      setQuantity(nextQuantity);
    } else {
      const nextQuantity = Math.round((quantity - step) * 1000) / 1000;
      setQuantity(Math.max(nextQuantity, 0));
    }
  };

  const addToCart = () => {
    if (quantity <= 0) {
      Swal.fire({
        title: 'אופס!',
        text: 'אנא בחר כמות גדולה מאפס',
        icon: 'warning',
        confirmButtonText: 'אישור'
      });
      return;
    }

    if (product.stockAmount !== undefined && quantity > product.stockAmount) {
      const stockText = isKgItem
        ? `יש רק ${product.stockAmount} ק"ג במלאי מתוך ${formatQuantity(quantity)} שביקשת`
        : isUnitItem
        ? `יש רק ${product.stockAmount} יחידות במלאי מתוך ${quantity} שביקשת`
        : `יש רק ${product.stockAmount} מארזים במלאי מתוך ${quantity} שביקשת`;
      Swal.fire({
        title: 'מלאי לא מספיק',
        text: stockText,
        icon: 'warning',
        confirmButtonText: 'אישור'
      });
      return;
    }

    const productToAdd = {
      id: product.id,
      name: product.name,
      price: product.price,
      basePrice: product.price,
      quantityDiscountThreshold: product.quantityDiscountThreshold ?? null,
      quantityDiscountPrice: product.quantityDiscountPrice ?? null,
      quantityDiscountLabel: product.quantityDiscountLabel ?? null,
      selectedOption: selectedOption,
      quantity: quantity,
      images: product.images || [],
      businessId: product.businessId,
      businessName: product.businessName,
      stockAmount: product.stockAmount,
      catalogNumber: product.catalogNumber,
      vatType: product.vatType ?? 3,
      measurementType: measurementType,
      unitSize: unitSize,
      averageWeightKg: averageWeightKg,
      ...attachGroupPromotionFields({}, groupPromotion),
    };

    addItem(
      productToAdd,
      product.orderId,
      product.businessId,
      product.minimumOrderAmount || 0,
      product.minimumOrderItemCount || 0,
    );

    setQuantity(isKgItem ? unitSize : 1);

    Swal.fire({
      title: 'נוסף לסל!',
      text: `${product.name} (${formatQuantityWithUnit(quantity)}) נוסף לסל הקניות שלך`,
      icon: 'success',
      timer: 1500,
      showConfirmButton: false
    });
  };

  const sliderSettings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    lazyLoad: 'ondemand'
  };

  const isOutOfStock = product.stockAmount <= 0;
  const quantityInCartLabel = formatQuantityWithUnit(quantityInCart);
  const hasQuantityDiscount = Boolean(quantityDiscount || groupPromotion);

  return (
    <div className={`product-card relative ${hasQuantityDiscount ? 'pt-3' : ''}`}>
      <div
        className={`rounded-md bg-white transition-shadow ${
          product.isRecommended ? 'border-2 border-amber-400' : 'shadow-sm'
        } ${isOutOfStock ? 'opacity-60 grayscale' : ''}`}
        style={product.isRecommended ? {
          boxShadow: '0 0 0 3px rgba(251, 191, 36, 0.55), 0 0 24px 8px rgba(245, 158, 11, 0.45)',
        } : undefined}
      >
      {/* Desktop Layout - Vertical with larger image */}
      <div className="hidden md:flex md:flex-col">
        <div className="relative h-56 w-full flex-shrink-0">
          <QuantityDiscountBadge product={product} quantityDiscount={quantityDiscount} groupPromotion={groupPromotion} />
          <div className="h-full overflow-hidden rounded-t-md">
          {cardImages.length > 0 ? (
            cardImages.length > 1 ? (
              <div className="h-full">
                <Slider {...sliderSettings} className="h-full">
                  {cardImages.map((image, index) => (
                    <div key={index} className="h-56">
                      <ProductImage
                        src={image}
                        alt={`תמונה ${index + 1} של ${product.name}`}
                        className="w-full h-full object-cover"
                        width="320"
                        height="224"
                      />
                    </div>
                  ))}
                </Slider>
              </div>
            ) : (
              <div className="h-full">
                <ProductImage
                  src={cardImages[0]}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  width="320"
                  height="224"
                />
              </div>
            )
          ) : (
            <div className="w-full h-full bg-gray-100 flex items-center justify-center">
              <span className="text-gray-400">אין תמונה</span>
            </div>
          )}

          </div>

          <ProductImageBadges product={product} />

          {isOutOfStock && (
            <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-3 py-1 rounded-full shadow-lg z-10">
              אזל במלאי
            </div>
          )}

          {!isOutOfStock && quantityInCart > 0 && (
            <InCartBadge quantityLabel={quantityInCartLabel} />
          )}
        </div>

        <div className="flex-1 p-3">
          <h3 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2 flex-wrap">
            {product.name}
            {product.category === 'משתלה' && (
              <span className="text-xs font-bold bg-lime-100 text-lime-800 px-2 py-0.5 rounded-full">🪴 משתלה</span>
            )}
            {product.hasFarmerBadge && (
              <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">🌾 חקלאי</span>
            )}
            {(product.isSample || Number(product.price) === 0) && (
              <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">דגימה בחינם</span>
            )}
          </h3>
          <p className="text-lg font-semibold text-blue-600 mb-1">
            ₪{product.price}
            {isKgItem && '/ק"ג'}
            {isUnitItem && '/ק"ג'}
            {isPackageItem && '/מארז'}
            {isKgItem && unitSize !== 1 && (
              <span className="text-xs text-gray-500 mr-1">
                (₪{(product.price * unitSize).toFixed(2)} ל-{formatQuantity(unitSize)} ק"ג)
              </span>
            )}
            {isUnitItem && (
              <span className="text-xs text-gray-500 mr-1">(נשקל - יחידה)</span>
            )}
          </p>
          {quantityDiscount && selectedDiscountApplied && (
            <p className="text-xs font-semibold text-emerald-700 mb-1">
              המחיר הנבחר: ₪{selectedUnitPrice.toFixed(2)}
            </p>
          )}
          {isSoldByWeight && (
            <p className="text-xs text-gray-400 mb-1">₪{pricePer100g} ל-100 גרם</p>
          )}
          <p className="text-xs text-gray-600 line-clamp-2 mb-2">{product.description}</p>

          <p className="text-xs text-blue-600 font-medium mb-1">
            מאת: {product.businessName} - {product.businessKind}
          </p>

          {calculateTimeRemaining && (
            <p className="text-[11px] text-red-600 font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {calculateTimeRemaining(product, selectedCommunity)}
            </p>
          )}
        </div>

        <div className="p-2.5 space-y-2 border-t">
          <div className={`flex items-center border border-gray-300 rounded-sm w-full ${isOutOfStock ? 'opacity-50' : ''}`}>
            <button
              onClick={() => handleQuantityChange(false)}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center bg-gray-50 text-2xl font-bold leading-none text-gray-700 hover:bg-gray-100"
              disabled={isOutOfStock}
            >
              -
            </button>
            <span className="flex-1 truncate py-1.5 text-center text-sm font-medium">
              {formatQuantity(quantity)}{isKgItem ? ' ק"ג' : ''}
            </span>
            <button
              onClick={() => handleQuantityChange(true)}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center bg-gray-50 text-2xl font-bold leading-none text-gray-700 hover:bg-gray-100"
              disabled={isOutOfStock}
            >
              +
            </button>
          </div>

          <button
            onClick={addToCart}
            disabled={isOutOfStock}
            className={`flex h-11 w-full items-center justify-center gap-1.5 rounded-sm text-sm font-medium text-white ${isOutOfStock ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            הוסף לסל
          </button>
        </div>
      </div>

      {/* Mobile Layout - Horizontal */}
      <div className="md:hidden flex border-b">
        <div className="relative h-28 w-28 flex-shrink-0 border-l">
          <QuantityDiscountBadge product={product} quantityDiscount={quantityDiscount} groupPromotion={groupPromotion} />
          <div className="h-full overflow-hidden">
          {cardImages.length > 0 ? (
            cardImages.length > 1 ? (
              <div className="h-full">
                <Slider {...sliderSettings} className="h-full">
                  {cardImages.map((image, index) => (
                    <div key={index} className="h-32">
                      <ProductImage
                        src={image}
                        alt={`תמונה ${index + 1} של ${product.name}`}
                        className="w-full h-full object-contain"
                        width="112"
                        height="112"
                      />
                    </div>
                  ))}
                </Slider>
              </div>
            ) : (
              <div className="h-full">
                <ProductImage
                  src={cardImages[0]}
                  alt={product.name}
                  className="w-full h-full object-contain"
                  width="112"
                  height="112"
                />
              </div>
            )
          ) : (
            <div className="w-full h-full bg-gray-100 flex items-center justify-center">
              <span className="text-gray-400 text-sm">אין תמונה</span>
            </div>
          )}

          </div>

          <ProductImageBadges product={product} compact />

          {isOutOfStock && (
            <div className="absolute top-0 right-0 bg-red-500 text-white text-xs px-2 py-1 rounded-bl-md z-10">
              אזל במלאי
            </div>
          )}

          {!isOutOfStock && quantityInCart > 0 && (
            <InCartBadge quantityLabel={quantityInCartLabel} compact />
          )}
        </div>

        <div className="flex-1 p-2.5">
          <h3 className="text-sm font-bold text-gray-900 mb-0.5 flex items-center gap-1 flex-wrap">
            {product.name}
            {product.category === 'משתלה' && (
              <span className="text-[10px] font-bold bg-lime-100 text-lime-800 px-1.5 py-0.5 rounded-full">🪴 משתלה</span>
            )}
            {product.hasFarmerBadge && (
              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">🌾 חקלאי</span>
            )}
            {(product.isSample || Number(product.price) === 0) && (
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full">דגימה בחינם</span>
            )}
          </h3>
          <p className="text-sm text-gray-500 mb-0.5">
            ₪{product.price}
            {isKgItem && '/ק"ג'}
            {isUnitItem && '/ק"ג'}
            {isPackageItem && '/מארז'}
            {isKgItem && unitSize !== 1 && (
              <span className="text-xs text-gray-400 mr-1">
                (₪{(product.price * unitSize).toFixed(2)} ל-{formatQuantity(unitSize)} ק"ג)
              </span>
            )}
            {isUnitItem && (
              <span className="text-xs text-gray-400 mr-1">(נשקל ~{averageWeightKg} ק"ג ליח')</span>
            )}
          </p>
          {quantityDiscount && selectedDiscountApplied && (
            <p className="text-[11px] font-semibold text-emerald-700 mb-0.5">
              ההנחה הופעלה · ₪{selectedUnitPrice.toFixed(2)}
            </p>
          )}
          {isSoldByWeight && (
            <p className="text-[11px] text-gray-400 mb-0.5">₪{pricePer100g} ל-100 גרם</p>
          )}
          <p className="text-xs text-gray-600 line-clamp-2 mb-0.5">{product.description}</p>

          <p className="text-xs text-blue-600 font-medium">
            מאת: {product.businessName} - {product.businessKind}
          </p>

          {calculateTimeRemaining && (
            <p className="text-[11px] text-red-600 font-medium mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {calculateTimeRemaining(product, selectedCommunity)}
            </p>
          )}
        </div>
      </div>

      <div className="md:hidden p-2.5 space-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className={`flex flex-shrink-0 items-center overflow-hidden rounded-sm border border-gray-300 ${isOutOfStock ? 'opacity-50' : ''}`}>
            <button
              onClick={() => handleQuantityChange(false)}
              className="flex h-11 w-10 flex-shrink-0 items-center justify-center bg-gray-50 text-2xl font-bold leading-none text-gray-700 hover:bg-gray-100"
              disabled={isOutOfStock}
            >
              -
            </button>
            <span className="min-w-[36px] px-1 py-1 text-center text-sm">
              {formatQuantity(quantity)}{isKgItem ? ' ק"ג' : ''}
            </span>
            <button
              onClick={() => handleQuantityChange(true)}
              className="flex h-11 w-10 flex-shrink-0 items-center justify-center bg-gray-50 text-2xl font-bold leading-none text-gray-700 hover:bg-gray-100"
              disabled={isOutOfStock}
            >
              +
            </button>
          </div>

          <button
            onClick={addToCart}
            disabled={isOutOfStock}
            className={`flex h-11 min-w-0 flex-1 items-center justify-center rounded-sm px-2 text-sm font-medium text-white ${isOutOfStock ? 'cursor-not-allowed bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'}`}
          >
            <span className="truncate">הוסף לסל</span>
          </button>
        </div>
      </div>
      </div>
    </div>
  );
};

export default ProductCard;
