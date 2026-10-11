import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as path from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import { bridgeStatus, projectGuard, pythonValue, runBridge } from './hybrid-bridge';
import { prepareGraphicalXml } from './hybrid-graphical';
import { array, parsePlcopen, validateSemantic, validateXsd } from './hybrid-validation';
import { reply } from './hybrid-tools';

export function registerIdeTools(server: McpServer, workspace: string, bridgeDir: string) {
    const resolve = (file: string) => path.resolve(workspace, file);
    const identifier = z.string().regex(/^[A-Za-z_]\w*$/);
    const target = { projectFilePath: z.string(), parentPath: z.string().describe('Exact slash-separated application/folder path from the project root') };
    const execute = async (project: string, script: string) => runBridge(bridgeDir, resolve(project), script);
    const backupPath = async () => { const folder = path.join(workspace, 'hybrid-backups'); await mkdir(folder, {recursive:true}); return path.join(folder, `${Date.now()}-${randomUUID()}.export`); };
    const backup = (destination: string) => `backup_path = ${pythonValue(destination)}\nproject.export_native(objects=project.get_children(False), destination=backup_path, recursive=True, one_file_per_subtree=False)\nif not os.path.isfile(backup_path) or os.path.getsize(backup_path) == 0: raise RuntimeError('Native backup is missing/empty; mutation aborted')\n`;

    server.tool('hybrid_bridge_status', 'Read the existing IDE scripting bridge connection and project. No launch or project changes.', {}, async () => reply(await bridgeStatus(bridgeDir)));
    server.tool('prepare_graphical_xml', 'Adapt a single native LD/FBD/SFC POU template, preserving comments/vendor metadata, refreshing object IDs and replacing exact graphical variable/expression bindings. Does not convert ST to graphics. Validate XSD before import.', {
        templatePath: z.string(), outputPath: z.string(), language: z.enum(['LD','FBD','SFC']), pouName: identifier, bindings: z.record(z.string()).default({})
    }, async ({ templatePath, outputPath, language, pouName, bindings }) => {
        try {
            const data = prepareGraphicalXml(await readFile(resolve(templatePath), 'utf8'), language, pouName, bindings);
            await writeFile(resolve(outputPath), data.xml, {flag:'wx'});
            return reply({ filePath:resolve(outputPath), language, pouName, changedBindings:data.changedBindings, runtimeVerified:false, next:'validate_plcopen_xml -> validate_plcopen_xsd -> validate_plcopen_semantic -> import_graphical_xml into a working copy' });
        } catch (e:any) { return reply({error:e.message},true); }
    });
    server.tool('import_graphical_xml', 'Validate schema/graph and import LD/FBD/SFC POUs via the existing IDE bridge. Exports native backup first. Rejects existing POU names; does not delete/replace POUs or change task calls.', {
        ...target, filePath:z.string(), xsdPath:z.string(), expectedPous:z.array(identifier).min(1)
    }, async ({projectFilePath,parentPath,filePath,xsdPath,expectedPous}) => {
        let nativeBackup: string;
        try {
            const xmlPath = resolve(filePath), xml = await readFile(xmlPath,'utf8');
            const project = parsePlcopen(xml), pous = array(project.types?.pous?.pou);
            if (!['http://www.plcopen.org/xml/tc6_0200','http://www.plcopen.org/xml/tc6_0201'].includes(project['@_xmlns'])) throw new Error('PLCopen namespace 0200/0201 is required');
            if (!pous.length || pous.some(p=>!['LD','FBD','SFC'].some(l=>p.body?.[l] !== undefined))) throw new Error('Every imported POU must have a graphical body');
            if (pous.length !== expectedPous.length || pous.some(p=>!expectedPous.includes(p['@_name']))) throw new Error('expectedPous must exactly match all XML POUs');
            if (array(project.types?.dataTypes?.dataType).length || array(project.instances?.configurations?.configuration).length) throw new Error('Import only POU templates; use native import for device/task/project transfers');
            // Stage exactly the bytes validated: protects against source file changes while queued.
            const staging = path.join(workspace,'hybrid-staging'); await mkdir(staging,{recursive:true});
            const stagedPath = path.join(staging,randomUUID()+'.xml'); await writeFile(stagedPath,xml,{flag:'wx'});
            const semantic = validateSemantic(xml,expectedPous), xsd = await validateXsd(stagedPath,resolve(xsdPath));
            if (!semantic.valid || !xsd.valid) return reply({semantic,xsd,next:'Repair XML before import'},true);
            nativeBackup = await backupPath();
            const script = projectGuard(resolve(projectFilePath),parentPath) + `names = ${pythonValue(expectedPous)}\nfor name in names:\n    if any(obj.get_name().lower() == name.lower() for obj in parent.get_children(True)): raise RuntimeError('POU name already exists: ' + name)\n` + backup(nativeBackup) + `parent.import_xml(dataOrPath=${pythonValue(stagedPath)}, import_folder_structure=False)\nfor name in names:\n    found = [obj for obj in parent.get_children(False) if obj.get_name() == name]\n    if len(found) != 1: raise RuntimeError('Import did not create exactly the requested direct POU: ' + name)\nproject.save()\nresult = {'imported': names, 'nativeBackup': ${pythonValue(nativeBackup)}, 'saved': True, 'taskBindingsChanged': False}\n`;
            return reply({...await execute(projectFilePath,script),runtimeVerified:false,next:'Inspect imported languages, declarations and task bindings, compile once; verify actual PLC behavior locally'});
        } catch(e:any) { return reply({error:e.message,nativeBackup,next:'Inspect project and any native backup before any retry'},true); }
    });

    const element = z.object({
        kind:z.enum(['Rectangle','RoundedRectangle','Ellipse','Button']), x:z.number().finite(), y:z.number().finite(), width:z.number().positive().finite(), height:z.number().positive().finite(), text:z.string().default(''),
        textVariable:z.string().optional(), activeVariable:z.string().optional(), tapVariable:z.string().optional(), writeVariable:z.boolean().optional(), navigationTarget:identifier.optional()
    }).refine(spec => !spec.writeVariable || !!spec.textVariable, {message:'writeVariable requires textVariable'});
    server.tool('create_visualization', 'Create a new HMI page through the existing SP22 IDE visualization API with positions, text, variable bindings, tap/edit/navigation actions. Native backup first; existing pages are rejected. No automatic WebVisu setup.', {
        ...target, name:identifier, elements:z.array(element).min(1).max(500)
    }, async ({projectFilePath,parentPath,name,elements}) => {
        let nativeBackup: string;
        try {
            nativeBackup = await backupPath();
            const script = projectGuard(resolve(projectFilePath),parentPath) + `import System\nname = ${pythonValue(name)}\nelements = ${pythonValue(elements)}\nif parent.find(name, True): raise RuntimeError('Visualization name already exists')\nassemblies = [a for a in System.AppDomain.CurrentDomain.GetAssemblies() if a.GetName().Name == 'ScriptDriverVisualization.plugin']\nif len(assemblies) != 1: raise RuntimeError('Visualization scripting plugin unavailable')\nasm = assemblies[0]\ndef enum(name, value):\n    return System.Enum.Parse(asm.GetType('_3S.CoDeSys.ScriptDriverVisualization.VisualObject.' + name), value)\nfor spec in elements:\n    enum('VisualElementType', spec['kind'])\n    if spec.get('navigationTarget') and len(parent.find(spec['navigationTarget'], True)) != 1: raise RuntimeError('Navigation target missing/ambiguous')\n` + backup(nativeBackup) + `parent.create_visualobject(name)\nfound = [obj for obj in parent.get_children(False) if obj.get_name() == name]\nif len(found) != 1: raise RuntimeError('Created page is missing/ambiguous')\nv = found[0]\nv.begin_modify()\ntry:\n    for spec in elements:\n        e = v.visual_element_list.add_element(enum('VisualElementType', spec['kind']))\n        for key in ('X','Y','Width','Height'): e.set_property('Position.' + key, spec[key.lower()])\n        e.set_property('Texts.Text', spec['text'])\n        if spec.get('textVariable'): e.set_property('Text variables.Text variable', spec['textVariable'])\n        if spec.get('activeVariable'): e.set_property('Color variables.Toggle color', spec['activeVariable'])\n        if spec.get('tapVariable'): e.set_property('Input configuration.Tap.Variable', spec['tapVariable'])\n        if spec.get('writeVariable'): e.add_input_action(v.input_action_factory.create_write_variable_default(), enum('InputActionEventType','OnMouseDown'))\n        if spec.get('navigationTarget'): e.add_input_action(v.input_action_factory.create_change_shown_visualization(enum('ChangeShownVisualizationType','Assignment'), spec['navigationTarget']), enum('InputActionEventType','OnMouseDown'))\nfinally: v.end_modify()\nproject.save()\nresult = {'page': name, 'elementCount': len(v.visual_element_list), 'saved': True, 'nativeBackup': ${pythonValue(nativeBackup)}}\n`;
            return reply({...await execute(projectFilePath,script),runtimeVerified:false,next:'Compile, verify HMI variable types/events/navigation in CODESYS; reuse existing WebVisu/Visualization Manager'});
        } catch(e:any) { return reply({error:e.message,nativeBackup,next:'Inspect project and any native backup before any retry'},true); }
    });
    server.tool('read_visualization', 'Read page positions/text/variable bindings from the existing IDE. Does not export a complete HMI or resolve event configuration.', {...target,name:identifier},async ({projectFilePath,parentPath,name})=>{
        try {
            const script = projectGuard(resolve(projectFilePath),parentPath)+`matches = [obj for obj in parent.get_children(False) if obj.get_name() == ${pythonValue(name)}]\nif len(matches) != 1: raise RuntimeError('Page missing/ambiguous')\nv = matches[0]\nproperties = ['Position.X','Position.Y','Position.Width','Position.Height','Texts.Text','Text variables.Text variable','Color variables.Toggle color','Input configuration.Tap.Variable']\nitems = []\nfor element in v.visual_element_list:\n    item = {}\n    for key in properties:\n        try:\n            value = element.get_property(key)\n            item[key] = str(value) if value is not None else None\n        except Exception as error: item[key] = {'unavailable': str(error)}\n    items.append(item)\nresult = {'page': ${pythonValue(name)}, 'elements': items}\n`;
            return reply({...await execute(projectFilePath,script),runtimeVerified:false,coverage:'Basic page properties; native export preserves full event/HMI data'});
        } catch(e:any) { return reply({error:e.message},true); }
    });
}
