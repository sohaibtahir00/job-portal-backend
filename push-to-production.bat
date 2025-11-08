@echo off
echo =====================================================
echo Prisma DB Push to Production
echo =====================================================
echo.
echo IMPORTANT: This will push schema changes to your PRODUCTION database!
echo.
echo Please paste your Railway DATABASE_URL below:
echo (Format: postgresql://user:pass@host:port/dbname)
echo.
set /p DATABASE_URL="DATABASE_URL: "
echo.
echo Pushing schema to production database...
echo.

set DATABASE_URL=%DATABASE_URL%
npx prisma db push

echo.
echo =====================================================
echo Done! Check above for any errors.
echo =====================================================
pause
