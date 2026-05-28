# PowerShell script to test Supabase Edge Function
# Usage: .\test-edge-function.ps1

$serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzaGdhaXFhcGdlc3BwY3Zmbnd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk0NjAyNCwiZXhwIjoyMDk0NTIyMDI0fQ.LfCsKBT_6HyCLtOxmNZ11OE2Cj1Mi43nR5O00-QtduA"
$url = "https://zshgaiqapgesppcvfnwz.supabase.co/functions/v1/generate-daily-tasks"

Write-Host "Testing Edge Function: generate-daily-tasks" -ForegroundColor Cyan
Write-Host "URL: $url`n" -ForegroundColor Gray

try {
    $headers = @{
        "Authorization" = "Bearer $serviceRoleKey"
        "Content-Type" = "application/json"
    }
    
    $response = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -UseBasicParsing
    
    Write-Host "Success!" -ForegroundColor Green
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "`nResponse:" -ForegroundColor Yellow
    Write-Host $response.Content
    
} catch {
    Write-Host "Error!" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "`nError Details:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "`nResponse Body:" -ForegroundColor Yellow
        Write-Host $responseBody
    }
}

Write-Host "`n=== Test with specific user ID ===" -ForegroundColor Cyan
Write-Host "You can test with a specific user by modifying this script:" -ForegroundColor Gray
Write-Host 'Add before the Invoke-WebRequest line:' -ForegroundColor Gray
Write-Host '$body = @{ user_id = "c44254b9-6eee-4d28-80b9-adf71f578c8f" } | ConvertTo-Json' -ForegroundColor DarkGray
Write-Host 'Then add -Body $body to the Invoke-WebRequest' -ForegroundColor DarkGray
