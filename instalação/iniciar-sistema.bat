@echo off
title Iniciar AcolherFlow
echo ==========================================
echo      Iniciando o sistema AcolherFlow
echo ==========================================
echo.

echo Iniciando o backend...
cd /d "C:\projeto\machado-careflow\institutoback"
start cmd /k "npm start"
echo Backend iniciado.
echo.

echo Iniciando o frontend...
cd /d "C:\projeto\machado-careflow"
start cmd /k "npm run dev"
echo Frontend iniciado.
echo.

echo ==========================================
echo        Sistema iniciado com sucesso!
echo ==========================================
pause
