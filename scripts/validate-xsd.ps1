param([Parameter(Mandatory=$true)][string]$XmlPath, [Parameter(Mandatory=$true)][string]$XsdPath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
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
    $rootChecked = $false
    try {
        while ($reader.Read()) {
            if (-not $rootChecked -and $reader.NodeType -eq [System.Xml.XmlNodeType]::Element) {
                $rootChecked = $true
                $rootName = [System.Xml.XmlQualifiedName]::new($reader.LocalName, $reader.NamespaceURI)
                if (-not $settings.Schemas.GlobalElements.Contains($rootName)) {
                    $issues.Add(@{severity='error';code='XSD_ROOT_UNDECLARED';message='Root element/namespace is not declared in supplied schema'})
                }
            }
        }
    } finally { $reader.Dispose() }
    $errors = @($issues.ToArray() | Where-Object { $_.severity -eq 'error' })
    $warnings = @($issues.ToArray() | Where-Object { $_.severity -ne 'error' })
    @{gate='xsd'; valid=($rootChecked -and $errors.Count -eq 0); issues=@($errors | Select-Object -First 50); warnings=@($warnings | Select-Object -First 50); totalErrors=$errors.Count; totalWarnings=$warnings.Count; schema=$XsdPath; runtimeVerified=$false} | ConvertTo-Json -Depth 8 -Compress
} catch {
    @{gate='xsd'; valid=$false; issues=@(@{code='XSD_EXECUTION_ERROR'; message=$_.Exception.Message}); runtimeVerified=$false} | ConvertTo-Json -Depth 8 -Compress
}
