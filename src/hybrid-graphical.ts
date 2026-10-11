import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { randomUUID } from 'crypto';
import { array, parsePlcopen, validateSemantic } from './hybrid-validation';

/** Adapt native graphical templates instead of flattening vendor data into ST. */
export function prepareGraphicalXml(xml: string, language: 'LD' | 'FBD' | 'SFC', pouName: string, bindings: Record<string, string> = {}) {
    const project = parsePlcopen(xml);
    const pous = array(project.types?.pous?.pou);
    if (pous.length !== 1 || pous[0].body?.[language] === undefined) throw new Error(`Template must contain exactly one ${language} POU; export only the intended POU`);
    const oldName = pous[0]['@_name'];
    const options = { preserveOrder: true, ignoreAttributes: false, commentPropName: '#comment', trimValues: false, parseTagValue: false, parseAttributeValue: false };
    const document: any = new XMLParser(options).parse(xml);
    const ids = new Map<string, string>();
    const changedBindings = new Set<string>();
    const local = (name: string) => name.split(':').pop();
    function visit(nodes: any[], parent = '') {
        for (const item of nodes) {
            const attrs = item[':@'];
            if (attrs) {
                if (parent === 'pous') {
                    if (attrs['@_name'] === oldName) attrs['@_name'] = pouName;
                }
                if (attrs['@_Name'] === oldName && attrs['@_ObjectId']) attrs['@_Name'] = pouName;
                for (const key of Object.keys(attrs)) if (local(key) === '@_ObjectId') {
                    const id = attrs[key]; if (!ids.has(id)) ids.set(id, randomUUID()); attrs[key] = ids.get(id);
                }
            }
            for (const tag of Object.keys(item)) {
                if (tag === ':@') continue;
                if (tag === '#text') {
                    const text = String(item[tag]);
                    if (parent === 'ObjectId') { if (!ids.has(text)) ids.set(text, randomUUID()); item[tag] = ids.get(text); }
                    if ((parent === 'variable' || parent === 'expression') && Object.prototype.hasOwnProperty.call(bindings, text)) { item[tag] = bindings[text]; changedBindings.add(text); }
                    if (parent === 'xhtml') item[tag] = text.replace(new RegExp(`^(PROGRAM|FUNCTION_BLOCK|FUNCTION)\\s+${oldName}\\b`, 'i'), `$1 ${pouName}`);
                } else if (Array.isArray(item[tag])) visit(item[tag], local(tag));
            }
        }
    }
    visit(document);
    for (const key of Object.keys(bindings)) if (!changedBindings.has(key)) throw new Error(`Binding expression not found in template: ${key}`);
    const output = new XMLBuilder({ ...options, format: false }).build(document);
    const report = validateSemantic(output, [pouName]);
    if (!report.valid) throw new Error(`Prepared graph is invalid: ${JSON.stringify(report.issues)}`);
    return { xml: output, report, oldName, pouName, language, changedBindings: [...changedBindings] };
}
