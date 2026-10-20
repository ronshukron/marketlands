import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildProductRanking,
  buildRatingDistribution,
  buildRatingTrend,
  buildTagFrequency,
  formatFeedbackPeriodLabel,
  formatFeedbackPeriodShort,
} from '../../utils/productFeedbackStats';

const STAR_COLORS = {
  5: '#16a34a',
  4: '#84cc16',
  3: '#facc15',
  2: '#f97316',
  1: '#dc2626',
};

const tooltipStyle = { direction: 'rtl', textAlign: 'right', fontSize: 13 };

const getAverageColor = (average) => {
  if (average >= 4.5) return STAR_COLORS[5];
  if (average >= 3.5) return STAR_COLORS[4];
  if (average >= 2.5) return STAR_COLORS[3];
  if (average >= 1.5) return STAR_COLORS[2];
  return STAR_COLORS[1];
};

const ChartCard = ({ title, subtitle, actions, children }) => (
  <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="font-bold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
    <div dir="ltr" className="mt-3 h-64">{children}</div>
  </section>
);

const EmptyChart = ({ text }) => (
  <div dir="rtl" className="flex h-full items-center justify-center text-sm text-gray-500">{text}</div>
);

const ProductFeedbackCharts = ({ reviews, periods, period }) => {
  const [rankingDirection, setRankingDirection] = useState('lowest');
  const trend = useMemo(() => buildRatingTrend(periods), [periods]);
  const distribution = useMemo(() => buildRatingDistribution(reviews), [reviews]);
  const ranking = useMemo(
    () => buildProductRanking(reviews, { direction: rankingDirection }),
    [reviews, rankingDirection],
  );
  const tags = useMemo(() => buildTagFrequency(reviews), [reviews]);

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        title="מגמת דירוג"
        subtitle={period === 'day' ? 'ממוצע ומספר דירוגים לפי יום' : 'ממוצע ומספר דירוגים לפי שבוע'}
      >
        {trend.length === 0 ? <EmptyChart text="אין נתונים לתקופה" /> : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="key"
                reversed
                tickFormatter={(key) => formatFeedbackPeriodShort(key, period)}
                tick={{ fontSize: 11 }}
              />
              <YAxis yAxisId="average" orientation="right" domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} width={30} />
              <YAxis yAxisId="count" orientation="left" allowDecimals={false} width={30} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(key) => formatFeedbackPeriodLabel(key, period)}
              />
              <Legend wrapperStyle={{ direction: 'rtl', fontSize: 12 }} />
              <Bar yAxisId="count" dataKey="count" name="דירוגים" fill="#bfdbfe" />
              <Bar yAxisId="count" dataKey="lowCount" name="דירוגים נמוכים (1-2)" fill="#fca5a5" />
              <Line
                yAxisId="average"
                type="monotone"
                dataKey="average"
                name="ממוצע"
                stroke="#d97706"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="התפלגות כוכבים" subtitle="כמה לקוחות נתנו כל דירוג">
        {reviews.length === 0 ? <EmptyChart text="אין נתונים לתקופה" /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distribution} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="rating" width={40} tickFormatter={(rating) => `${rating} ★`} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(rating) => `${rating} כוכבים`} />
              <Bar dataKey="count" name="דירוגים">
                {distribution.map((entry) => <Cell key={entry.rating} fill={STAR_COLORS[entry.rating]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        title={rankingDirection === 'lowest' ? 'המוצרים עם הדירוג הנמוך ביותר' : 'המוצרים עם הדירוג הגבוה ביותר'}
        subtitle="ממוצע לכל מוצר בתקופה שנבחרה"
        actions={(
          <div className="flex rounded-lg border border-gray-200 text-xs" role="group" aria-label="סדר דירוג מוצרים">
            {[
              ['lowest', 'נמוך'],
              ['highest', 'גבוה'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRankingDirection(value)}
                aria-pressed={rankingDirection === value}
                className={`min-h-[36px] px-3 first:rounded-r-lg last:rounded-l-lg ${
                  rankingDirection === value ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      >
        {ranking.length === 0 ? <EmptyChart text="אין נתונים לתקופה" /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ranking} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name, item) => [`${value} (${item.payload.count} דירוגים)`, 'ממוצע']}
              />
              <Bar dataKey="average" name="ממוצע">
                {ranking.map((entry) => <Cell key={entry.key} fill={getAverageColor(entry.average)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="תגיות נפוצות" subtitle="ירוק: חיובי · אדום: בעיה">
        {tags.length === 0 ? <EmptyChart text="לא נבחרו תגיות בתקופה" /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tags} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="tag" width={90} tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="פעמים">
                {tags.map((entry) => <Cell key={entry.tag} fill={entry.positive ? '#22c55e' : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
};

export { getAverageColor, STAR_COLORS };
export default ProductFeedbackCharts;
