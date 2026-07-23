# Automated Job Validation Report

## Summary Table

| Scenario | Expected | Actual | Pass/Fail | Score | Rejection/Decision |
|---|---|---|---|---|---|
| Scenario 1: PH Remote Junior Software Developer | Accept | Accept | ✅ Pass | 59 | ELIGIBLE |
| Scenario 2: PH Hybrid Web Developer in Metro Manila | Accept | Accept | ✅ Pass | 69 | ELIGIBLE |
| Scenario 3: PH Onsite Technical Support | Accept | Accept | ✅ Pass | 65 | ELIGIBLE |
| Scenario 4: International Remote — Worldwide | Accept | Accept | ✅ Pass | 59 | ELIGIBLE |
| Scenario 5: International Remote — APAC | Accept | Accept | ✅ Pass | 81 | ELIGIBLE |
| Scenario 6: International Remote — US Only | Reject | Reject | ✅ Pass | N/A | COUNTRY_INELIGIBLE |
| Scenario 7: Senior Role — 5+ years | Reject | Reject | ✅ Pass | N/A | SENIORITY_MISMATCH |
| Scenario 8: Scam/MLM Listing | Reject | Reject | ✅ Pass | N/A | SCAM_PATTERN |


## Detailed Results

### Scenario 1: PH Remote Junior Software Developer
**Expected:** {"category":"PH","work_setup":"REMOTE","eligibility_status":"ELIGIBLE","scoreMin":55,"notRejected":true}
**Actual Status:** INGESTED
**Actual Job Data:** {"category":"PH","work_setup":"REMOTE","eligibility":"ELIGIBLE","score":59}
**Result:** ✅ PASS


### Scenario 2: PH Hybrid Web Developer in Metro Manila
**Expected:** {"category":"PH","work_setup":"HYBRID","eligibility_status":"ELIGIBLE","scoreMin":50,"notRejected":true}
**Actual Status:** INGESTED
**Actual Job Data:** {"category":"PH","work_setup":"HYBRID","eligibility":"ELIGIBLE","score":69}
**Result:** ✅ PASS


### Scenario 3: PH Onsite Technical Support
**Expected:** {"category":"PH","work_setup":"ONSITE","eligibility_status":"ELIGIBLE","scoreMin":45,"notRejected":true}
**Actual Status:** INGESTED
**Actual Job Data:** {"category":"PH","work_setup":"ONSITE","eligibility":"ELIGIBLE","score":65}
**Result:** ✅ PASS


### Scenario 4: International Remote — Worldwide
**Expected:** {"category":"INTERNATIONAL","work_setup":"REMOTE","eligibility_status":"ELIGIBLE","scoreMin":55,"notRejected":true}
**Actual Status:** INGESTED
**Actual Job Data:** {"category":"INTERNATIONAL","work_setup":"REMOTE","eligibility":"ELIGIBLE","score":59}
**Result:** ✅ PASS


### Scenario 5: International Remote — APAC
**Expected:** {"category":"INTERNATIONAL","work_setup":"REMOTE","eligibility_status":"ELIGIBLE","scoreMin":60,"notRejected":true}
**Actual Status:** INGESTED
**Actual Job Data:** {"category":"INTERNATIONAL","work_setup":"REMOTE","eligibility":"ELIGIBLE","score":81}
**Result:** ✅ PASS


### Scenario 6: International Remote — US Only
**Expected:** {"rejected":true,"rejectReason":"COUNTRY_INELIGIBLE"}
**Actual Status:** HARD_REJECTED
**Actual Job Data:** {"category":"INTERNATIONAL","work_setup":"REMOTE","eligibility":"INELIGIBLE","rejection_reasons":["COUNTRY_INELIGIBLE"]}
**Result:** ✅ PASS


### Scenario 7: Senior Role — 5+ years
**Expected:** {"rejected":true,"rejectReason":"SENIORITY_MISMATCH"}
**Actual Status:** HARD_REJECTED
**Actual Job Data:** {"category":"PH","work_setup":"HYBRID","eligibility":"ELIGIBLE","rejection_reasons":["SENIORITY_MISMATCH"]}
**Result:** ✅ PASS


### Scenario 8: Scam/MLM Listing
**Expected:** {"rejected":true,"rejectReason":"SCAM_PATTERN"}
**Actual Status:** HARD_REJECTED
**Actual Job Data:** {"category":"INTERNATIONAL","work_setup":"REMOTE","eligibility":"REQUIRES_REVIEW","rejection_reasons":["SCAM_PATTERN"]}
**Result:** ✅ PASS



## Fixes Applied
- Fixed checkEligibility call in packages/ingestion/src/pipeline.ts to correctly pass category and workSetup arguments.
- Modified IngestionResult type and pipeline.ts to return normalized_job to facilitate testing and validation.
