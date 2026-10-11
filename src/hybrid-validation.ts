import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { execFile } from 'child_process';
import * as path from 'path';

export const array = (value: any): any[] => value == null ? [] : Array.isArray(value) ? value : [value];
export function collectProjectPous(project: any): {pou:any;scope:string}[] {
    const found: {pou:any;scope:string}[] = [];
    function visit(value: any, scope: string) {
        if (!value || typeof value !== 'object') return;
        for (const key of Object.keys(value)) {
            if (key.startsWith('@_')) continue;
            for (const child of array(value[key])) {
                if (key === 'pou' && child && typeof child === 'object') found.push({pou:child,scope});
                else visit(child, ['resource','configuration'].includes(key) ? `${scope}/${key}:${child?.['@_name'] || '?'}` : scope);
            }
        }
    }
    visit(project, 'project');
    return found;
}
export function parsePlcopen(xml: string): any {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DTD/entity declarations are not supported');
    const valid = XMLValidator.validate(xml);
    if (valid !== true) throw new Error(`Malformed XML: ${valid.err.msg}`);
    const document = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false }).parse(xml);
    if (!Object.prototype.hasOwnProperty.call(document, 'project')) throw new Error('PLCopen project root is required');
    if (!document.project || typeof document.project !== 'object') document.project = {};
    // Namespace normalization removes xmlns; retain the original root namespace
    // for the import gate, including prefixed PLCopen documents.
    const raw = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false }).parse(xml);
    const rootKey = Object.keys(raw).find(key => key.split(':').pop() === 'project');
    if (rootKey) document.project['@_xmlns'] = raw[rootKey][rootKey.includes(':') ? '@_xmlns:' + rootKey.split(':')[0] : '@_xmlns'];
    return document.project;
}
export interface ExpectedVariable { name: string; type?: string; initialValue?: string; }
export function validateSemantic(xml: string, expectedPous: string[] = [], externalTypes: string[] = [], expectedVariables: Record<string, ExpectedVariable[]> = {}) {
    const issues: any[] = [], warnings: any[] = [];
    const issue = (code: string, location: string, message: string) => issues.push({ code, location, message });
    let project: any;
    try { project = parsePlcopen(xml); } catch (e: any) { return { gate: 'semantic', valid: false, issues: [{ code: 'XML_PARSE_ERROR', message: e.message }], warnings, runtimeVerified: false }; }
    const entries = collectProjectPous(project), pous = entries.map(entry => entry.pou), types = array(project.types?.dataTypes?.dataType);
    const known = new Set([...pous, ...types].map(n => String(n['@_name']).toLowerCase()));
    const names = new Set<string>();
    const scopedNames = new Set<string>();
    for (const {pou, scope} of entries) {
        const name = pou['@_name'];
        if (!name) issue('MISSING_POU_NAME', 'pou', 'POU requires a name');
        const key = String(name).toLowerCase();
        const scopedKey = scope.toLowerCase() + '/' + key;
        if (scopedNames.has(scopedKey)) issue('DUPLICATE_POU', scope + '/' + name, 'POU names are case-insensitively unique within the same application/resource');
        scopedNames.add(scopedKey);
        names.add(key);
        const vars = new Set<string>();
        const variableMap = new Map<string, any>();
        for (const group of Object.keys(pou.interface || {})) {
            for (const section of array(pou.interface[group])) for (const variable of array(section?.variable)) {
                const v = String(variable['@_name']).toLowerCase();
                if (!variable['@_name']) issue('MISSING_VARIABLE_NAME', name, 'Variable requires a name');
                if (vars.has(v)) issue('DUPLICATE_VARIABLE', name, `Duplicate variable ${v}`);
                vars.add(v);
                variableMap.set(v, variable);
            }
        }
        for (const [expectedPou, expected] of Object.entries(expectedVariables)) if (expectedPou.toLowerCase() === key) {
            for (const spec of expected) {
                const variable = variableMap.get(spec.name.toLowerCase());
                if (!variable) { issue('MISSING_EXPECTED_VARIABLE', name, `Variable omitted: ${spec.name}`); continue; }
                const type = variable.type?.derived?.['@_name'] || Object.keys(variable.type || {}).find(k => !k.startsWith('@_'));
                if (spec.type && String(type).toLowerCase() !== spec.type.toLowerCase()) issue('EXPECTED_VARIABLE_TYPE', name, `${spec.name}: expected ${spec.type}, got ${type}`);
                if (spec.initialValue !== undefined && variable.initialValue?.simpleValue?.['@_value'] !== spec.initialValue) issue('EXPECTED_INITIALIZER', name, `${spec.name}: initializer missing/changed`);
            }
        }
        const bodies = [pou.body, ...array(pou.actions?.action).map(a => a.body), ...array(pou.transitions?.transition).map(t => t.body)].filter(Boolean);
        if (!pou.body) issue('MISSING_BODY', name, 'POU body is missing');
        for (const [index, body] of bodies.entries()) {
            const languages = ['ST', 'IL', 'LD', 'FBD', 'SFC'].filter(l => body[l] !== undefined);
            const location = `${name}/body[${index}]`;
            if (languages.length !== 1) { issue('BODY_LANGUAGE', location, 'Exactly one supported language body is required'); continue; }
            const language = languages[0];
            if (language === 'ST' || language === 'IL') continue;
            const graph = body[language], nodes: any[] = [];
            for (const tag of Object.keys(graph || {})) {
                if (tag === 'addData' || tag.startsWith('@_')) continue;
                for (const node of array(graph[tag])) if (node && typeof node === 'object') nodes.push({ tag, node });
            }
            const ids = new Set<string>();
            for (const { tag, node } of nodes) {
                const id = node['@_localId'];
                if (id === undefined || !/^\d+$/.test(id) || BigInt(id) > BigInt('18446744073709551615')) issue('LOCAL_ID', location, `${tag} requires an unsigned 64-bit localId`);
                else { const canonical = BigInt(id).toString(); if (ids.has(canonical)) issue('DUPLICATE_LOCAL_ID', location, `Duplicate localId ${id}`); ids.add(canonical); }
                if (!node.position || !['x', 'y'].every(k => node.position[`@_${k}`] !== undefined && Number.isFinite(Number(node.position[`@_${k}`])))) issue('POSITION', location, `${tag} requires finite x/y coordinates`);
            }
            function walk(value: any) {
                if (!value || typeof value !== 'object') return;
                if (value['@_refLocalId'] !== undefined) {
                    const ref = value['@_refLocalId'];
                    if (!/^\d+$/.test(ref) || !ids.has(BigInt(ref).toString())) issue('DANGLING_CONNECTION', location, `Unknown refLocalId ${ref}`);
                }
                for (const k of Object.keys(value)) if (k !== 'addData') for (const child of array(value[k])) walk(child);
            }
            walk(graph);
            if (language === 'SFC' && !nodes.some(n => n.tag === 'step' && ['true', '1'].includes(n.node['@_initialStep']))) issue('SFC_INITIAL_STEP', location, 'SFC requires an initial step');
        }
    }
    for (const expected of expectedPous) if (!names.has(expected.toLowerCase())) issue('MISSING_EXPECTED_POU', expected, 'Expected POU was omitted');
    for (const expected of Object.keys(expectedVariables)) if (!names.has(expected.toLowerCase())) issue('MISSING_EXPECTED_POU', expected, 'POU from interface manifest was omitted');
    function derived(value: any) {
        if (!value || typeof value !== 'object') return;
        for (const d of array(value.derived)) {
            const name = d['@_name'];
            if (!known.has(String(name).toLowerCase()) && !externalTypes.some(t => t.toLowerCase() === String(name).toLowerCase())) warnings.push({ code: 'EXTERNAL_TYPE', name, message: 'Resolve against target project/library; not an error for a partial project export' });
        }
        for (const k of Object.keys(value)) if (k !== 'derived' && k !== 'addData') for (const child of array(value[k])) derived(child);
    }
    derived(project);
    return { gate: 'semantic', valid: issues.length === 0, issues, warnings, counts: { pous: pous.length, standardPous: array(project.types?.pous?.pou).length, embeddedPous: pous.length - array(project.types?.pous?.pou).length, dataTypes: types.length }, runtimeVerified: false, coverage: 'Standard and CODESYS embedded POUs/interface/graph integrity; target types, tasks, wiring and runtime behavior require CODESYS checks', next: issues.length ? 'Repair XML and repeat validation' : 'Import into a backed-up working copy, inspect imported objects/task bindings, then compile' };
}
export function validateXsd(xmlPath: string, xsdPath: string): Promise<any> {
    return new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '..', 'scripts', 'validate-xsd.ps1'), '-XmlPath', xmlPath, '-XsdPath', xsdPath], { windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) return reject(new Error(`XSD validator unavailable/failed: ${stderr || error.message}`));
        try { resolve(JSON.parse(stdout.replace(/^\uFEFF/, '').trim())); } catch { reject(new Error(`Invalid XSD validator response: ${stdout}`)); }
    }));
}
