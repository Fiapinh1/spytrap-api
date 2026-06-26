
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = ".\backups\backup-20260521-094452.zip"
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$entry = $zip.Entries | Where-Object { $_.FullName -eq "index.html" }
[System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, ".\index-original.html", $true)
$zip.Dispose()
Write-Host "Extracted successfully!"
