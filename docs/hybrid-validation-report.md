# Validation report — 2026-10-11

Branch: `hybrid-v0.1`. All changes and checks were performed locally.

## Passed

- `npm run build` / TypeScript compilation after coherent steps.
- `npm test`: **18 passed, 0 failed, 0 skipped**. Covers graph IDs/wires,
  embedded CODESYS POUs, interface manifests, XML/DTD failures, .NET XSD valid /
  invalid / undeclared root / lax extension cases, diagnostic envelopes and status,
  comment/string-aware reference candidates, native-template metadata/ID changes,
  bridge session/project/timeout behavior and a real MCP stdio handshake.
- MCP smoke check: existing core/native tool registrations and project/POU resource
  templates retained; new tools registered; routing recommendations reference
  available tools; capability response marks new runtime integrations unverified;
  disconnected HMI mutation rejects before queue submission.
- `npm pack --dry-run`: builds and includes compiled hybrid modules, XSD runner,
  workflow documentation and both retained MIT license notices.
- `git diff --check`: no whitespace errors.

## Read-only checks against the user's existing files

These inspect XML offline and do not execute or modify a CODESYS project:

| File | Check | Result |
| --- | --- | --- |
| `C:/Users/DENISA/Codex_Demo_XML/Codex_LD_Demo_v2.xml` | Semantic; local matching TC6 0200 XSD; template adaptation | Pass; one POU; allowed vendor warnings |
| `C:/Users/DENISA/Codex_Demo_XML/Codex_FBD_Demo_v2.xml` | Semantic; local `tc6_xml_v201.xsd`; template adaptation | Pass; one POU; allowed CallType vendor warning |
| `C:/Users/DENISA/Tre_Cylindrar_Uppgift_1_3/SFC_reference.xml` | Semantic; local matching TC6 0200 XSD; template adaptation | Pass; one POU; allowed vendor warnings |
| `C:/Users/DENISA/Tre_Cylindrar_Uppgift_1_3/Tre_Cylindrar_Final.xml` | Project-based semantic inspection | Pass; two embedded POUs |
| `C:/Users/DENISA/HMI_Tre_Cylindrar_1_1_3/HMI_Tre_Cylindrar_1_1_3.xml` | Project-based semantic inspection | Pass; three embedded POUs |

Local TC6 0200 schema used for these read-only checks:
`C:/CODESYS_AI/festo-codesys-mcp/python/lib/plcopen_validation/data/tc6_xml_v200_patched.xsd`.
It was read locally, not copied into this package. Vendor warnings are bounded in
tool output with total counts retained.

## Failures encountered and resolved

- The original `npm test` was an intentional failing placeholder. Replaced it
  with the build plus real Node test suite.
- Adding the interface manifest exposed a TypeScript/Zod inferred optional-field
  mismatch in the repository's non-strict TypeScript configuration. Corrected
  the validated input type; final build/tests pass.
- .NET reported lax CODESYS vendor payloads as warnings; the first validator
  treated all events as blocking. Separated warnings/errors, retained undeclared
  root rejection and added regression checks.
- Initial standard-only semantic traversal saw empty `<types><pous/>` in full
  CODESYS exports while actual POUs were embedded under vendor resource data.
  Extended traversal, applied duplicate-name checks per resource/application and
  added a regression case. Actual embedded POU counts are shown above.

## Not runtime-verified

The existing script bridge returned `connected: false`. No new packaged tool was
executed inside CODESYS V3.5 SP22 Patch 4. Previously user-reported native/core
verification remains prior evidence, not a claim that these new wrappers passed.

The exact remaining local checks are listed in
[hybrid-v0.1.md](hybrid-v0.1.md#local-checks-still-required-codesys-v35-sp22-patch-4):
structured clean/error/warning builds, project symbol/reference scans, each
LD/FBD/SFC prepared import and task binding, bridge target/timeout controls,
HMI creation/readback/events/navigation, automatic native backup restoration,
and a Tre cylindrar end-to-end simulation/regression check.
