@echo off
call "C:\Program Files\Microsoft Visual Studio\18\Insiders\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
cd /d "C:\Users\LOQ\Documents\GitHub\NexTerm"
npx electron-rebuild
