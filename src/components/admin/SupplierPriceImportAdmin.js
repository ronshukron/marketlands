import React, { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import {
  createMappingPreview,
  hashSupplierFile,
  parseSupplierPdf,
  saveSupplierPriceImport,
} from '../../services/supplierPriceListService';
import {
  buildMatchesForBusinesses,
  calculateMarginPreservingPrice,
} from '../../utils/supplierPriceMatching';
import LoadingSpinner from '../LoadingSpinner';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];
const FILTERS = [
  ['all', 'הכול'],
  ['increased', 'התייקרו'],
  ['decreased', 'הוזלו'],
  ['unchanged', 'ללא שינוי'],
  ['new', 'חדשים'],
  ['removed', 'ירדו מהמחירון'],
  ['ready', 'מוכנים'],
  ['review', 'דורשים בדיקה'],
  ['unmatched', 'ללא התאמה'],
];
const CHANGE_COLORS = {
  increased: '#ef4444',
  decreased: '#10b981',
  unchanged: '#94a3b8',
  new: '#3b82f6',
};
const CONFIDENCE_LABELS = {
  saved: 'התאמה שמורה',
  high: 'גבוהה',
  medium: 'בינונית',
  low: 'נמוכה',
  none: 'ללא התאמה',
};

const money = (value) => (
  Number.isFinite(Number(value)) ? `₪${Number(value).toFixed(2)}` : '—'
);
const percent = (value) => (
  Number.isFinite(Number(value)) ? `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(1)}%` : '—'
);

