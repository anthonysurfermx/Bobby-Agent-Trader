#!/bin/sh
cd "$(dirname "$0")/.." && python3 .src-onb/build.py && node --check .src-onb/all.js && python3 inject.py nucleo-onboarding.html && echo BUILD_OK
