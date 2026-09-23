// 全APIに同じ月の月初・月末を指定します。
export const dataConfig = {
  startMonth: '2024-04',
  timeZone: 'Asia/Tokyo',
  timeoutMs: 15000,
  api: {
    daily: 'https://nasuton.com/analytics/api/sessions/daily',
    country: 'https://nasuton.com/analytics/api/users/countries',
    channel: 'https://nasuton.com/analytics/api/users/channels',
    pages: 'https://nasuton.com/analytics/api/pages/top',
    overview: 'https://nasuton.com/analytics/api/overview/monthly',
    landing: 'https://nasuton.com/analytics/api/pages/landing',
  },
};
