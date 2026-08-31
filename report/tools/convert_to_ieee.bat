@echo off
python "%~dp0..\..\ieee-md2docx\ieee_md2docx.py" "%~dp0..\drafts\elera_fyp1.md"
if %errorlevel% == 0 (
    echo.
    echo Done! File saved as report\ieee\elera_fyp1_IEEE.docx
    start "" "%~dp0..\ieee\elera_fyp1_IEEE.docx"
) else (
    echo.
    echo Something went wrong. Check the output above.
    pause
)
