param([Parameter(Mandatory=$true)][string]$XmlPath, [Parameter(Mandatory=$true)][string]$XsdPath)
$ErrorActionPreference = 'Stop'
$issues = [System.Collections.Generic.List[object]]::new()
try {
    $settings = [System.Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $schemaSettings = [System.Xml.XmlReaderSettings]::new()
    $schemaSettings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $schemaSettings.XmlResolver = $null
    $schemaReader = [System.Xml.XmlReader]::Create($XsdPath, $schemaSettings)
    try { $schema = [System.Xml.Schema.XmlSchema]::Read($schemaReader, $null) }
    finally { $schemaReader.Dispose() }
    $settings.Schemas.XmlResolver = $null
    [void]$settings.Schemas.Add($schema)
    $settings.Schemas.Compile()
    $settings.ValidationType = [System.Xml.ValidationType]::Schema
    $settings.ValidationFlags = [System.Xml.Schema.XmlSchemaValidationFlags]::ReportValidationWarnings
    $settings.add_ValidationEventHandler({
        param($sender, $event)
        $issues.Add(@{severity=$event.Severity.ToString().ToLowerInvariant(); code='XSD_VIOLATION'; message=$event.Message; line=$event.Exception.LineNumber; column=$event.Exception.LinePosition})
    })
    $reader = [System.Xml.XmlReader]::Create($XmlPath, $settings)
    try { while ($reader.Read()) {} } finally { $reader.Dispose() }
    @{gate='xsd'; valid=($issues.Count -eq 0); issues=@($issues.ToArray()); schema=$XsdPath; runtimeVerified=$false} | ConvertTo-Json -Depth 8 -Compress
} catch {
    @{gate='xsd'; valid=$false; issues=@(@{code='XSD_EXECUTION_ERROR'; message=$_.Exception.Message}); runtimeVerified=$false} | ConvertTo-Json -Depth 8 -Compress
}
