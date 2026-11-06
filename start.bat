@echo off
title CDIERS - Chennai Disaster Command Center
echo ==== CDIERS first-time setup / start ====
if not exist node_modules call npm install
if not exist server\node_modules call npm --prefix server install
if not exist client\node_modules call npm --prefix client install
echo Starting backend (http://localhost:5000) and frontend (http://localhost:5173) ...
call npm run dev
pause
