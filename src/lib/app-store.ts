// The one place the App Store listing is named. It used to be copied per page,
// which is how a wrong id shipped on the new landings: the link 404'd because
// the number was never checked against the real listing.
export const APP_STORE_URL = 'https://apps.apple.com/app/bobby-the-market-argues-back/id6804460489';
/** The listing's numeric id, for the Smart App Banner on iPhone Safari (<meta name="apple-itunes-app">): /app renders it
 *  (and prerenders it), index.html adds it for /desk, the static home has it in its markup. Read from the URL so it cannot drift. */
export const APP_STORE_ID = /\/id(\d+)$/.exec(APP_STORE_URL)?.[1] ?? '';
