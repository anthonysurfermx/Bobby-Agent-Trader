// Production builds come from `main` only. On 2026-10-01 a CLI deploy from a side branch and a Git
// deploy from main replaced each other on bobbyprotocol.xyz within seconds (the home story and the
// backend fixes each disappeared in turn). This guard fails any production build whose source is not
// main, so the live site is always exactly what main holds. Preview builds and local builds are untouched.
// Emergency override (rollbacks should use `vercel promote` / Instant Rollback instead, which do not rebuild):
//   vercel deploy --prod --build-env BOBBY_ALLOW_OFF_MAIN_PROD=1
const env = process.env.VERCEL_ENV;
const ref = process.env.VERCEL_GIT_COMMIT_REF || '';
if (env === 'production' && ref !== 'main' && process.env.BOBBY_ALLOW_OFF_MAIN_PROD !== '1') {
  console.error(`[prod-source-guard] Refusing a production build from ${ref ? `branch "${ref}"` : 'a deploy without Git metadata'}.`);
  console.error('[prod-source-guard] Merge to main and let the Git integration deploy it. Override: --build-env BOBBY_ALLOW_OFF_MAIN_PROD=1');
  process.exit(1);
}
console.log(`[prod-source-guard] ok (${env || 'local'}${ref ? `, ${ref}` : ''})`);
