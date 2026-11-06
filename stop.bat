@echo off
echo Stopping all old Node.js processes (old CDIERS servers)...
taskkill /F /IM node.exe
echo Done. Now run start.bat
pause