const SupplierPriceImportAdmin = () => {
  const { currentUser, userRole } = useAuth();
  const [stage, setStage] = useState('upload');
  const [file, setFile] = useState(null);
  const [fileHash, setFileHash] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([]);
  const [duplicateCodes, setDuplicateCodes] = useState([]);
  const [pageCount, setPageCount] = useState(0);
  const [context, setContext] = useState(null);
  const [matches, setMatches] = useState([]);
  const [filter, setFilter] = useState('all');
  const [businessFilter, setBusinessFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const isAdmin = Boolean(
    currentUser && (userRole === 'admin' || ADMIN_UIDS.includes(currentUser.uid))
  );

  const summary = useMemo(() => {
    const counts = { increased: 0, decreased: 0, unchanged: 0, new: 0 };
    rows.forEach((row) => {
      if (counts[row.changeType] != null) counts[row.changeType] += 1;
    });
    const changed = rows.filter((row) => Number.isFinite(row.changePercent));
    const average = changed.length
      ? changed.reduce((sum, row) => sum + row.changePercent, 0) / changed.length
      : null;
    return { ...counts, average };
  }, [rows]);

  const chartData = useMemo(() => [
    { name: 'התייקרו', value: summary.increased, key: 'increased' },
    { name: 'הוזלו', value: summary.decreased, key: 'decreased' },
    { name: 'ללא שינוי', value: summary.unchanged, key: 'unchanged' },
    { name: 'חדשים', value: summary.new, key: 'new' },
  ], [summary]);

  const movers = useMemo(() => rows
    .filter((row) => Number.isFinite(row.changePercent))
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 10)
    .map((row) => ({
      name: row.name.length > 18 ? `${row.name.slice(0, 18)}…` : row.name,
      previousCost: Number(row.previousCost),
      currentCost: Number(row.cost),
      changePercent: Number(row.changePercent.toFixed(1)),
    })), [rows]);

  const businessImpact = useMemo(() => {
    const totals = new Map();
    matches.forEach((match) => {
      if (!match.enabled || !match.product || !match.calculation?.valid) return;
      const current = totals.get(match.businessId) || {
        name: match.businessName.length > 18
          ? `${match.businessName.slice(0, 18)}…`
          : match.businessName,
        current: 0,
        suggested: 0,
      };
      current.current += Number(match.product.price || 0);
      current.suggested += Number(match.finalPrice || match.calculation.suggestedPrice || 0);
      totals.set(match.businessId, current);
    });
    return [...totals.values()].slice(0, 12);
  }, [matches]);

  const visibleMatches = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return matches.filter((match) => {
      if (businessFilter !== 'all' && match.businessId !== businessFilter) return false;
      if (
        normalizedSearch
        && !match.name.toLowerCase().includes(normalizedSearch)
        && !match.supplierCode.toLowerCase().includes(normalizedSearch)
        && !match.businessName.toLowerCase().includes(normalizedSearch)
        && !(match.product?.name || '').toLowerCase().includes(normalizedSearch)
      ) return false;
      if (filter === 'ready') return match.enabled && match.productId && !match.needsReview;
      if (filter === 'review') return match.needsReview;
      if (filter === 'unmatched') return !match.productId;
      if (filter === 'removed') return false;
      if (['increased', 'decreased', 'unchanged', 'new'].includes(filter)) {
        return match.changeType === filter;
      }
      return true;
    });
  }, [matches, businessFilter, filter, search]);

  const selectedMatches = useMemo(
    () => matches.filter((match) => match.enabled && match.productId),
    [matches]
  );
  const priceUpdateCount = useMemo(
    () => selectedMatches.filter((match) => (
      context?.previousImport
      && match.calculation?.valid
      && Number(match.finalPrice) > 0
    )).length,
    [selectedMatches, context]
  );

  if (!isAdmin) return <Navigate to="/admin" replace />;

  const handleParse = async () => {
    if (!file) {
      Swal.fire('חסר קובץ', 'יש לבחור קובץ PDF', 'warning');
      return;
    }
    setBusy(true);
    try {
      const [parsed, hash] = await Promise.all([
        parseSupplierPdf(file),
        hashSupplierFile(file),
      ]);
      setRows(parsed.rows);
      setDuplicateCodes(parsed.duplicateCodes);
      setPageCount(parsed.pageCount);
      setFileHash(hash);
      setStage('correct');
    } catch (error) {
      Swal.fire('לא ניתן לקרוא את הקובץ', error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRowChange = (index, field, value) => {
    setRows((current) => current.map((row, rowIndex) => (
      rowIndex === index
        ? { ...row, [field]: field === 'cost' ? Number(value) : value }
        : row
    )));
  };

  const handleBuildReview = async () => {
    const invalidRows = rows.filter((row) => (
      !row.supplierCode || !row.name || !Number.isFinite(Number(row.cost)) || Number(row.cost) < 0
    ));
    const codes = rows.map((row) => row.supplierCode);
    const hasDuplicates = new Set(codes).size !== codes.length;
    if (invalidRows.length || hasDuplicates) {
      Swal.fire(
        'יש לתקן את הטבלה',
        hasDuplicates ? 'קיימים קודי ספק כפולים' : 'יש שורות ללא קוד, שם או מחיר תקין',
        'warning'
      );
      return;
    }

    setBusy(true);
    try {
      const preview = await createMappingPreview(rows);
      const builtMatches = buildMatchesForBusinesses({
        rows: preview.rows,
        businesses: preview.businesses,
        productsByBusiness: preview.productsByBusiness,
        mappings: preview.mappings,
      });
      setRows(preview.rows);
      setContext(preview);
      setMatches(builtMatches);
      setStage('review');
    } catch (error) {
      Swal.fire('שגיאה בטעינת המוצרים', error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleProductChange = (matchId, productId) => {
    setMatches((current) => current.map((match) => {
      if (match.id !== matchId) return match;
      const product = (context.productsByBusiness[match.businessId] || [])
        .find((item) => item.id === productId) || null;
      const calculation = product && match.previousCost != null
        ? calculateMarginPreservingPrice({
            currentPrice: product.price,
            previousCost: match.previousCost,
            newCost: match.cost,
          })
        : { valid: false, reason: 'missing-baseline', margin: null, suggestedPrice: null };
      return {
        ...match,
        productId,
        product,
        calculation,
        finalPrice: calculation.suggestedPrice,
        confidence: productId ? 'saved' : 'none',
        score: productId ? 100 : 0,
        needsReview: !productId,
        enabled: Boolean(productId),
      };
    }));
  };

  const handleEnabledChange = (matchId, enabled) => {
    setMatches((current) => current.map((match) => (
      match.id === matchId ? { ...match, enabled } : match
    )));
  };

  const handleFinalPriceChange = (matchId, value) => {
    setMatches((current) => current.map((match) => (
      match.id === matchId ? { ...match, finalPrice: Number(value) } : match
    )));
  };

  const handleSave = async () => {
    if (selectedMatches.length === 0) {
      Swal.fire('אין שורות לשמירה', 'בחר לפחות התאמה אחת', 'info');
      return;
    }
    const confirmation = await Swal.fire({
      icon: 'question',
      title: context.previousImport ? 'להחיל את המחירון?' : 'לשמור מחירון בסיס?',
      html: context.previousImport
        ? `יישמרו ${selectedMatches.length} עלויות ספק ויעודכנו ${priceUpdateCount} מחירי מכירה.`
        : `יישמרו ${selectedMatches.length} עלויות בסיס. מחירי המכירה לא ישתנו.`,
      showCancelButton: true,
      confirmButtonText: context.previousImport ? 'אישור והחלה' : 'שמירת בסיס',
      cancelButtonText: 'ביטול',
      confirmButtonColor: '#2563eb',
    });
    if (!confirmation.isConfirmed) return;

    setBusy(true);
    try {
      const result = await saveSupplierPriceImport({
        file,
        fileHash,
        reportDate,
        rows,
        removedRows: context.removed,
        matches,
        currentUser,
        previousImport: context.previousImport,
      });
      await Swal.fire({
        icon: 'success',
        title: result.baseline ? 'מחירון הבסיס נשמר' : 'המחירון הוחל',
        text: result.baseline
          ? `${result.matchedCount} התאמות נשמרו ללא שינוי מחירי מכירה`
          : `${result.priceUpdateCount} מחירי מכירה עודכנו`,
      });
      setStage('done');
    } catch (error) {
      Swal.fire(
        'השמירה נכשלה',
        `${error.message}. ייתכן שחלק מהקבוצות נשמרו; ניתן לבדוק את רשומת הייבוא שנכשלה.`,
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 py-6 px-3 font-hebrew text-right">
      {busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80">
          <div className="text-center">
            <LoadingSpinner />
            <p className="mt-3 font-medium text-slate-700">מעבד נתונים…</p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/admin" className="text-sm text-blue-700 hover:underline">← חזרה ללוח מנהל</Link>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">ייבוא מחירון ספק</h1>
            <p className="mt-1 text-sm text-slate-600">השוואה למחירון הקודם, התאמה לכל עסק ובקרת מחיר לפני עדכון</p>
          </div>
          <div className="rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-800">
            {stage === 'upload' && '1. העלאה'}
            {stage === 'correct' && '2. בדיקת הפענוח'}
            {stage === 'review' && '3. התאמה ואישור'}
            {stage === 'done' && 'הייבוא הושלם'}
          </div>
        </div>

        {stage === 'upload' && (
          <section className="mx-auto max-w-2xl rounded-xl border bg-white p-6 shadow-sm">
            <label className="mb-2 block font-semibold text-slate-800" htmlFor="report-date">תאריך המחירון</label>
            <input
              id="report-date"
              type="date"
              value={reportDate}
              onChange={(event) => setReportDate(event.target.value)}
              className="mb-5 min-h-11 w-full rounded-lg border border-slate-300 px-3"
            />
            <label className="mb-2 block font-semibold text-slate-800" htmlFor="supplier-pdf">קובץ PDF</label>
            <input
              id="supplier-pdf"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="min-h-11 w-full rounded-lg border border-dashed border-slate-400 p-3"
            />
            <p className="mt-3 text-sm text-slate-500">הקובץ מפוענח בדפדפן ואינו נשמר. נשמרים רק שם הקובץ, טביעת קובץ והשורות שאושרו.</p>
            <button
              type="button"
              onClick={handleParse}
              disabled={!file || !reportDate}
              className="mt-6 min-h-11 w-full rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              פענוח המחירון
            </button>
          </section>
        )}

        {stage === 'correct' && (
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">בדיקת שורות שחולצו</h2>
                <p className="text-sm text-slate-600">{rows.length} שורות מתוך {pageCount} עמודים</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setStage('upload')} className="min-h-11 rounded-lg border px-4">חזרה</button>
                <button type="button" onClick={handleBuildReview} className="min-h-11 rounded-lg bg-blue-600 px-5 text-white">המשך להתאמות</button>
              </div>
            </div>
            {duplicateCodes.length > 0 && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                קודים כפולים לתיקון: {duplicateCodes.join(', ')}
              </div>
            )}
            <div className="max-h-[65vh] overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100">
                  <tr>
                    <th className="p-3">קוד</th>
                    <th className="p-3">שם ספק</th>
                    <th className="p-3">יחידה</th>
                    <th className="p-3">מחיר עלות</th>
                    <th className="p-3">הערה</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.supplierCode}-${index}`} className="border-t">
                      <td className="p-2">
                        <input value={row.supplierCode} onChange={(e) => handleRowChange(index, 'supplierCode', e.target.value)} className="w-28 rounded border p-2" />
                      </td>
                      <td className="p-2">
                        <input value={row.name} onChange={(e) => handleRowChange(index, 'name', e.target.value)} className="min-w-64 rounded border p-2" />
                      </td>
                      <td className="p-2">
                        <select value={row.unit} onChange={(e) => handleRowChange(index, 'unit', e.target.value)} className="rounded border p-2">
                          <option value="kg">ק״ג</option>
                          <option value="unit">יחידה</option>
                          <option value="unknown">לא ידוע</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <input type="number" min="0" step="0.01" value={row.cost} onChange={(e) => handleRowChange(index, 'cost', e.target.value)} className="w-24 rounded border p-2" />
                      </td>
                      <td className="p-2">
                        <input value={row.notes || ''} onChange={(e) => handleRowChange(index, 'notes', e.target.value)} className="min-w-36 rounded border p-2" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {stage === 'review' && context && (
          <>
            <div className={`mb-4 rounded-xl border p-4 ${context.previousImport ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
              <strong>{context.previousImport ? 'נמצאה השוואה למחירון קודם' : 'זהו מחירון הבסיס הראשון'}</strong>
              <p className="mt-1 text-sm">
                {context.previousImport
                  ? `המחירון הקודם מתאריך ${context.previousImport.reportDate}. הצעות המחיר שומרות על שיעור הרווח הקיים.`
                  : 'יישמרו עלויות וקישורים בלבד. מחירי המכירה לא ישתנו בייבוא זה.'}
              </p>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {[
                ['התייקרו', summary.increased, 'text-red-700'],
                ['הוזלו', summary.decreased, 'text-emerald-700'],
                ['ללא שינוי', summary.unchanged, 'text-slate-700'],
                ['חדשים', summary.new, 'text-blue-700'],
                ['ירדו מהמחירון', context.removed.length, 'text-orange-700'],
                ['שינוי ממוצע', percent(summary.average), 'text-violet-700'],
              ].map(([label, value, color]) => (
                <div key={label} className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
                </div>
              ))}
            </div>

            <section className="mb-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <h2 className="mb-2 font-bold">חלוקת השינויים</h2>
                <div className="h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} label>
                        {chartData.map((entry) => <Cell key={entry.key} fill={CHANGE_COLORS[entry.key]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <h2 className="mb-2 font-bold">עלות קודמת מול חדשה — השינויים הגדולים</h2>
                <div className="h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={movers} layout="vertical" margin={{ left: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="previousCost" name="עלות קודמת" fill="#94a3b8" />
                      <Bar dataKey="currentCost" name="עלות חדשה" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <h2 className="mb-2 font-bold">השפעה צפויה על מחירי מכירה לפי עסק</h2>
                <div className="h-64" dir="ltr">
                  {businessImpact.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={businessImpact}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="current" name="מחיר נוכחי מצטבר" fill="#94a3b8" />
                        <Bar dataKey="suggested" name="מחיר מוצע מצטבר" fill="#8b5cf6" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      יוצג לאחר בחירת התאמות עם מחיר בסיס
                    </div>
                  )}
                </div>
              </div>
            </section>
            <p className="mb-4 text-xs text-slate-500">האנליטיקה אינה משוקללת לפי כמויות רכישה, מכיוון שהמחירון אינו כולל כמויות.</p>

            <section className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div className="min-w-52 flex-1">
                  <label className="mb-1 block text-xs font-semibold">עסק</label>
                  <select value={businessFilter} onChange={(e) => setBusinessFilter(e.target.value)} className="min-h-11 w-full rounded-lg border px-3">
                    <option value="all">כל העסקים</option>
                    {context.businesses.map((business) => (
                      <option key={business.id} value={business.id}>
                        {business.businessName || business.name || business.email || business.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-52 flex-1">
                  <label className="mb-1 block text-xs font-semibold">חיפוש</label>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="קוד, מוצר או עסק" className="min-h-11 w-full rounded-lg border px-3" />
                </div>
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                {FILTERS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={`min-h-11 rounded-full px-4 text-sm ${filter === value ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="max-h-[70vh] overflow-auto rounded-lg border">
                {filter === 'removed' ? (
                  <div className="divide-y">
                    {context.removed.map((row) => (
                      <div key={row.supplierCode} className="flex flex-wrap items-center justify-between gap-2 p-4">
                        <div>
                          <div className="font-semibold">{row.name}</div>
                          <div className="text-xs text-slate-500">{row.supplierCode}</div>
                        </div>
                        <div className="text-orange-700">עלות קודמת: {money(row.cost)}</div>
                      </div>
                    ))}
                    {context.removed.length === 0 && <div className="p-8 text-center text-slate-500">אין מוצרים שירדו מהמחירון</div>}
                  </div>
                ) : (
                <table className="min-w-[1400px] text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100">
                    <tr>
                      <th className="p-3">כלול</th>
                      <th className="p-3">ספק</th>
                      <th className="p-3">עסק</th>
                      <th className="p-3">התאמה למוצר</th>
                      <th className="p-3">ביטחון</th>
                      <th className="p-3">עלות קודמת</th>
                      <th className="p-3">עלות חדשה</th>
                      <th className="p-3">שינוי</th>
                      <th className="p-3">מחיר נוכחי</th>
                      <th className="p-3">רווח גולמי</th>
                      <th className="p-3">מחיר מוצע/סופי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMatches.map((match) => {
                      const extreme = Math.abs(match.changePercent || 0) >= 50;
                      return (
                        <tr key={match.id} className={`border-t ${match.needsReview ? 'bg-amber-50' : ''}`}>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={match.enabled}
                              disabled={!match.productId}
                              onChange={(e) => handleEnabledChange(match.id, e.target.checked)}
                              className="h-5 w-5"
                              aria-label={`כלול ${match.name} ${match.businessName}`}
                            />
                          </td>
                          <td className="p-3">
                            <div className="font-semibold">{match.name}</div>
                            <div className="text-xs text-slate-500">{match.supplierCode} · {match.unit === 'kg' ? 'ק״ג' : 'יח׳'}</div>
                            {match.notes && <div className="text-xs text-orange-700">{match.notes}</div>}
                          </td>
                          <td className="p-3">{match.businessName}</td>
                          <td className="p-3">
                            <select
                              value={match.productId}
                              onChange={(e) => handleProductChange(match.id, e.target.value)}
                              className="min-h-11 w-64 rounded border px-2"
                            >
                              <option value="">ללא התאמה</option>
                              {(context.productsByBusiness[match.businessId] || []).map((product) => (
                                <option key={product.id} value={product.id}>{product.name} ({money(product.price)})</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-3">
                            <span className={`rounded-full px-2 py-1 text-xs ${
                              match.confidence === 'saved' || match.confidence === 'high'
                                ? 'bg-green-100 text-green-800'
                                : match.confidence === 'medium'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                            }`}>
                              {CONFIDENCE_LABELS[match.confidence]} {match.confidence !== 'saved' && `(${match.score})`}
                            </span>
                          </td>
                          <td className="p-3">{money(match.previousCost)}</td>
                          <td className="p-3 font-semibold">{money(match.cost)}</td>
                          <td className={`p-3 font-semibold ${match.changeType === 'increased' ? 'text-red-700' : match.changeType === 'decreased' ? 'text-emerald-700' : ''}`}>
                            {percent(match.changePercent)}
                            {extreme && <div className="mt-1 text-xs text-red-700">שינוי חריג</div>}
                          </td>
                          <td className="p-3">{money(match.product?.price)}</td>
                          <td className="p-3">{match.calculation?.valid ? percent(match.calculation.margin * 100) : 'אין בסיס'}</td>
                          <td className="p-3">
                            {context.previousImport && match.calculation?.valid ? (
                              <input
                                type="number"
                                min="0.01"
                                step="0.1"
                                value={match.finalPrice ?? ''}
                                onChange={(e) => handleFinalPriceChange(match.id, e.target.value)}
                                className="w-28 rounded border p-2 font-semibold"
                              />
                            ) : (
                              <span className="text-xs text-slate-500">בסיס בלבד</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                )}
                {filter !== 'removed' && visibleMatches.length === 0 && (
                  <div className="p-8 text-center text-slate-500">אין תוצאות במסנן זה</div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4">
                <div>
                  <div className="font-semibold">{selectedMatches.length} התאמות נבחרו</div>
                  <div className="text-sm text-slate-600">
                    {context.previousImport ? `${priceUpdateCount} מחירי מכירה יעודכנו` : 'מחירי המכירה לא ישתנו במחירון הבסיס'}
                  </div>
                </div>
                <button type="button" onClick={handleSave} className="min-h-11 rounded-lg bg-blue-600 px-6 font-semibold text-white">
                  {context.previousImport ? 'בדיקה סופית והחלה' : 'שמירת מחירון בסיס'}
                </button>
              </div>
            </section>
          </>
        )}

        {stage === 'done' && (
          <section className="mx-auto max-w-xl rounded-xl border bg-white p-8 text-center shadow-sm">
            <div className="text-5xl text-emerald-600" aria-hidden="true">✓</div>
            <h2 className="mt-3 text-xl font-bold">הייבוא הושלם</h2>
            <div className="mt-5 flex justify-center gap-3">
              <Link to="/admin" className="min-h-11 rounded-lg border px-5 py-2.5">חזרה ללוח מנהל</Link>
              <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-lg bg-blue-600 px-5 text-white">ייבוא מחירון נוסף</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default SupplierPriceImportAdmin;
