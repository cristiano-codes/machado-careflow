#requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

$remote = "origin"
$branch = "main"
$deployMessage = "deploy: update $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$redeployMessage = "chore: redeploy railway"

Write-Host "Repository: $PSScriptRoot"
Write-Host "Remote: $remote | Branch: $branch"

# Stage all changes
git add --all
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao executar 'git add --all'."
}

# If nothing is staged, create empty commit for redeploy
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "Sem mudancas detectadas. Criando commit vazio para redeploy..."
  git commit --allow-empty -m $redeployMessage
} else {
  Write-Host "Mudancas detectadas. Criando commit com timestamp..."
  git commit -m $deployMessage
}

if ($LASTEXITCODE -ne 0) {
  throw "Falha ao criar commit."
}

git push $remote $branch
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao executar push para $remote/$branch."
}

Write-Host "Push concluido com sucesso. Railway deve iniciar build/deploy."
