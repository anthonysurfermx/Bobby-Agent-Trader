"""Fail a paid-release gate unless the archived app has an Apple SDK key and purchase privacy data."""
import argparse, json, plistlib
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('app',type=Path,help='Path to the final archived Bobby.app')
args=parser.parse_args()
info=plistlib.loads((args.app/'Info.plist').read_bytes())
privacy=plistlib.loads((args.app/'PrivacyInfo.xcprivacy').read_bytes())
key=info.get('REVENUECAT_IOS_API_KEY','')
key_ok=isinstance(key,str) and key.strip().startswith('appl_') and len(key.strip())>5
collected=privacy.get('NSPrivacyCollectedDataTypes',[])
purchase=next((x for x in collected if x.get('NSPrivacyCollectedDataType')=='NSPrivacyCollectedDataTypePurchaseHistory'),None)
privacy_ok=bool(purchase and purchase.get('NSPrivacyCollectedDataTypeLinked') is True and purchase.get('NSPrivacyCollectedDataTypeTracking') is False and 'NSPrivacyCollectedDataTypePurposeAppFunctionality' in purchase.get('NSPrivacyCollectedDataTypePurposes',[]))
result={'version':info.get('CFBundleShortVersionString'),'build':info.get('CFBundleVersion'),'apple_sdk_key_configured':key_ok,'purchase_history_declared':privacy_ok,'local_paid_release_gate_passed':key_ok and privacy_ok,'note':'Does not verify dashboard, server readiness, localized price or transactions. No key value is printed.'}
print(json.dumps(result,indent=2))
raise SystemExit(0 if key_ok and privacy_ok else 1)
