// 全APIに同じ月の月初・月末を指定します。
export const dataConfig = {
  startMonth: '2024-04',
  timeZone: 'Asia/Tokyo',
  timeoutMs: 15000,
  // Search Consoleに登録された識別子をそのまま指定します。
  search: { siteURL: 'https://nasuton.net/blog/', searchType: 'web' },
  api: {
    daily: 'https://nasuton.com/analytics/api/sessions/daily',
    country: 'https://nasuton.com/analytics/api/users/countries',
    channel: 'https://nasuton.com/analytics/api/users/channels',
    pages: 'https://nasuton.com/analytics/api/pages/top',
    overview: 'https://nasuton.com/analytics/api/overview/monthly',
    landing: 'https://nasuton.com/analytics/api/pages/landing',
    device: 'https://nasuton.com/analytics/api/users/devices',
    browser: 'https://nasuton.com/analytics/api/users/browsers',
    os: 'https://nasuton.com/analytics/api/users/operating-systems',
    traffic: 'https://nasuton.com/analytics/api/traffic/sources',
    article: 'https://nasuton.com/analytics/api/pages/views',
    search: 'https://nasuton.com/analytics/api/search/queries',
  },
};
