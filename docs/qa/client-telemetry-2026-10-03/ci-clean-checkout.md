# Clean-checkout telemetry CI correction

A fresh review checkout contained no ignored public/client-telemetry.js. The telemetry UI suite reads that generated bundle, but CI invokes the suite before npm run build. Prepend node scripts/build-client-telemetry.mjs to test:client-telemetry so the suite has its declared input.

The corrected npm run test:client-telemetry passed from that missing-bundle state: 97 offline API assertions, 59 UI assertions and four native presentation JavaScript tests. The generated file remains ignored and npm run build still produces the deployment bundle. No production request or write occurred.

Two test comments now describe their synthetic fixture/schema requirement without publishing a production observation timestamp. SQL statements, fixtures and runtime source are unchanged by those comment corrections.

The GitHub repository is public. Its review branch is prepared from main using current code/test/configuration and canonical schema sources, while the 38 local QA/native-evidence files and the full private audit commit chain are retained locally. The five reconciled predecessor migrations must retain their exact bytes for history comparison; public deployment instructions say not to replay them on an environment where they are already applied. No production migration or main publication is authorized by a draft PR.
