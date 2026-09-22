// API連携時は mode と api の6つのURLを変更します。
export const dataConfig = {
  mode: 'files',
  files: {
    daily: './data/DailySessions.json',
    country: './data/MonthlyCountryAccess.json',
    channel: './data/MonthlySessionDefaultChannelGroupAccess.json',
    pages: './data/MonthlyTopPages.json',
    overview: './data/MonthlyOverview.json',
    landing: './data/MonthlyLandingPages.json',
  },
  api: { daily: '', country: '', channel: '', pages: '', overview: '', landing: '' },
};
