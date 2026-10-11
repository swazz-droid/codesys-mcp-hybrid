# Attribution

The core server and CODESYS interop originate from Johannes Pettersson's
[codesys-mcp-toolkit](https://github.com/johannesPettersson80/codesys-mcp-toolkit).
Its MIT license and original copyright are retained in LICENSE and
third-party/Johannes-MIT-LICENSE.txt.

The existing fast PLCopen gate and the identifier lexer in src/vendor/st-lexer.ts
are adapted/copied from the local FestoCodesysMCP reference repository
(C:/CODESYS_AI/festo-codesys-mcp). The original MIT license, including
Copyright (c) 2026 E3 Engenharia Industrial — Eduardo Franceschetti, is retained
in third-party/Festo-MIT-LICENSE.txt. The lexer is used without changing its logic.

Graphical workflow and visualization scripting API patterns are based on the
user's local working scripts (build_graphical_helpers.py, create_visualizations.py,
create_native_ld.py and fix_fbd.py). Original user projects/scripts remain untouched.
No vendor manuals, native project exports, or third-party XSD schemas are bundled.
Supply a locally obtained PLCopen schema with matching XML namespace.
