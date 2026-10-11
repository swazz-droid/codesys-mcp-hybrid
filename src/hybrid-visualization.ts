import { pythonValue } from './hybrid-bridge';

export const visualProperties = ['Position.X','Position.Y','Position.Width','Position.Height','Texts.Text','Text variables.Text variable','Color variables.Toggle color','Input configuration.Tap.Variable'] as const;
export const visualPage = (name: string) => `matches = [obj for obj in parent.get_children(False) if obj.get_name() == ${pythonValue(name)}]
if len(matches) != 1: raise RuntimeError('Page missing/ambiguous')
v = matches[0]
elements = list(v.visual_element_list)
def read_property(element, key):
    value = element.get_property(key)
    return str(value) if value is not None else None
`;

export function readVisualScript(name: string, options: any) {
    return visualPage(name) + `options = ${pythonValue(options)}
selected = []
for index, element in enumerate(elements):
    if options.get('elementIndexes') is not None and index not in options['elementIndexes']: continue
    if options.get('textContains') is not None:
        text = read_property(element, 'Texts.Text') or ''
        if options['textContains'].lower() not in text.lower(): continue
    if options.get('variable') is not None:
        if not any(read_property(element, key) == options['variable'] for key in ['Text variables.Text variable','Color variables.Toggle color','Input configuration.Tap.Variable']): continue
    selected.append(index)
items = []
for index in selected[options['offset']:options['offset'] + options['maxResults']]:
    item = {'elementIndex': index}
    for key in options['properties']:
        try: item[key] = read_property(elements[index], key)
        except Exception as error: item[key] = {'unavailable': str(error)}
    items.append(item)
result = {'page': ${pythonValue(name)}, 'elements': items, 'elementCount': len(elements), 'matchedCount': len(selected), 'offset': options['offset'], 'truncated': options['offset'] + len(items) < len(selected)}
`;
}

export function updateVisualScript(name: string, updates: any[], backup: string, backupScript: string) {
    return visualPage(name) + `updates = ${pythonValue(updates)}
# Check every element before backup or mutation: index alone is not identity.
for change in updates:
    index = change['elementIndex']
    if index >= len(elements): raise RuntimeError('Element index out of range')
    for key, expected in change['expected'].items():
        if read_property(elements[index], key) != expected: raise RuntimeError('Element changed; read it again before updating: index ' + str(index) + ', property ' + key)
` + backupScript + `v.begin_modify()
try:
    for change in updates:
        element = elements[change['elementIndex']]
        for key, value in change['set'].items(): element.set_property(key, value)
finally: v.end_modify()
project.save()
v = [obj for obj in parent.get_children(False) if obj.get_name() == ${pythonValue(name)}][0]
elements = list(v.visual_element_list)
changed = []
for change in updates:
    values = {key: read_property(elements[change['elementIndex']], key) for key in change['set']}
    for key, expected in change['set'].items():
        actual = values[key]
        equal = float(actual) == float(expected) if key.startswith('Position.') else actual == expected
        if not equal: raise RuntimeError('Saved property differs from requested value; inspect native backup: ' + key)
    changed.append({'elementIndex': change['elementIndex'], 'properties': values})
result = {'page': ${pythonValue(name)}, 'updated': changed, 'nativeBackup': ${pythonValue(backup)}, 'saved': True, 'elementCount': len(elements)}
`;
}
