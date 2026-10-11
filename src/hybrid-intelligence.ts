import { tokenizeIdentifiers } from './vendor/st-lexer';
export interface SourceObject { objectPath: string; declaration: string; implementation: string; }
export function findReferences(objects: SourceObject[], symbol: string, limit = 100, scope = '') {
    const hits: any[] = []; let total = 0;
    for (const object of objects) {
        if (scope && object.objectPath !== scope && !object.objectPath.startsWith(scope + '/')) continue;
        for (const section of ['declaration', 'implementation'] as const) {
            for (const token of tokenizeIdentifiers(object[section] || '')) if (token.value.toLowerCase() === symbol.toLowerCase()) {
                total++;
                if (hits.length < limit) hits.push({ objectPath: object.objectPath, section, line: token.start.line, column: token.start.column, qualifier: token.qualifier, kind: 'textualCandidate' });
            }
        }
    }
    return { matches: hits, total, truncated: total > limit, compilerResolved: false, coverage: 'Textual declarations/implementations only; excludes graphical/HMI/task bindings and library internals' };
}
export function getSymbols(objects: SourceObject[], limit = 100, scope = '') {
    const symbols: any[] = []; let total = 0;
    for (const object of objects) {
        if (scope && object.objectPath !== scope && !object.objectPath.startsWith(scope + '/')) continue;
        const text = object.declaration || '', tokens = tokenizeIdentifiers(text);
        // Declarations must begin with a lexer token, excluding commented/string content.
        let inVars = false;
        for (const [index, line] of text.split(/\r?\n/).entries()) {
            const rowTokens = tokens.filter(t => t.start.line === index + 1);
            if (rowTokens.some(t => /^VAR(?:_|$)/i.test(t.value))) inVars = true;
            if (rowTokens.some(t => /^END_VAR$/i.test(t.value))) { inVars = false; continue; }
            if (!inVars || !rowTokens.length) continue;
            const match = /^\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)(?:\s+AT\s+[^:]+)?\s*:\s*([^;]+);/.exec(line);
            if (!match || rowTokens[0].value.toLowerCase() !== match[1].split(',')[0].trim().toLowerCase()) continue;
            for (const name of match[1].split(',').map(s => s.trim())) {
                total++;
                if (symbols.length < limit) symbols.push({ name, objectPath: object.objectPath, typeText: match[2].split(':=')[0].trim(), line: index + 1, section: 'declaration' });
            }
        }
    }
    return { symbols, total, truncated: total > limit, compilerResolved: false, coverage: 'Simple single-line VAR declarations; multiline declarations, enum members and inherited/library symbols are not indexed' };
}
export const collectSourcesScript = `
objects = []
failures = []
def collect(obj, prefix):
    for child in obj.get_children(False):
        object_path = prefix + '/' + child.get_name() if prefix else child.get_name()
        declaration, implementation = '', ''
        for attribute, section in [('textual_declaration', 'declaration'), ('textual_implementation', 'implementation')]:
            try:
                text_object = getattr(child, attribute, None)
                value = text_object.text if text_object else ''
                if section == 'declaration': declaration = value
                else: implementation = value
            except Exception as error: failures.append({'objectPath': object_path, 'section': section, 'error': str(error)})
        if declaration or implementation: objects.append({'objectPath': object_path, 'declaration': declaration, 'implementation': implementation})
        collect(child, object_path)
collect(project, '')
result = {'objects': objects, 'readFailures': failures}
`;
