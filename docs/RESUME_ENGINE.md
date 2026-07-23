# Resume Engine Design

## NO FABRICATION RULE
**Under no circumstances should the resume engine fabricate or hallucinate experience, skills, or achievements.** All output must trace back to verified evidence.

## Source Hierarchy
1. **Profile**: Foundational verified candidate data.
2. **Evidence**: Portfolios, repositories, and project docs.
3. **Master CV**: The comprehensive factual baseline (`CV_MJ.docx`).
4. **Job Description**: Used ONLY for emphasizing relevant facts and selecting keywords, NOT for creating new facts.

## Resume Profiles
Start by supporting two core profiles:
1. Software Developer
2. Technical Support / IT

## Per-Job Tailoring Algorithm
- Ingest job description and extract required skills/keywords.
- Match against the candidate's verified skills (`skills.verified.json`).
- Select relevant experience and projects (`experience.verified.json`, `projects.verified.json`).
- Prioritize and reorder bullet points to match job requirements without altering facts.

## Quality Gates
Before generating a final PDF/Doc, the resume must pass:
- **Fact Check**: All claims exist in verified sources.
- **Keyword Match**: Necessary keywords are included if factually applicable.
- **Seniority**: Tone matches candidate's actual experience level.
- **Consistency**: Dates, roles, and facts do not conflict.
- **ATS Friendly**: Formatting avoids complex tables/columns.
- **Language**: Professional tone, no spelling/grammar errors.
- **Visual**: Aesthetically pleasing layout.
- **Diff Check**: Review changes made from the master template.

## Output File Structure
- Tailored resumes are saved to `resumes/generated/` and mapped to specific applications.
- Formats: PDF and plain text for ATS.
