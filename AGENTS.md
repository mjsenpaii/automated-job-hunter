# AI Agent Operating Instructions

Any AI agent working in this repository MUST adhere to the following instructions:

1. **Orientation**: Read `NEXT_ACTIONS.md` first, then `PROJECT_STATUS.md` to understand the current context.
2. **Documentation**: Read the relevant `docs/` files before making any architectural or feature changes.
3. **Immutability of Source Truth**: NEVER overwrite `CV_MJ.docx`. It is a primary source of truth.
4. **No Fabrication**: NEVER fabricate candidate information. All facts must come from verified sources.
5. **Exclusions**: NEVER include DotOrbit capstone/academic ghostwriting work.
6. **Data Privacy**: NEVER commit private data (`*.private.json`, `.env`, generated resumes, logs).
7. **Session Handoff**: Maintain `PROJECT_STATUS.md` and `NEXT_ACTIONS.md` after every work session.
8. **Traceability**: All resume claims must link back to verified evidence.
9. **Code Quality**: Use TypeScript strict mode and Zod validation for all external data.
10. **Testing**: Tests must accompany new classification, scoring, and resume generation behavior.
